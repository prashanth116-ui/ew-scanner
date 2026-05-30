"use client";

import { useState, useCallback, useEffect, useMemo, Suspense } from "react";
import {
  Loader2,
  Flame,
  TrendingUp,
  Eye,
  EyeOff,
  AlertTriangle,
  Calendar,
  ArrowUpDown,
  RefreshCw,
} from "lucide-react";
import type {
  CatalystScanResponse,
  CatalystResult,
  CatalystVerdict,
  MissCategory,
  CatalystCalendarEvent,
} from "@/lib/catalyst/types";
import type { CatalystLayer } from "@/data/catalyst-universe";
import { LAYER_LABELS } from "@/data/catalyst-universe";
import {
  loadCatalystScanCache,
  saveCatalystScanCache,
  getCatalystCacheAge,
  loadCatalystOverrides,
  addCatalystOverride,
  removeCatalystOverride,
} from "@/lib/catalyst/storage";
import { ScannerCTA } from "@/components/scanner-cta";
import { useCollapsibleSections } from "@/lib/use-collapsible-sections";
import { useSidebarState } from "@/lib/use-sidebar-state";
import { SidebarShell } from "@/components/sidebar-shell";
import { SidebarSection } from "@/components/sidebar-section";

const ALL_LAYERS: CatalystLayer[] = [
  "ai-chips", "ai-servers", "ai-networking", "ai-optics",
  "ai-power", "ai-builders", "ai-software", "semi-equipment",
  "commodities", "defense-ai", "robotics",
];

const MISS_TABS: { key: MissCategory; label: string }[] = [
  { key: "already_moved", label: "Already Moved" },
  { key: "post_spike", label: "Post-Spike" },
  { key: "wrong_sector", label: "Wrong Sector" },
  { key: "wrong_pattern", label: "Wrong Pattern" },
  { key: "too_early", label: "Too Early" },
];

type SortKey = "totalScore" | "symbol" | "change5d" | "ytdChange" | "shortPercentFloat" | "volumeRatio5d20d";

export default function CatalystPageWrapper() {
  return (
    <>
      <Suspense fallback={null}>
        <CatalystPage />
      </Suspense>
      <ScannerCTA />
    </>
  );
}

function CatalystPage() {
  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scanData, setScanData] = useState<CatalystScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedLayers, setSelectedLayers] = useState<Set<CatalystLayer>>(new Set());
  const [selectedTiers, setSelectedTiers] = useState<Set<number>>(new Set());
  const [minScore, setMinScore] = useState(0);
  const [verdictFilter, setVerdictFilter] = useState<CatalystVerdict | "ALL">("ALL");
  const [showMisses, setShowMisses] = useState(false);
  const [activeMissTab, setActiveMissTab] = useState<MissCategory>("already_moved");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("totalScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Overrides
  const [overrides, setOverrides] = useState<Set<string>>(new Set());

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useSidebarState("catalyst");
  const { isCollapsed, toggleSection } = useCollapsibleSections(["advanced"], "catalyst");

  // Load cached results and overrides on mount
  useEffect(() => {
    const cached = loadCatalystScanCache();
    if (cached) setScanData(cached);
    setOverrides(loadCatalystOverrides());
  }, []);

  // Scan handler
  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (selectedLayers.size > 0) body.layers = [...selectedLayers];
      if (selectedTiers.size > 0) body.tiers = [...selectedTiers];

      const res = await fetch("/api/catalyst/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error ?? `Scan failed (${res.status})`);
      }

      const data = (await res.json()) as CatalystScanResponse;
      setScanData(data);
      saveCatalystScanCache(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }, [selectedLayers, selectedTiers]);

  // Handle override toggle
  const handleOverride = useCallback((symbol: string) => {
    setOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
        removeCatalystOverride(symbol);
      } else {
        next.add(symbol);
        addCatalystOverride(symbol);
      }
      return next;
    });
  }, []);

  // Toggle sort
  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("desc");
      return key;
    });
  }, []);

  // Toggle layer filter
  const toggleLayer = useCallback((layer: CatalystLayer) => {
    setSelectedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  // Toggle tier filter
  const toggleTier = useCallback((tier: number) => {
    setSelectedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }, []);

  // Filter + sort results
  const filteredResults = useMemo(() => {
    if (!scanData) return { prespike: [], watch: [], monitor: [] };

    const filterFn = (r: CatalystResult) => {
      if (selectedLayers.size > 0 && !selectedLayers.has(r.layer)) return false;
      if (selectedTiers.size > 0 && !selectedTiers.has(r.tier)) return false;
      if (r.totalScore < minScore) return false;
      return true;
    };

    const sortFn = (a: CatalystResult, b: CatalystResult) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const numA = typeof aVal === "number" ? aVal : 0;
      const numB = typeof bVal === "number" ? bVal : 0;
      return sortDir === "asc" ? numA - numB : numB - numA;
    };

    return {
      prespike: scanData.prespike.filter(filterFn).sort(sortFn),
      watch: scanData.watch.filter(filterFn).sort(sortFn),
      monitor: scanData.monitor.filter(filterFn).sort(sortFn),
    };
  }, [scanData, selectedLayers, selectedTiers, minScore, sortKey, sortDir]);

  // Miss results (filtered by active tab)
  const missResults = useMemo(() => {
    if (!scanData) return [];
    const bucket = scanData.misses[activeMissTab] ?? [];
    return bucket.filter((r) => {
      if (selectedLayers.size > 0 && !selectedLayers.has(r.layer)) return false;
      if (selectedTiers.size > 0 && !selectedTiers.has(r.tier)) return false;
      return true;
    });
  }, [scanData, activeMissTab, selectedLayers, selectedTiers]);

  const cacheAge = getCatalystCacheAge();
  const cacheMinutes = cacheAge !== null ? Math.round(cacheAge / 60_000) : null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      {/* Calendar Ribbon */}
      {scanData?.calendar && scanData.calendar.length > 0 && (
        <CalendarRibbon events={scanData.calendar} />
      )}

      <div className="mt-4 flex gap-6">
        {/* Sidebar */}
        <SidebarShell open={sidebarOpen} onToggle={setSidebarOpen}>
          <SidebarSection
            title="Layers"
            sectionKey="layers"
            collapsed={isCollapsed("layers")}
            onToggle={toggleSection}
          >
            <div className="space-y-1.5">
              {ALL_LAYERS.map((layer) => (
                <label key={layer} className="flex items-center gap-2 text-xs text-[#ccc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedLayers.has(layer)}
                    onChange={() => toggleLayer(layer)}
                    className="rounded border-[#444] bg-[#222] accent-[#5ba3e6]"
                  />
                  {LAYER_LABELS[layer]}
                </label>
              ))}
              {selectedLayers.size > 0 && (
                <button
                  onClick={() => setSelectedLayers(new Set())}
                  className="mt-1 text-xs text-[#5ba3e6] hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
          </SidebarSection>

          <SidebarSection
            title="Tier"
            sectionKey="tier"
            collapsed={isCollapsed("tier")}
            onToggle={toggleSection}
          >
            <div className="flex gap-2">
              {[1, 2, 3].map((tier) => (
                <button
                  key={tier}
                  onClick={() => toggleTier(tier)}
                  className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                    selectedTiers.has(tier)
                      ? "border-[#5ba3e6] bg-[#5ba3e6]/20 text-[#5ba3e6]"
                      : "border-[#333] text-[#a0a0a0] hover:border-[#555]"
                  }`}
                >
                  Tier {tier}
                </button>
              ))}
            </div>
          </SidebarSection>

          <SidebarSection
            title="Filters"
            sectionKey="filters"
            collapsed={isCollapsed("filters")}
            onToggle={toggleSection}
          >
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#888]">
                  Min Score: {minScore}
                </label>
                <input
                  type="range"
                  min={0}
                  max={85}
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-full accent-[#5ba3e6]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#888]">Verdict</label>
                <div className="flex flex-wrap gap-1.5">
                  {(["ALL", "PRE_SPIKE", "WATCH", "MONITOR"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVerdictFilter(v)}
                      className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                        verdictFilter === v
                          ? "border-[#5ba3e6] bg-[#5ba3e6]/20 text-[#5ba3e6]"
                          : "border-[#333] text-[#a0a0a0] hover:border-[#555]"
                      }`}
                    >
                      {v === "ALL" ? "All" : v.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs text-[#ccc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showMisses}
                    onChange={() => setShowMisses(!showMisses)}
                    className="rounded border-[#444] bg-[#222] accent-[#5ba3e6]"
                  />
                  Show Misses
                </label>
              </div>
            </div>
          </SidebarSection>
        </SidebarShell>

        {/* Main Content */}
        <main className="min-w-0 flex-1">
          {/* Header + Scan Button */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-white">Catalyst Scanner</h1>
              <p className="text-xs text-[#888]">
                AI infrastructure spike detector — 13-factor scoring across 60 tickers
                {cacheMinutes !== null && ` (cached ${cacheMinutes}m ago)`}
              </p>
            </div>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-2 rounded-lg border border-[#5ba3e6] bg-[#5ba3e6]/10 px-4 py-2 text-sm font-medium text-[#5ba3e6] transition-colors hover:bg-[#5ba3e6]/20 disabled:opacity-50"
            >
              {scanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {scanning ? "Scanning..." : "Run Scan"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* No data */}
          {!scanData && !scanning && (
            <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-6 py-12 text-center">
              <Flame className="mx-auto mb-3 h-8 w-8 text-[#555]" />
              <p className="text-sm text-[#888]">
                Click &quot;Run Scan&quot; to analyze the catalyst universe
              </p>
            </div>
          )}

          {/* Results */}
          {scanData && !showMisses && (
            <div className="space-y-6">
              {/* Sort Controls */}
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-3.5 w-3.5 text-[#666]" />
                <span className="text-xs text-[#666]">Sort:</span>
                {(
                  [
                    ["totalScore", "Score"],
                    ["symbol", "Symbol"],
                    ["change5d", "5d %"],
                    ["ytdChange", "YTD %"],
                    ["shortPercentFloat", "SI %"],
                    ["volumeRatio5d20d", "Vol Ratio"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => toggleSort(key)}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      sortKey === key
                        ? "bg-[#5ba3e6]/20 text-[#5ba3e6]"
                        : "text-[#888] hover:text-white"
                    }`}
                  >
                    {label}
                    {sortKey === key && (sortDir === "desc" ? " \u2193" : " \u2191")}
                  </button>
                ))}
              </div>

              {/* PRE_SPIKE */}
              {(verdictFilter === "ALL" || verdictFilter === "PRE_SPIKE") &&
                filteredResults.prespike.length > 0 && (
                  <ResultSection
                    title="PRE-SPIKE"
                    results={filteredResults.prespike}
                    borderColor="border-green-500/40"
                    titleColor="text-green-400"
                    icon={<Flame className="h-4 w-4 text-green-400" />}
                  />
                )}

              {/* WATCH */}
              {(verdictFilter === "ALL" || verdictFilter === "WATCH") &&
                filteredResults.watch.length > 0 && (
                  <ResultSection
                    title="WATCH"
                    results={filteredResults.watch}
                    borderColor="border-amber-500/40"
                    titleColor="text-amber-400"
                    icon={<Eye className="h-4 w-4 text-amber-400" />}
                  />
                )}

              {/* MONITOR */}
              {(verdictFilter === "ALL" || verdictFilter === "MONITOR") &&
                filteredResults.monitor.length > 0 && (
                  <ResultSection
                    title="MONITOR"
                    results={filteredResults.monitor}
                    borderColor="border-[#2a2a2a]"
                    titleColor="text-[#888]"
                    icon={<EyeOff className="h-4 w-4 text-[#666]" />}
                    dimmed
                  />
                )}

              {/* Empty state */}
              {filteredResults.prespike.length === 0 &&
                filteredResults.watch.length === 0 &&
                filteredResults.monitor.length === 0 && (
                  <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-6 py-8 text-center text-sm text-[#888]">
                    No results match current filters
                  </div>
                )}
            </div>
          )}

          {/* Miss View */}
          {scanData && showMisses && (
            <div>
              {/* Miss tabs */}
              <div className="mb-4 flex gap-1 overflow-x-auto">
                {MISS_TABS.map((tab) => {
                  const count = scanData.misses[tab.key]?.length ?? 0;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveMissTab(tab.key)}
                      className={`whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        activeMissTab === tab.key
                          ? "border-[#5ba3e6] bg-[#5ba3e6]/20 text-[#5ba3e6]"
                          : "border-[#333] text-[#a0a0a0] hover:border-[#555]"
                      }`}
                    >
                      {tab.label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Miss table */}
              {missResults.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#2a2a2a] bg-[#141414] text-left text-[#888]">
                        <th className="px-3 py-2 font-medium">Ticker</th>
                        <th className="px-3 py-2 font-medium">Price</th>
                        <th className="px-3 py-2 font-medium">YTD %</th>
                        <th className="px-3 py-2 font-medium">Layer</th>
                        <th className="px-3 py-2 font-medium">Score</th>
                        <th className="px-3 py-2 font-medium">Miss Reason</th>
                        <th className="px-3 py-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missResults.map((r) => (
                        <tr
                          key={r.symbol}
                          className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors"
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium text-white">{r.symbol}</div>
                            <div className="text-[#666]">{r.name}</div>
                          </td>
                          <td className="px-3 py-2 text-[#ccc]">${r.price.toFixed(2)}</td>
                          <td className={`px-3 py-2 ${r.ytdChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {r.ytdChange >= 0 ? "+" : ""}
                            {r.ytdChange.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-[#2a2a2a] px-2 py-0.5 text-[#a0a0a0]">
                              {r.layerLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[#ccc]">{r.totalScore.toFixed(0)}</td>
                          <td className="max-w-xs px-3 py-2 text-[#888]">{r.missReason}</td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => handleOverride(r.symbol)}
                              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                                overrides.has(r.symbol)
                                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                  : "border-[#333] text-[#666] hover:border-[#555] hover:text-[#ccc]"
                              }`}
                            >
                              {overrides.has(r.symbol) ? "Watching" : "Override"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-6 py-8 text-center text-sm text-[#888]">
                  No misses in this category
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Sub-Components ──

function CalendarRibbon({ events }: { events: CatalystCalendarEvent[] }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2">
      <Calendar className="h-4 w-4 shrink-0 text-[#666]" />
      <span className="shrink-0 text-xs font-medium text-[#888]">Upcoming:</span>
      {events.slice(0, 8).map((e, i) => (
        <div
          key={`${e.date}-${e.label}-${i}`}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#141414] px-2 py-1"
        >
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              e.daysAway === 0
                ? "bg-red-500/20 text-red-400"
                : e.daysAway <= 3
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-[#2a2a2a] text-[#a0a0a0]"
            }`}
          >
            {e.daysAway === 0 ? "TODAY" : `${e.daysAway}d`}
          </span>
          <span className="text-xs text-[#ccc]">{e.label}</span>
        </div>
      ))}
    </div>
  );
}

function ResultSection({
  title,
  results,
  borderColor,
  titleColor,
  icon,
  dimmed,
}: {
  title: string;
  results: CatalystResult[];
  borderColor: string;
  titleColor: string;
  icon: React.ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className={`text-sm font-bold ${titleColor}`}>
          {title} ({results.length})
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((r) => (
          <ResultCard key={r.symbol} result={r} borderColor={borderColor} dimmed={dimmed} />
        ))}
      </div>
    </div>
  );
}

function ResultCard({
  result: r,
  borderColor,
  dimmed,
}: {
  result: CatalystResult;
  borderColor: string;
  dimmed?: boolean;
}) {
  const scorePct = Math.min(100, (r.totalScore / 85) * 100);

  return (
    <div
      className={`rounded-lg border ${borderColor} bg-[#1a1a1a] p-4 transition-colors hover:bg-[#1f1f1f] ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{r.symbol}</span>
            {r.fireDrill && (
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                FIRE DRILL
              </span>
            )}
          </div>
          <div className="text-xs text-[#888]">{r.name}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-white">${r.price.toFixed(2)}</div>
          <div
            className={`text-xs ${r.change5d >= 0 ? "text-green-400" : "text-red-400"}`}
          >
            {r.change5d >= 0 ? "+" : ""}
            {r.change5d.toFixed(1)}% (5d)
          </div>
        </div>
      </div>

      {/* Layer + YTD */}
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full bg-[#2a2a2a] px-2 py-0.5 text-[10px] text-[#a0a0a0]">
          {r.layerLabel}
        </span>
        <span className={`text-xs ${r.ytdChange >= 0 ? "text-green-400" : "text-red-400"}`}>
          YTD {r.ytdChange >= 0 ? "+" : ""}
          {r.ytdChange.toFixed(1)}%
        </span>
      </div>

      {/* Score Bar */}
      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-[#888]">Score</span>
          <span className="font-medium text-white">{r.totalScore.toFixed(0)}/100</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[#2a2a2a]">
          <div
            className={`h-1.5 rounded-full transition-all ${
              scorePct >= 80
                ? "bg-green-500"
                : scorePct >= 65
                  ? "bg-amber-500"
                  : "bg-red-500"
            }`}
            style={{ width: `${scorePct}%` }}
          />
        </div>
      </div>

      {/* Score Factor Dots */}
      <div className="mb-2 flex gap-0.5">
        {Object.entries(r.scores).map(([key, val]) => {
          const maxes: Record<string, number> = {
            daysToCatalyst: 12,
            meanReversion: 8,
            momentumBreakout: 7,
            shortInterest: 10,
            analystUpside: 8,
            volumeRatio: 10,
            rsiPosition: 8,
            peerSpiked: 8,
            sectorEtfMomentum: 7,
            revenueAcceleration: 8,
            maPosition: 5,
            ivRank: 4,
            newsCluster: 5,
          };
          const max = maxes[key] ?? 1;
          const pct = max > 0 ? val / max : 0;
          const color =
            pct >= 0.75
              ? "bg-green-500"
              : pct >= 0.4
                ? "bg-amber-500"
                : pct > 0
                  ? "bg-red-500"
                  : "bg-[#333]";
          return (
            <div
              key={key}
              className={`h-1.5 w-1.5 rounded-full ${color}`}
              title={`${key}: ${val}/${max}`}
            />
          );
        })}
      </div>

      {/* Catalyst Countdown */}
      {r.nextCatalyst && (
        <div className="mb-2 flex items-center gap-1.5 text-xs">
          <Calendar className="h-3 w-3 text-[#666]" />
          <span className="text-[#888]">{r.nextCatalyst}</span>
          {r.nextCatalystDays !== undefined && (
            <span
              className={`rounded px-1 py-0.5 text-[10px] font-bold ${
                r.nextCatalystDays <= 3
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-[#2a2a2a] text-[#a0a0a0]"
              }`}
            >
              {r.nextCatalystDays}d
            </span>
          )}
        </div>
      )}

      {/* Peers that spiked */}
      {r.peersThatSpiked && r.peersThatSpiked.length > 0 && (
        <div className="mb-2 flex items-center gap-1.5 text-xs">
          <TrendingUp className="h-3 w-3 text-green-400" />
          <span className="text-green-400">
            Peers spiked: {r.peersThatSpiked.join(", ")}
          </span>
        </div>
      )}

      {/* Key Metrics Row */}
      <div className="flex gap-3 text-[10px] text-[#888]">
        {r.shortPercentFloat > 0 && (
          <span>SI: {r.shortPercentFloat.toFixed(1)}%</span>
        )}
        <span>Vol: {r.volumeRatio5d20d.toFixed(1)}x</span>
        <span>RSI: {r.rsi14.toFixed(0)}</span>
        {r.analystTarget > 0 && r.analystTarget !== r.price && (
          <span>
            Target: ${r.analystTarget.toFixed(0)} (
            {(((r.analystTarget - r.price) / r.price) * 100).toFixed(0)}%)
          </span>
        )}
      </div>
    </div>
  );
}
