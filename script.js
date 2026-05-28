
const API_URL = window.location.origin;

function norm(v, fallback='--') {
  return (v === undefined || v === null || v === '') ? fallback : v;
}

function getSignal(data) {
  return data.signal || data.status || data.raw?.signal || data.raw?.status || 'WAIT';
}

function getConf(data) {
  return data.conf ?? data.confidence ?? data.raw?.confidence ?? data.raw?.score ?? 55;
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach(el => {
    el.textContent = value;
  });
}

function setByCardTitle(title, value, subValue) {
  const cards = document.querySelectorAll('div, section, article');
  const titleUpper = title.toUpperCase();

  for (const card of cards) {
    const txt = (card.innerText || '').toUpperCase();
    if (!txt.includes(titleUpper)) continue;

    const children = Array.from(card.querySelectorAll('*'));
    let label = children.find(x => (x.innerText || '').trim().toUpperCase() === titleUpper);
    if (!label) continue;

    let parent = label.closest('div') || card;
    let targets = Array.from(parent.querySelectorAll('div, span, h1, h2, h3, p, strong, b'))
      .filter(x => x !== label && (x.innerText || '').trim() !== '');

    if (targets.length) {
      targets[0].textContent = value;
      if (subValue && targets[1]) targets[1].textContent = subValue;
      return true;
    }
  }
  return false;
}

function updateMainSignal(signal) {
  setText('.main-signal, #mainSignal, #signal, [data-signal]', signal);

  const bigTitles = Array.from(document.querySelectorAll('h1, h2, .signal, .status, .title, div, span'))
    .filter(el => {
      const t = (el.innerText || '').trim();
      return ['WAIT','BUY','SELL'].includes(t);
    });

  if (bigTitles.length) bigTitles[0].textContent = signal;
}

async function loadSignal() {
  try {
    const res = await fetch(API_URL + '/api/latest-signal?t=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    console.log('VYRO SIGNAL DATA:', data);

    const signal = getSignal(data);
    const conf = getConf(data);
    const rsi = data.rsi ?? data.raw?.rsi;
    const flow = data.flow ?? data.raw?.flow;
    const delta = data.delta ?? data.raw?.delta;
    const power = data.power ?? data.raw?.power;
    const buySell = data.buySell ?? data.raw?.buySell ?? data.raw?.['buy/sell'] ?? data.raw?.ratio;
    const pressure = data.raw?.pressure ?? data.pressure ?? signal;
    const liquidity = data.raw?.liquidity ?? data.liquidity ?? 'Waiting';

    updateMainSignal(signal);

    setText('.rsi-value, #rsiValue, [data-rsi]', norm(rsi));
    setText('.flow-value, #flowValue, [data-flow]', norm(flow));
    setText('.delta-value, #deltaValue, [data-delta]', norm(delta));
    setText('.power-value, #powerValue, [data-power]', norm(power));
    setText('.buysell-value, #buySellValue, [data-buysell]', norm(buySell, '0/0'));
    setText('.conf-value, #confValue, [data-conf]', conf + '%');
    setText('.ai-score, #aiScore, [data-score]', conf);
    setText('.pressure-value, #pressureValue, [data-pressure]', pressure);
    setText('.liquidity-value, #liquidityValue, [data-liquidity]', liquidity);
    setText('.update-value, #updateValue, [data-update]', new Date().toLocaleTimeString());

    // Fallback theo tiêu đề card nếu HTML không có class/id chuẩn
    setByCardTitle('RSI', norm(rsi), 'Momentum');
    setByCardTitle('FLOW', norm(flow), pressure);
    setByCardTitle('DELTA', norm(delta), 'Attack');
    setByCardTitle('POWER', norm(power), 'Momentum power');
    setByCardTitle('BUY/SELL', norm(buySell, '0/0'), 'Ratio');
    setByCardTitle('CONF', conf + '%', 'Confidence');
    setByCardTitle('LIQUIDITY', liquidity);
    setByCardTitle('PRESSURE', pressure);

    const statusText = document.querySelectorAll('div, span, p');
    statusText.forEach(el => {
      const t = (el.innerText || '').trim();
      if (t.includes('API chưa có dữ liệu mới')) {
        el.textContent = 'API đã nhận dữ liệu realtime từ MT5.';
      }
    });

  } catch (err) {
    console.error('VYRO load signal error:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSignal();
  setInterval(loadSignal, 3000);

  document.querySelectorAll('button').forEach(btn => {
    if ((btn.innerText || '').toLowerCase().includes('pull')) {
      btn.addEventListener('click', loadSignal);
    }
  });
});
