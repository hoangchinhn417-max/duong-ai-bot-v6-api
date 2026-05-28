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

  const defaultUsers = [
    {
      username: 'admin',
      password: '2606',
      name: 'Master Admin',
      plan: 'vip',
      status: 'active',
      expire: '2099-12-31',
      admin: true,
      role: 'admin',
      email: '',
      createdAt: '2026-05-28T00:00:00.000Z'
    },
    {
      username: 'vip001',
      password: '123456',
      name: 'VIP Client',
      plan: 'pro',
      status: 'active',
      expire: '2099-12-31',
      admin: false,
      role: 'vip',
      email: '',
      createdAt: '2026-05-28T00:00:00.000Z'
    }
  ];

  let users = defaultUsers;
  if (fs.existsSync(USERS_FILE)) {
    try {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (!Array.isArray(users)) users = defaultUsers;
    } catch(e) {
      users = defaultUsers;
    }
  }

  // Force repair passwords if old users.json missed password
  users = users.map(u => {
    if (u.username === 'admin') return { ...defaultUsers[0], ...u, password: u.password || '2606', admin: true, role: 'admin' };
    if (u.username === 'vip001') return { ...defaultUsers[1], ...u, password: u.password || '123456', admin: false, role: 'vip' };
    return u;
  });

  if (!users.find(u => u.username === 'admin')) users.unshift(defaultUsers[0]);
  if (!users.find(u => u.username === 'vip001')) users.push(defaultUsers[1]);

  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

  if (!fs.existsSync(SIGNAL_FILE)) {
    fs.writeFileSync(SIGNAL_FILE, JSON.stringify({
      ok: true,
      received: true,
      symbol: 'XAUUSD',
      signal: 'WAIT',
      status: 'WAIT',
      rsi: null,
      flow: null,
      delta: null,
      power: null,
      buySell: '0/0',
      conf: 55,
      pressure: 'WAIT',
      liquidity: 'Waiting',
      updatedAt: new Date().toISOString()
    }, null, 2));
  }
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch(e) { return fallback; }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function safeNum(v, fallback=null) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

ensureDb();

app.get('/health', (req, res) => res.json({ ok: true, service: 'VYRO', time: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'VYRO', time: new Date().toISOString() }));

app.get('/api/users', (req, res) => {
  const users = readJson(USERS_FILE, []);
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    users: users.map(u => {
      const x = { ...u };
      delete x.password;
      return x;
    })
  });
});

app.post('/api/login', (req, res) => {
  const body = req.body || {};
  const username = String(body.username || body.user || body.account || '').trim();
  const password = String(body.password || body.pass || body.pwd || '').trim();

  const users = readJson(USERS_FILE, []);
  const user = users.find(u =>
    String(u.username).trim().toLowerCase() === username.toLowerCase()
    && String(u.password || '').trim() === password
    && String(u.status || 'active').toLowerCase() === 'active'
  );

  if (!user) {
    return res.status(401).json({ ok: false, success: false, message: 'Sai tài khoản hoặc mật khẩu' });
  }

  const safeUser = { ...user };
  delete safeUser.password;

  res.json({ ok: true, success: true, user: safeUser, token: 'vyro-session-' + Date.now() });
});

app.get('/api/latest-signal', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(readJson(SIGNAL_FILE, {}));
});

app.post('/api/signal', (req, res) => {
  const b = req.body || {};
  const normalized = {
    ok: true,
    received: true,
    symbol: b.symbol || b.Symbol || 'XAUUSD',
    signal: b.signal || b.Signal || b.status || b.Status || 'WAIT',
    status: b.status || b.Status || b.signal || b.Signal || 'WAIT',
    setup: b.setup || '',
    price: safeNum(b.price),
    timeframe: b.timeframe || b.tf || '',
    rsi: safeNum(b.rsi ?? b.RSI),
    ema: safeNum(b.ema ?? b.EMA),
    flow: safeNum(b.flow ?? b.FLOW),
    delta: safeNum(b.delta ?? b.DELTA),
    power: safeNum(b.power ?? b.POWER),
    buySell: b.buySell || b.buy_sell || b.ratio || '0/0',
    conf: safeNum(b.conf ?? b.confidence ?? b.score, 55),
    confidence: safeNum(b.confidence ?? b.conf ?? b.score, 55),
    score: safeNum(b.score ?? b.confidence ?? b.conf, 55),
    trend: b.trend || '',
    pressure: b.pressure || '',
    liquidity: b.liquidity || '',
    risk: b.risk || '',
    action: b.action || '',
    supply: b.supply || b.sellZone || b.sell_zone || null,
    demand: b.demand || b.buyZone || b.buy_zone || null,
    raw: b,
    updatedAt: new Date().toISOString()
  };
  writeJson(SIGNAL_FILE, normalized);
  res.json({ ok: true, received: normalized });
});

// Quick test endpoint: open /api/test-login in browser
app.get('/api/test-login', (req, res) => {
  res.json({ ok: true, admin: 'admin / 2606', vip: 'vip001 / 123456' });
});

app.use(express.static(__dirname, { etag: false, maxAge: 0 }));
app.use((req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log('VYRO V13.8.1 Login Fix running on port ' + PORT));
