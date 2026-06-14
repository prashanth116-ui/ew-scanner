"use client";

import { useState, useCallback, useEffect, useMemo, useRef, memo, Suspense } from "react";
import {
  Search,
  Loader2,
  X,
  ArrowUpDown,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Download,
  Waves,
  Save,
  Trash2,
  Plus,
  Star,
  List,
} from "lucide-react";
import type { PriceSeries } from "@/lib/ew-types";
import {
  detectElliottWaves,
  detectNearMisses,
  type P2ImpulsePattern,
  type P2ElliottWaveResult,
  type P2FibTargets,
  type P2NearMissPattern,
  waveLength,
} from "@/lib/phase2-wave-detector";
import {
  WAVE_SCANNER_MODES,
  filterByMode,
  findNearestFib,
  type WaveScannerMode,
  type WaveScanResult,
  type NearMissScanResult,
} from "@/lib/phase2-scanner-modes";
import { WAVE_UNIVERSES, WAVE_UNIVERSE_KEYS, type WaveUniverseKey } from "@/data/phase2-universes";
import { ScannerCTA } from "@/components/scanner-cta";
import { useSidebarState } from "@/lib/use-sidebar-state";
import { useCollapsibleSections } from "@/lib/use-collapsible-sections";
import { SidebarShell } from "@/components/sidebar-shell";
import { SidebarSection } from "@/components/sidebar-section";
import { ProgressBar } from "@/components/progress-bar";
import { TickerSearchInput } from "@/components/ticker-search-input";
import { loadFromCache, saveToCache } from "@/lib/scan-cache";
import { CopyButton } from "@/components/copy-button";
import { StalenessLabel } from "@/components/staleness-label";
import { usePersistedFilter, clearPersistedFilters } from "@/lib/use-filter-persistence";
import { WaveSparkline } from "@/components/wave-sparkline";
import {
  loadWatchlists,
  saveWatchlist,
  deleteWatchlist,
  addTickerToWatchlist,
  type P2Watchlist,
} from "@/lib/phase2-watchlist";
import {
  loadSavedScans,
  saveScan,
  deleteScan,
  type P2SavedScan,
} from "@/lib/phase2-saved-scans";

const ACCENT = "#8b5cf6"; // purple for wave scanner
const BATCH_SIZE = 15;
const BATCH_DELAY = 500;
const CACHE_KEY = "ew-wave-scan-v1";
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

type SortKey = "confidence" | "direction" | "scale" | "ticker" | "impulseRange";
type SortDir = "asc" | "desc";
type Timeframe = "weekly" | "daily";

// ── Helpers ──

function directionLabel(dir: 1 | -1): string {
  return dir === 1 ? "BULL" : "BEAR";
}

function directionColor(dir: 1 | -1): string {
  return dir === 1 ? "text-green-400" : "text-red-400";
}

function confidenceBg(conf: number): string {
  if (conf >= 70) return "bg-green-500/15 text-green-400 border-green-500/30";
  if (conf >= 50) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-[#1a1a1a] text-[#888] border-[#333]";
}

function waveStatusLabel(p: P2ImpulsePattern): string {
  if (p.correction) return `ABC ${p.correction.correctionType}`;
  return "Impulse active";
}

function waveStatusColor(p: P2ImpulsePattern): string {
  if (p.correction) return "text-cyan-400";
  return "text-amber-400";
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(0);
  if (price >= 100) return price.toFixed(1);
  return price.toFixed(2);
}

// Grouped result: one per ticker, best pattern first, extras in additionalPatterns
interface GroupedResult {
  ticker: string;
  name: string;
  sector?: string;
  currentPrice: number;
  best: WaveScanResult;
  additionalPatterns: WaveScanResult[];
  patternCount: number;
}

function groupResultsByTicker(results: WaveScanResult[]): GroupedResult[] {
  const map = new Map<string, WaveScanResult[]>();
  for (const r of results) {
    const existing = map.get(r.ticker);
    if (existing) existing.push(r);
    else map.set(r.ticker, [r]);
  }

  const groups: GroupedResult[] = [];
  for (const [ticker, patterns] of map) {
    patterns.sort((a, b) => b.pattern.confidence - a.pattern.confidence);
    groups.push({
      ticker,
      name: patterns[0].name,
      sector: patterns[0].sector,
      currentPrice: patterns[0].currentPrice,
      best: patterns[0],
      additionalPatterns: patterns.slice(1),
      patternCount: patterns.length,
    });
  }
  return groups;
}

// ── Page wrapper ──

export default function WaveScannerPageWrapper() {
  return (
    <>
      <Suspense fallback={null}>
        <WaveScannerPage />
      </Suspense>
      <ScannerCTA />
    </>
  );
}

// ── Main page ──

function WaveScannerPage() {
  // Filters (persisted)
  const [mode, setMode] = usePersistedFilter<WaveScannerMode>("ew-filter:wave:mode", "activeImpulse");
  const [universe, setUniverse] = usePersistedFilter<string>("ew-filter:wave:universe", "Futures");
  const [timeframe, setTimeframe] = usePersistedFilter<Timeframe>("ew-filter:wave:timeframe", "weekly");
  const [scales, setScales] = usePersistedFilter<number[]>("ew-filter:wave:scales", [3, 5, 8]);
  const [minConfidence, setMinConfidence] = usePersistedFilter<number>("ew-filter:wave:minConf", 40);
  const [directionFilter, setDirectionFilter] = usePersistedFilter<"bull" | "bear" | "all">("ew-filter:wave:dir", "all");
  const [correctionTypeFilter, setCorrectionTypeFilter] = usePersistedFilter<"all" | "zigzag" | "flat">("ew-filter:wave:corrType", "all");

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [scannedCount, setScannedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [rawResults, setRawResults] = useState<WaveScanResult[]>([]);
  const [nearMissResults, setNearMissResults] = useState<NearMissScanResult[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const scanAbort = useRef<AbortController | null>(null);

  // Ticker search
  const [tickerSearch, setTickerSearch] = useState("");
  const [tickerSearching, setTickerSearching] = useState(false);
  const [tickerError, setTickerError] = useState<string | null>(null);
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());

  // Sort
  const [sortKey, setSortKey] = usePersistedFilter<SortKey>("ew-filter:wave:sortKey", "confidence");
  const [sortDir, setSortDir] = usePersistedFilter<SortDir>("ew-filter:wave:sortDir", "desc");

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useSidebarState("wave");
  const { collapsed, toggleSection } = useCollapsibleSections(undefined, "wave");

  // Expanded rows
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Watchlists
  const [watchlists, setWatchlists] = useState<P2Watchlist[]>([]);
  const [selectedWatchlist, setSelectedWatchlist] = useState<string>("");
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [addToWatchlistId, setAddToWatchlistId] = useState<string>("");
  const [deleteWlConfirm, setDeleteWlConfirm] = useState<string | null>(null);

  // Saved scans
  const [savedScans, setSavedScans] = useState<P2SavedScan[]>([]);
  const [saveScanName, setSaveScanName] = useState("");
  const [deleteScConfirm, setDeleteScConfirm] = useState<string | null>(null);

  // Load cache, watchlists, saved scans on mount
  useEffect(() => {
    const cached = loadFromCache<WaveScanResult[]>(CACHE_KEY, CACHE_TTL);
    if (cached && cached.length > 0) setRawResults(cached);
    setWatchlists(loadWatchlists());
    setSavedScans(loadSavedScans());
  }, []);

  useEffect(() => {
    return () => { scanAbort.current?.abort(); };
  }, []);

  // Available scales for current timeframe
  const scaleOptions = useMemo(() => {
    return timeframe === "weekly" ? [3, 5, 8] : [4, 8, 16];
  }, [timeframe]);

  // When timeframe changes, reset scales to defaults
  useEffect(() => {
    setScales(timeframe === "weekly" ? [3, 5, 8] : [4, 8, 16]);
  }, [timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter + sort results (non near-miss modes)
  const filtered = useMemo(() => {
    if (mode === "nearMiss") return [];
    return rawResults.filter((r) => {
      if (manualTickers.has(r.ticker)) return true;
      if (r.pattern.confidence < minConfidence) return false;
      if (directionFilter === "bull" && r.pattern.direction !== 1) return false;
      if (directionFilter === "bear" && r.pattern.direction !== -1) return false;

      switch (mode) {
        case "activeImpulse":
          if (r.pattern.correction !== null) return false;
          break;
        case "postCorrection":
          if (r.pattern.correction === null) return false;
          if (correctionTypeFilter !== "all" && r.pattern.correction.correctionType !== correctionTypeFilter) return false;
          break;
        case "correctionEntry": {
          // Show patterns where current price is in the fib retracement zone (23.6%-78.6%)
          const fibs = r.fibTargets;
          if (!fibs || fibs.levels.length < 2) return false;
          const fib236 = fibs.levels.find((l) => l.ratio === 0.236);
          const fib786 = fibs.levels.find((l) => l.ratio === 0.786);
          if (!fib236 || !fib786) return false;
          const lo = Math.min(fib236.price, fib786.price);
          const hi = Math.max(fib236.price, fib786.price);
          if (r.currentPrice < lo || r.currentPrice > hi) return false;
          break;
        }
        case "highConfidence":
          if (r.pattern.confidence < 70) return false;
          break;
      }

      return true;
    });
  }, [rawResults, mode, minConfidence, directionFilter, correctionTypeFilter, manualTickers]);

  // Group by ticker
  const grouped = useMemo(() => groupResultsByTicker(filtered), [filtered]);

  const sortedGroups = useMemo(() => {
    const arr = [...grouped];
    arr.sort((a, b) => {
      let cmp = 0;
      const ar = a.best, br = b.best;
      switch (sortKey) {
        case "confidence":
          cmp = ar.pattern.confidence - br.pattern.confidence;
          break;
        case "direction":
          cmp = ar.pattern.direction - br.pattern.direction;
          break;
        case "scale":
          cmp = ar.pattern.scale - br.pattern.scale;
          break;
        case "ticker":
          cmp = a.ticker.localeCompare(b.ticker);
          break;
        case "impulseRange":
          cmp = (ar.fibTargets?.impulseRange ?? 0) - (br.fibTargets?.impulseRange ?? 0);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [grouped, sortKey, sortDir]);

  // Filtered near-miss results
  const filteredNearMisses = useMemo(() => {
    if (mode !== "nearMiss") return [];
    return nearMissResults.filter((r) => {
      if (directionFilter === "bull" && r.direction !== 1) return false;
      if (directionFilter === "bear" && r.direction !== -1) return false;
      return true;
    });
  }, [nearMissResults, mode, directionFilter]);

  // Stats
  const stats = useMemo(() => {
    let bull = 0, bear = 0, withCorrection = 0, highConf = 0;
    for (const r of rawResults) {
      if (r.pattern.direction === 1) bull++;
      else bear++;
      if (r.pattern.correction) withCorrection++;
      if (r.pattern.confidence >= 70) highConf++;
    }
    return { total: filtered.length, rawTotal: rawResults.length, bull, bear, withCorrection, highConf, nearMissCount: nearMissResults.length };
  }, [rawResults, filtered, nearMissResults]);

  // ── Fetch OHLCV and detect waves for a single ticker ──
  const scanTicker = useCallback(async (
    ticker: string,
    name: string,
    sector: string | undefined,
    tf: Timeframe,
    scaleList: number[],
    signal: AbortSignal,
  ): Promise<WaveScanResult[]> => {
    const url = `/api/quote?ticker=${encodeURIComponent(ticker)}&detail=1${tf === "daily" ? "&mtf=1" : ""}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];

    const data = await res.json();
    const series: PriceSeries | null = tf === "weekly"
      ? data.series ?? null
      : data.dailySeries ?? null;

    if (!series || !series.close || series.close.length < 20) return [];

    const currentPrice = series.close[series.close.length - 1];
    const ewResult = detectElliottWaves(series, scaleList);

    const results: WaveScanResult[] = [];
    for (let idx = 0; idx < ewResult.patterns.length; idx++) {
      const pattern = ewResult.patterns[idx];
      if (!pattern.isValid) continue;

      const fibs = ewResult.fibTargets.get(idx) ?? null;
      const nearest = fibs ? findNearestFib(fibs, currentPrice) : null;

      results.push({
        ticker,
        name,
        sector,
        pattern,
        fibTargets: fibs,
        currentPrice,
        nearestFibLabel: nearest?.label ?? null,
        nearestFibDistance: nearest?.distance ?? null,
      });
    }

    return results;
  }, []);

  // ── Scan ticker for near-misses ──
  const scanTickerNearMiss = useCallback(async (
    ticker: string,
    name: string,
    sector: string | undefined,
    tf: Timeframe,
    scaleList: number[],
    signal: AbortSignal,
  ): Promise<NearMissScanResult[]> => {
    const url = `/api/quote?ticker=${encodeURIComponent(ticker)}&detail=1${tf === "daily" ? "&mtf=1" : ""}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];

    const data = await res.json();
    const series: PriceSeries | null = tf === "weekly"
      ? data.series ?? null
      : data.dailySeries ?? null;

    if (!series || !series.close || series.close.length < 20) return [];

    const currentPrice = series.close[series.close.length - 1];
    const nearMisses = detectNearMisses(series, scaleList);

    return nearMisses.map((nm) => ({
      ticker,
      name,
      sector,
      direction: nm.direction,
      scale: nm.scale,
      failingRule: nm.failingRule,
      rulesPassed: nm.ruleResults.passCount,
      w0Price: nm.waves.w0.price,
      w5Price: nm.waves.w5.price,
      currentPrice,
    }));
  }, []);

  // ── Get tickers to scan (universe or watchlist) ──
  const getTickersToScan = useCallback(() => {
    if (selectedWatchlist) {
      const wl = watchlists.find((w) => w.id === selectedWatchlist);
      if (wl) {
        return wl.tickers.map((t) => ({ symbol: t, name: t, sector: undefined }));
      }
    }
    return WAVE_UNIVERSES[universe] ?? [];
  }, [universe, selectedWatchlist, watchlists]);

  // ── Batch scan ──
  const runScan = useCallback(async (force = false) => {
    scanAbort.current?.abort();
    const controller = new AbortController();
    scanAbort.current = controller;
    const signal = controller.signal;

    setScanning(true);
    setScannedCount(0);
    setFailedCount(0);

    const tickers = getTickersToScan();
    if (tickers.length === 0) {
      setScanning(false);
      return;
    }

    const isNearMissMode = mode === "nearMiss";

    // Incremental: reuse cached results unless force
    let existingResults: WaveScanResult[] = [];
    let existingNearMisses: NearMissScanResult[] = [];
    let tickersToScan = tickers;

    if (!force && !isNearMissMode && rawResults.length > 0) {
      const cachedSymbols = new Set(rawResults.map((r) => r.ticker));
      tickersToScan = tickers.filter((t) => !cachedSymbols.has(t.symbol));
      const universeSymbols = new Set(tickers.map((t) => t.symbol));
      existingResults = rawResults.filter((r) => universeSymbols.has(r.ticker));

      if (tickersToScan.length === 0) {
        setRawResults(existingResults);
        setScanning(false);
        setProgress("");
        return;
      }
    } else if (!isNearMissMode) {
      setRawResults([]);
    }

    if (isNearMissMode) {
      setNearMissResults([]);
    }

    setTotalCount(tickersToScan.length);

    const newResults: WaveScanResult[] = [];
    const newNearMisses: NearMissScanResult[] = [];

    for (let i = 0; i < tickersToScan.length; i += BATCH_SIZE) {
      if (signal.aborted) break;
      const batch = tickersToScan.slice(i, i + BATCH_SIZE);
      setProgress(`Scanning ${Math.min(i + BATCH_SIZE, tickersToScan.length)}/${tickersToScan.length}...`);

      if (isNearMissMode) {
        let batchFailed = 0;
        const promises = batch.map((t) =>
          scanTickerNearMiss(t.symbol, t.name, t.sector, timeframe, scales, signal).catch(() => { batchFailed++; return [] as NearMissScanResult[]; })
        );
        const batchResults = await Promise.all(promises);
        for (const results of batchResults) {
          newNearMisses.push(...results);
        }
        setFailedCount((prev) => prev + batchFailed);
        setNearMissResults([...newNearMisses]);
      } else {
        let batchFailed2 = 0;
        const promises = batch.map((t) =>
          scanTicker(t.symbol, t.name, t.sector, timeframe, scales, signal).catch(() => { batchFailed2++; return [] as WaveScanResult[]; })
        );
        const batchResults = await Promise.all(promises);
        for (const results of batchResults) {
          newResults.push(...results);
        }
        setFailedCount((prev) => prev + batchFailed2);

        setScannedCount(Math.min(i + BATCH_SIZE, tickersToScan.length));
        const newSymbols = new Set(newResults.map((r) => r.ticker));
        const merged = [
          ...existingResults.filter((r) => !newSymbols.has(r.ticker)),
          ...newResults,
        ];
        setRawResults(merged);
      }

      setScannedCount(Math.min(i + BATCH_SIZE, tickersToScan.length));

      if (i + BATCH_SIZE < tickersToScan.length && !signal.aborted) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    if (!isNearMissMode) {
      const newSymbols = new Set(newResults.map((r) => r.ticker));
      const finalResults = [
        ...existingResults.filter((r) => !newSymbols.has(r.ticker)),
        ...newResults,
      ];
      setRawResults(finalResults);
      saveToCache(CACHE_KEY, finalResults);
    }
    setScanning(false);
    setProgress("");
  }, [universe, rawResults, timeframe, scales, scanTicker, scanTickerNearMiss, mode, getTickersToScan]);

  const cancelScan = useCallback(() => {
    scanAbort.current?.abort();
    scanAbort.current = null;
    setScanning(false);
    setProgress("");
  }, []);

  // ── Ticker search ──
  const lookupInFlight = useRef<string | null>(null);

  const lookupTicker = useCallback(async () => {
    const ticker = tickerSearch.trim().toUpperCase();
    if (!ticker) return;
    if (lookupInFlight.current === ticker) return;

    if (rawResults.some((r) => r.ticker === ticker)) {
      setManualTickers((prev) => new Set(prev).add(ticker));
      setExpandedTicker(ticker);
      setTickerSearch("");
      return;
    }

    lookupInFlight.current = ticker;
    setTickerSearching(true);
    setTickerError(null);

    try {
      const results = await scanTicker(ticker, ticker, undefined, timeframe, scales, new AbortController().signal);
      if (results.length === 0) {
        setTickerError(`No wave patterns found for "${ticker}"`);
        setTickerSearching(false);
        lookupInFlight.current = null;
        return;
      }
      setRawResults((prev) => {
        const existing = new Set(prev.map((r) => `${r.ticker}:${r.pattern.scale}:${r.pattern.detectedAtBar}`));
        const newOnes = results.filter((r) => !existing.has(`${r.ticker}:${r.pattern.scale}:${r.pattern.detectedAtBar}`));
        return [...newOnes, ...prev];
      });
      setManualTickers((prev) => new Set(prev).add(ticker));
      setExpandedTicker(ticker);
      setTickerSearch("");
    } catch {
      setTickerError("Network error");
    }
    setTickerSearching(false);
    lookupInFlight.current = null;
  }, [tickerSearch, rawResults, timeframe, scales, scanTicker]);

  // Sort toggle
  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Scale toggle
  const toggleScale = useCallback(
    (s: number) => {
      setScales((prev) => {
        if (prev.includes(s)) {
          const next = prev.filter((v) => v !== s);
          return next.length === 0 ? [s] : next;
        }
        return [...prev, s].sort((a, b) => a - b);
      });
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Reset filters
  const resetFilters = useCallback(() => {
    clearPersistedFilters("ew-filter:wave");
    setMode("activeImpulse");
    setUniverse("Futures");
    setTimeframe("weekly");
    setScales([3, 5, 8]);
    setMinConfidence(40);
    setDirectionFilter("all");
    setCorrectionTypeFilter("all");
    setSelectedWatchlist("");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Export CSV
  const exportCsv = useCallback(() => {
    const header = [
      "Ticker", "Name", "Sector", "Direction", "Scale", "Confidence",
      "Wave Status", "W0 Price", "W5 Price", "Impulse Range",
      "Correction Type", "38.2%", "50.0%", "61.8%",
      "Current Price", "Nearest Fib", "Fib Distance %",
    ].join(",");

    const allResults = sortedGroups.flatMap((g) => [g.best, ...g.additionalPatterns]);
    const rows = allResults.map((r) => {
      const fibs = r.fibTargets;
      const f382 = fibs?.levels.find((l) => l.ratio === 0.382);
      const f50 = fibs?.levels.find((l) => l.ratio === 0.5);
      const f618 = fibs?.levels.find((l) => l.ratio === 0.618);
      return [
        r.ticker,
        `"${r.name.replace(/"/g, '""')}"`,
        `"${(r.sector ?? "").replace(/"/g, '""')}"`,
        directionLabel(r.pattern.direction),
        r.pattern.scale,
        r.pattern.confidence,
        `"${waveStatusLabel(r.pattern)}"`,
        formatPrice(r.pattern.waves.w0.price),
        formatPrice(r.pattern.waves.w5.price),
        fibs ? formatPrice(fibs.impulseRange) : "",
        r.pattern.correction?.correctionType ?? "",
        f382 ? formatPrice(f382.price) : "",
        f50 ? formatPrice(f50.price) : "",
        f618 ? formatPrice(f618.price) : "",
        formatPrice(r.currentPrice),
        r.nearestFibLabel ?? "",
        r.nearestFibDistance != null ? r.nearestFibDistance.toFixed(2) : "",
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wave-scan-${timeframe}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sortedGroups, timeframe]);

  // Export Excel
  const exportExcel = useCallback(async () => {
    const XLSX = await import("xlsx");
    const allResults = sortedGroups.flatMap((g) => [g.best, ...g.additionalPatterns]);
    const data = allResults.map((r) => {
      const fibs = r.fibTargets;
      const f382 = fibs?.levels.find((l) => l.ratio === 0.382);
      const f50 = fibs?.levels.find((l) => l.ratio === 0.5);
      const f618 = fibs?.levels.find((l) => l.ratio === 0.618);
      return {
        Ticker: r.ticker,
        Name: r.name,
        Sector: r.sector ?? "",
        Direction: directionLabel(r.pattern.direction),
        Scale: r.pattern.scale,
        Confidence: r.pattern.confidence,
        "Wave Status": waveStatusLabel(r.pattern),
        "W0 Price": r.pattern.waves.w0.price,
        "W5 Price": r.pattern.waves.w5.price,
        "Impulse Range": fibs?.impulseRange ?? 0,
        "Correction Type": r.pattern.correction?.correctionType ?? "",
        "38.2%": f382?.price ?? "",
        "50.0%": f50?.price ?? "",
        "61.8%": f618?.price ?? "",
        "Current Price": r.currentPrice,
        "Nearest Fib": r.nearestFibLabel ?? "",
        "Fib Distance %": r.nearestFibDistance ?? "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Wave Scan");
    XLSX.writeFile(wb, `wave-scan-${timeframe}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [sortedGroups, timeframe]);

  // Watchlist handlers
  const handleCreateWatchlist = useCallback(() => {
    const name = newWatchlistName.trim();
    if (!name) return;
    const wl = saveWatchlist(name);
    if (wl) {
      setWatchlists(loadWatchlists());
      setNewWatchlistName("");
    }
  }, [newWatchlistName]);

  const handleDeleteWatchlist = useCallback((id: string) => {
    deleteWatchlist(id);
    setWatchlists(loadWatchlists());
    if (selectedWatchlist === id) setSelectedWatchlist("");
    setDeleteWlConfirm(null);
  }, [selectedWatchlist]);

  const handleAddToWatchlist = useCallback((ticker: string) => {
    if (!addToWatchlistId) return;
    addTickerToWatchlist(addToWatchlistId, ticker);
    setWatchlists(loadWatchlists());
  }, [addToWatchlistId]);

  // Saved scan handlers
  const handleSaveScan = useCallback(() => {
    const name = saveScanName.trim();
    if (!name || rawResults.length === 0) return;
    saveScan({
      name,
      mode,
      universe,
      timeframe,
      scales: [...scales],
      minConfidence,
      direction: directionFilter,
      results: rawResults,
    });
    setSavedScans(loadSavedScans());
    setSaveScanName("");
  }, [saveScanName, rawResults, mode, universe, timeframe, scales, minConfidence, directionFilter]);

  const handleLoadSavedScan = useCallback((scan: P2SavedScan) => {
    setRawResults(scan.results);
    setMode(scan.mode);
    setTimeframe(scan.timeframe as Timeframe);
    setMinConfidence(scan.minConfidence);
    setDirectionFilter(scan.direction as "bull" | "bear" | "all");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteScan = useCallback((id: string) => {
    deleteScan(id);
    setSavedScans(loadSavedScans());
    setDeleteScConfirm(null);
  }, []);

  const universeCount = useMemo(() => {
    if (selectedWatchlist) {
      const wl = watchlists.find((w) => w.id === selectedWatchlist);
      return wl?.tickers.length ?? 0;
    }
    return (WAVE_UNIVERSES[universe] ?? []).length;
  }, [universe, selectedWatchlist, watchlists]);

  const hasResults = mode === "nearMiss" ? nearMissResults.length > 0 : rawResults.length > 0;
  const displayCount = mode === "nearMiss" ? filteredNearMisses.length : sortedGroups.length;

  return (
    <div className="flex flex-col lg:flex-row gap-4 px-2 sm:px-4 py-4 w-full">
      <SidebarShell open={sidebarOpen} onToggle={setSidebarOpen}>
        {/* Mode Selector */}
        <SidebarSection title="Scanner Mode" sectionKey="mode" collapsed={collapsed.has("mode")} onToggle={toggleSection}>
          <div className="space-y-1.5">
            {WAVE_SCANNER_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-xs transition-colors ${
                  mode === m.id
                    ? "bg-[#8b5cf6]/15 text-[#a78bfa] border border-[#8b5cf6]/30"
                    : "text-[#a0a0a0] hover:text-white border border-transparent hover:bg-[#1a1a1a]"
                }`}
              >
                <span className="font-medium">{m.label}</span>
                <p className="text-[10px] text-[#666] mt-0.5 leading-tight">{m.description}</p>
              </button>
            ))}
          </div>
        </SidebarSection>

        {/* Filters */}
        <SidebarSection
          title="Filters"
          sectionKey="filters"
          collapsed={collapsed.has("filters")}
          onToggle={toggleSection}
        >
          <div className="space-y-4">
            {/* Universe */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#a0a0a0]">Universe</span>
                <span className="text-[#666]">{universeCount}</span>
              </div>
              <select
                value={selectedWatchlist ? "__watchlist__" : universe}
                onChange={(e) => {
                  if (e.target.value === "__watchlist__") return;
                  setSelectedWatchlist("");
                  setUniverse(e.target.value);
                }}
                className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#8b5cf6] focus:outline-none"
              >
                {WAVE_UNIVERSE_KEYS.map((k) => (
                  <option key={k} value={k}>{k} ({WAVE_UNIVERSES[k].length})</option>
                ))}
              </select>
            </div>

            {/* Timeframe */}
            <div>
              <div className="text-xs text-[#a0a0a0] mb-1">Timeframe</div>
              <div className="flex gap-2">
                {(["weekly", "daily"] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      timeframe === tf
                        ? "bg-[#8b5cf6]/15 text-[#a78bfa] border border-[#8b5cf6]/30"
                        : "text-[#a0a0a0] border border-[#2a2a2a] hover:text-white hover:border-[#444]"
                    }`}
                  >
                    {tf.charAt(0).toUpperCase() + tf.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Scales */}
            <div>
              <div className="text-xs text-[#a0a0a0] mb-1">Scales</div>
              <div className="flex gap-2">
                {scaleOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleScale(s)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      scales.includes(s)
                        ? "bg-[#8b5cf6]/15 text-[#a78bfa] border border-[#8b5cf6]/30"
                        : "text-[#666] border border-[#2a2a2a] hover:text-white hover:border-[#444]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Min Confidence (hidden for near-miss) */}
            {mode !== "nearMiss" && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Min Confidence</span>
                  <span className="text-white">{minConfidence}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={95}
                  step={5}
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(Number(e.target.value))}
                  className="w-full accent-[#8b5cf6]"
                />
              </div>
            )}

            {/* Direction */}
            <div>
              <div className="text-xs text-[#a0a0a0] mb-1">Direction</div>
              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value as "bull" | "bear" | "all")}
                className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#8b5cf6] focus:outline-none"
              >
                <option value="all">All</option>
                <option value="bull">Bull Only</option>
                <option value="bear">Bear Only</option>
              </select>
            </div>

            {/* Correction Type (only for post-correction mode) */}
            {mode === "postCorrection" && (
              <div>
                <div className="text-xs text-[#a0a0a0] mb-1">Correction Type</div>
                <select
                  value={correctionTypeFilter}
                  onChange={(e) => setCorrectionTypeFilter(e.target.value as "all" | "zigzag" | "flat")}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#8b5cf6] focus:outline-none"
                >
                  <option value="all">All</option>
                  <option value="zigzag">Zigzag</option>
                  <option value="flat">Flat</option>
                </select>
              </div>
            )}

            {/* Reset */}
            <button
              onClick={resetFilters}
              className="w-full rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#666] hover:text-white hover:border-[#444] transition-colors mt-2"
            >
              Reset Filters
            </button>
          </div>
        </SidebarSection>

        {/* Scan / Cancel */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => runScan(false)}
              disabled={scanning}
              className="flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-colors"
              style={{ backgroundColor: ACCENT }}
              title={rawResults.length > 0 ? "Incremental scan" : "Full scan"}
            >
              {scanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {scanning ? "Scanning..." : "Scan"}
            </button>
            {!scanning && rawResults.length > 0 && (
              <button
                onClick={() => runScan(true)}
                className="rounded-md border border-[#2a2a2a] px-3 py-2.5 text-xs text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
                title="Force full rescan"
              >
                Full
              </button>
            )}
            {scanning && (
              <button
                onClick={cancelScan}
                className="rounded-md border border-[#2a2a2a] px-3 py-2.5 text-sm text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {!scanning && rawResults.length > 0 && (
            <div className="text-center">
              <StalenessLabel cacheKey={CACHE_KEY} ttlMs={CACHE_TTL} onRefresh={() => runScan(false)} />
            </div>
          )}
        </div>

        {/* Ticker Search */}
        <SidebarSection title="Search Ticker" sectionKey="ticker" collapsed={collapsed.has("ticker")} onToggle={toggleSection}>
          <TickerSearchInput
            value={tickerSearch}
            onChange={setTickerSearch}
            onSearch={lookupTicker}
            searching={tickerSearching}
            error={tickerError}
            placeholder="e.g. AAPL, ES=F..."
            accentColor={ACCENT}
          />
        </SidebarSection>

        {/* Watchlists */}
        <SidebarSection title="Watchlists" sectionKey="watchlists" collapsed={collapsed.has("watchlists")} onToggle={toggleSection}>
          <div className="space-y-2">
            {watchlists.length > 0 && (
              <div className="space-y-1">
                {watchlists.map((wl) => (
                  <div
                    key={wl.id}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                      selectedWatchlist === wl.id
                        ? "bg-[#8b5cf6]/15 text-[#a78bfa] border border-[#8b5cf6]/30"
                        : "text-[#a0a0a0] hover:text-white hover:bg-[#1a1a1a] border border-transparent"
                    }`}
                    onClick={() => setSelectedWatchlist(selectedWatchlist === wl.id ? "" : wl.id)}
                  >
                    <span className="truncate">
                      <Star className="h-3 w-3 inline mr-1 opacity-50" />
                      {wl.name} ({wl.tickers.length})
                    </span>
                    {deleteWlConfirm === wl.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteWatchlist(wl.id); }}
                          className="text-red-400 hover:text-red-300 text-[10px]"
                        >
                          Yes
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteWlConfirm(null); }}
                          className="text-[#666] hover:text-white text-[10px]"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteWlConfirm(wl.id); }}
                        className="text-[#444] hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              <input
                value={newWatchlistName}
                onChange={(e) => setNewWatchlistName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateWatchlist()}
                placeholder="New watchlist..."
                className="flex-1 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white placeholder-[#555] focus:border-[#8b5cf6] focus:outline-none"
              />
              <button
                onClick={handleCreateWatchlist}
                disabled={!newWatchlistName.trim()}
                className="rounded-md border border-[#2a2a2a] px-2 py-1 text-xs text-[#666] hover:text-white hover:border-[#444] disabled:opacity-30 transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            {watchlists.length > 0 && (
              <div>
                <div className="text-[10px] text-[#555] mb-1">Add results to:</div>
                <select
                  value={addToWatchlistId}
                  onChange={(e) => setAddToWatchlistId(e.target.value)}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white focus:border-[#8b5cf6] focus:outline-none"
                >
                  <option value="">Select watchlist...</option>
                  {watchlists.map((wl) => (
                    <option key={wl.id} value={wl.id}>{wl.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </SidebarSection>

        {/* Saved Scans */}
        <SidebarSection title="Saved Scans" sectionKey="savedScans" collapsed={collapsed.has("savedScans")} onToggle={toggleSection}>
          <div className="space-y-2">
            {rawResults.length > 0 && !scanning && (
              <div className="flex gap-1">
                <input
                  value={saveScanName}
                  onChange={(e) => setSaveScanName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveScan()}
                  placeholder="Scan name..."
                  className="flex-1 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white placeholder-[#555] focus:border-[#8b5cf6] focus:outline-none"
                />
                <button
                  onClick={handleSaveScan}
                  disabled={!saveScanName.trim()}
                  className="rounded-md border border-[#2a2a2a] px-2 py-1 text-xs text-[#666] hover:text-white hover:border-[#444] disabled:opacity-30 transition-colors"
                  title="Save current scan"
                >
                  <Save className="h-3 w-3" />
                </button>
              </div>
            )}
            {savedScans.length > 0 ? (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {savedScans.map((sc) => (
                  <div
                    key={sc.id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-[#a0a0a0] hover:text-white hover:bg-[#1a1a1a] cursor-pointer transition-colors border border-transparent"
                    onClick={() => handleLoadSavedScan(sc)}
                  >
                    <div className="truncate">
                      <span className="text-white">{sc.name}</span>
                      <span className="text-[#555] ml-1">({sc.results.length})</span>
                      <p className="text-[10px] text-[#444]">{new Date(sc.savedAt).toLocaleDateString()}</p>
                    </div>
                    {deleteScConfirm === sc.id ? (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteScan(sc.id); }}
                          className="text-red-400 hover:text-red-300 text-[10px]"
                        >
                          Yes
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteScConfirm(null); }}
                          className="text-[#666] hover:text-white text-[10px]"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteScConfirm(sc.id); }}
                        className="text-[#444] hover:text-red-400 transition-colors shrink-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-[#555]">No saved scans yet.</p>
            )}
          </div>
        </SidebarSection>
      </SidebarShell>

      {/* ── Main Content ── */}
      <main className="flex-1 min-w-0">
        {/* Progress */}
        {scanning && (
          <div className="mb-4">
            <ProgressBar
              current={scannedCount}
              total={totalCount}
              label={progress}
              color="bg-purple-500"
            />
          </div>
        )}

        {/* Failed tickers notice */}
        {!scanning && failedCount > 0 && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
            {failedCount} ticker{failedCount > 1 ? "s" : ""} failed to scan (network/data errors)
          </div>
        )}

        {/* Summary stats */}
        {hasResults && mode !== "nearMiss" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <button
              onClick={() => { setDirectionFilter("all"); setMode("activeImpulse"); }}
              className={`rounded-lg border bg-[#141414] px-4 py-3 text-left transition-colors ${
                directionFilter === "all" && mode === "activeImpulse" ? "border-[#8b5cf6]/40 ring-1 ring-[#8b5cf6]/20" : "border-[#2a2a2a] hover:border-[#444]"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Results</p>
              <p className="text-lg font-bold text-white">
                {stats.total}
                <span className="text-xs font-normal text-[#666] ml-1">/ {stats.rawTotal}</span>
              </p>
            </button>
            <button
              onClick={() => setDirectionFilter(directionFilter === "bull" ? "all" : "bull")}
              className={`rounded-lg border bg-[#141414] px-4 py-3 text-left transition-colors ${
                directionFilter === "bull" ? "border-green-500/40 ring-1 ring-green-500/20" : "border-green-500/20 hover:border-green-500/40"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wider text-green-400/60 mb-1">Bullish</p>
              <p className="text-lg font-bold text-green-400">{stats.bull}</p>
            </button>
            <button
              onClick={() => setDirectionFilter(directionFilter === "bear" ? "all" : "bear")}
              className={`rounded-lg border bg-[#141414] px-4 py-3 text-left transition-colors ${
                directionFilter === "bear" ? "border-red-500/40 ring-1 ring-red-500/20" : "border-red-500/20 hover:border-red-500/40"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wider text-red-400/60 mb-1">Bearish</p>
              <p className="text-lg font-bold text-red-400">{stats.bear}</p>
            </button>
            <button
              onClick={() => setMode(mode === "postCorrection" ? "activeImpulse" : "postCorrection")}
              className={`rounded-lg border bg-[#141414] px-4 py-3 text-left transition-colors ${
                mode === "postCorrection" ? "border-cyan-500/40 ring-1 ring-cyan-500/20" : "border-cyan-500/20 hover:border-cyan-500/40"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wider text-cyan-400/60 mb-1">Corrections</p>
              <p className="text-lg font-bold text-cyan-400">{stats.withCorrection}</p>
            </button>
            <button
              onClick={() => setMode(mode === "highConfidence" ? "activeImpulse" : "highConfidence")}
              className={`rounded-lg border bg-[#141414] px-4 py-3 text-left transition-colors ${
                mode === "highConfidence" ? "border-amber-500/40 ring-1 ring-amber-500/20" : "border-amber-500/20 hover:border-amber-500/40"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wider text-amber-400/60 mb-1">High Conf.</p>
              <p className="text-lg font-bold text-amber-400">{stats.highConf}</p>
            </button>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3 text-left">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Timeframe</p>
              <p className="text-lg font-bold text-[#a78bfa]">{timeframe === "weekly" ? "W" : "D"}</p>
            </div>
          </div>
        )}

        {/* Near-miss summary */}
        {mode === "nearMiss" && nearMissResults.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border border-orange-500/20 bg-[#141414] px-4 py-3 text-left">
              <p className="text-[10px] uppercase tracking-wider text-orange-400/60 mb-1">Near-Misses</p>
              <p className="text-lg font-bold text-orange-400">{filteredNearMisses.length}</p>
            </div>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3 text-left">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Rules</p>
              <p className="text-lg font-bold text-[#a78bfa]">3/4</p>
            </div>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3 text-left">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Timeframe</p>
              <p className="text-lg font-bold text-[#a78bfa]">{timeframe === "weekly" ? "W" : "D"}</p>
            </div>
          </div>
        )}

        {/* Sort + Export row */}
        {displayCount > 0 && mode !== "nearMiss" && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#666]">Sort:</span>
              {([
                { key: "confidence" as SortKey, label: "Confidence" },
                { key: "ticker" as SortKey, label: "Ticker" },
                { key: "scale" as SortKey, label: "Scale" },
                { key: "impulseRange" as SortKey, label: "Range" },
              ]).map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSort(s.key)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
                    sortKey === s.key
                      ? "bg-[#8b5cf6]/10 text-[#a78bfa] border border-[#8b5cf6]/30"
                      : "text-[#a0a0a0] hover:text-white border border-[#2a2a2a] hover:border-[#444]"
                  }`}
                >
                  {s.label}
                  {sortKey === s.key && <ArrowUpDown className="h-3 w-3" />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <CopyButton tickers={sortedGroups.map((g) => g.ticker)} />
              <button
                onClick={exportCsv}
                className="inline-flex items-center gap-1 rounded-md border border-[#2a2a2a] px-2.5 py-1 text-xs text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
                title="Export CSV"
              >
                <Download className="h-3 w-3" />
                CSV
              </button>
              <button
                onClick={exportExcel}
                className="inline-flex items-center gap-1 rounded-md border border-[#2a2a2a] px-2.5 py-1 text-xs text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
                title="Export Excel"
              >
                <Download className="h-3 w-3" />
                Excel
              </button>
            </div>
          </div>
        )}

        {/* Near-Miss Results Table */}
        {mode === "nearMiss" && filteredNearMisses.length > 0 ? (
          <div className="rounded-lg border border-[#2a2a2a] overflow-x-auto">
            <table className="text-sm table-fixed" style={{minWidth:"60rem"}}>
              <thead>
                <tr className="border-b border-[#2a2a2a] bg-[#141414]">
                  <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-[#666] w-8">#</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-[#666] w-[120px]">Symbol</th>
                  <th className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-[#666] w-[60px]">Dir</th>
                  <th className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-[#666] w-[50px]">Scale</th>
                  <th className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-[#666] w-[60px]">Rules</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-[#666]">Failing Rule</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-[#666] w-[80px]">W0</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-[#666] w-[80px]">W5</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-[#666] w-[80px]">Price</th>
                  {addToWatchlistId && <th className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-[#666] w-[40px]"></th>}
                </tr>
              </thead>
              <tbody>
                {filteredNearMisses.map((r, idx) => (
                  <tr key={`${r.ticker}-${r.scale}-${idx}`} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-2 py-2 text-xs text-[#666]">{idx + 1}</td>
                    <td className="px-2 py-2">
                      <span className="font-medium text-white">{r.ticker}</span>
                      <span className="text-[10px] text-[#666] ml-1.5 hidden lg:inline">{r.name}</span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`text-xs font-medium ${directionColor(r.direction)}`}>
                        {directionLabel(r.direction)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center text-xs text-[#ccc]">{r.scale}</td>
                    <td className="px-2 py-2 text-center">
                      <span className="inline-flex items-center rounded-md border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-400">
                        {r.rulesPassed}/4
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
                        {r.failingRule}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-[#ccc]">{formatPrice(r.w0Price)}</td>
                    <td className="px-2 py-2 text-right text-xs text-[#ccc]">{formatPrice(r.w5Price)}</td>
                    <td className="px-2 py-2 text-right text-xs font-medium text-white">{formatPrice(r.currentPrice)}</td>
                    {addToWatchlistId && (
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => handleAddToWatchlist(r.ticker)}
                          className="text-[#555] hover:text-[#a78bfa] transition-colors"
                          title="Add to watchlist"
                        >
                          <Star className="h-3 w-3" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : mode !== "nearMiss" && sortedGroups.length > 0 ? (
          /* Normal Results Table (grouped by ticker) */
          <div className="rounded-lg border border-[#2a2a2a]">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b border-[#2a2a2a] bg-[#141414]">
                  <th className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-[#666]" style={{width:"2.5rem"}}>#</th>
                  <th className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-[#666] cursor-pointer hover:text-white" style={{width:"5rem"}} onClick={() => toggleSort("ticker")}>
                    Symbol {sortKey === "ticker" && <span className="text-[#8b5cf6]">{sortDir === "desc" ? "\u25BC" : "\u25B2"}</span>}
                  </th>
                  <th className="px-1.5 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-[#666]" style={{width:"3.5rem"}}>Dir</th>
                  <th className="px-1.5 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-[#666] cursor-pointer hover:text-white" style={{width:"3rem"}} onClick={() => toggleSort("scale")}>
                    Sc {sortKey === "scale" && <span className="text-[#8b5cf6]">{sortDir === "desc" ? "\u25BC" : "\u25B2"}</span>}
                  </th>
                  <th className="px-1.5 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-[#666] cursor-pointer hover:text-white" style={{width:"4rem"}} onClick={() => toggleSort("confidence")}>
                    Conf {sortKey === "confidence" && <span className="text-[#8b5cf6]">{sortDir === "desc" ? "\u25BC" : "\u25B2"}</span>}
                  </th>
                  <th className="px-1.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-[#666]" style={{width:"6.5rem"}}>Status</th>
                  <th className="px-1.5 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-[#666]" style={{width:"4.5rem"}}>W0</th>
                  <th className="px-1.5 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-[#666]" style={{width:"4.5rem"}}>W5</th>
                  <th className="px-1.5 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-[#666] cursor-pointer hover:text-white" style={{width:"4.5rem"}} onClick={() => toggleSort("impulseRange")}>
                    Range {sortKey === "impulseRange" && <span className="text-[#8b5cf6]">{sortDir === "desc" ? "\u25BC" : "\u25B2"}</span>}
                  </th>
                  <th className="px-1.5 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-[#666]" style={{width:"4.5rem"}}>38.2%</th>
                  <th className="px-1.5 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-[#666]" style={{width:"3.5rem"}}>50%</th>
                  <th className="px-1.5 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-[#666]" style={{width:"4.5rem"}}>61.8%</th>
                  <th className="px-1.5 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-[#666]" style={{width:"4.5rem"}}>Price</th>
                  <th className="px-1.5 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-[#666]" style={{width:"5.5rem"}}>Near Fib</th>
                </tr>
              </thead>
              <tbody>
                {sortedGroups.map((group, idx) => (
                  <GroupedResultRow
                    key={group.ticker}
                    group={group}
                    index={idx}
                    expanded={expandedTicker === group.ticker}
                    onToggle={setExpandedTicker}
                    onAddToWatchlist={addToWatchlistId ? handleAddToWatchlist : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : hasResults && !scanning ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#666]">
            <Waves className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No patterns matched the current filters.</p>
            <p className="text-xs mt-1">Try lowering Min Confidence or switching Scanner Mode.</p>
          </div>
        ) : !scanning ? (
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-12 text-center">
            <Waves className="mx-auto h-12 w-12 text-[#333]" />
            <h2 className="mt-4 text-lg font-semibold text-white">Wave Scanner</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#a0a0a0]">
              Scan {universeCount} {universe === "Futures" ? "futures" : "stocks"} for Elliott Wave impulse patterns
              with ABC corrections and Fibonacci retracement targets.
            </p>
            <div className="mx-auto mt-6 grid max-w-lg grid-cols-4 gap-3">
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#a78bfa]">{universeCount}</p>
                <p className="text-[10px] text-[#666]">Tickers</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#a78bfa]">{scales.length}</p>
                <p className="text-[10px] text-[#666]">Scales</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#a78bfa]">5</p>
                <p className="text-[10px] text-[#666]">Fib Levels</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#a78bfa]">5</p>
                <p className="text-[10px] text-[#666]">Modes</p>
              </div>
            </div>
            <button
              onClick={() => runScan(false)}
              className="mt-6 inline-flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-colors"
              style={{ backgroundColor: ACCENT }}
            >
              <Search className="h-4 w-4" />
              Start Scanning
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

// ── Grouped Result Row ──

const GroupedResultRow = memo(function GroupedResultRow({
  group,
  index,
  expanded,
  onToggle,
  onAddToWatchlist,
}: {
  group: GroupedResult;
  index: number;
  expanded: boolean;
  onToggle: (ticker: string | null) => void;
  onAddToWatchlist?: (ticker: string) => void;
}) {
  const handleClick = useCallback(() => {
    onToggle(expanded ? null : group.ticker);
  }, [onToggle, expanded, group.ticker]);

  const result = group.best;
  const fibs = result.fibTargets;
  const f382 = fibs?.levels.find((l) => l.ratio === 0.382);
  const f50 = fibs?.levels.find((l) => l.ratio === 0.5);
  const f618 = fibs?.levels.find((l) => l.ratio === 0.618);

  return (
    <>
      <tr
        className={`border-b border-[#1a1a1a] hover:bg-[#1a1a1a] cursor-pointer transition-colors ${expanded ? "bg-[#1a1a1a]" : ""}`}
        onClick={handleClick}
      >
        <td className="px-1.5 py-1.5 text-[#666]">
          <div className="flex items-center gap-1">
            {expanded ? <ChevronDown className="h-3 w-3 text-[#a78bfa]" /> : <ChevronRight className="h-3 w-3" />}
            <span className="text-xs">{index + 1}</span>
          </div>
        </td>
        <td className="px-1.5 py-1.5">
          <div className="flex items-center gap-1 min-w-0">
            <span className="font-medium text-white truncate">{group.ticker}</span>
            {group.patternCount > 1 && (
              <span className="inline-flex items-center rounded-full bg-[#8b5cf6]/15 px-1 py-0.5 text-[9px] font-medium text-[#a78bfa] border border-[#8b5cf6]/20 shrink-0">
                {group.patternCount}
              </span>
            )}
            {onAddToWatchlist && (
              <button
                onClick={(e) => { e.stopPropagation(); onAddToWatchlist(group.ticker); }}
                className="text-[#444] hover:text-[#a78bfa] transition-colors ml-auto shrink-0"
                title="Add to watchlist"
              >
                <Star className="h-3 w-3" />
              </button>
            )}
          </div>
        </td>
        <td className="px-1.5 py-1.5 text-center">
          <span className={`text-xs font-medium ${directionColor(result.pattern.direction)}`}>
            {directionLabel(result.pattern.direction)}
          </span>
        </td>
        <td className="px-1.5 py-1.5 text-center text-xs text-[#ccc]">{result.pattern.scale}</td>
        <td className="px-1.5 py-1.5 text-center">
          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${confidenceBg(result.pattern.confidence)}`}>
            {result.pattern.confidence}%
          </span>
        </td>
        <td className="px-1.5 py-1.5">
          <span className={`text-xs ${waveStatusColor(result.pattern)} truncate block`}>
            {waveStatusLabel(result.pattern)}
          </span>
        </td>
        <td className="px-1.5 py-1.5 text-right text-xs text-[#ccc]">{formatPrice(result.pattern.waves.w0.price)}</td>
        <td className="px-1.5 py-1.5 text-right text-xs text-[#ccc]">{formatPrice(result.pattern.waves.w5.price)}</td>
        <td className="px-1.5 py-1.5 text-right text-xs text-[#ccc]">
          {fibs ? formatPrice(fibs.impulseRange) : "\u2014"}
        </td>
        <td className="px-1.5 py-1.5 text-right text-xs text-[#888]">{f382 ? formatPrice(f382.price) : "\u2014"}</td>
        <td className="px-1.5 py-1.5 text-right text-xs text-[#888]">{f50 ? formatPrice(f50.price) : "\u2014"}</td>
        <td className="px-1.5 py-1.5 text-right text-xs text-[#888]">{f618 ? formatPrice(f618.price) : "\u2014"}</td>
        <td className="px-1.5 py-1.5 text-right text-xs font-medium text-white">{formatPrice(result.currentPrice)}</td>
        <td className="px-1.5 py-1.5 text-right">
          {result.nearestFibLabel ? (
            <span className="text-[10px] text-[#a78bfa] truncate block">
              {result.nearestFibLabel}
              {result.nearestFibDistance != null && (
                <span className="text-[#666] ml-0.5">({result.nearestFibDistance > 0 ? "+" : ""}{result.nearestFibDistance.toFixed(1)}%)</span>
              )}
            </span>
          ) : (
            <span className="text-[10px] text-[#444]">{"\u2014"}</span>
          )}
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr className="border-b border-[#1a1a1a]">
          <td colSpan={14} className="bg-[#141414] px-4 py-4">
            <ExpandedDetail result={result} additionalPatterns={group.additionalPatterns} />
          </td>
        </tr>
      )}
    </>
  );
});

// ── Expanded Detail ──

function ExpandedDetail({ result, additionalPatterns }: { result: WaveScanResult; additionalPatterns: WaveScanResult[] }) {
  const p = result.pattern;
  const w = p.waves;
  const fibs = result.fibTargets;
  const corr = p.correction;

  return (
    <div className="space-y-4">
      {/* Wave Sparkline */}
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
        <h4 className="text-xs font-medium text-[#a0a0a0] uppercase mb-2">Wave Structure</h4>
        <WaveSparkline pattern={p} width={400} height={100} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Wave Points */}
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
          <h4 className="text-xs font-medium text-[#a0a0a0] uppercase mb-2">Wave Points</h4>
          <div className="space-y-1 text-xs">
            {[
              { label: "W0", point: w.w0 },
              { label: "W1", point: w.w1 },
              { label: "W2", point: w.w2 },
              { label: "W3", point: w.w3 },
              { label: "W4", point: w.w4 },
              { label: "W5", point: w.w5 },
            ].map(({ label, point }) => (
              <div key={label} className="flex justify-between">
                <span className="text-[#666]">{label}</span>
                <span className="text-white">
                  {formatPrice(point.price)}
                  <span className="text-[#555] ml-1">bar {point.barIndex}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Enrichment */}
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
          <h4 className="text-xs font-medium text-[#a0a0a0] uppercase mb-2">Enrichment</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-[#666]">Extended Wave</span>
              <span className="text-white">W{p.extendedWave}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666]">Alternation</span>
              <span className={p.hasAlternation ? "text-green-400" : "text-[#555]"}>{p.hasAlternation ? "Yes" : "No"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666]">RSI Divergence</span>
              <span className={p.hasRsiDivergence ? "text-green-400" : "text-[#555]"}>{p.hasRsiDivergence ? "Yes" : "No"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666]">Volume Confirm</span>
              <span className={p.hasVolumeConfirmation ? "text-green-400" : "text-[#555]"}>{p.hasVolumeConfirmation ? "Yes" : "No"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666]">W2 Retrace</span>
              <span className="text-white">{(p.w2RetraceRatio * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666]">W4 Retrace</span>
              <span className="text-white">{(p.w4RetraceRatio * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666]">Wave lengths</span>
              <span className="text-white text-[10px]">
                W1:{formatPrice(waveLength(w, 1))} W3:{formatPrice(waveLength(w, 3))} W5:{formatPrice(waveLength(w, 5))}
              </span>
            </div>
          </div>
        </div>

        {/* Fibonacci & Correction */}
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
          <h4 className="text-xs font-medium text-[#a0a0a0] uppercase mb-2">
            {corr ? "Correction & Fibs" : "Fibonacci Targets"}
          </h4>
          <div className="space-y-1 text-xs">
            {fibs && fibs.levels.map((lvl) => (
              <div key={lvl.label} className="flex justify-between">
                <span className="text-[#666]">{lvl.label}</span>
                <span className="text-[#a78bfa]">{formatPrice(lvl.price)}</span>
              </div>
            ))}
            {fibs && (
              <div className="flex justify-between border-t border-[#2a2a2a] pt-1 mt-1">
                <span className="text-[#666]">Impulse Range</span>
                <span className="text-white">{formatPrice(fibs.impulseRange)}</span>
              </div>
            )}
            {corr && (
              <>
                <div className="border-t border-[#2a2a2a] pt-1 mt-2" />
                <div className="flex justify-between">
                  <span className="text-[#666]">Type</span>
                  <span className="text-cyan-400 capitalize">{corr.correctionType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666]">A</span>
                  <span className="text-white">{formatPrice(corr.points.a.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666]">B</span>
                  <span className="text-white">{formatPrice(corr.points.b.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666]">C</span>
                  <span className="text-white">{formatPrice(corr.points.c.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666]">B Retrace</span>
                  <span className="text-white">{(corr.bRetraceRatio * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666]">C Retrace</span>
                  <span className="text-white">{(corr.cRetraceRatio * 100).toFixed(1)}%</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Additional patterns for this ticker */}
      {additionalPatterns.length > 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
          <h4 className="text-xs font-medium text-[#a0a0a0] uppercase mb-2">
            Other Patterns ({additionalPatterns.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  <th className="px-2 py-1 text-left text-[10px] text-[#666]">Dir</th>
                  <th className="px-2 py-1 text-center text-[10px] text-[#666]">Scale</th>
                  <th className="px-2 py-1 text-center text-[10px] text-[#666]">Conf</th>
                  <th className="px-2 py-1 text-left text-[10px] text-[#666]">Status</th>
                  <th className="px-2 py-1 text-right text-[10px] text-[#666]">W0</th>
                  <th className="px-2 py-1 text-right text-[10px] text-[#666]">W5</th>
                  <th className="px-2 py-1 text-right text-[10px] text-[#666]">Range</th>
                </tr>
              </thead>
              <tbody>
                {additionalPatterns.map((r, i) => (
                  <tr key={i} className="border-b border-[#1a1a1a]/50">
                    <td className={`px-2 py-1 ${directionColor(r.pattern.direction)}`}>{directionLabel(r.pattern.direction)}</td>
                    <td className="px-2 py-1 text-center text-[#ccc]">{r.pattern.scale}</td>
                    <td className="px-2 py-1 text-center">
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${confidenceBg(r.pattern.confidence)}`}>
                        {r.pattern.confidence}%
                      </span>
                    </td>
                    <td className={`px-2 py-1 ${waveStatusColor(r.pattern)}`}>{waveStatusLabel(r.pattern)}</td>
                    <td className="px-2 py-1 text-right text-[#ccc]">{formatPrice(r.pattern.waves.w0.price)}</td>
                    <td className="px-2 py-1 text-right text-[#ccc]">{formatPrice(r.pattern.waves.w5.price)}</td>
                    <td className="px-2 py-1 text-right text-[#ccc]">{r.fibTargets ? formatPrice(r.fibTargets.impulseRange) : "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
