/**
 * Client-side localStorage cache for sector rotation data.
 * 24-hour TTL. Mirrors prerun/storage.ts pattern.
 */

import type { SectorRotationResult } from "./types";

const STORAGE_KEY = "ew-scanner-sector-rotation";
const TTL = 24 * 60 * 60 * 1000; // 24 hours
const SCHEMA_VERSION = 2; // Bump when SectorRotationResult shape changes

interface CachedRotation {
  data: SectorRotationResult;
  savedAt: number;
  version?: number;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function loadSectorRotation(): SectorRotationResult | null {
  if (!isClient()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedRotation;
    if ((cached.version ?? 0) < SCHEMA_VERSION || Date.now() - cached.savedAt > TTL) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

export function saveSectorRotation(data: SectorRotationResult): void {
  if (!isClient()) return;
  const cached: CachedRotation = { data, savedAt: Date.now(), version: SCHEMA_VERSION };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
}
