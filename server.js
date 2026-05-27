
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET = process.env.DUONG_AI_SECRET || "DUONG_AI_SECRET_2026";
const ADMIN_PIN = process.env.ADMIN_PIN || "2606";
const DB_FILE = path.join(__dirname, "users.json");

app.use(cors({
  origin: "*",
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","x-admin-pin"]
}));
app.use(express.json({limit:"2mb"}));

let latestSignal = null;
let history = [];
let clients = [];

function now(){ return new Date().toISOString(); }
function addDays(days){
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 30));
  return d.toISOString().slice(0,10);
}
function safeNum(v, fallback=null){
  if(v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function cleanSignal(v){
  const s = String(v || "WAIT").toUpperCase();
  if(s.includes("SELL")) return "SELL";
  if(s.includes("BUY")) return "BUY";
  return "WAIT";
}
function defaultUsers(){
  return [
    {username:"admin", password:"2606", name:"Master", plan:"vip", status:"active", expire:"2099-12-31", admin:true, createdAt:now()},
    {username:"vip001", password:"123456", name:"VIP Client", plan:"pro", status:"active", expire:"2099-12-31", admin:false, createdAt:now()}
  ];
}
function loadUsers(){
  try{
    if(!fs.existsSync(DB_FILE)){
      const u = defaultUsers();
      fs.writeFileSync(DB_FILE, JSON.stringify(u,null,2));
      return u;
    }
    return JSON.parse(fs.readFileSync(DB_FILE,"utf8"));
  }catch(e){
    return defaultUsers();
  }
}
let users = loadUsers();
function saveUsers(){ fs.writeFileSync(DB_FILE, JSON.stringify(users,null,2)); }
function publicUser(u){
  return {
    username:u.username, name:u.name || u.username, plan:u.plan,
    status:u.status, expire:u.expire, admin:!!u.admin, createdAt:u.createdAt
  };
}
function requireAdmin(req,res,next){
  const pin = req.headers["x-admin-pin"] || req.body.pin || req.query.pin;
  if(pin !== ADMIN_PIN) return res.status(403).json({ok:false,error:"Sai admin PIN"});
  next();
}
function normalizeSignal(body={}){
  const signal = cleanSignal(body.signal || body.side || body.actionSignal);
  const flow = safeNum(body.flow ?? body.cvd ?? body.smartFlow, null);
  const delta = safeNum(body.delta ?? body.powerDelta, null);
  const power = safeNum(body.power ?? body.diff, null);
  const confidence = safeNum(body.confidence ?? body.conf ?? body.score, signal==="WAIT" ? 55 : 80);
  return {
    id: Date.now().toString(),
    ok:true,
    symbol: body.symbol || "XAUUSD",
    signal,
    setup: body.setup || (signal === "WAIT" ? "WAIT" : signal + " READY"),
    price: safeNum(body.price ?? body.bid ?? body.close, null),
    timeframe: body.timeframe || body.tf || "M1",
    score: confidence,
    confidence,
    conf: confidence,
    trend: body.trend || (signal==="BUY" ? "Bullish" : signal==="SELL" ? "Bearish" : "Neutral"),
    pressure: body.pressure || (signal==="BUY" ? "BUY PRESSURE" : signal==="SELL" ? "SELL PRESSURE" : "NEUTRAL"),
    liquidity: body.liquidity || (signal==="BUY" ? "Sell-side liquidity / reclaim" : signal==="SELL" ? "Buy-side liquidity / rejection" : "Mid-range / waiting"),
    risk: body.risk || "Medium",
    action: body.action || "WAIT CONFIRM",
    rsi: safeNum(body.rsi, null),
    ema: safeNum(body.ema, null),
    flow,
    delta,
    power,
    buySell: body.buySell ?? body.buy_sell ?? body.ratio ?? "--",
    source: body.source || "MT5_EA_BRIDGE",
    reason: body.reason || "MT5 Smart Flow " + signal,
    receivedAt: now()
  };
}
function broadcast(signal){
  const data = `data: ${JSON.stringify({type:"signal", payload:signal})}\n\n`;
  clients = clients.filter(res => {
    try{ res.write(data); return true; } catch(e){ return false; }
  });
}

app.get("/", (req,res)=>res.json({
  ok:true,
  name:"DUONG AI V12 AUTH BACKEND PRO",
  users: users.length,
  endpoints:["/health","/auth/register","/auth/login","/admin/users","/admin/user/update","/webhook/tradingview","/api/latest-signal","/events"],
  latestSignal
}));
app.get("/health", (req,res)=>res.json({ok:true,status:"online",time:now(),users:users.length}));

app.post("/auth/register", (req,res)=>{
  const username = String(req.body.username || req.body.phone || "").trim();
  const password = String(req.body.password || "").trim();
  if(!username || !password) return res.status(400).json({ok:false,error:"Thiếu tài khoản hoặc mật khẩu"});
  if(users.find(u => u.username.toLowerCase() === username.toLowerCase())){
    return res.status(409).json({ok:false,error:"Tài khoản đã tồn tại"});
  }
  const user = {
    username,
    password,
    name: req.body.name || username,
    plan: req.body.plan || "pro",
    status:"pending",
    expire:addDays(0),
    admin:false,
    createdAt:now()
  };
  users.push(user);
  saveUsers();
  res.json({ok:true,message:"Đã đăng ký, chờ admin duyệt",user:publicUser(user)});
});

app.post("/auth/login", (req,res)=>{
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "").trim();
  const user = users.find(u => u.username === username && u.password === password);
  if(!user) return res.status(401).json({ok:false,error:"Sai tài khoản hoặc mật khẩu"});
  if(user.status === "pending") return res.status(403).json({ok:false,error:"Tài khoản đang chờ admin duyệt"});
  if(user.status === "expired" || new Date(user.expire+"T23:59:59") < new Date()){
    user.status = "expired";
    saveUsers();
    return res.status(403).json({ok:false,error:"Tài khoản đã hết hạn"});
  }
  res.json({ok:true,user:publicUser(user)});
});

app.get("/admin/users", requireAdmin, (req,res)=>res.json({ok:true,users:users.map(publicUser)}));

app.post("/admin/user/update", requireAdmin, (req,res)=>{
  const username = String(req.body.username || "").trim();
  if(!username) return res.status(400).json({ok:false,error:"Thiếu username"});
  let user = users.find(u => u.username === username);
  if(!user){
    user = {
      username,
      password: req.body.password || "123456",
      name: req.body.name || username,
      plan: req.body.plan || "pro",
      status: req.body.status || "active",
      expire: req.body.expire || addDays(req.body.days || 30),
      admin:false,
      createdAt:now()
    };
    users.push(user);
  }else{
    if(req.body.password) user.password = req.body.password;
    if(req.body.name) user.name = req.body.name;
    if(req.body.plan) user.plan = req.body.plan;
    if(req.body.status) user.status = req.body.status;
    if(req.body.expire) user.expire = req.body.expire;
    else if(req.body.days) user.expire = addDays(req.body.days);
  }
  saveUsers();
  res.json({ok:true,user:publicUser(user)});
});

app.post("/admin/user/delete", requireAdmin, (req,res)=>{
  const username = String(req.body.username || "").trim();
  const before = users.length;
  users = users.filter(u => u.username !== username || u.admin);
  saveUsers();
  res.json({ok:true,deleted:before-users.length});
});

app.post("/webhook/tradingview", (req,res)=>{
  if(req.body.secret && req.body.secret !== SECRET){
    return res.status(401).json({ok:false,error:"Invalid secret"});
  }
  const signal = normalizeSignal(req.body || {});
  latestSignal = signal;
  history.unshift(signal);
  history = history.slice(0,200);
  broadcast(signal);
  res.json({ok:true,received:signal});
});

app.get("/api/latest-signal", (req,res)=>{
  if(!latestSignal){
    return res.json({
      ok:true,symbol:"XAUUSD",signal:"WAIT",price:null,timeframe:"M1",
      score:55,confidence:55,trend:"Neutral",pressure:"NEUTRAL",
      liquidity:"Mid-range / waiting",risk:"Medium",action:"WAIT CONFIRM",
      rsi:null,flow:null,delta:null,power:null,buySell:"--",
      source:"API_IDLE",reason:"Waiting MT5 Smart Flow",receivedAt:now()
    });
  }
  res.json(latestSignal);
});
app.get("/api/history", (req,res)=>res.json({ok:true,count:history.length,history}));

app.get("/events", (req,res)=>{
  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");
  res.flushHeaders?.();
  clients.push(res);
  res.write(`data: ${JSON.stringify({type:"connected",payload:{ok:true,time:now()}})}\n\n`);
  if(latestSignal) res.write(`data: ${JSON.stringify({type:"signal",payload:latestSignal})}\n\n`);
  req.on("close",()=>{ clients = clients.filter(c => c !== res); });
});

app.listen(PORT,()=>console.log("DUONG AI V12 AUTH BACKEND PRO running on "+PORT));
