const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));

const DB_DIR = path.join(__dirname,'db');
const USERS_FILE = path.join(DB_DIR,'users.json');
const SIGNAL_FILE = path.join(DB_DIR,'latest-signal.json');

function ensureDb(){
  if(!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR,{recursive:true});
  const defaultUsers=[
    {username:'admin',password:'2606',name:'Master Admin',plan:'vip',status:'active',expire:'2099-12-31',admin:true,role:'admin',email:'',createdAt:'2026-05-28T00:00:00.000Z'},
    {username:'vip001',password:'123456',name:'VIP Client',plan:'pro',status:'active',expire:'2099-12-31',admin:false,role:'vip',email:'',createdAt:'2026-05-28T00:00:00.000Z'}
  ];
  let users=defaultUsers;
  if(fs.existsSync(USERS_FILE)){
    try{ users=JSON.parse(fs.readFileSync(USERS_FILE,'utf8')); if(!Array.isArray(users)) users=defaultUsers; }catch(e){ users=defaultUsers; }
  }
  users=users.map(u=>{
    if(u.username==='admin') return {...defaultUsers[0],...u,password:u.password||'2606',admin:true,role:'admin',status:u.status||'active'};
    if(u.username==='vip001') return {...defaultUsers[1],...u,password:u.password||'123456',admin:false,role:'vip',status:u.status||'active'};
    return u;
  });
  if(!users.find(u=>u.username==='admin')) users.unshift(defaultUsers[0]);
  if(!users.find(u=>u.username==='vip001')) users.push(defaultUsers[1]);
  fs.writeFileSync(USERS_FILE,JSON.stringify(users,null,2));
  if(!fs.existsSync(SIGNAL_FILE)){
    fs.writeFileSync(SIGNAL_FILE,JSON.stringify({ok:true,received:true,symbol:'XAUUSD',signal:'WAIT',status:'WAIT',buySell:'0/0',conf:55,updatedAt:new Date().toISOString()},null,2));
  }
}
function readJson(f,fb){try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){return fb}}
function writeJson(f,d){fs.writeFileSync(f,JSON.stringify(d,null,2))}
function num(v,fb=null){if(v===undefined||v===null||v==='')return fb; const n=Number(v); return Number.isFinite(n)?n:fb}
ensureDb();

app.get('/health',(req,res)=>res.json({ok:true,service:'VYRO PRO MAX',time:new Date().toISOString()}));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'VYRO PRO MAX',time:new Date().toISOString()}));
app.get('/api/test-login',(req,res)=>res.json({ok:true,admin:'admin / 2606',vip:'vip001 / 123456'}));

app.get('/api/users',(req,res)=>{
  res.set('Cache-Control','no-store');
  const users=readJson(USERS_FILE,[]).map(u=>{const x={...u}; delete x.password; return x});
  res.json({ok:true,users});
});

app.post('/api/login',(req,res)=>{
  const b=req.body||{};
  const username=String(b.username||b.user||b.account||'').trim().toLowerCase();
  const password=String(b.password||b.pass||b.pwd||'').trim();
  const users=readJson(USERS_FILE,[]);
  const user=users.find(u=>String(u.username).trim().toLowerCase()===username && String(u.password||'').trim()===password && String(u.status||'active').toLowerCase()==='active');
  if(!user) return res.status(401).json({ok:false,success:false,message:'Sai tài khoản hoặc mật khẩu'});
  const safe={...user}; delete safe.password;
  res.json({ok:true,success:true,user:safe,token:'vyro-'+Date.now()});
});

app.get('/api/latest-signal',(req,res)=>{
  res.set('Cache-Control','no-store');
  res.json(readJson(SIGNAL_FILE,{}));
});

app.post('/api/signal',(req,res)=>{
  const b=req.body||{};
  const d={
    ok:true,received:true,
    symbol:b.symbol||b.Symbol||'XAUUSD',
    signal:b.signal||b.Signal||b.status||b.Status||'WAIT',
    status:b.status||b.Status||b.signal||b.Signal||'WAIT',
    setup:b.setup||'', price:num(b.price), timeframe:b.timeframe||b.tf||'',
    rsi:num(b.rsi??b.RSI), ema:num(b.ema??b.EMA), flow:num(b.flow??b.FLOW),
    delta:num(b.delta??b.DELTA), power:num(b.power??b.POWER),
    buySell:b.buySell||b.buy_sell||b.ratio||b['BUY/SELL']||'0/0',
    conf:num(b.conf??b.confidence??b.score,55),
    confidence:num(b.confidence??b.conf??b.score,55),
    score:num(b.score??b.confidence??b.conf,55),
    trend:b.trend||'', pressure:b.pressure||'', liquidity:b.liquidity||'',
    risk:b.risk||'', action:b.action||'', supply:b.supply||b.sellZone||b.sell_zone||null,
    demand:b.demand||b.buyZone||b.buy_zone||null, source:b.source||'', reason:b.reason||'',
    raw:b, updatedAt:new Date().toISOString()
  };
  writeJson(SIGNAL_FILE,d);
  res.json({ok:true,received:d});
});

app.post('/api/test-signal',(req,res)=>{
  const d={ok:true,received:true,symbol:'XAUUSD.G',signal:'BUY',status:'BUY',rsi:63.6,flow:1259,delta:1072,power:3520.2,buySell:'9.9/0.6',conf:90,confidence:90,score:90,trend:'Bullish',pressure:'BUY PRESSURE STRONG',liquidity:'Sell-side liquidity / reclaim',risk:'Medium',action:'WAIT CONFIRM',updatedAt:new Date().toISOString()};
  writeJson(SIGNAL_FILE,d);
  res.json({ok:true,received:d});
});

app.use(express.static(__dirname,{etag:false,maxAge:0}));
app.use((req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.listen(PORT,()=>console.log('VYRO PRO MAX V13.8.2 running on '+PORT));
