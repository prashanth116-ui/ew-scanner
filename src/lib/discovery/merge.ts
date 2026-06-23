/**
 * Merge utility: combines static universe symbols with discovered and promoted tickers.
 * Graceful fallback: returns static universe unchanged on any error.
 */

import "server-only";

import { loadDiscoveredTickers } from "./storage";
import { loadPromotedTickers } from "./promotion";
import type { AssetClass, DiscoveredTicker } from "./types";

export interface MergeOptions {
  /** Max number of discovered symbols to add (default: 25). */
  maxDiscovered?: number;
  /** Minimum absolute price change % to include (default: 0). */
  minPriceChangePct?: number;
  /** Minimum market cap in USD to include (default: 0 = no filter). */
  minMarketCap?: number;
  /** Minimum price in USD to include (default: 0 = no filter). */
  minPrice?: number;
}

export interface MergeResult {
  /** Combined symbol array (static + promoted + discovered). */
  symbols: string[];
  /** Symbols that came from discovery (for UI badges). */
  discoveredSymbols: Set<string>;
  /** Count of discovered symbols added. */
  discoveredCount: number;
  /** Symbols that came from promotion (scored WATCH+ previously). */
  promotedSymbols: Set<string>;
  /** Count of promoted symbols added. */
  promotedCount: number;
}

/**
 * Merge discovered and promoted tickers into a static symbol list.
 * Deduplicates case-insensitively. Returns static list unchanged on any error.
 *
 * Priority: static > promoted > discovered.
 * Promoted tickers are NOT subject to maxDiscovered cap.
 */
export async function mergeWithDiscovered(
  staticSymbols: string[],
  assetClass: AssetClass,
  options?: MergeOptions
): Promise<MergeResult> {
  const maxDiscovered = options?.maxDiscovered ?? 25;
  const minPriceChangePct = options?.minPriceChangePct ?? 0;
  const minMarketCap = options?.minMarketCap ?? 0;
  const minPrice = options?.minPrice ?? 0;

  try {
    const [discovered, promoted] = await Promise.all([
      loadDiscoveredTickers(assetClass),
      loadPromotedTickers(assetClass),
    ]);

    // Build case-insensitive set of static symbols for dedup
    const staticUpper = new Set(staticSymbols.map((s) => s.toUpperCase()));

    // Add promoted tickers (not subject to maxDiscovered cap)
    const promotedFiltered = promoted.filter(
      (p) => !staticUpper.has(p.symbol.toUpperCase())
    );
    const promotedSymbols = new Set(promotedFiltered.map((p) => p.symbol));

    // Build combined dedup set (static + promoted)
    const usedUpper = new Set(staticUpper);
    for (const p of promotedFiltered) {
      usedUpper.add(p.symbol.toUpperCase());
    }

    // Filter and deduplicate discovered against static + promoted
    let filtered: DiscoveredTicker[] = discovered.filter(
      (d) => !usedUpper.has(d.symbol.toUpperCase())
    );

    if (minPriceChangePct > 0) {
      filtered = filtered.filter(
        (d) =>
          d.price_change_pct != null &&
          Math.abs(d.price_change_pct) >= minPriceChangePct
      );
    }

    if (minMarketCap > 0) {
      filtered = filtered.filter(
        (d) => d.market_cap != null && d.market_cap >= minMarketCap
      );
    }

    if (minPrice > 0) {
      filtered = filtered.filter(
        (d) => d.price_at_discovery != null && d.price_at_discovery >= minPrice
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
      symbols: [
        ...staticSymbols,
        ...promotedFiltered.map((p) => p.symbol),
        ...toAdd.map((d) => d.symbol),
      ],
      discoveredSymbols,
      discoveredCount: toAdd.length,
      promotedSymbols,
      promotedCount: promotedFiltered.length,
    };
  } catch (err) {
    console.error("[discovery] mergeWithDiscovered error, returning static:", err);
    return {
      symbols: staticSymbols,
      discoveredSymbols: new Set(),
      discoveredCount: 0,
      promotedSymbols: new Set(),
      promotedCount: 0,
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
