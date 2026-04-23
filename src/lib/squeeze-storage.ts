import type {
  ScoredSqueezeCandidate,
  SqueezeFilters,
  SavedSqueezeScan,
} from "./ew-types";

const STORAGE_KEY = "ew-scanner-squeeze-scans";
const MAX_SCANS = 30;

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function saveSqueezeScan(
  name: string,
  universe: string,
  filters: SqueezeFilters,
  candidates: ScoredSqueezeCandidate[]
): SavedSqueezeScan | null {
  if (!isClient()) return null;

  const scan: SavedSqueezeScan = {
    id: `sq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    savedAt: new Date().toISOString(),
    universe,
    filters,
    candidateCount: candidates.length,
    candidates,
  };

  const existing = loadSqueezeScans();
  existing.unshift(scan);
  const trimmed = existing.slice(0, MAX_SCANS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));

  return scan;
}

export function loadSqueezeScans(): SavedSqueezeScan[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedSqueezeScan[];
  } catch {
    return [];
  }
}

export function deleteSqueezeScan(id: string): void {
  if (!isClient()) return;
  const scans = loadSqueezeScans().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
}
