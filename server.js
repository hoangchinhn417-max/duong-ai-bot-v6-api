const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({limit:'3mb'}));
app.use(express.urlencoded({extended:true}));

const DB_DIR = path.join(__dirname,'db');
const USERS_FILE = path.join(DB_DIR,'users.json');
const SIGNAL_FILE = path.join(DB_DIR,'latest-signal.json');
const HISTORY_FILE = path.join(DB_DIR,'signal-history.json');

const defaultUsers = [
  {username:'admin',password:'2606',name:'Master Admin',plan:'vip',status:'active',expire:'2099-12-31',admin:true,email:'',createdAt:'2026-05-28T00:00:00.000Z'},
  {username:'vip001',password:'123456',name:'VIP Client',plan:'pro',status:'active',expire:'2099-12-31',admin:false,email:'',createdAt:'2026-05-28T00:00:00.000Z'}
];

function readJson(file, fallback){ try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){return fallback} }
function writeJson(file, data){ fs.writeFileSync(file, JSON.stringify(data,null,2)); }
function num(v, fallback=null){ if(v===undefined||v===null||v==='')return fallback; const n=Number(v); return Number.isFinite(n)?n:fallback; }
function first(...vals){ for(const v of vals){ if(v!==undefined && v!==null && v!=='') return v; } return null; }

function ensureDb(){
  if(!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR,{recursive:true});
  let users = fs.existsSync(USERS_FILE) ? readJson(USERS_FILE, defaultUsers) : defaultUsers;
  if(!Array.isArray(users)) users=defaultUsers;
  users=users.map(u=>{
    if(u.username==='admin') return {...defaultUsers[0],...u,password:u.password||'2606',admin:true,status:u.status||'active'};
    if(u.username==='vip001') return {...defaultUsers[1],...u,password:u.password||'123456',status:u.status||'active'};
    return u;
  });
  if(!users.find(u=>u.username==='admin')) users.unshift(defaultUsers[0]);
  if(!users.find(u=>u.username==='vip001')) users.push(defaultUsers[1]);
  writeJson(USERS_FILE, users);
  if(!fs.existsSync(SIGNAL_FILE)) writeJson(SIGNAL_FILE, {
    ok:true,received:true,symbol:'XAUUSD.G',timeframe:'M1',signal:'WAIT',status:'WAIT',score:55,conf:55,
    rsi:null,flow:null,delta:null,power:null,buySell:'0/0',
    sellZone:'--',buyZone:'--',supply:null,demand:null,updatedAt:new Date().toISOString()
  });
  if(!fs.existsSync(HISTORY_FILE)) writeJson(HISTORY_FILE, []);
}
ensureDb();

app.get('/health',(req,res)=>res.json({ok:true,service:'VYRO V14 OLD UI CORE SMC ZONE',time:new Date().toISOString()}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'VYRO V14 OLD UI CORE SMC ZONE',time:new Date().toISOString()}));
app.get('/api/test-login',(req,res)=>res.json({ok:true,admin:'admin / 2606',vip:'vip001 / 123456'}));

app.post('/api/login',(req,res)=>{
  const b=req.body||{};
  const username=String(b.username||b.user||'').trim().toLowerCase();
  const password=String(b.password||b.pass||'').trim();
  const users=readJson(USERS_FILE,[]);
  const user=users.find(u=>String(u.username).toLowerCase()===username && String(u.password||'')===password && String(u.status||'active')==='active');
  if(!user) return res.status(401).json({ok:false,success:false,message:'Sai tài khoản hoặc mật khẩu'});
  const safe={...user}; delete safe.password;
  res.json({ok:true,success:true,user:safe});
});

app.get('/api/users',(req,res)=>{
  const users=readJson(USERS_FILE,[]).map(u=>{const x={...u}; delete x.password; return x});
  res.set('Cache-Control','no-store');
  res.json({ok:true,users});
});

app.get('/api/latest-signal',(req,res)=>{
  res.set('Cache-Control','no-store');
  res.json(readJson(SIGNAL_FILE,{}));
});

app.get('/api/signal-history',(req,res)=>{
  const h=readJson(HISTORY_FILE,[]);
  res.set('Cache-Control','no-store');
  res.json({ok:true,history:h.slice(-100).reverse()});
});

app.post('/api/signal',(req,res)=>{
  const b=req.body||{};
  const sellZone = first(
    b.sellZone, b.sell_zone, b.supply, b.supplyZone, b.supply_zone, b.smcSellZone,
    b.SELL_ZONE, b.SUPPLY, b.supply_line_label, b.supply_zone_label, b.supplyDetail
  );
  const buyZone = first(
    b.buyZone, b.buy_zone, b.demand, b.demandZone, b.demand_zone, b.smcBuyZone,
    b.BUY_ZONE, b.DEMAND, b.demand_line_label, b.demand_zone_label, b.demandDetail
  );
  const d={
    ok:true,received:true,
    symbol:first(b.symbol,b.Symbol,'XAUUSD.G'),
    timeframe:first(b.timeframe,b.tf,b.Timeframe,'M1'),
    signal:first(b.signal,b.Signal,b.status,b.Status,'WAIT'),
    status:first(b.status,b.Status,b.signal,b.Signal,'WAIT'),
    setup:first(b.setup,b.Setup,''),
    price:num(first(b.price,b.Price), null),
    rsi:num(first(b.rsi,b.RSI), null),
    ema:num(first(b.ema,b.EMA), null),
    flow:num(first(b.flow,b.FLOW,b.cvd), null),
    delta:num(first(b.delta,b.DELTA,b.powerDelta), null),
    power:num(first(b.power,b.POWER,b.diff), null),
    buySell:first(b.buySell,b.buy_sell,b.ratio,b['BUY/SELL'],'0/0'),
    score:num(first(b.score,b.confidence,b.conf),55),
    conf:num(first(b.conf,b.confidence,b.score),55),
    confidence:num(first(b.confidence,b.conf,b.score),55),
    trend:first(b.trend,b.Trend,''),
    liquidity:first(b.liquidity,b.Liquidity,''),
    pressure:first(b.pressure,b.Pressure,''),
    risk:first(b.risk,b.Risk,''),
    action:first(b.action,b.Action,''),
    supply:sellZone,
    demand:buyZone,
    sellZone:sellZone,
    buyZone:buyZone,
    noTradeZone:first(b.noTradeZone,b.no_trade_zone,b.chopZone,b.midZone,'--'),
    supplyDetail:first(b.supplyDetail,b.supply_detail,b.SUPPLY_DETAIL,'SMC Supply từ bot'),
    demandDetail:first(b.demandDetail,b.demand_detail,b.DEMAND_DETAIL,'SMC Demand từ bot'),
    source:first(b.source,b.Source,'MT5_EA_BRIDGE'),
    reason:first(b.reason,b.Reason,''),
    raw:b,
    updatedAt:new Date().toISOString(),
    receivedAt:new Date().toISOString()
  };
  writeJson(SIGNAL_FILE,d);
  const hist=readJson(HISTORY_FILE,[]); hist.push(d); writeJson(HISTORY_FILE,hist.slice(-300));
  res.json({ok:true,received:d});
});

app.post('/api/test-signal',(req,res)=>{
  const d={ok:true,received:true,symbol:'XAUUSD.G',timeframe:'M1',signal:'BUY',status:'BUY',price:4393.08,rsi:63.6,flow:1259,delta:1072,power:3520.2,buySell:'9.9/0.6',score:90,conf:90,confidence:90,trend:'Bullish',pressure:'BUY PRESSURE STRONG',liquidity:'Sell-side liquidity / reclaim',risk:'Medium',action:'WAIT CONFIRM',sellZone:'4465.85 SUPPLY',buyZone:'4381.03 DEMAND',supply:'4465.85 SUPPLY',demand:'4381.03 DEMAND',supplyDetail:'SELL AREA / SUPPLY từ bot SMC',demandDetail:'BUY AREA / DEMAND từ bot SMC',source:'TEST_SMC_ZONE',updatedAt:new Date().toISOString(),receivedAt:new Date().toISOString()};
  writeJson(SIGNAL_FILE,d);
  const hist=readJson(HISTORY_FILE,[]); hist.push(d); writeJson(HISTORY_FILE,hist.slice(-300));
  res.json({ok:true,received:d});
});

app.use(express.static(__dirname,{etag:false,maxAge:0}));
app.use((req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.listen(PORT,()=>console.log('VYRO PRO MAX V14 OLD UI CORE SMC ZONE running on '+PORT));
