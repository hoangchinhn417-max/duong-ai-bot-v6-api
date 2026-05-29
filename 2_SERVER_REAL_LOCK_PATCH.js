/*
===========================
VYRO V19 SERVER REAL LOCK
===========================
COPY THIS FILE CONTENT INTO server.js
*/

const VYRO_REAL_MT5_SOURCES = [
  "MT5_REAL",
  "MT5_EA",
  "VYRO_MT5_BRIDGE",
  "MT5_SMC_EA",
  "VYRO_SMC_EA",
  "VYRO_BRIDGE_REAL"
];

function vyroNum(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function vyroIsRealMT5Source(source){
  return VYRO_REAL_MT5_SOURCES.includes(
    String(source || "").trim().toUpperCase()
  );
}

function vyroEnforceRealDataLock(d, raw){
  d = d || {};
  raw = raw || {};

  const source = String(d.source || raw.source || "").trim().toUpperCase();
  const isReal = vyroIsRealMT5Source(source);

  const flow = vyroNum(d.flow ?? raw.flow);
  const delta = vyroNum(d.delta ?? raw.delta);

  const flowValid =
    isReal &&
    (d.flowValid === true || raw.flowValid === true) &&
    flow !== null;

  const deltaValid =
    isReal &&
    (d.deltaValid === true || raw.deltaValid === true) &&
    delta !== null;

  d.flowValid = flowValid;
  d.deltaValid = deltaValid;

  if(!flowValid){
    d.flow = null;
  } else {
    d.flow = flow;
  }

  if(!deltaValid){
    d.delta = null;
  } else {
    d.delta = delta;
  }

  if(!flowValid || !deltaValid){
    d.signal = "WAIT";
    d.status = "WAITING FLOW";
    d.score = null;
    d.confidence = null;
    d.conf = null;
    d.aiScore = null;
    d.buySell = "--";
    d.power = null;
    d.agentConfirmed = false;
  }

  return d;
}

/*
ADD THIS UNDER:
d=calculateAITargets(d, raw);

ADD:
d=vyroEnforceRealDataLock(d, raw);
*/

/*
DISABLE TEST SIGNAL:
*/
app.post('/api/test-signal',(req,res)=>{
  return res.status(403).json({
    ok:false,
    error:'TEST_SIGNAL_DISABLED'
  });
});
