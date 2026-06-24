"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { SectorRotationScore } from "@/lib/sector-rotation/types";
import type { SectorSnapshot } from "@/lib/sector-rotation/history";
import { compositeTextColor } from "@/lib/color-utils";
import type { StockInSector } from "./types";
import { quadrantColor } from "./helpers";
import { EtfSparkline } from "./shared";
import { TradingActionBadge } from "./comparison-delta";
import { SectorStockTable } from "./sector-stock-table";

export function SectorDetail({ sector, stocks, prevSnapshot, etfReturns, hasRotationData = false, rotationFetchFailed = false }: { sector: SectorRotationScore; stocks: StockInSector[]; prevSnapshot?: SectorSnapshot | null; etfReturns?: number[]; hasRotationData?: boolean; rotationFetchFailed?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border rounded-lg ${sector.stealthAccumulation ? "border-cyan-500/40" : "border-[#2a2a2a]"}`}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#1a1a1a] transition-colors rounded-lg" aria-label="Toggle sector details">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg">{sector.trendArrow}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-white truncate">{sector.sector}</span>
              <span className="text-xs text-[#666]">{sector.etf}</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${quadrantColor(sector.quadrant)}`}>{sector.quadrant}</span>
              <TradingActionBadge sector={sector} />
              {sector.stealthAccumulation && <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-400">STEALTH</span>}
              {(sector.dataQuality ?? 100) < 100 && <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400" title={`Scoring factors: momentum, acceleration, Mansfield RS, CMF (always available), breadth, smart money. ${sector.dataQualityBreakdown ? `Missing: ${[!sector.dataQualityBreakdown.breadth && "breadth", !sector.dataQualityBreakdown.smartMoney && "smart money"].filter(Boolean).join(", ")}. ` : ""}Weights are redistributed across available factors.`}>{sector.dataQuality ?? 100}% data</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <EtfSparkline returns={etfReturns} />
          <Link href={`/rotation?sector=${encodeURIComponent(sector.sector)}`} onClick={(e) => e.stopPropagation()} className="text-[#555] hover:text-[#5ba3e6]" title="View in Rotation Tracker">
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <span className="text-xs text-[#666]">{stocks.length} stocks</span>
          <span className={`text-lg font-bold ${compositeTextColor(sector.compositeScore)}`}>
            {sector.compositeScore}
            {prevSnapshot && prevSnapshot.compositeScore !== sector.compositeScore && (
              <span className={`ml-1 text-xs font-semibold ${sector.compositeScore - prevSnapshot.compositeScore > 0 ? "text-green-400" : "text-red-400"}`}>({sector.compositeScore - prevSnapshot.compositeScore > 0 ? "+" : ""}{sector.compositeScore - prevSnapshot.compositeScore})</span>
            )}
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-[#666]" /> : <ChevronDown className="h-4 w-4 text-[#666]" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-[#2a2a2a] px-4 py-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[#888]">Momentum Composite</span><span className="text-white">{sector.momentumComposite} <span className="text-[#666]">({sector.momentumPercentile}th %ile)</span></span></div>
            <div className="flex justify-between"><span className="text-[#888]">Acceleration</span><span className={sector.acceleration > 0 ? "text-green-400" : sector.acceleration < 0 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.acceleration > 0 ? "+" : ""}{sector.acceleration.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Mansfield RS</span><span className={sector.mansfieldRS > 0 ? "text-green-400" : sector.mansfieldRS < 0 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.mansfieldRS > 0 ? "+" : ""}{sector.mansfieldRS.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">CMF (20d)</span><span className={sector.cmf20 > 0 ? "text-green-400" : sector.cmf20 < 0 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.cmf20 > 0 ? "+" : ""}{sector.cmf20.toFixed(3)}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">OBV Trend</span><span className={sector.obvTrend === 1 ? "text-green-400" : sector.obvTrend === -1 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.obvTrend === 1 ? "Accumulation" : sector.obvTrend === -1 ? "Distribution" : "Flat"}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Breadth (% &gt; 50d SMA)</span><span className="text-white">{sector.breadthPct !== null ? `${sector.breadthPct}%` : "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Unusual Volume</span><span className={sector.unusualVolume ? "text-amber-400" : "text-[#a0a0a0]"}>{sector.unusualVolume ? "Yes" : "No"}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Insider Buys</span><span className={sector.aggregateInsiderBuys > 0 ? "text-green-400" : "text-[#a0a0a0]"}>{sector.aggregateInsiderBuys}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Avg P/C Ratio</span><span className="text-white">{sector.aggregatePCR !== null ? sector.aggregatePCR : "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Earnings Beat %</span><span className="text-white">{sector.earningsBeatPct}%</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Smart Money Score</span><span className={sector.dataQualityBreakdown?.smartMoney === false ? "text-[#555]" : compositeTextColor(sector.smartMoneyScore)}>{sector.dataQualityBreakdown?.smartMoney === false ? "No data" : `${sector.smartMoneyScore}/100`}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">RS-Ratio / Momentum</span><span className="text-white">{sector.rsRatio.toFixed(2)} / {sector.rsMomentum.toFixed(2)}</span></div>
          </div>
          {stocks.length > 0 && (
            <div className="border-t border-[#2a2a2a] pt-3">
              <SectorStockTable stocks={stocks} sectorName={sector.sector} hasRotationData={hasRotationData} rotationFetchFailed={rotationFetchFailed} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
