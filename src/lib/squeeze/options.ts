/**
 * Options gamma detection for Squeeze Scanner.
 * Identifies gamma trigger zones from options open interest concentration.
 * SERVER-ONLY: Fetches Yahoo options chain data.
 */

import "server-only";

import { fetchWithRetry } from "@/lib/yahoo-utils";

const YAHOO_OPTIONS = "https://query1.finance.yahoo.com/v7/finance/options";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface GammaZone {
  strike: number;
  callOI: number;
  avgCallOI: number;
  ratio: number; // callOI / avgCallOI
  pctAbovePrice: number; // How far above current price (%)
}

export interface GammaResult {
  ticker: string;
  currentPrice: number;
  gammaZones: GammaZone[];
  nearestGammaStrike: number | null;
  hasGammaTrigger: boolean;
}

/**
 * Fetch options chain and detect gamma trigger zones.
 * Gamma trigger: call OI > 5x average AND strike within 10% above current price.
 */
export async function detectGammaZones(
  ticker: string,
  currentPrice: number
): Promise<GammaResult> {
  const result: GammaResult = {
    ticker,
    currentPrice,
    gammaZones: [],
    nearestGammaStrike: null,
    hasGammaTrigger: false,
  };

  try {
    const url = `${YAHOO_OPTIONS}/${ticker}`;
    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": UA },
    }, { timeout: 10000, retries: 1 });

    if (!res.ok) return result;
    const json = await res.json();

    const chain = json?.optionChain?.result?.[0];
    if (!chain?.options?.[0]) return result;

    const calls = chain.options[0].calls ?? [];
    if (calls.length === 0) return result;

    // Compute average call OI
    const totalOI = calls.reduce(
      (sum: number, c: { openInterest?: number }) => sum + (c.openInterest ?? 0),
      0
    );
    const avgCallOI = totalOI / calls.length;
    if (avgCallOI <= 0) return result;

    // Find strikes where callOI > 5x avg AND within 10% above current price
    const upperBound = currentPrice * 1.10;
    for (const call of calls) {
      const strike = call.strike as number;
      const oi = (call.openInterest ?? 0) as number;

      if (strike <= currentPrice || strike > upperBound) continue;
      if (oi <= avgCallOI * 5) continue;

      const pctAbove = ((strike - currentPrice) / currentPrice) * 100;
      result.gammaZones.push({
        strike,
        callOI: oi,
        avgCallOI: Math.round(avgCallOI),
        ratio: Math.round((oi / avgCallOI) * 10) / 10,
        pctAbovePrice: Math.round(pctAbove * 10) / 10,
      });
    }

    // Sort by closest to current price
    result.gammaZones.sort((a, b) => a.strike - b.strike);
    result.hasGammaTrigger = result.gammaZones.length > 0;
    result.nearestGammaStrike = result.gammaZones[0]?.strike ?? null;
  } catch {
    // Non-critical — return empty result
  }

  return result;
}

/**
 * Batch detect gamma zones for top squeeze candidates.
 * Limits to 20 tickers to avoid rate limits.
 */
export async function detectGammaBatch(
  tickers: Array<{ ticker: string; price: number }>
): Promise<Map<string, GammaResult>> {
  const results = new Map<string, GammaResult>();
  const batch = tickers.slice(0, 20);

  for (let i = 0; i < batch.length; i++) {
    const { ticker, price } = batch[i];
    const gamma = await detectGammaZones(ticker, price);
    results.set(ticker, gamma);

    // Rate limit: 1 req/sec for Yahoo options
    if (i < batch.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return results;
}
