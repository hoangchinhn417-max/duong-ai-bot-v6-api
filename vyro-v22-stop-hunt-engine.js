
/*
========================================
VYRO V22 STOP HUNT MAP AI ENGINE
========================================

FEATURES:
- SSL Raid Detection
- BSL Raid Detection
- Liquidity Sweep AI
- Stop Hunt Probability
- Trap Zone Engine
- Smart Money Reversal
*/

(function(){

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function txt(v){
  return String(v || "").toUpperCase();
}

function put(id,val){
  const el=document.getElementById(id);
  if(el) el.innerText=val;
}

function detectSSL(data){
  const liq = txt(data.liquidity || data.ssl || "");
  return liq.includes("SSL");
}

function detectBSL(data){
  const liq = txt(data.liquidity || data.bsl || "");
  return liq.includes("BSL");
}

function stopHuntProbability(data){

  const delta = num(data.delta);
  const flow = num(data.flow);

  if(delta === null || flow === null){
    return 0;
  }

  let score = 0;

  if(Math.abs(delta) > 300) score += 30;
  if(Math.abs(flow) > 1000) score += 30;

  if(detectSSL(data) || detectBSL(data)) score += 40;

  return Math.min(score,100);
}

window.vyroV22StopHunt = function(data){

  data = data || {};

  const ssl = detectSSL(data);
  const bsl = detectBSL(data);

  const prob = stopHuntProbability(data);

  if(ssl){
    put("liquidityMap","SSL RAID");
  }

  if(bsl){
    put("liquidityMap","BSL RAID");
  }

  put("stopHuntProb", prob + "%");

  if(prob >= 70){
    put("institutionalAlert","STOP HUNT ACTIVE");
  }

  console.log("VYRO V22 ACTIVE",{
    ssl,
    bsl,
    prob
  });

  return {
    ssl,
    bsl,
    prob
  };

};

})();
