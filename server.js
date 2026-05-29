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

app.get('/health',(req,res)=>res.json({ok:true,service:'VYRO PRO MAX TERMINAL V16.5 ALL IN ONE INSTITUTIONAL STABLE',time:new Date().toISOString()}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'VYRO PRO MAX TERMINAL V16.5 ALL IN ONE INSTITUTIONAL STABLE',time:new Date().toISOString(),streamClients:streamClients.length,legacyClients:legacyClients.length}));
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

app.get('/api/normalized',(req,res)=>{
  res.set('Cache-Control','no-store');
  res.json(buildNormalizedStreamPacket(latestSignalMemory));
});

app.get('/api/debug/latest',(req,res)=>{
  res.set('Cache-Control','no-store');
  res.json({ok:true, latest:latestSignalMemory, candles:candleHistory.slice(-20), streamClients:streamClients.length, version:'V16.3'});
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



// ===== V15.8 SMOOTH ENGINE: raw MT5 object -> normalized JSON =====
function isBadValue(v){
  if(v===undefined || v===null) return true;
  if(Array.isArray(v)) return v.length===0 || v.every(isBadValue);
  if(typeof v==='object') return false;
  const t=String(v).trim().toLowerCase();
  return !t || ['0','0.0','0.00','0/0','false','null','undefined','nan','n/a','--','waiting_for_mt5'].includes(t);
}
function cleanText(v, fb='WAITING'){
  if(v===undefined || v===null) return fb;
  if(Array.isArray(v)){
    const found=v.find(x=>!isBadValue(x));
    return found===undefined ? fb : cleanText(found, fb);
  }
  if(typeof v==='object') return cleanText(v.text || v.value || v.price || v.name || v.label || '', fb);
  const t=String(v).trim();
  return isBadValue(t) ? fb : t;
}
function numberFromAny(v){
  if(v===undefined || v===null) return null;
  if(typeof v==='object') v=v.price || v.value || v.text || v.name || '';
  const m=String(v).match(/-?[0-9]{3,6}(?:\.[0-9]+)?/);
  const n=m ? Number(m[0]) : Number(v);
  return Number.isFinite(n) && Math.abs(n)>0 ? n : null;
}
function parseObjectList(raw){
  const out=[];
  const push=(o={})=>{
    const name=cleanText(o.name||o.object||o.id,'');
    const text=cleanText(o.text||o.label||o.value,'');
    const price=numberFromAny(o.price||o.p||o.y||o.level||text||name);
    const blob=(name+' '+text).trim();
    if(blob || price) out.push({name,text,price,raw:blob});
  };
  if(Array.isArray(raw.objects)) raw.objects.forEach(push);
  if(Array.isArray(raw.chartObjects)) raw.chartObjects.forEach(push);
  if(Array.isArray(raw.smcObjects)) raw.smcObjects.forEach(push);
  const strings=[];
  ['debug_all_objects','debug_sell_object','debug_buy_object','debug_tp_object','debug_entry_object','debug_sl_object','bosText','chochText','liquidityText','stopHuntText','fvgText'].forEach(k=>{
    if(!isBadValue(raw[k])) strings.push(String(raw[k]));
  });
  for(const joined of strings){
    joined.split(/\s*\|\|\s*/).forEach(part=>{
      if(!part.trim()) return;
      const at=part.match(/@\s*([0-9]{3,6}(?:\.[0-9]+)?)/);
      const eq=part.match(/(?:=|:)\s*([^@|]+?)\s*(?:@|$)/);
      const before=part.split('@')[0].trim();
      const pieces=before.split('|').map(x=>x.trim()).filter(Boolean);
      push({name:pieces[0]||before,text:pieces.slice(1).join(' ') || (eq?eq[1]:''),price:at?at[1]:undefined});
    });
  }
  return out;
}
function classifySMCObject(o){
  const b=(String(o.name||'')+' '+String(o.text||'')+' '+String(o.raw||'')).toUpperCase().replace(/_/g,' ');
  if(/TP\s*1|TAKE PROFIT\s*1/.test(b)) return 'TP1';
  if(/TP\s*2|TAKE PROFIT\s*2/.test(b)) return 'TP2';
  if(/TP\s*3|TAKE PROFIT\s*3/.test(b)) return 'TP3';
  if(/NO\s*TRADE|MID\s*RANGE|CHOP/.test(b)) return 'NO_TRADE';
  if(/STOP\s*HUNT|STOPHUNT/.test(b)) return 'STOP_HUNT';
  if(/CHOCH|CHANGE\s+OF\s+CHARACTER/.test(b)) return 'CHOCH';
  if(/\bBOS\b|BREAK\s+OF\s+STRUCTURE/.test(b)) return 'BOS';
  if(/FVG|FAIR\s+VALUE\s+GAP|IMBALANCE/.test(b)) return 'FVG';
  if(/\bSSL\b|SELL\s+SIDE\s+LIQUIDITY/.test(b)) return 'SSL';
  if(/\bBSL\b|BUY\s+SIDE\s+LIQUIDITY/.test(b)) return 'BSL';
  if(/SUPPLY|SELL\s*ZONE|SELL\s*AREA|BEARISH\s*OB|ORDER\s*BLOCK\s*SELL|SELL\s*OB/.test(b) && !/TP|TAKE\s*PROFIT|STOP\s*LOSS|\bSL\b|ENTRY|NO\s*TRADE/.test(b)) return 'SUPPLY';
  if(/DEMAND|BUY\s*ZONE|BUY\s*AREA|BULLISH\s*OB|ORDER\s*BLOCK\s*BUY|BUY\s*OB/.test(b) && !/TP|TAKE\s*PROFIT|STOP\s*LOSS|\bSL\b|ENTRY|NO\s*TRADE/.test(b)) return 'DEMAND';
  if(/ORDER\s*BLOCK|\bOB\b/.test(b)) return 'OB';
  return '';
}
function normalizeSMCFinal(signal, raw){
  const objects=parseObjectList(raw||{}).map(o=>({...o,category:classifySMCObject(o)}));
  const price=numberFromAny(signal.price||signal.bid||raw.bid||raw.price) || 0;
  const nearest=(cat)=>{
    const arr=objects.filter(o=>o.category===cat && numberFromAny(o.price));
    if(!arr.length) return null;
    arr.sort((a,b)=>Math.abs(numberFromAny(a.price)-price)-Math.abs(numberFromAny(b.price)-price));
    return arr[0];
  };
  const bycat=(cat)=>objects.find(o=>o.category===cat);
  const supply=nearest('SUPPLY'), demand=nearest('DEMAND');
  const tp1=bycat('TP1'), tp2=bycat('TP2'), tp3=bycat('TP3');
  const ssl=bycat('SSL'), bsl=bycat('BSL');
  const bos=bycat('BOS'), choch=bycat('CHOCH');
  const fvg=bycat('FVG'), ob=bycat('OB'), stop=bycat('STOP_HUNT');

  const sellZone=numberFromAny(raw.sellZone||raw.supply||raw.supplyZone||raw.smc_supply) || numberFromAny(supply?.price);
  const buyZone=numberFromAny(raw.buyZone||raw.demand||raw.demandZone||raw.smc_demand) || numberFromAny(demand?.price);
  const liquidity = cleanText(raw.liquidity || raw.liquidityText || raw.liq, '') || (ssl?'SSL BELOW / SELL SIDE LIQUIDITY':(bsl?'BSL ABOVE / BUY SIDE LIQUIDITY':'WAITING'));
  const stopHunt = cleanText(raw.stopHuntText || raw.stop_hunt_text, '') || ((raw.stopHunt===true || stop)?'ARMED':'WAITING');
  const bosChoch = cleanText(raw.bosChoch || raw.bos_choch || raw.structureSignal, '') || (choch?'CHOCH':(bos?'BOS':'WAITING'));
  const fvgText = cleanText(raw.fvgText || raw.fvgZone || raw.fvg_zone, '') || (fvg ? (fvg.text||fvg.name||'FVG DETECTED') : 'WAITING');
  const obText = cleanText(raw.ob || raw.obZone || raw.orderBlock, '') || (ob ? (ob.text||ob.name||'OB ZONE') : 'WAITING');
  const tp1v = numberFromAny(raw.tp1 || raw.TP1) || numberFromAny(tp1?.price);
  const tp2v = numberFromAny(raw.tp2 || raw.TP2) || numberFromAny(tp2?.price);
  const tp3v = numberFromAny(raw.tp3 || raw.TP3) || numberFromAny(tp3?.price);

  signal.objects=objects.slice(0,120);
  signal.smc={
    structure: cleanText(signal.trend||raw.trend,'WAITING'),
    bosChoch, liquidity, stopHunt, fvg:fvgText, ob:obText,
    sellZone: sellZone || 'WAITING', buyZone: buyZone || 'WAITING',
    tp1: tp1v || 'WAITING', tp2: tp2v || 'WAITING', tp3: tp3v || 'WAITING',
    supplyObject: supply || null, demandObject: demand || null,
    liquidityObject: ssl || bsl || null, bosObject: bos || null, chochObject: choch || null, fvgObject: fvg || null
  };
  if(sellZone){ signal.sellZone=sellZone; signal.supply=sellZone; signal.supplyZone=sellZone; }
  if(buyZone){ signal.buyZone=buyZone; signal.demand=buyZone; signal.demandZone=buyZone; }
  if(tp1v) signal.tp1=tp1v; if(tp2v) signal.tp2=tp2v; if(tp3v) signal.tp3=tp3v;
  signal.liquidity=liquidity; signal.stopHunt=stopHunt; signal.bosChoch=bosChoch; signal.fvg=fvgText; signal.ob=obText;
  signal.smcObjectCount=objects.length;
  signal.smcRealtime = objects.length>0 || !!sellZone || !!buyZone || liquidity!=='WAITING' || bosChoch!=='WAITING';
  return signal;
}


// ===== V16.2 AI TP/SL + NORMALIZED SMC JSON ENGINE =====
function finiteNum(v){
  if(v===undefined || v===null) return null;
  if(typeof v==='object') v=v.price || v.value || v.text || v.name || '';
  const m=String(v).match(/-?[0-9]{3,6}(?:\.[0-9]+)?/);
  const n=m ? Number(m[0]) : Number(v);
  return Number.isFinite(n) ? n : null;
}
function roundPrice(n){ return Number.isFinite(n) ? Number(n.toFixed(2)) : null; }
function directionOf(signal){
  const raw=String(signal.signal||signal.status||signal.action||signal.trend||'').toUpperCase();
  if(raw.includes('SELL') || raw.includes('BEAR')) return 'SELL';
  if(raw.includes('BUY') || raw.includes('BULL')) return 'BUY';
  return 'WAIT';
}
function sessionMultiplier(session){
  const s=String(session||'').toUpperCase();
  if(s.includes('NY') || s.includes('NEW YORK')) return 1.35;
  if(s.includes('LONDON')) return 1.15;
  if(s.includes('ASIA')) return 0.75;
  return 1.0;
}
function volatilityMultiplier(raw){
  const atr=finiteNum(raw.atr || raw.ATR || raw.volatilityAtr) || 0;
  const vol=String(raw.volatility||raw.riskMode||raw.risk||'').toUpperCase();
  if(vol.includes('HIGH') || atr>=3.0) return 1.35;
  if(vol.includes('LOW') || (atr>0 && atr<1.0)) return 0.75;
  return 1.0;
}
function calculateAITargets(signal, raw){
  const price=finiteNum(signal.price||signal.bid||raw.price||raw.bid);
  if(!price) return signal;
  const dir=directionOf(signal);
  const atr=finiteNum(raw.atr || raw.ATR || signal.atr) || Math.max(1.2, price*0.00035);
  const smc=signal.smc || {};
  const sellZone=finiteNum(signal.sellZone||smc.sellZone);
  const buyZone=finiteNum(signal.buyZone||smc.buyZone);
  const liveTp1=finiteNum(signal.tp1||smc.tp1), liveTp2=finiteNum(signal.tp2||smc.tp2), liveTp3=finiteNum(signal.tp3||smc.tp3);
  const mult=sessionMultiplier(signal.session||raw.session) * volatilityMultiplier(raw);
  let tp1=null,tp2=null,tp3=null,sl=null,method='WAITING';
  if(dir==='SELL'){
    tp1 = liveTp1 || (buyZone && buyZone<price ? buyZone : price - atr*1.0*mult);
    tp2 = liveTp2 || (price - atr*1.8*mult);
    tp3 = liveTp3 || (price - atr*2.7*mult);
    sl = sellZone && sellZone>price ? sellZone + atr*0.25 : price + atr*1.15;
    method='SELL: TP1 liquidity/demand, TP2 ATR extension, TP3 external liquidity, SL above supply/swing';
  } else if(dir==='BUY'){
    tp1 = liveTp1 || (sellZone && sellZone>price ? sellZone : price + atr*1.0*mult);
    tp2 = liveTp2 || (price + atr*1.8*mult);
    tp3 = liveTp3 || (price + atr*2.7*mult);
    sl = buyZone && buyZone<price ? buyZone - atr*0.25 : price - atr*1.15;
    method='BUY: TP1 liquidity/supply, TP2 ATR extension, TP3 external liquidity, SL below demand/swing';
  }
  if(dir==='WAIT'){
    signal.aiTargets={direction:'WAIT',method:'WAIT CONFIRM',tp1:'WAITING',tp2:'WAITING',tp3:'WAITING',sl:'WAITING',rr:'WAITING',atr:roundPrice(atr)};
    return signal;
  }
  const risk=Math.abs(price-sl);
  const reward=Math.abs(tp2-price);
  const rr = risk>0 ? Number((reward/risk).toFixed(2)) : null;
  signal.aiTargets={direction:dir,method,entry:roundPrice(price),tp1:roundPrice(tp1),tp2:roundPrice(tp2),tp3:roundPrice(tp3),sl:roundPrice(sl),rr:rr?`1:${rr}`:'WAITING',atr:roundPrice(atr),sessionMultiplier:roundPrice(mult)};
  // Only fill public TP/SL fields if MT5 object did not already provide them.
  if(!liveTp1) signal.tp1=roundPrice(tp1);
  if(!liveTp2) signal.tp2=roundPrice(tp2);
  if(!liveTp3) signal.tp3=roundPrice(tp3);
  if(!finiteNum(signal.sl||signal.stopLoss)) signal.sl=roundPrice(sl);
  if(!signal.smc) signal.smc={};
  signal.smc.aiTpMethod=method; signal.smc.sl=signal.sl; signal.smc.rr=signal.aiTargets.rr;
  return signal;
}
function buildNormalizedStreamPacket(signal){
  const s=signal||{};
  return {
    ok:true,
    version:'V16.3',
    timestamp:new Date().toISOString(),
    symbol:s.displaySymbol||s.symbol||'XAUUSD',
    price:s.price||s.bid||null,
    signal:s.signal||s.status||'WAIT',
    structure:s.trend||s.smc?.structure||'WAITING',
    smc:s.smc||{},
    aiTargets:s.aiTargets||{},
    flow:s.flow, delta:s.delta, rsi:s.rsi, score:s.score||s.confidence,
    flowValid:s.flowValid, deltaValid:s.deltaValid, agentConfirmed:s.agentConfirmed,
    multiConfirm:s.multiConfirm, institutional:s.institutional||{},
    stopHuntProb:s.stopHuntProb, sessionAI:s.sessionAI, killzoneAI:s.killzoneAI,
    poc:s.poc, vah:s.vah, val:s.val, auctionState:s.auctionState,
    absorptionStatus:s.absorptionStatus, trapWarning:s.trapWarning,
    riskAI:s.riskAI, lotProtection:s.lotProtection, revengeAI:s.revengeAI,
    candles:candleHistory.slice(-120)
  };
}


// ===== V16.5 ALL-IN-ONE INSTITUTIONAL STABLE ADDON =====
// Giữ nền server cũ ổn định, chỉ bổ sung dữ liệu cho dashboard nâng cấp.
function stableBool(v){ return v === true || String(v).toLowerCase() === 'true'; }
function stableNum(v){
  if(v===undefined || v===null || v==='') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g,''));
  return Number.isFinite(n) ? n : null;
}
function stableTxt(v, fb='WAITING'){
  if(v===undefined || v===null || String(v).trim()==='') return fb;
  return String(v).trim();
}
function normalizeGoldSymbol(sym){
  const raw = String(sym || '').trim();
  if(!raw) return 'XAUUSD';
  const u = raw.toUpperCase();
  if(u.includes('GOLD')) return raw;
  if(u.includes('XAU')) return raw;
  return raw;
}
function calcSessionAI(){
  const h = new Date().getUTCHours();
  // UTC mapping approximate; frontend can localize if needed
  if(h>=0 && h<7) return 'ASIA ACCUMULATION';
  if(h>=7 && h<13) return 'LONDON MANIPULATION';
  if(h>=13 && h<22) return 'NEW YORK EXPANSION';
  return 'LOW LIQUIDITY';
}
function calcKillzone(){
  const h = new Date().getUTCHours();
  if((h>=7 && h<=10) || (h>=13 && h<=16)) return 'ACTIVE';
  return 'OFF';
}
function calcStopHuntProb(d){
  let score = 0;
  const delta = Math.abs(stableNum(d.delta) || 0);
  const flow = Math.abs(stableNum(d.flow) || 0);
  const liq = String(d.liquidity || d.smc?.liquidity || '').toUpperCase();
  const stop = String(d.stopHunt || d.smc?.stopHunt || '').toUpperCase();
  if(delta > 300) score += 25;
  if(flow > 1000) score += 25;
  if(liq.includes('SSL') || liq.includes('BSL') || liq.includes('LIQUIDITY')) score += 30;
  if(stop.includes('ARMED') || stop.includes('STOP')) score += 20;
  return Math.min(100, score);
}
function calcVolumeProfile(d){
  const price = stableNum(d.price || d.bid || d.ask);
  if(!price) return {poc:'WAITING', vah:'WAITING', val:'WAITING', auctionState:'WAITING'};
  const atr = stableNum(d.atr) || Math.max(1.2, price * 0.00035);
  const delta = stableNum(d.delta) || 0;
  const flow = stableNum(d.flow) || 0;
  let auctionState = 'BALANCED';
  if(delta > 300 && flow > 1000) auctionState = 'BUYER ACCEPTANCE';
  if(delta < -300 && flow < -1000) auctionState = 'SELLER ACCEPTANCE';
  return {
    poc: Number(price.toFixed(2)),
    vah: Number((price + atr * 1.2).toFixed(2)),
    val: Number((price - atr * 1.2).toFixed(2)),
    auctionState
  };
}
function calcAbsorption(d){
  const flow = stableNum(d.flow);
  const delta = stableNum(d.delta);
  if(flow===null || delta===null) return 'NONE';
  if(flow > 1000 && delta < -150) return 'BUY ABSORPTION';
  if(flow < -1000 && delta > 150) return 'SELL ABSORPTION';
  if(Math.abs(flow) > 1500 && Math.abs(delta) < 120) return 'HIDDEN ABSORPTION';
  return 'NONE';
}
function calcTrapWarning(d){
  const delta = Math.abs(stableNum(d.delta) || 0);
  const flow = Math.abs(stableNum(d.flow) || 0);
  const structure = String(d.bosChoch || d.structure || d.smc?.bosChoch || '').toUpperCase();
  if((structure.includes('BOS') || structure.includes('CHOCH')) && delta < 120) return 'FAKE BREAKOUT';
  if(flow < 250) return 'WEAK FLOW';
  return 'CLEAR';
}
function calcRiskAI(d){
  const dd = stableNum(d.drawdown || d.dd) || 0;
  const lot = stableNum(d.lot) || 0;
  const losses = stableNum(d.losses) || 0;
  let risk = 'LOW';
  if(dd >= 3) risk = 'MEDIUM';
  if(dd >= 5) risk = 'HIGH';
  if(dd >= 8) risk = 'LOCK';
  let lotProtection = 'SAFE';
  if(lot >= 1) lotProtection = 'HIGH LOT';
  if(lot >= 3) lotProtection = 'DANGER LOT';
  let revengeAI = losses >= 3 ? 'BLOCKED' : 'OFF';
  return {riskAI:risk, lotProtection, revengeAI};
}
function calcMultiConfirm(d){
  let confirm = 0;
  const flow = stableNum(d.flow);
  const delta = stableNum(d.delta);
  const rsi = stableNum(d.rsi);
  const structure = String(d.bosChoch || d.structure || d.smc?.bosChoch || '').toUpperCase();
  const liq = String(d.liquidity || d.smc?.liquidity || '').toUpperCase();
  if(flow !== null && Math.abs(flow) > 500) confirm++;
  if(delta !== null && Math.abs(delta) > 250) confirm++;
  if(structure.includes('BOS') || structure.includes('CHOCH')) confirm++;
  if(liq.includes('SSL') || liq.includes('BSL') || liq.includes('LIQUIDITY')) confirm++;
  if(rsi !== null && (rsi >= 55 || rsi <= 45)) confirm++;
  if(d.flowValid === true && d.deltaValid === true) confirm++;
  return `${confirm}/6`;
}
function applyStableEACompat(d, raw){
  raw = raw || {};
  d = d || {};

  d.source = raw.source || d.source || 'MT5_REAL';
  d.rawSymbol = raw.symbol || d.rawSymbol || d.symbol || '';
  d.symbol = normalizeGoldSymbol(raw.displaySymbol || raw.symbol || d.symbol || 'XAUUSD');

  const flowNumber = Number.isFinite(Number(d.flow));
  const deltaNumber = Number.isFinite(Number(d.delta));
  d.flowValid = stableBool(raw.flowValid) || stableBool(raw.flow_valid) || flowNumber;
  d.deltaValid = stableBool(raw.deltaValid) || stableBool(raw.delta_valid) || deltaNumber;
  d.agentConfirmed = stableBool(raw.agentConfirmed) || stableBool(raw.agent_confirmed);

  // Nếu chưa có agentConfirmed thì hạ BUY NOW/SELL NOW về bias, không reject dữ liệu.
  const sig = String(d.signal || '').toUpperCase();
  if(!d.agentConfirmed && (sig === 'BUY NOW' || sig === 'SELL NOW')){
    d.status = 'WAIT CONFIRM';
    d.signal = sig.includes('BUY') ? 'BUY BIAS' : 'SELL BIAS';
  }

  d.sessionAI = calcSessionAI();
  d.killzoneAI = calcKillzone();

  const vp = calcVolumeProfile(d);
  d.volumeProfile = vp;
  d.poc = vp.poc; d.vah = vp.vah; d.val = vp.val; d.auctionState = vp.auctionState;

  d.stopHuntProb = calcStopHuntProb(d);
  d.absorptionStatus = calcAbsorption(d);
  d.trapWarning = calcTrapWarning(d);

  const risk = calcRiskAI(d);
  d.riskAI = risk.riskAI;
  d.lotProtection = risk.lotProtection;
  d.revengeAI = risk.revengeAI;

  d.multiConfirm = calcMultiConfirm(d);

  d.institutional = {
    version:'V16.5',
    flowValid:d.flowValid,
    deltaValid:d.deltaValid,
    agentConfirmed:d.agentConfirmed,
    multiConfirm:d.multiConfirm,
    stopHuntProb:d.stopHuntProb,
    sessionAI:d.sessionAI,
    killzoneAI:d.killzoneAI,
    volumeProfile:d.volumeProfile,
    absorptionStatus:d.absorptionStatus,
    trapWarning:d.trapWarning,
    riskAI:d.riskAI,
    lotProtection:d.lotProtection,
    revengeAI:d.revengeAI
  };

  return d;
}

function receiveSignal(req,res){
  const raw=req.body||{};
  let d=normalizeSignal(raw);
  d=normalizeSMCFinal(d, raw);
  d=calculateAITargets(d, raw);
  d=applyStableEACompat(d, raw);
  saveSignal(d);
  res.set('Cache-Control','no-store');
  res.json({ok:true,received:d,normalized:buildNormalizedStreamPacket(d),realtime:true,demo:false,realtimeClients:streamClients.length+legacyClients.length});
}
app.post('/api/signal', receiveSignal);
app.post('/api/mt5/signal', receiveSignal);
app.post('/api/push', receiveSignal);
app.post('/webhook', receiveSignal);
app.get('/api/reset-signal',(req,res)=>{
  const d=normalizeSignal({symbol:'XAUUSD',signal:'WAIT',source:'WAITING_FOR_MT5',realtime:false,price:null,score:55});
  d.received=false; d.realtime=false; d.demo=false; d.source='WAITING_FOR_MT5';
  saveSignal(d); res.json({ok:true,reset:true,latest:d});
});

app.post('/api/test-signal',(req,res)=>{
  return res.status(403).json({ok:false,error:'TEST_SIGNAL_DISABLED_IN_STABLE_BUILD'});
});

app.use((req,res,next)=>{res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.set('Pragma','no-cache');res.set('Expires','0');next();});
app.use(express.static(__dirname,{etag:false,maxAge:0,setHeaders:(res)=>{res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');}}));
app.use((req,res)=>res.sendFile(path.join(__dirname,'index.html')));

app.listen(PORT,()=>console.log('VYRO PRO MAX TERMINAL V16.5 ALL IN ONE INSTITUTIONAL STABLE running on '+PORT));
