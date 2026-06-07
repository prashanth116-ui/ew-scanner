"use client";

import { Loader2, RefreshCw, FileDown, ExternalLink } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { DataAgeBadge } from "@/components/data-age-badge";
import Link from "next/link";
import { ScannerCTA } from "@/components/scanner-cta";
import { compositeColor, compositeTextColor } from "@/lib/color-utils";
import {
  useCollapsedPanels,
  CollapsiblePanel,
  quadrantColor,
  RegimeBanner,
  CorrelationMatrix,
  SectorComparison,
  RRGChart,
  AlertPanel,
  StockSearch,
  TradingActionBadge,
  ComparisonDelta,
  EtfSparkline,
  SubSectorPanel,
  CrossAssetPanel,
  DataStalenessWarning,
  SORT_MODE_OPTIONS,
  LOADING_PHASES,
  type SortMode,
} from "./_components";
import { useSectorData } from "./_use-sector-data";

export default function SectorRotationPage() {
  const {
    data,
    loading,
    error,
    fetchData,
    sortMode,
    setSortMode,
    compareDate,
    setCompareDate,
    history,
    loadingPhase,
    loadingTimeout,
    setLoadingTimeout,
    sortedSectors,
    subSectorScores,
    crossAssetScores,
    comparisonMap,
    comparisonSummary,
    allStocks,
    handleExport,
    watchlistTickers,
  } = useSectorData();

  const [collapsedPanels, togglePanel] = useCollapsedPanels();

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5ba3e6]" />
        <p className="mt-4 text-[#888]">{LOADING_PHASES[loadingPhase]}...</p>
        <p className="mt-1 text-xs text-[#555]">23 ETFs + ~1,600 stock quotes</p>
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
            <h1 className="text-2xl font-bold text-white">Sector Rotation</h1>
            <Link href="/sectors/brief" className="rounded-md border border-[#333] px-2 py-1 text-[11px] text-[#888] hover:text-white hover:border-[#444] transition-colors">
              Daily Brief <ExternalLink className="h-3 w-3 inline ml-0.5" />
            </Link>
            <Link href="/sectors/picks" className="rounded-md border border-[#333] px-2 py-1 text-[11px] text-[#888] hover:text-white hover:border-[#444] transition-colors">
              Stock Picks <ExternalLink className="h-3 w-3 inline ml-0.5" />
            </Link>
            <Link href="/rotation" className="rounded-md border border-[#333] px-2 py-1 text-[11px] text-[#888] hover:text-white hover:border-[#444] transition-colors">
              Rotation Tracker <ExternalLink className="h-3 w-3 inline ml-0.5" />
            </Link>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <DataAgeBadge calculatedAt={data.calculatedAt} warnAfterMin={20} />
            <span className="text-xs text-[#555]">{new Date(data.calculatedAt).toLocaleString()}</span>
            {data.stockQuotes && <span className="text-xs text-[#555]">{Object.keys(data.stockQuotes).length} quotes{data.quotesAsOf ? ` as of ${new Date(data.quotesAsOf).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StockSearch allStocks={allStocks} />
          <AlertPanel sectors={data.sectors} data={data} />
          <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white" aria-label="Export to Excel">
            <FileDown className="h-4 w-4" /><span className="hidden sm:inline">Export</span>
          </button>
          <CopyButton tickers={watchlistTickers} className="flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white" />
          <button onClick={() => fetchData(true)} disabled={loading} className="flex items-center gap-2 rounded-lg border border-[#333] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white disabled:opacity-50" aria-label="Refresh data">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Regime Banner */}
      <CollapsiblePanel id="regime" title="Macro Regime" collapsed={collapsedPanels.has("regime")} onToggle={togglePanel}
        badge={data.regime ? <span className={`text-[10px] font-medium ${data.regime.regime === "RISK_ON" ? "text-green-400" : data.regime.regime === "RISK_OFF" ? "text-red-400" : data.regime.regime === "INFLATIONARY" ? "text-amber-400" : "text-[#888]"}`}>{data.regime.regime.replace("_", " ")}</span> : undefined}
      >
        <RegimeBanner regime={data.regime} />
      </CollapsiblePanel>

      {/* Rotation Status Banner */}
      <CollapsiblePanel id="rotation-status" title="Rotation Status" collapsed={collapsedPanels.has("rotation-status")} onToggle={togglePanel}
        badge={<span className={`text-[10px] font-medium ${data.rotationActive ? "text-green-400" : "text-[#888]"}`}>{data.rotationActive ? "Active" : "Inactive"}</span>}
      >
        <div className={`rounded-lg border p-4 ${data.rotationActive ? "border-green-500/30 bg-green-500/5" : "border-[#2a2a2a] bg-[#0f0f0f]"}`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${data.rotationActive ? "bg-green-500 animate-pulse" : "bg-[#555]"}`} />
              <div>
                <div className="font-semibold text-white">{data.rotationActive ? "Rotation Active" : "No Clear Rotation"}</div>
                <div className="text-sm text-[#a0a0a0]">{data.rotationSummary}</div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-xs text-[#666]">Dispersion</div>
                <div className={`text-lg font-bold ${data.dispersionIndex > 4 ? "text-green-400" : data.dispersionIndex > 2 ? "text-amber-400" : "text-[#a0a0a0]"}`}>{data.dispersionIndex}</div>
                <div className="text-xs text-[#555]">{data.dispersionIndex > 4 ? "High" : data.dispersionIndex > 2 ? "Moderate" : "Low"}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-[#666]">Sector Spread</div>
                <div className={`text-lg font-bold ${(data.sectorSpread ?? 0) > 8 ? "text-green-400" : (data.sectorSpread ?? 0) > 4 ? "text-amber-400" : "text-[#a0a0a0]"}`}>{data.sectorSpread ?? 0}%</div>
                <div className="text-xs text-[#555]">{(data.sectorSpread ?? 0) > 8 ? "Wide" : (data.sectorSpread ?? 0) > 4 ? "Moderate" : "Narrow"}</div>
              </div>
            </div>
          </div>
        </div>
      </CollapsiblePanel>

      {/* Sector Heatmap Grid */}
      <CollapsiblePanel id="sector-scores" title="Sector Scores" collapsed={collapsedPanels.has("sector-scores")} onToggle={togglePanel}
        actions={
          <div className="flex items-center gap-1 overflow-x-auto">
            <span className="text-xs text-[#555] shrink-0 mr-1">Sort:</span>
            {SORT_MODE_OPTIONS.map(([mode, label]) => (
              <button key={mode} onClick={() => setSortMode(mode)} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${sortMode === mode ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border border-[#5ba3e6]/30" : "text-[#666] hover:text-[#a0a0a0] border border-transparent"}`}>{label}</button>
            ))}
          </div>
        }
      >
        <div className="flex flex-col gap-2 mb-3">
          {history.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto">
              <span className="text-xs text-[#555] shrink-0 mr-1">Compare:</span>
              <button onClick={() => setCompareDate(null)} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${compareDate === null ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border border-[#5ba3e6]/30" : "text-[#666] hover:text-[#a0a0a0] border border-transparent"}`}>None</button>
              {history.map((snap) => {
                const d = new Date(snap.date + "T12:00:00Z");
                const daysAgo = Math.round((Date.now() - d.getTime()) / 86_400_000);
                let label: string;
                if (daysAgo === 0) label = "Today";
                else if (daysAgo === 1) label = "Yesterday";
                else if (daysAgo <= 8) label = "1w ago";
                else if (daysAgo <= 15) label = "2w ago";
                else if (daysAgo <= 22) label = "3w ago";
                else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return (
                  <button key={snap.date} onClick={() => setCompareDate(snap.date)} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${compareDate === snap.date ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "text-[#666] hover:text-[#a0a0a0] border border-transparent"}`} title={snap.date}>{label}</button>
                );
              })}
            </div>
          )}
          {compareDate && comparisonSummary && (
            <div className="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-1.5 text-xs text-[#a0a0a0]">
              <span className="text-purple-400 font-medium">Comparing to {new Date(compareDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              <span>&mdash;</span>
              <span className="text-green-400">{comparisonSummary.improved} improved</span>
              <span className="text-red-400">{comparisonSummary.declined} declined</span>
              <span className="text-[#666]">{comparisonSummary.unchanged} unchanged</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {sortedSectors.map((s) => (
            <div key={s.sector} className={`rounded-lg border p-3 transition-colors ${s.stealthAccumulation ? "border-cyan-500/40 bg-cyan-500/5" : "border-[#2a2a2a] bg-[#141414]"}`}>
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-white" title={s.sector}>{s.sector}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[#666]">{s.etf}</span>
                    <EtfSparkline returns={data.etfReturns20d?.[s.etf]} />
                  </div>
                </div>
                <span className="text-lg shrink-0">{s.trendArrow}</span>
              </div>
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className={compositeTextColor(s.compositeScore)}>{s.compositeScore}</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${quadrantColor(s.quadrant)}`}>{s.quadrant}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-[#2a2a2a]">
                  <div className={`h-1.5 rounded-full ${compositeColor(s.compositeScore)}`} style={{ width: `${s.compositeScore}%` }} />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-[#888]">
                  <span>RS {s.rsRatio.toFixed(1)}</span>
                  <span>CMF {s.cmf20 >= 0 ? "+" : ""}{s.cmf20.toFixed(3)}</span>
                  <span>Breadth {s.breadthPct != null ? `${s.breadthPct.toFixed(0)}%` : "N/A"}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <TradingActionBadge sector={s} />
                  {(s.dataQuality ?? 100) < 100 && <span className="text-[10px] text-amber-400/70" title={`Scoring factors: momentum, acceleration, Mansfield RS, CMF (always available), breadth, smart money. ${s.dataQualityBreakdown ? `Missing: ${[!s.dataQualityBreakdown.breadth && "breadth", !s.dataQualityBreakdown.smartMoney && "smart money"].filter(Boolean).join(", ")}. ` : ""}Weights are redistributed across available factors.`}>{s.dataQuality ?? 100}% data</span>}
                </div>
                <ComparisonDelta sector={s} comparisonMap={comparisonMap} />
              </div>
            </div>
          ))}
        </div>
      </CollapsiblePanel>

      {/* RRG & Leading Indicators */}
      <CollapsiblePanel id="rrg-indicators" title="RRG & Leading Indicators" collapsed={collapsedPanels.has("rrg-indicators")} onToggle={togglePanel}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#888]">Relative Rotation Graph</h3>
            <div className="mx-auto max-w-[500px]"><RRGChart sectors={data.sectors} subSectorScores={subSectorScores} crossAssetScores={crossAssetScores} /></div>
          </div>
          <div className="space-y-4 rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-4">
            <h3 className="mb-2 text-sm font-semibold text-[#888]">Leading Indicators</h3>
            {(() => {
              const withSignals = data.sectors.filter((s) => s.stealthAccumulation || s.flowPriceDivergence || s.breadthDivergence || s.accelerationInflection);
              if (withSignals.length === 0) return <p className="text-sm text-[#666]">No leading indicators detected</p>;
              return (
                <div className="space-y-2">
                  {withSignals.map((s) => {
                    const signals: string[] = [];
                    if (s.flowPriceDivergence) signals.push("Flow/price divergence");
                    if (s.breadthDivergence) signals.push("Breadth divergence");
                    if (s.accelerationInflection) signals.push("Momentum inflection");
                    return (
                      <div key={s.sector} className="flex items-start gap-2 text-sm">
                        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${s.stealthAccumulation ? "bg-cyan-400" : "bg-amber-400"}`} />
                        <div>
                          <span className="font-medium text-white">{s.sector}</span>
                          {s.stealthAccumulation && <span className="ml-2 text-xs text-cyan-400">(Stealth)</span>}
                          <div className="text-xs text-[#888]">{signals.join(", ")}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      </CollapsiblePanel>

      {/* Sub-Sector Leading Indicators */}
      {subSectorScores.length > 0 && (
        <SubSectorPanel scores={subSectorScores} collapsed={collapsedPanels.has("sub-sectors")} onToggle={togglePanel} />
      )}

      {/* Cross-Asset Money Flow */}
      {crossAssetScores.length > 0 && (
        <CrossAssetPanel scores={crossAssetScores} collapsed={collapsedPanels.has("cross-asset")} onToggle={togglePanel} />
      )}

      {/* Data Staleness Warning */}
      <DataStalenessWarning calculatedAt={data.calculatedAt} />

      {/* Correlation Matrix */}
      <CorrelationMatrix correlationMatrix={data.correlationMatrix} sectors={data.sectors} collapsed={collapsedPanels.has("correlation")} onToggle={togglePanel} />

      {/* Cross-Sector Pairs */}
      <CollapsiblePanel id="cross-pairs" title="Cross-Sector Pairs" collapsed={collapsedPanels.has("cross-pairs")} onToggle={togglePanel}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-4">
            <div className="text-xs font-medium text-[#888] mb-1">XLY / XLP (Risk Appetite)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">{data.crossSectorPairs.xlyXlp.ratio?.toFixed(2) ?? "\u2014"}</span>
              <span className={`text-sm ${data.crossSectorPairs.xlyXlp.trend?.includes("Rising") ? "text-green-400" : data.crossSectorPairs.xlyXlp.trend?.includes("Falling") ? "text-red-400" : "text-[#888]"}`}>{data.crossSectorPairs.xlyXlp.trend ?? "\u2014"}</span>
            </div>
            <p className="mt-1 text-xs text-[#666]">Rising = cyclical rotation (risk-on). Falling = defensive rotation (risk-off).</p>
          </div>
          <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-4">
            <div className="text-xs font-medium text-[#888] mb-1">XLK / XLU (Growth vs Defense)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">{data.crossSectorPairs.xlkXlu.ratio?.toFixed(2) ?? "\u2014"}</span>
              <span className={`text-sm ${data.crossSectorPairs.xlkXlu.trend?.includes("Rising") ? "text-green-400" : data.crossSectorPairs.xlkXlu.trend?.includes("Falling") ? "text-red-400" : "text-[#888]"}`}>{data.crossSectorPairs.xlkXlu.trend ?? "\u2014"}</span>
            </div>
            <p className="mt-1 text-xs text-[#666]">Rising = growth favored. Falling = defensive/utilities favored.</p>
          </div>
        </div>
      </CollapsiblePanel>

      {/* Sector Comparison */}
      <CollapsiblePanel id="sector-comparison" title="Compare Sectors" collapsed={collapsedPanels.has("sector-comparison")} onToggle={togglePanel}>
        <SectorComparison sectors={data.sectors} />
      </CollapsiblePanel>

      <ScannerCTA />
    </div>
  );
}
