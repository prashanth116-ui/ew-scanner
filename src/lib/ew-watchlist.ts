import type { SavedScan, EnhancedScoredCandidate, ScannerMode } from "./ew-types";

const STORAGE_KEY = "ew-scanner-saved-scans";
const CUSTOM_UNIVERSE_KEY = "ew-scanner-custom-universes";

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function saveScan(
  name: string,
  mode: ScannerMode,
  universe: string,
  filters: { minDecline: number; minMonths: number; minRecovery: number },
  candidates: EnhancedScoredCandidate[],
  labels: Record<string, string>
): SavedScan | null {
  if (!isClient()) return null;

  // Strip series data to keep storage small
  const stripped = candidates.map(({ series, ...rest }) => rest);

  // Compute top 3 tickers by enhanced score
  const topTickers = [...candidates]
    .sort((a, b) => b.enhancedNormalized - a.enhancedNormalized)
    .slice(0, 3)
    .map((c) => c.ticker);

  const scan: SavedScan = {
    id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    savedAt: new Date().toISOString(),
    mode,
    universe,
    filters,
    candidateCount: candidates.length,
    candidates: stripped,
    labels,
    topTickers,
  };

  const existing = loadScans();
  existing.unshift(scan);
  // Keep max 50 saved scans
  const trimmed = existing.slice(0, 50);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));

  return scan;
}

export function loadScans(): SavedScan[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedScan[];
  } catch {
    return [];
  }
}

export function deleteScan(id: string): void {
  if (!isClient()) return;
  const scans = loadScans().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
}

export function updateScan(
  id: string,
  updates: { name?: string; notes?: string; tags?: string[] }
): void {
  if (!isClient()) return;
  const scans = loadScans();
  const idx = scans.findIndex((s) => s.id === id);
  if (idx === -1) return;
  if (updates.name !== undefined) scans[idx].name = updates.name;
  if (updates.notes !== undefined) scans[idx].notes = updates.notes;
  if (updates.tags !== undefined) scans[idx].tags = updates.tags;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
}

// ── V3: Custom Universes ──

export interface CustomUniverse {
  id: string;
  name: string;
  tickers: string[];
  createdAt: string;
}

export function saveCustomUniverse(name: string, tickers: string[]): CustomUniverse | null {
  if (!isClient()) return null;

  const universe: CustomUniverse = {
    id: `universe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    tickers,
    createdAt: new Date().toISOString(),
  };

  const existing = loadCustomUniverses();
  existing.push(universe);
  // Keep max 10 custom universes
  const trimmed = existing.slice(-10);
  localStorage.setItem(CUSTOM_UNIVERSE_KEY, JSON.stringify(trimmed));

  return universe;
}

export function loadCustomUniverses(): CustomUniverse[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(CUSTOM_UNIVERSE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomUniverse[];
  } catch {
    return [];
  }
}

export function deleteCustomUniverse(id: string): void {
  if (!isClient()) return;
  const universes = loadCustomUniverses().filter((u) => u.id !== id);
  localStorage.setItem(CUSTOM_UNIVERSE_KEY, JSON.stringify(universes));
}
