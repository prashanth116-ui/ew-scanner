/**
 * Confluence scan history — compact per-scan snapshots stored in localStorage.
 * Tracks per-ticker scores for signal persistence analysis.
 * Max 30 scans (~50KB). One snapshot per scan (multiple per day allowed).
 */

import type { ConfluenceResult, ConfluenceSignal } from "./types";

// ── Types ──

export interface ConfluenceTickerSnapshot {
  ticker: string;
  confluenceScore: number;
  signal: ConfluenceSignal;
  passCount: number;
  price?: number;
}

export interface ConfluenceScanSnapshot {
  id: string;
  date: string;       // "2026-05-10"
  time: string;       // "14:32:00"
  tickerCount: number;
  strongCount: number;
  moderateCount: number;
  tickers: ConfluenceTickerSnapshot[];
}

export interface SignalPersistence {
  total: number;        // total strong signals in previous scan
  persisted: number;    // still strong in current scan
  upgraded: number;     // weak/moderate → strong
  downgraded: number;   // strong → weak/none
  rate: number;         // persisted / total (0-1)
}

interface HistoryStore {
  snapshots: ConfluenceScanSnapshot[];
  version: number;
}

// ── Constants ──

const STORAGE_KEY = "ew-confluence-history";
const MAX_SCANS = 30;
const SCHEMA_VERSION = 1;

function isClient(): boolean {
  return typeof window !== "undefined";
}

// ── Public API ──

/** Save a confluence scan snapshot from results. */
export function saveScanSnapshot(results: ConfluenceResult[]): void {
  if (!isClient() || results.length === 0) return;

  const now = new Date();
  const snapshot: ConfluenceScanSnapshot = {
    id: `ch_${Date.now()}`,
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 8),
    tickerCount: results.length,
    strongCount: results.filter((r) => r.signal === "strong").length,
    moderateCount: results.filter((r) => r.signal === "moderate").length,
    tickers: results
      .filter((r) => r.signal === "strong" || r.signal === "moderate")
      .map((r) => ({
        ticker: r.ticker,
        confluenceScore: Math.round(r.scores.confluenceScore * 1000) / 1000,
        signal: r.signal,
        passCount: r.scores.passCount,
        price: r.price,
      })),
  };

  const store = loadStore();
  store.snapshots.unshift(snapshot);

  if (store.snapshots.length > MAX_SCANS) {
    store.snapshots = store.snapshots.slice(0, MAX_SCANS);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage full — silently fail
  }
}

/** Load all snapshots, newest first. */
export function loadScanHistory(): ConfluenceScanSnapshot[] {
  if (!isClient()) return [];
  return loadStore().snapshots;
}

/** Compute signal persistence between previous and current scan. */
export function computeSignalPersistence(
  current: ConfluenceResult[]
): SignalPersistence | null {
  if (!isClient()) return null;

  const store = loadStore();
  if (store.snapshots.length === 0) return null;

  const prev = store.snapshots[0];
  const prevStrong = new Set(
    prev.tickers.filter((t) => t.signal === "strong").map((t) => t.ticker)
  );
  const prevAll = new Set(prev.tickers.map((t) => t.ticker));

  if (prevStrong.size === 0) return null;

  const currentMap = new Map(current.map((r) => [r.ticker, r]));

  let persisted = 0;
  let downgraded = 0;
  for (const ticker of prevStrong) {
    const cur = currentMap.get(ticker);
    if (cur && cur.signal === "strong") persisted++;
    else downgraded++;
  }

  let upgraded = 0;
  for (const r of current) {
    if (r.signal === "strong" && !prevAll.has(r.ticker)) upgraded++;
  }

  return {
    total: prevStrong.size,
    persisted,
    upgraded,
    downgraded,
    rate: prevStrong.size > 0 ? persisted / prevStrong.size : 0,
  };
}

// ── Internal ──

function loadStore(): HistoryStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { snapshots: [], version: SCHEMA_VERSION };
    const store = JSON.parse(raw) as HistoryStore;
    if ((store.version ?? 0) < SCHEMA_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      return { snapshots: [], version: SCHEMA_VERSION };
    }
    return store;
  } catch {
    return { snapshots: [], version: SCHEMA_VERSION };
  }
}
