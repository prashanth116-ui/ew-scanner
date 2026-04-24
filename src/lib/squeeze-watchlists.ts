import type { SqueezeWatchlist, SqueezeWatchlistItem, ScoredSqueezeCandidate } from "./ew-types";

const STORAGE_KEY = "ew-scanner-squeeze-watchlists";
const MAX_WATCHLISTS = 20;
const MAX_ITEMS_PER_LIST = 100;

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function loadSqueezeWatchlists(): SqueezeWatchlist[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SqueezeWatchlist[];
  } catch {
    return [];
  }
}

function persist(watchlists: SqueezeWatchlist[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlists));
}

export function saveSqueezeWatchlist(name: string): SqueezeWatchlist | null {
  if (!isClient()) return null;
  const now = new Date().toISOString();
  const wl: SqueezeWatchlist = {
    id: `swl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    createdAt: now,
    updatedAt: now,
    items: [],
  };
  const existing = loadSqueezeWatchlists();
  existing.unshift(wl);
  persist(existing.slice(0, MAX_WATCHLISTS));
  return wl;
}

export function deleteSqueezeWatchlist(id: string): void {
  if (!isClient()) return;
  persist(loadSqueezeWatchlists().filter((w) => w.id !== id));
}

export function renameSqueezeWatchlist(id: string, name: string): void {
  if (!isClient()) return;
  const lists = loadSqueezeWatchlists();
  const wl = lists.find((w) => w.id === id);
  if (!wl) return;
  wl.name = name;
  wl.updatedAt = new Date().toISOString();
  persist(lists);
}

export function addToSqueezeWatchlist(
  watchlistId: string,
  candidate: ScoredSqueezeCandidate
): boolean {
  if (!isClient()) return false;
  const lists = loadSqueezeWatchlists();
  const wl = lists.find((w) => w.id === watchlistId);
  if (!wl) return false;
  if (wl.items.length >= MAX_ITEMS_PER_LIST) return false;
  if (wl.items.some((i) => i.ticker === candidate.ticker)) return false;

  const siPct = candidate.shortPercentOfFloat ?? 0;
  const item: SqueezeWatchlistItem = {
    ticker: candidate.ticker,
    name: candidate.name,
    addedAt: new Date().toISOString(),
    scoreAtAdd: candidate.squeezeScore,
    siPercentAtAdd: siPct > 1 ? siPct : siPct * 100,
    tierAtAdd: candidate.tier,
  };
  wl.items.push(item);
  wl.updatedAt = new Date().toISOString();
  persist(lists);
  return true;
}

export function removeFromSqueezeWatchlist(watchlistId: string, ticker: string): void {
  if (!isClient()) return;
  const lists = loadSqueezeWatchlists();
  const wl = lists.find((w) => w.id === watchlistId);
  if (!wl) return;
  wl.items = wl.items.filter((i) => i.ticker !== ticker);
  wl.updatedAt = new Date().toISOString();
  persist(lists);
}
