const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));

const DB_DIR = path.join(__dirname, 'db');
const USERS_FILE = path.join(DB_DIR, 'users.json');
const SIGNAL_FILE = path.join(DB_DIR, 'latest-signal.json');
const HISTORY_FILE = path.join(DB_DIR, 'signal-history.json');

const defaultUsers = [
  {username:'admin',password:'2606',name:'Master Admin',plan:'vip',status:'active',expire:'2099-12-31',admin:true,role:'admin',email:'',createdAt:'2026-05-28T00:00:00.000Z'},
  {username:'vip001',password:'123456',name:'VIP Client',plan:'pro',status:'active',expire:'2099-12-31',admin:false,role:'vip',email:'',createdAt:'2026-05-28T00:00:00.000Z'}
];

let latestSignalMemory = null;
let streamClients = [];
let legacyClients = [];
let candleHistory = [];
function numericPrice(v){ const n=Number(String(v===undefined||v===null?'':v).replace(/[^0-9.\-]/g,'')); return Number.isFinite(n)&&n>0?n:null; }
function updateCandleHistory(signal){
  const price = numericPrice(signal.price || signal.bid || signal.ask);
  if(!price) return;
  const tf = 60;
  const bucket = Math.floor(Date.now()/1000/tf)*tf;
  let last = candleHistory[candleHistory.length-1];
  if(last && last.time===bucket){ last.close=price; last.high=Math.max(last.high,price); last.low=Math.min(last.low,price); last.updatedAt=new Date().toISOString(); }
  else { const open = last?last.close:price; candleHistory.push({time:bucket, open, high:Math.max(open,price), low:Math.min(open,price), close:price, updatedAt:new Date().toISOString()}); if(candleHistory.length>500) candleHistory=candleHistory.slice(-500); }
}

function readJson(file, fallback){ try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e){ return fallback; } }
function writeJson(file, data){ fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function num(v, fallback=null){ if(v===undefined||v===null||v==='') return fallback; const n=Number(v); return Number.isFinite(n)?n:fallback; }
function safeUser(u){ const x={...u}; delete x.password; return x; }

function ensureDb(){
  if(!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR,{recursive:true});
  let users = fs.existsSync(USERS_FILE) ? readJson(USERS_FILE, defaultUsers) : defaultUsers;
  if(!Array.isArray(users)) users = defaultUsers;
  users = users.map(u=>{
    if(u.username==='admin') return {...defaultUsers[0],...u,password:u.password||'2606',admin:true,role:'admin',status:u.status||'active'};
    if(u.username==='vip001') return {...defaultUsers[1],...u,password:u.password||'123456',admin:false,role:'vip',status:u.status||'active'};
    return u;
  });
  if(!users.find(u=>u.username==='admin')) users.unshift(defaultUsers[0]);
  if(!users.find(u=>u.username==='vip001')) users.push(defaultUsers[1]);
  writeJson(USERS_FILE, users);
  if(!fs.existsSync(SIGNAL_FILE)) writeJson(SIGNAL_FILE,{ok:true,received:false,realtime:false,demo:false,symbol:'XAUUSD.G',signal:'WAIT',status:'WAIT',buySell:'--',conf:55,confidence:55,score:55,source:'WAITING_FOR_MT5',updatedAt:new Date().toISOString()});
  if(!fs.existsSync(HISTORY_FILE)) writeJson(HISTORY_FILE, []);
  latestSignalMemory = readJson(SIGNAL_FILE, {});
}

function normalizeSignal(b){
  b = b || {};
  // Accept EA object arrays: [{name,text,price,type}] and normalize to strong fields.
  const objs = Array.isArray(b.objects)?b.objects:(Array.isArray(b.chartObjects)?b.chartObjects:[]);
  for(const o of objs){
    const name=String(o.name||o.object||''); const text=String(o.text||o.label||o.value||''); const price=o.price||o.p||o.y||'';
    const u=(name+' '+text).toUpperCase();
    if((/SUPPLY|SELL_ZONE|SELL AREA/.test(u)) && price && !b.sellZone) b.sellZone=price;
    if((/DEMAND|BUY_ZONE|BUY AREA/.test(u)) && price && !b.buyZone) b.buyZone=price;
    if(/TP1/.test(u) && price && !b.tp1) b.tp1=price;
    if(/TP2/.test(u) && price && !b.tp2) b.tp2=price;
    if(/TP3/.test(u) && price && !b.tp3) b.tp3=price;
    if(/SSL|SELL SIDE LIQUIDITY/.test(u) && !b.liquidity) b.liquidity='SSL BELOW / SELL SIDE LIQUIDITY';
    if(/BSL|BUY SIDE LIQUIDITY/.test(u) && !b.liquidity) b.liquidity='BSL ABOVE / BUY SIDE LIQUIDITY';
    if(/STOPHUNT|STOP HUNT|ARMED/.test(u) && !b.stopHunt) b.stopHunt='ARMED';
    if(/FVG/.test(u) && !b.fvg) b.fvg=text||'FVG DETECTED';
    if(/OB|ORDER BLOCK/.test(u) && !b.ob) b.ob=text||'OB ZONE';
  }
  const allStrings = [];
  function walk(v){
    if(v===undefined || v===null) return;
    if(typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') allStrings.push(String(v));
    else if(Array.isArray(v)) v.forEach(walk);
    else if(typeof v === 'object') Object.values(v).forEach(walk);
  }
  walk(b);
  const blob = allStrings.join(' | ');
  const blobU = blob.toUpperCase();
  function valid(v){
    if(v===undefined || v===null) return false;
    const t=String(v).trim();
    return !(t==='' || t==='0' || t==='0.0' || t==='0.00' || t.toLowerCase()==='null' || t.toLowerCase()==='undefined' || t.toLowerCase()==='false' || t.toLowerCase()==='n/a' || t.toUpperCase()==='N/A');
  }
  function first(...keys){
    for(const k of keys){
      if(valid(b[k])) return b[k];
    }
    return null;
  }
  function n(v){ const x=Number(String(v).replace(/[^0-9.\-]/g,'')); return Number.isFinite(x)?x:null; }
  function priceFromText(re){
    const m = blob.match(re);
    if(!m) return null;
    for(let i=1;i<m.length;i++){ const x=n(m[i]); if(x && x>100) return x; }
    return null;
  }
  function textMatch(re, fallback=''){
    const m=blob.match(re); return m ? m[0].replace(/^[^A-Z0-9]*(DUONG AI OBJECT:)?/i,'').trim() : fallback;
  }
  function pickLiquidity(){
    const direct=first('liquidity','liquidityText','liq','ssl','bsl','liquidity_sweep','debug_liquidity_object');
    if(valid(direct) && String(direct).toLowerCase()!=='false') return direct;
    if(/SSL\s+BELOW|SELL\s+SIDE\s+LIQUIDITY/i.test(blob)) return 'SSL BELOW / SELL SIDE LIQUIDITY';
    if(/BSL\s+ABOVE|BUY\s+SIDE\s+LIQUIDITY/i.test(blob)) return 'BSL ABOVE / BUY SIDE LIQUIDITY';
    if(/LIQUIDITY\s+SWEEP/i.test(blob)) return 'LIQUIDITY SWEEP';
    if(/\bSSL\b/i.test(blob)) return 'SSL';
    if(/\bBSL\b/i.test(blob)) return 'BSL';
    return 'WAITING';
  }
  function pickBoolText(key, trueText, waiting='WAITING'){
    const v=first(key, key.toUpperCase(), key.replace(/[A-Z]/g,m=>'_'+m).toLowerCase());
    if(String(v).toLowerCase()==='true') return trueText;
    if(valid(v) && String(v).toLowerCase()!=='false') return String(v);
    return waiting;
  }
  // Strong object text extraction from EA debug fields and full raw blob.
  let sellZone = first('sellZone','sell_zone','supply','supplyZone','smcSellZone','smc_supply','supply_line','supplyLine','debug_sell_object')
              || priceFromText(/(?:SUPPLY|SELL\s*ZONE|SELL\s*AREA)[^0-9]{0,45}([0-9]{3,5}(?:\.[0-9]+)?)/i);
  let buyZone  = first('buyZone','buy_zone','demand','demandZone','smcBuyZone','smc_demand','demand_line','demandLine','debug_buy_object')
              || priceFromText(/(?:DEMAND|BUY\s*ZONE|BUY\s*AREA)[^0-9]{0,45}([0-9]{3,5}(?:\.[0-9]+)?)/i);
  let tp1 = first('tp1','TP1','takeProfit1','take_profit_1') || priceFromText(/\bTP1\b[^0-9]{0,45}([0-9]{3,5}(?:\.[0-9]+)?)/i);
  let tp2 = first('tp2','TP2','takeProfit2','take_profit_2') || priceFromText(/\bTP2\b[^0-9]{0,45}([0-9]{3,5}(?:\.[0-9]+)?)/i);
  let tp3 = first('tp3','TP3','takeProfit3','take_profit_3') || priceFromText(/\bTP3\b[^0-9]{0,45}([0-9]{3,5}(?:\.[0-9]+)?)/i);
  let noTrade = first('noTrade','no_trade','noTradeZone');
  const ntLow = n(first('noTradeLow','no_trade_low'));
  const ntHigh = n(first('noTradeHigh','no_trade_high'));
  if(!valid(noTrade) && ntLow && ntHigh) noTrade = `${Math.min(ntLow,ntHigh)} - ${Math.max(ntLow,ntHigh)}`;
  if(!valid(noTrade)) noTrade = textMatch(/NO\s*TRADE[^|]{0,60}/i, 'WAITING');
  let ratio = first('buySell','buy_sell','ratio','BUY/SELL','buy_sell_ratio');
  if(!ratio && valid(b.buySellRatio)) ratio = String(b.buySellRatio).includes('/') ? b.buySellRatio : (Number(b.buySellRatio)>=5 ? `${Number(b.buySellRatio).toFixed(1)}/0.6` : `0.6/${Math.max(0,10-Number(b.buySellRatio)).toFixed(1)}`);
  if(!ratio){ const m=blob.match(/BUY\s*\/\s*SELL[^0-9]{0,20}([0-9.]+\s*\/\s*[0-9.]+)/i); ratio=m?m[1]:'--'; }
  const signal = first('signal','Signal','status','Status') || (/SELL\s+READY|SELL\s+NOW/i.test(blob)?'SELL':/BUY\s+READY|BUY\s+NOW/i.test(blob)?'BUY':'WAIT');
  const trend = first('trend','Trend','TREND','trendAI') || (/BEARISH/i.test(blobU)?'BEARISH':/BULLISH/i.test(blobU)?'BULLISH':'WAITING');
  const pressure = first('pressure','Pressure','PRESSURE') || textMatch(/(SELL|BUY)\s+PRESSURE\s+STRONG/i, 'WAITING');
  const bosDetected = String(b.bos).toLowerCase()==='true' || /\bBOS\b|BREAK\s+OF\s+STRUCTURE/i.test(blob);
  const chochDetected = String(b.choch).toLowerCase()==='true' || /\bCHOCH\b|CHANGE\s+OF\s+CHARACTER/i.test(blob);
  const bosChoch = first('bosChoch','bos_choch','BOS_CHOCH','structureSignal') || (chochDetected?'CHOCH':(bosDetected?'BOS':'WAITING'));
  const stopHunt = first('stopHunt','stophunt','stop_hunt') || (/STOP\s*HUNT[^|]{0,60}ARMED|STOPHUNT[^|]{0,60}ARMED|\bARMED\b/i.test(blob)?'ARMED':'WAITING');
  const fvg = String(b.fvg).toLowerCase()==='true' ? (textMatch(/(BULLISH|BEARISH)?\s*FVG[^|]{0,60}/i,'FVG DETECTED')) : (first('fvg','fvgZone','fvg_zone') || (/(BULLISH|BEARISH)?\s*FVG/i.test(blob)?textMatch(/(BULLISH|BEARISH)?\s*FVG[^|]{0,60}/i):'WAITING'));
  const ob = first('ob','obZone','orderBlock','order_block') || (/(BULLISH|BEARISH)?\s*OB\s*ZONE/i.test(blob)?textMatch(/(BULLISH|BEARISH)?\s*OB\s*ZONE[^|]{0,60}/i):'WAITING');
  const conf = n(first('conf','confidence','score','CONF')) || (String(signal).includes('NO')?55:85);
  return {
    ok:true, received:true, realtime:true, demo:false,
    symbol:b.displaySymbol || b.symbol || b.Symbol || 'XAUUSD.G',
    rawSymbol:b.symbol || b.Symbol || '',
    signal, status:first('status','Status') || signal,
    setup:b.setup || '', price:n(first('price','bid','Bid','ask','Ask')),
    timeframe:b.timeframe || b.tf || b.TF || 'M1',
    rsi:n(first('rsi','RSI')), ema:n(first('ema','EMA')), atr:n(first('atr','ATR')),
    flow:n(first('flow','FLOW','cvd')), delta:n(first('delta','DELTA','powerDelta')), power:n(first('power','POWER','diff')),
    buySell:String(ratio).replace(/\s+/g,''), buySellRatio:b.buySellRatio,
    conf, confidence:conf, score:conf,
    trend, pressure, liquidity:pickLiquidity(),
    risk:first('risk','riskMode','risk_mode') || 'Medium',
    action:first('action','Action','ACTION') || textMatch(/(WAIT\s+CONFIRM|SELL\s+READY|BUY\s+READY|NO\s+TRADE|FOLLOW\s+SETUP)/i,'Follow setup'),
    session:first('session','Session','SESSION') || 'London/NY',
    supply:sellZone || null, demand:buyZone || null, sellZone:sellZone || null, buyZone:buyZone || null,
    source:b.source || b.ea || 'DUONG_AI_EA_BRIDGE_V8.6_FULL_REALTIME',
    reason:b.reason || '', bos:bosDetected, choch:chochDetected, bosChoch,
    stopHunt, fakeBreakout:String(b.fakeBreakout).toLowerCase()==='true'?'DETECTED':'WAITING',
    fvg, ob, tp1:tp1 || null, tp2:tp2 || null, tp3:tp3 || null,
    mitigation:first('mitigation','mitigationStatus') || 'PARTIAL', confluence:first('confluence','confluenceLevel') || 'HIGH',
    trendStrength:first('trendStrength','trend_strength') || (conf>=80?'STRONG':'MEDIUM'),
    noTrade:noTrade || 'WAITING', heartbeat:Date.now(), raw:b, updatedAt:new Date().toISOString()
  };
}
function broadcast(signal){
  const streamPayload = `event: signal\ndata: ${JSON.stringify(signal)}\n\n`;
  streamClients = streamClients.filter(res=>{ try{res.write(streamPayload); return true;}catch(e){return false;} });
  const legacyPayload = `data: ${JSON.stringify({type:'signal', payload:signal})}\n\n`;
  legacyClients = legacyClients.filter(res=>{ try{res.write(legacyPayload); return true;}catch(e){return false;} });
}

function saveSignal(signal){
  latestSignalMemory = signal;
  updateCandleHistory(signal);
  writeJson(SIGNAL_FILE, signal);
  const hist = readJson(HISTORY_FILE, []);
  hist.push(signal);
  writeJson(HISTORY_FILE, hist.slice(-500));
  broadcast(signal);
}

ensureDb();

app.get('/health',(req,res)=>res.json({ok:true,service:'VYRO PRO MAX TERMINAL V15.6 FINAL PRODUCTION REALTIME TRADING ENGINE',time:new Date().toISOString()}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'VYRO PRO MAX TERMINAL V15.6 FINAL PRODUCTION REALTIME TRADING ENGINE',time:new Date().toISOString(),streamClients:streamClients.length,legacyClients:legacyClients.length}));
app.get('/api/test-login',(req,res)=>res.json({ok:true,admin:'admin / 2606',vip:'vip001 / 123456'}));

app.post('/api/login',(req,res)=>{
  const b=req.body||{};
  const username=String(b.username||b.user||b.account||'').trim().toLowerCase();
  const password=String(b.password||b.pass||b.pwd||'').trim();
  const user=readJson(USERS_FILE,[]).find(u=>String(u.username).trim().toLowerCase()===username && String(u.password||'').trim()===password && String(u.status||'active').toLowerCase()==='active');
  if(!user) return res.status(401).json({ok:false,success:false,message:'Sai tài khoản hoặc mật khẩu'});
  res.json({ok:true,success:true,user:safeUser(user),token:'vyro-'+Date.now()});
});

app.get('/api/users',(req,res)=>{
  res.set('Cache-Control','no-store');
  res.json({ok:true,users:readJson(USERS_FILE,[]).map(safeUser)});
});

app.get('/api/latest-signal',(req,res)=>{
  res.set('Cache-Control','no-store');
  res.json(latestSignalMemory || readJson(SIGNAL_FILE, {}));
});

app.get('/api/signal-history',(req,res)=>{
  res.set('Cache-Control','no-store');
  res.json({ok:true,history:readJson(HISTORY_FILE,[]).slice(-100).reverse()});
});

app.get('/api/candles',(req,res)=>{
  res.set('Cache-Control','no-store');
  res.json({ok:true, timeframe:'M1', candles:candleHistory.slice(-300), latest:latestSignalMemory});
});

app.get('/api/debug/latest',(req,res)=>{
  res.set('Cache-Control','no-store');
  res.json({ok:true, latest:latestSignalMemory, candles:candleHistory.slice(-20), streamClients:streamClients.length, version:'V15.6'});
});

app.get('/api/stream',(req,res)=>{
  res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
  res.write(`event: connected\ndata: ${JSON.stringify({ok:true,time:new Date().toISOString()})}\n\n`);
  if(latestSignalMemory) res.write(`event: signal\ndata: ${JSON.stringify(latestSignalMemory)}\n\n`);
  streamClients.push(res);
  req.on('close',()=>{streamClients=streamClients.filter(c=>c!==res);});
});

// compatibility for old script
app.get('/events',(req,res)=>{
  res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
  if(latestSignalMemory) res.write(`data: ${JSON.stringify({type:'signal',payload:latestSignalMemory})}\n\n`);
  legacyClients.push(res);
  req.on('close',()=>{legacyClients=legacyClients.filter(c=>c!==res);});
});

setInterval(()=>{
  const ping=`event: ping\ndata: ${JSON.stringify({time:new Date().toISOString()})}\n\n`;
  streamClients=streamClients.filter(res=>{try{res.write(ping);return true;}catch(e){return false;}});
  legacyClients=legacyClients.filter(res=>{try{res.write(`data: ${JSON.stringify({type:'ping',time:new Date().toISOString()})}\n\n`);return true;}catch(e){return false;}});
},15000);

function receiveSignal(req,res){
  const d=normalizeSignal(req.body||{});
  saveSignal(d);
  res.set('Cache-Control','no-store');
  res.json({ok:true,received:d,realtime:true,demo:false,realtimeClients:streamClients.length+legacyClients.length});
}
app.post('/api/signal', receiveSignal);
app.post('/api/mt5/signal', receiveSignal);
app.post('/api/push', receiveSignal);
app.post('/webhook', receiveSignal);
app.get('/api/reset-signal',(req,res)=>{
  const d=normalizeSignal({symbol:'XAUUSD.G',signal:'WAIT',source:'WAITING_FOR_MT5',realtime:false,price:null,score:55});
  d.received=false; d.realtime=false; d.demo=false; d.source='WAITING_FOR_MT5';
  saveSignal(d); res.json({ok:true,reset:true,latest:d});
});

app.post('/api/test-signal',(req,res)=>{
  const d=normalizeSignal({symbol:'XAUUSD.G',signal:'SELL',status:'SELL',price:4388.96,timeframe:'M1',rsi:43.7,flow:-239,delta:-720,power:1133.3,buySell:'0.0/10.0',conf:90,confidence:90,score:90,trend:'Bearish',pressure:'Seller dominant',liquidity:'Mid-range / waiting',risk:'Medium',action:'WAIT CONFIRM',sellZone:'4739.43',buyZone:'4690.00',supply:'4739.43',demand:'4690.00',source:'VYRO_TEST_REALTIME',reason:'Realtime test'});
  saveSignal(d);
  res.json({ok:true,received:d,realtimeClients:streamClients.length+legacyClients.length});
});

app.use((req,res,next)=>{res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.set('Pragma','no-cache');res.set('Expires','0');next();});
app.use(express.static(__dirname,{etag:false,maxAge:0,setHeaders:(res)=>{res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');}}));
app.use((req,res)=>res.sendFile(path.join(__dirname,'index.html')));

app.listen(PORT,()=>console.log('VYRO PRO MAX TERMINAL V15.6 FINAL PRODUCTION REALTIME TRADING ENGINE running on '+PORT));
