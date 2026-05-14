/**
 * Strat scanner universe — full squeeze universe (~1,390 stocks).
 * All scanners now share the same base.
 * Sector filtering mirrors prerun-universe.ts pattern.
 */

import { type TickerInfo } from "./ew-universes";
import { SQUEEZE_UNIVERSE } from "./squeeze-universe";
import { getSectorForSymbol } from "./sector-universe";

const _universe: TickerInfo[] = SQUEEZE_UNIVERSE;

const _tickerMap = new Map<string, TickerInfo>(
  _universe.map((t) => [t.symbol, t])
);

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

const _allTickers: string[] = Object.values(SCAN_UNIVERSE).flat().sort();

export function getStratUniverse(): TickerInfo[] {
  return _universe;
}

export function getStratTickers(): string[] {
  return _universe.map((t) => t.symbol);
}

export function getStratTickerInfo(symbol: string): TickerInfo | undefined {
  return _tickerMap.get(symbol);
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
