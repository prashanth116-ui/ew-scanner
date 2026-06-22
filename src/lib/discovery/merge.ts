/**
 * Merge utility: combines static universe symbols with discovered tickers.
 * Graceful fallback: returns static universe unchanged on any error.
 */

import "server-only";

import { loadDiscoveredTickers } from "./storage";
import type { AssetClass, DiscoveredTicker } from "./types";

export interface MergeOptions {
  /** Max number of discovered symbols to add (default: 25). */
  maxDiscovered?: number;
  /** Minimum absolute price change % to include (default: 0). */
  minPriceChangePct?: number;
}

export interface MergeResult {
  /** Combined symbol array (static + discovered). */
  symbols: string[];
  /** Symbols that came from discovery (for UI badges). */
  discoveredSymbols: Set<string>;
  /** Count of discovered symbols added. */
  discoveredCount: number;
}

/**
 * Merge discovered tickers into a static symbol list.
 * Deduplicates case-insensitively. Returns static list unchanged on any error.
 */
export async function mergeWithDiscovered(
  staticSymbols: string[],
  assetClass: AssetClass,
  options?: MergeOptions
): Promise<MergeResult> {
  const maxDiscovered = options?.maxDiscovered ?? 25;
  const minPriceChangePct = options?.minPriceChangePct ?? 0;

  try {
    const discovered = await loadDiscoveredTickers(assetClass);

    // Build case-insensitive set of static symbols for dedup
    const staticUpper = new Set(staticSymbols.map((s) => s.toUpperCase()));

    // Filter and deduplicate
    let filtered: DiscoveredTicker[] = discovered.filter(
      (d) => !staticUpper.has(d.symbol.toUpperCase())
    );

    if (minPriceChangePct > 0) {
      filtered = filtered.filter(
        (d) =>
          d.price_change_pct != null &&
          Math.abs(d.price_change_pct) >= minPriceChangePct
      );
    }

    // Sort by absolute price change descending (most volatile first)
    filtered.sort((a, b) => {
      const absA = Math.abs(a.price_change_pct ?? 0);
      const absB = Math.abs(b.price_change_pct ?? 0);
      return absB - absA;
    });

    // Cap at maxDiscovered
    const toAdd = filtered.slice(0, maxDiscovered);
    const discoveredSymbols = new Set(toAdd.map((d) => d.symbol));

    return {
      symbols: [...staticSymbols, ...toAdd.map((d) => d.symbol)],
      discoveredSymbols,
      discoveredCount: toAdd.length,
    };
  } catch (err) {
    console.error("[discovery] mergeWithDiscovered error, returning static:", err);
    return {
      symbols: staticSymbols,
      discoveredSymbols: new Set(),
      discoveredCount: 0,
    };
  }
}

/** Check if a symbol was discovered (for UI "trending" badge). */
export function isDiscoveredTicker(
  symbol: string,
  discoveredSymbols: Set<string>
): boolean {
  return discoveredSymbols.has(symbol);
}
