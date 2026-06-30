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
 * Ranked tickers: round-robin interleave from each sector bucket so the first N
 * tickers contain proportional representation from every sector.
 * This ensures Quick Scan (top 500) covers all sectors, not just alphabetically early ones.
 */
const _rankedTickers: string[] = (() => {
  const sectorKeys = Object.keys(SCAN_UNIVERSE).filter((k) => k !== "Other");
  const otherKey = Object.keys(SCAN_UNIVERSE).find((k) => k === "Other");
  const iterators = sectorKeys.map((k) => [...SCAN_UNIVERSE[k]]);
  if (otherKey) iterators.push([...SCAN_UNIVERSE[otherKey]]);

  const result: string[] = [];
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
