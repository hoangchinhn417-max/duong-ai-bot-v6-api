/*
==============================
VYRO V19 CLIENT FLOW FIX
==============================
UPLOAD THIS FILE TO GITHUB
*/

(function(){

const REAL_SOURCES = [
  "MT5_REAL",
  "MT5_EA",
  "VYRO_MT5_BRIDGE",
  "MT5_SMC_EA",
  "VYRO_SMC_EA",
  "VYRO_BRIDGE_REAL"
];

function okSource(s){
  return REAL_SOURCES.includes(
    String(s || "").trim().toUpperCase()
  );
}

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function put(id,val){
  const el = document.getElementById(id);
  if(el) el.innerText = val;
}

let lastSignal = "WAITING";
let lockTime = 0;

window.updateVyroSignal = function(d){

  d = d || {};

  const flowValid =
    okSource(d.source) &&
    d.flowValid === true &&
    num(d.flow) !== null;

  const deltaValid =
    okSource(d.source) &&
    d.deltaValid === true &&
    num(d.delta) !== null;

  if(!flowValid || !deltaValid){

    put("flow","--");
    put("delta","--");

    put("signalText","WAITING FLOW");
    put("mainSignal","WAITING FLOW");

    put("aiScore","--");
    put("conf","--");

    return;
  }

  put("flow", Number(d.flow).toFixed(0));
  put("delta", Number(d.delta).toFixed(0));

  const rsi = num(d.rsi);

  let signal = "SETUP BUILDING";
  let score = "--";
  let conf = "--";

  if(
    d.agentConfirmed === true &&
    rsi !== null &&
    rsi >= 50 &&
    d.flow > 0 &&
    d.delta > 300
  ){
    signal = "BUY NOW";
    score = "85";
    conf = "85%";
  }

  if(
    d.agentConfirmed === true &&
    rsi !== null &&
    rsi <= 50 &&
    d.flow < 0 &&
    d.delta < -300
  ){
    signal = "SELL NOW";
    score = "85";
    conf = "85%";
  }

  if(signal !== lastSignal){

    const now = Date.now();

    if(now - lockTime < 120000){
      signal = lastSignal;
    } else {
      lastSignal = signal;
      lockTime = now;
    }
  }

  put("signalText",signal);
  put("mainSignal",signal);

  put("aiScore",score);
  put("conf",conf);

  console.log("VYRO V19 FLOW FIX ACTIVE");

};

})();
