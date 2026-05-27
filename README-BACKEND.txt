# DUONG AI BOT V6 BACKEND API

## Deploy lên Render

1. Tạo tài khoản Render.com
2. New + Web Service
3. Upload / connect folder backend-render
4. Build Command:
   npm install
5. Start Command:
   npm start
6. Environment Variable:
   WEBHOOK_SECRET = DUONG_AI_SECRET_2026

## Endpoint chính

Health:
GET /health

TradingView webhook:
POST /webhook/tradingview

Latest signal:
GET /api/latest-signal

Realtime SSE:
GET /events

## TradingView Alert Message mẫu

{
  "secret": "DUONG_AI_SECRET_2026",
  "symbol": "{{ticker}}",
  "signal": "SELL",
  "price": "{{close}}",
  "timeframe": "{{interval}}",
  "score": 86,
  "trend": "Bearish",
  "liquidity": "Buy-side swept",
  "risk": "High",
  "action": "Wait pullback sell",
  "sellZone": "4535 - 4555",
  "buyZone": "4490 - 4505"
}
