/**
 * Sector rotation history — compact daily snapshots stored in localStorage.
 * Separate from the live 24h cache (ew-scanner-sector-rotation).
 * Max 60 days (~39KB). One snapshot per calendar date.
 */

import type { SectorRotationResult, RRGQuadrant } from "./types";

// ── Types ──

export interface SectorSnapshot {
  sector: string;
  compositeScore: number;
  acceleration: number;
  quadrant: RRGQuadrant;
  mansfieldRS: number;
  breadthPct: number | null;
  trend: "UP" | "DOWN" | "FLAT";
}

export interface DailySnapshot {
  date: string; // "2026-04-26"
  sectors: SectorSnapshot[];
  rotationSummary: string;
  dispersionIndex: number;
}

interface HistoryStore {
  snapshots: DailySnapshot[];
  version: number;
}

// ── Constants ──

const STORAGE_KEY = "ew-scanner-sector-history";
const MAX_DAYS = 60;
const SCHEMA_VERSION = 1;

function isClient(): boolean {
  return typeof window !== "undefined";
}

// ── Public API ──

/** Extract a compact snapshot from a full SectorRotationResult and store it. */
export function saveSnapshot(data: SectorRotationResult): void {
  if (!isClient()) return;

  const date = new Date(data.calculatedAt).toISOString().slice(0, 10); // "YYYY-MM-DD"

  const snapshot: DailySnapshot = {
    date,
    sectors: data.sectors.map((s) => ({
      sector: s.sector,
      compositeScore: s.compositeScore,
      acceleration: s.acceleration,
      quadrant: s.quadrant,
      mansfieldRS: s.mansfieldRS,
      breadthPct: s.breadthPct,
      trend: s.trend,
    })),
    rotationSummary: data.rotationSummary,
    dispersionIndex: data.dispersionIndex,
  };

  const store = loadStore();

  // Dedup — replace existing snapshot for same date (latest wins)
  const idx = store.snapshots.findIndex((s) => s.date === date);
  if (idx >= 0) {
    store.snapshots[idx] = snapshot;
  } else {
    store.snapshots.push(snapshot);
  }

  // Sort newest first
  store.snapshots.sort((a, b) => b.date.localeCompare(a.date));

  // Prune to max days
  if (store.snapshots.length > MAX_DAYS) {
    store.snapshots = store.snapshots.slice(0, MAX_DAYS);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage full — silently fail
  }
}

/** Load all snapshots, newest first. */
export function loadHistory(): DailySnapshot[] {
  if (!isClient()) return [];
  return loadStore().snapshots;
}

/** Get a single snapshot by date string ("2026-04-26"). */
export function getSnapshot(date: string): DailySnapshot | null {
  if (!isClient()) return null;
  return loadStore().snapshots.find((s) => s.date === date) ?? null;
}

// ── Internal ──

function loadStore(): HistoryStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { snapshots: [], version: SCHEMA_VERSION };
    const store = JSON.parse(raw) as HistoryStore;
    if ((store.version ?? 0) < SCHEMA_VERSION) {
      // Schema changed — wipe old data
      localStorage.removeItem(STORAGE_KEY);
      return { snapshots: [], version: SCHEMA_VERSION };
    }
    return store;
  } catch {
    return { snapshots: [], version: SCHEMA_VERSION };
  }
}
