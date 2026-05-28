const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const DB_DIR = path.join(__dirname, 'db');
const USERS_FILE = path.join(DB_DIR, 'users.json');
const SIGNAL_FILE = path.join(DB_DIR, 'latest-signal.json');

function ensureDb() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([
      { username:'admin', password:'2606', role:'admin', name:'Master Admin', vip:true, expire:'2099-12-31' },
      { username:'vip001', password:'123456', role:'vip', name:'VIP 001', vip:true, expire:'2099-12-31' }
    ], null, 2));
  }

  if (!fs.existsSync(SIGNAL_FILE)) {
    fs.writeFileSync(SIGNAL_FILE, JSON.stringify({
      ok:true, received:true, symbol:'XAUUSD', signal:'WAIT', status:'WAIT',
      rsi:null, flow:null, delta:null, power:null, buySell:null,
      conf:55, pressure:'WAIT', liquidity:'Waiting',
      updatedAt:new Date().toISOString()
    }, null, 2));
  }
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return fallback; }
}
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function n(v, fallback=null) {
  if (v === undefined || v === null || v === '') return fallback;
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
ensureDb();

app.get('/health', (req,res)=>res.json({ok:true, service:'VYRO PRO MAX', time:new Date().toISOString()}));
app.get('/api/health', (req,res)=>res.json({ok:true, service:'VYRO PRO MAX', time:new Date().toISOString()}));

app.get('/api/latest-signal', (req,res)=>{
  res.set('Cache-Control', 'no-store');
  res.json(readJson(SIGNAL_FILE, {}));
});

app.post('/api/signal', (req,res)=>{
  const body = req.body || {};
  const normalized = {
    ok:true,
    received:true,
    symbol: body.symbol || body.Symbol || 'XAUUSD',
    signal: body.signal || body.Signal || body.status || body.Status || 'WAIT',
    status: body.status || body.Status || body.signal || body.Signal || 'WAIT',
    setup: body.setup || body.Setup || '',
    price: n(body.price ?? body.Price),
    timeframe: body.timeframe || body.tf || body.Timeframe || '',
    rsi: n(body.rsi ?? body.RSI),
    ema: n(body.ema ?? body.EMA),
    flow: n(body.flow ?? body.FLOW),
    delta: n(body.delta ?? body.DELTA),
    power: n(body.power ?? body.POWER),
    buySell: body.buySell || body.buy_sell || body['BUY/SELL'] || body.ratio || body.buy_sell_ratio || '0/0',
    conf: n(body.conf ?? body.confidence ?? body.CONF ?? body.score ?? body.Score, 55),
    confidence: n(body.confidence ?? body.conf ?? body.score ?? body.Score, 55),
    score: n(body.score ?? body.confidence ?? body.conf, 55),
    trend: body.trend || body.Trend || '',
    pressure: body.pressure || body.Pressure || '',
    liquidity: body.liquidity || body.Liquidity || '',
    risk: body.risk || body.Risk || '',
    action: body.action || body.Action || '',
    supply: body.supply || body.sellZone || body.sell_zone || body.SUPPLY || null,
    demand: body.demand || body.buyZone || body.buy_zone || body.DEMAND || null,
    source: body.source || body.Source || '',
    reason: body.reason || body.Reason || '',
    raw: body,
    updatedAt: new Date().toISOString()
  };
  writeJson(SIGNAL_FILE, normalized);
  res.json({ok:true, received:normalized});
});

app.post('/api/login', (req,res)=>{
  const {username, password} = req.body || {};
  const users = readJson(USERS_FILE, []);
  const user = users.find(u => String(u.username) === String(username) && String(u.password) === String(password));
  if (!user) return res.status(401).json({success:false, message:'Sai tài khoản hoặc mật khẩu'});
  const safe = {...user}; delete safe.password;
  res.json({success:true, ok:true, user:safe});
});

app.get('/api/users', (req,res)=>{
  const users = readJson(USERS_FILE, []).map(u => { const x={...u}; delete x.password; return x; });
  res.json({ok:true, users});
});

app.use(express.static(__dirname, { etag:false, maxAge:0 }));
app.use((req,res)=>res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, ()=>console.log('VYRO PRO MAX V13.7.4 running on port ' + PORT));
