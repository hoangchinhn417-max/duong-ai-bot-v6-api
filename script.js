
const API_URL = window.location.origin;
const VYRO_VERSION = 'V13.7.4_REALTIME_UI_BIND';

function norm(v, fallback='--') {
  return (v === undefined || v === null || v === '') ? fallback : v;
}
function pick(data, keys, fallback) {
  for (const k of keys) {
    const parts = k.split('.');
    let cur = data;
    for (const p of parts) cur = cur?.[p];
    if (cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return fallback;
}
function getSignal(data) {
  return pick(data, ['signal','status','raw.signal','raw.status'], 'WAIT');
}
function getConf(data) {
  return pick(data, ['conf','confidence','score','raw.confidence','raw.score'], 55);
}
function setText(selector, value) {
  document.querySelectorAll(selector).forEach(el => el.textContent = value);
}
function findCardByLabel(labelText) {
  const label = labelText.toUpperCase();
  const nodes = Array.from(document.querySelectorAll('div,section,article,li'));
  return nodes
    .filter(n => (n.innerText || '').toUpperCase().includes(label))
    .sort((a,b) => (a.innerText || '').length - (b.innerText || '').length)[0];
}
function bindCard(label, value, subValue) {
  setText(`[data-vyro="${label.toLowerCase()}"], .${label.toLowerCase()}-value, #${label.toLowerCase()}Value`, value);
  const card = findCardByLabel(label);
  if (!card) return;
  card.setAttribute('data-bound', 'true');

  let titleEl = Array.from(card.querySelectorAll('*')).find(el => (el.textContent || '').trim().toUpperCase() === label.toUpperCase());
  let all = Array.from(card.querySelectorAll('h1,h2,h3,h4,p,span,div,strong,b'))
    .filter(el => el !== titleEl && !el.querySelector('*') && (el.textContent || '').trim() !== '');

  // Prefer old placeholder values
  let target = all.find(el => ['--','WAIT','55%','Neutral','Mixed','Waiting','0/0'].includes((el.textContent || '').trim()));
  if (!target) target = all[0];

  if (target) target.textContent = value;
  if (subValue) {
    let sub = all.find(el => el !== target && !['RSI','FLOW','DELTA','POWER','BUY/SELL','CONF','XAUUSD'].includes((el.textContent || '').trim().toUpperCase()));
    if (sub) sub.textContent = subValue;
  }
}
function updateBigSignal(signal) {
  setText('.main-signal,#mainSignal,#signal,[data-vyro="signal"]', signal);
  const candidates = Array.from(document.querySelectorAll('h1,h2,h3,div,span,strong'))
    .filter(el => !el.querySelector('*') && ['WAIT','BUY','SELL'].includes((el.textContent || '').trim().toUpperCase()))
    .sort((a,b) => (parseFloat(getComputedStyle(b).fontSize) || 0) - (parseFloat(getComputedStyle(a).fontSize) || 0));
  if (candidates[0]) candidates[0].textContent = signal;
}
function updateStatusText() {
  document.querySelectorAll('div,p,span').forEach(el => {
    const t = (el.textContent || '').trim();
    if (t.includes('API chưa có dữ liệu mới')) el.textContent = 'API đã nhận dữ liệu realtime từ MT5.';
    if (t.includes('Dashboard vẫn sẵn sàng nhận tín hiệu MT5')) el.textContent = 'Dashboard đang đồng bộ realtime từ MT5.';
  });
}
async function loadSignal() {
  try {
    const res = await fetch(API_URL + '/api/latest-signal?t=' + Date.now(), {cache:'no-store'});
    const data = await res.json();
    window.__VYRO_LAST_SIGNAL__ = data;
    console.log('VYRO SIGNAL DATA', data);

    const signal = getSignal(data);
    const rsi = pick(data, ['rsi','raw.rsi'], '--');
    const flow = pick(data, ['flow','raw.flow'], '--');
    const delta = pick(data, ['delta','raw.delta'], '--');
    const power = pick(data, ['power','raw.power'], '--');
    const buySell = pick(data, ['buySell','raw.buySell','raw.ratio'], '0/0');
    const conf = getConf(data);
    const pressure = pick(data, ['pressure','raw.pressure'], signal);
    const liquidity = pick(data, ['liquidity','raw.liquidity'], 'Waiting');
    const trend = pick(data, ['trend','raw.trend'], signal === 'BUY' ? 'Bullish' : signal === 'SELL' ? 'Bearish' : 'Neutral');
    const risk = pick(data, ['risk','raw.risk'], '--');
    const action = pick(data, ['action','raw.action'], '--');

    updateBigSignal(signal);
    bindCard('XAUUSD', data.symbol || data.raw?.symbol || 'XAUUSD', signal);
    bindCard('RSI', norm(rsi), 'Momentum');
    bindCard('FLOW', norm(flow), pressure);
    bindCard('DELTA', norm(delta), 'Attack');
    bindCard('POWER', norm(power), 'Momentum power');
    bindCard('BUY/SELL', norm(buySell, '0/0'), 'Ratio');
    bindCard('CONF', conf + '%', 'Confidence');
    bindCard('LIQUIDITY', liquidity);
    bindCard('PRESSURE', pressure);
    bindCard('TREND AI', trend);
    bindCard('RISK MODE', risk);
    bindCard('ACTION', action);

    setText('.ai-score,#aiScore,[data-vyro="score"]', conf);
    setText('.conf-value,#confValue,[data-vyro="conf"]', conf + '%');
    setText('.update-value,#updateValue,[data-vyro="update"]', new Date().toLocaleTimeString());

    updateStatusText();
  } catch (e) {
    console.error('VYRO loadSignal error', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSignal();
  setInterval(loadSignal, 3000);
  document.querySelectorAll('button,a').forEach(btn => {
    if ((btn.textContent || '').toLowerCase().includes('pull')) btn.addEventListener('click', loadSignal);
  });
});
