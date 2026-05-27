const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "DUONG_AI_SECRET_2026";

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));

let latestSignal = null;
let signalHistory = [];
let clients = [];

function normalizeSignal(raw) {
  const s = String(raw || "WAIT").toUpperCase();
  if (s.includes("SELL")) return "SELL";
  if (s.includes("BUY")) return "BUY";
  return "WAIT";
}

function buildSignal(body, source = "TRADINGVIEW") {
  const signal = normalizeSignal(body.signal || body.side || body.action);
  const symbol = body.symbol || body.ticker || body.pair || "XAUUSD";
  const price = body.price || body.close || body.entry || "";
  const timeframe = body.timeframe || body.interval || body.tf || "M15";
  const score = Number(body.score || body.confidence || (signal === "SELL" ? 86 : signal === "BUY" ? 79 : 55));

  return {
    id: Date.now().toString(),
    source,
    symbol,
    signal,
    price,
    timeframe,
    score,
    trend: body.trend || (signal === "SELL" ? "Bearish" : signal === "BUY" ? "Bullish" : "Sideway"),
    liquidity: body.liquidity || (signal === "SELL" ? "Buy-side swept" : signal === "BUY" ? "Sell-side swept" : "No clear sweep"),
    volume: body.volume || (signal === "SELL" ? "Seller dominant" : signal === "BUY" ? "Buyer absorption" : "Mixed"),
    impact: body.impact || body.newsImpact || "Medium",
    risk: body.risk || (signal === "SELL" ? "High" : signal === "BUY" ? "Medium" : "High"),
    action: body.actionText || body.action || (signal === "SELL" ? "Wait pullback sell" : signal === "BUY" ? "Buy after reclaim" : "Wait signal"),
    reason: body.reason || `${symbol} ${signal} signal received from ${source}.`,
    state: body.state || signal,
    sellZone: body.sellZone || body.sell_zone || "",
    buyZone: body.buyZone || body.buy_zone || "",
    receivedAt: new Date().toISOString()
  };
}

function broadcast(payload) {
  const msg = `data: ${JSON.stringify({ type: "signal", payload })}\n\n`;
  clients.forEach((res) => res.write(msg));
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "DUONG AI BOT V6 API",
    endpoints: ["/health", "/webhook/tradingview", "/api/latest-signal", "/api/history", "/events"]
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "DUONG AI BOT V6 API", time: new Date().toISOString() });
});

app.post("/webhook/tradingview", (req, res) => {
  const body = req.body || {};

  if (WEBHOOK_SECRET && body.secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, error: "Invalid webhook secret" });
  }

  const signal = buildSignal(body, "TRADINGVIEW");
  latestSignal = signal;
  signalHistory.unshift(signal);
  signalHistory = signalHistory.slice(0, 100);

  broadcast(signal);

  res.json({ ok: true, received: signal });
});

app.post("/api/manual-signal", (req, res) => {
  const signal = buildSignal(req.body || {}, "MANUAL_API");
  latestSignal = signal;
  signalHistory.unshift(signal);
  signalHistory = signalHistory.slice(0, 100);

  broadcast(signal);

  res.json({ ok: true, received: signal });
});

app.get("/api/latest-signal", (req, res) => {
  res.json(latestSignal || {});
});

app.get("/api/history", (req, res) => {
  res.json({ ok: true, history: signalHistory });
});

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: "connected", payload: { ok: true } })}\n\n`);
  clients.push(res);

  req.on("close", () => {
    clients = clients.filter((client) => client !== res);
  });
});

app.listen(PORT, () => {
  console.log(`DUONG AI BOT V6 API running on port ${PORT}`);
});
