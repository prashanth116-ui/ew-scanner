/**
 * Phase 2 Wave Scanner — watchlist persistence.
 * Stores named watchlists of tickers in localStorage.
 */

const STORAGE_KEY = "p2-watchlists";
const MAX_WATCHLISTS = 20;
const MAX_TICKERS_PER_LIST = 100;

export interface P2Watchlist {
  id: string;
  name: string;
  tickers: string[];
  createdAt: number;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

function genId(): string {
  return `p2wl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function persist(watchlists: P2Watchlist[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlists));
  } catch {
    // Quota exceeded — ignore
  }
}

export function loadWatchlists(): P2Watchlist[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as P2Watchlist[];
  } catch {
    return [];
  }
}

export function saveWatchlist(name: string): P2Watchlist | null {
  if (!isClient()) return null;
  const wl: P2Watchlist = {
    id: genId(),
    name,
    tickers: [],
    createdAt: Date.now(),
  };
  const existing = loadWatchlists();
  if (existing.length >= MAX_WATCHLISTS) return null;
  existing.unshift(wl);
  persist(existing);
  return wl;
}

export function deleteWatchlist(id: string): void {
  if (!isClient()) return;
  persist(loadWatchlists().filter((w) => w.id !== id));
}

export function addTickerToWatchlist(id: string, ticker: string): boolean {
  if (!isClient()) return false;
  const lists = loadWatchlists();
  const wl = lists.find((w) => w.id === id);
  if (!wl) return false;
  if (wl.tickers.length >= MAX_TICKERS_PER_LIST) return false;
  if (wl.tickers.includes(ticker)) return false;
  wl.tickers.push(ticker);
  persist(lists);
  return true;
}

export function removeTickerFromWatchlist(id: string, ticker: string): void {
  if (!isClient()) return;
  const lists = loadWatchlists();
  const wl = lists.find((w) => w.id === id);
  if (!wl) return;
  wl.tickers = wl.tickers.filter((t) => t !== ticker);
  persist(lists);
}
