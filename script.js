
const API_URL = window.location.origin;

async function loadSignal() {
  try {
    const res = await fetch(API_URL + '/api/latest-signal');
    const data = await res.json();

    console.log("SIGNAL DATA:", data);

    // MAIN SIGNAL
    const signalEl = document.querySelector('.main-signal');
    if(signalEl){
      signalEl.innerText = data.signal || 'WAIT';
    }

    // RSI
    const rsiEl = document.querySelector('.rsi-value');
    if(rsiEl){
      rsiEl.innerText = data.rsi ?? '--';
    }

    // FLOW
    const flowEl = document.querySelector('.flow-value');
    if(flowEl){
      flowEl.innerText = data.flow ?? '--';
    }

    // DELTA
    const deltaEl = document.querySelector('.delta-value');
    if(deltaEl){
      deltaEl.innerText = data.delta ?? '--';
    }

    // POWER
    const powerEl = document.querySelector('.power-value');
    if(powerEl){
      powerEl.innerText = data.power ?? '--';
    }

    // BUY SELL
    const bsEl = document.querySelector('.buysell-value');
    if(bsEl){
      bsEl.innerText = data.buySell || '0/0';
    }

    // CONFIDENCE
    const confEl = document.querySelector('.conf-value');
    if(confEl){
      confEl.innerText = (data.conf || 0) + '%';
    }

    // PRESSURE
    const pressureEl = document.querySelector('.pressure-value');
    if(pressureEl){
      pressureEl.innerText = data.raw?.pressure || 'WAIT';
    }

    // LIQUIDITY
    const liqEl = document.querySelector('.liquidity-value');
    if(liqEl){
      liqEl.innerText = data.raw?.liquidity || 'WAIT';
    }

    // UPDATE TIME
    const timeEl = document.querySelector('.update-value');
    if(timeEl){
      timeEl.innerText = new Date().toLocaleTimeString();
    }

    // AI SCORE
    const aiScore = document.querySelector('.ai-score');
    if(aiScore){
      aiScore.innerText = data.conf || 55;
    }

  } catch(err){
    console.error(err);
  }
}

setInterval(loadSignal, 3000);
loadSignal();
