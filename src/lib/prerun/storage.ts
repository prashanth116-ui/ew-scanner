/**
 * Pre-Run localStorage persistence.
 * Mirrors the squeeze-storage.ts / squeeze-watchlists.ts pattern.
 */

import type {
  PreRunWatchlistItem,
  PreRunAlert,
  PreRunHistoryEntry,
  PreRunResult,
  PreRunVerdict,
  PreRunRisk,
  SavedPreRunScan,
  PreRunFilters,
} from "./types";

const WATCHLIST_KEY = "ew-scanner-prerun-watchlist";
const ALERTS_KEY = "ew-scanner-prerun-alerts";
const HISTORY_KEY = "ew-scanner-prerun-history";
const SCANS_KEY = "ew-scanner-prerun-scans";
const SCAN_RESULTS_KEY = "ew-scanner-prerun-scan-results";
const MAX_ALERTS = 200;
const MAX_HISTORY = 500;
const MAX_SCANS = 30;

function isClient(): boolean {
  return typeof window !== "undefined";
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Watchlist ──

export function loadPreRunWatchlist(): PreRunWatchlistItem[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PreRunWatchlistItem[];
  } catch {
    return [];
  }
}

function persistWatchlist(items: PreRunWatchlistItem[]): void {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
}

export function addToPreRunWatchlist(
  result: PreRunResult,
  overrides: {
    gate2Pass?: boolean;
    scoreC?: number;
    scoreG?: number;
    stopLoss?: number;
    thesis?: string;
    catalystDescription?: string;
    riskLevel?: PreRunRisk;
  } = {}
): PreRunWatchlistItem | null {
  if (!isClient()) return null;

  const items = loadPreRunWatchlist();
  if (items.some((i) => i.ticker === result.data.ticker)) return null;

  const now = new Date().toISOString();
  const item: PreRunWatchlistItem = {
    id: genId("prw"),
    ticker: result.data.ticker,
    companyName: result.data.companyName,
    verdict: result.verdict,
    riskLevel: overrides.riskLevel ?? "MEDIUM",
    stopLoss: overrides.stopLoss ?? 0,
    thesis: overrides.thesis ?? "",
    catalystDescription: overrides.catalystDescription ?? "",
    gate2Pass: overrides.gate2Pass ?? true,
    scoreC: overrides.scoreC ?? result.scores.scoreC,
    scoreG: overrides.scoreG ?? result.scores.scoreG,
    notes: "",
    addedAt: now,
    updatedAt: now,
  };

  items.unshift(item);
  persistWatchlist(items);

  addPreRunHistory(result.data.ticker, "added", "", result.verdict, `Score: ${result.scores.finalScore}`);

  return item;
}

export function updatePreRunWatchlistItem(
  id: string,
  updates: Partial<Pick<PreRunWatchlistItem, "verdict" | "riskLevel" | "stopLoss" | "thesis" | "catalystDescription" | "gate2Pass" | "scoreC" | "scoreG" | "notes">>
): void {
  if (!isClient()) return;
  const items = loadPreRunWatchlist();
  const item = items.find((i) => i.id === id);
  if (!item) return;

  const oldVerdict = item.verdict;
  Object.assign(item, updates, { updatedAt: new Date().toISOString() });

  if (updates.verdict && updates.verdict !== oldVerdict) {
    addPreRunHistory(item.ticker, "verdict_change", oldVerdict, updates.verdict);
  }

  persistWatchlist(items);
}

export function removeFromPreRunWatchlist(id: string): void {
  if (!isClient()) return;
  const items = loadPreRunWatchlist();
  const item = items.find((i) => i.id === id);
  if (item) {
    addPreRunHistory(item.ticker, "removed", item.verdict, "", "Removed from watchlist");
  }
  persistWatchlist(items.filter((i) => i.id !== id));
}

// ── Alerts ──

export function loadPreRunAlerts(): PreRunAlert[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PreRunAlert[];
  } catch {
    return [];
  }
}

function persistAlerts(alerts: PreRunAlert[]): void {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

export function addPreRunAlert(
  ticker: string,
  alertType: string,
  message: string,
  price?: number,
  stopLoss?: number
): PreRunAlert {
  const alert: PreRunAlert = {
    id: genId("pra"),
    ticker,
    alertType,
    message,
    price: price ?? null,
    stopLoss: stopLoss ?? null,
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  const alerts = loadPreRunAlerts();
  alerts.unshift(alert);
  persistAlerts(alerts.slice(0, MAX_ALERTS));
  return alert;
}

export function markAlertRead(id: string): void {
  if (!isClient()) return;
  const alerts = loadPreRunAlerts();
  const alert = alerts.find((a) => a.id === id);
  if (alert) {
    alert.isRead = true;
    persistAlerts(alerts);
  }
}

export function getUnreadAlertCount(): number {
  return loadPreRunAlerts().filter((a) => !a.isRead).length;
}

// ── History ──

export function loadPreRunHistory(): PreRunHistoryEntry[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PreRunHistoryEntry[];
  } catch {
    return [];
  }
}

function persistHistory(entries: PreRunHistoryEntry[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

export function addPreRunHistory(
  ticker: string,
  changeType: string,
  fromValue: string,
  toValue: string,
  notes = ""
): void {
  if (!isClient()) return;
  const entry: PreRunHistoryEntry = {
    id: genId("prh"),
    ticker,
    changeType,
    fromValue,
    toValue,
    notes,
    changedAt: new Date().toISOString(),
  };
  const history = loadPreRunHistory();
  history.unshift(entry);
  persistHistory(history.slice(0, MAX_HISTORY));
}

// ── Saved Scans ──

export function savePreRunScan(
  name: string,
  filters: PreRunFilters,
  candidates: PreRunResult[]
): SavedPreRunScan | null {
  if (!isClient()) return null;

  const scan: SavedPreRunScan = {
    id: genId("prs"),
    name,
    savedAt: new Date().toISOString(),
    filters,
    candidateCount: candidates.length,
    candidates,
  };

  const existing = loadPreRunScans();
  existing.unshift(scan);
  const trimmed = existing.slice(0, MAX_SCANS);
  localStorage.setItem(SCANS_KEY, JSON.stringify(trimmed));
  return scan;
}

export function loadPreRunScans(): SavedPreRunScan[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(SCANS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedPreRunScan[];
  } catch {
    return [];
  }
}

export function deletePreRunScan(id: string): void {
  if (!isClient()) return;
  const scans = loadPreRunScans().filter((s) => s.id !== id);
  localStorage.setItem(SCANS_KEY, JSON.stringify(scans));
}

// ── Scan Results (nightly cache) ──

interface ScanResultsCache {
  date: string;
  results: PreRunResult[];
}

export function loadScanResults(): PreRunResult[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(SCAN_RESULTS_KEY);
    if (!raw) return [];
    const cache = JSON.parse(raw) as ScanResultsCache;
    return cache.results ?? [];
  } catch {
    return [];
  }
}

export function saveScanResults(results: PreRunResult[]): void {
  if (!isClient()) return;
  const cache: ScanResultsCache = {
    date: new Date().toISOString(),
    results,
  };
  localStorage.setItem(SCAN_RESULTS_KEY, JSON.stringify(cache));
}

// ── Seed watchlist (runs once if watchlist empty) ──

export function seedWatchlistIfEmpty(): void {
  if (!isClient()) return;
  const existing = loadPreRunWatchlist();
  if (existing.length > 0) return;

  const seeds: Omit<PreRunWatchlistItem, "id" | "addedAt" | "updatedAt">[] = [
    { ticker: "HTZ", companyName: "Hertz Global Holdings", verdict: "KEEP" as PreRunVerdict, riskLevel: "HIGH" as PreRunRisk, stopLoss: 5.50, gate2Pass: true, scoreC: 2, scoreG: 1, thesis: "CAR replay — 18%+ short float, TSA chaos driving rental demand, EBITDA turning positive", catalystDescription: "TSA staffing crisis pushing travelers to rent cars. Same setup as CAR before its 264% run.", notes: "" },
    { ticker: "SMCI", companyName: "Super Micro Computer", verdict: "KEEP" as PreRunVerdict, riskLevel: "VERY_HIGH" as PreRunRisk, stopLoss: 20.00, gate2Pass: false, scoreC: 2, scoreG: 1, thesis: "+123% revenue, fwd P/E 9x, legal cloud creates entry discount", catalystDescription: "AI server demand structural. Co-founder indictment (not company) keeps stock cheap.", notes: "" },
    { ticker: "ON", companyName: "ON Semiconductor", verdict: "KEEP" as PreRunVerdict, riskLevel: "MEDIUM" as PreRunRisk, stopLoss: 64.00, gate2Pass: true, scoreC: 2, scoreG: 0, thesis: "$6B buyback, PEG 0.51, AI+EV inflection, approaching 52w high breakout", catalystDescription: "vGaN chips reduce AI datacenter power loss 50%. $44B TAM at 18% CAGR.", notes: "" },
    { ticker: "VG", companyName: "Venture Global LNG", verdict: "KEEP" as PreRunVerdict, riskLevel: "MEDIUM" as PreRunRisk, stopLoss: 10.00, gate2Pass: true, scoreC: 2, scoreG: 2, thesis: "Iran conflict = structural LNG demand shift. 14x earnings, profitable", catalystDescription: "Iran conflict structurally altered global LNG supply. US LNG becomes premium asset.", notes: "" },
    { ticker: "OKLO", companyName: "Oklo Inc", verdict: "WATCH" as PreRunVerdict, riskLevel: "VERY_HIGH" as PreRunRisk, stopLoss: 44.00, gate2Pass: true, scoreC: 2, scoreG: 1, thesis: "First NRC approval (isotopes). Meta 1.2GW deal. July 4 reactor criticality hard catalyst", catalystDescription: "First NRC materials license received March 2026 = narrative shift from never to when.", notes: "" },
    { ticker: "MP", companyName: "MP Materials", verdict: "WATCH" as PreRunVerdict, riskLevel: "MEDIUM" as PreRunRisk, stopLoss: 22.00, gate2Pass: true, scoreC: 2, scoreG: 1, thesis: "China REE export ban = structural tailwind. Only US rare earth miner at scale", catalystDescription: "China banned rare earth exports 2025. MP is only US producer. DoD backed.", notes: "" },
    { ticker: "PLUG", companyName: "Plug Power", verdict: "WATCH" as PreRunVerdict, riskLevel: "HIGH" as PreRunRisk, stopLoss: 2.50, gate2Pass: true, scoreC: 2, scoreG: 0, thesis: "New CEO, first positive gross margin, EBITDA breakeven 2026 target", catalystDescription: "Q4 2025 gross margin +2.4% — 125pp improvement. New CEO profitability roadmap.", notes: "" },
    { ticker: "IREN", companyName: "IREN Limited", verdict: "WATCH" as PreRunVerdict, riskLevel: "HIGH" as PreRunRisk, stopLoss: 28.00, gate2Pass: true, scoreC: 2, scoreG: 1, thesis: "Run done, re-basing. Wait for two clean earnings beats before re-entry", catalystDescription: "$9.7B Microsoft contract + 150K NVIDIA B300 GPUs on order. Execution lagging narrative.", notes: "" },
    { ticker: "CRDO", companyName: "Credo Technology", verdict: "WATCH" as PreRunVerdict, riskLevel: "HIGH" as PreRunRisk, stopLoss: 0, gate2Pass: true, scoreC: 2, scoreG: 0, thesis: "Run done ($33→$158). Wait for pullback to $120-130 for re-entry setup", catalystDescription: "DustPhotonics acquisition + Jefferies Buy initiation. 70% AEC market share.", notes: "" },
  ];

  const now = new Date().toISOString();
  const items: PreRunWatchlistItem[] = seeds.map((s) => ({
    ...s,
    id: genId("prw"),
    addedAt: now,
    updatedAt: now,
  }));

  persistWatchlist(items);
}
