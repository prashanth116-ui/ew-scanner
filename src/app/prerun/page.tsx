"use client";

import { useState, useCallback, useEffect, useMemo, useRef, memo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
  Layers,
  Target,
  Shield,
  Activity,
} from "lucide-react";
import Link from "next/link";
import type {
  PreRunResult,
  PreRunStockData,
  PreRunFilters,
  SavedPreRunScan,
  PreRunCriteriaFilter,
  MultiTFM2Result,
  EmaTimeframe,
  VCPViewMode,
  VCPResult,
  VCPPhase,
  VCPScores,
  VCPRiskCalc,
} from "@/lib/prerun/types";
import { DEFAULT_PRERUN_FILTERS, PRERUN_PRESETS, MAX_SCORE, ALL_EMA_TIMEFRAMES, VCP_MAX_SCORE } from "@/lib/prerun/types";
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
  saveVCPScanResults,
  loadVCPScanResults,
} from "@/lib/prerun/storage";
import { exportPreRunToExcel, exportVCPToExcel } from "@/lib/prerun/export";
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
import { CopyButton } from "@/components/copy-button";
import { TickerSearchInput } from "@/components/ticker-search-input";
import { ScanButton } from "@/components/scan-button";
import { StalenessLabel } from "@/components/staleness-label";
import { HitRateDashboard } from "@/components/hit-rate-dashboard";
import { usePersistedFilter, clearPersistedFilters } from "@/lib/use-filter-persistence";
import { recordSignals, type ClientSignal } from "@/lib/signal-client";
import { loadSectorRotation } from "@/lib/sector-rotation/storage";
import { RRG_QUADRANTS } from "@/lib/sector-quadrant-map";

const BATCH_SIZE = 25;
const BATCH_DELAY = 500;

type SortKey = "score" | "pctFromAth" | "shortFloat" | "earnings";
type SortDir = "asc" | "desc";
type VCPSortKey = "score" | "compression" | "atrPct" | "relStrength" | "dollarVolume" | "distFrom52wHigh";

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
  const searchParams = useSearchParams();

  // Filters
  const [minPctFromAth, setMinPctFromAth] = usePersistedFilter("ew-filter:prerun:minPctFromAth", DEFAULT_PRERUN_FILTERS.minPctFromAth);
  const [minShortFloat, setMinShortFloat] = usePersistedFilter("ew-filter:prerun:minShortFloat", DEFAULT_PRERUN_FILTERS.minShortFloat);
  const [maxMarketCap, setMaxMarketCap] = usePersistedFilter("ew-filter:prerun:maxMarketCap", DEFAULT_PRERUN_FILTERS.maxMarketCap);
  const [minScore, setMinScore] = usePersistedFilter("ew-filter:prerun:minScore", DEFAULT_PRERUN_FILTERS.minScore);
  const [sectorBucket, setSectorBucket] = usePersistedFilter("ew-filter:prerun:sectorBucket", DEFAULT_PRERUN_FILTERS.sectorBucket);
  const [earningsWithin, setEarningsWithin] = usePersistedFilter("ew-filter:prerun:earningsWithin", DEFAULT_PRERUN_FILTERS.earningsWithin);
  const [verdictFilter, setVerdictFilter] = usePersistedFilter("ew-filter:prerun:verdictFilter", DEFAULT_PRERUN_FILTERS.verdict);
  const [emaTimeframe, setEmaTimeframe] = usePersistedFilter<EmaTimeframe>("ew-filter:prerun:emaTimeframe", DEFAULT_PRERUN_FILTERS.emaTimeframe);

  // Quadrant pre-scan filter
  const [quadrantFilter, setQuadrantFilter] = usePersistedFilter("ew-filter:prerun:quadrantFilter", "All");

  // VCP mode
  const [viewMode, setViewMode] = useState<VCPViewMode>("standard");
  const [vcpResults, setVcpResults] = useState<VCPResult[]>([]);
  const [vcpAccountSize, setVcpAccountSize] = usePersistedFilter("ew-filter:prerun:vcpAccountSize", 100_000);
  const [vcpRiskPct, setVcpRiskPct] = usePersistedFilter("ew-filter:prerun:vcpRiskPct", 0.20);
  const [vcpMinScore, setVcpMinScore] = usePersistedFilter("ew-filter:prerun:vcpMinScore", 0);
  const [vcpPhaseFilter, setVcpPhaseFilter] = usePersistedFilter("ew-filter:prerun:vcpPhaseFilter", "All");
  const [vcpSortKey, setVcpSortKey] = usePersistedFilter<VCPSortKey>("ew-filter:prerun:vcpSortKey", "score");

  // Criteria-level filters (from presets like Stage 1→2)
  const [criteriaFilters, setCriteriaFilters] = useState<PreRunCriteriaFilter[]>([]);

  // Gate 3 skip (for Pullback Buy — shows stocks below SMA20)
  const [skipGate3, setSkipGate3] = usePersistedFilter("ew-filter:prerun:skipGate3", false);

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
  const phase2Abort = useRef<AbortController | null>(null);

  // Ticker search
  const [tickerSearch, setTickerSearch] = useState("");
  const [tickerSearching, setTickerSearching] = useState(false);
  const [tickerError, setTickerError] = useState<string | null>(null);

  // AI scoring
  const [aiScoringTicker, setAiScoringTicker] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Map<string, { suggestedScore: number; reasoning: string; confidence: string }>>(new Map());

  // Sort
  const [sortKey, setSortKey] = usePersistedFilter<SortKey>("ew-filter:prerun:sortKey", "score");
  const [sortDir, setSortDir] = usePersistedFilter<SortDir>("ew-filter:prerun:sortDir", "desc");

  // Sidebar collapse
  const [sidebarOpen, setSidebarOpen] = useSidebarState("prerun");
  const { collapsed, toggleSection } = useCollapsibleSections(undefined, "prerun");

  // Saved scans
  const [savedScans, setSavedScans] = useState<SavedPreRunScan[]>([]);
  const [saveName, setSaveName] = useState("");

  // Watchlist add feedback
  const [addedTicker, setAddedTicker] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  // Timer ref for watchlist add feedback
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sector rotation quadrant map (sector name → quadrant string)
  const [sectorQuadrants, setSectorQuadrants] = useState<Record<string, string>>({});

  // Seed watchlist on mount + load cache + load sector rotation
  useEffect(() => {
    seedWatchlistIfEmpty();
    setSavedScans(loadPreRunScans());
    // Load cached sector rotation for quadrant scoring
    const rotation = loadSectorRotation();
    if (rotation?.sectors) {
      const qmap: Record<string, string> = {};
      for (const s of rotation.sectors) {
        qmap[s.sector] = s.quadrant;
      }
      setSectorQuadrants(qmap);
    }
    // Pre-populate from cache (30-min TTL)
    const cached = loadFromCache<PreRunResult[]>("ew-prerun-scan-v1", 30 * 60 * 1000);
    if (cached && cached.length > 0) {
      setRawResults(cached);
    }
    // Load VCP cache
    const vcpCached = loadFromCache<VCPResult[]>("ew-prerun-vcp-v1", 30 * 60 * 1000);
    if (vcpCached && vcpCached.length > 0) {
      setVcpResults(vcpCached);
    }
    // Load multi-TF cache
    const tfCache = loadMultiTFCache();
    if (tfCache && tfCache.results.length > 0) {
      const map = new Map<string, MultiTFM2Result>();
      for (const r of tfCache.results) map.set(r.ticker, r);
      setMultiTFResults(map);
    }
  }, []);

  // Refresh sector quadrants when tab regains focus (data may have been updated on /sectors page)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      const rotation = loadSectorRotation();
      if (rotation?.sectors) {
        const qmap: Record<string, string> = {};
        for (const s of rotation.sectors) qmap[s.sector] = s.quadrant;
        setSectorQuadrants(qmap);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      scanAbort.current?.abort();
      phase2Abort.current?.abort();
    };
  }, []);

  // Deep link: auto-lookup ticker from URL param
  useEffect(() => {
    const ticker = searchParams.get("ticker");
    if (ticker) {
      setTickerSearch(ticker.toUpperCase());
      // Delay to let state settle before lookup
      const timer = setTimeout(() => {
        lookupTicker();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (!r.gates.gate1 && !r.gate1Bypassed) return false;
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
      // Post-scan quadrant filter
      if (quadrantFilter !== "All" && Object.keys(sectorQuadrants).length > 0) {
        const sector = getSectorForTicker(r.data.ticker);
        const allowedQuadrants = quadrantFilter.split(",");
        if (!sector || !allowedQuadrants.includes(sectorQuadrants[sector])) return false;
      }
      return true;
    });
  }, [rawResults, filters, criteriaFilters, getCriterionScore, skipGate3, quadrantFilter, sectorQuadrants]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "score":
          cmp = skipGate3
            ? (a.scores.totalScore - b.scores.totalScore)
            : (a.scores.finalScore - b.scores.finalScore);
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
  }, [filtered, sortKey, sortDir, skipGate3]);

  // Stats
  const stats = useMemo(() => {
    const priority = filtered.filter((r) => r.verdict === "PRIORITY").length;
    const keep = filtered.filter((r) => r.verdict === "KEEP").length;
    const watch = filtered.filter((r) => r.verdict === "WATCH").length;
    return { total: filtered.length, priority, keep, watch };
  }, [filtered]);

  // ── VCP filter + sort ──
  const vcpFiltered = useMemo(() => {
    return vcpResults.filter((r) => {
      if (vcpMinScore > 0 && r.scores.totalScore < vcpMinScore) return false;
      if (vcpPhaseFilter !== "All" && r.phase !== vcpPhaseFilter) return false;
      if (filters.sectorBucket !== "All") {
        const sector = getSectorForTicker(r.data.ticker);
        if (sector !== filters.sectorBucket) return false;
      }
      if (filters.maxMarketCap > 0 && (r.data.marketCap ?? Infinity) > filters.maxMarketCap) return false;
      return true;
    });
  }, [vcpResults, vcpMinScore, vcpPhaseFilter, filters.sectorBucket, filters.maxMarketCap]);

  const vcpSorted = useMemo(() => {
    const arr = [...vcpFiltered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (vcpSortKey) {
        case "score":
          cmp = a.scores.totalScore - b.scores.totalScore;
          break;
        case "compression":
          cmp = a.scores.compressionScore - b.scores.compressionScore;
          break;
        case "atrPct":
          cmp = (a.data.vcpAtrPct ?? 100) - (b.data.vcpAtrPct ?? 100);
          break;
        case "relStrength":
          cmp = a.scores.relStrengthScore - b.scores.relStrengthScore;
          break;
        case "dollarVolume":
          cmp = (a.data.vcpAvgDollarVolume ?? 0) - (b.data.vcpAvgDollarVolume ?? 0);
          break;
        case "distFrom52wHigh":
          cmp = (a.data.pctFromAth ?? 100) - (b.data.pctFromAth ?? 100);
          break;
      }
      // Always desc for VCP
      return -cmp;
    });
    return arr;
  }, [vcpFiltered, vcpSortKey]);

  const vcpStats = useMemo(() => {
    const focus = vcpFiltered.filter((r) => r.phase === "FOCUS_LIST").length;
    const watchlist = vcpFiltered.filter((r) => r.phase === "WATCHLIST_CANDIDATE").length;
    const early = vcpFiltered.filter((r) => r.phase === "EARLY_SETUP").length;
    return { total: vcpFiltered.length, focus, watchlist, early };
  }, [vcpFiltered]);

  // Phase 2: Multi-TF M2 scan for candidate tickers
  const runMultiTFPhase2 = useCallback(async (candidates: PreRunResult[]) => {
    if (candidates.length === 0) return;

    phase2Abort.current?.abort();
    const p2Controller = new AbortController();
    phase2Abort.current = p2Controller;
    const p2Signal = p2Controller.signal;

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
      const PHASE2_BATCH = 25;
      for (let i = 0; i < candidateTickers.length; i += PHASE2_BATCH) {
        if (p2Signal.aborted) break;
        const batch = candidateTickers.slice(i, i + PHASE2_BATCH);
        setMultiTFProgress(
          `M2 Phase 2: ${Math.min(i + PHASE2_BATCH, candidateTickers.length)}/${candidateTickers.length} tickers...`
        );

        try {
          const res = await fetch("/api/prerun/m2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tickers: batch, timeframes }),
            signal: p2Signal,
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
          await new Promise((r) => setTimeout(r, 300));
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
    phase2Abort.current?.abort();
    const controller = new AbortController();
    scanAbort.current = controller;
    const signal = controller.signal;

    setScanning(true);
    setRawResults([]);
    setVcpResults([]);
    setScannedCount(0);
    if (showMultiTF) setMultiTFResults(new Map());

    let tickers = getTickersForSector(sectorBucket);

    // Pre-scan quadrant filter
    if (quadrantFilter !== "All" && Object.keys(sectorQuadrants).length > 0) {
      tickers = tickers.filter((t) => {
        const sector = getSectorForTicker(t);
        const allowedQuadrants = quadrantFilter.split(",");
        return sector && allowedQuadrants.includes(sectorQuadrants[sector] ?? "");
      });
    }

    setTotalCount(tickers.length);

    if (tickers.length === 0) {
      setScanning(false);
      return;
    }

    // For multi-TF presets, force Phase 1 to use 1d (free — reuses chart3mo)
    const phase1Timeframe: EmaTimeframe = showMultiTF ? "1d" : emaTimeframe;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];

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
          body: JSON.stringify({ tickers: batch, emaTimeframe: phase1Timeframe, sectorQuadrants, viewMode }),
          signal,
        });

        if (res.ok) {
          const json = await res.json();
          if (json.results) {
            results.push(...json.results);
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") break;
      }

      setScannedCount(Math.min(i + BATCH_SIZE, tickers.length));
      if (viewMode === "vcp") {
        setVcpResults([...results] as unknown as VCPResult[]);
      } else {
        setRawResults((prev) => {
          const scannedTickers = new Set(results.map(r => r.data.ticker));
          const manual = prev.filter(r => !scannedTickers.has(r.data.ticker));
          return [...results, ...manual];
        });
      }

      if (i + BATCH_SIZE < tickers.length && !signal.aborted) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    // Save results to persistent storage + localStorage cache
    if (viewMode === "vcp") {
      saveVCPScanResults(results as unknown as VCPResult[]);
      saveToCache("ew-prerun-vcp-v1", results);
    } else {
      saveScanResults(results as PreRunResult[]);
      saveToCache("ew-prerun-scan-v1", results);
    }
    setScanning(false);
    setProgress("");

    // After scan results are finalized, record signals (standard mode only)
    if (viewMode !== "vcp") {
      const signals: ClientSignal[] = (results as PreRunResult[])
        .filter((r) => r.scores.finalScore >= 4)
        .map((r) => ({
          scanner: "prerun" as const,
          ticker: r.data.ticker,
          signal_date: new Date().toISOString().slice(0, 10),
          price_at_signal: r.data.currentPrice ?? 0,
          score: r.scores.finalScore,
          signal_strength: r.verdict,
        }));
      recordSignals(signals);
    }

    // Phase 2: Multi-TF M2 scan for candidates that pass filters (standard only)
    if (viewMode !== "vcp" && showMultiTF && !signal.aborted && results.length > 0) {
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
  }, [sectorBucket, emaTimeframe, showMultiTF, criteriaFilters, minScore, runMultiTFPhase2, sectorQuadrants, quadrantFilter, viewMode]);

  const cancelScan = useCallback(() => {
    scanAbort.current?.abort();
    scanAbort.current = null;
    phase2Abort.current?.abort();
    phase2Abort.current = null;
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
      const sector = getSectorForTicker(ticker);
      const quadrant = sector ? sectorQuadrants[sector] ?? "" : "";
      const res = await fetch(`/api/prerun/stock?ticker=${encodeURIComponent(ticker)}&emaTimeframe=${emaTimeframe}${quadrant ? `&sectorQuadrant=${quadrant}` : ""}`);
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
  }, [tickerSearch, rawResults, emaTimeframe, sectorQuadrants]);

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
    savePreRunScan(name, filters, filtered, {
      quadrantFilter: quadrantFilter !== "All" ? quadrantFilter : undefined,
      skipGate3: skipGate3 || undefined,
      criteriaFilters: criteriaFilters.length > 0 ? criteriaFilters : undefined,
      multiTF: showMultiTF || undefined,
    });
    setSavedScans(loadPreRunScans());
    setSaveName("");
  }, [saveName, filters, filtered, quadrantFilter, skipGate3, criteriaFilters, showMultiTF]);

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
    setQuadrantFilter(scan.quadrantFilter ?? "All");
    setSkipGate3(scan.skipGate3 ?? false);
    setCriteriaFilters(scan.criteriaFilters ?? []);
    setShowMultiTF(scan.multiTF ?? false);
    setMultiTFResults(new Map());
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
    setQuadrantFilter(preset.quadrantFilter ?? "All");
    setViewMode(preset.viewMode ?? "standard");
    // Sync VCP min score from preset when in VCP mode
    if (preset.viewMode === "vcp") {
      setVcpMinScore(f.minScore);
    }
  }, []);

  // Add to watchlist
  const handleAddToWatchlist = useCallback((result: PreRunResult) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setAddError(null);
    const item = addToPreRunWatchlist(result);
    if (item) {
      setAddedTicker(result.data.ticker);
      feedbackTimer.current = setTimeout(() => { setAddedTicker(null); setAddError(null); }, 1500);
    } else {
      setAddError(`${result.data.ticker} already in watchlist`);
      feedbackTimer.current = setTimeout(() => { setAddedTicker(null); setAddError(null); }, 2500);
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
    if (viewMode === "vcp") {
      if (vcpSorted.length === 0) return;
      exportVCPToExcel(vcpSorted);
    } else {
      if (sorted.length === 0) return;
      exportPreRunToExcel(sorted);
    }
  }, [sorted, vcpSorted, viewMode]);

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
          title={viewMode === "vcp" ? "VCP Filters" : `Filters (${minPctFromAth}% ATH, ${minShortFloat}% SI${minScore > 0 ? `, ${minScore}+ score` : ""})`}
          sectionKey="filters"
          collapsed={collapsed.has("filters")}
          onToggle={toggleSection}
        >
          {viewMode === "vcp" ? (
            <div className="space-y-4">
              {/* Min VCP Score */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Min VCP Score</span>
                  <span className="text-white">{vcpMinScore === 0 ? "Any" : `${vcpMinScore}/${VCP_MAX_SCORE}`}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={vcpMinScore}
                  onChange={(e) => setVcpMinScore(Number(e.target.value))}
                  className="w-full accent-[#10b981]"
                />
              </div>
              {/* Phase Filter */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Phase</span>
                </div>
                <select
                  value={vcpPhaseFilter}
                  onChange={(e) => setVcpPhaseFilter(e.target.value)}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#10b981] focus:outline-none"
                >
                  <option value="All">All Phases</option>
                  <option value="FOCUS_LIST">Focus List</option>
                  <option value="WATCHLIST_CANDIDATE">Watchlist Candidate</option>
                  <option value="EARLY_SETUP">Early Setup</option>
                </select>
              </div>
              {/* Min Market Cap */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Min Market Cap</span>
                </div>
                <select
                  value={maxMarketCap}
                  onChange={(e) => setMaxMarketCap(Number(e.target.value))}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#10b981] focus:outline-none"
                >
                  {MARKET_CAP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Sector Bucket */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Sector</span>
                </div>
                <select
                  value={sectorBucket}
                  onChange={(e) => setSectorBucket(e.target.value)}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#10b981] focus:outline-none"
                >
                  <option value="All">All Sectors</option>
                  {sectorBuckets.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              {/* Account Size */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Account Size</span>
                  <span className="text-white">${vcpAccountSize.toLocaleString()}</span>
                </div>
                <input
                  type="number"
                  value={vcpAccountSize}
                  onChange={(e) => setVcpAccountSize(Number(e.target.value) || 100_000)}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#10b981] focus:outline-none"
                />
              </div>
              {/* Risk % */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Risk %</span>
                  <span className="text-white">{vcpRiskPct.toFixed(2)}%</span>
                </div>
                <input
                  type="number"
                  step={0.05}
                  min={0.05}
                  max={2}
                  value={vcpRiskPct}
                  onChange={(e) => setVcpRiskPct(Number(e.target.value) || 0.20)}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#10b981] focus:outline-none"
                />
              </div>
              {/* Reset */}
              <button
                onClick={() => {
                  setVcpMinScore(0);
                  setVcpPhaseFilter("All");
                  setMaxMarketCap(0);
                  setSectorBucket("All");
                  setVcpAccountSize(100_000);
                  setVcpRiskPct(0.20);
                }}
                className="w-full rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#666] hover:text-white hover:border-[#444] transition-colors mt-2"
              >
                Reset VCP Filters
              </button>
            </div>
          ) : (
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
              {/* RRG Quadrant */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">RRG Quadrant</span>
                </div>
                <select
                  value={quadrantFilter}
                  onChange={(e) => setQuadrantFilter(e.target.value)}
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#5ba3e6] focus:outline-none"
                >
                  <option value="All">All Quadrants</option>
                  {RRG_QUADRANTS.map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
                {Object.keys(sectorQuadrants).length === 0 && (
                  <p className="mt-1 text-[10px] text-[#555]">
                    Visit /sectors to populate rotation data.
                  </p>
                )}
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
                  clearPersistedFilters("ew-filter:prerun");
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
                  setQuadrantFilter("All");
                  setShowMultiTF(false);
                }}
                className="w-full rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#666] hover:text-white hover:border-[#444] transition-colors mt-2"
              >
                Reset Filters
              </button>
            </div>
          )}
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
        <ScanButton scanning={scanning} onScan={runScan} onCancel={cancelScan} />
        {!scanning && rawResults.length > 0 && (
          <StalenessLabel cacheKey="ew-prerun-scan-v1" ttlMs={30 * 60 * 1000} onRefresh={runScan} />
        )}

        {/* Ticker Search */}
        <SidebarSection title="Add Ticker" sectionKey="ticker" collapsed={collapsed.has("ticker")} onToggle={toggleSection}>
            <TickerSearchInput
              value={tickerSearch}
              onChange={setTickerSearch}
              onSearch={lookupTicker}
              searching={tickerSearching}
              error={tickerError}
              placeholder="e.g. AAPL, TSLA..."
            />
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

        <SidebarSection title="Hit Rates" sectionKey="hitrates" collapsed={collapsed.has("hitrates")} onToggle={toggleSection}>
          <HitRateDashboard scanner="prerun" />
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

        {/* Summary bar — VCP mode */}
        {viewMode === "vcp" && vcpResults.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Candidates</p>
              <p className="text-lg font-bold text-white">
                {vcpStats.total}
                <span className="text-xs font-normal text-[#666] ml-1">/ {vcpResults.length}</span>
              </p>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-emerald-400/60 mb-1">Focus List</p>
              <p className="text-lg font-bold text-emerald-400">{vcpStats.focus}</p>
            </div>
            <div className="rounded-lg border border-cyan-500/20 bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-cyan-400/60 mb-1">Watchlist</p>
              <p className="text-lg font-bold text-cyan-400">{vcpStats.watchlist}</p>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-amber-400/60 mb-1">Early Setup</p>
              <p className="text-lg font-bold text-amber-400">{vcpStats.early}</p>
            </div>
          </div>
        )}

        {/* Summary bar — Standard mode */}
        {viewMode !== "vcp" && rawResults.length > 0 && (
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

        {/* Sort + Export row — VCP mode */}
        {viewMode === "vcp" && vcpSorted.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#666]">Sort:</span>
              {(
                [
                  { key: "score", label: "Score" },
                  { key: "compression", label: "Compression" },
                  { key: "atrPct", label: "ATR%" },
                  { key: "relStrength", label: "RS" },
                  { key: "dollarVolume", label: "$Volume" },
                  { key: "distFrom52wHigh", label: "52w High" },
                ] as { key: VCPSortKey; label: string }[]
              ).map((s) => (
                <button
                  key={s.key}
                  onClick={() => setVcpSortKey(s.key)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
                    vcpSortKey === s.key
                      ? "bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/30"
                      : "text-[#a0a0a0] hover:text-white border border-[#2a2a2a] hover:border-[#444]"
                  }`}
                >
                  {s.label}
                  {vcpSortKey === s.key && <ArrowUpDown className="h-3 w-3" />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                className="flex items-center gap-1 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export</span>
              </button>
              <CopyButton tickers={vcpSorted.map((r) => r.data.ticker)} />
            </div>
          </div>
        )}

        {/* Sort + Export row — Standard mode */}
        {viewMode !== "vcp" && sorted.length > 0 && (
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
              <CopyButton tickers={sorted.map((r) => r.data.ticker)} />
            </div>
          </div>
        )}

        {/* Errors */}
        {addError && (
          <div className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {addError}
          </div>
        )}

        {/* VCP Results */}
        {viewMode === "vcp" && vcpSorted.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
            {vcpSorted.map((result, idx) => (
              <VCPResultCard
                key={result.data.ticker}
                result={result}
                index={idx}
                accountSize={vcpAccountSize}
                riskPct={vcpRiskPct}
                onAddToWatchlist={handleAddToWatchlist}
                justAdded={addedTicker === result.data.ticker}
              />
            ))}
          </div>
        )}

        {viewMode === "vcp" && vcpResults.length > 0 && vcpSorted.length === 0 && !scanning && (
          <div className="flex flex-col items-center justify-center py-16 text-[#666]">
            <Target className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No stocks matched VCP filters.</p>
            <p className="text-xs mt-1">Try lowering Min VCP Score or changing Phase filter.</p>
          </div>
        )}

        {viewMode === "vcp" && vcpResults.length === 0 && !scanning && (
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-12 text-center">
            <Target className="mx-auto h-12 w-12 text-[#333]" />
            <h2 className="mt-4 text-lg font-semibold text-white">VCP Breakout Scanner</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#a0a0a0]">
              Scan for institutional-quality stocks forming tight volatility contractions near breakout pivots.
              Scores 5 categories across 100 points with 6 hard gates.
            </p>
            <div className="mx-auto mt-6 grid max-w-lg grid-cols-4 gap-3">
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#10b981]">{getTickersForSector("All").length}</p>
                <p className="text-[10px] text-[#666]">Stocks</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#10b981]">5</p>
                <p className="text-[10px] text-[#666]">Score Categories</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#10b981]">6</p>
                <p className="text-[10px] text-[#666]">Hard Gates</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#10b981]">100</p>
                <p className="text-[10px] text-[#666]">Max Score</p>
              </div>
            </div>
          </div>
        )}

        {/* Multi-TF M2 Table */}
        {viewMode !== "vcp" && showMultiTF && multiTFResults.size > 0 && (
          <MultiTFTable
            results={multiTFResults}
            scanning={multiTFScanning}
            progress={multiTFProgress}
          />
        )}

        {/* Multi-TF Phase 2 progress */}
        {viewMode !== "vcp" && multiTFScanning && (
          <div className="mb-4">
            <ProgressBar
              current={0}
              total={0}
              label={multiTFProgress}
              color="bg-purple-500"
            />
          </div>
        )}

        {/* Standard Results */}
        {viewMode !== "vcp" && sorted.length > 0 ? (
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
        ) : viewMode !== "vcp" && rawResults.length > 0 && !scanning ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#666]">
            <TrendingUp className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">
              No stocks matched the current filters.
            </p>
            <p className="text-xs mt-1">
              Try lowering Min Score or Min % from ATH.
            </p>
          </div>
        ) : viewMode !== "vcp" && !scanning ? (
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
  const criteriaMaxes = [2, 3, 3, 3, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
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

      {/* Score dots (A-Q) */}
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

      {/* Leading volume indicator badges */}
      {(d.obvTrendDirection === "rising" || d.vpDivergenceBullish === true) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {d.obvTrendDirection === "rising" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400" title={`OBV slope: ${d.obvTrendSlope?.toFixed(4) ?? "?"}`}>
              OBV Rising
            </span>
          )}
          {d.vpDivergenceBullish === true && (
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-400" title="Price lower-low with decreasing down-volume">
              VP Divergence
            </span>
          )}
        </div>
      )}

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
            { label: "G1", pass: g.gate1 || !!result.gate1Bypassed, bypassed: !!result.gate1Bypassed },
            { label: "G2", pass: g.gate2, bypassed: false },
            { label: "G3", pass: g.gate3, bypassed: false },
          ] as const
        ).map((gate) => (
          <span
            key={gate.label}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              gate.bypassed
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                : gate.pass
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
            title={gate.bypassed ? "Gate 1 bypassed: LEADING sector + near earnings + positive RS" : undefined}
          >
            {gate.label}{gate.bypassed ? "*" : ""}
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

// -- VCP Result Card Component --

function vcpPhaseBadge(phase: VCPPhase): { label: string; color: string } {
  switch (phase) {
    case "FOCUS_LIST": return { label: "FOCUS LIST", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" };
    case "WATCHLIST_CANDIDATE": return { label: "WATCHLIST", color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10" };
    case "EARLY_SETUP": return { label: "EARLY SETUP", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" };
    case "IGNORE": return { label: "IGNORE", color: "text-[#666] border-[#2a2a2a] bg-[#0f0f0f]" };
  }
}

function vcpScoreBarColor(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.8) return "bg-emerald-500";
  if (pct >= 0.6) return "bg-cyan-500";
  if (pct >= 0.4) return "bg-amber-500";
  return "bg-[#333]";
}

/** Client-side VCP risk recalculation. */
function recalcVCPRisk(data: PreRunStockData, accountSize: number, riskPct: number): VCPRiskCalc {
  const pivotHigh = data.vcpPivotHigh;
  const atrPct = data.vcpAtrPct;
  const price = data.currentPrice;
  const sma10 = data.vcpSma10;

  if (pivotHigh === null || atrPct === null || price === null || price <= 0) {
    return { accountSize, riskPct, entry: null, stop: null, riskPerShare: null, shares: null, target2R: null, target3R: null, target6R: null, target10R: null, sma10Exit: sma10 };
  }

  const entry = pivotHigh + 0.10;
  const atrDollar = (atrPct / 100) * price;
  const stop = entry - 1.5 * atrDollar;
  const riskPerShare = entry - stop;

  if (riskPerShare <= 0) {
    return { accountSize, riskPct, entry, stop, riskPerShare: 0, shares: 0, target2R: null, target3R: null, target6R: null, target10R: null, sma10Exit: sma10 };
  }

  const maxByRisk = Math.floor((accountSize * (riskPct / 100)) / riskPerShare);
  const maxByPos = Math.floor((accountSize * 0.25) / entry);
  const shares = Math.min(maxByRisk, maxByPos);

  return {
    accountSize, riskPct,
    entry: Math.round(entry * 100) / 100,
    stop: Math.round(stop * 100) / 100,
    riskPerShare: Math.round(riskPerShare * 100) / 100,
    shares,
    target2R: Math.round((entry + 2 * riskPerShare) * 100) / 100,
    target3R: Math.round((entry + 3 * riskPerShare) * 100) / 100,
    target6R: Math.round((entry + 6 * riskPerShare) * 100) / 100,
    target10R: Math.round((entry + 10 * riskPerShare) * 100) / 100,
    sma10Exit: sma10,
  };
}

const VCPResultCard = memo(function VCPResultCard({
  result,
  index,
  accountSize,
  riskPct,
  onAddToWatchlist,
  justAdded,
}: {
  result: VCPResult;
  index: number;
  accountSize: number;
  riskPct: number;
  onAddToWatchlist: (result: PreRunResult) => void;
  justAdded: boolean;
}) {
  const d = result.data;
  const s = result.scores;
  const g = result.gates;
  const phase = vcpPhaseBadge(result.phase);

  // Recalculate risk with current account params
  const risk = useMemo(() => recalcVCPRisk(d, accountSize, riskPct), [d, accountSize, riskPct]);

  // Score breakdown
  const scoreBars = [
    { label: "Trend", score: s.trendScore, max: 25 },
    { label: "Volume", score: s.volumeScore, max: 20 },
    { label: "Compress", score: s.compressionScore, max: 25 },
    { label: "RS", score: s.relStrengthScore, max: 15 },
    { label: "Risk", score: s.riskQualityScore, max: 15 },
  ];

  // Gate indicators
  const gates = [
    { label: "P>$10", pass: g.priceAbove10 },
    { label: "Vol>500k", pass: g.avgVolAbove500k },
    { label: "$Vol>$20M", pass: g.dollarVolAbove20m },
    { label: "MCap>$1B", pass: g.mktCapAbove1b },
    { label: ">200SMA", pass: g.aboveSma200 },
    { label: ">50SMA", pass: g.aboveSma50 },
  ];

  // Alert conditions
  const alerts = [
    { label: "VCP Compression", active: (d.vcpRange5d !== null && d.vcpRange10d !== null && d.vcpRange5d < d.vcpRange10d) && d.atrContracting === true },
    { label: "Breakout Trigger", active: d.currentPrice !== null && d.vcpPivotHigh !== null && d.currentPrice > d.vcpPivotHigh },
    { label: "Dry Volume", active: (d.vcpDryVolumeDays ?? 0) >= 3 },
    { label: "Tight Closes", active: d.vcpTightCloses === true },
    { label: "Below 10 SMA", active: d.currentPrice !== null && d.vcpSma10 !== null && d.currentPrice < d.vcpSma10 },
  ];

  const fmtNum = (v: number | null, decimals = 1) => v !== null ? v.toFixed(decimals) : "-";
  const fmtDollar = (v: number | null) => v !== null ? `$${v.toFixed(2)}` : "-";
  const fmtVol = (v: number | null) => {
    if (v === null) return "-";
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`;
    return `$${(v / 1_000).toFixed(0)}K`;
  };

  return (
    <div
      className="ew-card-in rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 hover:border-[#3a3a3a] transition-colors flex flex-col"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">{d.ticker}</h3>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${phase.color}`}>
              {phase.label}
            </span>
          </div>
          <p className="text-xs text-[#a0a0a0] truncate mt-0.5">{d.companyName}</p>
        </div>
        {d.currentPrice !== null && (
          <p className="text-sm font-medium text-white shrink-0 ml-2">${d.currentPrice.toFixed(2)}</p>
        )}
      </div>

      {/* Total score bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[#a0a0a0]">VCP Score</span>
          <span className="font-medium text-white">{s.totalScore}/{VCP_MAX_SCORE}</span>
        </div>
        <div className="h-2 bg-[#0f0f0f] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${vcpScoreBarColor(s.totalScore, VCP_MAX_SCORE)}`}
            style={{ width: `${Math.min(100, s.totalScore)}%` }}
          />
        </div>
      </div>

      {/* Score breakdown bars */}
      <div className="space-y-1.5 mb-3">
        {scoreBars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-2">
            <span className="text-[9px] text-[#666] w-16 text-right shrink-0">{bar.label}</span>
            <div className="flex-1 h-1.5 bg-[#0f0f0f] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${vcpScoreBarColor(bar.score, bar.max)}`}
                style={{ width: `${bar.max > 0 ? (bar.score / bar.max) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[9px] text-[#a0a0a0] w-8 shrink-0">{bar.score}/{bar.max}</span>
          </div>
        ))}
      </div>

      {/* Gate indicators */}
      <div className="flex flex-wrap items-center gap-1 mb-3">
        {gates.map((gate) => (
          <span
            key={gate.label}
            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium ${
              gate.pass
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
          >
            {gate.label}
            {gate.pass ? <Check className="h-2 w-2" /> : <X className="h-2 w-2" />}
          </span>
        ))}
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 mb-3 text-[10px]">
        <div>
          <span className="text-[#555]">Avg $Vol</span>
          <p className="text-white font-medium">{fmtVol(d.vcpAvgDollarVolume)}</p>
        </div>
        <div>
          <span className="text-[#555]">Dist 50SMA</span>
          <p className="text-white font-medium">{fmtNum(d.vcpDistFromSma50Pct)}%</p>
        </div>
        <div>
          <span className="text-[#555]">Dist 200SMA</span>
          <p className="text-white font-medium">{fmtNum(d.vcpDistFromSma200Pct)}%</p>
        </div>
        <div>
          <span className="text-[#555]">From 52w High</span>
          <p className="text-white font-medium">{fmtNum(d.pctFromAth)}%</p>
        </div>
        <div>
          <span className="text-[#555]">ATR%</span>
          <p className="text-white font-medium">{fmtNum(d.vcpAtrPct)}%</p>
        </div>
        <div>
          <span className="text-[#555]">Rel Vol 10d/50d</span>
          <p className="text-white font-medium">
            {d.vcpAvgVolume10d !== null && d.vcpAvgVolume50d !== null && d.vcpAvgVolume50d > 0
              ? `${(d.vcpAvgVolume10d / d.vcpAvgVolume50d).toFixed(2)}x`
              : "-"}
          </p>
        </div>
      </div>

      {/* Compression indicators */}
      <div className="flex flex-wrap items-center gap-1 mb-3">
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${s.compressionScore >= 20 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : s.compressionScore >= 10 ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-[#0f0f0f] text-[#555] border border-[#2a2a2a]"}`}>
          Comp: {s.compressionScore}/25
        </span>
        <span className="rounded px-1.5 py-0.5 text-[9px] bg-[#0f0f0f] text-[#a0a0a0] border border-[#2a2a2a]">
          IB: {d.vcpInsideBarCount ?? 0}
        </span>
        <span className="rounded px-1.5 py-0.5 text-[9px] bg-[#0f0f0f] text-[#a0a0a0] border border-[#2a2a2a]">
          Dry: {d.vcpDryVolumeDays ?? 0}d
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[9px] border ${d.vcpTightCloses ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-[#0f0f0f] text-[#555] border-[#2a2a2a]"}`}>
          Tight: {d.vcpTightCloses ? "Y" : "N"}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[9px] border ${
          d.vcpRange5d !== null && d.vcpRange10d !== null && d.vcpRange20d !== null && d.vcpRange5d < d.vcpRange10d && d.vcpRange10d < d.vcpRange20d
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            : "bg-[#0f0f0f] text-[#555] border-[#2a2a2a]"
        }`}>
          Nest: {d.vcpRange5d !== null && d.vcpRange10d !== null && d.vcpRange20d !== null && d.vcpRange5d < d.vcpRange10d && d.vcpRange10d < d.vcpRange20d ? "Y" : "N"}
        </span>
      </div>

      {/* Risk calculator row */}
      {risk.entry !== null && (
        <div className="rounded-md border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Shield className="h-3 w-3 text-[#10b981]" />
            <span className="text-[10px] uppercase tracking-wider text-[#10b981]">Risk Calc</span>
          </div>
          <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-[10px]">
            <div><span className="text-[#555]">Entry</span><p className="text-white font-medium">{fmtDollar(risk.entry)}</p></div>
            <div><span className="text-[#555]">Stop</span><p className="text-white font-medium">{fmtDollar(risk.stop)}</p></div>
            <div><span className="text-[#555]">Risk/Sh</span><p className="text-white font-medium">{fmtDollar(risk.riskPerShare)}</p></div>
            <div><span className="text-[#555]">Shares</span><p className="text-white font-medium">{risk.shares ?? "-"}</p></div>
            <div><span className="text-[#555]">2R</span><p className="text-emerald-400">{fmtDollar(risk.target2R)}</p></div>
            <div><span className="text-[#555]">3R</span><p className="text-emerald-400">{fmtDollar(risk.target3R)}</p></div>
            <div><span className="text-[#555]">6R</span><p className="text-emerald-400">{fmtDollar(risk.target6R)}</p></div>
            <div><span className="text-[#555]">10R</span><p className="text-emerald-400">{fmtDollar(risk.target10R)}</p></div>
          </div>
          {risk.sma10Exit !== null && (
            <p className="text-[9px] text-[#555] mt-1">10 SMA Exit: ${risk.sma10Exit.toFixed(2)}</p>
          )}
        </div>
      )}

      {/* Alert condition badges */}
      <div className="flex flex-wrap items-center gap-1 mb-3">
        {alerts.map((alert) => (
          <span
            key={alert.label}
            className={`rounded px-1.5 py-0.5 text-[9px] border ${
              alert.active
                ? alert.label === "Below 10 SMA"
                  ? "bg-red-500/10 text-red-400 border-red-500/20"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-[#0f0f0f] text-[#444] border-[#1a1a1a]"
            }`}
          >
            {alert.label}
          </span>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-auto pt-1">
        <button
          onClick={() => onAddToWatchlist(result as unknown as PreRunResult)}
          disabled={justAdded}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            justAdded
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "border border-[#2a2a2a] text-[#a0a0a0] hover:text-white hover:border-[#444]"
          }`}
        >
          {justAdded ? (
            <><Check className="h-3.5 w-3.5" />Added</>
          ) : (
            <><ListPlus className="h-3.5 w-3.5" />Add to Watchlist</>
          )}
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

  // Leading indicator filters (Vol, Conv, Squeeze)
  const [volFilters, setVolFilters] = useState<Record<EmaTimeframe, VolFilterValue>>({ ...INIT_VOL_FILTERS });
  const [convFilters, setConvFilters] = useState<Record<EmaTimeframe, BoolFilterValue>>({ ...INIT_BOOL_FILTERS });
  const [squeezeFilters, setSqueezeFilters] = useState<Record<EmaTimeframe, BoolFilterValue>>({ ...INIT_BOOL_FILTERS });

  const leadingFilters = useMemo((): LeadingFilters => ({
    vol: volFilters,
    conv: convFilters,
    squeeze: squeezeFilters,
  }), [volFilters, convFilters, squeezeFilters]);

  // Show badges in cells when any leading filter is active
  const anyLeadingActive = useMemo(() =>
    TF_LABELS.some((tf) => volFilters[tf] !== "any" || convFilters[tf] !== "any" || squeezeFilters[tf] !== "any"),
    [volFilters, convFilters, squeezeFilters],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const tf of TF_LABELS) {
      if (tfFilters[tf] !== "any") count++;
      if (trendFilters[tf] !== "any") count++;
      if (volFilters[tf] !== "any") count++;
      if (convFilters[tf] !== "any") count++;
      if (squeezeFilters[tf] !== "any") count++;
    }
    return count;
  }, [tfFilters, trendFilters, volFilters, convFilters, squeezeFilters]);

  const resetAllFilters = useCallback(() => {
    setTFFilters({ ...INIT_TF_FILTERS });
    setTrendFilters({ ...INIT_TREND_FILTERS });
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
                    setVolFilters(p.leadingFilters?.vol ? { ...p.leadingFilters.vol } : { ...INIT_VOL_FILTERS });
                    setConvFilters(p.leadingFilters?.conv ? { ...p.leadingFilters.conv } : { ...INIT_BOOL_FILTERS });
                    setSqueezeFilters(p.leadingFilters?.squeeze ? { ...p.leadingFilters.squeeze } : { ...INIT_BOOL_FILTERS });
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
        {scanning && (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
            <span className="text-[10px] text-purple-400">{progress}</span>
          </div>
        )}
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
                      onChange={(e) => {
                        const val = e.target.value as TFFilterValue;
                        setTFFilters((prev) => ({ ...prev, [tf]: val }));
                        // score=2 requires bullish cross (EMA10>EMA20), conv=yes requires EMA10<EMA20 — mutually exclusive
                        if (val === "2" && convFilters[tf] === "yes") {
                          setConvFilters((prev) => ({ ...prev, [tf]: "any" as BoolFilterValue }));
                        }
                      }}
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

            {/* Leading indicator filter row (Vol + Conv + Squeeze) */}
            <tr className="border-b border-[#2a2a2a]/50 text-[#555]">
              <th className="py-1 pl-4 pr-2 text-left text-[9px] font-normal sticky left-0 bg-[#141414] z-10">Leading</th>
              {TF_LABELS.map((tf) => (
                <th key={tf} className="py-1 px-1.5 text-center whitespace-nowrap">
                  <div className="flex flex-col items-center gap-0.5">
                    <select
                      value={volFilters[tf]}
                      onChange={(e) =>
                        setVolFilters((prev) => ({ ...prev, [tf]: e.target.value as VolFilterValue }))
                      }
                      title={tf === "1d" ? "Not available \u2014 1d uses Phase 1 data" : "Volume ratio filter"}
                      disabled={tf === "1d"}
                      className={`w-[46px] text-[9px] rounded px-0.5 py-0 border bg-[#0f0f0f] outline-none ${
                        tf === "1d"
                          ? "opacity-30 cursor-not-allowed"
                          : volFilters[tf] !== "any"
                            ? "border-purple-500/50 text-purple-300 cursor-pointer"
                            : "border-[#222] text-[#555] cursor-pointer"
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
                      onChange={(e) => {
                        const val = e.target.value as BoolFilterValue;
                        setConvFilters((prev) => ({ ...prev, [tf]: val }));
                        // conv=yes requires EMA10<EMA20, score=2 requires EMA10>EMA20 — mutually exclusive
                        if (val === "yes" && tfFilters[tf] === "2") {
                          setTFFilters((prev) => ({ ...prev, [tf]: "any" as TFFilterValue }));
                        }
                      }}
                      title={tf === "1d" ? "Not available \u2014 1d uses Phase 1 data" : "EMA converging filter"}
                      disabled={tf === "1d"}
                      className={`w-[46px] text-[9px] rounded px-0.5 py-0 border bg-[#0f0f0f] outline-none ${
                        tf === "1d"
                          ? "opacity-30 cursor-not-allowed"
                          : convFilters[tf] !== "any"
                            ? "border-purple-500/50 text-purple-300 cursor-pointer"
                            : "border-[#222] text-[#555] cursor-pointer"
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
                      title={tf === "1d" ? "Not available \u2014 1d uses Phase 1 data" : "Volatility squeeze filter"}
                      disabled={tf === "1d"}
                      className={`w-[46px] text-[9px] rounded px-0.5 py-0 border bg-[#0f0f0f] outline-none ${
                        tf === "1d"
                          ? "opacity-30 cursor-not-allowed"
                          : squeezeFilters[tf] !== "any"
                            ? "border-purple-500/50 text-purple-300 cursor-pointer"
                            : "border-[#222] text-[#555] cursor-pointer"
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
                  // Leading indicator badges (only when any leading filter is active)
                  const hasVol = anyLeadingActive && tfr.volumeRatio != null && tfr.volumeRatio > 1.5;
                  const hasConv = anyLeadingActive && tfr.converging === true;
                  const hasSqz = anyLeadingActive && tfr.squeezed === true;
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
