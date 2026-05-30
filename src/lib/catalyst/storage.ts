/**
 * Catalyst Scanner client-side localStorage helpers.
 * Follows the pattern from prerun/storage.ts and scan-cache.ts.
 */

import type { CatalystScanResponse } from "./types";

const OVERRIDES_KEY = "ew-catalyst-overrides";
const SCAN_CACHE_KEY = "ew-catalyst-scan-v1";
const SCAN_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function isClient(): boolean {
  return typeof window !== "undefined";
}

// ── Scan Results Cache ──

interface CacheEntry<T> {
  data: T;
  savedAt: number;
}

/** Load cached scan results (30-min TTL). */
export function loadCatalystScanCache(): CatalystScanResponse | null {
  if (!isClient()) return null;
  try {
    const raw = localStorage.getItem(SCAN_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<CatalystScanResponse>;
    if (Date.now() - entry.savedAt > SCAN_CACHE_TTL) {
      localStorage.removeItem(SCAN_CACHE_KEY);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/** Save scan results to cache. */
export function saveCatalystScanCache(data: CatalystScanResponse): void {
  if (!isClient()) return;
  try {
    const entry: CacheEntry<CatalystScanResponse> = { data, savedAt: Date.now() };
    localStorage.setItem(SCAN_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Quota exceeded — silently skip
  }
}

/** Clear scan cache. */
export function clearCatalystScanCache(): void {
  if (!isClient()) return;
  try {
    localStorage.removeItem(SCAN_CACHE_KEY);
  } catch {
    // ignore
  }
}

/** Get age of scan cache in ms, or null if no cache. */
export function getCatalystCacheAge(): number | null {
  if (!isClient()) return null;
  try {
    const raw = localStorage.getItem(SCAN_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<unknown>;
    return Date.now() - entry.savedAt;
  } catch {
    return null;
  }
}

// ── Manual Overrides (miss → watch) ──

interface OverrideEntry {
  symbol: string;
  overriddenAt: number;
}

/** Load manual overrides (stocks moved from MISS to WATCH). */
export function loadCatalystOverrides(): Set<string> {
  if (!isClient()) return new Set();
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return new Set();
    const entries = JSON.parse(raw) as OverrideEntry[];
    return new Set(entries.map((e) => e.symbol));
  } catch {
    return new Set();
  }
}

/** Add a manual override (promote a MISS to WATCH). */
export function addCatalystOverride(symbol: string): void {
  if (!isClient()) return;
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    const entries: OverrideEntry[] = raw ? JSON.parse(raw) : [];
    // Don't duplicate
    if (entries.some((e) => e.symbol === symbol)) return;
    entries.push({ symbol, overriddenAt: Date.now() });
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

/** Remove a manual override. */
export function removeCatalystOverride(symbol: string): void {
  if (!isClient()) return;
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return;
    const entries = (JSON.parse(raw) as OverrideEntry[]).filter(
      (e) => e.symbol !== symbol
    );
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}
