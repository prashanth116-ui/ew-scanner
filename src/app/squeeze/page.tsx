"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import {
  Search,
  Loader2,
  ChevronDown,
  X,
  Save,
  Trash2,
  ArrowUpDown,
  Zap,
  TrendingUp,
  AlertTriangle,
  BookOpen,
  ListPlus,
  Check,
  FileDown,
  Copy,
} from "lucide-react";
import Link from "next/link";
import { SQUEEZE_UNIVERSE } from "@/data/squeeze-universe";
import {
  scoreSqueezeBatch,
  computeSqueezeScore,
  DEFAULT_SQUEEZE_FILTERS,
  isSqueezeAlignedWavePosition,
  normalizeSiPercent,
} from "@/lib/squeeze-scoring";
import {
  saveSqueezeScan,
  loadSqueezeScans,
  deleteSqueezeScan,
} from "@/lib/squeeze-storage";
import {
  loadSqueezeWatchlists,
  addToSqueezeWatchlist,
} from "@/lib/squeeze-watchlists";
import { exportSqueezeToExcel } from "@/lib/squeeze-export";
import type {
  SqueezeData,
  ScoredSqueezeCandidate,
  SqueezeFilters,
  SavedSqueezeScan,
  SqueezeWatchlist,
} from "@/lib/ew-types";
import { scoreBatchEnhanced, type EnrichedQuoteInput } from "@/lib/ew-scoring";
import { useDebounce } from "@/lib/use-debounce";
import { useCollapsibleSections } from "@/lib/use-collapsible-sections";
import { formatM, formatNum, formatDate } from "@/lib/format-utils";
import { tierColor } from "@/lib/color-utils";
import { ScannerCTA } from "@/components/scanner-cta";
import { ScoreBar } from "@/components/score-bar";
import { SidebarShell } from "@/components/sidebar-shell";
import { SidebarSection } from "@/components/sidebar-section";
import { PresetList } from "@/components/preset-list";

const BATCH_SIZE = 10;
const BATCH_DELAY = 300;

interface SqueezePreset {
  name: string;
  shortName: string;
  description: string;
  filters: Partial<SqueezeFilters>;
  recommended?: boolean;
}

const PRESETS: SqueezePreset[] = [
  {
    name: "GME-Style Setup",
    shortName: "GME-Style",
    description: "Mirrors pre-squeeze GME: high SI, small float, near lows. Best signal quality.",
    filters: { minSiPercent: 20, minDaysToCover: 3, maxFloat: 150, maxMarketCap: 5, maxNearLowPct: 30, minScore: 40 },
    recommended: true,
  },
  {
    name: "Volume Ignition",
    shortName: "Vol Ignition",
    description: "Unusual volume spike + moderate SI. Catches squeezes in early ignition phase.",
    filters: { minSiPercent: 10, minDaysToCover: 2, minVolumeRatio: 2, minScore: 30 },
  },
  {
    name: "Micro Float Bomb",
    shortName: "Micro Float",
    description: "Tiny floats under 20M. Maximum squeeze potential, highest volatility.",
    filters: { minSiPercent: 15, minDaysToCover: 2, maxFloat: 20, minScore: 30 },
  },
  {
    name: "Near 52w Low",
    shortName: "Near Lows",
    description: "Heavily shorted stocks near 52-week lows. Complacent shorts, max pain potential.",
    filters: { minSiPercent: 10, maxNearLowPct: 20, maxMarketCap: 10, minScore: 25 },
  },
  {
    name: "Wide Net",
    shortName: "Wide Net",
    description: "Relaxed filters to catch more candidates. Good for initial screening.",
    filters: { minSiPercent: 5, minDaysToCover: 1 },
  },
];

type SortKey =
  | "score"
  | "siPercent"
  | "dtc"
  | "float"
  | "volumeRatio"
  | "price"
  | "nearLow"
  | "ticker";
type SortDir = "asc" | "desc";

function formatPct(val: number | null): string {
  if (val == null) return "-";
  return `${normalizeSiPercent(val).toFixed(1)}%`;
}

export default function SqueezePageWrapper() {
  return (
    <>
      <Suspense fallback={null}>
        <SqueezePage />
      </Suspense>
      <ScannerCTA />
    </>
  );
}

const ALL_TICKERS = SQUEEZE_UNIVERSE;

function SqueezePage() {
  // Filters
  const [minSiPercent, setMinSiPercent] = useState(DEFAULT_SQUEEZE_FILTERS.minSiPercent);
  const [minDtc, setMinDtc] = useState(DEFAULT_SQUEEZE_FILTERS.minDaysToCover);
  const [maxFloat, setMaxFloat] = useState(DEFAULT_SQUEEZE_FILTERS.maxFloat);
  const [minVolRatio, setMinVolRatio] = useState(DEFAULT_SQUEEZE_FILTERS.minVolumeRatio);
  const [maxMktCap, setMaxMktCap] = useState(DEFAULT_SQUEEZE_FILTERS.maxMarketCap);
  const [maxNearLow, setMaxNearLow] = useState(DEFAULT_SQUEEZE_FILTERS.maxNearLowPct);
  const [minScore, setMinScore] = useState(DEFAULT_SQUEEZE_FILTERS.minScore);
  const [requireEw, setRequireEw] = useState(DEFAULT_SQUEEZE_FILTERS.requireEwAlignment);

  const debouncedSi = useDebounce(minSiPercent, 300);
  const debouncedDtc = useDebounce(minDtc, 300);
  const debouncedFloat = useDebounce(maxFloat, 300);
  const debouncedVol = useDebounce(minVolRatio, 300);
  const debouncedMktCap = useDebounce(maxMktCap, 300);
  const debouncedNearLow = useDebounce(maxNearLow, 300);
  const debouncedScore = useDebounce(minScore, 300);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [scannedCount, setScannedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [rawResults, setRawResults] = useState<SqueezeData[]>([]);
  const scanAbort = useRef<AbortController | null>(null);

  // Ticker search
  const [tickerSearch, setTickerSearch] = useState("");
  const [tickerSearching, setTickerSearching] = useState(false);
  const [tickerError, setTickerError] = useState<string | null>(null);
  const [searchedTickers, setSearchedTickers] = useState<Set<string>>(new Set());

  // EW enrichment
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState("");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Expand
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Sidebar collapse (full + sections)
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { collapsed, toggleSection } = useCollapsibleSections();

  // Saved scans
  const [savedScans, setSavedScans] = useState<SavedSqueezeScan[]>([]);
  const [saveName, setSaveName] = useState("");

  // Watchlists (for add-to-watchlist)
  const [squeezeWatchlists, setSqueezeWatchlists] = useState<SqueezeWatchlist[]>([]);
  const [addedTicker, setAddedTicker] = useState<string | null>(null);

  // Export / copy watchlist
  const [copiedToast, setCopiedToast] = useState(false);

  // Load saved scans and watchlists on mount
  useEffect(() => {
    setSavedScans(loadSqueezeScans());
    setSqueezeWatchlists(loadSqueezeWatchlists());
  }, []);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      scanAbort.current?.abort();
    };
  }, []);

  // Build filters object
  const filters: SqueezeFilters = useMemo(
    () => ({
      minSiPercent: debouncedSi,
      minDaysToCover: debouncedDtc,
      maxFloat: debouncedFloat,
      minVolumeRatio: debouncedVol,
      maxMarketCap: debouncedMktCap,
      maxNearLowPct: debouncedNearLow,
      minScore: debouncedScore,
      requireEwAlignment: requireEw,
    }),
    [debouncedSi, debouncedDtc, debouncedFloat, debouncedVol, debouncedMktCap, debouncedNearLow, debouncedScore, requireEw]
  );

  // Score + filter + sort (exempt manually-searched tickers from filters)
  const scored = useMemo(() => {
    const filtered = scoreSqueezeBatch(rawResults, filters);
    if (searchedTickers.size === 0) return filtered;
    // Score searched tickers that got filtered out
    const filteredSet = new Set(filtered.map((c) => c.ticker));
    const missing = rawResults
      .filter((r) => searchedTickers.has(r.ticker) && !filteredSet.has(r.ticker))
      .map(computeSqueezeScore);
    return [...missing, ...filtered];
  }, [rawResults, filters, searchedTickers]);

  const sorted = useMemo(() => {
    const arr = [...scored];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "score":
          cmp = a.squeezeScore - b.squeezeScore;
          break;
        case "siPercent": {
          const as = a.shortPercentOfFloat ?? 0;
          const bs = b.shortPercentOfFloat ?? 0;
          cmp = as - bs;
          break;
        }
        case "dtc":
          cmp = (a.shortRatio ?? 0) - (b.shortRatio ?? 0);
          break;
        case "float":
          cmp = (a.floatShares ?? 0) - (b.floatShares ?? 0);
          break;
        case "volumeRatio":
          cmp = (a.volumeRatio ?? 0) - (b.volumeRatio ?? 0);
          break;
        case "price":
          cmp = (a.currentPrice ?? 0) - (b.currentPrice ?? 0);
          break;
        case "nearLow":
          cmp = (a.nearLowPct ?? 999) - (b.nearLowPct ?? 999);
          break;
        case "ticker":
          cmp = a.ticker.localeCompare(b.ticker);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [scored, sortKey, sortDir]);

  // Stats
  const stats = useMemo(() => {
    if (scored.length === 0) return { avgSi: 0, avgDtc: 0, highCount: 0, finraDate: null as number | null };
    const siVals = scored
      .map((c) => c.shortPercentOfFloat)
      .filter((v): v is number => v != null)
      .map((v) => normalizeSiPercent(v));
    const dtcVals = scored
      .map((c) => c.shortRatio)
      .filter((v): v is number => v != null);
    const dates = scored
      .map((c) => c.dateShortInterest)
      .filter((v): v is number => v != null);
    const finraDate = dates.length > 0 ? Math.max(...dates) : null;
    return {
      avgSi: siVals.length > 0 ? siVals.reduce((s, v) => s + v, 0) / siVals.length : 0,
      avgDtc: dtcVals.length > 0 ? dtcVals.reduce((s, v) => s + v, 0) / dtcVals.length : 0,
      highCount: scored.filter((c) => c.tier === "high").length,
      finraDate,
    };
  }, [scored]);

  // ── Scan ──
  const runScan = useCallback(async () => {
    scanAbort.current?.abort();
    const controller = new AbortController();
    scanAbort.current = controller;
    const signal = controller.signal;

    setScanning(true);
    setRawResults([]);
    setScannedCount(0);
    setExpandedTicker(null);

    const tickers = ALL_TICKERS;
    setTotalCount(tickers.length);
    const results: SqueezeData[] = [];

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      if (signal.aborted) break;
      const batch = tickers.slice(i, i + BATCH_SIZE);
      setProgress(
        `Fetching ${Math.min(i + BATCH_SIZE, tickers.length)}/${tickers.length}...`
      );

      const settled = await Promise.allSettled(
        batch.map(async (t) => {
          const res = await fetch(
            `/api/squeeze?ticker=${encodeURIComponent(t.symbol)}`,
            { signal }
          );
          if (!res.ok) return null;
          const data = await res.json();
          if (data.error) return null;
          return data as SqueezeData;
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          results.push(r.value);
        }
      }

      setScannedCount(Math.min(i + BATCH_SIZE, tickers.length));
      setRawResults([...results]);

      if (i + BATCH_SIZE < tickers.length && !signal.aborted) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    setScanning(false);
    setProgress("");
  }, []);

  const cancelScan = useCallback(() => {
    scanAbort.current?.abort();
    scanAbort.current = null;
    setScanning(false);
    setProgress("");
  }, []);

  // ── Ticker Search ──
  const lookupTicker = useCallback(async () => {
    const ticker = tickerSearch.trim().toUpperCase();
    if (!ticker) return;

    // Skip if already in results
    if (rawResults.some((r) => r.ticker === ticker)) {
      setExpandedTicker(ticker);
      setTickerSearch("");
      return;
    }

    setTickerSearching(true);
    setTickerError(null);

    try {
      const res = await fetch(`/api/squeeze?ticker=${encodeURIComponent(ticker)}`);
      if (!res.ok) {
        setTickerError(`Could not find "${ticker}"`);
        setTickerSearching(false);
        return;
      }
      const data = await res.json();
      if (data.error) {
        setTickerError(data.error);
        setTickerSearching(false);
        return;
      }
      setRawResults((prev) => [data as SqueezeData, ...prev]);
      setSearchedTickers((prev) => new Set(prev).add(ticker));
      setExpandedTicker(ticker);
      setTickerSearch("");
    } catch {
      setTickerError("Network error");
    }
    setTickerSearching(false);
  }, [tickerSearch, rawResults]);

  // ── Enrich with EW ──
  const enrichWithEW = useCallback(async () => {
    const top = sorted.slice(0, 20);
    if (top.length === 0) return;

    setEnriching(true);
    setEnrichProgress(`Enriching 0/${top.length}...`);

    const enriched: Map<string, { position: string; confidence: string }> = new Map();
    let done = 0;

    for (let i = 0; i < top.length; i += BATCH_SIZE) {
      const batch = top.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (c) => {
          const res = await fetch(
            `/api/quote?ticker=${encodeURIComponent(c.ticker)}&detail=1`
          );
          if (!res.ok) return null;
          const data = await res.json();
          if (data.error || !data.ath) return null;

          const quote: EnrichedQuoteInput = {
            ticker: c.ticker,
            name: c.name,
            ath: data.ath,
            low: data.low,
            current: data.current,
            athYear: data.athYear,
            lowYear: data.lowYear,
            series: data.series,
            athIdx: data.athIdx,
            lowIdx: data.lowIdx,
            trueAth: data.trueAth,
            trueAthYear: data.trueAthYear,
            preAthLow: data.preAthLow,
            preAthLowYear: data.preAthLowYear,
          };

          const scored = scoreBatchEnhanced([quote], {
            minDecline: 0,
            minDuration: 0,
            minRecovery: 0,
          });

          if (scored.length > 0 && scored[0].waveCount) {
            return {
              ticker: c.ticker,
              position: scored[0].waveCount.position,
              confidence:
                scored[0].waveCount.score >= 70
                  ? "high"
                  : scored[0].waveCount.score >= 40
                    ? "medium"
                    : "low",
            };
          }
          return null;
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          enriched.set(r.value.ticker, {
            position: r.value.position,
            confidence: r.value.confidence,
          });
        }
      }

      done += batch.length;
      setEnrichProgress(`Enriching ${done}/${top.length}...`);

      if (i + BATCH_SIZE < top.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    // Merge EW data back into raw results
    setRawResults((prev) =>
      prev.map((r) => {
        const ew = enriched.get(r.ticker);
        if (!ew) return r;
        return { ...r, ewPosition: ew.position, ewConfidence: ew.confidence };
      })
    );

    setEnriching(false);
    setEnrichProgress("");
  }, [sorted]);

  // ── Save / Load / Delete ──
  const handleSave = useCallback(() => {
    const name = saveName.trim() || `Squeeze ${new Date().toLocaleDateString()}`;
    saveSqueezeScan(name, "All", filters, scored);
    setSavedScans(loadSqueezeScans());
    setSaveName("");
  }, [saveName, filters, scored]);

  const handleDelete = useCallback((id: string) => {
    if (!confirm("Delete this saved scan?")) return;
    deleteSqueezeScan(id);
    setSavedScans(loadSqueezeScans());
  }, []);

  const handleLoadScan = useCallback((scan: SavedSqueezeScan) => {
    setMinSiPercent(scan.filters.minSiPercent);
    setMinDtc(scan.filters.minDaysToCover);
    setMaxFloat(scan.filters.maxFloat);
    setMinVolRatio(scan.filters.minVolumeRatio);
    setMaxMktCap(scan.filters.maxMarketCap ?? 0);
    setMaxNearLow(scan.filters.maxNearLowPct ?? 0);
    setMinScore(scan.filters.minScore ?? 0);
    setRequireEw(scan.filters.requireEwAlignment);
    setRawResults(scan.candidates);
  }, []);

  // ── Apply Preset ──
  const applyPreset = useCallback((preset: SqueezePreset) => {
    const f = { ...DEFAULT_SQUEEZE_FILTERS, ...preset.filters };
    setMinSiPercent(f.minSiPercent);
    setMinDtc(f.minDaysToCover);
    setMaxFloat(f.maxFloat);
    setMinVolRatio(f.minVolumeRatio);
    setMaxMktCap(f.maxMarketCap);
    setMaxNearLow(f.maxNearLowPct);
    setMinScore(f.minScore);
    setRequireEw(f.requireEwAlignment);
  }, []);

  // ── Add to Watchlist ──
  const [addError, setAddError] = useState<string | null>(null);
  const handleAddToWatchlist = useCallback(
    (wlId: string, candidate: ScoredSqueezeCandidate) => {
      setAddError(null);
      const lists = loadSqueezeWatchlists();
      const wl = lists.find((w) => w.id === wlId);
      if (wl?.items.some((i) => i.ticker === candidate.ticker)) {
        setAddError(`${candidate.ticker} already in "${wl.name}"`);
        setTimeout(() => setAddError(null), 2500);
        return;
      }
      const ok = addToSqueezeWatchlist(wlId, candidate);
      if (ok) {
        setAddedTicker(candidate.ticker);
        setSqueezeWatchlists(loadSqueezeWatchlists());
        setTimeout(() => setAddedTicker(null), 1500);
      } else {
        setAddError("Watchlist full (max 100 items)");
        setTimeout(() => setAddError(null), 2500);
      }
    },
    []
  );

  // ── Sort toggle ──
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

  const handleExport = useCallback(() => {
    if (sorted.length > 0) exportSqueezeToExcel(sorted);
  }, [sorted]);

  const copyWatchlist = useCallback(() => {
    const symbols = sorted.map((r) => r.ticker).join(", ");
    navigator.clipboard.writeText(symbols).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    });
  }, [sorted]);

  const SortHeader = ({
    label,
    sortKeyVal,
    className,
  }: {
    label: string;
    sortKeyVal: SortKey;
    className?: string;
  }) => (
    <th
      onClick={() => toggleSort(sortKeyVal)}
      className={`px-3 py-2 text-left text-xs font-medium text-[#a0a0a0] cursor-pointer hover:text-white select-none ${className ?? ""}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortKeyVal && (
          <ArrowUpDown className="h-3 w-3 text-[#5ba3e6]" />
        )}
      </span>
    </th>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 px-4 sm:px-6 py-6 max-w-[1600px] mx-auto">
      <SidebarShell open={sidebarOpen} onToggle={setSidebarOpen}>
        {/* Quick Presets */}
        <SidebarSection title="Quick Presets" sectionKey="presets" collapsed={collapsed.has("presets")} onToggle={toggleSection}>
          <PresetList presets={PRESETS} onSelect={applyPreset} />
        </SidebarSection>

        {/* Filters */}
        <SidebarSection
          title={`Filters (${minSiPercent}% SI, ${minDtc} DTC${minScore > 0 ? `, ${minScore}+ score` : ""})`}
          sectionKey="filters"
          collapsed={collapsed.has("filters")}
          onToggle={toggleSection}
        >
            <div className="space-y-4">
              {/* Min SI% */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Min SI %</span>
                  <span className="text-white">{minSiPercent}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={minSiPercent}
                  onChange={(e) => setMinSiPercent(Number(e.target.value))}
                  className="w-full accent-[#5ba3e6]"
                />
              </div>
              {/* Min DTC */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Min Days to Cover</span>
                  <span className="text-white">{minDtc}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={0.5}
                  value={minDtc}
                  onChange={(e) => setMinDtc(Number(e.target.value))}
                  className="w-full accent-[#5ba3e6]"
                />
              </div>
              {/* Max Float */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Max Float (M)</span>
                  <span className="text-white">
                    {maxFloat === 0 ? "Any" : `${maxFloat}M`}
                  </span>
                </div>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={maxFloat}
                  onChange={(e) => setMaxFloat(Number(e.target.value))}
                  placeholder="0 = no limit"
                  className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#5ba3e6] focus:outline-none"
                />
              </div>
              {/* Min Volume Ratio */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Min Volume Ratio</span>
                  <span className="text-white">{minVolRatio.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={minVolRatio}
                  onChange={(e) => setMinVolRatio(Number(e.target.value))}
                  className="w-full accent-[#5ba3e6]"
                />
              </div>
              {/* Max Market Cap */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Max Market Cap (B)</span>
                  <span className="text-white">
                    {maxMktCap === 0 ? "Any" : `$${maxMktCap}B`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={maxMktCap}
                  onChange={(e) => setMaxMktCap(Number(e.target.value))}
                  className="w-full accent-[#5ba3e6]"
                />
              </div>
              {/* Max Near 52w Low */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Max Near 52w Low %</span>
                  <span className="text-white">
                    {maxNearLow === 0 ? "Any" : `${maxNearLow}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={maxNearLow}
                  onChange={(e) => setMaxNearLow(Number(e.target.value))}
                  className="w-full accent-[#5ba3e6]"
                />
              </div>
              {/* Min Score */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">Min Score</span>
                  <span className="text-white">
                    {minScore === 0 ? "Any" : minScore}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={80}
                  step={5}
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-full accent-[#5ba3e6]"
                />
              </div>
              {/* EW Alignment */}
              <label className="flex items-center gap-2 text-sm text-[#a0a0a0] cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireEw}
                  onChange={(e) => setRequireEw(e.target.checked)}
                  className="rounded border-[#2a2a2a] bg-[#1a1a1a] accent-[#5ba3e6]"
                />
                Require EW Alignment
              </label>
              <button
                onClick={() => {
                  setMinSiPercent(DEFAULT_SQUEEZE_FILTERS.minSiPercent);
                  setMinDtc(DEFAULT_SQUEEZE_FILTERS.minDaysToCover);
                  setMaxFloat(DEFAULT_SQUEEZE_FILTERS.maxFloat);
                  setMinVolRatio(DEFAULT_SQUEEZE_FILTERS.minVolumeRatio);
                  setMaxMktCap(DEFAULT_SQUEEZE_FILTERS.maxMarketCap);
                  setMaxNearLow(DEFAULT_SQUEEZE_FILTERS.maxNearLowPct);
                  setMinScore(DEFAULT_SQUEEZE_FILTERS.minScore);
                  setRequireEw(DEFAULT_SQUEEZE_FILTERS.requireEwAlignment);
                }}
                className="w-full rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#666] hover:text-white hover:border-[#444] transition-colors mt-2"
              >
                Reset Filters
              </button>
            </div>
        </SidebarSection>

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

        {/* Saved Scans */}
        <SidebarSection
          title={`Saved Scans (${savedScans.length})`}
          sectionKey="saved"
          collapsed={collapsed.has("saved")}
          onToggle={toggleSection}
        >
            <div className="space-y-2">
              {/* Save current */}
              {scored.length > 0 && (
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

      {/* ── Main Content ── */}
      <main className="flex-1 min-w-0">
        {/* Ticker Search */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555]" />
            <input
              value={tickerSearch}
              onChange={(e) => setTickerSearch(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && lookupTicker()}
              placeholder="Search any ticker (e.g. GME, CVNA, AMC)..."
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2.5 pl-10 pr-3 text-sm text-white placeholder-[#555] transition-colors focus:border-[#5ba3e6] focus:outline-none"
            />
          </div>
          <button
            onClick={lookupTicker}
            disabled={tickerSearching || !tickerSearch.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-[#5ba3e6] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4a8fd4] disabled:opacity-50"
          >
            {tickerSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Lookup
          </button>
          <Link
            href="/squeeze/watchlist"
            className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] px-3 py-2.5 text-sm text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors shrink-0"
          >
            <ListPlus className="h-4 w-4" />
            <span className="hidden md:inline">Watchlist</span>
          </Link>
          <Link
            href="/squeeze/guide"
            className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] px-3 py-2.5 text-sm text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors shrink-0"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden md:inline">Guide</span>
          </Link>
        </div>

        {/* Ticker search error */}
        {tickerError && (
          <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 mb-4">
            <p className="text-sm text-red-400">{tickerError}</p>
            <button
              onClick={() => setTickerError(null)}
              className="shrink-0 rounded p-1 text-red-400/50 hover:text-red-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

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

        {/* FINRA date notice */}
        {rawResults.length > 0 && stats.finraDate && (
          <div className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-2 mb-4 text-xs text-yellow-400/80">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              Short interest data as of <strong className="text-yellow-400">{formatDate(stats.finraDate)}</strong> (FINRA reporting date). Updated twice monthly.
            </span>
          </div>
        )}

        {/* Stats row */}
        {rawResults.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">
                Passed Filter
              </p>
              <p className="text-lg font-bold text-white">
                {scored.length}
                <span className="text-xs font-normal text-[#666] ml-1">
                  / {rawResults.length}
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">
                Avg SI%
              </p>
              <p className="text-lg font-bold text-white">
                {stats.avgSi.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">
                Avg DTC
              </p>
              <p className="text-lg font-bold text-white">
                {stats.avgDtc.toFixed(1)}
              </p>
            </div>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">
                High Squeeze
              </p>
              <p className="text-lg font-bold text-red-400">
                {stats.highCount}
              </p>
            </div>
          </div>
        )}

        {/* Action bar: Enrich + Export + Copy */}
        {scored.length > 0 && !enriching && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <button
              onClick={enrichWithEW}
              className="inline-flex items-center gap-2 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs font-medium text-[#a0a0a0] hover:text-[#5ba3e6] hover:border-[#5ba3e6]/30 transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Enrich Top 20 with EW Wave Position
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[#a0a0a0] hover:text-white border border-[#2a2a2a] hover:border-[#444] transition-colors"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export</span>
              </button>
              <button
                onClick={copyWatchlist}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[#a0a0a0] hover:text-white border border-[#2a2a2a] hover:border-[#444] transition-colors"
                title="Copy all visible tickers to clipboard"
              >
                {copiedToast ? (
                  <>
                    <Check className="h-3 w-3 text-green-400" />
                    <span className="text-green-400">Copied {sorted.length}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span className="hidden sm:inline">Copy Watchlist</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
        {enriching && (
          <div className="mb-4 flex items-center gap-2 text-xs text-[#a0a0a0]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {enrichProgress}
          </div>
        )}

        {addError && (
          <div className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {addError}
          </div>
        )}

        {/* Results table */}
        {sorted.length > 0 ? (
          <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2a2a2a]">
                    <SortHeader label="Ticker" sortKeyVal="ticker" />
                    <th className="px-3 py-2 text-left text-xs font-medium text-[#a0a0a0]">
                      Name
                    </th>
                    <SortHeader label="SI%" sortKeyVal="siPercent" />
                    <SortHeader label="DTC" sortKeyVal="dtc" />
                    <SortHeader label="Float" sortKeyVal="float" />
                    <SortHeader label="Vol Ratio" sortKeyVal="volumeRatio" />
                    <SortHeader label="Price" sortKeyVal="price" />
                    <SortHeader label="Near Low" sortKeyVal="nearLow" />
                    <SortHeader label="Score" sortKeyVal="score" />
                    <th className="px-3 py-2 text-left text-xs font-medium text-[#a0a0a0]">
                      EW
                    </th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => (
                    <TableRow
                      key={c.ticker}
                      candidate={c}
                      expanded={expandedTicker === c.ticker}
                      onToggle={() =>
                        setExpandedTicker(
                          expandedTicker === c.ticker ? null : c.ticker
                        )
                      }
                      watchlists={squeezeWatchlists}
                      onAddToWatchlist={handleAddToWatchlist}
                      justAdded={addedTicker === c.ticker}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : rawResults.length > 0 && !scanning ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#666]">
            <TrendingUp className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">
              No stocks matched the current filters.
            </p>
            <p className="text-xs mt-1">
              Try lowering Min SI% or raising Max Float.
            </p>
          </div>
        ) : !scanning ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#666]">
            <Zap className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">Short Squeeze Screener</p>
            <p className="text-xs mt-1 max-w-md text-center">
              Click Scan to screen {ALL_TICKERS.length} stocks for short squeeze
              candidates. Combines SI%, days to cover, float size, volume
              surge, and optional EW wave alignment.
            </p>
            <Link
              href="/squeeze/guide"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs font-medium text-[#a0a0a0] transition-colors hover:text-[#5ba3e6] hover:border-[#5ba3e6]/30"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Squeeze Guide &mdash; Case studies &amp; patterns
            </Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}

// ── Table Row Component ──

function TableRow({
  candidate: c,
  expanded,
  onToggle,
  watchlists,
  onAddToWatchlist,
  justAdded,
}: {
  candidate: ScoredSqueezeCandidate;
  expanded: boolean;
  onToggle: () => void;
  watchlists: SqueezeWatchlist[];
  onAddToWatchlist: (wlId: string, candidate: ScoredSqueezeCandidate) => void;
  justAdded: boolean;
}) {
  const ewAligned = isSqueezeAlignedWavePosition(c.ewPosition);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]/60 cursor-pointer transition-colors"
      >
        <td className="px-3 py-2.5 text-sm font-medium text-[#5ba3e6]">
          {c.ticker}
        </td>
        <td className="px-3 py-2.5 text-sm text-[#ccc] max-w-[160px] truncate">
          {c.name}
        </td>
        <td className="px-3 py-2.5 text-sm text-white font-medium">
          {formatPct(c.shortPercentOfFloat)}
        </td>
        <td className="px-3 py-2.5 text-sm text-white">
          {formatNum(c.shortRatio, 1)}
        </td>
        <td className="px-3 py-2.5 text-sm text-[#ccc]">
          {formatM(c.floatShares)}
        </td>
        <td className="px-3 py-2.5 text-sm text-white">
          {c.volumeRatio != null ? `${c.volumeRatio.toFixed(1)}x` : "-"}
        </td>
        <td className="px-3 py-2.5 text-sm text-[#ccc]">
          {c.currentPrice != null ? `$${c.currentPrice.toFixed(2)}` : "-"}
        </td>
        <td className="px-3 py-2.5 text-sm text-[#ccc]">
          {c.nearLowPct != null ? `${c.nearLowPct.toFixed(1)}%` : "-"}
        </td>
        <td className="px-3 py-2.5">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tierColor(c.tier)}`}
          >
            {c.squeezeScore}
          </span>
        </td>
        <td className="px-3 py-2.5 text-xs">
          {c.ewPosition ? (
            <span
              className={`${ewAligned ? "text-green-400" : "text-[#666]"}`}
            >
              {c.ewPosition}
            </span>
          ) : (
            <span className="text-[#333]">-</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            {justAdded ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPicker(!showPicker);
                }}
                className="rounded p-0.5 text-[#555] hover:text-[#5ba3e6] transition-colors"
                title="Add to watchlist"
              >
                <ListPlus className="h-4 w-4" />
              </button>
            )}
            {showPicker && watchlists.length > 0 && (
              <div className="absolute right-0 top-6 z-20 w-48 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] py-1 shadow-xl">
                {watchlists.map((wl) => (
                  <button
                    key={wl.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToWatchlist(wl.id, c);
                      setShowPicker(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#a0a0a0] hover:bg-[#262626] hover:text-white"
                  >
                    <ListPlus className="h-3 w-3 shrink-0" />
                    <span className="truncate">{wl.name}</span>
                    <span className="ml-auto text-[#555]">{wl.items.length}</span>
                  </button>
                ))}
              </div>
            )}
            {showPicker && watchlists.length === 0 && (
              <div className="absolute right-0 top-6 z-20 w-52 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 shadow-xl">
                <p className="text-xs text-[#666]">
                  No watchlists yet. Create one on the{" "}
                  <a href="/squeeze/watchlist" className="text-[#5ba3e6] hover:underline">
                    Watchlist page
                  </a>.
                </p>
              </div>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={11} className="bg-[#0f0f0f] px-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Score breakdown */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-[#a0a0a0] uppercase tracking-wider mb-3">
                  Score Breakdown
                </h4>
                <ScoreBar
                  label="SI %"
                  value={c.components.siPercent}
                  max={25}
                  color="bg-red-500"
                />
                <ScoreBar
                  label="Days Cover"
                  value={c.components.daysTocover}
                  max={15}
                  color="bg-orange-500"
                />
                <ScoreBar
                  label="Float Size"
                  value={c.components.floatSize}
                  max={15}
                  color="bg-yellow-500"
                />
                <ScoreBar
                  label="Vol Surge"
                  value={c.components.volumeSurge}
                  max={15}
                  color="bg-blue-500"
                />
                <ScoreBar
                  label="Near Low"
                  value={c.components.near52wLow}
                  max={15}
                  color="bg-purple-500"
                />
                <ScoreBar
                  label="EW Align"
                  value={c.components.ewAlignment}
                  max={15}
                  color="bg-green-500"
                />
              </div>
              {/* Details */}
              <div className="space-y-2 text-xs">
                <h4 className="font-semibold text-[#a0a0a0] uppercase tracking-wider mb-3">
                  Details
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <span className="text-[#666]">Shares Short</span>
                  <span className="text-white">{formatM(c.sharesShort)}</span>
                  <span className="text-[#666]">Float</span>
                  <span className="text-white">{formatM(c.floatShares)}</span>
                  <span className="text-[#666]">Shares Out</span>
                  <span className="text-white">
                    {formatM(c.sharesOutstanding)}
                  </span>
                  <span className="text-[#666]">Market Cap</span>
                  <span className="text-white">{formatM(c.marketCap)}</span>
                  <span className="text-[#666]">52w Low</span>
                  <span className="text-white">
                    {c.fiftyTwoWeekLow != null ? `$${c.fiftyTwoWeekLow.toFixed(2)}` : "-"}
                  </span>
                  <span className="text-[#666]">52w High</span>
                  <span className="text-white">
                    {c.fiftyTwoWeekHigh != null ? `$${c.fiftyTwoWeekHigh.toFixed(2)}` : "-"}
                  </span>
                  <span className="text-[#666]">Near Low</span>
                  <span className="text-white">
                    {c.nearLowPct != null ? `${c.nearLowPct.toFixed(1)}% above` : "-"}
                  </span>
                  <span className="text-[#666]">Insider Own</span>
                  <span className="text-white">{formatPct(c.heldPercentInsiders)}</span>
                  <span className="text-[#666]">Inst. Own</span>
                  <span className="text-white">{formatPct(c.heldPercentInstitutions)}</span>
                  <span className="text-[#666]">Avg Vol (3mo)</span>
                  <span className="text-white">
                    {formatM(c.avgVolume3Month)}
                  </span>
                  <span className="text-[#666]">Current Vol</span>
                  <span className="text-white">
                    {formatM(c.currentVolume)}
                  </span>
                  <span className="text-[#666]">FINRA Date</span>
                  <span className="text-white">
                    {formatDate(c.dateShortInterest)}
                  </span>
                  {c.ewPosition && (
                    <>
                      <span className="text-[#666]">Wave Position</span>
                      <span
                        className={
                          ewAligned ? "text-green-400" : "text-white"
                        }
                      >
                        {c.ewPosition}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
