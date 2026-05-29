
/*
========================================
VYRO V24 SESSION ENGINE AI
========================================

FEATURES:
- Asia Accumulation
- London Manipulation
- New York Expansion
- Killzone AI
- Session Bias
*/

(function(){

function put(id,val){
  const el=document.getElementById(id);
  if(el) el.innerText = val;
}

function getSession(){

  const h = new Date().getHours();

  if(h >= 0 && h < 7){
    return "ASIA ACCUMULATION";
  }

  if(h >= 7 && h < 13){
    return "LONDON MANIPULATION";
  }

  if(h >= 13 && h < 22){
    return "NEW YORK EXPANSION";
  }

  return "LOW LIQUIDITY";
}

window.vyroV24SessionEngine = function(data){

  data = data || {};

  const session = getSession();

  put("sessionAI", session);

  let bias = "WAIT";

  const flow = Number(data.flow || 0);
  const delta = Number(data.delta || 0);

  if(flow > 1000 && delta > 200){
    bias = "BUY BIAS";
  }

  if(flow < -1000 && delta < -200){
    bias = "SELL BIAS";
  }

  put("sessionBias", bias);

  let killzone = "OFF";

  const h = new Date().getHours();

  if((h >= 8 && h <= 10) || (h >= 14 && h <= 16)){
    killzone = "ACTIVE";
  }

  put("killzoneAI", killzone);

  console.log("V24 SESSION ENGINE ACTIVE",{
    session,
    bias,
    killzone
  });

};

})();
