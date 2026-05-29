/*
 VYRO V18.7 FLOW ENGINE FIX
 Drop-in patch for frontend panel.
 Purpose:
 - Stop fake/demo SELL NOW when flow/delta are invalid
 - Keep RSI and SMC object data displaying normally
 - Sync signal/AI score with real SMC + flow confirmation
 - Fix TP direction for BUY/SELL

 How to use:
 1) Copy this file into your frontend folder.
 2) Add before your main script end or import into script.js.
 3) In your render/update function, run:
      const fixed = window.VYRO_FLOW_FIX.normalize(rawData);
      window.VYRO_FLOW_FIX.applyToDOM(fixed);
*/
(function () {
  function isNum(v) {
    return v !== null && v !== undefined && v !== '' && v !== '--' && Number.isFinite(Number(v));
  }

  function pick(obj, keys, fallback = undefined) {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    }
    return fallback;
  }

  function validTimestamp(ts) {
    if (!ts) return false;
    const t = new Date(ts).getTime();
    if (!Number.isFinite(t)) return false;
    return Math.abs(Date.now() - t) < 30000;
  }

  function calcDirection(d) {
    const smcText = String(pick(d, ['structure', 'trendAI', 'trend', 'bosChoch'], '')).toUpperCase();
    const liquidity = String(pick(d, ['liquidity', 'liq'], '')).toUpperCase();
    const fvg = String(pick(d, ['fvgZone', 'fvg', 'fvg_name'], '')).toUpperCase();
    const delta = Number(pick(d, ['delta', 'mt5_delta'], 0));
    const flow = Number(pick(d, ['flow', 'mt5_flow'], 0));

    let sellVotes = 0;
    let buyVotes = 0;

    if (smcText.includes('BOS') && (smcText.includes('SELL') || smcText.includes('BEAR'))) sellVotes++;
    if (smcText.includes('BOS') && (smcText.includes('BUY') || smcText.includes('BULL'))) buyVotes++;
    if (liquidity.includes('SSL') || liquidity.includes('SELL SIDE')) sellVotes++;
    if (liquidity.includes('BSL') || liquidity.includes('BUY SIDE')) buyVotes++;
    if (fvg.includes('SELL')) sellVotes++;
    if (fvg.includes('BUY')) buyVotes++;
    if (isNum(delta) && delta < -300) sellVotes++;
    if (isNum(delta) && delta > 300) buyVotes++;
    if (isNum(flow) && flow < 0) sellVotes++;
    if (isNum(flow) && flow > 0) buyVotes++;

    if (sellVotes >= buyVotes + 2) return 'SELL';
    if (buyVotes >= sellVotes + 2) return 'BUY';
    return 'WAITING';
  }

  function normalize(raw) {
    const d = raw || {};

    const rsi = pick(d, ['rsi', 'RSI'], '--');
    const price = pick(d, ['price', 'xauusd', 'symbolPrice', 'bid'], '--');
    const flowRaw = pick(d, ['flow', 'mt5_flow'], '--');
    const deltaRaw = pick(d, ['delta', 'mt5_delta'], '--');
    const timestamp = pick(d, ['timestamp', 'lastUpdate', 'updatedAt', 'serverTime'], null);

    const flowValid = isNum(flowRaw) && Number(flowRaw) !== 0;
    const deltaValid = isNum(deltaRaw) && Math.abs(Number(deltaRaw)) > 0;
    const live = d.live === true || d.connected === true || validTimestamp(timestamp);

    const smc = {
      liquidity: pick(d, ['liquidity', 'liq'], '--'),
      stopHunt: pick(d, ['stopHunt', 'stop_hunt'], '--'),
      sellZone: pick(d, ['sellZone', 'supply', 'supplyZone'], '--'),
      buyZone: pick(d, ['buyZone', 'demand', 'demandZone'], '--'),
      fvgZone: pick(d, ['fvgZone', 'fvg', 'fvg_name'], '--'),
      mitigation: pick(d, ['mitigation'], '--'),
      structure: pick(d, ['structure', 'trendAI', 'trend', 'bosChoch'], '--')
    };

    const hasSmc = Object.values(smc).some(v => v && v !== '--' && String(v).toLowerCase() !== 'waiting');
    const direction = calcDirection({ ...d, ...smc, flow: flowRaw, delta: deltaRaw });

    let signal = 'WAITING';
    let aiScore = '--';
    let confidence = '--';
    let power = '--';
    let buySell = '--';

    if (live && hasSmc && flowValid && deltaValid && direction !== 'WAITING') {
      const absDelta = Math.min(Math.abs(Number(deltaRaw)), 2500);
      const score = Math.round(55 + (absDelta / 2500) * 25 + (hasSmc ? 10 : 0));
      aiScore = Math.min(score, 95);
      confidence = aiScore + '%';
      power = Math.abs(Number(deltaRaw)) > 800 ? 'STRONG' : 'MEDIUM';
      buySell = direction === 'SELL' ? 'SELL DOMINANT' : 'BUY DOMINANT';
      signal = aiScore >= 80 ? direction + ' NOW' : direction + ' BIAS';
    }

    return {
      live,
      price,
      rsi,
      flow: live && flowValid ? flowRaw : '--',
      delta: live && deltaValid ? deltaRaw : '--',
      aiScore,
      confidence,
      power,
      buySell,
      signal,
      direction,
      lastUpdate: timestamp || new Date().toLocaleTimeString(),
      statusText: live ? 'live' : 'waiting',
      smc,
      tp: fixTP(d, direction, price)
    };
  }

  function fixTP(d, direction, price) {
    const entry = isNum(price) ? Number(price) : Number(pick(d, ['entry', 'entryPrice'], NaN));
    if (!Number.isFinite(entry)) return { tp1: '--', tp2: '--', tp3: '--' };
    const risk = Number(pick(d, ['riskDistance', 'slDistance'], 5));
    if (direction === 'SELL') {
      return { tp1: +(entry - risk).toFixed(2), tp2: +(entry - risk * 2).toFixed(2), tp3: +(entry - risk * 3).toFixed(2) };
    }
    if (direction === 'BUY') {
      return { tp1: +(entry + risk).toFixed(2), tp2: +(entry + risk * 2).toFixed(2), tp3: +(entry + risk * 3).toFixed(2) };
    }
    return { tp1: '--', tp2: '--', tp3: '--' };
  }

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  }

  function applyToDOM(d) {
    setText('[data-vyro="signal"]', d.signal);
    setText('[data-vyro="price"]', d.price);
    setText('[data-vyro="rsi"]', d.rsi);
    setText('[data-vyro="flow"]', d.flow);
    setText('[data-vyro="delta"]', d.delta);
    setText('[data-vyro="power"]', d.power);
    setText('[data-vyro="buySell"]', d.buySell);
    setText('[data-vyro="aiScore"]', d.aiScore);
    setText('[data-vyro="confidence"]', d.confidence);
    setText('[data-vyro="lastUpdate"]', d.lastUpdate);
    setText('[data-vyro="status"]', d.statusText);
    setText('[data-vyro="tp1"]', d.tp.tp1);
    setText('[data-vyro="tp2"]', d.tp.tp2);
    setText('[data-vyro="tp3"]', d.tp.tp3);
  }

  window.VYRO_FLOW_FIX = { normalize, applyToDOM, fixTP };
})();
