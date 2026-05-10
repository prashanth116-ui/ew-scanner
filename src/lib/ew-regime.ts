/**
 * Market regime detection for EW Scanner.
 * Adjusts mode thresholds based on SPY vs 200d SMA.
 * SERVER-ONLY: Called from /api/quote during scan.
 */

import "server-only";

import { fetchWithRetry } from "./yahoo-utils";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type MarketRegime = "strong_bull" | "bull" | "bear" | "neutral";

export interface RegimeData {
  regime: MarketRegime;
  spyPrice: number;
  sma200: number;
  pctAboveSma200: number;
}

// Module-level cache (5 min TTL)
let _regimeCache: { data: RegimeData; ts: number } | null = null;
const REGIME_CACHE_TTL = 5 * 60 * 1000;

/** Fetch current market regime (SPY vs 200d SMA). */
export async function fetchMarketRegime(): Promise<RegimeData | null> {
  if (_regimeCache && Date.now() - _regimeCache.ts < REGIME_CACHE_TTL) {
    return _regimeCache.data;
  }

  try {
    const url = `${YAHOO_CHART}/SPY?range=1y&interval=1d`;
    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": UA },
    }, { timeout: 10000, retries: 1 });

    if (!res.ok) return null;
    const json = await res.json();

    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
    if (closes.length < 201) return null;

    // Filter out nulls
    const validCloses = closes.filter((c): c is number => c != null && c > 0);
    if (validCloses.length < 201) return null;

    const spyPrice = validCloses[validCloses.length - 1];
    const sma200 =
      validCloses.slice(-200).reduce((a, b) => a + b, 0) / 200;

    const pctAboveSma200 = ((spyPrice - sma200) / sma200) * 100;

    let regime: MarketRegime;
    if (pctAboveSma200 > 10) regime = "strong_bull";
    else if (pctAboveSma200 > 0) regime = "bull";
    else if (pctAboveSma200 < -5) regime = "bear";
    else regime = "neutral";

    const data: RegimeData = { regime, spyPrice, sma200, pctAboveSma200 };
    _regimeCache = { data, ts: Date.now() };
    return data;
  } catch {
    return null;
  }
}

/**
 * Adjust mode recovery threshold based on regime.
 * Bear regime: increase minRecovery by 5% (be more selective)
 * Strong bull: decrease by 3% (catch more early entries)
 */
export function adjustRecoveryForRegime(
  minRecovery: number,
  regime: MarketRegime
): number {
  switch (regime) {
    case "bear":
      return minRecovery + 5;
    case "strong_bull":
      return Math.max(0, minRecovery - 3);
    default:
      return minRecovery;
  }
}
