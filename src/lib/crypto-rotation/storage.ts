/**
 * Client-side localStorage cache for crypto rotation data.
 * 4-hour TTL. Mirrors sector-rotation/storage.ts pattern.
 */

import type { CryptoRotationResult } from "./types";

const STORAGE_KEY = "quantradar-crypto-rotation";
const TTL = 4 * 60 * 60 * 1000; // 4 hours
const SCHEMA_VERSION = 1;

interface CachedRotation {
  data: CryptoRotationResult;
  savedAt: number;
  version?: number;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function loadCryptoRotation(): CryptoRotationResult | null {
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

export function saveCryptoRotation(data: CryptoRotationResult): void {
  if (!isClient()) return;
  try {
    const cached: CachedRotation = { data, savedAt: Date.now(), version: SCHEMA_VERSION };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // localStorage quota exceeded or stringify failure — ignore
  }
}
