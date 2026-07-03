import type { StratWatchlist, StratWatchlistItem, StratResult } from "./types";

const STORAGE_KEY = "quantradar-strat-watchlists";
const MAX_WATCHLISTS = 20;
const MAX_ITEMS_PER_LIST = 100;

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function loadStratWatchlists(): StratWatchlist[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StratWatchlist[];
  } catch {
    return [];
  }
}

function persist(watchlists: StratWatchlist[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlists));
}

export function saveStratWatchlist(name: string): StratWatchlist | null {
  if (!isClient()) return null;
  const now = new Date().toISOString();
  const wl: StratWatchlist = {
    id: `stw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    createdAt: now,
    updatedAt: now,
    items: [],
  };
  const existing = loadStratWatchlists();
  existing.unshift(wl);
  persist(existing.slice(0, MAX_WATCHLISTS));
  return wl;
}

export function deleteStratWatchlist(id: string): void {
  if (!isClient()) return;
  persist(loadStratWatchlists().filter((w) => w.id !== id));
}

export function renameStratWatchlist(id: string, name: string): void {
  if (!isClient()) return;
  const lists = loadStratWatchlists();
  const wl = lists.find((w) => w.id === id);
  if (!wl) return;
  wl.name = name;
  wl.updatedAt = new Date().toISOString();
  persist(lists);
}

function getDominantDirection(result: StratResult): "BULL" | "BEAR" | "MIXED" {
  const bullCount = result.combos.filter((c) => c.isActionable && c.direction === "BULL").length;
  const bearCount = result.combos.filter((c) => c.isActionable && c.direction === "BEAR").length;
  if (bullCount > 0 && bearCount > 0) return "MIXED";
  if (bullCount > 0) return "BULL";
  if (bearCount > 0) return "BEAR";
  // Fall back to TFC
  if (result.tfc.alignment === "FULL_BULL") return "BULL";
  if (result.tfc.alignment === "FULL_BEAR") return "BEAR";
  return "MIXED";
}

export function addToStratWatchlist(
  watchlistId: string,
  result: StratResult
): boolean {
  if (!isClient()) return false;
  const lists = loadStratWatchlists();
  const wl = lists.find((w) => w.id === watchlistId);
  if (!wl) return false;
  if (wl.items.length >= MAX_ITEMS_PER_LIST) return false;
  if (wl.items.some((i) => i.ticker === result.ticker)) return false;

  const item: StratWatchlistItem = {
    ticker: result.ticker,
    name: result.companyName,
    addedAt: new Date().toISOString(),
    scoreAtAdd: result.scores.totalScore,
    signalAtAdd: result.signal,
    tfcAtAdd: result.tfc.alignment,
    directionAtAdd: getDominantDirection(result),
    longTrigger: result.triggers.longTrigger,
    shortTrigger: result.triggers.shortTrigger,
  };
  wl.items.push(item);
  wl.updatedAt = new Date().toISOString();
  persist(lists);
  return true;
}

export function removeFromStratWatchlist(watchlistId: string, ticker: string): void {
  if (!isClient()) return;
  const lists = loadStratWatchlists();
  const wl = lists.find((w) => w.id === watchlistId);
  if (!wl) return;
  wl.items = wl.items.filter((i) => i.ticker !== ticker);
  wl.updatedAt = new Date().toISOString();
  persist(lists);
}
