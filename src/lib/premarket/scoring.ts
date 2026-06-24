/**
 * Bias score engine for pre-market checklist.
 * Pure functions — no side effects, no fetching.
 */

import type { FuturesSnapshot, InternalsSnapshot, ChecklistItem } from "./types";
import type { PostureResult } from "@/lib/sector-rotation/brief";
import type { MacroRegimeData } from "@/lib/sector-rotation/regime";

interface BiasResult {
  score: number;
  label: string;
  checklist: ChecklistItem[];
}

function biasLabel(score: number): string {
  if (score >= 6) return "Strong Bull";
  if (score >= 2) return "Lean Bull";
  if (score >= -1) return "Neutral";
  if (score >= -5) return "Lean Bear";
  return "Strong Bear";
}

export function computeBiasScore(
  futures: FuturesSnapshot[],
  internals: InternalsSnapshot,
  posture: PostureResult,
  regime: MacroRegimeData | null,
): BiasResult {
  let score = 0;
  const checklist: ChecklistItem[] = [];

  // ── Macro: Posture ──
  const posturePoints: Record<string, number> = {
    AGGRESSIVE: 3,
    SELECTIVE: 1,
    DEFENSIVE: -2,
    CASH: -4,
  };
  const postureScore = posturePoints[posture.posture] ?? 0;
  score += postureScore;
  checklist.push({
    id: "posture",
    category: "macro",
    label: `Posture: ${posture.posture}`,
    status: postureScore > 0 ? "bullish" : postureScore < 0 ? "bearish" : "neutral",
    detail: posture.reasoning,
    autoChecked: postureScore > 0,
  });

  // ── Macro: Regime ──
  if (regime) {
    const regimePoints: Record<string, number> = {
      RISK_ON: 2,
      RISK_OFF: -2,
      INFLATIONARY: -1,
      MIXED: 0,
    };
    const regimeScore = regimePoints[regime.regime] ?? 0;
    score += regimeScore;
    checklist.push({
      id: "regime",
      category: "macro",
      label: `Regime: ${regime.regime}`,
      status: regimeScore > 0 ? "bullish" : regimeScore < 0 ? "bearish" : "neutral",
      detail: `VIX ${regime.vix.toFixed(1)} (${regime.vixSlope}), 10Y ${regime.yield10y.toFixed(2)}%, DXY ${regime.dxy.toFixed(1)} (${regime.dxyTrend})`,
      autoChecked: regimeScore > 0,
    });

    // ── Macro: VIX ──
    let vixScore = 0;
    let vixStatus: "bullish" | "bearish" | "neutral" = "neutral";
    if (regime.vix < 15) {
      vixScore = 1;
      vixStatus = "bullish";
    } else if (regime.vix > 30) {
      vixScore = -2;
      vixStatus = "bearish";
    } else if (regime.vix > 25) {
      vixScore = -1;
      vixStatus = "bearish";
    }
    score += vixScore;
    checklist.push({
      id: "vix",
      category: "macro",
      label: `VIX: ${regime.vix.toFixed(1)}`,
      status: vixStatus,
      detail: regime.vix < 15 ? "Low volatility — risk-on environment" :
        regime.vix > 30 ? "Elevated VIX — high fear" :
          regime.vix > 25 ? "Above-average volatility" :
            "Moderate volatility",
      autoChecked: vixScore > 0,
    });
  } else {
    checklist.push({
      id: "regime",
      category: "macro",
      label: "Regime: unavailable",
      status: "neutral",
      detail: "Could not fetch macro regime data",
      autoChecked: false,
    });
  }

  // ── Futures ──
  const es = futures.find((f) => f.symbol === "ES=F");
  const nq = futures.find((f) => f.symbol === "NQ=F");
  const rty = futures.find((f) => f.symbol === "RTY=F");

  if (es) {
    const esScore = es.changePct > 0.3 ? 1 : es.changePct < -0.3 ? -1 : 0;
    score += esScore;
    checklist.push({
      id: "es",
      category: "futures",
      label: `ES: ${es.changePct >= 0 ? "+" : ""}${es.changePct.toFixed(2)}%`,
      status: esScore > 0 ? "bullish" : esScore < 0 ? "bearish" : "neutral",
      detail: `${es.name} at ${es.price.toFixed(2)} (${es.change >= 0 ? "+" : ""}${es.change.toFixed(2)})`,
      autoChecked: esScore > 0,
    });
  }

  if (nq) {
    const nqScore = nq.changePct > 0.4 ? 1 : nq.changePct < -0.4 ? -1 : 0;
    score += nqScore;
    checklist.push({
      id: "nq",
      category: "futures",
      label: `NQ: ${nq.changePct >= 0 ? "+" : ""}${nq.changePct.toFixed(2)}%`,
      status: nqScore > 0 ? "bullish" : nqScore < 0 ? "bearish" : "neutral",
      detail: `${nq.name} at ${nq.price.toFixed(2)} (${nq.change >= 0 ? "+" : ""}${nq.change.toFixed(2)})`,
      autoChecked: nqScore > 0,
    });
  }

  if (rty) {
    const rtyScore = rty.changePct > 0.3 ? 1 : rty.changePct < -0.3 ? -1 : 0;
    score += rtyScore;
    checklist.push({
      id: "rty",
      category: "futures",
      label: `RTY: ${rty.changePct >= 0 ? "+" : ""}${rty.changePct.toFixed(2)}%`,
      status: rtyScore > 0 ? "bullish" : rtyScore < 0 ? "bearish" : "neutral",
      detail: `${rty.name} at ${rty.price.toFixed(2)} (${rty.change >= 0 ? "+" : ""}${rty.change.toFixed(2)})`,
      autoChecked: rtyScore > 0,
    });
  }

  // ── Commodities ──
  const cl = futures.find((f) => f.symbol === "CL=F");
  const gc = futures.find((f) => f.symbol === "GC=F");

  if (cl) {
    // Rising oil is inflationary headwind; falling oil is deflationary tailwind
    const clScore = cl.changePct < -1.0 ? 1 : cl.changePct > 1.0 ? -1 : 0;
    score += clScore;
    checklist.push({
      id: "cl",
      category: "futures",
      label: `CL: ${cl.changePct >= 0 ? "+" : ""}${cl.changePct.toFixed(2)}%`,
      status: clScore > 0 ? "bullish" : clScore < 0 ? "bearish" : "neutral",
      detail: clScore > 0 ? "Falling oil — deflationary tailwind for equities" :
        clScore < 0 ? "Rising oil — inflationary headwind for equities" :
          `Crude Oil at $${cl.price.toFixed(2)}`,
      autoChecked: clScore > 0,
    });
  }

  if (gc) {
    // Rising gold signals risk-off / flight to safety
    const gcScore = gc.changePct > 1.0 ? -1 : gc.changePct < -0.5 ? 1 : 0;
    score += gcScore;
    checklist.push({
      id: "gc",
      category: "futures",
      label: `GC: ${gc.changePct >= 0 ? "+" : ""}${gc.changePct.toFixed(2)}%`,
      status: gcScore > 0 ? "bullish" : gcScore < 0 ? "bearish" : "neutral",
      detail: gcScore < 0 ? "Gold surging — flight to safety / risk-off signal" :
        gcScore > 0 ? "Gold falling — risk appetite improving" :
          `Gold at $${gc.price.toFixed(2)}`,
      autoChecked: gcScore > 0,
    });
  }

  // ── Internals ──
  if (internals.tick != null) {
    const tickScore = internals.tick > 500 ? 1 : internals.tick < -500 ? -1 : 0;
    score += tickScore;
    checklist.push({
      id: "tick",
      category: "internals",
      label: `TICK: ${internals.tick > 0 ? "+" : ""}${Math.round(internals.tick)}`,
      status: tickScore > 0 ? "bullish" : tickScore < 0 ? "bearish" : "neutral",
      detail: internals.tick > 500 ? "Strong buying pressure" :
        internals.tick < -500 ? "Strong selling pressure" :
          "Neutral tick reading",
      autoChecked: tickScore > 0,
    });
  }

  if (internals.trin != null) {
    const trinScore = internals.trin < 0.8 ? 1 : internals.trin > 1.2 ? -1 : 0;
    score += trinScore;
    checklist.push({
      id: "trin",
      category: "internals",
      label: `TRIN: ${internals.trin.toFixed(2)}`,
      status: trinScore > 0 ? "bullish" : trinScore < 0 ? "bearish" : "neutral",
      detail: internals.trin < 0.8 ? "Bullish breadth — advancing volume dominant" :
        internals.trin > 1.2 ? "Bearish breadth — declining volume dominant" :
          "Neutral Arms Index",
      autoChecked: trinScore > 0,
    });
  }

  if (internals.addLine != null) {
    const addScore = internals.addLine > 0 ? 1 : internals.addLine < 0 ? -1 : 0;
    score += addScore;
    checklist.push({
      id: "add",
      category: "internals",
      label: `A/D: ${internals.addLine > 0 ? "+" : ""}${Math.round(internals.addLine)}`,
      status: addScore > 0 ? "bullish" : addScore < 0 ? "bearish" : "neutral",
      detail: internals.addLine > 0 ? "More advancing than declining issues" :
        internals.addLine < 0 ? "More declining than advancing issues" :
          "Flat advance-decline line",
      autoChecked: addScore > 0,
    });
  }

  // Clamp score to -10..+10
  score = Math.max(-10, Math.min(10, score));

  return {
    score,
    label: biasLabel(score),
    checklist,
  };
}
