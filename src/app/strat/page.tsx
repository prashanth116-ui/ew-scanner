"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import {
  Search,
  Loader2,
  X,
  Save,
  Trash2,
  ArrowUpDown,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";
import type {
  StratResult,
  StratFilters,
  SavedStratScan,
  StratCombo,
  StratBarType,
  StratTimeframe,
  StratPMG,
} from "@/lib/strat/types";
import {
  DEFAULT_STRAT_FILTERS,
  STRAT_PRESETS,
  MAX_STRAT_SCORE,
} from "@/lib/strat/types";
import {
  saveStratScan,
  loadStratScans,
  deleteStratScan,
} from "@/lib/strat/storage";
import { getStratTickers } from "@/data/strat-universe";
import { ScannerCTA } from "@/components/scanner-cta";
import { useCollapsibleSections } from "@/lib/use-collapsible-sections";
import { useSidebarState } from "@/lib/use-sidebar-state";
import { SidebarShell } from "@/components/sidebar-shell";
import { SidebarSection } from "@/components/sidebar-section";
import { PresetList } from "@/components/preset-list";
import { ProgressBar } from "@/components/progress-bar";
import { ScoreBar } from "@/components/score-bar";
import { loadFromCache, saveToCache } from "@/lib/scan-cache";

const ACCENT = "#f97316"; // orange
const BATCH_SIZE = 10;
const BATCH_DELAY = 2000;

type SortKey = "score" | "tfc" | "combos" | "price";
type SortDir = "asc" | "desc";

// ── Bar type display helpers ──

function barTypeBg(bt: StratBarType): string {
  switch (bt) {
    case "1": return "bg-[#555]";
    case "2U": return "bg-green-500";
    case "2D": return "bg-red-500";
    case "3": return "bg-orange-500";
  }
}

function barTypeBorder(bt: StratBarType): string {
  switch (bt) {
    case "1": return "border-[#555]";
    case "2U": return "border-green-500/40";
    case "2D": return "border-red-500/40";
    case "3": return "border-orange-500/40";
  }
}

function signalColor(signal: string): string {
  switch (signal) {
    case "ACTIONABLE": return "text-green-400 border-green-500/30 bg-green-500/10";
    case "SETTING_UP": return "text-amber-400 border-amber-500/30 bg-amber-500/10";
    case "NEUTRAL": return "text-[#888] border-[#333] bg-[#1a1a1a]";
    case "CONFLICTED": return "text-red-400 border-red-500/30 bg-red-500/10";
    default: return "text-[#888] border-[#333] bg-[#1a1a1a]";
  }
}

function tfcDotColor(dir: string): string {
  switch (dir) {
    case "BULL": return "bg-green-400";
    case "BEAR": return "bg-red-400";
    default: return "bg-[#555]";
  }
}

// ── Page ──

export default function StratPageWrapper() {
  return (
    <>
      <Suspense fallback={null}>
        <StratPage />
      </Suspense>
      <ScannerCTA />
    </>
  );
}

function StratPage() {
  // Filters
  const [tfcAlignment, setTfcAlignment] = useState(DEFAULT_STRAT_FILTERS.tfcAlignment);
  const [activeCombo, setActiveCombo] = useState(DEFAULT_STRAT_FILTERS.activeCombo);
  const [comboTimeframe, setComboTimeframe] = useState(DEFAULT_STRAT_FILTERS.comboTimeframe);
  const [barTypeFilter, setBarTypeFilter] = useState(DEFAULT_STRAT_FILTERS.barTypeFilter);
  const [minScore, setMinScore] = useState(DEFAULT_STRAT_FILTERS.minScore);
  const [signalFilter, setSignalFilter] = useState(DEFAULT_STRAT_FILTERS.signalFilter);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [scannedCount, setScannedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [rawResults, setRawResults] = useState<StratResult[]>([]);
  const scanAbort = useRef<AbortController | null>(null);

  // Ticker search
  const [tickerSearch, setTickerSearch] = useState("");
  const [tickerSearching, setTickerSearching] = useState(false);
  const [tickerError, setTickerError] = useState<string | null>(null);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Sidebar collapse
  const [sidebarOpen, setSidebarOpen] = useSidebarState("strat");
  const { collapsed, toggleSection } = useCollapsibleSections(undefined, "strat");

  // Saved scans
  const [savedScans, setSavedScans] = useState<SavedStratScan[]>([]);
  const [saveName, setSaveName] = useState("");

  // Expanded rows
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Copy tickers
  const [copiedToast, setCopiedToast] = useState(false);

  // Load on mount
  useEffect(() => {
    setSavedScans(loadStratScans());
    const cached = loadFromCache<StratResult[]>("ew-strat-scan-v1", 30 * 60 * 1000);
    if (cached && cached.length > 0) {
      setRawResults(cached);
    }
  }, []);

  useEffect(() => {
    return () => { scanAbort.current?.abort(); };
  }, []);

  // Build filters
  const filters: StratFilters = useMemo(
    () => ({ tfcAlignment, activeCombo, comboTimeframe, barTypeFilter, minScore, signalFilter }),
    [tfcAlignment, activeCombo, comboTimeframe, barTypeFilter, minScore, signalFilter]
  );

  // Filter results
  const filtered = useMemo(() => {
    return rawResults.filter((r) => {
      if (filters.tfcAlignment !== "All" && r.tfc.alignment !== filters.tfcAlignment) return false;
      if (filters.signalFilter !== "All" && r.signal !== filters.signalFilter) return false;
      if (filters.minScore > 0 && r.scores.totalScore < filters.minScore) return false;

      if (filters.activeCombo !== "All") {
        const hasCombo = r.combos.some((c) => {
          if (filters.activeCombo === "2-1-2_REV") return c.name === "2-1-2U_REV" || c.name === "2-1-2D_REV";
          if (filters.activeCombo === "2-1-2_CONT") return c.name === "2-1-2U_CONT" || c.name === "2-1-2D_CONT";
          if (filters.activeCombo === "3-1-2") return c.name === "3-1-2U" || c.name === "3-1-2D";
          if (filters.activeCombo === "1-2-2_REV") return c.name === "1-2-2U_REV" || c.name === "1-2-2D_REV";
          if (filters.activeCombo === "3-2-2_REV") return c.name === "3-2-2U_REV" || c.name === "3-2-2D_REV";
          return false;
        });
        if (!hasCombo) return false;
      }

      if (filters.comboTimeframe !== "All") {
        if (filters.barTypeFilter !== "All") {
          // Filter by bar type in specific timeframe
          const tf = filters.comboTimeframe === "monthly" ? r.monthly : filters.comboTimeframe === "weekly" ? r.weekly : r.daily;
          if (!tf || tf.currentBarType !== filters.barTypeFilter) return false;
        } else {
          // Just filter by having combos in this timeframe
          if (filters.activeCombo !== "All") {
            const hasInTF = r.combos.some((c) => c.timeframe === filters.comboTimeframe);
            if (!hasInTF) return false;
          }
        }
      } else if (filters.barTypeFilter !== "All") {
        // Bar type filter on daily by default
        if (!r.daily || r.daily.currentBarType !== filters.barTypeFilter) return false;
      }

      return true;
    });
  }, [rawResults, filters]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "score":
          cmp = a.scores.totalScore - b.scores.totalScore;
          break;
        case "tfc":
          cmp = a.tfc.score - b.tfc.score;
          break;
        case "combos":
          cmp = a.combos.filter((c) => c.isActionable).length - b.combos.filter((c) => c.isActionable).length;
          break;
        case "price":
          cmp = (a.currentPrice ?? 0) - (b.currentPrice ?? 0);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const actionable = filtered.filter((r) => r.signal === "ACTIONABLE").length;
    const settingUp = filtered.filter((r) => r.signal === "SETTING_UP").length;
    const fullBull = filtered.filter((r) => r.tfc.alignment === "FULL_BULL").length;
    const fullBear = filtered.filter((r) => r.tfc.alignment === "FULL_BEAR").length;
    return { total: filtered.length, actionable, settingUp, fullBull, fullBear };
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

    const tickers = getStratTickers();
    setTotalCount(tickers.length);

    if (tickers.length === 0) {
      setScanning(false);
      return;
    }

    const results: StratResult[] = [];

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      if (signal.aborted) break;
      const batch = tickers.slice(i, i + BATCH_SIZE);
      setProgress(`Fetching ${Math.min(i + BATCH_SIZE, tickers.length)}/${tickers.length}...`);

      try {
        const res = await fetch("/api/strat/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickers: batch }),
          signal,
        });

        if (res.ok) {
          const data = (await res.json()) as { results: StratResult[] };
          if (data.results) results.push(...data.results);
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

    saveToCache("ew-strat-scan-v1", results);
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
    setTickerError(null);

    try {
      const res = await fetch(`/api/strat?ticker=${encodeURIComponent(ticker)}`);
      if (!res.ok) {
        setTickerError(`Could not find "${ticker}"`);
        setTickerSearching(false);
        return;
      }
      const data = (await res.json()) as StratResult;
      if (!data.ticker) {
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

  // Save / Load / Delete scans
  const handleSave = useCallback(() => {
    const name = saveName.trim() || `Strat ${new Date().toLocaleDateString()}`;
    saveStratScan(name, filters, filtered);
    setSavedScans(loadStratScans());
    setSaveName("");
  }, [saveName, filters, filtered]);

  const handleDelete = useCallback((id: string) => {
    if (!confirm("Delete this saved scan?")) return;
    deleteStratScan(id);
    setSavedScans(loadStratScans());
  }, []);

  const handleLoadScan = useCallback((scan: SavedStratScan) => {
    setTfcAlignment(scan.filters.tfcAlignment);
    setActiveCombo(scan.filters.activeCombo);
    setComboTimeframe(scan.filters.comboTimeframe);
    setBarTypeFilter(scan.filters.barTypeFilter);
    setMinScore(scan.filters.minScore);
    setSignalFilter(scan.filters.signalFilter);
    setRawResults(scan.results);
  }, []);

  // Presets
  const applyPreset = useCallback((preset: typeof STRAT_PRESETS[number]) => {
    const f = { ...DEFAULT_STRAT_FILTERS, ...preset.filters };
    setTfcAlignment(f.tfcAlignment);
    setActiveCombo(f.activeCombo);
    setComboTimeframe(f.comboTimeframe);
    setBarTypeFilter(f.barTypeFilter);
    setMinScore(f.minScore);
    setSignalFilter(f.signalFilter);
  }, []);

  const resetFilters = useCallback(() => {
    setTfcAlignment(DEFAULT_STRAT_FILTERS.tfcAlignment);
    setActiveCombo(DEFAULT_STRAT_FILTERS.activeCombo);
    setComboTimeframe(DEFAULT_STRAT_FILTERS.comboTimeframe);
    setBarTypeFilter(DEFAULT_STRAT_FILTERS.barTypeFilter);
    setMinScore(DEFAULT_STRAT_FILTERS.minScore);
    setSignalFilter(DEFAULT_STRAT_FILTERS.signalFilter);
  }, []);

  const copyTickers = useCallback(() => {
    const symbols = sorted.map((r) => r.ticker).join(", ");
    navigator.clipboard.writeText(symbols).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    });
  }, [sorted]);

  const universeTickers = useMemo(() => getStratTickers(), []);

  return (
    <div className="flex flex-col lg:flex-row gap-6 px-4 sm:px-6 py-6 max-w-[1600px] mx-auto">
      <SidebarShell open={sidebarOpen} onToggle={setSidebarOpen}>
        {/* Quick Presets */}
        <SidebarSection title="Quick Presets" sectionKey="presets" collapsed={collapsed.has("presets")} onToggle={toggleSection}>
          <PresetList presets={STRAT_PRESETS} onSelect={applyPreset} />
        </SidebarSection>

        {/* Filters */}
        <SidebarSection
          title={`Filters${minScore > 0 ? ` (${minScore}+ score)` : ""}`}
          sectionKey="filters"
          collapsed={collapsed.has("filters")}
          onToggle={toggleSection}
        >
          <div className="space-y-4">
            {/* TFC Alignment */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#a0a0a0]">TFC Alignment</span>
              </div>
              <select
                value={tfcAlignment}
                onChange={(e) => setTfcAlignment(e.target.value)}
                className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#f97316] focus:outline-none"
              >
                <option value="All">All</option>
                <option value="FULL_BULL">Full Bull</option>
                <option value="FULL_BEAR">Full Bear</option>
                <option value="MIXED">Mixed</option>
              </select>
            </div>

            {/* Active Combo */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#a0a0a0]">Active Combo</span>
              </div>
              <select
                value={activeCombo}
                onChange={(e) => setActiveCombo(e.target.value)}
                className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#f97316] focus:outline-none"
              >
                <option value="All">All</option>
                <option value="2-1-2_REV">2-1-2 Reversal</option>
                <option value="2-1-2_CONT">2-1-2 Continuation</option>
                <option value="3-1-2">3-1-2</option>
                <option value="1-2-2_REV">1-2-2 Reversal</option>
                <option value="3-2-2_REV">3-2-2 Reversal</option>
              </select>
            </div>

            {/* Combo Timeframe */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#a0a0a0]">Combo Timeframe</span>
              </div>
              <select
                value={comboTimeframe}
                onChange={(e) => setComboTimeframe(e.target.value)}
                className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#f97316] focus:outline-none"
              >
                <option value="All">All</option>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
              </select>
            </div>

            {/* Bar Type */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#a0a0a0]">Bar Type (Daily)</span>
              </div>
              <select
                value={barTypeFilter}
                onChange={(e) => setBarTypeFilter(e.target.value)}
                className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#f97316] focus:outline-none"
              >
                <option value="All">All</option>
                <option value="1">1 (Inside)</option>
                <option value="2U">2U (Up)</option>
                <option value="2D">2D (Down)</option>
                <option value="3">3 (Outside)</option>
              </select>
            </div>

            {/* Min Score */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#a0a0a0]">Min Score</span>
                <span className="text-white">{minScore === 0 ? "Any" : `${minScore}/${MAX_STRAT_SCORE}`}</span>
              </div>
              <input
                type="range"
                min={0}
                max={MAX_STRAT_SCORE}
                step={1}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-full accent-[#f97316]"
              />
            </div>

            {/* Signal */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#a0a0a0]">Signal</span>
              </div>
              <select
                value={signalFilter}
                onChange={(e) => setSignalFilter(e.target.value)}
                className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white focus:border-[#f97316] focus:outline-none"
              >
                <option value="All">All Signals</option>
                <option value="ACTIONABLE">Actionable</option>
                <option value="SETTING_UP">Setting Up</option>
                <option value="NEUTRAL">Neutral</option>
                <option value="CONFLICTED">Conflicted</option>
              </select>
            </div>

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
        <div className="flex gap-2">
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-colors"
            style={{ backgroundColor: ACCENT }}
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
                placeholder="e.g. AAPL, TSLA..."
                className="flex-1 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white placeholder-[#555] focus:border-[#f97316] focus:outline-none"
              />
              <button
                onClick={lookupTicker}
                disabled={tickerSearching || !tickerSearch.trim()}
                className="rounded-md px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                style={{ backgroundColor: ACCENT }}
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
            {filtered.length > 0 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Scan name..."
                  className="flex-1 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-[#f97316] focus:outline-none"
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                />
                <button
                  onClick={handleSave}
                  className="rounded-md border border-[#2a2a2a] px-2 py-1.5 text-[#a0a0a0] hover:text-[#f97316] hover:border-[#f97316]/30"
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
                  <p className="text-xs font-medium text-white truncate">{scan.name}</p>
                  <p className="text-[10px] text-[#666]">
                    {scan.resultCount} results &middot; {new Date(scan.savedAt).toLocaleDateString()}
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
              label={progress}
              color="bg-orange-500"
            />
          </div>
        )}

        {/* Summary bar */}
        {rawResults.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Results</p>
              <p className="text-lg font-bold text-white">
                {stats.total}
                <span className="text-xs font-normal text-[#666] ml-1">/ {rawResults.length}</span>
              </p>
            </div>
            <div className="rounded-lg border border-green-500/20 bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-green-400/60 mb-1">Actionable</p>
              <p className="text-lg font-bold text-green-400">{stats.actionable}</p>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-amber-400/60 mb-1">Setting Up</p>
              <p className="text-lg font-bold text-amber-400">{stats.settingUp}</p>
            </div>
            <div className="rounded-lg border border-green-500/20 bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-green-400/60 mb-1">Full Bull</p>
              <p className="text-lg font-bold text-green-400">{stats.fullBull}</p>
            </div>
            <div className="rounded-lg border border-red-500/20 bg-[#141414] px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-red-400/60 mb-1">Full Bear</p>
              <p className="text-lg font-bold text-red-400">{stats.fullBear}</p>
            </div>
          </div>
        )}

        {/* Sort + actions row */}
        {sorted.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#666]">Sort:</span>
              {([
                { key: "score" as SortKey, label: "Score" },
                { key: "tfc" as SortKey, label: "TFC" },
                { key: "combos" as SortKey, label: "Combos" },
                { key: "price" as SortKey, label: "Price" },
              ]).map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSort(s.key)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
                    sortKey === s.key
                      ? "bg-[#f97316]/10 text-[#f97316] border border-[#f97316]/30"
                      : "text-[#a0a0a0] hover:text-white border border-[#2a2a2a] hover:border-[#444]"
                  }`}
                >
                  {s.label}
                  {sortKey === s.key && <ArrowUpDown className="h-3 w-3" />}
                </button>
              ))}
            </div>
            <button
              onClick={copyTickers}
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
        )}

        {/* Results Table */}
        {sorted.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a] bg-[#141414]">
                  <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-[#666] w-8">#</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-[#666]">Ticker</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-wider text-[#666]">Price</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-medium uppercase tracking-wider text-[#666]">TFC</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-medium uppercase tracking-wider text-[#666]">M</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-medium uppercase tracking-wider text-[#666]">W</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-medium uppercase tracking-wider text-[#666]">D</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-[#666]">Combos</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-wider text-[#666]">Long</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-wider text-[#666]">Short</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-medium uppercase tracking-wider text-[#666]">Score</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-medium uppercase tracking-wider text-[#666]">Signal</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((result, idx) => (
                  <ResultRow
                    key={result.ticker}
                    result={result}
                    index={idx}
                    expanded={expandedTicker === result.ticker}
                    onToggle={() => setExpandedTicker(expandedTicker === result.ticker ? null : result.ticker)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : rawResults.length > 0 && !scanning ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#666]">
            <TrendingUp className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No stocks matched the current filters.</p>
            <p className="text-xs mt-1">Try adjusting TFC Alignment or lowering Min Score.</p>
          </div>
        ) : !scanning ? (
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-12 text-center">
            <TrendingUp className="mx-auto h-12 w-12 text-[#333]" />
            <h2 className="mt-4 text-lg font-semibold text-white">The Strat Scanner</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#a0a0a0]">
              Scan {universeTickers.length} stocks for Rob Smith&apos;s Strat setups.
              Classifies bars as 1/2U/2D/3, detects combos (2-1-2, 3-1-2, etc.),
              and measures timeframe continuity across Monthly/Weekly/Daily.
            </p>
            <div className="mx-auto mt-6 grid max-w-lg grid-cols-4 gap-3">
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#f97316]">{universeTickers.length}</p>
                <p className="text-[10px] text-[#666]">Stocks</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#f97316]">3</p>
                <p className="text-[10px] text-[#666]">Timeframes</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#f97316]">10</p>
                <p className="text-[10px] text-[#666]">Combo Types</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                <p className="text-2xl font-bold text-[#f97316]">0-10</p>
                <p className="text-[10px] text-[#666]">Score Range</p>
              </div>
            </div>
            <button
              onClick={runScan}
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

// ── Result Row ──

function ResultRow({
  result,
  index,
  expanded,
  onToggle,
}: {
  result: StratResult;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const actionableCombos = result.combos.filter((c) => c.isActionable);

  return (
    <>
      <tr
        className={`border-b border-[#1a1a1a] hover:bg-[#1a1a1a] cursor-pointer transition-colors ${expanded ? "bg-[#1a1a1a]" : ""}`}
        onClick={onToggle}
      >
        {/* # */}
        <td className="px-3 py-2.5 text-[#666]">
          <div className="flex items-center gap-1">
            {expanded ? <ChevronDown className="h-3 w-3 text-[#f97316]" /> : <ChevronRight className="h-3 w-3" />}
            <span className="text-xs">{index + 1}</span>
          </div>
        </td>

        {/* Ticker */}
        <td className="px-3 py-2.5">
          <span className="font-medium text-white">{result.ticker}</span>
          <span className="text-[10px] text-[#666] ml-2 hidden sm:inline">{result.companyName}</span>
        </td>

        {/* Price */}
        <td className="px-3 py-2.5 text-right text-[#ccc]">
          {result.currentPrice != null ? `$${result.currentPrice.toFixed(2)}` : "—"}
        </td>

        {/* TFC dots */}
        <td className="px-3 py-2.5">
          <div className="flex items-center justify-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${tfcDotColor(result.tfc.monthly)}`} title={`M: ${result.tfc.monthly}`} />
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${tfcDotColor(result.tfc.weekly)}`} title={`W: ${result.tfc.weekly}`} />
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${tfcDotColor(result.tfc.daily)}`} title={`D: ${result.tfc.daily}`} />
          </div>
        </td>

        {/* M bar type */}
        <td className="px-3 py-2.5 text-center">
          <BarTypeBadge barType={result.monthly?.currentBarType ?? null} />
        </td>

        {/* W bar type */}
        <td className="px-3 py-2.5 text-center">
          <BarTypeBadge barType={result.weekly?.currentBarType ?? null} />
        </td>

        {/* D bar type */}
        <td className="px-3 py-2.5 text-center">
          <BarTypeBadge barType={result.daily?.currentBarType ?? null} />
        </td>

        {/* Combos */}
        <td className="px-3 py-2.5">
          {actionableCombos.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {actionableCombos.slice(0, 3).map((c, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    c.direction === "BULL"
                      ? "text-green-400 bg-green-500/10"
                      : "text-red-400 bg-red-500/10"
                  }`}
                >
                  {c.direction === "BULL" ? "\u2191" : "\u2193"} {c.name.replace(/_/g, " ")}
                </span>
              ))}
              {actionableCombos.length > 3 && (
                <span className="text-[10px] text-[#666]">+{actionableCombos.length - 3}</span>
              )}
            </div>
          ) : result.combos.length > 0 ? (
            <span className="text-[10px] text-[#666] italic">forming...</span>
          ) : (
            <span className="text-[10px] text-[#444]">—</span>
          )}
        </td>

        {/* Long trigger */}
        <td className="px-3 py-2.5 text-right">
          {result.triggers.longTrigger != null ? (
            <span className="text-green-400 text-xs" title={result.triggers.longSource}>
              ${result.triggers.longTrigger.toFixed(2)}
            </span>
          ) : (
            <span className="text-[#444]">—</span>
          )}
        </td>

        {/* Short trigger */}
        <td className="px-3 py-2.5 text-right">
          {result.triggers.shortTrigger != null ? (
            <span className="text-red-400 text-xs" title={result.triggers.shortSource}>
              ${result.triggers.shortTrigger.toFixed(2)}
            </span>
          ) : (
            <span className="text-[#444]">—</span>
          )}
        </td>

        {/* Score */}
        <td className="px-3 py-2.5">
          <div className="flex items-center justify-center">
            <div className="w-16">
              <ScoreBar
                label=""
                value={result.scores.totalScore}
                max={MAX_STRAT_SCORE}
                color="#f97316"
                size="sm"
              />
            </div>
          </div>
        </td>

        {/* Signal */}
        <td className="px-3 py-2.5 text-center">
          <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium border ${signalColor(result.signal)}`}>
            {result.signal}
          </span>
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr>
          <td colSpan={12} className="bg-[#111] border-b border-[#2a2a2a] px-6 py-4">
            <ExpandedDetail result={result} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Bar Type Badge ──

function BarTypeBadge({ barType }: { barType: StratBarType | null }) {
  if (!barType) return <span className="text-[#444]">—</span>;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold border ${barTypeBg(barType)} ${barTypeBorder(barType)} text-white`}>
      {barType}
    </span>
  );
}

// ── Expanded Detail ──

function ExpandedDetail({ result }: { result: StratResult }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* All Combos */}
      <div>
        <h4 className="text-xs font-medium text-[#888] mb-2 uppercase tracking-wider">Combos ({result.combos.length})</h4>
        {result.combos.length > 0 ? (
          <div className="space-y-1.5">
            {result.combos.map((combo, i) => (
              <div key={i} className={`rounded border px-2.5 py-1.5 ${combo.isActionable ? "border-[#2a2a2a]" : "border-[#1a1a1a]"}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${combo.direction === "BULL" ? "text-green-400" : "text-red-400"}`}>
                    {combo.direction === "BULL" ? "\u2191" : "\u2193"}
                  </span>
                  <span className="text-xs text-white">{combo.description}</span>
                  <span className="text-[10px] text-[#666]">({combo.timeframe})</span>
                  {!combo.isActionable && <span className="text-[10px] text-amber-400 italic">forming</span>}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-[#666]">Pattern:</span>
                  <div className="flex gap-0.5">
                    {combo.barSequence.map((bt, j) => (
                      <span key={j} className={`inline-block rounded px-1 py-0 text-[9px] font-bold ${barTypeBg(bt)} text-white`}>
                        {bt}
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-[#666] ml-2">
                    H: ${combo.triggerHigh.toFixed(2)} / L: ${combo.triggerLow.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#555]">No combos detected</p>
        )}
      </div>

      {/* Per-Timeframe Bars */}
      <div>
        <h4 className="text-xs font-medium text-[#888] mb-2 uppercase tracking-wider">Last 5 Bars</h4>
        <div className="space-y-3">
          {(["monthly", "weekly", "daily"] as const).map((tf) => {
            const data: StratTimeframe | null = result[tf];
            if (!data) return (
              <div key={tf}>
                <p className="text-[10px] text-[#666] uppercase mb-1">{tf}</p>
                <p className="text-[10px] text-[#444]">No data</p>
              </div>
            );
            const last5 = data.bars.slice(-5);
            return (
              <div key={tf}>
                <p className="text-[10px] text-[#666] uppercase mb-1">{tf}</p>
                <div className="flex gap-1">
                  {last5.map((bar, i) => (
                    <div key={i} className={`rounded border px-1.5 py-1 text-center ${barTypeBorder(bar.barType)}`}>
                      <span className={`block text-[10px] font-bold ${barTypeBg(bar.barType)} text-white rounded px-1`}>
                        {bar.barType}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Score Breakdown + PMGs */}
      <div>
        <h4 className="text-xs font-medium text-[#888] mb-2 uppercase tracking-wider">Score Breakdown</h4>
        <div className="space-y-1.5">
          <ScoreBar label="TFC" value={result.scores.tfcScore} max={3} color="#f97316" size="sm" />
          <ScoreBar label="Combo" value={result.scores.comboScore} max={5} color="#f97316" size="sm" />
          <ScoreBar label="Action" value={result.scores.actionabilityScore} max={2} color="#f97316" size="sm" />
          <div className="border-t border-[#222] pt-1.5 mt-1.5">
            <ScoreBar label="Total" value={result.scores.totalScore} max={MAX_STRAT_SCORE} color="#f97316" size="sm" />
          </div>
        </div>

        {/* PMGs */}
        {result.pmgs.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-medium text-[#888] mb-2 uppercase tracking-wider">PMG Levels</h4>
            <div className="space-y-1">
              {result.pmgs.map((pmg, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={pmg.side === "HIGH" ? "text-green-400" : "text-red-400"}>
                    {pmg.side}
                  </span>
                  <span className="text-white">${pmg.level.toFixed(2)}</span>
                  <span className="text-[#666]">{pmg.testCount}x ({pmg.timeframe})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trigger sources */}
        {(result.triggers.longSource || result.triggers.shortSource) && (
          <div className="mt-4">
            <h4 className="text-xs font-medium text-[#888] mb-2 uppercase tracking-wider">Trigger Sources</h4>
            <div className="space-y-1 text-xs">
              {result.triggers.longSource && (
                <div className="flex items-center gap-2">
                  <span className="text-green-400">LONG:</span>
                  <span className="text-[#ccc]">{result.triggers.longSource}</span>
                </div>
              )}
              {result.triggers.shortSource && (
                <div className="flex items-center gap-2">
                  <span className="text-red-400">SHORT:</span>
                  <span className="text-[#ccc]">{result.triggers.shortSource}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
