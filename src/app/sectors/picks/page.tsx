"use client";

import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { DataAgeBadge } from "@/components/data-age-badge";
import { ScannerCTA } from "@/components/scanner-cta";
import {
  useCollapsedPanels,
  CollapsiblePanel,
  RotationEntrySignals,
  StockPicksPanel,
  PullbackWatchPanel,
  SectorDetail,
  TopPicksBySector,
  FilterRecipes,
  LOADING_PHASES,
} from "../_components";
import { useSectorData } from "../_use-sector-data";

const PICKS_COLLAPSED_KEY = "ew-sectors-picks-collapsed-v1";

export default function PicksPage() {
  const {
    data,
    loading,
    error,
    fetchData,
    scanResults,
    scanResultsDate,
    loadingPhase,
    loadingTimeout,
    setLoadingTimeout,
    rotationData,
    rotationFetchFailed,
    rotationSectorRS,
    stocksBySector,
    sortedSectors,
    comparisonMap,
  } = useSectorData();

  const [collapsedPanels, togglePanel] = useCollapsedPanels(PICKS_COLLAPSED_KEY);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5ba3e6]" />
        <p className="mt-4 text-[#888]">{LOADING_PHASES[loadingPhase]}...</p>
        <p className="mt-1 text-xs text-[#555]">13 ETFs + ~1,378 stock quotes</p>
        <div className="mt-2 flex justify-center gap-1.5">
          {LOADING_PHASES.map((_, i) => (
            <div key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i <= loadingPhase ? "bg-[#5ba3e6]" : "bg-[#333]"}`} />
          ))}
        </div>
        {loadingTimeout && (
          <div className="mt-6">
            <p className="text-xs text-amber-400">This is taking longer than expected.</p>
            <button onClick={() => { setLoadingTimeout(false); fetchData(true); }} className="mt-2 rounded-lg bg-[#5ba3e6] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a8fd4]">Retry</button>
          </div>
        )}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 text-center">
        <p className="text-red-400">Error: {error}</p>
        <button onClick={() => fetchData(true)} className="mt-4 rounded-lg bg-[#5ba3e6] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a8fd4]">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Stock Picks</h1>
          <div className="mt-1 flex items-center gap-3">
            <DataAgeBadge calculatedAt={data.calculatedAt} />
            <span className="text-xs text-[#555]">{new Date(data.calculatedAt).toLocaleString()}</span>
          </div>
        </div>
        <button onClick={() => fetchData(true)} disabled={loading} className="flex items-center gap-2 rounded-lg border border-[#333] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white disabled:opacity-50" aria-label="Refresh data">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Entry Signals */}
      {rotationData && data.enrichedStocks && (
        <RotationEntrySignals
          rotationData={rotationData}
          enrichedStocks={data.enrichedStocks.passed}
          sectors={data.sectors}
          collapsed={collapsedPanels.has("entry-signals")}
          onToggle={togglePanel}
        />
      )}

      {/* Top Picks by Sector */}
      <CollapsiblePanel
        id="top-picks-sector"
        title="Top Picks by Sector"
        collapsed={collapsedPanels.has("top-picks-sector")}
        onToggle={togglePanel}
        badge={scanResultsDate ? (() => {
          const ageHours = (Date.now() - new Date(scanResultsDate).getTime()) / (1000 * 60 * 60);
          if (ageHours > 24) return (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-normal text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Scan data is {Math.floor(ageHours / 24)}d old
            </span>
          );
          return null;
        })() : <span className="text-[10px] font-normal text-[#555]">No scan data</span>}
      >
        <TopPicksBySector stocks={data.enrichedStocks?.passed ?? []} sectors={data.sectors} scanResultsDate={scanResultsDate} />
      </CollapsiblePanel>

      {/* Stock Picks */}
      {data.enrichedStocks && data.enrichedStocks.passed.length > 0 && (
        <StockPicksPanel stocks={data.enrichedStocks.passed} collapsed={collapsedPanels.has("stock-picks")} onToggle={togglePanel} />
      )}

      {/* Pullback Watch */}
      {data.enrichedStocks && data.enrichedStocks.pullbackWatch && data.enrichedStocks.pullbackWatch.length > 0 && (
        <PullbackWatchPanel stocks={data.enrichedStocks.pullbackWatch} collapsed={collapsedPanels.has("pullback-watch")} onToggle={togglePanel} />
      )}

      {/* Sector Details */}
      <CollapsiblePanel
        id="sector-details"
        title="Sector Details"
        collapsed={collapsedPanels.has("sector-details")}
        onToggle={togglePanel}
        badge={<span className="text-[10px] text-[#555]" title="Data quality % shows how many of the 6 scoring factors have real data. Missing factors have their weights redistributed.">% = missing data</span>}
        actions={
          <div className="flex items-center gap-2">
            {scanResultsDate && (() => {
              const ageMs = Date.now() - new Date(scanResultsDate).getTime();
              const ageHours = ageMs / (1000 * 60 * 60);
              if (ageHours > 24) return (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  PreRun scan data is {Math.floor(ageHours / 24)}d old
                </span>
              );
              return null;
            })()}
            {scanResults.length === 0 && <span className="text-xs text-[#555]">Run a Pre-Run scan to see stock-level data</span>}
          </div>
        }
      >
        <div className="space-y-2">
          {sortedSectors.map((s) => (
            <SectorDetail key={s.sector} sector={s} stocks={stocksBySector.get(s.sector) ?? []} prevSnapshot={comparisonMap?.get(s.sector)} etfReturns={data.etfReturns20d?.[s.etf]} hasRotationData={rotationSectorRS.size > 0} rotationFetchFailed={rotationFetchFailed} />
          ))}
        </div>
      </CollapsiblePanel>

      {/* Filter Recipes */}
      <FilterRecipes />

      <ScannerCTA />
    </div>
  );
}
