/**
 * Pre-Run Scanner Universe — derived from the full squeeze universe (~1,390 stocks).
 * Stocks are mapped to GICS sectors via sector-universe; unmapped stocks go to "Other".
 */

import { SQUEEZE_UNIVERSE } from "./squeeze-universe";
import { getSectorForSymbol, getSectorETFForSymbol } from "./sector-universe";

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
    sorted[k] = buckets[k].sort();
  }
  return sorted;
})();

export { SCAN_UNIVERSE };

const _allTickers: string[] = Object.values(SCAN_UNIVERSE).flat().sort();

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
