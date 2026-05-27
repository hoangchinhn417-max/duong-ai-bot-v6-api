// DUONG AI BACKEND V10.2 SMART FLOW API
// Render Node.js API for MT5 EA Bridge + Web Dashboard

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET = process.env.DUONG_AI_SECRET || "DUONG_AI_SECRET_2026";

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

let latestSignal = null;
let history = [];
let clients = [];

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanSignal(raw) {
  const s = String(raw || "WAIT").toUpperCase();
  if (s.includes("SELL")) return "SELL";
  if (s.includes("BUY")) return "BUY";
  return "WAIT";
}

function normalizePayload(body = {}) {
  const signal = cleanSignal(body.signal || body.side || body.actionSignal);

  const flow = toNumber(
    body.flow ?? body.cvd ?? body.volumeFlow ?? body.smartFlow,
    null
  );

  const delta = toNumber(
    body.delta ?? body.powerDelta ?? body.diffDelta,
    null
  );

  const power = toNumber(
    body.power ?? body.diff ?? body.momentumPower,
    null
  );

  const confidence = toNumber(
    body.confidence ?? body.conf ?? body.score,
    signal === "WAIT" ? 55 : 80
  );

  const buySell = body.buySell ?? body.buy_sell ?? body.ratio ?? body.buySellRatio ?? "--";

  const price = toNumber(body.price ?? body.close ?? body.bid, null);
  const rsi = toNumber(body.rsi, null);
  const ema = toNumber(body.ema, null);

  const trend =
    body.trend ||
    (signal === "BUY" ? "Bullish" : signal === "SELL" ? "Bearish" : "Neutral");

  const pressure =
    body.pressure ||
    (signal === "BUY"
      ? "BUY PRESSURE"
      : signal === "SELL"
      ? "SELL PRESSURE"
      : "NEUTRAL");

  const liquidity =
    body.liquidity ||
    (signal === "BUY"
      ? "Sell-side liquidity / reclaim"
      : signal === "SELL"
      ? "Buy-side liquidity / rejection"
      : "Mid-range / waiting");

  const action =
    body.action ||
    (signal === "WAIT" ? "WAIT CONFIRM" : "WAIT CONFIRM");

  const risk = body.risk || "Medium";

  return {
    id: Date.now().toString(),
    ok: true,
    symbol: body.symbol || "XAUUSD",
    signal,
    setup: body.setup || (signal === "WAIT" ? "WAIT" : `${signal} READY`),
    price,
    timeframe: body.timeframe || body.tf || "M1",
    score: confidence,
    confidence,
    conf: confidence,
    trend,
    pressure,
    liquidity,
    risk,
    action,
    rsi,
    ema,
    flow,
    delta,
    power,
    buySell,
    source: body.source || "MT5_EA_BRIDGE",
    reason: body.reason || `MT5 Smart Flow ${signal}`,
    receivedAt: nowIso()
  };
}

function broadcast(signal) {
  const data = `data: ${JSON.stringify({ type: "signal", payload: signal })}\n\n`;
  clients = clients.filter((res) => {
    try {
      res.write(data);
      return true;
    } catch {
      return false;
    }
  });
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "DUONG AI BACKEND V10.2 SMART FLOW API",
    endpoints: ["/health", "/webhook/tradingview", "/api/latest-signal", "/api/history", "/events"],
    latestSignal
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, status: "online", time: nowIso() });
});

app.post("/webhook/tradingview", (req, res) => {
  try {
    const body = req.body || {};

    if (body.secret && body.secret !== SECRET) {
      return res.status(401).json({ ok: false, error: "Invalid secret" });
    }

    const signal = normalizePayload(body);
    latestSignal = signal;
    history.unshift(signal);
    history = history.slice(0, 200);

    broadcast(signal);

    return res.json({
      ok: true,
      received: signal
    });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: "Bad Request",
      detail: err.message
    });
  }
});

app.get("/api/latest-signal", (req, res) => {
  if (!latestSignal) {
    return res.json({
      ok: true,
      symbol: "XAUUSD",
      signal: "WAIT",
      price: null,
      timeframe: "M1",
      score: 55,
      confidence: 55,
      trend: "Neutral",
      pressure: "NEUTRAL",
      liquidity: "Mid-range / waiting",
      risk: "Medium",
      action: "WAIT CONFIRM",
      rsi: null,
      flow: null,
      delta: null,
      power: null,
      buySell: "--",
      source: "API_IDLE",
      reason: "Waiting MT5 Smart Flow data",
      receivedAt: nowIso()
    });
  }

  res.json(latestSignal);
});

app.get("/api/history", (req, res) => {
  res.json({ ok: true, count: history.length, history });
});

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  clients.push(res);

  res.write(`data: ${JSON.stringify({ type: "connected", payload: { ok: true, time: nowIso() } })}\n\n`);

  if (latestSignal) {
    res.write(`data: ${JSON.stringify({ type: "signal", payload: latestSignal })}\n\n`);
  }

  req.on("close", () => {
    clients = clients.filter((c) => c !== res);
  });
});

app.listen(PORT, () => {
  console.log(`DUONG AI V10.2 Smart Flow API running on port ${PORT}`);
});
