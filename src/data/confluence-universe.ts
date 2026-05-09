/**
 * Confluence scanner universe — full squeeze universe (~1,390 stocks).
 * All scanners now share the same base, so the old intersection gate is removed.
 */

import { type TickerInfo } from "./ew-universes";
import { SQUEEZE_UNIVERSE } from "./squeeze-universe";

// SQUEEZE_UNIVERSE entries are already sorted alphabetically and
// structurally compatible with TickerInfo (sector? is optional).
const _universe: TickerInfo[] = SQUEEZE_UNIVERSE;

export function getConfluenceUniverse(): TickerInfo[] {
  return _universe;
}

export function getConfluenceUniverseSymbols(): string[] {
  return _universe.map((t) => t.symbol);
}

export function getConfluenceTickerInfo(symbol: string): TickerInfo | undefined {
  return _universe.find((t) => t.symbol === symbol);
}
