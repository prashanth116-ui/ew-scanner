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
  Copy,
  Check,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  FileDown,
  Save,
  Trash2,
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
import { exportConfluenceToExcel } from "@/lib/confluence/export";
import {
  saveConfluenceScan,
  loadConfluenceScans,
  deleteConfluenceScan,
  type SavedConfluenceScan,
} from "@/lib/confluence/storage";
import { getConfluenceUniverse, getConfluenceTickerInfo } from "@/data/confluence-universe";
import { getSectorForSymbol } from "@/data/sector-universe";
import type { SectorRotationScore, SectorRotationResult } from "@/lib/sector-rotation/types";
import { ScannerCTA } from "@/components/scanner-cta";
import { useCollapsibleSections } from "@/lib/use-collapsible-sections";
import { SidebarShell } from "@/components/sidebar-shell";
import { SidebarSection } from "@/components/sidebar-section";
import { PresetList } from "@/components/preset-list";
import { ScoreBar } from "@/components/score-bar";

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

const SIGNAL_BAR_COLORS: Record<ConfluenceSignal, string> = {
  strong: "bg-pink-500",
  moderate: "bg-amber-500",
  weak: "bg-[#555]",
  none: "bg-[#333]",
};

function passDot(pass: boolean): string {
  return pass ? "bg-pink-500" : "bg-[#333]";
}

/** Generate a one-line natural language summary for a confluence result. */
function generateWhyThisStock(r: ConfluenceResult): string {
  const parts: string[] = [];

  if (r.ewResult) {
    if (r.scores.ewNormalized >= 0.6) parts.push("strong EW wave setup");
    else if (r.scores.ewNormalized >= 0.4) parts.push("favorable EW positioning");
    if (r.ewResult.wavePosition) {
      const wp = r.ewResult.wavePosition.toLowerCase();
      if (wp.length < 40) parts.push(wp);
    }
    if (r.ewResult.fibDepthLabel) parts.push(`fib ${r.ewResult.fibDepthLabel} retracement`);
  }

  if (r.squeezeResult) {
    if (r.scores.squeezeNormalized >= 0.6) parts.push("high short squeeze potential");
    else if (r.scores.squeezeNormalized >= 0.3) parts.push("elevated short interest");
    if (r.squeezeResult.shortPercentOfFloat != null) {
      const si = r.squeezeResult.shortPercentOfFloat * (r.squeezeResult.shortPercentOfFloat < 1 ? 100 : 1);
      if (si > 10) parts.push(`${si.toFixed(0)}% SI`);
    }
  }

  if (r.prerunResult) {
    if (r.prerunResult.verdict === "PRIORITY") parts.push("priority pre-run candidate");
    else if (r.prerunResult.verdict === "KEEP") parts.push("strong fundamental catalyst");
    if (r.prerunResult.daysToEarnings != null && r.prerunResult.daysToEarnings <= 30) {
      parts.push(`earnings in ${r.prerunResult.daysToEarnings}d`);
    }
    if (r.prerunResult.pctFromAth != null && r.prerunResult.pctFromAth < -40) {
      parts.push(`${r.prerunResult.pctFromAth.toFixed(0)}% from ATH`);
    }
  }

  if (r.sectorResult) {
    if (r.sectorResult.quadrant === "LEADING") parts.push("leading sector rotation");
    else if (r.sectorResult.quadrant === "IMPROVING") parts.push("improving sector momentum");
    if (r.sectorResult.trend === "UP") parts.push("sector uptrend");
  }

  if (parts.length === 0) return "Limited data available — review individual scanner details below.";
  // Cap at 4 reasons to keep it concise
  return parts.slice(0, 4).join(" · ");
}

// Scanner link paths
const SCANNER_LINKS: Record<string, { href: string; label: string }> = {
  ew: { href: "/", label: "EW Scanner" },
  squeeze: { href: "/squeeze", label: "Squeeze Scanner" },
  prerun: { href: "/pre-run", label: "Pre-Run Scanner" },
  sector: { href: "/sectors", label: "Sector Scanner" },
};

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
  const { collapsed, toggleSection } = useCollapsibleSections();
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Ticker search
  const [tickerSearch, setTickerSearch] = useState("");
  const [tickerSearching, setTickerSearching] = useState(false);

  // Export toast
  const [copiedToast, setCopiedToast] = useState(false);

  // Saved scans
  const [savedScans, setSavedScans] = useState<SavedConfluenceScan[]>([]);
  const [saveName, setSaveName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    setSavedScans(loadConfluenceScans());
  }, []);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      scanAbort.current?.abort();
    };
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
        price: r.price,
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

  // Unique sectors for filter with counts
  const sectorsWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of confluenceResults) {
      counts.set(r.sector, (counts.get(r.sector) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sector, count]) => ({ sector, count }));
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

  // Export / copy watchlist
  const copyWatchlist = useCallback(() => {
    const symbols = sorted.map((r) => r.ticker).join(", ");
    navigator.clipboard.writeText(symbols).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    });
  }, [sorted]);

  const handleExport = useCallback(() => {
    if (sorted.length > 0) exportConfluenceToExcel(sorted);
  }, [sorted]);

  // Save/load scan handlers
  const handleSaveScan = useCallback(() => {
    const name = saveName.trim() || `Scan ${new Date().toLocaleString()}`;
    const scan = saveConfluenceScan(name, weights, thresholds, [...signalFilter] as ConfluenceSignal[], sorted);
    if (scan) {
      setSavedScans(loadConfluenceScans());
      setSaveName("");
    }
  }, [saveName, weights, thresholds, signalFilter, sorted]);

  const handleLoadScan = useCallback(
    (scan: SavedConfluenceScan) => {
      setWeights(scan.weights);
      setThresholds(scan.thresholds);
      setSignalFilter(new Set(scan.signalFilters));
    },
    []
  );

  const handleDeleteScan = useCallback((id: string) => {
    deleteConfluenceScan(id);
    setSavedScans(loadConfluenceScans());
    setDeleteConfirm(null);
  }, []);

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-6 px-4 sm:px-6 py-6 max-w-[1600px] mx-auto">
        <SidebarShell open={sidebarOpen} onToggle={setSidebarOpen}>
          {/* Presets */}
          <SidebarSection title="Presets" sectionKey="presets" collapsed={collapsed.has("presets")} onToggle={toggleSection}>
            <PresetList presets={CONFLUENCE_PRESETS} onSelect={applyPreset} accent="#ec4899" />
          </SidebarSection>

          {/* Weights */}
          <SidebarSection title="Weights" sectionKey="weights" collapsed={collapsed.has("weights")} onToggle={toggleSection}>
              <div className="space-y-3">
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
          </SidebarSection>

          {/* Thresholds */}
          <SidebarSection title="Thresholds" sectionKey="thresholds" collapsed={collapsed.has("thresholds")} onToggle={toggleSection}>
                {(["ew", "squeeze", "prerun", "sector"] as const).map((key) => (
                  <div key={key} className="mb-3 last:mb-0">
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
          </SidebarSection>

          {/* Signal filter */}
          <SidebarSection title="Signal Filter" sectionKey="signal" collapsed={collapsed.has("signal")} onToggle={toggleSection}>
              <div className="space-y-2">
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
          </SidebarSection>

          {/* Sector filter — enhanced with counts */}
          {sectorsWithCounts.length > 0 && (
            <SidebarSection title="Sector" sectionKey="sector-filter" collapsed={collapsed.has("sector-filter")} onToggle={toggleSection}>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setSectorFilter("All")}
                      className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                        sectorFilter === "All"
                          ? "bg-[#ec4899]/15 text-[#ec4899] border border-[#ec4899]/30"
                          : "text-[#a0a0a0] border border-[#2a2a2a] hover:border-[#444] hover:text-white"
                      }`}
                    >
                      All ({confluenceResults.length})
                    </button>
                    {sectorsWithCounts.map(({ sector, count }) => (
                      <button
                        key={sector}
                        onClick={() => setSectorFilter(sectorFilter === sector ? "All" : sector)}
                        className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                          sectorFilter === sector
                            ? "bg-[#ec4899]/15 text-[#ec4899] border border-[#ec4899]/30"
                            : "text-[#a0a0a0] border border-[#2a2a2a] hover:border-[#444] hover:text-white"
                        }`}
                      >
                        {sector} ({count})
                      </button>
                    ))}
                  </div>
            </SidebarSection>
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
          <SidebarSection title="Add Ticker" sectionKey="ticker" collapsed={collapsed.has("ticker")} onToggle={toggleSection}>
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
          </SidebarSection>

          {/* Saved Scans */}
          <SidebarSection title="Saved Scans" sectionKey="saved" collapsed={collapsed.has("saved")} onToggle={toggleSection}>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Scan name…"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="flex-1 rounded-md border border-[#2a2a2a] bg-[#141414] px-2 py-1 text-xs text-white placeholder-[#555] focus:border-[#ec4899]/50 focus:outline-none"
              />
              <button
                onClick={handleSaveScan}
                disabled={sorted.length === 0}
                className="rounded-md border border-[#2a2a2a] px-2 py-1 text-xs text-[#a0a0a0] hover:text-[#ec4899] hover:border-[#ec4899]/30 transition-colors disabled:opacity-40"
              >
                <Save className="h-3 w-3" />
              </button>
            </div>
            {savedScans.length === 0 ? (
              <p className="text-[11px] text-[#555]">No saved scans yet.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {savedScans.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-md border border-[#2a2a2a] bg-[#141414] px-2 py-1.5 text-xs"
                  >
                    <button
                      onClick={() => handleLoadScan(s)}
                      className="flex-1 text-left text-[#a0a0a0] hover:text-white truncate mr-2"
                      title={`Load: ${s.name}\n${s.candidateCount} results • ${new Date(s.savedAt).toLocaleDateString()}`}
                    >
                      <span className="text-white">{s.name}</span>
                      <span className="text-[#555] ml-1">({s.candidateCount})</span>
                    </button>
                    {deleteConfirm === s.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteScan(s.id)}
                          className="text-red-400 hover:text-red-300 text-[10px]"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="text-[#666] hover:text-white text-[10px]"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(s.id)}
                        className="text-[#444] hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SidebarSection>

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
        </SidebarShell>

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

          {/* Action bar: sort pills + export */}
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
                  {sortKey === s.key && (
                    sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
                  )}
                </button>
              ))}

              {/* Export / Copy Watchlist */}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={handleExport}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-[#a0a0a0] hover:text-white border border-[#2a2a2a] hover:border-[#444] transition-colors"
                >
                  <FileDown className="h-3 w-3" />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  onClick={copyWatchlist}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-[#a0a0a0] hover:text-white border border-[#2a2a2a] hover:border-[#444] transition-colors"
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

          {/* Results table */}
          {sorted.length > 0 ? (
            <div className="space-y-2">
              {/* Clickable header row */}
              <div className="hidden sm:grid grid-cols-[2.5rem_4rem_1fr_8rem_5rem_4rem_5rem_4rem_4rem_4rem] gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-[#555]">
                <span>#</span>
                <span>Ticker</span>
                <span>Name</span>
                <SortHeader label="Score" sortKey="confluence" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Pass" sortKey="pass" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <span>Signal</span>
                <SortHeader label="EW" sortKey="ew" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Sqz" sortKey="squeeze" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Pre" sortKey="prerun" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Sec" sortKey="sector" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              </div>

              {sorted.map((result, idx) => (
                <ResultRow
                  key={result.ticker}
                  result={result}
                  rank={idx + 1}
                  expanded={expandedTicker === result.ticker}
                  onToggle={() => setExpandedTicker(expandedTicker === result.ticker ? null : result.ticker)}
                  thresholds={thresholds}
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

// -- Sortable header cell --

function SortHeader({
  label,
  sortKey: key,
  currentKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = currentKey === key;
  return (
    <button
      onClick={() => onSort(key)}
      className={`flex items-center gap-0.5 text-[10px] uppercase tracking-wider transition-colors cursor-pointer ${
        active ? "text-[#ec4899]" : "text-[#555] hover:text-[#a0a0a0]"
      }`}
    >
      {label}
      {active && (
        dir === "desc" ? <ArrowDown className="h-2.5 w-2.5" /> : <ArrowUp className="h-2.5 w-2.5" />
      )}
    </button>
  );
}

// -- Result Row Component --

function ResultRow({
  result,
  rank,
  expanded,
  onToggle,
  thresholds,
}: {
  result: ConfluenceResult;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
  thresholds: ConfluenceThresholds;
}) {
  const s = result.scores;
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);

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
                className={`h-full rounded-full ${SIGNAL_BAR_COLORS[result.signal]}`}
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
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-[#a0a0a0] truncate">{result.name}</span>
            {result.price != null && (
              <span className="text-[10px] text-[#555] shrink-0">${result.price.toFixed(2)}</span>
            )}
          </div>
          {/* Confluence bar — signal-colored */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-[#0f0f0f] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${SIGNAL_BAR_COLORS[result.signal]}`}
                style={{ width: `${Math.min(100, s.confluenceScore * 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-white w-7 text-right">
              {(s.confluenceScore * 100).toFixed(0)}
            </span>
          </div>
          {/* Pass dots */}
          <div className="flex items-center gap-1.5">
            <PassDots scores={s} thresholds={thresholds} />
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
          {/* "Why This Stock" summary */}
          <div className="mb-3 flex items-start gap-2 px-1">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#a0a0a0]">
                <span className="text-[#ec4899] font-medium">Why this stock: </span>
                {generateWhyThisStock(result)}
              </p>
            </div>
            {result.price != null && (
              <div className="shrink-0 text-right">
                <span className="text-sm font-bold text-white">${result.price.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* EW Panel */}
            <DetailPanel
              title="EW Scanner"
              color="#5ba3e6"
              available={!!result.ewResult}
              score={s.ewNormalized}
              expanded={expandedPanel === "ew"}
              onToggle={() => setExpandedPanel(expandedPanel === "ew" ? null : "ew")}
            >
              {result.ewResult && (
                <div className="space-y-1.5">
                  <DetailRow label="Enhanced Score" value={result.ewResult.enhancedScore.toFixed(1)} />
                  <DetailRow label="Normalized" value={`${(result.ewResult.enhancedNormalized * 100).toFixed(0)}%`} />
                  <DetailRow label="Confidence" value={result.ewResult.confidenceTier} highlight={result.ewResult.confidenceTier === "HIGH"} />
                  {result.ewResult.fibDepthLabel && <DetailRow label="Fib Level" value={result.ewResult.fibDepthLabel} />}
                  {result.ewResult.wavePosition && <DetailRow label="Wave" value={result.ewResult.wavePosition} />}
                  {expandedPanel === "ew" && (
                    <div className="pt-2 border-t border-[#2a2a2a] mt-2">
                      <div className="space-y-2">
                        <ScoreBar size="sm" label="Score" value={result.ewResult.enhancedScore} max={25} color="#5ba3e6" />
                        <ScoreBar size="sm" label="Normalized" value={result.ewResult.enhancedNormalized * 100} max={100} color="#5ba3e6" />
                      </div>
                      <ScannerLink scanner="ew" />
                    </div>
                  )}
                </div>
              )}
            </DetailPanel>

            {/* Squeeze Panel */}
            <DetailPanel
              title="Squeeze"
              color="#f59e0b"
              available={!!result.squeezeResult}
              score={s.squeezeNormalized}
              expanded={expandedPanel === "squeeze"}
              onToggle={() => setExpandedPanel(expandedPanel === "squeeze" ? null : "squeeze")}
            >
              {result.squeezeResult && (
                <div className="space-y-1.5">
                  <DetailRow label="Squeeze Score" value={`${result.squeezeResult.squeezeScore}/100`} />
                  <DetailRow label="Tier" value={result.squeezeResult.tier} highlight={result.squeezeResult.tier === "high"} />
                  {result.squeezeResult.shortPercentOfFloat != null && (
                    <DetailRow label="SI %" value={`${(result.squeezeResult.shortPercentOfFloat * (result.squeezeResult.shortPercentOfFloat < 1 ? 100 : 1)).toFixed(1)}%`} />
                  )}
                  {result.squeezeResult.shortRatio != null && (
                    <DetailRow label="Days to Cover" value={result.squeezeResult.shortRatio.toFixed(1)} />
                  )}
                  {expandedPanel === "squeeze" && (
                    <div className="pt-2 border-t border-[#2a2a2a] mt-2">
                      {result.squeezeResult.components ? (
                        <div className="space-y-2">
                          <ScoreBar size="sm" label="SI %" value={result.squeezeResult.components.siPercent} max={25} color="#ef4444" />
                          <ScoreBar size="sm" label="Days Cover" value={result.squeezeResult.components.daysTocover} max={15} color="#f97316" />
                          <ScoreBar size="sm" label="Float Size" value={result.squeezeResult.components.floatSize} max={15} color="#eab308" />
                          <ScoreBar size="sm" label="Vol Surge" value={result.squeezeResult.components.volumeSurge} max={15} color="#3b82f6" />
                          <ScoreBar size="sm" label="Near Low" value={result.squeezeResult.components.near52wLow} max={15} color="#a855f7" />
                          <ScoreBar size="sm" label="EW Align" value={result.squeezeResult.components.ewAlignment} max={15} color="#22c55e" />
                        </div>
                      ) : (
                        <ScoreBar size="sm" label="Score" value={result.squeezeResult.squeezeScore} max={100} color="#f59e0b" />
                      )}
                      <ScannerLink scanner="squeeze" />
                    </div>
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
              expanded={expandedPanel === "prerun"}
              onToggle={() => setExpandedPanel(expandedPanel === "prerun" ? null : "prerun")}
            >
              {result.prerunResult && (
                <div className="space-y-1.5">
                  <DetailRow label="Score" value={`${result.prerunResult.finalScore}/24`} />
                  <DetailRow label="Verdict" value={result.prerunResult.verdict} highlight={result.prerunResult.verdict === "PRIORITY"} />
                  {result.prerunResult.pctFromAth != null && (
                    <DetailRow label="% from ATH" value={`${result.prerunResult.pctFromAth.toFixed(0)}%`} />
                  )}
                  {result.prerunResult.shortFloat != null && (
                    <DetailRow label="Short Float" value={`${result.prerunResult.shortFloat.toFixed(1)}%`} />
                  )}
                  {result.prerunResult.daysToEarnings != null && (
                    <DetailRow label="Earnings In" value={`${result.prerunResult.daysToEarnings}d`} />
                  )}
                  {expandedPanel === "prerun" && (
                    <div className="pt-2 border-t border-[#2a2a2a] mt-2">
                      <div className="space-y-2">
                        <ScoreBar size="sm" label="Score" value={result.prerunResult.finalScore} max={24} color="#10b981" />
                      </div>
                      <ScannerLink scanner="prerun" />
                    </div>
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
              expanded={expandedPanel === "sector"}
              onToggle={() => setExpandedPanel(expandedPanel === "sector" ? null : "sector")}
            >
              {result.sectorResult ? (
                <div className="space-y-1.5">
                  <DetailRow label="Sector" value={result.sector} />
                  <DetailRow label="Composite" value={`${result.sectorResult.compositeScore}/100`} />
                  <DetailRow label="Quadrant" value={result.sectorResult.quadrant} highlight={result.sectorResult.quadrant === "LEADING"} />
                  <DetailRow label="Trend" value={result.sectorResult.trend} />
                  {expandedPanel === "sector" && (
                    <div className="pt-2 border-t border-[#2a2a2a] mt-2">
                      <div className="space-y-2">
                        <ScoreBar size="sm" label="Composite" value={result.sectorResult.compositeScore} max={100} color="#8b5cf6" />
                      </div>
                      <ScannerLink scanner="sector" />
                    </div>
                  )}
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
  expanded: panelExpanded,
  onToggle,
  children,
}: {
  title: string;
  color: string;
  available: boolean;
  score: number;
  expanded?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-3">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
        className="flex items-center justify-between mb-2 w-full group cursor-pointer"
      >
        <span
          className="text-[10px] uppercase tracking-wider font-medium group-hover:brightness-125 transition-all"
          style={{ color }}
        >
          {title}
          {available && (
            <ChevronRight
              className={`inline h-3 w-3 ml-0.5 transition-transform ${panelExpanded ? "rotate-90" : ""}`}
              style={{ color }}
            />
          )}
        </span>
        {available ? (
          <span className="text-xs font-bold text-white">
            {(score * 100).toFixed(0)}%
          </span>
        ) : (
          <span className="text-[10px] text-[#444]">N/A</span>
        )}
      </button>
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

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-[#666]">{label}</span>
      <span className={highlight ? "text-[#ec4899] font-semibold" : "text-white font-medium"}>{value}</span>
    </div>
  );
}

/** "View in Scanner" link rendered inside expanded panel. */
function ScannerLink({ scanner }: { scanner: string }) {
  const info = SCANNER_LINKS[scanner];
  if (!info) return null;
  return (
    <Link
      href={info.href}
      className="flex items-center gap-1 mt-3 text-[10px] text-[#666] hover:text-[#ec4899] transition-colors"
    >
      <ExternalLink className="h-3 w-3" />
      View in {info.label}
    </Link>
  );
}
