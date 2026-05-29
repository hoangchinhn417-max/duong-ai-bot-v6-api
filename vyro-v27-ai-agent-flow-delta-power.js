
/*
====================================================
VYRO V27 AI AGENT FLOW DELTA POWER CONFIRM ENGINE
====================================================

Purpose:
- Decide BUY NOW / SELL NOW only from real MT5 data:
  FLOW + DELTA + POWER + RSI
- Prevent spam signal
- Require repeated confirmations
- Downgrade weak signals to WAIT
*/

(function(){

const VYRO_AI_AGENT = {
  version: "27.0",
  lastSignal: "WAIT",
  confirmSide: "WAIT",
  confirmCount: 0,
  lastFireTime: 0,
  cooldownMs: 60000,

  // Thresholds can be tuned
  minPower: 55,
  strongPower: 70,
  minFlow: 300,
  strongFlow: 800,
  minDelta: 30,
  strongDelta: 80,
  confirmBars: 2,
  rsiBuyMax: 72,
  rsiSellMin: 28
};

function el(id){ return document.getElementById(id); }

function num(v){
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g,""));
  return Number.isFinite(n) ? n : null;
}

function put(id,val){
  const node = el(id);
  if(node) node.innerText = val;
}

function getLatestValue(data, keys){
  for(const k of keys){
    if(data && data[k] !== undefined && data[k] !== null) return data[k];
  }
  return null;
}

function classifyRaw(data){
  const flow = num(getLatestValue(data, ["flow","FLOW"]));
  const delta = num(getLatestValue(data, ["delta","DELTA"]));
  const power = num(getLatestValue(data, ["power","momentumPower","POWER"]));
  const rsi = num(getLatestValue(data, ["rsi","RSI"]));

  let side = "WAIT";
  let reason = [];
  let score = 50;

  if(flow === null || delta === null || power === null){
    return {
      side:"WAIT",
      score:50,
      action:"WAIT",
      reason:"WAITING REAL MT5 FLOW/DELTA/POWER",
      flow,delta,power,rsi
    };
  }

  // BUY condition
  const buyCore =
    flow >= VYRO_AI_AGENT.minFlow &&
    delta >= VYRO_AI_AGENT.minDelta &&
    power >= VYRO_AI_AGENT.minPower &&
    (rsi === null || rsi <= VYRO_AI_AGENT.rsiBuyMax);

  // SELL condition
  const sellCore =
    flow <= -VYRO_AI_AGENT.minFlow &&
    delta <= -VYRO_AI_AGENT.minDelta &&
    power >= VYRO_AI_AGENT.minPower &&
    (rsi === null || rsi >= VYRO_AI_AGENT.rsiSellMin);

  if(buyCore){
    side = "BUY";
    score = 60;
    reason.push("FLOW BUY");
    reason.push("DELTA BUY");
    reason.push("POWER OK");

    if(flow >= VYRO_AI_AGENT.strongFlow) score += 10;
    if(delta >= VYRO_AI_AGENT.strongDelta) score += 10;
    if(power >= VYRO_AI_AGENT.strongPower) score += 10;
    if(rsi !== null && rsi >= 50 && rsi <= 68) score += 5;
  }

  if(sellCore){
    side = "SELL";
    score = 60;
    reason.push("FLOW SELL");
    reason.push("DELTA SELL");
    reason.push("POWER OK");

    if(flow <= -VYRO_AI_AGENT.strongFlow) score += 10;
    if(delta <= -VYRO_AI_AGENT.strongDelta) score += 10;
    if(power >= VYRO_AI_AGENT.strongPower) score += 10;
    if(rsi !== null && rsi <= 50 && rsi >= 32) score += 5;
  }

  if(side === "WAIT"){
    if(Math.sign(flow) !== Math.sign(delta)){
      reason.push("FLOW DELTA CONFLICT");
    }else if(power < VYRO_AI_AGENT.minPower){
      reason.push("POWER WEAK");
    }else{
      reason.push("NO CONFIRM");
    }
  }

  return {
    side,
    score:Math.min(95,score),
    action:side,
    reason:reason.join(" + "),
    flow,delta,power,rsi
  };
}

function confirmSignal(rawDecision){
  const now = Date.now();

  if(rawDecision.side === "WAIT"){
    VYRO_AI_AGENT.confirmSide = "WAIT";
    VYRO_AI_AGENT.confirmCount = 0;
    return {
      finalSignal:"WAIT",
      confirmed:false,
      reason:rawDecision.reason || "WAIT"
    };
  }

  if(rawDecision.side === VYRO_AI_AGENT.confirmSide){
    VYRO_AI_AGENT.confirmCount++;
  }else{
    VYRO_AI_AGENT.confirmSide = rawDecision.side;
    VYRO_AI_AGENT.confirmCount = 1;
  }

  if(VYRO_AI_AGENT.confirmCount < VYRO_AI_AGENT.confirmBars){
    return {
      finalSignal:"WAIT",
      confirmed:false,
      reason:`WAIT CONFIRM ${VYRO_AI_AGENT.confirmCount}/${VYRO_AI_AGENT.confirmBars}`
    };
  }

  if(now - VYRO_AI_AGENT.lastFireTime < VYRO_AI_AGENT.cooldownMs){
    return {
      finalSignal:"WAIT",
      confirmed:false,
      reason:"COOLDOWN PROTECTION"
    };
  }

  VYRO_AI_AGENT.lastFireTime = now;

  return {
    finalSignal: rawDecision.side === "BUY" ? "BUY NOW" : "SELL NOW",
    confirmed:true,
    reason:rawDecision.reason
  };
}

function paintSignal(finalSignal){
  const title = el("signalText") || el("mainSignal") || el("signalTitle");
  if(title){
    title.innerText = finalSignal;
    title.classList.remove("vyro-agent-buy","vyro-agent-sell","vyro-agent-wait");
    if(finalSignal.includes("BUY")) title.classList.add("vyro-agent-buy");
    else if(finalSignal.includes("SELL")) title.classList.add("vyro-agent-sell");
    else title.classList.add("vyro-agent-wait");
  }

  document.body.classList.remove("vyro-agent-buy-body","vyro-agent-sell-body");
  if(finalSignal.includes("BUY")) document.body.classList.add("vyro-agent-buy-body");
  if(finalSignal.includes("SELL")) document.body.classList.add("vyro-agent-sell-body");
}

function updateUI(data, rawDecision, finalDecision){
  const finalSignal = finalDecision.finalSignal;

  put("agentDecision", finalSignal);
  put("agentReason", finalDecision.reason);
  put("agentConfirm", finalDecision.confirmed ? "CONFIRMED" : "WAITING");
  put("agentScore", rawDecision.score + "%");

  // update main visible fields if ids exist
  put("action", finalSignal === "WAIT" ? "WAIT CONFIRM" : finalSignal);
  put("pressure",
    rawDecision.side === "BUY" ? "BUYER DOMINANT" :
    rawDecision.side === "SELL" ? "SELLER DOMINANT" :
    "WAITING"
  );

  put("dominance",
    rawDecision.side === "BUY" ? "Buyer Dominant" :
    rawDecision.side === "SELL" ? "Seller Dominant" :
    "Mixed"
  );

  put("conf", rawDecision.score + "%");

  paintSignal(finalSignal);
}

window.vyroV27AIAgentDecision = function(data){
  data = data || {};

  const raw = classifyRaw(data);
  const finalDecision = confirmSignal(raw);

  const output = {
    ...data,
    signal: finalDecision.finalSignal,
    status: finalDecision.finalSignal,
    agentConfirmed: finalDecision.confirmed,
    agentDecision: finalDecision.finalSignal,
    agentReason: finalDecision.reason,
    agentScore: raw.score,
    aiSide: raw.side
  };

  updateUI(output, raw, finalDecision);

  console.log("VYRO V27 AI AGENT DECISION", {
    raw,
    finalDecision,
    output
  });

  return output;
};

async function pull(){
  try{
    const r = await fetch("/api/normalized?v="+Date.now(), {cache:"no-store"});
    if(!r.ok) return;
    const j = await r.json();
    const d = j.normalized || j.latest || j;
    window.vyroV27AIAgentDecision(d);
  }catch(e){}
}

function stream(){
  try{
    const es = new EventSource("/api/stream?v=27");
    es.addEventListener("signal", e=>{
      try{
        window.vyroV27AIAgentDecision(JSON.parse(e.data));
      }catch(_){}
    });
    es.onmessage = e=>{
      try{
        const x = JSON.parse(e.data);
        window.vyroV27AIAgentDecision(x.payload || x);
      }catch(_){}
    };
  }catch(e){}
}

function injectStyle(){
  if(document.getElementById("vyro-v27-agent-style")) return;
  const style = document.createElement("style");
  style.id = "vyro-v27-agent-style";
  style.innerHTML = `
  .vyro-agent-buy{
    color:#26ffd7!important;
    text-shadow:0 0 28px rgba(38,255,215,.85)!important;
    animation:vyroAgentBuy 1s ease infinite alternate;
  }
  .vyro-agent-sell{
    color:#ff4777!important;
    text-shadow:0 0 28px rgba(255,71,119,.85)!important;
    animation:vyroAgentSell 1s ease infinite alternate;
  }
  .vyro-agent-wait{
    color:#f1f5ff!important;
  }
  body.vyro-agent-buy-body::before,
  body.vyro-agent-sell-body::before{
    content:"";
    position:fixed;
    inset:0;
    pointer-events:none;
    z-index:9999;
    opacity:.12;
  }
  body.vyro-agent-buy-body::before{
    background:radial-gradient(circle at top, rgba(0,255,180,.9), transparent 45%);
  }
  body.vyro-agent-sell-body::before{
    background:radial-gradient(circle at top, rgba(255,40,90,.9), transparent 45%);
  }
  @keyframes vyroAgentBuy{
    from{transform:scale(1)}
    to{transform:scale(1.015)}
  }
  @keyframes vyroAgentSell{
    from{transform:scale(1)}
    to{transform:scale(1.015)}
  }
  `;
  document.head.appendChild(style);
}

function init(){
  injectStyle();
  stream();
  pull();
  setInterval(pull, 3000);
  console.log("VYRO V27 AI AGENT FLOW DELTA POWER READY");
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
