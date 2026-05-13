/**
 * Strat scanner universe — full squeeze universe (~1,390 stocks).
 * All scanners now share the same base.
 */

import { type TickerInfo } from "./ew-universes";
import { SQUEEZE_UNIVERSE } from "./squeeze-universe";

const _universe: TickerInfo[] = SQUEEZE_UNIVERSE;

const _tickerMap = new Map<string, TickerInfo>(
  _universe.map((t) => [t.symbol, t])
);

export function getStratUniverse(): TickerInfo[] {
  return _universe;
}

export function getStratTickers(): string[] {
  return _universe.map((t) => t.symbol);
}

export function getStratTickerInfo(symbol: string): TickerInfo | undefined {
  return _tickerMap.get(symbol);
}
