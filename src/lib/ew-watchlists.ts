import type { Watchlist, WatchlistItem, ScannerMode, ConfidenceTier, EnhancedScoredCandidate } from "./ew-types";

const STORAGE_KEY = "ew-scanner-watchlists";
const MAX_WATCHLISTS = 20;
const MAX_ITEMS_PER_LIST = 100;

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function loadWatchlists(): Watchlist[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Watchlist[];
  } catch {
    return [];
  }
}

function persist(watchlists: Watchlist[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlists));
}

export function saveWatchlist(name: string): Watchlist | null {
  if (!isClient()) return null;
  const now = new Date().toISOString();
  const wl: Watchlist = {
    id: `wl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    createdAt: now,
    updatedAt: now,
    items: [],
  };
  const existing = loadWatchlists();
  existing.unshift(wl);
  persist(existing.slice(0, MAX_WATCHLISTS));
  return wl;
}

export function deleteWatchlist(id: string): void {
  if (!isClient()) return;
  persist(loadWatchlists().filter((w) => w.id !== id));
}

export function renameWatchlist(id: string, name: string): void {
  if (!isClient()) return;
  const lists = loadWatchlists();
  const wl = lists.find((w) => w.id === id);
  if (!wl) return;
  wl.name = name;
  wl.updatedAt = new Date().toISOString();
  persist(lists);
}

export function addToWatchlist(
  watchlistId: string,
  candidate: EnhancedScoredCandidate,
  mode: ScannerMode
): boolean {
  if (!isClient()) return false;
  const lists = loadWatchlists();
  const wl = lists.find((w) => w.id === watchlistId);
  if (!wl) return false;
  if (wl.items.length >= MAX_ITEMS_PER_LIST) return false;
  if (wl.items.some((i) => i.ticker === candidate.ticker)) return false;

  const item: WatchlistItem = {
    ticker: candidate.ticker,
    name: candidate.name,
    sector: candidate.sector,
    addedAt: new Date().toISOString(),
    scoreAtAdd: candidate.enhancedNormalized,
    confidenceAtAdd: candidate.confidenceTier,
    mode,
  };
  wl.items.push(item);
  wl.updatedAt = new Date().toISOString();
  persist(lists);
  return true;
}

export function removeFromWatchlist(watchlistId: string, ticker: string): void {
  if (!isClient()) return;
  const lists = loadWatchlists();
  const wl = lists.find((w) => w.id === watchlistId);
  if (!wl) return;
  wl.items = wl.items.filter((i) => i.ticker !== ticker);
  wl.updatedAt = new Date().toISOString();
  persist(lists);
}

export function getWatchlistTickers(watchlistId: string): string[] {
  const lists = loadWatchlists();
  const wl = lists.find((w) => w.id === watchlistId);
  return wl ? wl.items.map((i) => i.ticker) : [];
}
