"use client";

import { memo, useState } from "react";
import { Check, X, ChevronDown, ChevronUp, Zap, AlertTriangle, Shield } from "lucide-react";
import type {
  InflectionResult,
  InflectionStage,
  InflectionTradeRead,
} from "@/lib/prerun/types";
import { INFLECTION_MAX_SCORE } from "@/lib/prerun/types";

// ── Helpers ──

function stageBadge(stage: InflectionStage): { label: string; color: string } {
  switch (stage) {
    case "EXPANSION":
      return { label: "Expansion", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "EARLY_ACCUMULATION":
      return { label: "Early Accum.", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
    case "INFLECTION":
      return { label: "Inflection", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" };
    case "SELLER_EXHAUSTION":
      return { label: "Seller Exhaust.", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    case "DISTRIBUTION":
      return { label: "Distribution", color: "text-red-400 bg-red-500/10 border-red-500/30" };
  }
}

function tradeReadBadge(tr: InflectionTradeRead): { label: string; color: string } {
  switch (tr) {
    case "ADD_ON_CONFIRMATION":
      return { label: "Add on Confirm", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "STARTER_POSITION_CANDIDATE":
      return { label: "Starter Position", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
    case "WATCH":
      return { label: "Watch", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    case "AVOID":
      return { label: "Avoid", color: "text-red-400 bg-red-500/10 border-red-500/30" };
  }
}

function scoreBarColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 50) return "bg-cyan-500";
  if (score >= 35) return "bg-amber-500";
  return "bg-red-500";
}

// ── Card Component ──

export const InflectionResultCard = memo(function InflectionResultCard({
  result,
  index,
}: {
  result: InflectionResult;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const d = result.data;
  const s = result.scores;
  const g = result.gates;
  const sBadge = stageBadge(result.stage);
  const trBadge = tradeReadBadge(result.tradeRead);
  const isAvoid = result.tradeRead === "AVOID";

  const scoreBars = [
    { label: "Seller Exhaust", score: s.sellerExhaustion, key: "SE" },
    { label: "Vol Compress", score: s.volatilityCompression, key: "VC" },
    { label: "Buyer Emerge", score: s.buyerEmergence, key: "BE" },
    { label: "Rel Strength", score: s.relativeStrength, key: "RS" },
    { label: "Auction", score: s.liquidityAuction, key: "LA" },
    { label: "Inst Particip", score: s.institutionalParticipation, key: "IP" },
  ];

  const gates = [
    { label: "P>$5", pass: g.priceAbove5 },
    { label: "$Vol>$10M", pass: g.avgDollarVolAbove10m },
    { label: "MCap>$500M", pass: g.mktCapAbove500m },
  ];

  return (
    <div
      className={`ew-card-in rounded-lg border bg-[#1a1a1a] p-4 hover:border-[#3a3a3a] transition-colors flex flex-col ${
        isAvoid ? "border-red-500/20 opacity-70" : "border-[#2a2a2a]"
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Header: ticker, company, price, stage, trade read */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white">{d.ticker}</h3>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sBadge.color}`}>
              {sBadge.label}
            </span>
            <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${trBadge.color}`}>
              {trBadge.label}
            </span>
            {result.isPrimarySignal && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-purple-400">
                <Zap className="h-2.5 w-2.5" /> Signal
              </span>
            )}
            {result.isStrongerSignal && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
                <Shield className="h-2.5 w-2.5" /> Strong
              </span>
            )}
          </div>
          <p className="text-xs text-[#a0a0a0] truncate mt-0.5">{d.companyName}</p>
        </div>
        {d.currentPrice !== null && (
          <p className="text-sm font-medium text-white shrink-0 ml-2">${d.currentPrice.toFixed(2)}</p>
        )}
      </div>

      {/* Overall score bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[#a0a0a0]">Overall</span>
          <span className="font-medium text-white">{s.overallScore}/{INFLECTION_MAX_SCORE}</span>
        </div>
        <div className="h-2 bg-[#0f0f0f] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(s.overallScore)}`}
            style={{ width: `${Math.min(100, s.overallScore)}%` }}
          />
        </div>
      </div>

      {/* 6 category score bars */}
      <div className="space-y-1.5 mb-3">
        {scoreBars.map((bar) => (
          <div key={bar.key} className="flex items-center gap-2">
            <span className="text-[9px] text-[#666] w-20 text-right shrink-0">{bar.label}</span>
            <div className="flex-1 h-1.5 bg-[#0f0f0f] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${scoreBarColor(bar.score)}`}
                style={{ width: `${bar.score}%` }}
              />
            </div>
            <span className="text-[9px] text-[#a0a0a0] w-6 shrink-0">{bar.score}</span>
          </div>
        ))}
      </div>

      {/* Gate indicators */}
      <div className="flex flex-wrap items-center gap-1 mb-3">
        {gates.map((gate) => (
          <span
            key={gate.label}
            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium ${
              gate.pass
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
          >
            {gate.label}
            {gate.pass ? <Check className="h-2 w-2" /> : <X className="h-2 w-2" />}
          </span>
        ))}
        {result.extensionRisk && (
          <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <AlertTriangle className="h-2.5 w-2.5" /> Extension Risk
          </span>
        )}
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 mb-3 text-[10px]">
        <div>
          <span className="text-[#555]">RSI(14)</span>
          <p className={`font-medium ${(d.rsi14 ?? 50) < 35 ? "text-amber-400" : (d.rsi14 ?? 50) > 65 ? "text-red-400" : "text-white"}`}>
            {d.rsi14 !== null ? d.rsi14.toFixed(1) : "-"}
          </p>
        </div>
        <div>
          <span className="text-[#555]">% From ATH</span>
          <p className="text-white font-medium">{d.pctFromAth !== null ? `${d.pctFromAth.toFixed(1)}%` : "-"}</p>
        </div>
        <div>
          <span className="text-[#555]">Higher Lows</span>
          <p className={`font-medium ${(d.higherLowsCount ?? 0) >= 2 ? "text-emerald-400" : "text-white"}`}>
            {d.higherLowsCount ?? "-"}
          </p>
        </div>
        <div>
          <span className="text-[#555]">ATR Ratio</span>
          <p className={`font-medium ${(d.atrRatio5v20 ?? 1) < 0.7 ? "text-emerald-400" : "text-white"}`}>
            {d.atrRatio5v20 !== null ? d.atrRatio5v20.toFixed(2) : "-"}
          </p>
        </div>
        <div>
          <span className="text-[#555]">Accum Days</span>
          <p className={`font-medium ${(d.accumulationDayCount ?? 0) >= 5 ? "text-emerald-400" : "text-white"}`}>
            {d.accumulationDayCount ?? "-"}
          </p>
        </div>
        <div>
          <span className="text-[#555]">Invalidation</span>
          <p className="text-white font-medium">
            {result.invalidationLevel !== null ? `$${result.invalidationLevel.toFixed(2)}` : "-"}
          </p>
        </div>
      </div>

      {/* Trend Micro-Data row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 mb-3 text-[10px] rounded border border-[#222] bg-[#0f0f0f] px-2.5 py-2">
        <div>
          <span className="text-[#555]">RS Accel SPY</span>
          <p className={`font-medium ${(d.instRsAccelVsSPY ?? 0) > 0 ? "text-emerald-400" : (d.instRsAccelVsSPY ?? 0) < -2 ? "text-red-400" : "text-amber-400"}`}>
            {d.instRsAccelVsSPY !== null ? `${d.instRsAccelVsSPY >= 0 ? "+" : ""}${d.instRsAccelVsSPY.toFixed(2)}` : "-"}
          </p>
        </div>
        <div>
          <span className="text-[#555]">RS Accel QQQ</span>
          <p className={`font-medium ${(d.instRsAccelVsQQQ ?? 0) > 0 ? "text-emerald-400" : (d.instRsAccelVsQQQ ?? 0) < -2 ? "text-red-400" : "text-amber-400"}`}>
            {d.instRsAccelVsQQQ !== null ? `${d.instRsAccelVsQQQ >= 0 ? "+" : ""}${d.instRsAccelVsQQQ.toFixed(2)}` : "-"}
          </p>
        </div>
        <div>
          <span className="text-[#555]">RS Trend</span>
          <p className={`font-medium ${(d.instRsAccelTrend ?? 0) > 0 ? "text-emerald-400" : (d.instRsAccelTrend ?? 0) < 0 ? "text-red-400" : "text-white"}`}>
            {d.instRsAccelTrend !== null
              ? `${d.instRsAccelTrend > 0 ? "\u2191" : d.instRsAccelTrend < 0 ? "\u2193" : "\u2192"} ${Math.abs(d.instRsAccelTrend).toFixed(2)}`
              : "-"}
          </p>
        </div>
        <div>
          <span className="text-[#555]">Vol 5d</span>
          {d.volumeRecent5d ? (
            <div className="flex items-end gap-px h-4 mt-0.5">
              {d.volumeRecent5d.map((v, i) => {
                const max = Math.max(...d.volumeRecent5d!);
                const pct = max > 0 ? (v / max) * 100 : 0;
                const isLast = i === d.volumeRecent5d!.length - 1;
                const isGrowing = i > 0 && v > d.volumeRecent5d![i - 1];
                return (
                  <div
                    key={i}
                    className={`w-2 rounded-sm ${isLast ? (isGrowing ? "bg-emerald-400" : "bg-red-400") : "bg-[#444]"}`}
                    style={{ height: `${Math.max(pct, 10)}%` }}
                    title={`${(v / 1e6).toFixed(1)}M`}
                  />
                );
              })}
              <span className="ml-1 text-[9px] text-[#666]">{(d.volumeRecent5d[d.volumeRecent5d.length - 1] / 1e6).toFixed(0)}M</span>
            </div>
          ) : (
            <p className="text-white font-medium">-</p>
          )}
        </div>
      </div>

      {/* Evidence pills (top 3 of each) */}
      <div className="space-y-1.5 mb-3">
        {result.bullishEvidence.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {result.bullishEvidence.slice(0, expanded ? undefined : 3).map((ev, i) => (
              <span key={i} className="rounded px-1.5 py-0.5 text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {ev}
              </span>
            ))}
            {!expanded && result.bullishEvidence.length > 3 && (
              <span className="text-[9px] text-[#666]">+{result.bullishEvidence.length - 3} more</span>
            )}
          </div>
        )}
        {result.cautionEvidence.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {result.cautionEvidence.slice(0, expanded ? undefined : 2).map((ev, i) => (
              <span key={i} className="rounded px-1.5 py-0.5 text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {ev}
              </span>
            ))}
            {!expanded && result.cautionEvidence.length > 2 && (
              <span className="text-[9px] text-[#666]">+{result.cautionEvidence.length - 2} more</span>
            )}
          </div>
        )}
      </div>

      {/* Expand/collapse */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-[#1f1f1f]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-[#666] hover:text-white transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Less" : "Details"}
        </button>
        <div className="flex items-center gap-1.5 text-[9px] text-[#555]">
          <span>MktCap: {d.marketCap ? `$${(d.marketCap / 1e9).toFixed(1)}B` : "-"}</span>
          <span>|</span>
          <span>$Vol: {d.vcpAvgDollarVolume ? `$${(d.vcpAvgDollarVolume / 1e6).toFixed(0)}M` : "-"}</span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-[#1f1f1f] space-y-2 text-[10px]">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[#555]">Down-Day Body (recent)</span>
              <p className="text-white">{d.avgDownDayBody !== null ? `${d.avgDownDayBody.toFixed(2)}%` : "-"}</p>
            </div>
            <div>
              <span className="text-[#555]">Down-Day Body (prev)</span>
              <p className="text-white">{d.avgDownDayBodyPrev !== null ? `${d.avgDownDayBodyPrev.toFixed(2)}%` : "-"}</p>
            </div>
            <div>
              <span className="text-[#555]">Dist Days (20d)</span>
              <p className="text-white">{d.distributionDays20d ?? "-"}</p>
            </div>
            <div>
              <span className="text-[#555]">Inst Ownership</span>
              <p className="text-white">{d.institutionalPct !== null ? `${d.institutionalPct.toFixed(0)}%` : "-"}</p>
            </div>
            <div>
              <span className="text-[#555]">OBV Divergence</span>
              <p className={d.obvDivergent ? "text-emerald-400" : "text-white"}>
                {d.obvDivergent === true ? "Yes" : d.obvDivergent === false ? "No" : "-"}
              </p>
            </div>
            <div>
              <span className="text-[#555]">VP Divergence</span>
              <p className={d.vpDivergenceBullish ? "text-emerald-400" : "text-white"}>
                {d.vpDivergenceBullish === true ? "Yes" : d.vpDivergenceBullish === false ? "No" : "-"}
              </p>
            </div>
            <div>
              <span className="text-[#555]">Insider Buys (90d)</span>
              <p className="text-white">{d.insiderBuys90d ?? "-"}</p>
            </div>
            <div>
              <span className="text-[#555]">Float Turnover</span>
              <p className="text-white">{d.floatTurnover20d !== null ? d.floatTurnover20d.toFixed(2) : "-"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
