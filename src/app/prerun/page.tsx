"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import {
  Search,
  Loader2,
  ChevronRight,
  X,
  Save,
  Trash2,
  ArrowUpDown,
  Zap,
  TrendingUp,
  PanelLeftClose,
  PanelLeft,
  AlertTriangle,
  ListPlus,
  Check,
  FileDown,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type {
  PreRunResult,
  PreRunFilters,
  SavedPreRunScan,
} from "@/lib/prerun/types";
import { DEFAULT_PRERUN_FILTERS, PRERUN_PRESETS } from "@/lib/prerun/types";
import {
  savePreRunScan,
  loadPreRunScans,
  deletePreRunScan,
  addToPreRunWatchlist,
  seedWatchlistIfEmpty,
  saveScanResults,
} from "@/lib/prerun/storage";
import { exportPreRunToExcel } from "@/lib/prerun/export";
import {
  getTickersForSector,
  getSectorBuckets,
  getSectorForTicker,
} from "@/data/prerun-universe";

const BATCH_SIZE = 10;
const BATCH_DELAY = 300;

type SortKey = "score" | "pctFromAth" | "shortFloat" | "earnings";
type SortDir = "asc" | "desc";

const MARKET_CAP_OPTIONS = [
  { label: "Any", value: 0 },
  { label: "$500M", value: 500_000_000 },
  { label: "$1B", value: 1_000_000_000 },
  { label: "$5B", value: 5_000_000_000 },
  { label: "$10B", value: 10_000_000_000 },
  { label: "$20B", value: 20_000_000_000 },
  { label: "$50B", value: 50_000_000_000 },
];

const EARNINGS_OPTIONS = [
  { label: "Any", value: 0 },
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
];

function verdictColor(verdict: string): string {
  switch (verdict) {
    case "PRIORITY":
      return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "KEEP":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "WATCH":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "DISCARD":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-[#2a2a2a] text-[#a0a0a0] border-[#333]";
  }
}

function scoreBarGradient(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.7) return "bg-green-500";
  if (pct >= 0.5) return "bg-amber-500";
  return "bg-red-500";
}

function scoreDotColor(val: number): string {
  if (val >= 2) return "bg-green-500";
  if (val >= 1) return "bg-amber-500";
  return "bg-red-500";
}

function formatMktCap(val: number | null): string {
  if (val == null) return "-";
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(0)}M`;
  return `$${val.toFixed(0)}`;
}

export default function PreRunPageWrapper() {
  return (
    <Suspense fallback={null}>
      <PreRunPage />
    </Suspense>
  );
}

function PreRunPage() {
  // Filters
  const [minPctFromAth, setMinPctFromAth] = useState(DEFAULT_PRERUN_FILTERS.minPctFromAth);
  const [minShortFloat, setMinShortFloat] = useState(DEFAULT_PRERUN_FILTERS.minShortFloat);
  const [maxMarketCap, setMaxMarketCap] = useState(DEFAULT_PRERUN_FILTERS.maxMarketCap);
  const [minScore, setMinScore] = useState(DEFAULT_PRERUN_FILTERS.minScore);
  const [sectorBucket, setSectorBucket] = useState(DEFAULT_PRERUN_FILTERS.sectorBucket);
  const [earningsWithin, setEarningsWithin] = useState(DEFAULT_PRERUN_FILTERS.earningsWithin);
  const [verdictFilter, setVerdictFilter] = useState(DEFAULT_PRERUN_FILTERS.verdict);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [scannedCount, setScannedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [rawResults, setRawResults] = useState<PreRunResult[]>([]);
  const scanAbort = useRef<AbortController | null>(null);

  // Ticker search
  const [tickerSearch, setTickerSearch] = useState("");
  const [tickerSearching, setTickerSearching] = useState(false);
  const [tickerError, setTickerError] = useState<string | null>(null);

  // AI scoring
  const [aiScoringTicker, setAiScoringTicker] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Map<string, { suggestedScore: number; reasoning: string; confidence: string }>>(new Map());

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Sidebar collapse
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Saved scans
  const [savedScans, setSavedScans] = useState<SavedPreRunScan[]>([]);
  const [saveName, setSaveName] = useState("");

  // Watchlist add feedback
  const [addedTicker, setAddedTicker] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  // Seed watchlist on mount
  useEffect(() => {
    seedWatchlistIfEmpty();
    setSavedScans(loadPreRunScans());
  }, []);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      scanAbort.current?.abort();
    };
  }, []);

  const toggleSection = useCallback((key: string) => {
    setCollapsed((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      return s;
    });
  }, []);

  // Build filters object
  const filters: PreRunFilters = useMemo(
    () => ({
      minPctFromAth,
      minShortFloat,
      maxMarketCap,
      minScore,
      sectorBucket,
      earningsWithin,
      verdict: verdictFilter,
    }),
    [minPctFromAth, minShortFloat, maxMarketCap, minScore, sectorBucket, earningsWithin, verdictFilter]
  );

  // Filter + sort results
  const filtered = useMemo(() => {
    return rawResults.filter((r) => {
      if (filters.minPctFromAth > 0 && (r.data.pctFromAth ?? 0) < filters.minPctFromAth) return false;
      if (filters.minShortFloat > 0 && (r.data.shortFloat ?? 0) < filters.minShortFloat) return false;
      if (filters.maxMarketCap > 0 && (r.data.marketCap ?? Infinity) > filters.maxMarketCap) return false;
      if (filters.minScore > 0 && r.scores.finalScore < filters.minScore) return false;
      if (filters.earningsWithin > 0 && (r.data.daysToEarnings === null || r.data.daysToEarnings > filters.earningsWithin)) return false;
      if (filters.verdict !== "All" && r.verdict !== filters.verdict) return false;
      if (filters.sectorBucket !== "All") {
        const ticker = r.data.ticker;
        const sector = getSectorForTicker(ticker);
        if (sector !== filters.sectorBucket) return false;
      }
      return true;
    });
  }, [rawResults, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "score":
          cmp = a.scores.finalScore - b.scores.finalScore;
          break;
        case "pctFromAth":
          cmp = (a.data.pctFromAth ?? 0) - (b.data.pctFromAth ?? 0);
          break;
        case "shortFloat":
          cmp = (a.data.shortFloat ?? 0) - (b.data.shortFloat ?? 0);
          break;
        case "earnings":
          cmp = (a.data.daysToEarnings ?? 999) - (b.data.daysToEarnings ?? 999);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const priority = filtered.filter((r) => r.verdict === "PRIORITY").length;
    const keep = filtered.filter((r) => r.verdict === "KEEP").length;
    const watch = filtered.filter((r) => r.verdict === "WATCH").length;
    return { total: filtered.length, priority, keep, watch };
  }, [filtered]);

  // Scan
  const runScan = useCallback(async () => {
    scanAbort.current?.abort();
    const controller = new AbortController();
    scanAbort.current = controller;
    const signal = controller.signal;

    setScanning(true);
    setRawResults([]);
    setScannedCount(0);

    const tickers = getTickersForSector(sectorBucket);
    setTotalCount(tickers.length);

    if (tickers.length === 0) {
      setScanning(false);
      return;
    }

    const results: PreRunResult[] = [];

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      if (signal.aborted) break;
      const batch = tickers.slice(i, i + BATCH_SIZE);
      setProgress(
        `Fetching ${Math.min(i + BATCH_SIZE, tickers.length)}/${tickers.length}...`
      );

      try {
        const res = await fetch("/api/prerun/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickers: batch }),
          signal,
        });

        if (res.ok) {
          const data = (await res.json()) as { results: PreRunResult[] };
          if (data.results) {
            results.push(...data.results);
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") break;
      }

      setScannedCount(Math.min(i + BATCH_SIZE, tickers.length));
      setRawResults([...results]);

      if (i + BATCH_SIZE < tickers.length && !signal.aborted) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    // Save results to cache
    saveScanResults(results);
    setScanning(false);
    setProgress("");
  }, [sectorBucket]);

  const cancelScan = useCallback(() => {
    scanAbort.current?.abort();
    scanAbort.current = null;
    setScanning(false);
    setProgress("");
  }, []);

  // Ticker search
  const lookupTicker = useCallback(async () => {
    const ticker = tickerSearch.trim().toUpperCase();
    if (!ticker) return;

    // Skip if already in results
    if (rawResults.some((r) => r.data.ticker === ticker)) {
      setTickerSearch("");
      return;
    }

    setTickerSearching(true);
    setTickerError(null);

    try {
      const res = await fetch(`/api/prerun/stock?ticker=${encodeURIComponent(ticker)}`);
      if (!res.ok) {
        setTickerError(`Could not find "${ticker}"`);
        setTickerSearching(false);
        return;
      }
      const data = (await res.json()) as PreRunResult;
      if (!data.data) {
        setTickerError(`No data for "${ticker}"`);
        setTickerSearching(false);
        return;
      }
      setRawResults((prev) => [data, ...prev]);
      setTickerSearch("");
    } catch {
      setTickerError("Network error");
    }
    setTickerSearching(false);
  }, [tickerSearch, rawResults]);

  // AI Score
  const requestAiScore = useCallback(async (result: PreRunResult) => {
    const ticker = result.data.ticker;
    setAiScoringTicker(ticker);

    try {
      const res = await fetch("/api/prerun/ai-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          companyName: result.data.companyName,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { suggestedScore: number; reasoning: string; confidence: string };
        setAiResults((prev) => {
          const next = new Map(prev);
          next.set(ticker, data);
          return next;
        });
      }
    } catch {
      // silently fail
    }
    setAiScoringTicker(null);
  }, []);

  // Save / Load / Delete scans
  const handleSave = useCallback(() => {
    const name = saveName.trim() || `Pre-Run ${new Date().toLocaleDateString()}`;
    savePreRunScan(name, filters, filtered);
    setSavedScans(loadPreRunScans());
    setSaveName("");
  }, [saveName, filters, filtered]);

  const handleDelete = useCallback((id: string) => {
    if (!confirm("Delete this saved scan?")) return;
    deletePreRunScan(id);
    setSavedScans(loadPreRunScans());
  }, []);

  const handleLoadScan = useCallback((scan: SavedPreRunScan) => {
    setMinPctFromAth(scan.filters.minPctFromAth);
    setMinShortFloat(scan.filters.minShortFloat);
    setMaxMarketCap(scan.filters.maxMarketCap);
    setMinScore(scan.filters.minScore);
    setSectorBucket(scan.filters.sectorBucket);
    setEarningsWithin(scan.filters.earningsWithin);
    setVerdictFilter(scan.filters.verdict);
    setRawResults(scan.candidates);
  }, []);

  // Preset
  const applyPreset = useCallback((preset: typeof PRERUN_PRESETS[number]) => {
    const f = { ...DEFAULT_PRERUN_FILTERS, ...preset.filters };
    setMinPctFromAth(f.minPctFromAth);
    setMinShortFloat(f.minShortFloat);
    setMaxMarketCap(f.maxMarketCap);
    setMinScore(f.minScore);
    setSectorBucket(f.sectorBucket);
    setEarningsWithin(f.earningsWithin);
    setVerdictFilter(f.verdict);
  }, []);

  // Add to watchlist
  const handleAddToWatchlist = useCallback((result: PreRunResult) => {
    setAddError(null);
    const item = addToPreRunWatchlist(result);
    if (item) {
      setAddedTicker(result.data.ticker);
      setTimeout(() => setAddedTicker(null), 1500);
    } else {
      setAddError(`${result.data.ticker} already in watchlist`);
      setTimeout(() => setAddError(null), 2500);
    }
  }, []);

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
    [sortKey]
  );

  // Export
  const handleExport = useCallback(() => {
    if (sorted.length === 0) return;
    exportPreRunToExcel(sorted);
  }, [sorted]);

  const sectorBuckets = useMemo(() => getSectorBuckets(), []);

  return (
    <div className="flex flex-col lg:flex-row gap-6 px-4 sm:px-6 py-6 max-w-[1600px] mx-auto">
      {/* Sidebar Toggle (visible when collapsed) */}
      {!sidebarOpen && (
        <>
          <button
            onClick={() => setSidebarOpen(true)}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-md border border-[#2a2a2a] bg-[#141414] text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors shrink-0 self-start sticky top-20"
            title="Show sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-xs text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors self-start"
          >
            <PanelLeft className="h-3.5 w-3.5" />
            Filters
          </button>
        </>
      )}

      {/* Left Sidebar */}
      <aside className={`w-full lg:w-72 shrink-0 space-y-4 ${sidebarOpen ? "" : "hidden lg:hidden"}`}>
        {/* Sidebar header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#a0a0a0] uppercase tracking-wider">Controls</h2>
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex items-center justify-center w-7 h-7 rounded-md text-[#666] hover:text-white hover:bg-[#1a1a1a] transition-colors"
            title="Hide sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* Quick Presets */}
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
          <button
            onClick={() => toggleSection("presets")}
            className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
          >
            <span>Quick Presets</span>
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has("presets") ? "" : "rotate-90"}`} />
          </button>
          {!collapsed.has("presets") && (
            <div className="border-t border-[#2a2a2a] px-4 pb-3 pt-2">
              <div className="space-y-1.5">
                {PRERUN_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => applyPreset(p)}
                    className="group flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[#262626]"
                  >
                    <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-[#555] transition-colors group-hover:text-[#5ba3e6]" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#e6e6e6] group-hover:text-[#5ba3e6]">
                        {p.shortName}
                        {p.recommended && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-[#5ba3e6]/10 px-1.5 py-0.5 text-[9px] font-medium text-[#5ba3e6]">
                            Best
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] leading-tight text-[#555] group-hover:text-[#a0a0a0]">
                        {p.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
          <button
            onClick={() => toggleSection("filters")}
            className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
          >
            <span>Filters <span className="normal-case text-[#666]">({minPctFromAth}% ATH, {minShortFloat}% SI{minScore > 0 ? `, ${minScore}+ score` : ""})</span></span>
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has("filters") ? "" : "rotate-90"}`} />
          </button>
          {!collapsed.has("filters") && (
            <div className="border-t border-[#2a2a2a] px-4 pb-4 pt-3 space-y-4">
              {/* Min % from ATH */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Min % from ATH</span>
                  <span className="text-white">{minPctFromAth}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={80}
                  step={5}
                  value={minPctFromAth}
                  onChange={(e) => setMinPctFromAth(Number(e.target.value))}
                  className="w-full accent-[#5ba3e6]"
                />
              </div>
              {/* Min Short Float % */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Min Short Float %</span>
                  <span className="text-white">{minShortFloat}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={minShortFloat}
                  onChange={(e) => setMinShortFloat(Number(e.target.value))}
                  className="w-full accent-[#5ba3e6]"
                />
              </div>
              {/* Max Market Cap */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Max Market Cap</span>
                  <span className="text-white">
                    {maxMarketCap === 0 ? "Any" : formatMktCap(maxMarketCap)}
                  </span>
                </div>
                <select
                  value={maxMarketCap}
                  onChange={(e) => setMaxMarketCap(Number(e.target.value))}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#5ba3e6] focus:outline-none"
                >
                  {MARKET_CAP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Min Score */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Min Score</span>
                  <span className="text-white">
                    {minScore === 0 ? "Any" : `${minScore}/14`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={14}
                  step={1}
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-full accent-[#5ba3e6]"
                />
              </div>
              {/* Sector Bucket */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Sector Bucket</span>
                </div>
                <select
                  value={sectorBucket}
                  onChange={(e) => setSectorBucket(e.target.value)}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#5ba3e6] focus:outline-none"
                >
                  <option value="All">All Sectors</option>
                  {sectorBuckets.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              {/* Earnings Within */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Earnings Within</span>
                </div>
                <select
                  value={earningsWithin}
                  onChange={(e) => setEarningsWithin(Number(e.target.value))}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#5ba3e6] focus:outline-none"
                >
                  {EARNINGS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Verdict */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Verdict</span>
                </div>
                <select
                  value={verdictFilter}
                  onChange={(e) => setVerdictFilter(e.target.value)}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#5ba3e6] focus:outline-none"
                >
                  <option value="All">All Verdicts</option>
                  <option value="PRIORITY">PRIORITY</option>
                  <option value="KEEP">KEEP</option>
                  <option value="WATCH">WATCH</option>
                  <option value="DISCARD">DISCARD</option>
                </select>
              </div>
              {/* Reset */}
              <button
                onClick={() => {
                  setMinPctFromAth(DEFAULT_PRERUN_FILTERS.minPctFromAth);
                  setMinShortFloat(DEFAULT_PRERUN_FILTERS.minShortFloat);
                  setMaxMarketCap(DEFAULT_PRERUN_FILTERS.maxMarketCap);
                  setMinScore(DEFAULT_PRERUN_FILTERS.minScore);
                  setSectorBucket(DEFAULT_PRERUN_FILTERS.sectorBucket);
                  setEarningsWithin(DEFAULT_PRERUN_FILTERS.earningsWithin);
                  setVerdictFilter(DEFAULT_PRERUN_FILTERS.verdict);
                }}
                className="w-full rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#666] hover:text-white hover:border-[#444] transition-colors mt-2"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>

        {/* Scan / Cancel */}
        <div className="flex gap-2">
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex-1 flex items-center justify-center gap-2 rounded-md bg-[#5ba3e6] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4a8fd4] disabled:opacity-50 transition-colors"
          >
            {scanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {scanning ? "Scanning..." : "Scan"}
          </button>
          {scanning && (
            <button
              onClick={cancelScan}
              className="rounded-md border border-[#2a2a2a] px-3 py-2.5 text-sm text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Ticker Search */}
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
          <button
            onClick={() => toggleSection("ticker")}
            className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
          >
            <span>Add Ticker</span>
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has("ticker") ? "" : "rotate-90"}`} />
          </button>
          {!collapsed.has("ticker") && (
            <div className="border-t border-[#2a2a2a] px-4 pb-4 pt-2 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tickerSearch}
                  onChange={(e) => setTickerSearch(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && lookupTicker()}
                  placeholder="e.g. SMCI, WOLF..."
                  className="flex-1 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white placeholder-[#555] focus:border-[#5ba3e6] focus:outline-none"
                />
                <button
                  onClick={lookupTicker}
                  disabled={tickerSearching || !tickerSearch.trim()}
                  className="rounded-md bg-[#5ba3e6] px-3 py-1.5 text-sm text-white hover:bg-[#4a8fd4] disabled:opacity-50 transition-colors"
                >
                  {tickerSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </button>
              </div>
              {tickerError && (
                <p className="text-xs text-red-400">{tickerError}</p>
              )}
            </div>
          )}
        </div>

        {/* Saved Scans */}
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
          <button
            onClick={() => toggleSection("saved")}
            className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
          >
            <span>Saved Scans <span className="normal-case text-[#666]">({savedScans.length})</span></span>
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has("saved") ? "" : "rotate-90"}`} />
          </button>
          {!collapsed.has("saved") && (
            <div className="border-t border-[#2a2a2a] px-4 pb-4 pt-2 space-y-2">
              {/* Save current */}
              {filtered.length > 0 && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="Scan name..."
                    className="flex-1 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-[#5ba3e6] focus:outline-none"
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  />
                  <button
                    onClick={handleSave}
                    className="rounded-md border border-[#2a2a2a] px-2 py-1.5 text-[#a0a0a0] hover:text-[#5ba3e6] hover:border-[#5ba3e6]/30"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {savedScans.length === 0 && (
                <p className="text-xs text-[#666] py-1">No saved scans yet</p>
              )}
              {savedScans.map((scan) => (
                <div
                  key={scan.id}
                  className="flex items-center justify-between rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 hover:border-[#444] transition-colors group"
                >
                  <button
                    onClick={() => handleLoadScan(scan)}
                    className="flex-1 text-left"
                  >
                    <p className="text-xs font-medium text-white truncate">
                      {scan.name}
                    </p>
                    <p className="text-[10px] text-[#666]">
                      {scan.candidateCount} results &middot;{" "}
                      {new Date(scan.savedAt).toLocaleDateString()}
                    </p>
                  </button>
                  <button
                    onClick={() => handleDelete(scan.id)}
                    className="ml-2 text-[#666] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {/* Progress */}
        {scanning && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-[#a0a0a0] mb-1">
              <span>{progress}</span>
              <span>
                {scannedCount}/{totalCount}
              </span>
            </div>
            <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#5ba3e6] rounded-full transition-all duration-300"
                style={{
                  width: totalCount > 0 ? `${(scannedCount / totalCount) * 100}%` : "0%",
                }}
              />
            </div>
          </div>
        )}

        {/* Summary bar */}
        {rawResults.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">
                Candidates
              </p>
              <p className="text-lg font-bold text-white">
                {stats.total}
                <span className="text-xs font-normal text-[#666] ml-1">
                  / {rawResults.length}
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-purple-500/20 bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-purple-400/60 mb-1">
                Priority
              </p>
              <p className="text-lg font-bold text-purple-400">
                {stats.priority}
              </p>
            </div>
            <div className="rounded-lg border border-green-500/20 bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-green-400/60 mb-1">
                Keep
              </p>
              <p className="text-lg font-bold text-green-400">
                {stats.keep}
              </p>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-amber-400/60 mb-1">
                Watch
              </p>
              <p className="text-lg font-bold text-amber-400">
                {stats.watch}
              </p>
            </div>
          </div>
        )}

        {/* Sort + Export row */}
        {sorted.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#666]">Sort:</span>
              {(
                [
                  { key: "score", label: "Score" },
                  { key: "pctFromAth", label: "% from ATH" },
                  { key: "shortFloat", label: "Short Float" },
                  { key: "earnings", label: "Earnings" },
                ] as { key: SortKey; label: string }[]
              ).map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSort(s.key)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
                    sortKey === s.key
                      ? "bg-[#5ba3e6]/10 text-[#5ba3e6] border border-[#5ba3e6]/30"
                      : "text-[#a0a0a0] hover:text-white border border-[#2a2a2a] hover:border-[#444]"
                  }`}
                >
                  {s.label}
                  {sortKey === s.key && (
                    <ArrowUpDown className="h-3 w-3" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/prerun/watchlist"
                className="flex items-center gap-1 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
              >
                <ListPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Watchlist</span>
              </Link>
              <button
                onClick={handleExport}
                className="flex items-center gap-1 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>
        )}

        {/* Errors */}
        {addError && (
          <div className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {addError}
          </div>
        )}

        {/* Results */}
        {sorted.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sorted.map((result, idx) => (
              <ResultCard
                key={result.data.ticker}
                result={result}
                index={idx}
                onAddToWatchlist={handleAddToWatchlist}
                justAdded={addedTicker === result.data.ticker}
                onRequestAiScore={requestAiScore}
                aiScoring={aiScoringTicker === result.data.ticker}
                aiResult={aiResults.get(result.data.ticker) ?? null}
              />
            ))}
          </div>
        ) : rawResults.length > 0 && !scanning ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#666]">
            <TrendingUp className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">
              No stocks matched the current filters.
            </p>
            <p className="text-xs mt-1">
              Try lowering Min Score or Min % from ATH.
            </p>
          </div>
        ) : !scanning ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#666]">
            <Zap className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">Pre-Run Scanner</p>
            <p className="text-xs mt-1 max-w-md text-center">
              Scan {getTickersForSector("All").length} stocks across {sectorBuckets.length} sector
              buckets for multi-bagger setups. Scores 7 criteria (A-G) through 3 hard gates.
            </p>
            <Link
              href="/prerun/guide"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs font-medium text-[#a0a0a0] transition-colors hover:text-[#5ba3e6] hover:border-[#5ba3e6]/30"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Pre-Run Guide
            </Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}

// -- Result Card Component --

function ResultCard({
  result,
  index,
  onAddToWatchlist,
  justAdded,
  onRequestAiScore,
  aiScoring,
  aiResult,
}: {
  result: PreRunResult;
  index: number;
  onAddToWatchlist: (result: PreRunResult) => void;
  justAdded: boolean;
  onRequestAiScore: (result: PreRunResult) => void;
  aiScoring: boolean;
  aiResult: { suggestedScore: number; reasoning: string; confidence: string } | null;
}) {
  const d = result.data;
  const s = result.scores;
  const g = result.gates;
  const isPriority = result.verdict === "PRIORITY";

  const criteriaLabels = ["A", "B", "C", "D", "E", "F", "G"] as const;
  const criteriaValues = [s.scoreA, s.scoreB, s.scoreC, s.scoreD, s.scoreE, s.scoreF, s.scoreG];
  const criteriaNames = ["Base", "SI", "Catalyst", "Earnings", "Coverage", "Volume", "Index"];

  return (
    <div
      className="ew-card-in rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 hover:border-[#3a3a3a] transition-colors"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Header: Ticker + Verdict */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">{d.ticker}</h3>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${verdictColor(result.verdict)} ${isPriority ? "animate-pulse" : ""}`}
            >
              {result.verdict}
            </span>
          </div>
          <p className="text-xs text-[#a0a0a0] truncate mt-0.5">{d.companyName}</p>
        </div>
        {d.currentPrice !== null && (
          <p className="text-sm font-medium text-white shrink-0 ml-2">
            ${d.currentPrice.toFixed(2)}
          </p>
        )}
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        {/* % from ATH */}
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-[#666] mb-0.5">% from ATH</p>
          <p className="text-lg font-bold text-white">
            {d.pctFromAth !== null ? `${d.pctFromAth.toFixed(0)}%` : "-"}
          </p>
        </div>
        {/* Short Float */}
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-[#666] mb-0.5">Short Float</p>
          <p className="text-lg font-bold text-white">
            {d.shortFloat !== null ? `${d.shortFloat.toFixed(1)}%` : "-"}
          </p>
        </div>
        {/* Days to Earnings */}
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-[#666] mb-0.5">Earnings</p>
          <p className={`text-lg font-bold ${d.daysToEarnings !== null && d.daysToEarnings <= 14 ? "text-amber-400 animate-pulse" : "text-white"}`}>
            {d.daysToEarnings !== null ? `${d.daysToEarnings}d` : "-"}
          </p>
        </div>
      </div>

      {/* Score bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[#a0a0a0]">Score</span>
          <span className="font-medium text-white">{s.finalScore}/14</span>
        </div>
        <div className="h-2 bg-[#0f0f0f] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${scoreBarGradient(s.finalScore, 14)}`}
            style={{ width: `${(s.finalScore / 14) * 100}%` }}
          />
        </div>
      </div>

      {/* Score dots (A-G) */}
      <div className="flex items-center gap-1.5 mb-3">
        {criteriaLabels.map((label, i) => (
          <div key={label} className="flex flex-col items-center gap-0.5" title={`${criteriaNames[i]}: ${criteriaValues[i]}/2`}>
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${scoreDotColor(criteriaValues[i])}`}
            >
              {label}
            </div>
            <span className="text-[8px] text-[#555]">{criteriaValues[i]}</span>
          </div>
        ))}
      </div>

      {/* Gate indicators */}
      <div className="flex items-center gap-2 mb-3">
        {(
          [
            { label: "G1", pass: g.gate1 },
            { label: "G2", pass: g.gate2 },
            { label: "G3", pass: g.gate3 },
          ] as const
        ).map((gate) => (
          <span
            key={gate.label}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              gate.pass
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
          >
            {gate.label}
            {gate.pass ? (
              <Check className="h-2.5 w-2.5" />
            ) : (
              <X className="h-2.5 w-2.5" />
            )}
          </span>
        ))}
        {/* Sector label */}
        <span className="ml-auto text-[10px] text-[#555] truncate max-w-[120px]">
          {getSectorForTicker(d.ticker)}
        </span>
      </div>

      {/* AI Score result */}
      {aiResult && (
        <div className="mb-3 rounded-md border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3 w-3 text-purple-400" />
            <span className="text-[10px] uppercase tracking-wider text-purple-400">AI Catalyst Score</span>
            <span className={`ml-auto text-xs font-bold ${aiResult.suggestedScore >= 2 ? "text-green-400" : aiResult.suggestedScore >= 1 ? "text-amber-400" : "text-red-400"}`}>
              {aiResult.suggestedScore}/2
            </span>
          </div>
          <p className="text-[11px] text-[#a0a0a0] leading-tight">{aiResult.reasoning}</p>
          <p className="text-[9px] text-[#555] mt-1">Confidence: {aiResult.confidence}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-auto pt-1">
        <button
          onClick={() => onAddToWatchlist(result)}
          disabled={justAdded}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            justAdded
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "border border-[#2a2a2a] text-[#a0a0a0] hover:text-white hover:border-[#444]"
          }`}
        >
          {justAdded ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Added
            </>
          ) : (
            <>
              <ListPlus className="h-3.5 w-3.5" />
              Add to Watchlist
            </>
          )}
        </button>
        <button
          onClick={() => onRequestAiScore(result)}
          disabled={aiScoring || aiResult !== null}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            aiResult
              ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
              : "border border-[#2a2a2a] text-[#a0a0a0] hover:text-purple-400 hover:border-purple-500/30"
          } disabled:opacity-50`}
        >
          {aiScoring ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          AI Score
        </button>
      </div>
    </div>
  );
}
