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
      {
        username: 'admin',
        password: '2606',
        role: 'admin',
        name: 'Master Admin',
        vip: true,
        expire: '2099-12-31'
      },
      {
        username: 'vip001',
        password: '123456',
        role: 'vip',
        name: 'VIP 001',
        vip: true,
        expire: '2099-12-31'
      }
    ], null, 2));
  }

  if (!fs.existsSync(SIGNAL_FILE)) {
    fs.writeFileSync(SIGNAL_FILE, JSON.stringify({
      ok: true,
      symbol: 'XAUUSD',
      signal: 'WAIT',
      status: 'WAIT',
      rsi: 0,
      flow: 0,
      delta: 0,
      power: 0,
      buySell: '0/0',
      conf: 55,
      updatedAt: new Date().toISOString()
    }, null, 2));
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

ensureDb();

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'VYRO PRO MAX', time: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'VYRO PRO MAX', time: new Date().toISOString() });
});

app.get('/api/latest-signal', (req, res) => {
  const data = readJson(SIGNAL_FILE, {});
  res.json(data);
});

app.post('/api/signal', (req, res) => {
  const body = req.body || {};

  const normalized = {
    ok: true,
    received: true,
    symbol: body.symbol || body.Symbol || 'XAUUSD',
    signal: body.signal || body.Signal || body.status || body.Status || 'WAIT',
    status: body.status || body.Status || body.signal || body.Signal || 'WAIT',
    rsi: Number(body.rsi ?? body.RSI ?? 0),
    flow: Number(body.flow ?? body.FLOW ?? 0),
    delta: Number(body.delta ?? body.DELTA ?? 0),
    power: Number(body.power ?? body.POWER ?? 0),
    buySell: body.buySell || body.buy_sell || body['BUY/SELL'] || body.ratio || '0/0',
    conf: Number(body.conf ?? body.confidence ?? body.CONF ?? 55),
    supply: body.supply || body.sellZone || body.sell_zone || body.SUPPLY || null,
    demand: body.demand || body.buyZone || body.buy_zone || body.DEMAND || null,
    raw: body,
    updatedAt: new Date().toISOString()
  };

  writeJson(SIGNAL_FILE, normalized);
  res.json({ ok: true, received: normalized });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const users = readJson(USERS_FILE, []);
  const user = users.find(u => String(u.username) === String(username) && String(u.password) === String(password));

  if (!user) {
    return res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu' });
  }

  const safeUser = { ...user };
  delete safeUser.password;

  res.json({ success: true, ok: true, user: safeUser });
});

app.get('/api/users', (req, res) => {
  const users = readJson(USERS_FILE, []).map(u => {
    const x = { ...u };
    delete x.password;
    return x;
  });
  res.json({ ok: true, users });
});

app.use(express.static(__dirname));

// KHÔNG dùng app.get('*') để tránh lỗi path-to-regexp trên Render/Express mới
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log('VYRO PRO MAX server running on port ' + PORT);
});
