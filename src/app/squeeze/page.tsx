"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import {
  Search,
  Loader2,
  ChevronRight,
  ChevronDown,
  X,
  Save,
  Trash2,
  ArrowUpDown,
  Zap,
  TrendingUp,
} from "lucide-react";
import { UNIVERSES, UNIVERSE_KEYS } from "@/data/ew-universes";
import { loadCustomUniverses } from "@/lib/ew-watchlist";
import {
  scoreSqueezeBatch,
  computeSqueezeScore,
  DEFAULT_SQUEEZE_FILTERS,
  isSqueezeAlignedWavePosition,
} from "@/lib/squeeze-scoring";
import {
  saveSqueezeScan,
  loadSqueezeScans,
  deleteSqueezeScan,
} from "@/lib/squeeze-storage";
import type {
  SqueezeData,
  ScoredSqueezeCandidate,
  SqueezeFilters,
  SavedSqueezeScan,
} from "@/lib/ew-types";
import { scoreBatchEnhanced, type EnrichedQuoteInput } from "@/lib/ew-scoring";
import { useDebounce } from "@/lib/use-debounce";

const BATCH_SIZE = 10;
const BATCH_DELAY = 300;

type SortKey =
  | "score"
  | "siPercent"
  | "dtc"
  | "float"
  | "volumeRatio"
  | "price"
  | "ticker";
type SortDir = "asc" | "desc";

function formatM(val: number | null): string {
  if (val == null) return "-";
  const m = val / 1_000_000;
  if (m >= 1000) return `${(m / 1000).toFixed(1)}B`;
  return `${m.toFixed(1)}M`;
}

function formatPct(val: number | null): string {
  if (val == null) return "-";
  // Yahoo may return as decimal (0.15) or percentage (15)
  const pct = val > 1 ? val : val * 100;
  return `${pct.toFixed(1)}%`;
}

function formatNum(val: number | null, decimals = 2): string {
  if (val == null) return "-";
  return val.toFixed(decimals);
}

function formatDate(ts: number | null): string {
  if (ts == null) return "-";
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function tierColor(tier: string): string {
  switch (tier) {
    case "high":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "medium":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    default:
      return "bg-[#2a2a2a] text-[#a0a0a0] border-[#333]";
  }
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-[#a0a0a0] shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-[#ccc]">{value.toFixed(0)}</span>
    </div>
  );
}

export default function SqueezePageWrapper() {
  return (
    <Suspense fallback={null}>
      <SqueezePage />
    </Suspense>
  );
}

function SqueezePage() {
  // Universe
  const [universe, setUniverse] = useState<string>("SP500");
  const [customUniverseKeys, setCustomUniverseKeys] = useState<string[]>([]);

  // Filters
  const [minSiPercent, setMinSiPercent] = useState(DEFAULT_SQUEEZE_FILTERS.minSiPercent);
  const [minDtc, setMinDtc] = useState(DEFAULT_SQUEEZE_FILTERS.minDaysToCover);
  const [maxFloat, setMaxFloat] = useState(DEFAULT_SQUEEZE_FILTERS.maxFloat);
  const [minVolRatio, setMinVolRatio] = useState(DEFAULT_SQUEEZE_FILTERS.minVolumeRatio);
  const [requireEw, setRequireEw] = useState(DEFAULT_SQUEEZE_FILTERS.requireEwAlignment);

  const debouncedSi = useDebounce(minSiPercent, 300);
  const debouncedDtc = useDebounce(minDtc, 300);
  const debouncedFloat = useDebounce(maxFloat, 300);
  const debouncedVol = useDebounce(minVolRatio, 300);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [scannedCount, setScannedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [rawResults, setRawResults] = useState<SqueezeData[]>([]);
  const scanAbort = useRef<AbortController | null>(null);

  // EW enrichment
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState("");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Expand
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Sidebar collapse
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleSection = useCallback((key: string) => {
    setCollapsed((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      return s;
    });
  }, []);

  // Saved scans
  const [savedScans, setSavedScans] = useState<SavedSqueezeScan[]>([]);
  const [saveName, setSaveName] = useState("");

  // Load saved scans + custom universes on mount
  useEffect(() => {
    setSavedScans(loadSqueezeScans());
    setCustomUniverseKeys(loadCustomUniverses().map((u) => `custom:${u.id}`));
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
      requireEwAlignment: requireEw,
    }),
    [debouncedSi, debouncedDtc, debouncedFloat, debouncedVol, requireEw]
  );

  // Score + filter + sort
  const scored = useMemo(
    () => scoreSqueezeBatch(rawResults, filters),
    [rawResults, filters]
  );

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
    if (scored.length === 0) return { avgSi: 0, avgDtc: 0, highCount: 0 };
    const siVals = scored
      .map((c) => c.shortPercentOfFloat)
      .filter((v): v is number => v != null)
      .map((v) => (v > 1 ? v : v * 100));
    const dtcVals = scored
      .map((c) => c.shortRatio)
      .filter((v): v is number => v != null);
    return {
      avgSi: siVals.length > 0 ? siVals.reduce((s, v) => s + v, 0) / siVals.length : 0,
      avgDtc: dtcVals.length > 0 ? dtcVals.reduce((s, v) => s + v, 0) / dtcVals.length : 0,
      highCount: scored.filter((c) => c.tier === "high").length,
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

    // Resolve tickers
    let tickers: { symbol: string; name: string }[];
    if (universe.startsWith("custom:")) {
      const customId = universe.replace("custom:", "");
      const custom = loadCustomUniverses().find((u) => u.id === customId);
      tickers = custom
        ? custom.tickers.map((t) => ({ symbol: t, name: t }))
        : [];
    } else {
      tickers = (UNIVERSES[universe] ?? []).map((t) => ({
        symbol: t.symbol,
        name: t.name,
      }));
    }

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
  }, [universe]);

  const cancelScan = useCallback(() => {
    scanAbort.current?.abort();
    scanAbort.current = null;
    setScanning(false);
    setProgress("");
  }, []);

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
    saveSqueezeScan(name, universe, filters, scored);
    setSavedScans(loadSqueezeScans());
    setSaveName("");
  }, [saveName, universe, filters, scored]);

  const handleDelete = useCallback((id: string) => {
    deleteSqueezeScan(id);
    setSavedScans(loadSqueezeScans());
  }, []);

  const handleLoadScan = useCallback((scan: SavedSqueezeScan) => {
    setUniverse(scan.universe);
    setMinSiPercent(scan.filters.minSiPercent);
    setMinDtc(scan.filters.minDaysToCover);
    setMaxFloat(scan.filters.maxFloat);
    setMinVolRatio(scan.filters.minVolumeRatio);
    setRequireEw(scan.filters.requireEwAlignment);
    // Rebuild rawResults from saved candidates (they already contain SqueezeData fields)
    setRawResults(scan.candidates);
  }, []);

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

  // All universe options
  const allUniverseKeys = useMemo(() => {
    const keys: string[] = [...UNIVERSE_KEYS];
    for (const k of customUniverseKeys) keys.push(k);
    return keys;
  }, [customUniverseKeys]);

  const universeLabel = useCallback(
    (key: string) => {
      if (key.startsWith("custom:")) {
        const id = key.replace("custom:", "");
        const custom = loadCustomUniverses().find((u) => u.id === id);
        return custom?.name ?? "Custom";
      }
      return key;
    },
    []
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 px-4 sm:px-6 py-6 max-w-[1600px] mx-auto">
      {/* ── Left Sidebar ── */}
      <aside className="w-full lg:w-72 shrink-0 space-y-4">
        {/* Universe */}
        <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Universe</h3>
          <select
            value={universe}
            onChange={(e) => setUniverse(e.target.value)}
            className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-[#5ba3e6] focus:outline-none"
          >
            {allUniverseKeys.map((k) => (
              <option key={k} value={k}>
                {universeLabel(k)}{" "}
                {!k.startsWith("custom:") && UNIVERSES[k]
                  ? `(${UNIVERSES[k].length})`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Filters */}
        <div className="rounded-lg border border-[#2a2a2a] bg-[#141414]">
          <button
            onClick={() => toggleSection("filters")}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-white hover:bg-[#1a1a1a] rounded-t-lg"
          >
            Filters
            {collapsed.has("filters") ? (
              <ChevronRight className="h-4 w-4 text-[#666]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#666]" />
            )}
          </button>
          {!collapsed.has("filters") && (
            <div className="px-4 pb-4 space-y-4">
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

        {/* Saved Scans */}
        <div className="rounded-lg border border-[#2a2a2a] bg-[#141414]">
          <button
            onClick={() => toggleSection("saved")}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-white hover:bg-[#1a1a1a] rounded-t-lg"
          >
            Saved Scans ({savedScans.length})
            {collapsed.has("saved") ? (
              <ChevronRight className="h-4 w-4 text-[#666]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#666]" />
            )}
          </button>
          {!collapsed.has("saved") && (
            <div className="px-4 pb-4 space-y-2">
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
          )}
        </div>
      </aside>

      {/* ── Main Content ── */}
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

        {/* Enrich button */}
        {scored.length > 0 && !enriching && (
          <div className="mb-4">
            <button
              onClick={enrichWithEW}
              className="inline-flex items-center gap-2 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs font-medium text-[#a0a0a0] hover:text-[#5ba3e6] hover:border-[#5ba3e6]/30 transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Enrich Top 20 with EW Wave Position
            </button>
          </div>
        )}
        {enriching && (
          <div className="mb-4 flex items-center gap-2 text-xs text-[#a0a0a0]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {enrichProgress}
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
                    <SortHeader label="Score" sortKeyVal="score" />
                    <th className="px-3 py-2 text-left text-xs font-medium text-[#a0a0a0]">
                      EW
                    </th>
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
              Select a universe and click Scan to screen for short squeeze
              candidates. Combines SI%, days to cover, float size, volume
              surge, and optional EW wave alignment.
            </p>
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
}: {
  candidate: ScoredSqueezeCandidate;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ewAligned = isSqueezeAlignedWavePosition(c.ewPosition);

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
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} className="bg-[#0f0f0f] px-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Score breakdown */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-[#a0a0a0] uppercase tracking-wider mb-3">
                  Score Breakdown
                </h4>
                <ScoreBar
                  label="SI %"
                  value={c.components.siPercent}
                  max={30}
                  color="bg-red-500"
                />
                <ScoreBar
                  label="Days Cover"
                  value={c.components.daysTocover}
                  max={20}
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
                  max={20}
                  color="bg-blue-500"
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
