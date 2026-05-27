DUONG AI BACKEND V10.2 SMART FLOW API

Mục tiêu:
- Fix web chưa hiện realtime RSI / FLOW / DELTA / POWER / BUY/SELL.
- API nhận full data từ EA Bridge V8.3.
- Trả đủ field cho web V10.1.

Cài Render:
1. Upload 2 file này lên repo backend:
   - server.js
   - package.json

2. Render settings:
   Build Command:
   npm install

   Start Command:
   npm start

3. Environment Variables:
   DUONG_AI_SECRET=DUONG_AI_SECRET_2026

4. Redeploy.

Test:
https://duong-ai-bot-v6-api.onrender.com/health

Web sẽ hiện:
- FLOW số realtime
- DELTA số realtime
- POWER realtime
- BUY/SELL ratio
- RSI realtime
