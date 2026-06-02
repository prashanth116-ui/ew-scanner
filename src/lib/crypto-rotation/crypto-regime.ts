/**
 * Crypto-native regime classifier.
 * Replaces VIX/10Y/DXY with BTC realized volatility + alt-season detection.
 * SERVER-ONLY.
 */

import "server-only";

export type CryptoRegime = "RISK_ON" | "RISK_OFF" | "MIXED";

export interface CryptoRegimeData {
  regime: CryptoRegime;
  btcVolatility: number; // annualized 20d realized vol (%)
  marketTrend: "rising" | "falling" | "flat";
  altSeasonSignal: boolean;
  favoredSectors: string[];
  avoidSectors: string[];
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
  const variance = logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / logReturns.length;
  return Math.sqrt(variance) * Math.sqrt(365) * 100;
}

/**
 * Classify crypto regime from BTC chart + proxy returns.
 */
export function classifyCryptoRegime(
  btcCloses: number[],
  proxyReturns20d: number[]
): CryptoRegimeData {
  const btcVol = computeRealizedVol(btcCloses, 20);

  // Market trend from median proxy 20d return
  const sorted = [...proxyReturns20d].sort((a, b) => a - b);
  const median = sorted.length > 0
    ? sorted[Math.floor(sorted.length / 2)]
    : 0;
  const marketTrend: "rising" | "falling" | "flat" =
    median > 3 ? "rising" : median < -3 ? "falling" : "flat";

  // Regime classification
  let regime: CryptoRegime;
  if (btcVol < 60 && marketTrend === "rising") {
    regime = "RISK_ON";
  } else if (btcVol > 80 && marketTrend === "falling") {
    regime = "RISK_OFF";
  } else {
    regime = "MIXED";
  }

  // Alt-season signal: high dispersion among proxies + rising market
  // (BTC dominance data not easily available from Yahoo, so use proxy dispersion)
  const dispersion = proxyReturns20d.length > 2
    ? Math.sqrt(proxyReturns20d.reduce((s, v) => s + (v - median) ** 2, 0) / proxyReturns20d.length)
    : 0;
  const altSeasonSignal = dispersion > 8 && median > 0;

  const sectorMap = REGIME_SECTOR_MAP[regime];

  return {
    regime,
    btcVolatility: Math.round(btcVol * 10) / 10,
    marketTrend,
    altSeasonSignal,
    favoredSectors: sectorMap.favored,
    avoidSectors: sectorMap.avoid,
  };
}
