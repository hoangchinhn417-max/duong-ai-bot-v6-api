const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({limit:"2mb"}));

let latestSignal = {
  symbol:"XAUUSD",
  signal:"WAIT",
  timeframe:"M1",
  price:null,
  rsi:null,
  flow:null,
  delta:null,
  source:"WAITING_FOR_MT5",
  realtime:false,
  demo:false,
  score:55,
  confidence:55,
  updated:Date.now()
};

const clients = [];

/*
=========================================
VYRO V25 REAL DATA ENGINE SERVER
=========================================
*/

const VYRO_REAL_MT5_SOURCES = [
  "MT5_REAL",
  "MT5_EA",
  "VYRO_MT5_BRIDGE",
  "MT5_SMC_EA",
  "VYRO_SMC_EA",
  "VYRO_BRIDGE_REAL"
];

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isRealSource(source){
  return VYRO_REAL_MT5_SOURCES.includes(
    String(source || "").trim().toUpperCase()
  );
}

function normalizeSymbol(symbol){
  let s = String(symbol || "XAUUSD").toUpperCase();

  s = s.replace(".G","");
  s = s.replace("GOLD","XAUUSD");
  s = s.replace("XAUUSDM","XAUUSD");
  s = s.replace("XAUUSD.","XAUUSD");

  return "XAUUSD";
}

function normalizeSignal(raw){
  raw = raw || {};

  const flow = num(raw.flow);
  const delta = num(raw.delta);
  const rsi = num(raw.rsi);
  const price = num(raw.price);

  return {
    symbol: normalizeSymbol(raw.symbol),
    signal: String(raw.signal || "WAIT").toUpperCase(),
    timeframe: String(raw.timeframe || "M1").toUpperCase(),
    price,
    rsi,
    flow,
    delta,
    structure: raw.structure || "WAITING",
    liquidity: raw.liquidity || "WAITING",
    source: String(raw.source || "UNKNOWN").toUpperCase(),
    realtime: true,
    demo: false,
    flowValid: raw.flowValid === true,
    deltaValid: raw.deltaValid === true,
    agentConfirmed: raw.agentConfirmed === true,
    score: num(raw.score) || num(raw.confidence) || 55,
    confidence: num(raw.confidence) || num(raw.score) || 55,
    updated: Date.now()
  };
}

function calculateAITargets(d){
  d = d || {};

  if(d.signal.includes("BUY")){
    d.tp1 = d.price ? (d.price + 5).toFixed(2) : null;
    d.tp2 = d.price ? (d.price + 10).toFixed(2) : null;
    d.tp3 = d.price ? (d.price + 15).toFixed(2) : null;
  }

  if(d.signal.includes("SELL")){
    d.tp1 = d.price ? (d.price - 5).toFixed(2) : null;
    d.tp2 = d.price ? (d.price - 10).toFixed(2) : null;
    d.tp3 = d.price ? (d.price - 15).toFixed(2) : null;
  }

  return d;
}

function vyroEnforceRealDataLock(d){
  d = d || {};

  const isReal = isRealSource(d.source);

  d.flowValid =
    isReal &&
    d.flowValid === true &&
    d.flow !== null;

  d.deltaValid =
    isReal &&
    d.deltaValid === true &&
    d.delta !== null;

  if(!d.flowValid){
    d.flow = null;
  }

  if(!d.deltaValid){
    d.delta = null;
  }

  if(!d.agentConfirmed){
    if(d.signal === "BUY NOW" || d.signal === "SELL NOW"){
      d.signal = "WAIT";
    }
  }

  return d;
}

function saveSignal(d){
  latestSignal = d;

  const payload = `data: ${JSON.stringify(d)}\n\n`;

  clients.forEach(res => {
    try{
      res.write(payload);
    }catch(e){}
  });
}

function receiveSignal(req,res){

  try{

    const raw = req.body || {};

    let d = normalizeSignal(raw);

    d = calculateAITargets(d);

    d = vyroEnforceRealDataLock(d);

    saveSignal(d);

    res.set("Cache-Control","no-store");

    return res.json({
      ok:true,
      received:d,
      realtime:true,
      demo:false
    });

  }catch(err){

    return res.status(500).json({
      ok:false,
      error:String(err)
    });

  }

}

app.get("/api/latest-signal",(req,res)=>{
  res.json({
    ok:true,
    latest:latestSignal
  });
});

app.get("/api/normalized",(req,res)=>{
  res.json({
    ok:true,
    normalized:latestSignal
  });
});

app.get("/api/stream",(req,res)=>{

  res.writeHead(200,{
    "Content-Type":"text/event-stream",
    "Cache-Control":"no-cache",
    "Connection":"keep-alive"
  });

  clients.push(res);

  res.write(`data: ${JSON.stringify(latestSignal)}\n\n`);

  req.on("close",()=>{
    const i = clients.indexOf(res);
    if(i >= 0) clients.splice(i,1);
  });

});

app.post("/api/signal", receiveSignal);
app.post("/api/mt5/signal", receiveSignal);
app.post("/api/push", receiveSignal);
app.post("/webhook", receiveSignal);

app.post("/api/test-signal",(req,res)=>{
  return res.status(403).json({
    ok:false,
    error:"TEST_SIGNAL_DISABLED"
  });
});

app.get("/api/reset-signal",(req,res)=>{

  latestSignal = {
    symbol:"XAUUSD",
    signal:"WAIT",
    timeframe:"M1",
    price:null,
    rsi:null,
    flow:null,
    delta:null,
    source:"WAITING_FOR_MT5",
    realtime:false,
    demo:false,
    score:55,
    confidence:55,
    updated:Date.now()
  };

  res.json({
    ok:true,
    latest:latestSignal
  });

});

app.use(express.static(__dirname,{
  etag:false,
  maxAge:0
}));

app.use((req,res)=>{
  res.sendFile(path.join(__dirname,"index.html"));
});

app.listen(PORT,()=>{
  console.log("VYRO V25 REAL DATA ENGINE running on " + PORT);
});
