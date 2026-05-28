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
  if(!fs.existsSync(SIGNAL_FILE)) writeJson(SIGNAL_FILE,{ok:true,received:true,symbol:'XAUUSD.G',signal:'WAIT',status:'WAIT',buySell:'0/0',conf:55,confidence:55,score:55,updatedAt:new Date().toISOString()});
  if(!fs.existsSync(HISTORY_FILE)) writeJson(HISTORY_FILE, []);
  latestSignalMemory = readJson(SIGNAL_FILE, {});
}

function normalizeSignal(b){
  return {
    ok:true, received:true,
    symbol:b.symbol || b.Symbol || 'XAUUSD.G',
    signal:b.signal || b.Signal || b.status || b.Status || 'WAIT',
    status:b.status || b.Status || b.signal || b.Signal || 'WAIT',
    setup:b.setup || '',
    price:num(b.price),
    timeframe:b.timeframe || b.tf || 'M1',
    rsi:num(b.rsi ?? b.RSI),
    ema:num(b.ema ?? b.EMA),
    atr:num(b.atr ?? b.ATR),
    flow:num(b.flow ?? b.FLOW),
    delta:num(b.delta ?? b.DELTA),
    power:num(b.power ?? b.POWER),
    buySell:b.buySell || b.buy_sell || b.ratio || b['BUY/SELL'] || '0/0',
    conf:num(b.conf ?? b.confidence ?? b.score, 55),
    confidence:num(b.confidence ?? b.conf ?? b.score, 55),
    score:num(b.score ?? b.confidence ?? b.conf, 55),
    trend:b.trend || '',
    pressure:b.pressure || '',
    liquidity:b.liquidity || '',
    risk:b.risk || '',
    action:b.action || '',
    supply:b.supply || b.sellZone || b.sell_zone || b.supplyZone || b.smcSellZone || null,
    demand:b.demand || b.buyZone || b.buy_zone || b.demandZone || b.smcBuyZone || null,
    sellZone:b.sellZone || b.sell_zone || b.supply || b.supplyZone || b.smcSellZone || null,
    buyZone:b.buyZone || b.buy_zone || b.demand || b.demandZone || b.smcBuyZone || null,
    source:b.source || '',
    reason:b.reason || '',
    bos:b.bos || b.BOS || '',
    choch:b.choch || b.CHOCH || '',
    bosChoch:b.bosChoch || b.bos_choch || b.BOS_CHOCH || b.bos || b.choch || '',
    stopHunt:b.stopHunt || b.stophunt || b.stop_hunt || b.STOPHUNT || '',
    fvg:b.fvg || b.fvgZone || b.fvg_zone || '',
    ob:b.ob || b.obZone || b.orderBlock || b.order_block || '',
    tp1:b.tp1 || b.TP1 || null,
    tp2:b.tp2 || b.TP2 || null,
    tp3:b.tp3 || b.TP3 || null,
    mitigation:b.mitigation || '',
    confluence:b.confluence || '',
    trendStrength:b.trendStrength || b.trend_strength || '',
    heartbeat:Date.now(),
    raw:b,
    updatedAt:new Date().toISOString()
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
  writeJson(SIGNAL_FILE, signal);
  const hist = readJson(HISTORY_FILE, []);
  hist.push(signal);
  writeJson(HISTORY_FILE, hist.slice(-500));
  broadcast(signal);
}

ensureDb();

app.get('/health',(req,res)=>res.json({ok:true,service:'VYRO PRO MAX TERMINAL V15',time:new Date().toISOString()}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'VYRO PRO MAX TERMINAL V15',time:new Date().toISOString(),streamClients:streamClients.length,legacyClients:legacyClients.length}));
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

app.post('/api/signal',(req,res)=>{
  const d=normalizeSignal(req.body||{});
  saveSignal(d);
  res.json({ok:true,received:d,realtimeClients:streamClients.length+legacyClients.length});
});

app.post('/api/test-signal',(req,res)=>{
  const d=normalizeSignal({symbol:'XAUUSD.G',signal:'SELL',status:'SELL',price:4388.96,timeframe:'M1',rsi:43.7,flow:-239,delta:-720,power:1133.3,buySell:'0.0/10.0',conf:90,confidence:90,score:90,trend:'Bearish',pressure:'Seller dominant',liquidity:'Mid-range / waiting',risk:'Medium',action:'WAIT CONFIRM',sellZone:'4739.43',buyZone:'4690.00',supply:'4739.43',demand:'4690.00',source:'VYRO_TEST_REALTIME',reason:'Realtime test'});
  saveSignal(d);
  res.json({ok:true,received:d,realtimeClients:streamClients.length+legacyClients.length});
});

app.use(express.static(__dirname,{etag:false,maxAge:0}));
app.use((req,res)=>res.sendFile(path.join(__dirname,'index.html')));

app.listen(PORT,()=>console.log('VYRO PRO MAX TERMINAL V15 running on '+PORT));
