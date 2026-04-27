/**
 * Pre-Run Scanner Universe — derived from the full GICS sector universe (684 stocks).
 * All functions maintain the same API so callers don't need changes.
 */

import { SECTOR_UNIVERSE, getSectorForSymbol, getSectorETFForSymbol } from "./sector-universe";

/** Build SCAN_UNIVERSE from SECTOR_UNIVERSE: { displayName → ticker[] } */
export const SCAN_UNIVERSE: Record<string, string[]> = Object.fromEntries(
  SECTOR_UNIVERSE.map((s) => [s.displayName, s.stocks.map((st) => st.symbol)])
);

/** Get sector ETF for a sector name — used for relative strength (criterion J). */
export function getSectorETF(sector: string): string {
  const def = SECTOR_UNIVERSE.find((s) => s.displayName === sector);
  return def?.etf ?? "SPY";
}

/** Get all unique tickers from all sectors. */
export function getAllPreRunTickers(): string[] {
  const set = new Set<string>();
  for (const tickers of Object.values(SCAN_UNIVERSE)) {
    for (const t of tickers) set.add(t);
  }
  return Array.from(set).sort();
}

/** Get tickers for a specific sector. */
export function getTickersForSector(sector: string): string[] {
  if (sector === "All") return getAllPreRunTickers();
  return SCAN_UNIVERSE[sector] ?? [];
}

/** Get sector names. */
export function getSectorBuckets(): string[] {
  return Object.keys(SCAN_UNIVERSE);
}

/** Find which sector a ticker belongs to. */
export function getSectorForTicker(ticker: string): string {
  return getSectorForSymbol(ticker);
}
