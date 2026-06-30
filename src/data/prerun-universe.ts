/**
 * Pre-Run Scanner Universe — derived from the full squeeze universe (~1,390 stocks).
 * Stocks are mapped to GICS sectors via sector-universe; unmapped stocks go to "Other".
 */

import { SQUEEZE_UNIVERSE } from "./squeeze-universe";
import { getSectorForSymbol, getSectorETFForSymbol } from "./sector-universe";
import { getTickerTier } from "./index-tiers";

/** Build SCAN_UNIVERSE: { sectorName → ticker[] }, "Other" last. */
const SCAN_UNIVERSE: Record<string, string[]> = (() => {
  const buckets: Record<string, string[]> = {};
  for (const stock of SQUEEZE_UNIVERSE) {
    const sector = getSectorForSymbol(stock.symbol);
    (buckets[sector] ??= []).push(stock.symbol);
  }
  const sorted: Record<string, string[]> = {};
  for (const k of Object.keys(buckets).sort((a, b) =>
    a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)
  )) {
    sorted[k] = buckets[k].sort((a, b) => getTickerTier(a) - getTickerTier(b) || a.localeCompare(b));
  }
  return sorted;
})();

export { SCAN_UNIVERSE };

const _allTickers: string[] = Object.values(SCAN_UNIVERSE).flat().sort();

/**
 * Ranked tickers: priority round-robin interleave — processes each tier fully
 * before moving to the next. Within each tier, round-robin across sectors ensures
 * proportional sector representation. This guarantees all S&P 500 (tier 1) stocks
 * appear before any tier 2/3 stocks in the ranked list.
 */
const _rankedTickers: string[] = (() => {
  const sectorKeys = Object.keys(SCAN_UNIVERSE).filter((k) => k !== "Other");
  const otherKey = Object.keys(SCAN_UNIVERSE).find((k) => k === "Other");
  const allKeys = otherKey ? [...sectorKeys, otherKey] : [...sectorKeys];

  // Split each sector's tickers into per-tier buckets
  const tierBuckets: Record<number, string[][]> = { 1: [], 2: [], 3: [] };
  for (const k of allKeys) {
    const tickers = SCAN_UNIVERSE[k];
    tierBuckets[1].push(tickers.filter((t) => getTickerTier(t) === 1));
    tierBuckets[2].push(tickers.filter((t) => getTickerTier(t) === 2));
    tierBuckets[3].push(tickers.filter((t) => getTickerTier(t) === 3));
  }

  // Round-robin within each tier, then concatenate tiers
  const result: string[] = [];
  for (const tier of [1, 2, 3]) {
    const iterators = tierBuckets[tier];
    let hasMore = true;
    let idx = 0;
    while (hasMore) {
      hasMore = false;
      for (const arr of iterators) {
        if (idx < arr.length) {
          result.push(arr[idx]);
          hasMore = true;
        }
      }
      idx++;
    }
  }
  return result;
})();

export function getSectorETF(sector: string): string {
  const tickers = SCAN_UNIVERSE[sector];
  if (tickers?.[0]) return getSectorETFForSymbol(tickers[0]) ?? "SPY";
  return "SPY";
}

export function getAllPreRunTickers(): string[] {
  return [..._allTickers];
}

export function getTickersForSector(sector: string): string[] {
  if (sector === "All") return _allTickers;
  return SCAN_UNIVERSE[sector] ?? [];
}

export function getSectorBuckets(): string[] {
  return Object.keys(SCAN_UNIVERSE);
}

export function getSectorForTicker(ticker: string): string {
  return getSectorForSymbol(ticker);
}

/** Get the top N tickers from the ranked (round-robin interleaved) universe. */
export function getTopTickers(n: number): string[] {
  return _rankedTickers.slice(0, n);
}

/** Get the next N tickers starting from offset in the ranked universe. */
export function getNextTickers(offset: number, n: number): string[] {
  return _rankedTickers.slice(offset, offset + n);
}

/** Total number of tickers in the universe. */
export function getTotalTickerCount(): number {
  return _rankedTickers.length;
}
