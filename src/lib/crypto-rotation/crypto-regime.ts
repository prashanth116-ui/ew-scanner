/**
 * Crypto-native regime classifier.
 * Replaces VIX/10Y/DXY with BTC realized volatility + alt-season detection.
 * SERVER-ONLY.
 */

import "server-only";

import { CRYPTO_REGIME_THRESHOLDS as CRT } from "../sector-rotation/config";

export type CryptoRegime = "RISK_ON" | "RISK_OFF" | "MIXED";

export interface CryptoRegimeData {
  regime: CryptoRegime;
  btcVolatility: number; // annualized 20d realized vol (%)
  marketTrend: "rising" | "falling" | "flat";
  altSeasonSignal: boolean;
  favoredSectors: string[];
  avoidSectors: string[];
  // Enhanced fields (V2)
  btcDominanceTrend?: "rising" | "falling" | "flat";
  totalMarketMomentum?: number; // 20d ROC of estimated total market cap proxy
  regimeConfidence: "high" | "medium" | "low";
}

const REGIME_SECTOR_MAP: Record<CryptoRegime, { favored: string[]; avoid: string[] }> = {
  RISK_ON: {
    favored: ["AI & Compute", "Memecoins", "Gaming & Metaverse", "DeFi"],
    avoid: [],
  },
  RISK_OFF: {
    favored: ["Exchange Tokens", "Infrastructure"],
    avoid: ["Memecoins", "Gaming & Metaverse"],
  },
  MIXED: {
    favored: [],
    avoid: [],
  },
};

/**
 * Compute BTC 20d annualized realized volatility from daily closes.
 * Formula: stddev(daily log returns) * sqrt(365) * 100.
 */
function computeRealizedVol(closes: number[], period = 20): number {
  if (closes.length < period + 1) return 0;
  const recent = closes.slice(-(period + 1));
  const logReturns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1] > 0 && recent[i] > 0) {
      logReturns.push(Math.log(recent[i] / recent[i - 1]));
    }
  }
  if (logReturns.length < 5) return 0;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(365) * 100;
}

/**
 * Compute 20d rate of change from a price series.
 */
function computeROC(closes: number[], period = 20): number {
  if (closes.length < period + 1) return 0;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  if (past <= 0) return 0;
  return ((current - past) / past) * 100;
}

/**
 * Estimate dominance trend from BTC closes vs total market cap proxy closes.
 */
function estimateDominanceTrend(
  btcCloses: number[],
  totalMarketCapCloses: number[]
): "rising" | "falling" | "flat" {
  if (btcCloses.length < 8 || totalMarketCapCloses.length < 8) return "flat";

  // Use 7d ROC of BTC vs total to approximate dominance change
  const btcLen = btcCloses.length;
  const tmcLen = totalMarketCapCloses.length;
  const btcROC7 = btcCloses[btcLen - 1] > 0 && btcCloses[btcLen - 8] > 0
    ? ((btcCloses[btcLen - 1] / btcCloses[btcLen - 8]) - 1) * 100
    : 0;
  const tmcROC7 = totalMarketCapCloses[tmcLen - 1] > 0 && totalMarketCapCloses[tmcLen - 8] > 0
    ? ((totalMarketCapCloses[tmcLen - 1] / totalMarketCapCloses[tmcLen - 8]) - 1) * 100
    : 0;

  // If BTC is outperforming total market, dominance is rising
  const dominanceDelta = btcROC7 - tmcROC7;
  if (dominanceDelta > CRT.DOMINANCE_DELTA_RISING) return "rising";
  if (dominanceDelta < CRT.DOMINANCE_DELTA_FALLING) return "falling";
  return "flat";
}

/**
 * Classify crypto regime from BTC chart + proxy returns.
 * Enhanced with optional dominance + total market cap data.
 */
export function classifyCryptoRegime(
  btcCloses: number[],
  proxyReturns20d: number[],
  // NEW optional params (backward compatible)
  btcDominanceCloses?: number[],
  totalMarketCapCloses?: number[],
): CryptoRegimeData {
  const btcVol = computeRealizedVol(btcCloses, 20);

  // Market trend from median proxy 20d return
  const sorted = [...proxyReturns20d].sort((a, b) => a - b);
  const median = sorted.length > 0
    ? sorted[Math.floor(sorted.length / 2)]
    : 0;
  const marketTrend: "rising" | "falling" | "flat" =
    median > CRT.MARKET_TREND_THRESHOLD ? "rising" : median < -CRT.MARKET_TREND_THRESHOLD ? "falling" : "flat";

  // BTC dominance trend (from optional data)
  let btcDominanceTrend: "rising" | "falling" | "flat" | undefined;
  if (btcDominanceCloses && btcDominanceCloses.length >= 8) {
    // Direct dominance data
    const domROC = computeROC(btcDominanceCloses, 7);
    btcDominanceTrend = domROC > CRT.DOMINANCE_DELTA_RISING ? "rising" : domROC < CRT.DOMINANCE_DELTA_FALLING ? "falling" : "flat";
  } else if (totalMarketCapCloses && totalMarketCapCloses.length >= 8) {
    // Estimate from BTC vs total market
    btcDominanceTrend = estimateDominanceTrend(btcCloses, totalMarketCapCloses);
  }

  // Total market momentum (20d ROC)
  let totalMarketMomentum: number | undefined;
  if (totalMarketCapCloses && totalMarketCapCloses.length >= 21) {
    totalMarketMomentum = Math.round(computeROC(totalMarketCapCloses, 20) * 10) / 10;
  }

  // Enhanced regime classification
  let regime: CryptoRegime;
  if (btcVol < CRT.BTC_VOL_LOW && marketTrend === "rising" && btcDominanceTrend !== "rising") {
    // RISK_ON: low vol + rising market + dominance not rising (or unknown)
    regime = "RISK_ON";
  } else if (btcVol < CRT.BTC_VOL_LOW && marketTrend === "rising") {
    // Low vol + rising but dominance rising — still RISK_ON but lower confidence
    regime = "RISK_ON";
  } else if (btcVol > CRT.BTC_VOL_HIGH && marketTrend === "falling") {
    regime = "RISK_OFF";
  } else if (btcVol > CRT.BTC_VOL_HIGH && btcDominanceTrend === "rising") {
    // High vol + dominance rising = flight to BTC safety
    regime = "RISK_OFF";
  } else {
    regime = "MIXED";
  }

  // Regime confidence
  let regimeConfidence: "high" | "medium" | "low";
  if (regime === "RISK_ON") {
    const signals = [
      btcVol < CRT.CONFIDENCE_VOL_STRONG,
      marketTrend === "rising",
      btcDominanceTrend === "falling" || btcDominanceTrend === undefined,
      (totalMarketMomentum ?? 0) > CRT.CONFIDENCE_MOMENTUM_POSITIVE,
    ].filter(Boolean).length;
    regimeConfidence = signals >= 3 ? "high" : signals >= 2 ? "medium" : "low";
  } else if (regime === "RISK_OFF") {
    const signals = [
      btcVol > CRT.CONFIDENCE_VOL_EXTREME,
      marketTrend === "falling",
      btcDominanceTrend === "rising",
      (totalMarketMomentum ?? 0) < CRT.CONFIDENCE_MOMENTUM_NEGATIVE,
    ].filter(Boolean).length;
    regimeConfidence = signals >= 3 ? "high" : signals >= 2 ? "medium" : "low";
  } else {
    regimeConfidence = "low"; // MIXED is inherently uncertain
  }

  // Alt-season signal: high dispersion among proxies + rising market
  const dispersion = proxyReturns20d.length > 2
    ? Math.sqrt(proxyReturns20d.reduce((s, v) => s + (v - median) ** 2, 0) / proxyReturns20d.length)
    : 0;
  // Enhanced: also check dominance falling for alt-season confirmation
  const altSeasonSignal = dispersion > CRT.ALT_SEASON_DISPERSION && median > 0 && btcDominanceTrend !== "rising";

  const sectorMap = REGIME_SECTOR_MAP[regime];

  return {
    regime,
    btcVolatility: Math.round(btcVol * 10) / 10,
    marketTrend,
    altSeasonSignal,
    favoredSectors: sectorMap.favored,
    avoidSectors: sectorMap.avoid,
    btcDominanceTrend,
    totalMarketMomentum,
    regimeConfidence,
  };
}
