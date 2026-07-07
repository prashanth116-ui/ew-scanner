/**
 * Bias score engine for pre-market checklist.
 * Pure functions — no side effects, no fetching.
 *
 * Scores futures (ES, NQ, YM, RTY, CL, GC), macro regime with adaptive VIX
 * bounds, market posture, and sector breadth. Produces a -10..+10 score and
 * structured checklist.
 */

import type { FuturesSnapshot, ChecklistItem, SectorBreadth } from "./types";
import type { PostureResult } from "@/lib/sector-rotation/brief";
import type { MacroRegimeData } from "@/lib/sector-rotation/regime";
import { PREMARKET_SCORING } from "@/lib/sector-rotation/config";

interface BiasResult {
  score: number;
  label: string;
  checklist: ChecklistItem[];
}

function biasLabel(score: number): string {
  if (score >= PREMARKET_SCORING.STRONG_BULL) return "Strong Bull";
  if (score >= PREMARKET_SCORING.LEAN_BULL) return "Lean Bull";
  if (score >= PREMARKET_SCORING.NEUTRAL) return "Neutral";
  if (score >= PREMARKET_SCORING.LEAN_BEAR) return "Lean Bear";
  return "Strong Bear";
}

export function computeBiasScore(
  futures: FuturesSnapshot[],
  posture: PostureResult,
  regime: MacroRegimeData | null,
  sectorBreadth?: SectorBreadth | null,
): BiasResult {
  let score = 0;
  const checklist: ChecklistItem[] = [];

  // ── Macro: Posture ──
  const posturePoints: Record<string, number> = {
    AGGRESSIVE: PREMARKET_SCORING.POSTURE_AGGRESSIVE,
    SELECTIVE: PREMARKET_SCORING.POSTURE_SELECTIVE,
    DEFENSIVE: PREMARKET_SCORING.POSTURE_DEFENSIVE,
    CASH: PREMARKET_SCORING.POSTURE_CASH,
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
      RISK_ON: PREMARKET_SCORING.REGIME_RISK_ON,
      RISK_OFF: PREMARKET_SCORING.REGIME_RISK_OFF,
      INFLATIONARY: PREMARKET_SCORING.REGIME_INFLATIONARY,
      MIXED: PREMARKET_SCORING.REGIME_MIXED,
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

    // ── Macro: VIX (adaptive bounds from 3-month percentiles) ──
    const vb = regime.vixBounds ?? PREMARKET_SCORING.DEFAULT_VIX_BOUNDS;
    let vixScore = 0;
    let vixStatus: "bullish" | "bearish" | "neutral" = "neutral";
    let vixDetail: string;
    if (regime.vix < vb.low) {
      vixScore = 1;
      vixStatus = "bullish";
      vixDetail = `Low volatility — below adaptive floor (${vb.low.toFixed(0)})`;
    } else if (regime.vix > vb.high * 1.5) {
      vixScore = -2;
      vixStatus = "bearish";
      vixDetail = `Elevated VIX — well above adaptive ceiling (${vb.high.toFixed(0)})`;
    } else if (regime.vix > vb.high) {
      vixScore = -1;
      vixStatus = "bearish";
      vixDetail = `Above-average volatility — above adaptive ceiling (${vb.high.toFixed(0)})`;
    } else {
      vixDetail = `Moderate volatility — within adaptive range (${vb.low.toFixed(0)}-${vb.high.toFixed(0)})`;
    }
    score += vixScore;
    checklist.push({
      id: "vix",
      category: "macro",
      label: `VIX: ${regime.vix.toFixed(1)}`,
      status: vixStatus,
      detail: vixDetail,
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

  // ── Futures: Equity Indices ──
  const es = futures.find((f) => f.symbol === "ES=F");
  const nq = futures.find((f) => f.symbol === "NQ=F");
  const ym = futures.find((f) => f.symbol === "YM=F");
  const rty = futures.find((f) => f.symbol === "RTY=F");

  for (const [id, future, threshold] of [
    ["es", es, 0.3],
    ["nq", nq, 0.4],
    ["ym", ym, 0.3],
    ["rty", rty, 0.3],
  ] as const) {
    if (future) {
      const fScore = future.changePct > threshold ? 1 : future.changePct < -threshold ? -1 : 0;
      score += fScore;
      checklist.push({
        id,
        category: "futures",
        label: `${id.toUpperCase()}: ${future.changePct >= 0 ? "+" : ""}${future.changePct.toFixed(2)}%`,
        status: fScore > 0 ? "bullish" : fScore < 0 ? "bearish" : "neutral",
        detail: `${future.name} at ${future.price.toFixed(2)} (${future.change >= 0 ? "+" : ""}${future.change.toFixed(2)})`,
        autoChecked: fScore > 0,
      });
    }
  }

  // ── Futures: Commodities ──
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

  // ── Sector Breadth (replaces dead ^TICK/^TRIN/^ADD internals) ──
  if (sectorBreadth != null) {
    const { advancing, declining } = sectorBreadth;
    const total = advancing + declining;
    if (total > 0) {
      const ratio = advancing / total;
      let breadthScore = 0;
      let breadthStatus: "bullish" | "bearish" | "neutral" = "neutral";
      if (ratio >= 0.7) {
        breadthScore = 1;
        breadthStatus = "bullish";
      } else if (ratio <= 0.3) {
        breadthScore = -1;
        breadthStatus = "bearish";
      }
      score += breadthScore;
      checklist.push({
        id: "sector-breadth",
        category: "sectors",
        label: `Breadth: ${advancing}/${total} advancing`,
        status: breadthStatus,
        detail: ratio >= 0.7 ? "Strong sector breadth — broad participation"
          : ratio <= 0.3 ? "Weak sector breadth — narrow participation"
          : "Mixed sector breadth",
        autoChecked: breadthScore > 0,
      });
    }
  }

  // Clamp score to -10..+10
  score = Math.max(-10, Math.min(10, score));

  return {
    score,
    label: biasLabel(score),
    checklist,
  };
}
