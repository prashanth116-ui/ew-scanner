/**
 * Confluence scanner universe — intersection of EW, Squeeze, and Sector universes.
 * Returns tickers present in at least 2 of the 3 universe lists.
 */

import { UNIVERSES, type TickerInfo } from "./ew-universes";
import { SQUEEZE_UNIVERSE } from "./squeeze-universe";
import { SECTOR_UNIVERSE } from "./sector-universe";

let _cached: TickerInfo[] | null = null;

export function getConfluenceUniverse(): TickerInfo[] {
  if (_cached) return _cached;

  // Build sets of symbols from each universe
  const ewSymbols = new Set<string>();
  const ewMap = new Map<string, TickerInfo>();
  for (const ticker of UNIVERSES.SP500 ?? []) {
    ewSymbols.add(ticker.symbol);
    ewMap.set(ticker.symbol, ticker);
  }

  const squeezeSymbols = new Set<string>();
  const squeezeMap = new Map<string, { symbol: string; name: string }>();
  for (const t of SQUEEZE_UNIVERSE) {
    squeezeSymbols.add(t.symbol);
    squeezeMap.set(t.symbol, t);
  }

  const sectorSymbols = new Set<string>();
  const sectorMap = new Map<string, { symbol: string; name: string }>();
  for (const sector of SECTOR_UNIVERSE) {
    for (const stock of sector.stocks) {
      sectorSymbols.add(stock.symbol);
      sectorMap.set(stock.symbol, stock);
    }
  }

  // Collect all unique symbols
  const allSymbols = new Set([...ewSymbols, ...squeezeSymbols, ...sectorSymbols]);

  // Include symbols present in at least 2 of the 3 universes
  const result: TickerInfo[] = [];
  for (const symbol of allSymbols) {
    let count = 0;
    if (ewSymbols.has(symbol)) count++;
    if (squeezeSymbols.has(symbol)) count++;
    if (sectorSymbols.has(symbol)) count++;

    if (count >= 2) {
      // Prefer EW universe data (has sector field), fall back to others
      const info = ewMap.get(symbol) ??
        (() => {
          const sq = squeezeMap.get(symbol);
          const sc = sectorMap.get(symbol);
          const name = sq?.name ?? sc?.name ?? symbol;
          return { symbol, name } as TickerInfo;
        })();
      result.push(info);
    }
  }

  // Sort alphabetically
  result.sort((a, b) => a.symbol.localeCompare(b.symbol));
  _cached = result;
  return result;
}

export function getConfluenceUniverseSymbols(): string[] {
  return getConfluenceUniverse().map((t) => t.symbol);
}

export function getConfluenceTickerInfo(symbol: string): TickerInfo | undefined {
  return getConfluenceUniverse().find((t) => t.symbol === symbol);
}
