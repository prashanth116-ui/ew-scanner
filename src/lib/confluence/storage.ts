import type {
  ConfluenceResult,
  ConfluenceWeights,
  ConfluenceThresholds,
  ConfluenceSignal,
} from "./types";

const STORAGE_KEY = "ew_confluence_scans";

function isClient(): boolean {
  return typeof window !== "undefined";
}

export interface SavedConfluenceScan {
  id: string;
  name: string;
  savedAt: string;
  weights: ConfluenceWeights;
  thresholds: ConfluenceThresholds;
  signalFilters: ConfluenceSignal[];
  candidateCount: number;
  topTickers: string[];
}

export function saveConfluenceScan(
  name: string,
  weights: ConfluenceWeights,
  thresholds: ConfluenceThresholds,
  signalFilters: ConfluenceSignal[],
  results: ConfluenceResult[]
): SavedConfluenceScan | null {
  if (!isClient()) return null;

  const topTickers = [...results]
    .sort((a, b) => b.scores.confluenceScore - a.scores.confluenceScore)
    .slice(0, 5)
    .map((r) => r.ticker);

  const scan: SavedConfluenceScan = {
    id: `cscan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    savedAt: new Date().toISOString(),
    weights,
    thresholds,
    signalFilters,
    candidateCount: results.length,
    topTickers,
  };

  const existing = loadConfluenceScans();
  existing.unshift(scan);
  const trimmed = existing.slice(0, 50);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed.slice(0, 20)));
    } catch {
      return null;
    }
  }
  return scan;
}

export function loadConfluenceScans(): SavedConfluenceScan[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedConfluenceScan[];
  } catch {
    return [];
  }
}

export function deleteConfluenceScan(id: string): void {
  if (!isClient()) return;
  const scans = loadConfluenceScans().filter((s) => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
  } catch {
    /* ignore */
  }
}
