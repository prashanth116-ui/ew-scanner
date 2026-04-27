"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Search,
  Loader2,
  ChevronRight,
  ChevronDown,
  X,
  ArrowUpDown,
  Layers,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import Link from "next/link";
import type {
  ConfluenceResult,
  ConfluenceScores,
  ConfluenceScanResult,
  ConfluenceWeights,
  ConfluenceThresholds,
  ConfluenceSignal,
} from "@/lib/confluence/types";
import {
  CONFLUENCE_PRESETS,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
} from "@/lib/confluence/types";
import { computeConfluenceScore, classifySignal } from "@/lib/confluence/scoring";
import { getConfluenceUniverse, getConfluenceTickerInfo } from "@/data/confluence-universe";
import { getSectorForSymbol } from "@/data/sector-universe";
import type { SectorRotationScore, SectorRotationResult } from "@/lib/sector-rotation/types";
import { ScannerCTA } from "@/components/scanner-cta";

const BATCH_SIZE = 10;
const BATCH_DELAY = 1200;

type SortKey = "confluence" | "ew" | "squeeze" | "prerun" | "sector" | "pass";
type SortDir = "asc" | "desc";

const SIGNAL_COLORS: Record<ConfluenceSignal, string> = {
  strong: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  moderate: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  weak: "bg-[#2a2a2a] text-[#a0a0a0] border-[#333]",
  none: "bg-red-500/10 text-red-400/60 border-red-500/20",
};

const SIGNAL_LABELS: Record<ConfluenceSignal, string> = {
  strong: "STRONG",
  moderate: "MODERATE",
  weak: "WEAK",
  none: "NONE",
};

function scoreBarColor(val: number): string {
  if (val >= 0.6) return "bg-pink-500";
  if (val >= 0.4) return "bg-amber-500";
  if (val >= 0.2) return "bg-[#666]";
  return "bg-[#333]";
}

function passDot(pass: boolean): string {
  return pass ? "bg-pink-500" : "bg-[#333]";
}

export default function ConfluencePage() {
  // Weights & thresholds
  const [weights, setWeights] = useState<ConfluenceWeights>({ ...DEFAULT_WEIGHTS });
  const [thresholds, setThresholds] = useState<ConfluenceThresholds>({ ...DEFAULT_THRESHOLDS });

  // Signal filter
  const [signalFilter, setSignalFilter] = useState<Set<ConfluenceSignal>>(
    new Set(["strong", "moderate", "weak"])
  );

  // Sector filter
  const [sectorFilter, setSectorFilter] = useState("All");

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [scannedCount, setScannedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [rawResults, setRawResults] = useState<ConfluenceScanResult[]>([]);
  const [sectorData, setSectorData] = useState<SectorRotationScore[] | null>(null);
  const scanAbort = useRef<AbortController | null>(null);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("confluence");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Ticker search
  const [tickerSearch, setTickerSearch] = useState("");
  const [tickerSearching, setTickerSearching] = useState(false);

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

  // Build a map from ticker -> sector rotation data
  const sectorMap = useMemo(() => {
    if (!sectorData) return new Map<string, SectorRotationScore>();
    const map = new Map<string, SectorRotationScore>();
    for (const s of sectorData) {
      map.set(s.sector, s);
    }
    return map;
  }, [sectorData]);

  // Compute confluence results from raw scan results + sector data
  const confluenceResults: ConfluenceResult[] = useMemo(() => {
    return rawResults.map((r) => {
      const sector = getSectorForSymbol(r.ticker);
      const sectorInfo = sectorMap.get(sector) ?? null;

      const ewNorm = r.ewResult ? r.ewResult.enhancedNormalized : null;
      const squeezeNorm = r.squeezeResult ? r.squeezeResult.squeezeScore / 100 : null;
      const prerunNorm = r.prerunResult ? r.prerunResult.finalScore / 24 : null;
      const sectorNorm = sectorInfo ? sectorInfo.compositeScore / 100 : null;

      const scores = computeConfluenceScore(
        ewNorm, squeezeNorm, prerunNorm, sectorNorm,
        weights, thresholds,
      );

      const signal = classifySignal(scores);

      const tickerInfo = getConfluenceTickerInfo(r.ticker);

      return {
        ticker: r.ticker,
        name: r.name || tickerInfo?.name || r.ticker,
        sector,
        scores,
        signal,
        ewResult: r.ewResult,
        squeezeResult: r.squeezeResult,
        prerunResult: r.prerunResult,
        sectorResult: sectorInfo ? {
          compositeScore: sectorInfo.compositeScore,
          quadrant: sectorInfo.quadrant,
          trend: sectorInfo.trend,
        } : null,
      };
    });
  }, [rawResults, sectorMap, weights, thresholds]);

  // Filter & sort
  const filtered = useMemo(() => {
    return confluenceResults.filter((r) => {
      if (!signalFilter.has(r.signal)) return false;
      if (sectorFilter !== "All" && r.sector !== sectorFilter) return false;
      return true;
    });
  }, [confluenceResults, signalFilter, sectorFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "confluence":
          cmp = a.scores.confluenceScore - b.scores.confluenceScore;
          break;
        case "ew":
          cmp = a.scores.ewNormalized - b.scores.ewNormalized;
          break;
        case "squeeze":
          cmp = a.scores.squeezeNormalized - b.scores.squeezeNormalized;
          break;
        case "prerun":
          cmp = a.scores.prerunNormalized - b.scores.prerunNormalized;
          break;
        case "sector":
          cmp = a.scores.sectorNormalized - b.scores.sectorNormalized;
          break;
        case "pass":
          cmp = a.scores.passCount - b.scores.passCount;
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const strong = filtered.filter((r) => r.signal === "strong").length;
    const moderate = filtered.filter((r) => r.signal === "moderate").length;
    const weak = filtered.filter((r) => r.signal === "weak").length;
    return { total: filtered.length, strong, moderate, weak };
  }, [filtered]);

  // Unique sectors for filter
  const sectors = useMemo(() => {
    const s = new Set(confluenceResults.map((r) => r.sector));
    return Array.from(s).sort();
  }, [confluenceResults]);

  // Scan
  const runScan = useCallback(async () => {
    scanAbort.current?.abort();
    const controller = new AbortController();
    scanAbort.current = controller;
    const signal = controller.signal;

    setScanning(true);
    setRawResults([]);
    setScannedCount(0);

    const universe = getConfluenceUniverse();
    const tickers = universe.map((t) => t.symbol);
    setTotalCount(tickers.length);

    if (tickers.length === 0) {
      setScanning(false);
      return;
    }

    // Fetch sector rotation data once (non-blocking if it fails)
    try {
      const sectorRes = await fetch("/api/sector-rotation", { signal });
      if (sectorRes.ok) {
        const data = (await sectorRes.json()) as SectorRotationResult;
        setSectorData(data.sectors);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setScanning(false);
        return;
      }
      // Sector data is non-critical, continue without it
    }

    const results: ConfluenceScanResult[] = [];

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      if (signal.aborted) break;
      const batch = tickers.slice(i, i + BATCH_SIZE);
      setProgress(
        `Scanning ${Math.min(i + BATCH_SIZE, tickers.length)}/${tickers.length}...`
      );

      try {
        const res = await fetch("/api/confluence/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickers: batch }),
          signal,
        });

        if (res.ok) {
          const data = (await res.json()) as { results: ConfluenceScanResult[] };
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

    setScanning(false);
    setProgress("");
  }, []);

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

    if (rawResults.some((r) => r.ticker === ticker)) {
      setTickerSearch("");
      return;
    }

    setTickerSearching(true);
    try {
      const res = await fetch("/api/confluence/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: [ticker] }),
      });

      if (res.ok) {
        const data = (await res.json()) as { results: ConfluenceScanResult[] };
        if (data.results?.length) {
          setRawResults((prev) => [...data.results, ...prev]);
        }
      }
    } catch {
      // silently fail
    }
    setTickerSearching(false);
    setTickerSearch("");
  }, [tickerSearch, rawResults]);

  // Preset
  const applyPreset = useCallback((preset: typeof CONFLUENCE_PRESETS[number]) => {
    setWeights({ ...preset.weights });
    setThresholds({ ...preset.thresholds });
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

  // Signal filter toggle
  const toggleSignal = useCallback((sig: ConfluenceSignal) => {
    setSignalFilter((prev) => {
      const s = new Set(prev);
      if (s.has(sig)) s.delete(sig);
      else s.add(sig);
      return s;
    });
  }, []);

  return (
    <>
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

          {/* Presets */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
            <button
              onClick={() => toggleSection("presets")}
              className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
            >
              <span>Presets</span>
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has("presets") ? "" : "rotate-90"}`} />
            </button>
            {!collapsed.has("presets") && (
              <div className="border-t border-[#2a2a2a] px-4 pb-3 pt-2">
                <div className="space-y-1.5">
                  {CONFLUENCE_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => applyPreset(p)}
                      className="group flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[#262626]"
                    >
                      <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-[#555] transition-colors group-hover:text-[#ec4899]" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#e6e6e6] group-hover:text-[#ec4899]">
                          {p.shortName}
                          {p.recommended && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-[#ec4899]/10 px-1.5 py-0.5 text-[9px] font-medium text-[#ec4899]">
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

          {/* Weights */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
            <button
              onClick={() => toggleSection("weights")}
              className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
            >
              <span>Weights</span>
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has("weights") ? "" : "rotate-90"}`} />
            </button>
            {!collapsed.has("weights") && (
              <div className="border-t border-[#2a2a2a] px-4 pb-4 pt-3 space-y-3">
                {(["ew", "squeeze", "prerun", "sector"] as const).map((key) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#a0a0a0] capitalize">{key === "ew" ? "EW" : key === "prerun" ? "Pre-Run" : key.charAt(0).toUpperCase() + key.slice(1)}</span>
                      <span className="text-white">{weights[key]}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={weights[key]}
                      onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                      className="w-full accent-[#ec4899]"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Thresholds */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
            <button
              onClick={() => toggleSection("thresholds")}
              className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
            >
              <span>Thresholds</span>
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has("thresholds") ? "" : "rotate-90"}`} />
            </button>
            {!collapsed.has("thresholds") && (
              <div className="border-t border-[#2a2a2a] px-4 pb-4 pt-3 space-y-3">
                {(["ew", "squeeze", "prerun", "sector"] as const).map((key) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#a0a0a0] capitalize">{key === "ew" ? "EW" : key === "prerun" ? "Pre-Run" : key.charAt(0).toUpperCase() + key.slice(1)}</span>
                      <span className="text-white">{(thresholds[key] * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={thresholds[key] * 100}
                      onChange={(e) => setThresholds((t) => ({ ...t, [key]: Number(e.target.value) / 100 }))}
                      className="w-full accent-[#ec4899]"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Signal filter */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
            <button
              onClick={() => toggleSection("signal")}
              className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
            >
              <span>Signal Filter</span>
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has("signal") ? "" : "rotate-90"}`} />
            </button>
            {!collapsed.has("signal") && (
              <div className="border-t border-[#2a2a2a] px-4 pb-4 pt-3 space-y-2">
                {(["strong", "moderate", "weak", "none"] as ConfluenceSignal[]).map((sig) => (
                  <label key={sig} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={signalFilter.has(sig)}
                      onChange={() => toggleSignal(sig)}
                      className="accent-[#ec4899]"
                    />
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SIGNAL_COLORS[sig]}`}>
                      {SIGNAL_LABELS[sig]}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Sector filter */}
          {sectors.length > 0 && (
            <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
              <button
                onClick={() => toggleSection("sector-filter")}
                className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
              >
                <span>Sector</span>
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has("sector-filter") ? "" : "rotate-90"}`} />
              </button>
              {!collapsed.has("sector-filter") && (
                <div className="border-t border-[#2a2a2a] px-4 pb-4 pt-3">
                  <select
                    value={sectorFilter}
                    onChange={(e) => setSectorFilter(e.target.value)}
                    className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#ec4899] focus:outline-none"
                  >
                    <option value="All">All Sectors</option>
                    {sectors.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Scan / Cancel */}
          <div className="flex gap-2">
            <button
              onClick={runScan}
              disabled={scanning}
              className="flex-1 flex items-center justify-center gap-2 rounded-md bg-[#ec4899] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#db2777] disabled:opacity-50 transition-colors"
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

          {/* Ticker search */}
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
                    placeholder="e.g. AAPL, NVDA..."
                    className="flex-1 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white placeholder-[#555] focus:border-[#ec4899] focus:outline-none"
                  />
                  <button
                    onClick={lookupTicker}
                    disabled={tickerSearching || !tickerSearch.trim()}
                    className="rounded-md bg-[#ec4899] px-3 py-1.5 text-sm text-white hover:bg-[#db2777] disabled:opacity-50 transition-colors"
                  >
                    {tickerSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Reset */}
          <button
            onClick={() => {
              setWeights({ ...DEFAULT_WEIGHTS });
              setThresholds({ ...DEFAULT_THRESHOLDS });
              setSignalFilter(new Set(["strong", "moderate", "weak"]));
              setSectorFilter("All");
            }}
            className="w-full rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#666] hover:text-white hover:border-[#444] transition-colors"
          >
            Reset All
          </button>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Progress */}
          {scanning && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-[#a0a0a0] mb-1">
                <span>{progress}</span>
                <span>{scannedCount}/{totalCount}</span>
              </div>
              <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#ec4899] rounded-full transition-all duration-300"
                  style={{ width: totalCount > 0 ? `${(scannedCount / totalCount) * 100}%` : "0%" }}
                />
              </div>
            </div>
          )}

          {/* Summary stats */}
          {confluenceResults.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Showing</p>
                <p className="text-lg font-bold text-white">
                  {stats.total}
                  <span className="text-xs font-normal text-[#666] ml-1">/ {confluenceResults.length}</span>
                </p>
              </div>
              <div className="rounded-lg border border-pink-500/20 bg-[#141414] px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-pink-400/60 mb-1">Strong</p>
                <p className="text-lg font-bold text-pink-400">{stats.strong}</p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-[#141414] px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-amber-400/60 mb-1">Moderate</p>
                <p className="text-lg font-bold text-amber-400">{stats.moderate}</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Weak</p>
                <p className="text-lg font-bold text-[#a0a0a0]">{stats.weak}</p>
              </div>
            </div>
          )}

          {/* Sort row */}
          {sorted.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-[#666]">Sort:</span>
              {(
                [
                  { key: "confluence", label: "Confluence" },
                  { key: "pass", label: "Pass Count" },
                  { key: "ew", label: "EW" },
                  { key: "squeeze", label: "Squeeze" },
                  { key: "prerun", label: "Pre-Run" },
                  { key: "sector", label: "Sector" },
                ] as { key: SortKey; label: string }[]
              ).map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSort(s.key)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
                    sortKey === s.key
                      ? "bg-[#ec4899]/10 text-[#ec4899] border border-[#ec4899]/30"
                      : "text-[#a0a0a0] hover:text-white border border-[#2a2a2a] hover:border-[#444]"
                  }`}
                >
                  {s.label}
                  {sortKey === s.key && <ArrowUpDown className="h-3 w-3" />}
                </button>
              ))}
            </div>
          )}

          {/* Results table */}
          {sorted.length > 0 ? (
            <div className="space-y-2">
              {/* Header row */}
              <div className="hidden sm:grid grid-cols-[2.5rem_4rem_1fr_8rem_5rem_4rem_5rem_4rem_4rem_4rem] gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-[#555]">
                <span>#</span>
                <span>Ticker</span>
                <span>Name</span>
                <span>Confluence</span>
                <span>Pass</span>
                <span>Signal</span>
                <span>EW</span>
                <span>Sqz</span>
                <span>Pre</span>
                <span>Sec</span>
              </div>

              {sorted.map((result, idx) => (
                <ResultRow
                  key={result.ticker}
                  result={result}
                  rank={idx + 1}
                  expanded={expandedTicker === result.ticker}
                  onToggle={() => setExpandedTicker(expandedTicker === result.ticker ? null : result.ticker)}
                />
              ))}
            </div>
          ) : confluenceResults.length > 0 && !scanning ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#666]">
              <Layers className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">No stocks matched the current filters.</p>
              <p className="text-xs mt-1">Try enabling more signal types or lowering thresholds.</p>
            </div>
          ) : !scanning ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#666]">
              <Layers className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Confluence Scanner</p>
              <p className="text-xs mt-1 max-w-md text-center">
                Scan {getConfluenceUniverse().length} stocks across all 4 scanners.
                Stocks passing multiple scanners simultaneously represent the highest conviction setups.
              </p>
            </div>
          ) : null}
        </main>
      </div>
      <ScannerCTA />
    </>
  );
}

// -- Result Row Component --

function ResultRow({
  result,
  rank,
  expanded,
  onToggle,
}: {
  result: ConfluenceResult;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const s = result.scores;

  return (
    <div className="ew-card-in rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] hover:border-[#3a3a3a] transition-colors">
      {/* Main row */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3"
      >
        {/* Mobile layout */}
        <div className="sm:hidden space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#555] w-6">{rank}</span>
              <span className="text-sm font-bold text-white">{result.ticker}</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${SIGNAL_COLORS[result.signal]}`}>
                {SIGNAL_LABELS[result.signal]}
              </span>
            </div>
            {expanded ? <ChevronDown className="h-4 w-4 text-[#555]" /> : <ChevronRight className="h-4 w-4 text-[#555]" />}
          </div>
          <p className="text-xs text-[#a0a0a0] truncate pl-8">{result.name}</p>
          <div className="flex items-center gap-2 pl-8">
            <div className="flex-1 h-2 bg-[#0f0f0f] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${scoreBarColor(s.confluenceScore)}`}
                style={{ width: `${Math.min(100, s.confluenceScore * 100)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-white w-10 text-right">
              {(s.confluenceScore * 100).toFixed(0)}%
            </span>
            <div className="flex gap-1">
              {[s.ewNormalized, s.squeezeNormalized, s.prerunNormalized, s.sectorNormalized].map((v, i) => (
                <div key={i} className={`w-2 h-2 rounded-full ${v > 0 ? passDot(
                  i === 0 ? v >= (DEFAULT_THRESHOLDS.ew) :
                  i === 1 ? v >= (DEFAULT_THRESHOLDS.squeeze) :
                  i === 2 ? v >= (DEFAULT_THRESHOLDS.prerun) :
                  v >= (DEFAULT_THRESHOLDS.sector)
                ) : "bg-[#222]"}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden sm:grid grid-cols-[2.5rem_4rem_1fr_8rem_5rem_4rem_5rem_4rem_4rem_4rem] gap-2 items-center">
          <span className="text-xs text-[#555]">{rank}</span>
          <span className="text-sm font-bold text-white">{result.ticker}</span>
          <span className="text-xs text-[#a0a0a0] truncate">{result.name}</span>
          {/* Confluence bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-[#0f0f0f] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${scoreBarColor(s.confluenceScore)}`}
                style={{ width: `${Math.min(100, s.confluenceScore * 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-white w-7 text-right">
              {(s.confluenceScore * 100).toFixed(0)}
            </span>
          </div>
          {/* Pass dots */}
          <div className="flex items-center gap-1.5">
            <PassDots scores={s} thresholds={DEFAULT_THRESHOLDS} />
            <span className="text-[10px] text-[#666]">{s.passCount}/4</span>
          </div>
          {/* Signal */}
          <span className={`inline-flex items-center justify-center rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${SIGNAL_COLORS[result.signal]}`}>
            {SIGNAL_LABELS[result.signal]}
          </span>
          {/* Individual scores */}
          <ScoreCell value={s.ewNormalized} label="EW" />
          <ScoreCell value={s.squeezeNormalized} label="Sqz" />
          <ScoreCell value={s.prerunNormalized} label="Pre" />
          <ScoreCell value={s.sectorNormalized} label="Sec" />
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[#2a2a2a] px-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* EW Panel */}
            <DetailPanel
              title="EW Scanner"
              color="#5ba3e6"
              available={!!result.ewResult}
              score={s.ewNormalized}
            >
              {result.ewResult && (
                <div className="space-y-1.5">
                  <DetailRow label="Enhanced Score" value={result.ewResult.enhancedScore.toFixed(1)} />
                  <DetailRow label="Normalized" value={`${(result.ewResult.enhancedNormalized * 100).toFixed(0)}%`} />
                  <DetailRow label="Confidence" value={result.ewResult.confidenceTier} />
                  {result.ewResult.fibDepthLabel && <DetailRow label="Fib Level" value={result.ewResult.fibDepthLabel} />}
                  {result.ewResult.wavePosition && <DetailRow label="Wave" value={result.ewResult.wavePosition} />}
                </div>
              )}
            </DetailPanel>

            {/* Squeeze Panel */}
            <DetailPanel
              title="Squeeze"
              color="#f59e0b"
              available={!!result.squeezeResult}
              score={s.squeezeNormalized}
            >
              {result.squeezeResult && (
                <div className="space-y-1.5">
                  <DetailRow label="Squeeze Score" value={`${result.squeezeResult.squeezeScore}/100`} />
                  <DetailRow label="Tier" value={result.squeezeResult.tier} />
                  {result.squeezeResult.shortPercentOfFloat != null && (
                    <DetailRow label="SI %" value={`${(result.squeezeResult.shortPercentOfFloat * (result.squeezeResult.shortPercentOfFloat < 1 ? 100 : 1)).toFixed(1)}%`} />
                  )}
                  {result.squeezeResult.shortRatio != null && (
                    <DetailRow label="Days to Cover" value={result.squeezeResult.shortRatio.toFixed(1)} />
                  )}
                </div>
              )}
            </DetailPanel>

            {/* Pre-Run Panel */}
            <DetailPanel
              title="Pre-Run"
              color="#10b981"
              available={!!result.prerunResult}
              score={s.prerunNormalized}
            >
              {result.prerunResult && (
                <div className="space-y-1.5">
                  <DetailRow label="Score" value={`${result.prerunResult.finalScore}/24`} />
                  <DetailRow label="Verdict" value={result.prerunResult.verdict} />
                  {result.prerunResult.pctFromAth != null && (
                    <DetailRow label="% from ATH" value={`${result.prerunResult.pctFromAth.toFixed(0)}%`} />
                  )}
                  {result.prerunResult.shortFloat != null && (
                    <DetailRow label="Short Float" value={`${result.prerunResult.shortFloat.toFixed(1)}%`} />
                  )}
                  {result.prerunResult.daysToEarnings != null && (
                    <DetailRow label="Earnings In" value={`${result.prerunResult.daysToEarnings}d`} />
                  )}
                </div>
              )}
            </DetailPanel>

            {/* Sector Panel */}
            <DetailPanel
              title="Sector Rotation"
              color="#8b5cf6"
              available={!!result.sectorResult}
              score={s.sectorNormalized}
            >
              {result.sectorResult ? (
                <div className="space-y-1.5">
                  <DetailRow label="Sector" value={result.sector} />
                  <DetailRow label="Composite" value={`${result.sectorResult.compositeScore}/100`} />
                  <DetailRow label="Quadrant" value={result.sectorResult.quadrant} />
                  <DetailRow label="Trend" value={result.sectorResult.trend} />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <DetailRow label="Sector" value={result.sector} />
                </div>
              )}
            </DetailPanel>
          </div>
        </div>
      )}
    </div>
  );
}

function PassDots({ scores, thresholds }: { scores: ConfluenceScores; thresholds: ConfluenceThresholds }) {
  const items = [
    { val: scores.ewNormalized, thresh: thresholds.ew, label: "EW" },
    { val: scores.squeezeNormalized, thresh: thresholds.squeeze, label: "Sqz" },
    { val: scores.prerunNormalized, thresh: thresholds.prerun, label: "Pre" },
    { val: scores.sectorNormalized, thresh: thresholds.sector, label: "Sec" },
  ];

  return (
    <div className="flex gap-1">
      {items.map((item) => (
        <div
          key={item.label}
          title={`${item.label}: ${(item.val * 100).toFixed(0)}% (threshold: ${(item.thresh * 100).toFixed(0)}%)`}
          className={`w-2.5 h-2.5 rounded-full ${item.val > 0 ? passDot(item.val >= item.thresh) : "bg-[#222]"}`}
        />
      ))}
    </div>
  );
}

function ScoreCell({ value, label }: { value: number; label: string }) {
  const pct = (value * 100).toFixed(0);
  const color = value >= 0.5 ? "text-white" : value > 0 ? "text-[#888]" : "text-[#444]";
  return (
    <span className={`text-xs font-medium ${color}`} title={`${label}: ${pct}%`}>
      {value > 0 ? pct : "-"}
    </span>
  );
}

function DetailPanel({
  title,
  color,
  available,
  score,
  children,
}: {
  title: string;
  color: string;
  available: boolean;
  score: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color }}>
          {title}
        </span>
        {available ? (
          <span className="text-xs font-bold text-white">
            {(score * 100).toFixed(0)}%
          </span>
        ) : (
          <span className="text-[10px] text-[#444]">N/A</span>
        )}
      </div>
      {/* Score bar */}
      <div className="h-1.5 bg-[#0f0f0f] rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, score * 100)}%`, backgroundColor: color }}
        />
      </div>
      {available ? children : (
        <p className="text-[10px] text-[#444]">No data available</p>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-[#666]">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}
