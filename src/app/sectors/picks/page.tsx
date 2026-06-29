"use client";

import { useMemo, useCallback } from "react";
import { Loader2, RefreshCw, AlertTriangle, X } from "lucide-react";
import { DataAgeBadge } from "@/components/data-age-badge";
import { ScannerCTA } from "@/components/scanner-cta";
import { getEquitySectors, getSubSectors, getCrossAssetETFs } from "@/data/sector-universe";
import {
  useCollapsedPanels,
  CollapsiblePanel,
  RotationEntrySignals,
  StockPicksPanel,
  PullbackWatchPanel,
  SectorDetail,
  TopPicksBySector,
  FilterRecipes,
  SectorNav,
  LOADING_PHASES,
} from "../_components";
import { useSectorData } from "../_use-sector-data";
import { useScanRefresh } from "../_use-scan-refresh";

const ETF_COUNT = getEquitySectors().length + getSubSectors().length + getCrossAssetETFs().length;

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
    setScanResults,
    setScanResultsDate,
  } = useSectorData();

  const handleScanComplete = useCallback((results: Parameters<typeof setScanResults>[0], date: string) => {
    setScanResults(results);
    setScanResultsDate(date);
  }, [setScanResults, setScanResultsDate]);

  const { scanning: scanRefreshing, progress: scanProgress, scannedCount, totalCount, refreshScan, cancelScan } = useScanRefresh(scanResultsDate, handleScanComplete);

  const [collapsedPanels, togglePanel] = useCollapsedPanels(PICKS_COLLAPSED_KEY);

  const rotationPerfMap = useMemo(() => {
    if (!rotationData?.activeRotations) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const rot of rotationData.activeRotations) {
      for (const s of rot.stocks) map.set(s.symbol, s.performancePct);
    }
    return map;
  }, [rotationData]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5ba3e6]" />
        <p className="mt-4 text-[#888]">{LOADING_PHASES[loadingPhase]}...</p>
        <p className="mt-1 text-xs text-[#555]">{ETF_COUNT} ETFs + ~1,600 stock quotes</p>
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Stock Picks</h1>
            <SectorNav active="picks" />
          </div>
          <div className="mt-1 flex items-center gap-3">
            <DataAgeBadge calculatedAt={data.calculatedAt} warnAfterMin={20} />
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
      {!rotationData && rotationFetchFailed && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-xs text-red-400">
          Rotation tracker unavailable — entry signals could not be loaded. Will retry automatically.
        </div>
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
          return <span className="text-[10px] font-normal text-[#555]">Scan: {Math.floor(ageHours)}h ago</span>;
        })() : <span className="text-[10px] font-normal text-[#555]">No scan data</span>}
        actions={
          <div className="flex items-center gap-2">
            {scanRefreshing ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#2a2a2a]">
                    <div
                      className="h-full rounded-full bg-[#5ba3e6] transition-all duration-300"
                      style={{ width: totalCount > 0 ? `${(scannedCount / totalCount) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="text-[10px] text-[#888] tabular-nums">{scanProgress}</span>
                </div>
                <button
                  onClick={cancelScan}
                  className="flex items-center gap-1 rounded-md border border-[#333] px-2 py-1 text-[10px] text-[#888] hover:bg-[#1a1a1a] hover:text-white"
                >
                  <X className="h-3 w-3" /> Cancel
                </button>
              </>
            ) : (
              <button
                onClick={refreshScan}
                className="flex items-center gap-1 rounded-md border border-[#333] px-2 py-1 text-[10px] text-[#888] hover:bg-[#1a1a1a] hover:text-white"
              >
                <RefreshCw className="h-3 w-3" /> Refresh Scan
              </button>
            )}
          </div>
        }
      >
        <TopPicksBySector stocks={data.enrichedStocks?.passed ?? []} sectors={data.sectors} scanResultsDate={scanResultsDate} />
      </CollapsiblePanel>

      {/* Stock Picks */}
      {data.enrichedStocks && data.enrichedStocks.passed.length > 0 && (
        <StockPicksPanel stocks={data.enrichedStocks.passed} collapsed={collapsedPanels.has("stock-picks")} onToggle={togglePanel} rotationPerfMap={rotationPerfMap} />
      )}

      {/* Pullback Watch */}
      {data.enrichedStocks && data.enrichedStocks.pullbackWatch && data.enrichedStocks.pullbackWatch.length > 0 && (
        <PullbackWatchPanel stocks={data.enrichedStocks.pullbackWatch} collapsed={collapsedPanels.has("pullback-watch")} onToggle={togglePanel} />
      )}

      {/* No scan data hint */}
      {scanResults.length === 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-4 py-2.5 text-xs text-[#888]">
          No Pre-Run scan data loaded. Run a <a href="/prerun" className="text-[#5ba3e6] hover:underline">Pre-Run scan</a> to see stock-level scores, verdicts, and earnings data in sector details below.
        </div>
      )}

      {/* Sector Details */}
      <CollapsiblePanel
        id="sector-details"
        title="Sector Details"
        collapsed={collapsedPanels.has("sector-details")}
        onToggle={togglePanel}
        badge={<span className="text-[10px] text-[#555]" title="6 factors: momentum, acceleration, Mansfield RS, CMF, breadth, smart money. Missing factors have weights redistributed.">% = missing data</span>}
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
              return <span className="text-[10px] text-[#555]">Scan: {Math.floor(ageHours)}h ago</span>;
            })()}
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
