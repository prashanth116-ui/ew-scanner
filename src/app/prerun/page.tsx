"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense, memo } from "react";
import {
  Search,
  Loader2,
  X,
  Save,
  Trash2,
  ArrowUpDown,
  Zap,
  TrendingUp,
  AlertTriangle,
  ListPlus,
  Check,
  FileDown,
  Sparkles,
  Copy,
  Layers,
} from "lucide-react";
import Link from "next/link";
import type {
  PreRunResult,
  PreRunFilters,
  SavedPreRunScan,
  PreRunCriteriaFilter,
  MultiTFM2Result,
} from "@/lib/prerun/types";
import type { EmaTimeframe } from "@/lib/prerun/types";
import { DEFAULT_PRERUN_FILTERS, PRERUN_PRESETS, MAX_SCORE, ALL_EMA_TIMEFRAMES } from "@/lib/prerun/types";
import {
  type TFFilterValue, type TrendFilterValue, type BoolFilterValue, type VolFilterValue,
  type LeadingFilters,
  TF_FILTER_OPTIONS, TREND_FILTER_OPTIONS, VOL_FILTER_OPTIONS,
  INIT_TF_FILTERS, INIT_TREND_FILTERS, INIT_BOOL_FILTERS, INIT_VOL_FILTERS,
  TF_FILTER_PRESETS, rowPassesTFFilters,
} from "@/lib/prerun/tf-filters";
import {
  savePreRunScan,
  loadPreRunScans,
  deletePreRunScan,
  addToPreRunWatchlist,
  seedWatchlistIfEmpty,
  saveScanResults,
  saveMultiTFCache,
  loadMultiTFCache,
} from "@/lib/prerun/storage";
import { exportPreRunToExcel } from "@/lib/prerun/export";
import {
  getTickersForSector,
  getSectorBuckets,
  getSectorForTicker,
} from "@/data/prerun-universe";
import { ScannerCTA } from "@/components/scanner-cta";
import { useCollapsibleSections } from "@/lib/use-collapsible-sections";
import { useSidebarState } from "@/lib/use-sidebar-state";
import { formatMktCap } from "@/lib/format-utils";
import { verdictColor, scoreBarGradient, scoreDotColor } from "@/lib/color-utils";
import { SidebarShell } from "@/components/sidebar-shell";
import { SidebarSection } from "@/components/sidebar-section";
import { PresetList } from "@/components/preset-list";
import { ProgressBar } from "@/components/progress-bar";
import { loadFromCache, saveToCache } from "@/lib/scan-cache";

const BATCH_SIZE = 10;
const BATCH_DELAY = 2000;

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


export default function PreRunPageWrapper() {
  return (
    <>
      <Suspense fallback={null}>
        <PreRunPage />
      </Suspense>
      <ScannerCTA />
    </>
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
  const [emaTimeframe, setEmaTimeframe] = useState<EmaTimeframe>(DEFAULT_PRERUN_FILTERS.emaTimeframe);

  // Criteria-level filters (from presets like Stage 1→2)
  const [criteriaFilters, setCriteriaFilters] = useState<PreRunCriteriaFilter[]>([]);

  // Gate 3 skip (for Pullback Buy — shows stocks below SMA20)
  const [skipGate3, setSkipGate3] = useState(false);

  // Multi-TF M2 state
  const [multiTFResults, setMultiTFResults] = useState<Map<string, MultiTFM2Result>>(new Map());
  const [showMultiTF, setShowMultiTF] = useState(false);
  const [multiTFScanning, setMultiTFScanning] = useState(false);
  const [multiTFProgress, setMultiTFProgress] = useState("");

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
  const [sidebarOpen, setSidebarOpen] = useSidebarState("prerun");
  const { collapsed, toggleSection } = useCollapsibleSections(undefined, "prerun");

  // Saved scans
  const [savedScans, setSavedScans] = useState<SavedPreRunScan[]>([]);
  const [saveName, setSaveName] = useState("");

  // Watchlist add feedback
  const [addedTicker, setAddedTicker] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  // Copy watchlist
  const [copiedToast, setCopiedToast] = useState(false);

  // Seed watchlist on mount + load cache
  useEffect(() => {
    seedWatchlistIfEmpty();
    setSavedScans(loadPreRunScans());
    // Pre-populate from cache (30-min TTL)
    const cached = loadFromCache<PreRunResult[]>("ew-prerun-scan-v1", 30 * 60 * 1000);
    if (cached && cached.length > 0) {
      setRawResults(cached);
    }
    // Load multi-TF cache
    const tfCache = loadMultiTFCache();
    if (tfCache && tfCache.results.length > 0) {
      const map = new Map<string, MultiTFM2Result>();
      for (const r of tfCache.results) map.set(r.ticker, r);
      setMultiTFResults(map);
    }
  }, []);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      scanAbort.current?.abort();
    };
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
      emaTimeframe,
    }),
    [minPctFromAth, minShortFloat, maxMarketCap, minScore, sectorBucket, earningsWithin, verdictFilter, emaTimeframe]
  );

  // Helper to get a criterion score by letter
  const getCriterionScore = useCallback((scores: typeof rawResults[0]["scores"], criterion: string): number => {
    const key = `score${criterion}` as keyof typeof scores;
    const val = scores[key];
    return typeof val === "number" ? val : 0;
  }, []);

  // Filter + sort results
  const filtered = useMemo(() => {
    return rawResults.filter((r) => {
      if (filters.minPctFromAth > 0 && (r.data.pctFromAth ?? 0) < filters.minPctFromAth) return false;
      if (filters.minShortFloat > 0 && (r.data.shortFloat ?? 0) < filters.minShortFloat) return false;
      if (filters.maxMarketCap > 0 && (r.data.marketCap ?? Infinity) > filters.maxMarketCap) return false;
      if (skipGate3) {
        if (!r.gates.gate1) return false;
        if (filters.minScore > 0 && r.scores.totalScore < filters.minScore) return false;
      } else {
        if (filters.minScore > 0 && r.scores.finalScore < filters.minScore) return false;
      }
      if (filters.earningsWithin > 0 && (r.data.daysToEarnings === null || r.data.daysToEarnings > filters.earningsWithin)) return false;
      if (filters.verdict !== "All" && r.verdict !== filters.verdict) return false;
      if (filters.sectorBucket !== "All") {
        const ticker = r.data.ticker;
        const sector = getSectorForTicker(ticker);
        if (sector !== filters.sectorBucket) return false;
      }
      // Criteria-level filters (e.g., Stage 1→2 preset)
      for (const cf of criteriaFilters) {
        if (getCriterionScore(r.scores, cf.criterion) < cf.min) return false;
      }
      return true;
    });
  }, [rawResults, filters, criteriaFilters, getCriterionScore, skipGate3]);

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

  // Phase 2: Multi-TF M2 scan for candidate tickers
  const runMultiTFPhase2 = useCallback(async (candidates: PreRunResult[]) => {
    if (candidates.length === 0) return;

    setMultiTFScanning(true);
    setMultiTFProgress(`Fetching M2 for ${candidates.length} candidates across 6 timeframes...`);

    const candidateTickers = candidates.map((r) => r.data.ticker);
    // Skip 1d — already have it from Phase 1
    const timeframes: EmaTimeframe[] = ["15m", "1h", "4h", "12h", "1wk", "1mo"];

    // Also populate 1d results from Phase 1 data
    const phase1Map = new Map<string, MultiTFM2Result>();
    for (const r of candidates) {
      const d = r.data;
      phase1Map.set(d.ticker, {
        ticker: d.ticker,
        timeframes: {
          "1d": {
            scoreM2: r.scores.scoreM2,
            trendStrength: d.emaM2TrendStrength,
            bullishCross: d.emaM2BullishCross,
            priceAboveBoth: d.emaM2PriceAboveBoth,
            dataPoints: d.emaM2DataPoints,
            displacementNearCross: d.emaM2DisplacementNearCross,
            fvgNearCross: d.emaM2FvgNearCross,
            volumeRatio: null,
            converging: null,
            spreadDelta: null,
            squeezed: null,
            atrRatio: null,
          },
        },
      });
    }

    try {
      // Batch tickers in groups of 10 for the API
      const PHASE2_BATCH = 10;
      for (let i = 0; i < candidateTickers.length; i += PHASE2_BATCH) {
        const batch = candidateTickers.slice(i, i + PHASE2_BATCH);
        setMultiTFProgress(
          `M2 Phase 2: ${Math.min(i + PHASE2_BATCH, candidateTickers.length)}/${candidateTickers.length} tickers...`
        );

        try {
          const res = await fetch("/api/prerun/m2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tickers: batch, timeframes }),
          });

          if (res.ok) {
            const data = (await res.json()) as { results: MultiTFM2Result[] };
            if (data.results) {
              for (const tfResult of data.results) {
                const existing = phase1Map.get(tfResult.ticker);
                if (existing) {
                  // Merge Phase 2 timeframes into Phase 1 entry
                  existing.timeframes = { ...existing.timeframes, ...tfResult.timeframes };
                } else {
                  phase1Map.set(tfResult.ticker, tfResult);
                }
              }
            }
          }
        } catch {
          // Continue on error — partial results are fine
        }

        // Update state progressively
        setMultiTFResults(new Map(phase1Map));

        if (i + PHASE2_BATCH < candidateTickers.length) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      // Save to cache
      saveMultiTFCache(Array.from(phase1Map.values()));
    } catch {
      // Non-critical — Phase 1 results still valid
    }

    setMultiTFScanning(false);
    setMultiTFProgress("");
  }, []);

  // Scan
  const runScan = useCallback(async () => {
    scanAbort.current?.abort();
    const controller = new AbortController();
    scanAbort.current = controller;
    const signal = controller.signal;

    setScanning(true);
    setRawResults([]);
    setScannedCount(0);
    if (showMultiTF) setMultiTFResults(new Map());

    const tickers = getTickersForSector(sectorBucket);
    setTotalCount(tickers.length);

    if (tickers.length === 0) {
      setScanning(false);
      return;
    }

    // For multi-TF presets, force Phase 1 to use 1d (free — reuses chart3mo)
    const phase1Timeframe: EmaTimeframe = showMultiTF ? "1d" : emaTimeframe;

    const results: PreRunResult[] = [];

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      if (signal.aborted) break;
      const batch = tickers.slice(i, i + BATCH_SIZE);
      setProgress(
        `${showMultiTF ? "Phase 1: " : ""}Fetching ${Math.min(i + BATCH_SIZE, tickers.length)}/${tickers.length}...`
      );

      try {
        const res = await fetch("/api/prerun/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickers: batch, emaTimeframe: phase1Timeframe }),
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

    // Save results to persistent storage + localStorage cache
    saveScanResults(results);
    saveToCache("ew-prerun-scan-v1", results);
    setScanning(false);
    setProgress("");

    // Phase 2: Multi-TF M2 scan for candidates that pass filters
    if (showMultiTF && !signal.aborted && results.length > 0) {
      // Filter candidates using current criteria filters
      const candidates = results.filter((r) => {
        if (r.scores.finalScore < minScore) return false;
        for (const cf of criteriaFilters) {
          const key = `score${cf.criterion}` as keyof typeof r.scores;
          const val = r.scores[key];
          if (typeof val === "number" && val < cf.min) return false;
        }
        return true;
      });
      runMultiTFPhase2(candidates);
    }
  }, [sectorBucket, emaTimeframe, showMultiTF, criteriaFilters, minScore, runMultiTFPhase2]);

  const cancelScan = useCallback(() => {
    scanAbort.current?.abort();
    scanAbort.current = null;
    setScanning(false);
    setMultiTFScanning(false);
    setProgress("");
    setMultiTFProgress("");
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
      const res = await fetch(`/api/prerun/stock?ticker=${encodeURIComponent(ticker)}&emaTimeframe=${emaTimeframe}`);
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
  }, [tickerSearch, rawResults, emaTimeframe]);

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
    setEmaTimeframe(scan.filters.emaTimeframe ?? "15m");
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
    setEmaTimeframe(f.emaTimeframe);
    setCriteriaFilters(preset.criteriaFilters ?? []);
    setShowMultiTF(preset.multiTF ?? false);
    setSkipGate3(preset.skipGate3 ?? false);
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

  const copyWatchlist = useCallback(() => {
    const symbols = sorted.map((r) => r.data.ticker).join(", ");
    navigator.clipboard.writeText(symbols).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    });
  }, [sorted]);

  const sectorBuckets = useMemo(() => getSectorBuckets(), []);

  return (
    <div className="flex flex-col lg:flex-row gap-6 px-4 sm:px-6 py-6 max-w-[1600px] mx-auto">
      <SidebarShell open={sidebarOpen} onToggle={setSidebarOpen}>
        {/* Quick Presets */}
        <SidebarSection title="Quick Presets" sectionKey="presets" collapsed={collapsed.has("presets")} onToggle={toggleSection}>
          <PresetList presets={PRERUN_PRESETS} onSelect={applyPreset} />
        </SidebarSection>

        {/* Filters */}
        <SidebarSection
          title={`Filters (${minPctFromAth}% ATH, ${minShortFloat}% SI${minScore > 0 ? `, ${minScore}+ score` : ""})`}
          sectionKey="filters"
          collapsed={collapsed.has("filters")}
          onToggle={toggleSection}
        >
            <div className="space-y-4">
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
                    {minScore === 0 ? "Any" : `${minScore}/${MAX_SCORE}`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={MAX_SCORE}
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
              {/* M2 EMA Timeframe */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">M2 EMA Timeframe</span>
                  <span className="text-white">{emaTimeframe}</span>
                </div>
                <select
                  value={emaTimeframe}
                  onChange={(e) => setEmaTimeframe(e.target.value as EmaTimeframe)}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#5ba3e6] focus:outline-none"
                >
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                  <option value="12h">12h</option>
                  <option value="1d">1d</option>
                  <option value="1wk">1wk</option>
                  <option value="1mo">1mo</option>
                </select>
              </div>
              <button
                onClick={() => {
                  setMinPctFromAth(DEFAULT_PRERUN_FILTERS.minPctFromAth);
                  setMinShortFloat(DEFAULT_PRERUN_FILTERS.minShortFloat);
                  setMaxMarketCap(DEFAULT_PRERUN_FILTERS.maxMarketCap);
                  setMinScore(DEFAULT_PRERUN_FILTERS.minScore);
                  setSectorBucket(DEFAULT_PRERUN_FILTERS.sectorBucket);
                  setEarningsWithin(DEFAULT_PRERUN_FILTERS.earningsWithin);
                  setVerdictFilter(DEFAULT_PRERUN_FILTERS.verdict);
                  setEmaTimeframe(DEFAULT_PRERUN_FILTERS.emaTimeframe);
                  setCriteriaFilters([]);
                  setSkipGate3(false);
                }}
                className="w-full rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#666] hover:text-white hover:border-[#444] transition-colors mt-2"
              >
                Reset Filters
              </button>
            </div>
        </SidebarSection>

        {/* Active criteria filters indicator */}
        {criteriaFilters.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-[#5ba3e6]/20 bg-[#5ba3e6]/5 px-3 py-2">
            <Zap className="h-3 w-3 text-[#5ba3e6] shrink-0" />
            <span className="text-[10px] text-[#5ba3e6]">
              Criteria gates: {criteriaFilters.map((cf) => `${cf.criterion}≥${cf.min}`).join(", ")}
            </span>
            <button
              onClick={() => setCriteriaFilters([])}
              className="ml-auto text-[#5ba3e6]/50 hover:text-[#5ba3e6]"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

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
        <SidebarSection title="Add Ticker" sectionKey="ticker" collapsed={collapsed.has("ticker")} onToggle={toggleSection}>
            <div className="space-y-2">
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
        </SidebarSection>

        {/* Saved Scans */}
        <SidebarSection
          title={`Saved Scans (${savedScans.length})`}
          sectionKey="saved"
          collapsed={collapsed.has("saved")}
          onToggle={toggleSection}
        >
            <div className="space-y-2">
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
        </SidebarSection>
      </SidebarShell>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {/* Progress */}
        {scanning && (
          <div className="mb-4">
            <ProgressBar
              current={scannedCount}
              total={totalCount}
              label={`${progress}${totalCount > 200 && scannedCount > 0 && scannedCount < totalCount ? ` (~${Math.ceil(((totalCount - scannedCount) / BATCH_SIZE) * (BATCH_DELAY / 1000) / 60)}min left)` : ""}`}
              color="bg-[#10b981]"
            />
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
              <button
                onClick={() => setShowMultiTF((v) => !v)}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors ${
                  showMultiTF
                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                    : "border border-[#2a2a2a] text-[#a0a0a0] hover:text-white hover:border-[#444]"
                }`}
                title="Toggle multi-timeframe M2 table"
              >
                <Layers className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Multi-TF</span>
              </button>
              <button
                onClick={copyWatchlist}
                className="flex items-center gap-1 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
                title="Copy all visible tickers to clipboard"
              >
                {copiedToast ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-400" />
                    <span className="text-green-400 hidden sm:inline">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Copy Tickers</span>
                  </>
                )}
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

        {/* Multi-TF M2 Table */}
        {showMultiTF && multiTFResults.size > 0 && (
          <MultiTFTable
            results={multiTFResults}
            scanning={multiTFScanning}
            progress={multiTFProgress}
          />
        )}

        {/* Multi-TF Phase 2 progress */}
        {multiTFScanning && (
          <div className="mb-4">
            <ProgressBar
              current={0}
              total={0}
              label={multiTFProgress}
              color="bg-purple-500"
            />
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
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-12 text-center">
            <TrendingUp className="mx-auto h-12 w-12 text-[#333]" />
            <h2 className="mt-4 text-lg font-semibold text-white">
              Ready to Scan
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#a0a0a0]">
              Screen {getTickersForSector("All").length} stocks across {sectorBuckets.length} sectors
              for multi-bagger setups. Scores 18 criteria through 3 hard gates with pattern matching.
            </p>
            <div className="mx-auto mt-6 grid max-w-lg grid-cols-4 gap-3">
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#10b981]">{getTickersForSector("All").length}</p>
                <p className="text-[10px] text-[#666]">Stocks</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#10b981]">18</p>
                <p className="text-[10px] text-[#666]">Score Criteria</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#10b981]">3</p>
                <p className="text-[10px] text-[#666]">Hard Gates</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#10b981]">AI</p>
                <p className="text-[10px] text-[#666]">Scoring</p>
              </div>
            </div>
            <Link
              href="/prerun/guide"
              className="mt-6 inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-xs font-medium text-[#a0a0a0] transition-colors hover:text-[#10b981] hover:border-[#10b981]/30"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Pre-Run Guide
            </Link>
          </div>
        ) : null}

        {/* Filtered-out disclosure */}
        {rawResults.length > filtered.length && sorted.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-[#555] hover:text-[#888] transition-colors">
              {rawResults.length - filtered.length} stock{rawResults.length - filtered.length !== 1 ? "s" : ""} filtered out
            </summary>
            <p className="mt-1 text-[11px] text-[#444]">
              {rawResults.length - filtered.length} of {rawResults.length} scanned stocks did not pass the current filter thresholds.
              Adjust Min Score, % from ATH, or sector filter to include more results.
            </p>
          </details>
        )}
      </main>
    </div>
  );
}

// -- Result Card Component --

const ResultCard = memo(function ResultCard({
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

  const criteriaLabels = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "M2", "N", "O", "P", "Q"] as const;
  const criteriaValues = [s.scoreA, s.scoreB, s.scoreC, s.scoreD, s.scoreE, s.scoreF, s.scoreG, s.scoreH, s.scoreI, s.scoreJ, s.scoreK, s.scoreL, s.scoreM, s.scoreM2, s.scoreN, s.scoreO, s.scoreP, s.scoreQ];
  const criteriaMaxes = [2, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
  const emaTfLabel = d.emaM2Timeframe ?? "15m";
  const criteriaNames = ["Base", "SI", "Catalyst", "Earnings", "Coverage", "Volume", "Index", "Insider", "Options", "RelStr", "Breakout", "HigherLows", "EMAReclaim", `${emaTfLabel}EMA`, "RangeCoil", "FailedBD", "Revisions", "Squeeze"];

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
          <span className="font-medium text-white">
            {s.finalScore}/{MAX_SCORE}
            {s.sectorModifier !== 0 && (
              <span className={s.sectorModifier > 0 ? "text-green-400 ml-1" : "text-red-400 ml-1"}>
                ({s.sectorModifier > 0 ? "+" : ""}{s.sectorModifier} sector)
              </span>
            )}
          </span>
        </div>
        <div className="h-2 bg-[#0f0f0f] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${scoreBarGradient(s.finalScore, MAX_SCORE)}`}
            style={{ width: `${Math.min(100, (s.finalScore / MAX_SCORE) * 100)}%` }}
          />
        </div>
      </div>

      {/* Base Quality Score badge (A + K + F) */}
      {(() => {
        const baseScore = s.scoreA + s.scoreK + s.scoreF;
        const baseMax = 6; // A:2 + K:2 + F:2
        const baseColor = baseScore >= 5 ? "text-green-400 border-green-500/30 bg-green-500/10"
          : baseScore >= 3 ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
          : "text-[#666] border-[#2a2a2a] bg-[#0f0f0f]";
        return (
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium ${baseColor}`}>
              Base Quality: {baseScore}/{baseMax}
            </span>
            <span className="text-[9px] text-[#555]">A:{s.scoreA} + K:{s.scoreK} + F:{s.scoreF}</span>
          </div>
        );
      })()}

      {/* Score dots (A-O) */}
      <div className="flex flex-wrap items-center gap-1 mb-3">
        {criteriaLabels.map((label, i) => (
          <div key={label} className="flex flex-col items-center gap-0.5" title={`${criteriaNames[i]}: ${criteriaValues[i]}/${criteriaMaxes[i]}`}>
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${scoreDotColor(criteriaValues[i], criteriaMaxes[i])}`}
            >
              {label}
            </div>
            <span className="text-[8px] text-[#555]">{criteriaValues[i]}</span>
          </div>
        ))}
      </div>

      {/* Pattern match badge */}
      {result.patternMatch && (
        <div className="mb-3 flex items-center gap-1.5 rounded-md border border-[#5ba3e6]/20 bg-[#5ba3e6]/5 px-2.5 py-1.5">
          <TrendingUp className="h-3 w-3 text-[#5ba3e6] shrink-0" />
          <span className="text-[10px] text-[#5ba3e6]">
            Similar to: <strong>{result.patternMatch.template}</strong> ({result.patternMatch.similarity}% match)
          </span>
        </div>
      )}

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
});

// -- Multi-TF M2 Table Component --

const TF_LABELS: EmaTimeframe[] = ["15m", "1h", "4h", "12h", "1d", "1wk", "1mo"];

function trendColor(trend: string | null | undefined): string {
  switch (trend) {
    case "strong": return "text-green-400 bg-green-500/10";
    case "moderate": return "text-amber-400 bg-amber-500/10";
    case "weak": return "text-orange-400 bg-orange-500/10";
    case "bearish": return "text-red-400 bg-red-500/10";
    default: return "text-[#555] bg-[#0f0f0f]";
  }
}

function scoreDisplay(score: number): { text: string; color: string } {
  if (score === 2) return { text: "2", color: "text-green-400 font-bold" };
  if (score === 1) return { text: "1", color: "text-amber-400" };
  return { text: "0", color: "text-[#555]" };
}

const MultiTFTable = memo(function MultiTFTable({
  results,
  scanning,
  progress,
}: {
  results: Map<string, MultiTFM2Result>;
  scanning: boolean;
  progress: string;
}) {
  const [tfFilters, setTFFilters] = useState<Record<EmaTimeframe, TFFilterValue>>({ ...INIT_TF_FILTERS });
  const [trendFilters, setTrendFilters] = useState<Record<EmaTimeframe, TrendFilterValue>>({ ...INIT_TREND_FILTERS });

  // Quality filters (Phase 1)
  const [dispFilters, setDispFilters] = useState<Record<EmaTimeframe, BoolFilterValue>>({ ...INIT_BOOL_FILTERS });
  const [fvgFilters, setFvgFilters] = useState<Record<EmaTimeframe, BoolFilterValue>>({ ...INIT_BOOL_FILTERS });

  // Leading indicator filters (Phase 3)
  const [showLeading, setShowLeading] = useState(false);
  const [volFilters, setVolFilters] = useState<Record<EmaTimeframe, VolFilterValue>>({ ...INIT_VOL_FILTERS });
  const [convFilters, setConvFilters] = useState<Record<EmaTimeframe, BoolFilterValue>>({ ...INIT_BOOL_FILTERS });
  const [squeezeFilters, setSqueezeFilters] = useState<Record<EmaTimeframe, BoolFilterValue>>({ ...INIT_BOOL_FILTERS });

  const leadingFilters = useMemo((): LeadingFilters => ({
    disp: dispFilters,
    fvg: fvgFilters,
    vol: volFilters,
    conv: convFilters,
    squeeze: squeezeFilters,
  }), [dispFilters, fvgFilters, volFilters, convFilters, squeezeFilters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const tf of TF_LABELS) {
      if (tfFilters[tf] !== "any") count++;
      if (trendFilters[tf] !== "any") count++;
      if (dispFilters[tf] !== "any") count++;
      if (fvgFilters[tf] !== "any") count++;
      if (volFilters[tf] !== "any") count++;
      if (convFilters[tf] !== "any") count++;
      if (squeezeFilters[tf] !== "any") count++;
    }
    return count;
  }, [tfFilters, trendFilters, dispFilters, fvgFilters, volFilters, convFilters, squeezeFilters]);

  const resetAllFilters = useCallback(() => {
    setTFFilters({ ...INIT_TF_FILTERS });
    setTrendFilters({ ...INIT_TREND_FILTERS });
    setDispFilters({ ...INIT_BOOL_FILTERS });
    setFvgFilters({ ...INIT_BOOL_FILTERS });
    setVolFilters({ ...INIT_VOL_FILTERS });
    setConvFilters({ ...INIT_BOOL_FILTERS });
    setSqueezeFilters({ ...INIT_BOOL_FILTERS });
  }, []);

  // Sort by total M2 score across timeframes (descending), tie-break by ticker
  const sorted = useMemo(() => {
    const entries = Array.from(results.values());
    return entries
      .map((r) => {
        let totalScore = 0;
        let bestTF: EmaTimeframe | null = null;
        let bestScore = -1;
        for (const tf of TF_LABELS) {
          const tfr = r.timeframes[tf];
          if (tfr) {
            totalScore += tfr.scoreM2;
            // Tie-break: prefer faster timeframe
            if (tfr.scoreM2 > bestScore) {
              bestScore = tfr.scoreM2;
              bestTF = tf;
            }
          }
        }
        return { ...r, totalScore, bestTF };
      })
      .filter((row) => rowPassesTFFilters(row, tfFilters, trendFilters, leadingFilters))
      .sort((a, b) => b.totalScore - a.totalScore || a.ticker.localeCompare(b.ticker));
  }, [results, tfFilters, trendFilters, leadingFilters]);

  if (results.size === 0 && !scanning) return null;

  return (
    <div className="mb-4 rounded-lg border border-purple-500/20 bg-[#141414] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
        <div className="flex items-center gap-2 flex-wrap">
          <Layers className="h-4 w-4 text-purple-400" />
          <h3 className="text-sm font-medium text-white">
            Multi-Timeframe M2 EMA
          </h3>
          <span className="text-[10px] text-[#666]">
            {sorted.length}{activeFilterCount > 0 ? `/${results.size}` : ""} stocks
          </span>
          {TF_FILTER_PRESETS.map((p) => {
            const isActive = activeFilterCount > 0 &&
              TF_LABELS.every((tf) => tfFilters[tf] === p.filters[tf]) &&
              TF_LABELS.every((tf) => trendFilters[tf] === (p.trendFilters?.[tf] ?? "any")) &&
              TF_LABELS.every((tf) => dispFilters[tf] === (p.leadingFilters?.disp?.[tf] ?? "any")) &&
              TF_LABELS.every((tf) => fvgFilters[tf] === (p.leadingFilters?.fvg?.[tf] ?? "any")) &&
              TF_LABELS.every((tf) => volFilters[tf] === (p.leadingFilters?.vol?.[tf] ?? "any")) &&
              TF_LABELS.every((tf) => convFilters[tf] === (p.leadingFilters?.conv?.[tf] ?? "any")) &&
              TF_LABELS.every((tf) => squeezeFilters[tf] === (p.leadingFilters?.squeeze?.[tf] ?? "any"));
            return (
              <button
                key={p.id}
                onClick={() => {
                  if (isActive) {
                    resetAllFilters();
                  } else {
                    setTFFilters({ ...p.filters });
                    setTrendFilters(p.trendFilters ? { ...p.trendFilters } : { ...INIT_TREND_FILTERS });
                    setDispFilters(p.leadingFilters?.disp ? { ...p.leadingFilters.disp } : { ...INIT_BOOL_FILTERS });
                    setFvgFilters(p.leadingFilters?.fvg ? { ...p.leadingFilters.fvg } : { ...INIT_BOOL_FILTERS });
                    setVolFilters(p.leadingFilters?.vol ? { ...p.leadingFilters.vol } : { ...INIT_VOL_FILTERS });
                    setConvFilters(p.leadingFilters?.conv ? { ...p.leadingFilters.conv } : { ...INIT_BOOL_FILTERS });
                    setSqueezeFilters(p.leadingFilters?.squeeze ? { ...p.leadingFilters.squeeze } : { ...INIT_BOOL_FILTERS });
                    // Auto-show leading row if preset uses leading filters
                    if (p.leadingFilters?.vol || p.leadingFilters?.conv || p.leadingFilters?.squeeze) {
                      setShowLeading(true);
                    }
                  }
                }}
                title={p.description}
                className={`text-[10px] rounded px-1.5 py-0.5 border transition-colors ${
                  isActive
                    ? "border-purple-500/50 bg-purple-500/10 text-purple-300"
                    : "border-[#333] text-[#666] hover:text-white hover:border-[#555]"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          {activeFilterCount > 0 && (
            <>
              <span className="text-[10px] text-purple-400">
                {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
              </span>
              <button
                onClick={resetAllFilters}
                className="text-[10px] text-[#888] hover:text-white transition-colors"
              >
                Reset
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLeading((v) => !v)}
            className={`text-[10px] rounded px-1.5 py-0.5 border transition-colors ${
              showLeading
                ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                : "border-[#333] text-[#666] hover:text-white hover:border-[#555]"
            }`}
            title="Toggle leading indicator filters & badges"
          >
            Leading
          </button>
          {scanning && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
              <span className="text-[10px] text-purple-400">{progress}</span>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            {/* Score + Trend filter row */}
            <tr className="border-b border-[#2a2a2a] text-[#666]">
              <th className="py-2 pl-4 pr-2 text-left font-medium sticky left-0 bg-[#141414] z-10">Ticker</th>
              {TF_LABELS.map((tf) => (
                <th key={tf} className="py-1.5 px-1.5 text-center font-medium whitespace-nowrap">
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{tf}</span>
                    <select
                      value={tfFilters[tf]}
                      onChange={(e) =>
                        setTFFilters((prev) => ({ ...prev, [tf]: e.target.value as TFFilterValue }))
                      }
                      className={`w-[46px] text-[9px] rounded px-0.5 py-0 border bg-[#0f0f0f] outline-none cursor-pointer ${
                        tfFilters[tf] !== "any"
                          ? "border-purple-500/50 text-purple-300"
                          : "border-[#333] text-[#666]"
                      }`}
                    >
                      {TF_FILTER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={trendFilters[tf]}
                      onChange={(e) =>
                        setTrendFilters((prev) => ({ ...prev, [tf]: e.target.value as TrendFilterValue }))
                      }
                      className={`w-[46px] text-[9px] rounded px-0.5 py-0 border bg-[#0f0f0f] outline-none cursor-pointer ${
                        trendFilters[tf] !== "any"
                          ? "border-purple-500/50 text-purple-300"
                          : "border-[#333] text-[#666]"
                      }`}
                    >
                      {TREND_FILTER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </th>
              ))}
              <th className="py-2 px-3 text-center font-medium">Total</th>
              <th className="py-2 px-3 pr-4 text-center font-medium">Best TF</th>
            </tr>

            {/* Quality filter row (Disp + FVG) */}
            <tr className="border-b border-[#2a2a2a]/50 text-[#555]">
              <th className="py-1 pl-4 pr-2 text-left text-[9px] font-normal sticky left-0 bg-[#141414] z-10">Quality</th>
              {TF_LABELS.map((tf) => (
                <th key={tf} className="py-1 px-1.5 text-center whitespace-nowrap">
                  <div className="flex flex-col items-center gap-0.5">
                    <select
                      value={dispFilters[tf]}
                      onChange={(e) =>
                        setDispFilters((prev) => ({ ...prev, [tf]: e.target.value as BoolFilterValue }))
                      }
                      title="Displacement near cross"
                      className={`w-[46px] text-[9px] rounded px-0.5 py-0 border bg-[#0f0f0f] outline-none cursor-pointer ${
                        dispFilters[tf] !== "any"
                          ? "border-amber-500/50 text-amber-300"
                          : "border-[#222] text-[#555]"
                      }`}
                    >
                      <option value="any">Disp</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                    <select
                      value={fvgFilters[tf]}
                      onChange={(e) =>
                        setFvgFilters((prev) => ({ ...prev, [tf]: e.target.value as BoolFilterValue }))
                      }
                      title="FVG near cross"
                      className={`w-[46px] text-[9px] rounded px-0.5 py-0 border bg-[#0f0f0f] outline-none cursor-pointer ${
                        fvgFilters[tf] !== "any"
                          ? "border-amber-500/50 text-amber-300"
                          : "border-[#222] text-[#555]"
                      }`}
                    >
                      <option value="any">FVG</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </th>
              ))}
              <th className="py-1 px-3" />
              <th className="py-1 px-3 pr-4" />
            </tr>

            {/* Leading indicator filter row (Vol + Conv + Squeeze) - toggleable */}
            {showLeading && (
              <tr className="border-b border-cyan-500/10 text-[#555]">
                <th className="py-1 pl-4 pr-2 text-left text-[9px] font-normal sticky left-0 bg-[#141414] z-10 text-cyan-400/60">Leading</th>
                {TF_LABELS.map((tf) => (
                  <th key={tf} className="py-1 px-1.5 text-center whitespace-nowrap">
                    <div className="flex flex-col items-center gap-0.5">
                      <select
                        value={volFilters[tf]}
                        onChange={(e) =>
                          setVolFilters((prev) => ({ ...prev, [tf]: e.target.value as VolFilterValue }))
                        }
                        title="Volume ratio filter"
                        className={`w-[46px] text-[9px] rounded px-0.5 py-0 border bg-[#0f0f0f] outline-none cursor-pointer ${
                          volFilters[tf] !== "any"
                            ? "border-cyan-500/50 text-cyan-300"
                            : "border-[#222] text-[#555]"
                        }`}
                      >
                        {VOL_FILTER_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.value === "any" ? "Vol" : opt.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={convFilters[tf]}
                        onChange={(e) =>
                          setConvFilters((prev) => ({ ...prev, [tf]: e.target.value as BoolFilterValue }))
                        }
                        title="EMA converging filter"
                        className={`w-[46px] text-[9px] rounded px-0.5 py-0 border bg-[#0f0f0f] outline-none cursor-pointer ${
                          convFilters[tf] !== "any"
                            ? "border-cyan-500/50 text-cyan-300"
                            : "border-[#222] text-[#555]"
                        }`}
                      >
                        <option value="any">Conv</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                      <select
                        value={squeezeFilters[tf]}
                        onChange={(e) =>
                          setSqueezeFilters((prev) => ({ ...prev, [tf]: e.target.value as BoolFilterValue }))
                        }
                        title="Volatility squeeze filter"
                        className={`w-[46px] text-[9px] rounded px-0.5 py-0 border bg-[#0f0f0f] outline-none cursor-pointer ${
                          squeezeFilters[tf] !== "any"
                            ? "border-cyan-500/50 text-cyan-300"
                            : "border-[#222] text-[#555]"
                        }`}
                      >
                        <option value="any">Sqz</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                  </th>
                ))}
                <th className="py-1 px-3" />
                <th className="py-1 px-3 pr-4" />
              </tr>
            )}
          </thead>
          <tbody>
            {sorted.length === 0 && activeFilterCount > 0 && (
              <tr>
                <td colSpan={TF_LABELS.length + 3} className="py-6 text-center text-xs">
                  <span className="text-[#555]">No stocks match current filters</span>
                  {scanning && (
                    <span className="block mt-1 text-[#444]">Scan in progress — results may appear as data loads</span>
                  )}
                </td>
              </tr>
            )}
            {sorted.map((row) => (
              <tr key={row.ticker} className="border-b border-[#2a2a2a]/50 hover:bg-[#1a1a1a] transition-colors">
                <td className="py-1.5 pl-4 pr-2 font-medium text-white sticky left-0 bg-[#141414] z-10">
                  {row.ticker}
                </td>
                {TF_LABELS.map((tf) => {
                  const tfr = row.timeframes[tf];
                  if (!tfr) {
                    return (
                      <td key={tf} className="py-1.5 px-3 text-center">
                        <span className="text-[#333]">&mdash;</span>
                      </td>
                    );
                  }
                  const sd = scoreDisplay(tfr.scoreM2);
                  // Leading indicator badges (only when toggle is on)
                  const hasVol = showLeading && tfr.volumeRatio != null && tfr.volumeRatio > 1.5;
                  const hasConv = showLeading && tfr.converging === true;
                  const hasSqz = showLeading && tfr.squeezed === true;
                  return (
                    <td key={tf} className="py-1.5 px-1.5 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <div
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${trendColor(tfr.trendStrength)}`}
                          title={`Score: ${tfr.scoreM2}/2 | Trend: ${tfr.trendStrength ?? "n/a"} | Cross: ${tfr.bullishCross ? "yes" : "no"} | Above: ${tfr.priceAboveBoth ? "yes" : "no"} | Disp: ${tfr.displacementNearCross ? "yes" : "no"} | FVG: ${tfr.fvgNearCross ? "yes" : "no"} | Bars: ${tfr.dataPoints ?? "?"}`}
                        >
                          <span className={sd.color}>{sd.text}</span>
                          <span className="text-[9px] opacity-70">
                            {tfr.trendStrength?.[0]?.toUpperCase() ?? "?"}
                          </span>
                        </div>
                        {(hasVol || hasConv || hasSqz) && (
                          <div className="flex items-center gap-0.5 flex-wrap justify-center">
                            {hasVol && (
                              <span className="text-[8px] text-cyan-400" title={`Volume: ${tfr.volumeRatio!.toFixed(1)}x avg`}>
                                V:{tfr.volumeRatio!.toFixed(1)}x
                              </span>
                            )}
                            {hasConv && (
                              <span className="text-[8px] text-cyan-400" title={`EMAs converging${tfr.spreadDelta != null ? ` (${tfr.spreadDelta.toFixed(3)}%)` : ""}`}>
                                {"\u2197"}
                              </span>
                            )}
                            {hasSqz && (
                              <span className="text-[8px] text-cyan-400" title={`Squeezed: ATR ratio ${tfr.atrRatio?.toFixed(2)}`}>
                                {"\u25C6"}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="py-1.5 px-3 text-center">
                  <span className={`font-bold ${row.totalScore >= 8 ? "text-green-400" : row.totalScore >= 5 ? "text-amber-400" : "text-[#a0a0a0]"}`}>
                    {row.totalScore}
                  </span>
                  <span className="text-[#555]">/14</span>
                </td>
                <td className="py-1.5 px-3 pr-4 text-center">
                  {row.bestTF ? (
                    <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-purple-400 font-medium">
                      {row.bestTF}
                    </span>
                  ) : (
                    <span className="text-[#333]">&mdash;</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
