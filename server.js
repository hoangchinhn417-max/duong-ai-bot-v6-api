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
let sseClients = [];

function readJson(file, fallback){
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch(e){ return fallback; }
}
function writeJson(file, data){ fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function num(v, fallback=null){
  if(v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function ensureDb(){
  if(!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, {recursive:true});

  let users = defaultUsers;
  if(fs.existsSync(USERS_FILE)){
    users = readJson(USERS_FILE, defaultUsers);
    if(!Array.isArray(users)) users = defaultUsers;
  }
  users = users.map(u => {
    if(u.username === 'admin') return {...defaultUsers[0], ...u, password: u.password || '2606', admin:true, role:'admin', status:u.status || 'active'};
    if(u.username === 'vip001') return {...defaultUsers[1], ...u, password: u.password || '123456', admin:false, role:'vip', status:u.status || 'active'};
    return u;
  });
  if(!users.find(u => u.username === 'admin')) users.unshift(defaultUsers[0]);
  if(!users.find(u => u.username === 'vip001')) users.push(defaultUsers[1]);
  writeJson(USERS_FILE, users);

  if(!fs.existsSync(SIGNAL_FILE)){
    writeJson(SIGNAL_FILE, {ok:true,received:true,symbol:'XAUUSD.G',signal:'WAIT',status:'WAIT',buySell:'0/0',conf:55,confidence:55,score:55,trend:'Neutral',pressure:'WAIT',liquidity:'Waiting',risk:'--',action:'--',updatedAt:new Date().toISOString()});
  }
  if(!fs.existsSync(HISTORY_FILE)) writeJson(HISTORY_FILE, []);
  latestSignalMemory = readJson(SIGNAL_FILE, {});
}
function safeUser(u){ const x = {...u}; delete x.password; return x; }

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
    heartbeat: Date.now(),
    raw:b,
    updatedAt:new Date().toISOString()
  };
}

function broadcastSignal(signal){
  const payload = `event: signal\ndata: ${JSON.stringify(signal)}\n\n`;
  sseClients = sseClients.filter(res => {
    try { res.write(payload); return true; }
    catch(e){ return false; }
  });
}

function saveAndBroadcast(signal){
  latestSignalMemory = signal;
  writeJson(SIGNAL_FILE, signal);
  const hist = readJson(HISTORY_FILE, []);
  hist.push(signal);
  writeJson(HISTORY_FILE, hist.slice(-500));
  broadcastSignal(signal);
}

ensureDb();

app.get('/health', (req,res) => res.json({ok:true, service:'VYRO PRO MAX V14.1 REALTIME', time:new Date().toISOString()}));
app.get('/api/health', (req,res) => res.json({ok:true, service:'VYRO PRO MAX V14.1 REALTIME', time:new Date().toISOString(), clients:sseClients.length}));
app.get('/api/test-login', (req,res) => res.json({ok:true, admin:'admin / 2606', vip:'vip001 / 123456'}));

app.get('/api/stream', (req,res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ok:true, time:new Date().toISOString()})}\n\n`);
  if(latestSignalMemory) res.write(`event: signal\ndata: ${JSON.stringify(latestSignalMemory)}\n\n`);
  sseClients.push(res);
  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

setInterval(() => {
  const ping = `event: ping\ndata: ${JSON.stringify({time:new Date().toISOString(), clients:sseClients.length})}\n\n`;
  sseClients = sseClients.filter(res => {
    try { res.write(ping); return true; } catch(e){ return false; }
  });
}, 15000);

app.post('/api/login', (req,res) => {
  const b = req.body || {};
  const username = String(b.username || b.user || b.account || '').trim().toLowerCase();
  const password = String(b.password || b.pass || b.pwd || '').trim();
  const users = readJson(USERS_FILE, []);
  const user = users.find(u => String(u.username).trim().toLowerCase() === username && String(u.password || '').trim() === password && String(u.status || 'active').toLowerCase() === 'active');
  if(!user) return res.status(401).json({ok:false, success:false, message:'Sai tài khoản hoặc mật khẩu'});
  res.json({ok:true, success:true, user:safeUser(user), token:'vyro-session-' + Date.now()});
});

app.get('/api/users', (req,res) => {
  res.set('Cache-Control','no-store');
  const users = readJson(USERS_FILE, []).map(safeUser);
  res.json({ok:true, users});
});

app.post('/api/users', (req,res) => {
  const b = req.body || {};
  if(!b.username || !b.password) return res.status(400).json({ok:false, message:'Thiếu username/password'});
  const users = readJson(USERS_FILE, []);
  if(users.find(u => String(u.username).toLowerCase() === String(b.username).toLowerCase())){
    return res.status(409).json({ok:false, message:'Username đã tồn tại'});
  }
  const u = {
    username:String(b.username).trim(),
    password:String(b.password).trim(),
    name:b.name || b.username,
    plan:b.plan || 'pro',
    status:b.status || 'active',
    expire:b.expire || '2099-12-31',
    admin:!!b.admin,
    role:b.admin ? 'admin' : 'vip',
    email:b.email || '',
    createdAt:new Date().toISOString()
  };
  users.push(u);
  writeJson(USERS_FILE, users);
  res.json({ok:true, user:safeUser(u)});
});

app.get('/api/latest-signal', (req,res) => {
  res.set('Cache-Control','no-store');
  res.json(latestSignalMemory || readJson(SIGNAL_FILE, {}));
});

app.get('/api/signal-history', (req,res) => {
  res.set('Cache-Control','no-store');
  const h = readJson(HISTORY_FILE, []);
  res.json({ok:true, history:h.slice(-100).reverse()});
});

app.post('/api/signal', (req,res) => {
  const d = normalizeSignal(req.body || {});
  saveAndBroadcast(d);
  res.json({ok:true, received:d, realtimeClients:sseClients.length});
});

app.post('/api/test-signal', (req,res) => {
  const d = normalizeSignal({
    symbol:'XAUUSD.G', signal:'SELL NOW', status:'SELL NOW', timeframe:'M1',
    price:4388.96, rsi:43.7, flow:-239, delta:-720, power:1133.3, buySell:'0.0/10.0',
    conf:90, confidence:90, score:90, trend:'Bearish', pressure:'Seller dominant',
    liquidity:'Mid-range / waiting', risk:'Medium', action:'WAIT CONFIRM',
    sellZone:'4739.43', buyZone:'4690.00', supply:'4739.43', demand:'4690.00',
    source:'VYRO_TEST_REALTIME'
  });
  saveAndBroadcast(d);
  res.json({ok:true, received:d, realtimeClients:sseClients.length});
});

app.use(express.static(__dirname, {etag:false, maxAge:0}));
app.use((req,res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log('VYRO PRO MAX V14.1 REALTIME LAYER running on ' + PORT));
