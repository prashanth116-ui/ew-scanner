/**
 * Phase 2 Wave Scanner — saved scan persistence.
 * Stores scan results with filter state in localStorage.
 */

import type { WaveScannerMode, WaveScanResult } from "./phase2-scanner-modes";

const STORAGE_KEY = "p2-saved-scans";
const MAX_SCANS = 30;

export interface P2SavedScan {
  id: string;
  name: string;
  mode: WaveScannerMode;
  universe: string;
  timeframe: string;
  scales: number[];
  minConfidence: number;
  direction: string;
  results: WaveScanResult[];
  savedAt: number;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

function genId(): string {
  return `p2scan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function loadSavedScans(): P2SavedScan[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as P2SavedScan[];
  } catch {
    return [];
  }
}

export function saveScan(scan: Omit<P2SavedScan, "id" | "savedAt">): P2SavedScan | null {
  if (!isClient()) return null;

  const full: P2SavedScan = {
    ...scan,
    id: genId(),
    savedAt: Date.now(),
  };

  const existing = loadSavedScans();
  existing.unshift(full);
  const trimmed = existing.slice(0, MAX_SCANS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    return null; // Quota exceeded
  }

  return full;
}

export function deleteScan(id: string): void {
  if (!isClient()) return;
  const scans = loadSavedScans().filter((s) => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
  } catch {
    // ignore
  }
}
