const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.VYRO_SECRET || 'DUONG_AI_SECRET_2026';
const DB_DIR = path.join(__dirname, 'db');
const USERS_FILE = path.join(DB_DIR, 'users.json');
const SIGNAL_FILE = path.join(DB_DIR, 'latest-signal.json');
const HISTORY_FILE = path.join(DB_DIR, 'signal-history.json');
fs.mkdirSync(DB_DIR, { recursive: true });
function readJson(file, fallback){ try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch(e){ return fallback; } }
function writeJson(file, data){ fs.writeFileSync(file, JSON.stringify(data,null,2)); }
function todayPlus(days){ const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
if(!fs.existsSync(USERS_FILE)) writeJson(USERS_FILE, [
  {username:'admin',password:'2606',name:'Master Admin',plan:'vip',status:'active',expire:'2099-12-31',admin:true,email:'',createdAt:new Date().toISOString()},
  {username:'vip001',password:'123456',name:'VIP Client',plan:'pro',status:'active',expire:todayPlus(30),admin:false,email:'',createdAt:new Date().toISOString()}
]);
if(!fs.existsSync(SIGNAL_FILE)) writeJson(SIGNAL_FILE, {symbol:'XAUUSD',signal:'WAIT',score:55,reason:'API sẵn sàng. Chờ tín hiệu MT5 realtime.',receivedAt:new Date().toISOString(),source:'SERVER'});
if(!fs.existsSync(HISTORY_FILE)) writeJson(HISTORY_FILE, []);

app.use(cors({origin:true, credentials:false}));
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(__dirname));

const clients = new Set();
function pushSignal(payload){ const msg = `data: ${JSON.stringify({type:'signal',payload})}\n\n`; clients.forEach(res=>res.write(msg)); }
function pick(o, keys){ for(const k of keys){ if(o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; } }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:undefined; }
function normalize(body){
  const b = body || {};
  const z = b.smc || b.zones || b.liquidityZones || b.liquidity_zones || {};
  const signal = String(pick(b,['signal','side','action','entry']) || 'WAIT').toUpperCase();
  const score = num(pick(b,['score','confidence','conf'])) ?? 55;
  const out = {
    id: String(pick(b,['id','ticket']) || Date.now()),
    symbol: pick(b,['symbol','pair']) || 'XAUUSD',
    timeframe: pick(b,['timeframe','tf','period']) || 'M1',
    signal: signal.includes('SELL')?'SELL':signal.includes('BUY')?'BUY':'WAIT',
    price: pick(b,['price','bid','ask','close']) || '--',
    rsi: pick(b,['rsi','RSI']) || '--',
    atr: pick(b,['atr','ATR']),
    flow: pick(b,['flow','cvd','CVD']) || '--',
    delta: pick(b,['delta','DELTA','powerDelta']) || '--',
    power: pick(b,['power','diff','POWER']) || '--',
    buySell: pick(b,['buySell','buy_sell','ratio','BUYSELL']) || '--',
    score, confidence: score, conf: score,
    reason: pick(b,['reason','message','note']) || 'MT5 Smart Flow realtime signal.',
    trend: pick(b,['trend','trendAI']) || undefined,
    liquidity: pick(b,['liquidity','liquidityState']) || undefined,
    pressure: pick(b,['pressure']) || undefined,
    risk: pick(b,['risk','riskMode']) || undefined,
    action: pick(b,['actionText','recommendation']) || undefined,
    source: pick(b,['source']) || 'MT5_BRIDGE',
    receivedAt: new Date().toISOString(),
    raw: b,
    smc: {
      bsl: pick(z,['bsl','BSL','bslLine','bsl_line','buySideLiquidity','buy_side_liquidity']) ?? pick(b,['bsl','BSL','bslLine','buySideLiquidity']),
      ssl: pick(z,['ssl','SSL','sslLine','ssl_line','sellSideLiquidity','sell_side_liquidity']) ?? pick(b,['ssl','SSL','sslLine','sellSideLiquidity']),
      mid: pick(z,['mid','middle','inducement','inducementLine','inducement_line']) ?? pick(b,['mid','middle','inducement']),
      sellLow: pick(z,['sellLow','sell_low','sellZoneLow','sell_zone_low','bslLow','bsl_low']) ?? pick(b,['sellLow','sell_zone_low','bslLow']),
      sellHigh: pick(z,['sellHigh','sell_high','sellZoneHigh','sell_zone_high','bslHigh','bsl_high']) ?? pick(b,['sellHigh','sell_zone_high','bslHigh']),
      buyLow: pick(z,['buyLow','buy_low','buyZoneLow','buy_zone_low','sslLow','ssl_low']) ?? pick(b,['buyLow','buy_zone_low','sslLow']),
      buyHigh: pick(z,['buyHigh','buy_high','buyZoneHigh','buy_zone_high','sslHigh','ssl_high']) ?? pick(b,['buyHigh','buy_zone_high','sslHigh']),
      noTradeLow: pick(z,['noTradeLow','no_trade_low','midLow','mid_low','inducementLow','inducement_low']) ?? pick(b,['noTradeLow','midLow','inducementLow']),
      noTradeHigh: pick(z,['noTradeHigh','no_trade_high','midHigh','mid_high','inducementHigh','inducement_high']) ?? pick(b,['noTradeHigh','midHigh','inducementHigh']),
      zoneWidth: pick(z,['zoneWidth','zone_width']) ?? pick(b,['zoneWidth','zone_width'])
    }
  };
  return out;
}
function checkSecret(req){ const got = req.headers['x-vyro-secret'] || req.query.secret || req.body.secret; return !got || got === SECRET; }

app.get('/health',(req,res)=>res.json({ok:true,version:'V13.7.2 REAL BACKEND',time:new Date().toISOString()}));
app.get('/events',(req,res)=>{ res.setHeader('Content-Type','text/event-stream'); res.setHeader('Cache-Control','no-cache'); res.setHeader('Connection','keep-alive'); res.flushHeaders?.(); clients.add(res); res.write(`data: ${JSON.stringify({type:'hello',payload:{ok:true}})}\n\n`); req.on('close',()=>clients.delete(res)); });
app.get('/api/latest-signal',(req,res)=>res.json(readJson(SIGNAL_FILE, {})));
app.get('/api/history',(req,res)=>res.json(readJson(HISTORY_FILE, [])));
app.post(['/api/signal','/api/latest-signal','/webhook','/mt5','/api/mt5-signal'],(req,res)=>{
  if(!checkSecret(req)) return res.status(401).json({ok:false,error:'BAD_SECRET'});
  const signal = normalize(req.body);
  writeJson(SIGNAL_FILE, signal);
  const history = readJson(HISTORY_FILE, []); history.unshift(signal); writeJson(HISTORY_FILE, history.slice(0,100));
  pushSignal(signal);
  res.json({ok:true,received:signal});
});
app.get('/api/users',(req,res)=>res.json(readJson(USERS_FILE, [])));
app.post('/api/login',(req,res)=>{ const {username,password}=req.body||{}; const users=readJson(USERS_FILE, []); const u=users.find(x=>x.username===username && x.password===password); if(!u) return res.status(401).json({ok:false,error:'Sai tài khoản hoặc mật khẩu'}); if(u.status!=='active' || new Date((u.expire||'2000-01-01')+'T23:59:59')<new Date()) return res.status(403).json({ok:false,error:'Tài khoản chưa duyệt hoặc hết hạn'}); const safe={...u}; delete safe.password; res.json({ok:true,user:safe}); });
app.post('/api/users',(req,res)=>{ const users = Array.isArray(req.body) ? req.body : req.body.users; if(!Array.isArray(users)) return res.status(400).json({ok:false,error:'users array required'}); writeJson(USERS_FILE, users); res.json({ok:true,total:users.length}); });
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.listen(PORT,()=>console.log('VYRO REAL BACKEND running on port '+PORT));
