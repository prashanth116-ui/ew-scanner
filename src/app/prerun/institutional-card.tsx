"use client";

import { memo, useState } from "react";
import { Check, X, ChevronDown, ChevronUp, ListPlus } from "lucide-react";
import type {
  InstitutionalResult,
  InstitutionalClassification,
  InstitutionalEntryQuality,
  InstitutionalEntryTrigger,
} from "@/lib/prerun/types";
import { INST_MAX_SCORE } from "@/lib/prerun/types";

// ── Helpers ──

function instClassBadge(c: InstitutionalClassification): { label: string; color: string } {
  switch (c) {
    case "CONTINUATION_LEADER":
      return { label: "Continuation Leader", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "RECOVERY_LEADER":
      return { label: "Recovery Leader", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
    case "FRESH_ROTATION":
      return { label: "Fresh Rotation", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" };
    case "INSTITUTIONAL_ACCUMULATION":
      return { label: "Inst. Accumulation", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" };
    case "TIGHT_BASE":
      return { label: "Tight Base", color: "text-teal-400 bg-teal-500/10 border-teal-500/30" };
    case "CONSTRUCTIVE_SETUP":
      return { label: "Constructive", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30" };
    case "NEUTRAL_HOLD":
      return { label: "Neutral", color: "text-gray-400 bg-gray-500/10 border-gray-500/30" };
    case "OVERSOLD_REVERSAL":
      return { label: "Oversold Reversal", color: "text-orange-400 bg-orange-500/10 border-orange-500/30" };
    case "TOO_EXTENDED":
      return { label: "Too Extended", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    case "AVOID_DISTRIBUTION":
      return { label: "Avoid: Distribution", color: "text-red-400 bg-red-500/10 border-red-500/30" };
    case "AVOID_CHOPPY":
      return { label: "Avoid: Choppy", color: "text-red-400 bg-red-500/10 border-red-500/30" };
    case "AVOID_LOW_QUALITY":
      return { label: "Avoid: Low Quality", color: "text-red-400 bg-red-500/10 border-red-500/30" };
  }
}

function instScoreBarColor(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.7) return "bg-emerald-500";
  if (pct >= 0.5) return "bg-cyan-500";
  if (pct >= 0.35) return "bg-amber-500";
  return "bg-red-500";
}

function entryQualityBadge(q: InstitutionalEntryQuality): { label: string; color: string } {
  switch (q) {
    case "HIGH":
      return { label: "HIGH", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "MODERATE":
      return { label: "MOD", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    case "LOW":
      return { label: "LOW", color: "text-red-400 bg-red-500/10 border-red-500/30" };
  }
}

function triggerLabel(t: InstitutionalEntryTrigger): string {
  switch (t) {
    case "breakout_above_pivot": return "Breakout Above Pivot";
    case "higher_low_hold": return "Higher Low Hold";
    case "ema_reclaim": return "EMA Reclaim";
    case "pullback_to_ema20": return "Pullback to EMA20";
    case "gap_and_go": return "Gap & Go";
    case "range_breakout": return "Range Breakout";
    case "none": return "No Trigger";
  }
}

function isAvoid(c: InstitutionalClassification): boolean {
  return c === "AVOID_DISTRIBUTION" || c === "AVOID_CHOPPY" || c === "AVOID_LOW_QUALITY" || c === "TOO_EXTENDED";
}

// ── Card Component ──

export const InstitutionalResultCard = memo(function InstitutionalResultCard({
  result,
  index,
  onAddToWatchlist,
  justAdded,
}: {
  result: InstitutionalResult;
  index: number;
  onAddToWatchlist?: (ticker: string) => void;
  justAdded: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const d = result.data;
  const s = result.scores;
  const g = result.gates;
  const classBadge = instClassBadge(result.classification);
  const qualBadge = entryQualityBadge(result.entryQuality);
  const avoid = isAvoid(result.classification);

  const fmtNum = (v: number | null, decimals = 1) => v !== null ? v.toFixed(decimals) : "-";
  const fmtVol = (v: number | null) => {
    if (v === null) return "-";
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`;
    return `$${(v / 1_000).toFixed(0)}K`;
  };

  const scoreBars = [
    { label: "Institutional", score: s.institutionalScore, max: 100 },
    { label: "Execution", score: s.executionScore, max: 100 },
    { label: "Risk", score: s.riskScore, max: 100 },
    { label: "Discipline", score: s.disciplineScore, max: 100 },
  ];

  const gates = [
    { label: "P>$20", pass: g.priceAbove20 },
    { label: "MCap>$20B", pass: g.mktCapAbove20b },
    { label: "$Vol>$100M", pass: g.avgDollarVolAbove100m },
    { label: "Vol>1.5M", pass: g.avgShareVolAbove1_5m },
  ];

  return (
    <div
      className={`ew-card-in rounded-lg border bg-[#1a1a1a] p-4 hover:border-[#3a3a3a] transition-colors flex flex-col ${
        avoid ? "border-red-500/20 opacity-70" : "border-[#2a2a2a]"
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Header: ticker, company, price, classification, entry quality */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white">{d.ticker}</h3>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${classBadge.color}`}>
              {classBadge.label}
            </span>
            {!avoid && (
              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${qualBadge.color}`}>
                {qualBadge.label}
              </span>
            )}
          </div>
          <p className="text-xs text-[#a0a0a0] truncate mt-0.5">{d.companyName}</p>
        </div>
        {d.currentPrice !== null && (
          <p className="text-sm font-medium text-white shrink-0 ml-2">${d.currentPrice.toFixed(2)}</p>
        )}
      </div>

      {/* Composite score bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[#a0a0a0]">Composite</span>
          <span className="font-medium text-white">{s.compositeScore}/{INST_MAX_SCORE}</span>
        </div>
        <div className="h-2 bg-[#0f0f0f] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${instScoreBarColor(s.compositeScore, INST_MAX_SCORE)}`}
            style={{ width: `${Math.min(100, s.compositeScore)}%` }}
          />
        </div>
      </div>

      {/* 4 sub-score bars */}
      <div className="space-y-1.5 mb-3">
        {scoreBars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-2">
            <span className="text-[9px] text-[#666] w-16 text-right shrink-0">{bar.label}</span>
            <div className="flex-1 h-1.5 bg-[#0f0f0f] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${instScoreBarColor(bar.score, bar.max)}`}
                style={{ width: `${bar.max > 0 ? (bar.score / bar.max) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[9px] text-[#a0a0a0] w-8 shrink-0">{bar.score}</span>
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
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 mb-3 text-[10px]">
        <div>
          <span className="text-[#555]">RS Accel SPY</span>
          <p className={`font-medium ${(d.instRsAccelVsSPY ?? 0) > 3 ? "text-emerald-400" : (d.instRsAccelVsSPY ?? 0) > 0 ? "text-white" : "text-red-400"}`}>
            {d.instRsAccelVsSPY !== null ? `${d.instRsAccelVsSPY >= 0 ? "+" : ""}${d.instRsAccelVsSPY.toFixed(1)}` : "-"}
          </p>
        </div>
        <div>
          <span className="text-[#555]">RS Accel QQQ</span>
          <p className={`font-medium ${(d.instRsAccelVsQQQ ?? 0) > 3 ? "text-emerald-400" : (d.instRsAccelVsQQQ ?? 0) > 0 ? "text-white" : "text-red-400"}`}>
            {d.instRsAccelVsQQQ !== null ? `${d.instRsAccelVsQQQ >= 0 ? "+" : ""}${d.instRsAccelVsQQQ.toFixed(1)}` : "-"}
          </p>
        </div>
        <div>
          <span className="text-[#555]">RS Sector</span>
          <p className="text-white font-medium">{fmtNum(d.relativeStrength20d)}</p>
        </div>
        <div>
          <span className="text-[#555]">Dist EMA20</span>
          <p className="text-white font-medium">{fmtNum(d.instDistFromEma20Atr)} ATR</p>
        </div>
        <div>
          <span className="text-[#555]">ATR%</span>
          <p className="text-white font-medium">{fmtNum(d.vcpAtrPct)}%</p>
        </div>
        <div>
          <span className="text-[#555]">Beta</span>
          <p className="text-white font-medium">{fmtNum(d.instBeta, 2)}</p>
        </div>
        <div>
          <span className="text-[#555]">Gap%</span>
          <p className="text-white font-medium">{fmtNum(d.instGapPct)}%</p>
        </div>
        <div>
          <span className="text-[#555]">DTE</span>
          <p className="text-white font-medium">{d.daysToEarnings ?? "-"}</p>
        </div>
        <div>
          <span className="text-[#555]">Avg $Vol</span>
          <p className="text-white font-medium">{fmtVol(d.vcpAvgDollarVolume)}</p>
        </div>
      </div>

      {/* Best Trigger + Avoid Reason */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {!avoid && (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[9px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            {triggerLabel(result.bestTrigger)}
          </span>
        )}
        {result.avoidReason && (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
            {result.avoidReason.length > 60 ? result.avoidReason.slice(0, 60) + "..." : result.avoidReason}
          </span>
        )}
      </div>

      {/* Commentary summary */}
      <p className="text-[10px] text-[#888] mb-3 leading-relaxed line-clamp-2">
        {result.commentary.summary}
      </p>

      {/* Bottom row: expand/collapse + watchlist */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-[#1f1f1f]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-[#666] hover:text-white transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Less" : "Details"}
        </button>
        {onAddToWatchlist && (
          <button
            onClick={() => onAddToWatchlist(d.ticker)}
            disabled={justAdded}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors ${
              justAdded
                ? "text-emerald-400 border border-emerald-500/30"
                : "text-[#666] hover:text-white border border-[#2a2a2a] hover:border-[#444]"
            }`}
          >
            {justAdded ? <Check className="h-3 w-3" /> : <ListPlus className="h-3 w-3" />}
            {justAdded ? "Added" : "Watch"}
          </button>
        )}
      </div>

      {/* Detail panel */}
      {expanded && <InstitutionalDetailPanel result={result} />}
    </div>
  );
});

// ── Detail Panel ──

function InstitutionalDetailPanel({ result }: { result: InstitutionalResult }) {
  const c = result.commentary;

  const sections = [
    { title: "Classification", content: c.classificationReason },
    { title: "Institutional Detail", content: c.institutionalDetail },
    { title: "Execution Detail", content: c.executionDetail },
    { title: "Risk Detail", content: c.riskDetail },
    { title: "Primary Trigger", content: c.primaryTrigger },
    ...(c.secondaryTrigger ? [{ title: "Secondary Trigger", content: c.secondaryTrigger }] : []),
    { title: "Invalidation", content: c.invalidation },
    { title: "What Improves Tomorrow", content: c.whatImprovesTomorrow },
  ];

  return (
    <div className="mt-3 pt-3 border-t border-[#1f1f1f] space-y-2.5">
      {sections.map((s) => (
        <div key={s.title}>
          <p className="text-[9px] uppercase tracking-wider text-[#555] mb-0.5">{s.title}</p>
          <p className="text-[10px] text-[#a0a0a0] leading-relaxed">{s.content}</p>
        </div>
      ))}
    </div>
  );
}
