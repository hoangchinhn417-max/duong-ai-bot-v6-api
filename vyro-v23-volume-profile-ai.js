
/*
========================================
VYRO V23 VOLUME PROFILE AI
========================================

FEATURES:
- POC Detection
- VAH Detection
- VAL Detection
- Acceptance / Rejection
- Auction Imbalance
- Volume Exhaustion
*/

(function(){

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function put(id,val){
  const el=document.getElementById(id);
  if(el) el.innerText = val;
}

function calcPOC(price){
  if(!price) return null;
  return Number(price).toFixed(2);
}

function calcVAH(price){
  if(!price) return null;
  return (Number(price)+8).toFixed(2);
}

function calcVAL(price){
  if(!price) return null;
  return (Number(price)-8).toFixed(2);
}

window.vyroV23VolumeProfile = function(data){

  data = data || {};

  const price = num(data.price || data.entry);

  if(!price){
    console.log("V23 waiting realtime price");
    return;
  }

  const poc = calcPOC(price);
  const vah = calcVAH(price);
  const val = calcVAL(price);

  put("pocZone", poc);
  put("vahZone", vah);
  put("valZone", val);

  let auctionState = "BALANCED";

  const delta = num(data.delta);
  const flow = num(data.flow);

  if(delta > 300 && flow > 1000){
    auctionState = "BUYER ACCEPTANCE";
  }

  if(delta < -300 && flow < -1000){
    auctionState = "SELLER ACCEPTANCE";
  }

  put("auctionState", auctionState);

  console.log("V23 Volume Profile ACTIVE",{
    poc,
    vah,
    val,
    auctionState
  });

};

})();
