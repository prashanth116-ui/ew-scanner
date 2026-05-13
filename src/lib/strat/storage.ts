/**
 * Strat scanner localStorage persistence.
 * Simplified from prerun/storage.ts — just saved scans, no watchlist/alerts/history.
 */

import type { SavedStratScan, StratFilters, StratResult } from "./types";

const SCANS_KEY = "ew-scanner-strat-scans";
const MAX_SCANS = 30;

function isClient(): boolean {
  return typeof window !== "undefined";
}

function genId(): string {
  return `strat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function saveStratScan(
  name: string,
  filters: StratFilters,
  results: StratResult[]
): SavedStratScan | null {
  if (!isClient()) return null;

  const scan: SavedStratScan = {
    id: genId(),
    name,
    savedAt: new Date().toISOString(),
    filters,
    resultCount: results.length,
    results,
  };

  const existing = loadStratScans();
  existing.unshift(scan);
  const trimmed = existing.slice(0, MAX_SCANS);

  try {
    localStorage.setItem(SCANS_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota exceeded — silently skip
  }

  return scan;
}

export function loadStratScans(): SavedStratScan[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(SCANS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedStratScan[];
  } catch {
    return [];
  }
}

export function deleteStratScan(id: string): void {
  if (!isClient()) return;
  const scans = loadStratScans().filter((s) => s.id !== id);
  try {
    localStorage.setItem(SCANS_KEY, JSON.stringify(scans));
  } catch {
    // ignore
  }
}
