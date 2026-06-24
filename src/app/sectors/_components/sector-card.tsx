"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { SectorRotationScore } from "@/lib/sector-rotation/types";
import type { DailySnapshot, SectorSnapshot } from "@/lib/sector-rotation/history";
import { getSectorTimeseries } from "@/lib/sector-rotation/history";
import { compositeTextColor } from "@/lib/color-utils";
import { phaseBadge } from "@/lib/phase-utils";
import type { StockInSector } from "./types";
import { quadrantColor, getTradingAction, actionBorderColor, getStockPhase, rsColor, rsAccelColor } from "./helpers";
import { TradingActionBadge, ComparisonDelta } from "./comparison-delta";
import { EtfSparkline } from "./shared";
import { InfoTip } from "./info-tip";
import type { TradingAction } from "./types";

// ── Score Sparkline (composite score over history) ──

function ScoreSparkline({ history, sector }: { history: DailySnapshot[]; sector: string }) {
  const series = useMemo(() => getSectorTimeseries(history, sector), [history, sector]);
  if (series.length < 3) return null;
  const W = 48;
  const H = 24;
  const pad = 1;
  const min = Math.min(...series.map((s) => s.score));
  const max = Math.max(...series.map((s) => s.score));
  const range = max - min || 1;
  const points = series.map((s, i) => {
    const x = pad + (i / (series.length - 1)) * (W - 2 * pad);
    const y = H - pad - ((s.score - min) / range) * (H - 2 * pad);
    return `${x},${y}`;
  }).join(" ");
  const delta = series[series.length - 1].score - series[0].score;
  const color = delta >= 0 ? "#4ade80" : "#f87171";
  return (
    <svg width={W} height={H} className="inline-block shrink-0" aria-label="Score trend">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ── Circular progress ring ──

function ScoreRing({ score }: { score: number }) {
  const R = 11;
  const C = 14;
  const SW = 3;
  const circumference = 2 * Math.PI * R;
  const dashOffset = circumference * (1 - score / 100);
  const color = score >= 70 ? "#4ade80" : score >= 50 ? "#fbbf24" : score >= 30 ? "#f97316" : "#f87171";
  return (
    <svg width={C * 2} height={C * 2} className="shrink-0">
      <circle cx={C} cy={C} r={R} fill="none" stroke="#2a2a2a" strokeWidth={SW} />
      <circle cx={C} cy={C} r={R} fill="none" stroke={color} strokeWidth={SW} strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" transform={`rotate(-90 ${C} ${C})`} />
    </svg>
  );
}

// ── Top-3 stock pills ──

function getConvictionScore(s: StockInSector): number {
  let score = 0;
  if ((s.rsAccel ?? 0) > 1) score += 3;
  else if ((s.rsAccel ?? 0) > 0) score += 1;
  if (s.aboveSma50 === true) score += 2;
  if ((s.volumeVsAvg ?? 0) >= 1.5) score += 2;
  else if ((s.volumeVsAvg ?? 0) >= 1.2) score += 1;
  if (s.rsImproving) score += 1;
  if (s.verdict === "BUY" || s.verdict === "PRIORITY_BUY") score += 2;
  return score;
}

function convictionLabel(score: number): { label: string; color: string } {
  if (score >= 7) return { label: "HIGH", color: "text-green-400 bg-green-500/15 border-green-500/30" };
  if (score >= 4) return { label: "MED", color: "text-amber-400 bg-amber-500/15 border-amber-500/30" };
  return { label: "LOW", color: "text-[#888] bg-[#2a2a2a] border-[#333]" };
}

// ── Why Text ──

function getWhyText(sector: SectorRotationScore): string {
  const action = getTradingAction(sector);
  if (action === "TRADE" && sector.quadrant === "LEADING" && sector.acceleration > 0) {
    return "Strong momentum with money flowing in";
  }
  if (action === "BUILD" && sector.quadrant === "IMPROVING") {
    return "Improving momentum \u2014 building position opportunity";
  }
  if (action === "WATCH" && sector.quadrant === "LEADING" && sector.acceleration < 0) {
    return "Still leading but losing steam \u2014 watch for weakening";
  }
  if (action === "TRIM" && sector.quadrant === "WEAKENING") {
    return "Momentum fading \u2014 consider reducing exposure";
  }
  if (action === "AVOID" && sector.quadrant === "LAGGING") {
    return "Weak across all metrics \u2014 stay away";
  }
  if (action === "TRADE") return "Strong composite score in leading quadrant";
  if (action === "BUILD") return "Gaining momentum \u2014 early position opportunity";
  if (action === "WATCH") return "Monitor for improvement before adding exposure";
  if (action === "TRIM") return "Weakening signals \u2014 reduce or exit";
  return "Poor metrics \u2014 avoid new positions";
}

function getGuidanceBullets(sector: SectorRotationScore, stocks: StockInSector[]): string[] {
  const action = getTradingAction(sector);
  const bullets: string[] = [];

  const actionGuidance: Record<TradingAction, string> = {
    TRADE: `${sector.sector} is in the LEADING quadrant with positive acceleration \u2014 this is the strongest setup for full position sizing.`,
    BUILD: `${sector.sector} is IMPROVING with positive acceleration \u2014 scale into positions as momentum builds.`,
    WATCH: `${sector.sector} shows mixed signals \u2014 monitor for quadrant transition before committing capital.`,
    TRIM: `${sector.sector} is in the WEAKENING quadrant \u2014 tighten stops and reduce exposure.`,
    AVOID: `${sector.sector} is LAGGING with weak metrics \u2014 no new positions recommended.`,
  };
  bullets.push(actionGuidance[action]);

  // Top conviction stock
  const topStocks = [...stocks]
    .map((s) => ({ ...s, _conv: getConvictionScore(s) }))
    .sort((a, b) => b._conv - a._conv);
  const topHigh = topStocks.find((s) => s._conv >= 7);
  if (topHigh) {
    bullets.push(`Top pick: ${topHigh.ticker} (${topHigh.companyName}) \u2014 HIGH conviction.`);
  }

  // Risk note
  if (sector.acceleration < -2) {
    bullets.push("Caution: Acceleration is strongly negative \u2014 momentum deteriorating rapidly.");
  } else if ((sector.dataQuality ?? 100) < 50) {
    bullets.push(`Data quality is only ${sector.dataQuality}% \u2014 signals may be unreliable.`);
  }

  return bullets;
}

// ── Sector Card ──

export function SectorCard({
  sector,
  stocks,
  etfReturns,
  comparisonMap,
  history,
  isExpanded,
  onToggle,
}: {
  sector: SectorRotationScore;
  stocks: StockInSector[];
  etfReturns?: number[];
  comparisonMap: Map<string, SectorSnapshot> | null;
  history: DailySnapshot[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const action = getTradingAction(sector);
  const borderColor = actionBorderColor(action);
  const pct = sector.compositeScore;

  // Top 3 stocks by conviction
  const topStocks = useMemo(() => {
    return [...stocks]
      .map((s) => ({ ...s, _conviction: getConvictionScore(s) }))
      .sort((a, b) => b._conviction - a._conviction)
      .slice(0, 3);
  }, [stocks]);

  return (
    <div
      className={`rounded-lg border border-l-[3px] p-3 transition-all duration-150 hover:border-[#3a3a3a] cursor-pointer ${borderColor} ${sector.stealthAccumulation ? "border-t-cyan-500/40 border-r-cyan-500/40 border-b-cyan-500/40 bg-cyan-500/5" : "border-t-[#2a2a2a] border-r-[#2a2a2a] border-b-[#2a2a2a] bg-[#141414]"}`}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-white" title={sector.sector}>{sector.sector}</div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#666] font-mono">{sector.etf}</span>
            <EtfSparkline returns={etfReturns} />
            <ScoreSparkline history={history} sector={sector.sector} />
          </div>
        </div>
        <span className="text-lg shrink-0">{sector.trendArrow}</span>
      </div>
      <div className="mt-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <ScoreRing score={pct} />
            <span className={`font-mono font-semibold ${compositeTextColor(pct)}`}>{pct}</span>
            <InfoTip text="0-100 score combining RS ratio, momentum, CMF, breadth, and trend" />
          </div>
          <div className="flex items-center gap-1">
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${quadrantColor(sector.quadrant)}`}>{sector.quadrant}</span>
            <InfoTip text="RRG position \u2014 LEADING (strong), IMPROVING (gaining), WEAKENING (fading), LAGGING (weak)" />
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[10px] text-[#888] font-mono">
          <span className="flex items-center gap-0.5">RS {sector.rsRatio.toFixed(1)} <InfoTip text="Relative strength vs SPY \u2014 positive means outperforming the market" /></span>
          <span>CMF {sector.cmf20 >= 0 ? "+" : ""}{sector.cmf20.toFixed(3)}</span>
          <span>Breadth {sector.breadthPct != null ? `${sector.breadthPct.toFixed(0)}%` : "N/A"}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <TradingActionBadge sector={sector} />
          {(sector.dataQuality ?? 100) < 100 && <span className="text-[10px] text-amber-400/70">{sector.dataQuality ?? 100}% data</span>}
        </div>
        <p className="mt-1 text-[10px] text-[#777] italic leading-snug">{getWhyText(sector)}</p>
        <ComparisonDelta sector={sector} comparisonMap={comparisonMap} />
        {/* Top 3 stock pills */}
        {topStocks.length > 0 && (
          <div className="mt-2 flex items-center gap-1 flex-wrap">
            {topStocks.map((s) => {
              const conv = convictionLabel(s._conviction);
              return (
                <a
                  key={s.ticker}
                  href={`https://finance.yahoo.com/quote/${encodeURIComponent(s.ticker)}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${conv.color} hover:opacity-80 transition-opacity`}
                  title={`${s.companyName} — ${conv.label} conviction`}
                >
                  {s.ticker}
                </a>
              );
            })}
            {stocks.length > 3 && (
              <span className="text-[10px] text-[#555]">+{stocks.length - 3}</span>
            )}
          </div>
        )}
        {/* Expand indicator */}
        <div className="mt-1.5 flex justify-center">
          <ChevronDown className={`h-3.5 w-3.5 text-[#555] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
        </div>
      </div>
    </div>
  );
}

// ── Expanded Stock Table ──

export function ExpandedStockTable({ stocks, sector }: { stocks: StockInSector[]; sector?: SectorRotationScore }) {
  const [showAll, setShowAll] = useState(false);

  const rankedStocks = useMemo(() => {
    return [...stocks]
      .map((s) => ({ ...s, _conviction: getConvictionScore(s), _phase: getStockPhase(s) }))
      .sort((a, b) => {
        const convDiff = b._conviction - a._conviction;
        if (convDiff !== 0) return convDiff;
        return (b.rsAccel ?? 0) - (a.rsAccel ?? 0);
      });
  }, [stocks]);

  const visible = showAll ? rankedStocks : rankedStocks.slice(0, 10);

  if (stocks.length === 0) {
    return <p className="text-xs text-[#555] py-2 text-center">No stock data available for this sector.</p>;
  }

  const guidanceBullets = sector ? getGuidanceBullets(sector, stocks) : [];

  return (
    <div className="col-span-full rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-4">
      {guidanceBullets.length > 0 && (
        <div className="mb-3 rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2.5">
          <div className="text-[11px] font-semibold text-[#aaa] mb-1.5">What to do with {sector!.sector}:</div>
          <ul className="space-y-1">
            {guidanceBullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-[#999] leading-snug">
                <span className="mt-1 h-1 w-1 rounded-full bg-[#555] shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#2a2a2a] text-left text-[#666]">
              <th className="pb-2 pr-3 font-medium">Ticker</th>
              <th className="pb-2 pr-3 font-medium text-right">Price</th>
              <th className="pb-2 pr-3 font-medium">Phase</th>
              <th className="pb-2 pr-3 font-medium text-right">RS Accel</th>
              <th className="pb-2 pr-3 font-medium text-right">Vol Ratio</th>
              <th className="pb-2 pr-3 font-medium">Conviction</th>
              <th className="pb-2 font-medium text-center">SMA50</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const phase = phaseBadge(s._phase);
              const conv = convictionLabel(s._conviction);
              return (
                <tr key={s.ticker} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]/50">
                  <td className="py-1.5 pr-3">
                    <a href={`https://finance.yahoo.com/quote/${encodeURIComponent(s.ticker)}/`} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-[#5ba3e6] hover:underline">
                      {s.ticker}
                    </a>
                    <span className="ml-1.5 text-[#666]">{s.companyName}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-white">{s.price != null ? `$${s.price.toFixed(2)}` : "—"}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${phase.className}`}>{phase.label}</span>
                  </td>
                  <td className={`py-1.5 pr-3 text-right font-mono ${rsAccelColor(s.rsAccel)}`}>
                    {s.rsAccel != null ? `${s.rsAccel > 0 ? "+" : ""}${s.rsAccel.toFixed(1)}` : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-white">
                    {s.volumeVsAvg != null ? `${s.volumeVsAvg.toFixed(2)}x` : "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${conv.color}`}>{conv.label}</span>
                  </td>
                  <td className="py-1.5 text-center">
                    {s.aboveSma50 === true ? <span className="h-2 w-2 rounded-full bg-green-400 inline-block" /> : s.aboveSma50 === false ? <span className="h-2 w-2 rounded-full bg-red-400 inline-block" /> : <span className="text-[#555]">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rankedStocks.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-xs text-[#5ba3e6] hover:underline"
        >
          {showAll ? "Show less" : `Show all ${rankedStocks.length}`}
        </button>
      )}
    </div>
  );
}
