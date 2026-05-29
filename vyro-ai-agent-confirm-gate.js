
/*
 VYRO V18.8 - AI AGENT CONFIRMATION GATE
 Chỉ hiện BUY NOW / SELL NOW khi AI Agent xác nhận đủ điều kiện.
 Nếu thiếu dữ liệu thật hoặc chưa đủ xác nhận: WAITING / BUY BIAS / SELL BIAS / SETUP BUILDING.
*/

(function () {
  function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
  }

  function isNumber(v) {
    return typeof v === "number" && !Number.isNaN(v);
  }

  function normalizeDirection(v) {
    return String(v || "").trim().toUpperCase();
  }

  window.VYRO_AI_AGENT_GATE_VERSION = "18.8";

  window.vyroAiAgentConfirm = function (raw) {
    const d = raw || {};

    const rsiValid = isNumber(d.rsi);
    const flowValid = isNumber(d.flow);
    const deltaValid = isNumber(d.delta);

    const direction = normalizeDirection(d.direction || d.bias || d.signal);
    const structure = String(d.structure || d.trendAI || "").toUpperCase();
    const liquidity = String(d.liquidity || "").toUpperCase();
    const stopHunt = String(d.stopHunt || d.stop_hunt || "").toUpperCase();
    const riskMode = String(d.riskMode || d.risk || "").toUpperCase();
    const phase = String(d.phase || d.marketPhase || "").toUpperCase();

    const hasLiveData = d.live === true || d.apiStatus === "ONLINE" || d.connected === true;

    const smcReady =
      structure.includes("BOS") ||
      structure.includes("CHOCH") ||
      d.sellZoneValid === true ||
      d.buyZoneValid === true ||
      d.fvgValid === true ||
      d.obValid === true;

    const noTrade =
      !hasLiveData ||
      !rsiValid ||
      !flowValid ||
      !deltaValid ||
      riskMode.includes("HIGH") ||
      phase.includes("CHOP") ||
      phase.includes("MID");

    if (noTrade) {
      return {
        signal: "WAITING",
        aiScore: "--",
        confidence: "--",
        agentConfirmed: false,
        reason: "Waiting AI Agent confirmation"
      };
    }

    const sellConfirmed =
      d.agentConfirmed === true &&
      (direction === "SELL" || direction === "SHORT") &&
      d.rsi <= 50 &&
      d.flow < 0 &&
      d.delta < -300 &&
      smcReady &&
      !riskMode.includes("HIGH");

    const buyConfirmed =
      d.agentConfirmed === true &&
      (direction === "BUY" || direction === "LONG") &&
      d.rsi >= 50 &&
      d.flow > 0 &&
      d.delta > 300 &&
      smcReady &&
      !riskMode.includes("HIGH");

    if (sellConfirmed) {
      return {
        signal: "SELL NOW",
        aiScore: d.aiScore || 85,
        confidence: (d.confidence || 85) + "%",
        agentConfirmed: true,
        reason: "AI Agent confirmed SELL"
      };
    }

    if (buyConfirmed) {
      return {
        signal: "BUY NOW",
        aiScore: d.aiScore || 85,
        confidence: (d.confidence || 85) + "%",
        agentConfirmed: true,
        reason: "AI Agent confirmed BUY"
      };
    }

    if (d.flow < 0 && d.delta < 0) {
      return {
        signal: "SELL BIAS",
        aiScore: "--",
        confidence: "--",
        agentConfirmed: false,
        reason: "Bearish bias only, not confirmed"
      };
    }

    if (d.flow > 0 && d.delta > 0) {
      return {
        signal: "BUY BIAS",
        aiScore: "--",
        confidence: "--",
        agentConfirmed: false,
        reason: "Bullish bias only, not confirmed"
      };
    }

    return {
      signal: "SETUP BUILDING",
      aiScore: "--",
      confidence: "--",
      agentConfirmed: false,
      reason: "Setup building"
    };
  };

  window.updateVyroSignal = function (data) {
    const result = window.vyroAiAgentConfirm(data || {});

    text("signalText", result.signal);
    text("mainSignal", result.signal);
    text("signalTitle", result.signal);
    text("aiScore", result.aiScore);
    text("conf", result.confidence);
    text("confidence", result.confidence);
    text("agentStatus", result.agentConfirmed ? "CONFIRMED" : "WAITING");
    text("agentReason", result.reason);

    document.body.dataset.vyroAgentSignal = result.signal;
    console.log("VYRO V18.8 AI AGENT GATE ACTIVE:", result);

    return result;
  };

  window.vyroFixTpByDirection = function (data) {
    const d = data || {};
    const entry = Number(d.entry || d.price || d.xauusd);
    if (!Number.isFinite(entry)) return d;

    const direction = normalizeDirection(d.direction || d.signal || d.bias);

    if (direction === "SELL" || direction === "SHORT") {
      d.tp1 = entry - Math.abs(Number(d.rr1 || 10));
      d.tp2 = entry - Math.abs(Number(d.rr2 || 20));
      d.tp3 = entry - Math.abs(Number(d.rr3 || 30));
    }

    if (direction === "BUY" || direction === "LONG") {
      d.tp1 = entry + Math.abs(Number(d.rr1 || 10));
      d.tp2 = entry + Math.abs(Number(d.rr2 || 20));
      d.tp3 = entry + Math.abs(Number(d.rr3 || 30));
    }

    return d;
  };
})();
