"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowUpCircle,
  Plus,
  Shield,
  LogOut,
  Copy,
  Check,
  FileDown,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import type {
  RotationTrackerResult,
  ActiveRotationDetail,
  RotationEvent,
  RotationPatternStats,
  RotationStockPerformance,
  RRGQuadrant,
  LifecycleStage,
  ConvictionLevel,
  RegimeData,
  PairSignalData,
  StockCategory,
} from "@/lib/sector-rotation/rotation-types";
import type { SectorRotationScore } from "@/lib/sector-rotation/types";
import {
  getHealth,
  computeLifecycleStage,
  computeConviction,
  isRegimeAligned,
  computeActionSignal,
  type ActionSignal,
} from "@/lib/sector-rotation/rotation-helpers";
import { loadScanResults } from "@/lib/prerun/storage";
import { DataAgeBadge } from "@/components/data-age-badge";
import { type StockPhase, phaseBadge, PHASE_RANK } from "@/lib/phase-utils";

// ── localStorage cache (4-hour TTL) ──

const CACHE_KEY = "ew-rotation-tracker-v7";
const CACHE_TTL = 4 * 60 * 60 * 1000;
const AUTO_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function loadCached(): RotationTrackerResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as RotationTrackerResult;
  } catch {
    return null;
  }
}

function saveCache(data: RotationTrackerResult) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // localStorage full — ignore
  }
}

// ── Data freshness badge (shared) ──
// DataAgeBadge imported from @/components/data-age-badge

// ── Signal dot indicator ──

function SignalDot({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        active
          ? "bg-green-500/15 text-green-400"
          : "bg-[#2a2a2a] text-[#555]"
      }`}
      title={label}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          active ? "bg-green-400" : "bg-[#444]"
        }`}
      />
      {label}
    </span>
  );
}

// ── Performance color ──

function perfColor(pct: number): string {
  if (pct >= 5) return "text-green-400";
  if (pct > 0) return "text-green-400/70";
  if (pct > -5) return "text-red-400/70";
  return "text-red-400";
}

function perfBg(pct: number): string {
  if (pct >= 5) return "bg-green-500/10";
  if (pct > 0) return "bg-green-500/5";
  if (pct > -5) return "bg-red-500/5";
  return "bg-red-500/10";
}

// ── Phase classification (additive to existing action system) ──
// StockPhase, phaseBadge, PHASE_RANK imported from @/lib/phase-utils

function getRotationStockPhase(s: RotationStockPerformance): StockPhase {
  const ta = s.trendAccel ?? 0; // stock's own momentum (pctFromSMA50 - pctFromSMA200)
  if (ta < -2) return "exhausting";
  if (s.isTurnaroundCandidate) return "turnaround";
  if (!s.aboveSma50 && ta > 0 && s.performancePct <= 0) return "basing";
  if (s.aboveSma50 && ta > 0) return "trending";
  return "neutral";
}

function getEntryQuality(s: RotationStockPerformance): number {
  let quality = 0;
  if ((s.rsAcceleration ?? 0) > 1) quality++;
  if (s.volumeVsAvg >= 1.5) quality++;
  if (s.rsImproving && (s.volumeConsistency ?? 0) >= 3) quality++;
  return quality;
}

function RotationPhaseBadge({ stock }: { stock: RotationStockPerformance }) {
  const phase = getRotationStockPhase(stock);
  const badge = phaseBadge(phase);
  const quality = getEntryQuality(stock);
  return (
    <span className="inline-flex items-center gap-1" title={badge.description}>
      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}>
        {badge.label}
      </span>
      {(phase === "basing" || phase === "turnaround") && quality > 0 && (
        <span className="flex gap-0.5">
          {Array.from({ length: quality }).map((_, i) => (
            <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
          ))}
        </span>
      )}
    </span>
  );
}

// ── Quadrant + health helpers ──

function quadrantBadge(q: RRGQuadrant): { label: string; className: string } {
  switch (q) {
    case "LEADING":
      return { label: "LEADING", className: "bg-green-500/15 text-green-400 border-green-500/30" };
    case "WEAKENING":
      return { label: "WEAKENING", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    case "LAGGING":
      return { label: "LAGGING", className: "bg-red-500/15 text-red-400 border-red-500/30" };
    case "IMPROVING":
      return { label: "IMPROVING", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
  }
}

function accelColor(val: number): string {
  if (val > 1) return "text-green-400";
  if (val > 0) return "text-green-400/70";
  if (val > -1) return "text-red-400/70";
  return "text-red-400";
}

function cmfColor(val: number): string {
  if (val > 0.1) return "text-green-400";
  if (val > 0) return "text-green-400/70";
  if (val > -0.1) return "text-red-400/70";
  return "text-red-400";
}

function accelLabel(val: number): string {
  if (val > 1) return "Accelerating";
  if (val > 0) return "Gaining";
  if (val > -1) return "Slowing";
  return "Fading";
}

function cmfLabel(val: number): string {
  if (val > 0.1) return "Strong Inflow";
  if (val > 0) return "Mild Inflow";
  if (val > -0.1) return "Mild Outflow";
  return "Strong Outflow";
}

function lifecycleBadge(stage: LifecycleStage): { className: string; guidance: string } {
  switch (stage) {
    case "EARLY":
      return {
        className: "bg-green-500/15 text-green-400 border-green-500/30",
        guidance: "New rotation — consider entry",
      };
    case "MATURING":
      return {
        className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
        guidance: "Established trend — add on pullbacks",
      };
    case "LATE":
      return {
        className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        guidance: "Extended — tighten stops, reduce size",
      };
    case "EXHAUSTING":
      return {
        className: "bg-red-500/15 text-red-400 border-red-500/30",
        guidance: "Fading — consider exit or avoid new entries",
      };
  }
}

function convictionBadge(level: ConvictionLevel): string {
  switch (level) {
    case "HIGH":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "MODERATE":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "LOW":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "EXIT":
      return "bg-red-500/15 text-red-400 border-red-500/30";
  }
}

// ── Enhancement #3: Signal Sparkline + Exit Warnings ──

function SignalSparkline({ history }: { history: { date: string; signalCount: number }[] }) {
  if (history.length < 2) return null;

  const W = 80;
  const H = 24;
  const pad = 2;
  const maxSig = 3;
  const points = history.map((h, i) => {
    const x = pad + (i / (history.length - 1)) * (W - 2 * pad);
    const y = H - pad - (h.signalCount / maxSig) * (H - 2 * pad);
    return `${x},${y}`;
  });

  return (
    <svg width={W} height={H} className="inline-block" aria-label="Signal history">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="#5ba3e6"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

const EXIT_SIGNAL_DECLINE_THRESHOLD = 0.5;
const EXIT_ACCEL_FADE_THRESHOLD = -1;

function computeExitWarnings(event: RotationEvent): string[] {
  const warnings: string[] = [];
  const h = getHealth(event);
  const hist = event.signalHistory ?? [];

  // Signal count drop
  if (hist.length >= 5) {
    const recent = hist.slice(-3);
    const prior = hist.slice(-5, -2);
    const recentAvg = recent.reduce((s, entry) => s + entry.signalCount, 0) / recent.length;
    const priorAvg = prior.reduce((s, entry) => s + entry.signalCount, 0) / prior.length;
    if (recentAvg < priorAvg - EXIT_SIGNAL_DECLINE_THRESHOLD) {
      warnings.push("Signal strength declining");
    }
  }

  // Negative acceleration
  if (h.acceleration < EXIT_ACCEL_FADE_THRESHOLD) {
    warnings.push("Momentum fading sharply");
  }

  // Weak quadrant
  if (h.quadrant === "WEAKENING" || h.quadrant === "LAGGING") {
    warnings.push(`Quadrant: ${h.quadrant}`);
  }

  return warnings;
}

// ── Enhancement #4: Macro Regime Banner ──

function regimeColor(regime: RegimeData["regime"]): string {
  switch (regime) {
    case "RISK_ON": return "text-green-400";
    case "RISK_OFF": return "text-red-400";
    case "INFLATIONARY": return "text-amber-400";
    case "MIXED": return "text-[#888]";
  }
}

function regimeBorderColor(regime: RegimeData["regime"]): string {
  switch (regime) {
    case "RISK_ON": return "border-green-500/30";
    case "RISK_OFF": return "border-red-500/30";
    case "INFLATIONARY": return "border-amber-500/30";
    case "MIXED": return "border-[#333]";
  }
}

function RegimeBanner({ regime }: { regime: RegimeData }) {
  return (
    <div className={`rounded-lg border ${regimeBorderColor(regime.regime)} bg-[#1a1a1a] p-4`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <span className="text-xs text-[#888]">Regime</span>
          <div className={`text-sm font-semibold ${regimeColor(regime.regime)}`}>
            {regime.regime.replace("_", " ")}
          </div>
        </div>
        <div>
          <span className="text-xs text-[#888]">VIX</span>
          <div className={`text-sm font-medium ${regime.vix > 25 ? "text-red-400" : regime.vix < 18 ? "text-green-400" : "text-amber-400"}`}>
            {regime.vix.toFixed(1)}
            <span className="ml-1 text-[10px] text-[#666]">{regime.vixSlope}</span>
          </div>
        </div>
        <div>
          <span className="text-xs text-[#888]">10Y Yield</span>
          <div className="text-sm font-medium text-[#ccc]">{regime.yield10y.toFixed(2)}%</div>
        </div>
        <div>
          <span className="text-xs text-[#888]">USD (DXY)</span>
          <div className="text-sm font-medium text-[#ccc]">
            {regime.dxy.toFixed(1)}
            <span className="ml-1 text-[10px] text-[#666]">{regime.dxyTrend}</span>
          </div>
        </div>
        {regime.favoredSectors.length > 0 && (
          <div>
            <span className="text-xs text-[#888]">Favored</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {regime.favoredSectors.map((s) => (
                <span key={s} className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        {regime.avoidSectors.length > 0 && (
          <div>
            <span className="text-xs text-[#888]">Avoid</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {regime.avoidSectors.map((s) => (
                <span key={s} className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Enhancement #7: Pair Z-Score Bar ──

function PairZScoreBar({
  pairSignals,
}: {
  pairSignals: { xlyXlp: PairSignalData | null; xlkXlu: PairSignalData | null };
}) {
  const pairs = [pairSignals.xlyXlp, pairSignals.xlkXlu].filter(
    (p): p is PairSignalData => p !== null
  );
  if (pairs.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-4 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3">
      {pairs.map((p) => {
        const absZ = Math.abs(p.zScore);
        const barWidth = Math.min(100, (absZ / 3) * 100);
        const isPositive = p.zScore >= 0;
        const signalLabel =
          p.signal === "extreme_risk_on"
            ? "Risk-On Extreme"
            : p.signal === "extreme_risk_off"
              ? "Risk-Off Extreme"
              : "Neutral";
        const signalColor =
          p.signal === "extreme_risk_on"
            ? "text-green-400"
            : p.signal === "extreme_risk_off"
              ? "text-red-400"
              : "text-[#888]";

        return (
          <div key={p.pair} className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#ccc]">{p.pair}</span>
              <span className={signalColor}>{signalLabel}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="relative h-2 flex-1 rounded-full bg-[#222]">
                <div
                  className={`absolute top-0 h-2 rounded-full ${
                    p.isExtreme
                      ? isPositive
                        ? "bg-green-500"
                        : "bg-red-500"
                      : "bg-[#5ba3e6]"
                  }`}
                  style={{
                    width: `${barWidth}%`,
                    left: isPositive ? "50%" : `${50 - barWidth}%`,
                  }}
                />
                <div className="absolute left-1/2 top-0 h-2 w-px bg-[#444]" />
              </div>
              <span className={`text-xs font-mono ${p.isExtreme ? (isPositive ? "text-green-400" : "text-red-400") : "text-[#888]"}`}>
                {p.zScore > 0 ? "+" : ""}{p.zScore.toFixed(2)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Enhancement #5: Stock Categorization ──

function categorizeStock(
  stock: RotationStockPerformance,
  sectorAvgPct: number
): StockCategory {
  if (stock.isTurnaroundCandidate) return "turnaround";
  if (!stock.aboveSma50) return "avoid";
  if (stock.performancePct > sectorAvgPct && stock.volumeVsAvg >= 1.0) return "leader";
  return "catch-up";
}

function stockCategoryBadge(cat: StockCategory): { label: string; className: string } {
  switch (cat) {
    case "leader":
      return { label: "Leader", className: "bg-green-500/15 text-green-400" };
    case "catch-up":
      return { label: "Catch-up", className: "bg-cyan-500/15 text-cyan-400" };
    case "turnaround":
      return { label: "Turnaround", className: "bg-purple-500/15 text-purple-400" };
    case "avoid":
      return { label: "Avoid", className: "bg-red-500/15 text-red-400" };
  }
  return cat satisfies never;
}

// ── Strategy Overlay: Action Signal (logic imported from rotation-helpers) ──

function ActionIcon({ icon, className }: { icon: ActionSignal["icon"]; className?: string }) {
  switch (icon) {
    case "enter":
      return <ArrowUpCircle className={className} />;
    case "add":
      return <Plus className={className} />;
    case "hold":
      return <Shield className={className} />;
    case "exit":
      return <LogOut className={className} />;
  }
}

// ── Strategy Overlay: Stock Action ──

type StockAction = {
  label: string;
  rowBg: string;
  badgeClass: string;
  sortOrder: number;
};

function computeStockAction(
  category: StockCategory,
  lifecycle: LifecycleStage
): StockAction {
  if (category === "turnaround") {
    if (lifecycle === "EARLY" || lifecycle === "MATURING") {
      return { label: "Speculative Buy", rowBg: "bg-purple-500/8", badgeClass: "bg-purple-500/15 text-purple-400", sortOrder: 0 };
    }
    return { label: "Risky", rowBg: "bg-purple-500/5", badgeClass: "bg-purple-500/10 text-purple-400/70", sortOrder: 3 };
  }
  if (category === "avoid") {
    if (lifecycle === "EXHAUSTING") {
      return { label: "Exit", rowBg: "bg-red-500/8", badgeClass: "bg-red-500/15 text-red-400", sortOrder: 5 };
    }
    return { label: "Avoid", rowBg: "bg-red-500/5", badgeClass: "bg-red-500/15 text-red-400", sortOrder: 4 };
  }
  if (category === "leader") {
    if (lifecycle === "EARLY" || lifecycle === "MATURING") {
      return { label: "Hold", rowBg: "bg-green-500/8", badgeClass: "bg-green-500/15 text-green-400", sortOrder: 1 };
    }
    if (lifecycle === "LATE") {
      return { label: "Trim", rowBg: "bg-amber-500/8", badgeClass: "bg-amber-500/15 text-amber-400", sortOrder: 2 };
    }
    // EXHAUSTING
    return { label: "Exit", rowBg: "bg-red-500/8", badgeClass: "bg-red-500/15 text-red-400", sortOrder: 5 };
  }
  // catch-up
  if (lifecycle === "EARLY" || lifecycle === "MATURING") {
    return { label: "Buy", rowBg: "bg-cyan-500/8", badgeClass: "bg-cyan-500/15 text-cyan-400", sortOrder: 0 };
  }
  if (lifecycle === "LATE") {
    return { label: "Watch", rowBg: "", badgeClass: "bg-[#2a2a2a] text-[#888]", sortOrder: 3 };
  }
  // EXHAUSTING
  return { label: "Avoid", rowBg: "bg-red-500/5", badgeClass: "bg-red-500/15 text-red-400", sortOrder: 4 };
}

// ── Enhancement #6: Historical Projection ──

function HistoricalProjection({
  event,
  patternStats,
}: {
  event: RotationEvent;
  patternStats: RotationPatternStats[];
}) {
  const stats = patternStats.find((s) => s.sectorId === event.sectorId);
  if (!stats || stats.totalRotations < 2) return null;

  const completedCount = stats.history.length;
  if (completedCount === 0) return null;

  const pctThroughDuration =
    stats.avgDurationDays > 0
      ? Math.round((event.daysActive / stats.avgDurationDays) * 100)
      : 0;
  const pctThroughReturn =
    stats.avgPerformancePct !== 0
      ? Math.round((event.etfPerformancePct / stats.avgPerformancePct) * 100)
      : 0;
  const isPastAvgDuration = event.daysActive > stats.avgDurationDays;
  const isBeatingAvg = stats.avgPerformancePct >= 0
    ? pctThroughReturn > 100
    : pctThroughReturn < 100;

  return (
    <div className="mt-2 rounded-md bg-[#151515] px-3 py-2 text-[11px] text-[#999]">
      <span className="text-[#666]">Based on {completedCount} prior rotations:</span>{" "}
      avg {stats.avgDurationDays}d (you&apos;re at {event.daysActive}d —{" "}
      <span className={isPastAvgDuration ? "text-red-400" : "text-green-400/70"}>
        {pctThroughDuration}%
      </span>
      ), avg return{" "}
      {stats.avgPerformancePct > 0 ? "+" : ""}{stats.avgPerformancePct.toFixed(1)}% (you&apos;re at{" "}
      {event.etfPerformancePct > 0 ? "+" : ""}{event.etfPerformancePct.toFixed(1)}% —{" "}
      <span className={isBeatingAvg ? "text-green-400" : "text-[#999]"}>
        {pctThroughReturn}% of historical
      </span>
      )
    </div>
  );
}

// ── Section 1: Active Rotation Cards (enhanced) ──

function ActiveRotationCards({
  rotations,
  onExpand,
  expandedId,
  regime,
  patternStats,
}: {
  rotations: ActiveRotationDetail[];
  onExpand: (id: string | null) => void;
  expandedId: string | null;
  regime: RegimeData | null | undefined;
  patternStats: RotationPatternStats[];
}) {
  if (rotations.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center text-[#888]">
        No active rotations detected
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {rotations.map((r) => {
        const isExpanded = expandedId === r.event.sectorId;
        const h = getHealth(r.event);
        const lifecycle = computeLifecycleStage(r.event);
        const lcBadge = lifecycleBadge(lifecycle);
        const conviction = computeConviction(r.event);
        const exitWarnings = computeExitWarnings(r.event);
        const regimeAlignment = regime ? isRegimeAligned(r.event.sectorName, regime) : "neutral";
        const actionSignal = computeActionSignal(lifecycle, conviction, regimeAlignment);

        return (
          <button
            key={r.event.sectorId}
            onClick={() => onExpand(isExpanded ? null : r.event.sectorId)}
            className={`rounded-lg border-l-4 ${
              lifecycle === "EXHAUSTING" ? "border-red-500" : lifecycle === "LATE" ? "border-amber-500" : "border-green-500"
            } bg-[#1a1a1a] text-left transition-colors hover:bg-[#222] overflow-hidden ${
              isExpanded ? "ring-1 ring-green-500/30" : ""
            }`}
          >
            {/* Enhancement A: Action Signal Banner */}
            <div className={`flex items-center gap-2 px-4 py-1.5 ${actionSignal.bgColor} border-b ${actionSignal.borderColor}`}>
              <ActionIcon icon={actionSignal.icon} className={`h-3.5 w-3.5 ${actionSignal.color}`} />
              <span className={`text-xs font-semibold ${actionSignal.color}`}>{actionSignal.action}</span>
              {actionSignal.action === "EXIT" && lifecycle === "EXHAUSTING" && h.acceleration > 0 && conviction.level !== "EXIT" && (
                <span className="text-[10px] text-[#888]">
                  — Duration exhausted{h.cmf20 > 0 ? "; momentum & flow still positive" : "; momentum still positive"}
                </span>
              )}
            </div>

            <div className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white">
                  {r.event.sectorName}
                </h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <Link
                    href={`/sectors?sector=${encodeURIComponent(r.event.etf)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-[#5ba3e6] hover:text-[#7bb8f0] transition-colors"
                    title="View in Sector Dashboard"
                  >
                    {r.event.etf}
                  </Link>
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${quadrantBadge(h.quadrant).className}`}>
                    {quadrantBadge(h.quadrant).label}
                  </span>
                  {/* Enhancement #1: Lifecycle badge */}
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${lcBadge.className}`}>
                    {lifecycle}
                  </span>
                  {/* Enhancement #4: Regime alignment */}
                  {regime && regimeAlignment !== "neutral" && (
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                      regimeAlignment === "aligned"
                        ? "bg-green-500/10 text-green-400 border-green-500/30"
                        : "bg-red-500/10 text-red-400 border-red-500/30"
                    }`}>
                      {regimeAlignment === "aligned" ? "Regime Aligned" : "Regime Headwind"}
                    </span>
                  )}
                </div>
              </div>
              <span className={`text-lg font-bold ${perfColor(r.event.etfPerformancePct)}`}>
                {r.event.etfPerformancePct > 0 ? "+" : ""}
                {r.event.etfPerformancePct.toFixed(1)}%
              </span>
            </div>

            {/* Enhancement #2: Conviction score */}
            <div className="mt-2 flex items-center gap-2">
              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${convictionBadge(conviction.level)}`}>
                {conviction.level}
              </span>
              <span className="text-[10px] text-[#666] leading-tight">
                {conviction.reason}
              </span>
            </div>

            {/* Health signals */}
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#888]">Momentum</span>
                <span className={accelColor(h.acceleration)}>
                  {accelLabel(h.acceleration)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#888]">Money Flow</span>
                <span className={cmfColor(h.cmf20)}>
                  {cmfLabel(h.cmf20)}
                </span>
              </div>
            </div>

            {/* Enhancement #3: Signal sparkline + exit warnings */}
            <div className="mt-2 flex items-center gap-2">
              <SignalSparkline history={r.event.signalHistory ?? []} />
              {exitWarnings.length > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-amber-400">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span className="truncate">{exitWarnings[0]}</span>
                </div>
              )}
            </div>

            {/* Enhancement #1: Lifecycle guidance */}
            <div className="mt-1 text-[10px] text-[#666] italic">{lcBadge.guidance}</div>

            <div className="mt-2 flex items-center gap-2 text-xs text-[#888]">
              <span>Started {r.event.startDate}</span>
              <span className="text-[#555]">|</span>
              <span>{r.event.daysActive}d active</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              <SignalDot
                active={r.event.signals.rsGoldenCross}
                label="RS Cross"
              />
              <SignalDot
                active={r.event.signals.volumeSurge}
                label="Vol Surge"
              />
              <SignalDot
                active={r.event.signals.priceAbove50MA}
                label=">50MA"
              />
            </div>

            {/* Enhancement #6: Historical projection */}
            <HistoricalProjection event={r.event} patternStats={patternStats} />

            <div className="mt-2 flex items-center justify-end text-xs text-[#666]">
              {isExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </div>
            </div>{/* close p-4 wrapper */}
          </button>
        );
      })}
    </div>
  );
}

// ── Section 2: Stock Performance Table (sortable + categorized) ──

function actionChipColors(label: string): { bg: string; text: string; border: string } {
  switch (label) {
    case "Buy": return { bg: "bg-cyan-500/15", text: "text-cyan-400", border: "border-cyan-500/40" };
    case "Hold": return { bg: "bg-green-500/15", text: "text-green-400", border: "border-green-500/40" };
    case "Trim": return { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/40" };
    case "Speculative Buy": return { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/40" };
    case "Risky": return { bg: "bg-purple-500/10", text: "text-purple-400/70", border: "border-purple-500/30" };
    case "Watch": return { bg: "bg-[#2a2a2a]", text: "text-[#888]", border: "border-[#444]" };
    case "Avoid": return { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/40" };
    case "Exit": return { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/40" };
    default: return { bg: "bg-[#2a2a2a]", text: "text-[#888]", border: "border-[#444]" };
  }
}

type StockSortKey = "symbol" | "name" | "action" | "phase" | "sector" | "priceAtRotationStart" | "priceNow" | "dailyChangePct" | "performancePct" | "vsEtf" | "aboveSma50" | "volumeVsAvg" | "rs20d" | "trendAccel" | "rsAcceleration" | "earnings" | "verdict" | "finalScore";

function StockPerformanceTable({
  detail,
  lifecycle,
  sectorMap,
  lifecycleMap,
}: {
  detail: ActiveRotationDetail;
  lifecycle: LifecycleStage;
  sectorMap?: Map<string, string>;
  lifecycleMap?: Map<string, LifecycleStage>;
}) {
  const [sortKey, setSortKey] = useState<StockSortKey>("performancePct");
  const [sortAsc, setSortAsc] = useState(false);
  const [actionFilter, setActionFilter] = useState<Set<string>>(new Set());
  const [sma50Filter, setSma50Filter] = useState<"all" | "above" | "below">("all");
  const [rsAccelFilter, setRsAccelFilter] = useState<"all" | "positive" | "negative">("all");
  const [volFilter, setVolFilter] = useState<"all" | "above" | "below">("all");
  const [phaseFilter, setPhaseFilter] = useState<"all" | "basing" | "turnaround" | "trending" | "exhausting">("all");
  const [trendAccelFilter, setTrendAccelFilter] = useState<"all" | "positive" | "negative">("all");
  const [rs20dFilter, setRs20dFilter] = useState<"all" | "positive" | "negative">("all");
  const [qualityFilter, setQualityFilter] = useState<"all" | "improving" | "high" | "fading">("all");
  const [verdictFilter, setVerdictFilter] = useState<"all" | "priority" | "keep" | "watch">("all");

  const sectorAvgPct =
    detail.stocks.length > 0
      ? detail.stocks.reduce((s, st) => s + st.performancePct, 0) / detail.stocks.length
      : 0;

  const etfPerfPct = detail.event.etfPerformancePct;

  const availableActions = useMemo(() => {
    const actions = new Set<string>();
    for (const s of detail.stocks) {
      const cat = categorizeStock(s, sectorAvgPct);
      const stockLifecycle = lifecycleMap?.get(s.symbol) ?? lifecycle;
      const action = computeStockAction(cat, stockLifecycle);
      actions.add(action.label);
    }
    const ORDER = ["Buy", "Hold", "Trim", "Speculative Buy", "Risky", "Watch", "Avoid", "Exit"];
    return ORDER.filter(a => actions.has(a));
  }, [detail.stocks, sectorAvgPct, lifecycle, lifecycleMap]);

  const hasActiveFilter = actionFilter.size > 0 || sma50Filter !== "all" || rsAccelFilter !== "all" || volFilter !== "all" || phaseFilter !== "all" || trendAccelFilter !== "all" || rs20dFilter !== "all" || qualityFilter !== "all" || verdictFilter !== "all";

  const earlyStrengthActive = phaseFilter === "turnaround" && qualityFilter === "high" && trendAccelFilter === "positive";

  function toggleEarlyStrength() {
    if (earlyStrengthActive) {
      setPhaseFilter("all");
      setQualityFilter("all");
      setTrendAccelFilter("all");
    } else {
      setPhaseFilter("turnaround");
      setQualityFilter("high");
      setTrendAccelFilter("positive");
    }
  }

  function toggleAction(label: string) {
    setActionFilter(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function resetFilters() {
    setActionFilter(new Set());
    setSma50Filter("all");
    setRsAccelFilter("all");
    setVolFilter("all");
    setPhaseFilter("all");
    setTrendAccelFilter("all");
    setRs20dFilter("all");
    setQualityFilter("all");
    setVerdictFilter("all");
  }

  const sorted = useMemo(() => {
    let copy = detail.stocks.map((s) => {
      const cat = categorizeStock(s, sectorAvgPct);
      const stockLifecycle = lifecycleMap?.get(s.symbol) ?? lifecycle;
      const stockAction = computeStockAction(cat, stockLifecycle);
      const vsEtf = s.performancePct - etfPerfPct;
      const isTurnaroundSetup = !s.aboveSma50 && (s.trendAccel ?? 0) > 0 && s.volumeVsAvg >= 1.2;
      return { stock: s, cat, stockAction, vsEtf, isTurnaroundSetup };
    });
    // Filter
    if (actionFilter.size > 0) {
      copy = copy.filter(item => actionFilter.has(item.stockAction.label));
    }
    if (sma50Filter === "above") copy = copy.filter(item => item.stock.aboveSma50);
    else if (sma50Filter === "below") copy = copy.filter(item => !item.stock.aboveSma50);
    if (rsAccelFilter === "positive") copy = copy.filter(item => (item.stock.rsAcceleration ?? 0) > 0);
    else if (rsAccelFilter === "negative") copy = copy.filter(item => (item.stock.rsAcceleration ?? 0) < 0);
    if (volFilter === "above") copy = copy.filter(item => item.stock.volumeVsAvg >= 1.2);
    else if (volFilter === "below") copy = copy.filter(item => item.stock.volumeVsAvg < 1.2);
    if (phaseFilter !== "all") copy = copy.filter(item => getRotationStockPhase(item.stock) === phaseFilter);
    if (trendAccelFilter === "positive") copy = copy.filter(item => item.stock.trendAccel != null && item.stock.trendAccel > 0);
    else if (trendAccelFilter === "negative") copy = copy.filter(item => item.stock.trendAccel != null && item.stock.trendAccel < 0);
    if (rs20dFilter === "positive") copy = copy.filter(item => item.stock.rs20d != null && item.stock.rs20d > 0);
    else if (rs20dFilter === "negative") copy = copy.filter(item => item.stock.rs20d != null && item.stock.rs20d < 0);
    if (qualityFilter === "improving") copy = copy.filter(item => item.stock.rsImproving);
    else if (qualityFilter === "high") copy = copy.filter(item =>
      item.stock.rsImproving && (item.stock.volumeConsistency ?? 0) >= 3
    );
    else if (qualityFilter === "fading") copy = copy.filter(item =>
      !item.stock.rsImproving && (item.stock.rsAcceleration ?? 0) < 0
    );
    if (verdictFilter === "priority") copy = copy.filter(item => item.stock.verdict === "PRIORITY" || item.stock.verdict === "PRIORITY BUY");
    else if (verdictFilter === "keep") copy = copy.filter(item => item.stock.verdict === "KEEP");
    else if (verdictFilter === "watch") copy = copy.filter(item => item.stock.verdict === "WATCH");
    // Sort
    copy.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortKey === "action") {
        av = a.stockAction.sortOrder;
        bv = b.stockAction.sortOrder;
      } else if (sortKey === "phase") {
        av = PHASE_RANK[getRotationStockPhase(a.stock)];
        bv = PHASE_RANK[getRotationStockPhase(b.stock)];
      } else if (sortKey === "earnings") {
        av = a.stock.daysToEarnings ?? 9999;
        bv = b.stock.daysToEarnings ?? 9999;
      } else if (sortKey === "trendAccel") {
        av = a.stock.trendAccel ?? -9999;
        bv = b.stock.trendAccel ?? -9999;
      } else if (sortKey === "rs20d") {
        av = a.stock.rs20d ?? -9999;
        bv = b.stock.rs20d ?? -9999;
      } else if (sortKey === "sector") {
        av = sectorMap?.get(a.stock.symbol) ?? "";
        bv = sectorMap?.get(b.stock.symbol) ?? "";
      } else if (sortKey === "vsEtf") {
        av = a.vsEtf;
        bv = b.vsEtf;
      } else if (sortKey === "aboveSma50") {
        av = a.stock.aboveSma50 ? 1 : 0;
        bv = b.stock.aboveSma50 ? 1 : 0;
      } else if (sortKey === "verdict") {
        const VERDICT_RANK: Record<string, number> = { "PRIORITY": 0, "PRIORITY BUY": 0, "KEEP": 1, "WATCH": 2 };
        av = VERDICT_RANK[a.stock.verdict ?? ""] ?? 3;
        bv = VERDICT_RANK[b.stock.verdict ?? ""] ?? 3;
      } else if (sortKey === "finalScore") {
        av = a.stock.finalScore ?? -1;
        bv = b.stock.finalScore ?? -1;
      } else {
        av = a.stock[sortKey] ?? 0;
        bv = b.stock[sortKey] ?? 0;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return copy;
  }, [detail.stocks, sectorAvgPct, sortKey, sortAsc, lifecycle, lifecycleMap, etfPerfPct, actionFilter, sma50Filter, rsAccelFilter, volFilter, phaseFilter, trendAccelFilter, rs20dFilter, qualityFilter, verdictFilter, sectorMap]);

  if (detail.stocks.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-[#888]">
        No stock data available for this rotation
      </p>
    );
  }

  function handleSort(key: StockSortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "symbol" || key === "name");
    }
  }

  function SortArrow({ col }: { col: StockSortKey }) {
    if (sortKey !== col) return <span className="ml-1 text-[#444]">&uarr;&darr;</span>;
    return <span className="ml-1 text-[#5ba3e6]">{sortAsc ? "\u25B2" : "\u25BC"}</span>;
  }

  const stockAriaSort = (col: StockSortKey): "ascending" | "descending" | "none" =>
    sortKey === col ? (sortAsc ? "ascending" : "descending") : "none";

  const phaseCounts = useMemo(() => {
    const counts = { basing: 0, turnaround: 0, trending: 0, exhausting: 0, neutral: 0 };
    for (const s of detail.stocks) counts[getRotationStockPhase(s)]++;
    return counts;
  }, [detail.stocks]);

  return (
    <div>
      {/* Phase summary bar */}
      <div className="flex items-center gap-1.5 flex-wrap border-b border-[#2a2a2a] bg-[#141414] px-4 py-2">
        <button onClick={() => setPhaseFilter(phaseFilter === "basing" ? "all" : "basing")} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${phaseFilter === "basing" ? "bg-purple-500/20 text-purple-400 border-purple-500/40" : "bg-purple-500/5 text-purple-400/70 border-purple-500/20 hover:bg-purple-500/10"}`} title="Phase 1: Below 50MA, momentum turning — watch for confirmation">
          P1: {phaseCounts.basing}
        </button>
        <button onClick={() => setPhaseFilter(phaseFilter === "turnaround" ? "all" : "turnaround")} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${phaseFilter === "turnaround" ? "bg-amber-500/20 text-amber-400 border-amber-500/40" : "bg-amber-500/5 text-amber-400/70 border-amber-500/20 hover:bg-amber-500/10"}`} title="Phase 2: Below 50MA, RS positive + volume — entry zone">
          P2: {phaseCounts.turnaround}
        </button>
        <button onClick={() => setPhaseFilter(phaseFilter === "trending" ? "all" : "trending")} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${phaseFilter === "trending" ? "bg-green-500/20 text-green-400 border-green-500/40" : "bg-green-500/5 text-green-400/70 border-green-500/20 hover:bg-green-500/10"}`} title="Phase 3: Above 50MA, accelerating — hold or add on dips">
          P3: {phaseCounts.trending}
        </button>
        <button onClick={() => setPhaseFilter(phaseFilter === "exhausting" ? "all" : "exhausting")} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${phaseFilter === "exhausting" ? "bg-red-500/20 text-red-400 border-red-500/40" : "bg-red-500/5 text-red-400/70 border-red-500/20 hover:bg-red-500/10"}`} title="Phase 4: Momentum fading (Trend Accel < -2) — take profit">
          P4: {phaseCounts.exhausting}
        </button>
        <span className="text-[10px] text-[#555]" title="Neutral: Mixed or insufficient signals">—: {phaseCounts.neutral}</span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#2a2a2a] bg-[#141414] px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {availableActions.map(label => {
            const colors = actionChipColors(label);
            const active = actionFilter.has(label);
            return (
              <button
                key={label}
                onClick={() => toggleAction(label)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  active
                    ? `${colors.bg} ${colors.text} ${colors.border}`
                    : "bg-transparent text-[#555] border-[#333] hover:text-[#888] hover:border-[#444]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="h-4 w-px bg-[#333]" />
        <button
          onClick={toggleEarlyStrength}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            earlyStrengthActive
              ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
              : "bg-[#1a1a1a] text-[#888] ring-1 ring-[#333] hover:text-[#ccc]"
          }`}
          title="Preset: Phase=P2 Turnaround + Quality=High + Trend Accel=Positive"
        >
          Early Strength
        </button>
        <div className="h-4 w-px bg-[#333]" />
        <select
          value={sma50Filter}
          onChange={e => setSma50Filter(e.target.value as "all" | "above" | "below")}
          aria-label="Filter by 50-day SMA"
          className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#ccc] outline-none focus:border-[#5ba3e6]"
        >
          <option value="all">50MA: All</option>
          <option value="above">Above 50MA</option>
          <option value="below">Below 50MA</option>
        </select>
        <select
          value={rsAccelFilter}
          onChange={e => setRsAccelFilter(e.target.value as "all" | "positive" | "negative")}
          aria-label="Filter by sector RS"
          className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#ccc] outline-none focus:border-[#5ba3e6]"
        >
          <option value="all">Sector RS: All</option>
          <option value="positive">Positive (catching up)</option>
          <option value="negative">Negative (fading)</option>
        </select>
        <select
          value={trendAccelFilter}
          onChange={e => setTrendAccelFilter(e.target.value as "all" | "positive" | "negative")}
          aria-label="Filter by trend acceleration"
          className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#ccc] outline-none focus:border-[#5ba3e6]"
        >
          <option value="all">Trend Accel: All</option>
          <option value="positive">Positive (accelerating)</option>
          <option value="negative">Negative (decelerating)</option>
        </select>
        <select
          value={rs20dFilter}
          onChange={e => setRs20dFilter(e.target.value as "all" | "positive" | "negative")}
          aria-label="Filter by RS 20d"
          className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#ccc] outline-none focus:border-[#5ba3e6]"
        >
          <option value="all">RS 20d: All</option>
          <option value="positive">Positive</option>
          <option value="negative">Negative</option>
        </select>
        <select
          value={volFilter}
          onChange={e => setVolFilter(e.target.value as "all" | "above" | "below")}
          aria-label="Filter by volume"
          className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#ccc] outline-none focus:border-[#5ba3e6]"
        >
          <option value="all">Volume: All</option>
          <option value="above">Above Avg (&ge;1.2x)</option>
          <option value="below">Below Avg</option>
        </select>
        <select
          value={qualityFilter}
          onChange={e => setQualityFilter(e.target.value as "all" | "improving" | "high" | "fading")}
          aria-label="Filter by quality"
          className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#ccc] outline-none focus:border-[#5ba3e6]"
        >
          <option value="all">Quality: All</option>
          <option value="improving">RS Improving</option>
          <option value="high">High Quality</option>
          <option value="fading">Fading</option>
        </select>
        <select
          value={phaseFilter}
          onChange={e => setPhaseFilter(e.target.value as "all" | "basing" | "turnaround" | "trending" | "exhausting")}
          aria-label="Filter by phase"
          className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#ccc] outline-none focus:border-[#5ba3e6]"
        >
          <option value="all">Phase: All</option>
          <option value="basing">P1 Basing</option>
          <option value="turnaround">P2 Turnaround</option>
          <option value="trending">P3 Trending</option>
          <option value="exhausting">P4 Exhausting</option>
        </select>
        <select
          value={verdictFilter}
          onChange={e => setVerdictFilter(e.target.value as "all" | "priority" | "keep" | "watch")}
          aria-label="Filter by verdict"
          className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#ccc] outline-none focus:border-[#5ba3e6]"
        >
          <option value="all">Verdict: All</option>
          <option value="priority">Priority</option>
          <option value="keep">Keep</option>
          <option value="watch">Watch</option>
        </select>
        {hasActiveFilter && (
          <button
            onClick={resetFilters}
            className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#888] transition-colors hover:text-white hover:border-[#444]"
          >
            Reset
          </button>
        )}
        {hasActiveFilter && (
          <span className="ml-auto text-xs text-[#888]">
            <span className="font-medium text-white">{sorted.length}</span> of {detail.stocks.length} stocks
          </span>
        )}
      </div>

      {sorted.length === 0 && hasActiveFilter ? (
        <div className="flex flex-col items-center gap-2 py-8 text-sm text-[#888]">
          <span>No stocks match filters</span>
          <button
            onClick={resetFilters}
            className="rounded border border-[#333] bg-[#1a1a1a] px-3 py-1.5 text-xs text-[#888] transition-colors hover:text-white hover:border-[#444]"
          >
            Reset filters
          </button>
        </div>
      ) : (
      <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#2a2a2a] text-left text-[10px] text-[#888]">
            <th className="cursor-pointer px-1.5 py-1.5 select-none hover:text-white" onClick={() => handleSort("symbol")} aria-sort={stockAriaSort("symbol")}>
              Symbol<SortArrow col="symbol" />
            </th>
            {sectorMap && (
              <th className="cursor-pointer px-1.5 py-1.5 select-none hover:text-white" onClick={() => handleSort("sector")} aria-sort={stockAriaSort("sector")}>
                Sector<SortArrow col="sector" />
              </th>
            )}
            <th className="cursor-pointer px-1.5 py-1.5 text-center select-none hover:text-white" onClick={() => handleSort("phase")} aria-sort={stockAriaSort("phase")}>
              Phase<SortArrow col="phase" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 select-none hover:text-white" onClick={() => handleSort("name")} aria-sort={stockAriaSort("name")}>
              Name<SortArrow col="name" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-center select-none hover:text-white" onClick={() => handleSort("action")} aria-sort={stockAriaSort("action")}>
              Action<SortArrow col="action" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-right select-none hover:text-white" onClick={() => handleSort("priceAtRotationStart")} aria-sort={stockAriaSort("priceAtRotationStart")}>
              Start<SortArrow col="priceAtRotationStart" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-right select-none hover:text-white" onClick={() => handleSort("priceNow")} aria-sort={stockAriaSort("priceNow")}>
              Now<SortArrow col="priceNow" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-right select-none hover:text-white" onClick={() => handleSort("dailyChangePct")} aria-sort={stockAriaSort("dailyChangePct")}>
              Today<SortArrow col="dailyChangePct" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-right select-none hover:text-white" onClick={() => handleSort("performancePct")} aria-sort={stockAriaSort("performancePct")}>
              %Chg<SortArrow col="performancePct" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-right select-none hover:text-white" onClick={() => handleSort("vsEtf")} aria-sort={stockAriaSort("vsEtf")}>
              vsETF<SortArrow col="vsEtf" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-center select-none hover:text-white" onClick={() => handleSort("aboveSma50")} aria-sort={stockAriaSort("aboveSma50")}>
              50MA<SortArrow col="aboveSma50" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-right select-none hover:text-white" onClick={() => handleSort("volumeVsAvg")} aria-sort={stockAriaSort("volumeVsAvg")}>
              Vol<SortArrow col="volumeVsAvg" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-right select-none hover:text-white" onClick={() => handleSort("rs20d")} aria-sort={stockAriaSort("rs20d")} title="20-day relative strength vs market. Positive = outperforming over 20 days.">
              RS20<SortArrow col="rs20d" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-right select-none hover:text-white" onClick={() => handleSort("trendAccel")} aria-sort={stockAriaSort("trendAccel")} title="Short-term trend vs long-term trend (% from 50MA minus % from 200MA). Positive = accelerating uptrend.">
              TrAcc<SortArrow col="trendAccel" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-right select-none hover:text-white" onClick={() => handleSort("rsAcceleration")} aria-sort={stockAriaSort("rsAcceleration")} title="Relative strength acceleration vs sector ETF (5d vs 20d). Positive = gaining ground vs sector recently.">
              SecRS<SortArrow col="rsAcceleration" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-right select-none hover:text-white" onClick={() => handleSort("earnings")} aria-sort={stockAriaSort("earnings")}>
              Earn<SortArrow col="earnings" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-center select-none hover:text-white" onClick={() => handleSort("verdict")} aria-sort={stockAriaSort("verdict")} title="Pre-run scan verdict">
              Verdict<SortArrow col="verdict" />
            </th>
            <th className="cursor-pointer px-1.5 py-1.5 text-right select-none hover:text-white" onClick={() => handleSort("finalScore")} aria-sort={stockAriaSort("finalScore")} title="Pre-run scan score (0-41)">
              Score<SortArrow col="finalScore" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ stock: s, stockAction, vsEtf, isTurnaroundSetup }) => {
            return (
              <tr
                key={s.symbol}
                className={`border-b border-[#1a1a1a] transition-colors hover:bg-[#1a1a1a] ${
                  isTurnaroundSetup ? "border-l-2 border-l-amber-400 bg-amber-500/5" : stockAction.rowBg
                }`}
              >
                <td className="px-1.5 py-1.5 font-mono font-semibold text-white whitespace-nowrap">
                  <span>{s.symbol}</span>
                  {isTurnaroundSetup && (
                    <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-400">
                      TA
                    </span>
                  )}
                </td>
                {sectorMap && (
                  <td className="px-1.5 py-1.5 text-[#a0a0a0] truncate max-w-[80px]">{sectorMap.get(s.symbol) ?? ""}</td>
                )}
                <td className="px-1.5 py-1.5 text-center">
                  <RotationPhaseBadge stock={s} />
                </td>
                <td className="px-1.5 py-1.5 text-[#ccc] truncate max-w-[100px]" title={s.name}>{s.name}</td>
                <td className="px-1.5 py-1.5 text-center">
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${stockAction.badgeClass}`}>
                    {stockAction.label}
                  </span>
                </td>
                <td className="px-1.5 py-1.5 text-right text-[#888]">
                  ${s.priceAtRotationStart.toFixed(2)}
                </td>
                <td className="px-1.5 py-1.5 text-right text-white">
                  ${s.priceNow.toFixed(2)}
                </td>
                <td className={`px-1.5 py-1.5 text-right font-semibold ${perfColor(s.dailyChangePct ?? 0)}`}>
                  {(s.dailyChangePct ?? 0) > 0 ? "+" : ""}
                  {(s.dailyChangePct ?? 0).toFixed(1)}%
                </td>
                <td className={`px-1.5 py-1.5 text-right font-semibold ${perfColor(s.performancePct)}`}>
                  {s.performancePct > 0 ? "+" : ""}
                  {s.performancePct.toFixed(1)}%
                </td>
                <td className={`px-1.5 py-1.5 text-right font-mono ${vsEtf >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {vsEtf >= 0 ? "+" : ""}{vsEtf.toFixed(1)}%
                </td>
                <td className="px-1.5 py-1.5 text-center">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      s.aboveSma50 ? "bg-green-400" : "bg-red-400"
                    }`}
                    role="img"
                    aria-label={s.aboveSma50 ? "Above 50d SMA" : "Below 50d SMA"}
                  />
                </td>
                <td className="px-1.5 py-1.5 text-right text-[#888]">
                  {s.volumeVsAvg.toFixed(1)}x
                </td>
                <td className={`px-1.5 py-1.5 text-right font-mono ${s.rs20d == null ? "text-[#444]" : s.rs20d > 0 ? "text-green-400" : s.rs20d < 0 ? "text-red-400" : "text-[#666]"}`}>
                  {s.rs20d != null ? `${s.rs20d > 0 ? "+" : ""}${s.rs20d.toFixed(1)}%` : "-"}
                </td>
                <td className={`px-1.5 py-1.5 text-right font-mono ${s.trendAccel == null ? "text-[#444]" : s.trendAccel > 0 ? "text-green-400" : s.trendAccel < 0 ? "text-red-400" : "text-[#666]"}`}>
                  {s.trendAccel != null ? `${s.trendAccel > 0 ? "+" : ""}${s.trendAccel.toFixed(2)}` : "-"}
                </td>
                <td className={`px-1.5 py-1.5 text-right font-mono ${(s.rsAcceleration ?? 0) > 0 ? "text-green-400" : (s.rsAcceleration ?? 0) < 0 ? "text-red-400" : "text-[#666]"}`}>
                  {(s.rsAcceleration ?? 0) > 0 ? "+" : ""}{(s.rsAcceleration ?? 0).toFixed(2)}
                  <span className={`ml-0.5 ${s.rsImproving ? "text-green-400" : "text-red-400"}`} title={`RS Delta: ${(s.rsDelta ?? 0) > 0 ? "+" : ""}${(s.rsDelta ?? 0).toFixed(2)}`}>
                    {s.rsImproving ? "\u25B2" : "\u25BC"}
                  </span>
                </td>
                <td className={`px-1.5 py-1.5 text-right ${s.daysToEarnings == null ? "text-[#444]" : s.daysToEarnings <= 7 ? "text-red-400" : s.daysToEarnings <= 14 ? "text-amber-400" : s.daysToEarnings <= 30 ? "text-[#a0a0a0]" : "text-[#555]"}`} title={s.nextEarningsDate ?? undefined}>
                  {s.daysToEarnings != null ? `${s.daysToEarnings}d` : "-"}
                </td>
                <td className="px-1.5 py-1.5 text-center">
                  {s.verdict ? (
                    <span className={`inline-flex rounded-full border px-1 py-0.5 text-[9px] font-semibold ${
                      s.verdict === "PRIORITY" || s.verdict === "PRIORITY BUY" ? "bg-green-500/15 text-green-400 border-green-500/30" :
                      s.verdict === "KEEP" ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" :
                      s.verdict === "WATCH" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                      "bg-red-500/15 text-red-400 border-red-500/30"
                    }`}>{s.verdict}</span>
                  ) : <span className="text-[#444]">-</span>}
                </td>
                <td className="px-1.5 py-1.5 text-right text-[#666]">{s.finalScore != null && s.finalScore > 0 ? s.finalScore : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
      )}
    </div>
  );
}

// ── Expanded Rotation Detail (extracted from IIFE) ──

function ExpandedRotationDetail({ detail, regime }: { detail: ActiveRotationDetail; regime: RegimeData | null | undefined }) {
  const lc = computeLifecycleStage(detail.event);
  const conv = computeConviction(detail.event);
  const ra = regime ? isRegimeAligned(detail.event.sectorName, regime) : "neutral";
  const as_ = computeActionSignal(lc, conv, ra);
  return (
    <section className="rounded-lg border border-[#2a2a2a] bg-[#111] overflow-hidden">
      <div className="border-b border-[#2a2a2a] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-white">
            {detail.event.sectorName} — Top Stocks Since Rotation
            Start ({detail.event.startDate})
          </h2>
          <Link
            href={`/sectors?sector=${encodeURIComponent(detail.event.etf)}`}
            className="flex items-center gap-1 rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-[10px] text-[#5ba3e6] transition-colors hover:text-[#7bb8f0] hover:border-[#444]"
          >
            <ExternalLink className="h-3 w-3" /> Sector Dashboard
          </Link>
        </div>
        <CopyExportBar stocks={detail.stocks} sectorName={detail.event.sectorName} />
      </div>
      <StrategySummaryBar detail={detail} lifecycle={lc} actionSignal={as_} />
      <StockPerformanceTable detail={detail} lifecycle={lc} />
    </section>
  );
}

// ── Enhancement D: Strategy Summary Bar ──

function StrategySummaryBar({
  detail,
  lifecycle,
  actionSignal,
}: {
  detail: ActiveRotationDetail;
  lifecycle: LifecycleStage;
  actionSignal: ActionSignal;
}) {
  const sectorAvgPct =
    detail.stocks.length > 0
      ? detail.stocks.reduce((s, st) => s + st.performancePct, 0) / detail.stocks.length
      : 0;

  let leaders = 0;
  let entryCandidates = 0;
  let avoidCount = 0;
  let turnaroundCount = 0;

  for (const s of detail.stocks) {
    const cat = categorizeStock(s, sectorAvgPct);
    const action = computeStockAction(cat, lifecycle);
    if (action.label === "Hold" || action.label === "Trim") leaders++;
    else if (action.label === "Buy") entryCandidates++;
    else if (action.label === "Speculative Buy" || action.label === "Risky") turnaroundCount++;
    else if (action.label === "Avoid" || action.label === "Exit") avoidCount++;
  }

  return (
    <div className={`border-b ${actionSignal.borderColor} ${actionSignal.bgColor} px-4 py-3`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <div className="flex items-center gap-2">
          <ActionIcon icon={actionSignal.icon} className={`h-4 w-4 ${actionSignal.color}`} />
          <span className={`text-sm font-semibold ${actionSignal.color}`}>{actionSignal.action}</span>
          <span className="text-xs text-[#888]">— {actionSignal.description}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#888]">
          {leaders > 0 && <span>Leaders: <span className="text-green-400 font-medium">{leaders}</span></span>}
          {entryCandidates > 0 && <span>Entry Candidates: <span className="text-cyan-400 font-medium">{entryCandidates}</span></span>}
          {turnaroundCount > 0 && <span>Turnarounds: <span className="text-purple-400 font-medium">{turnaroundCount}</span></span>}
          {avoidCount > 0 && <span>Avoid: <span className="text-red-400 font-medium">{avoidCount}</span></span>}
          <span className="text-[#666]">|</span>
          <span>
            ETF ({detail.event.etf}){" "}
            <span className={perfColor(detail.event.etfPerformancePct)}>
              {detail.event.etfPerformancePct > 0 ? "+" : ""}{detail.event.etfPerformancePct.toFixed(1)}%
            </span>
            {" "}since rotation start
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Section 3: Historical Timeline ──

function HistoricalTimeline({ events }: { events: RotationEvent[] }) {
  // Group events by sector
  const sectors = useMemo(() => {
    const map = new Map<string, { etf: string; name: string; events: RotationEvent[] }>();
    for (const e of events) {
      if (!map.has(e.sectorId)) {
        map.set(e.sectorId, { etf: e.etf, name: e.sectorName, events: [] });
      }
      const entry = map.get(e.sectorId);
      if (entry) entry.events.push(e);
    }
    // Sort by sector name
    return Array.from(map.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name)
    );
  }, [events]);

  if (sectors.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center text-[#888]">
        No rotation events to display
      </div>
    );
  }

  // Date range: 12 months ago to today
  const now = new Date();
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const startMs = yearAgo.getTime();
  const endMs = now.getTime();
  const rangeMs = endMs - startMs;

  const W = 900;
  const H = sectors.length * 32 + 60;
  const LEFT = 70;
  const RIGHT = 20;
  const TOP = 30;
  const BAR_H = 16;

  // Month labels
  const months: { label: string; x: number }[] = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(yearAgo);
    d.setMonth(d.getMonth() + m);
    const x =
      LEFT +
      ((d.getTime() - startMs) / rangeMs) * (W - LEFT - RIGHT);
    months.push({
      label: d.toLocaleString("en-US", { month: "short" }),
      x,
    });
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[600px]"
        role="img"
        aria-label="Sector rotation timeline"
      >
        {/* Month grid lines and labels */}
        {months.map((m, i) => (
          <g key={i}>
            <line
              x1={m.x}
              y1={TOP - 5}
              x2={m.x}
              y2={H - 10}
              stroke="#222"
              strokeWidth={1}
            />
            <text
              x={m.x}
              y={TOP - 10}
              textAnchor="middle"
              fill="#666"
              fontSize={10}
            >
              {m.label}
            </text>
          </g>
        ))}

        {/* Sector rows */}
        {sectors.map(([sectorId, { etf, name, events: sectorEvents }], rowIdx) => {
          const y = TOP + rowIdx * 32;

          return (
            <g key={sectorId}>
              {/* Sector label */}
              <text
                x={LEFT - 5}
                y={y + BAR_H / 2 + 4}
                textAnchor="end"
                fill="#aaa"
                fontSize={10}
              >
                {etf}
              </text>

              {/* Row background */}
              <rect
                x={LEFT}
                y={y}
                width={W - LEFT - RIGHT}
                height={BAR_H}
                fill={rowIdx % 2 === 0 ? "#111" : "#151515"}
                rx={2}
              />

              {/* Rotation bars */}
              {sectorEvents.map((evt, evtIdx) => {
                const s = new Date(evt.startDate).getTime();
                const e = evt.endDate
                  ? new Date(evt.endDate).getTime()
                  : endMs;

                const x1 =
                  LEFT +
                  Math.max(0, ((s - startMs) / rangeMs)) *
                    (W - LEFT - RIGHT);
                const x2 =
                  LEFT +
                  Math.min(1, ((e - startMs) / rangeMs)) *
                    (W - LEFT - RIGHT);
                const barW = Math.max(2, x2 - x1);

                const fill =
                  evt.etfPerformancePct >= 0 ? "#22c55e" : "#ef4444";
                const opacity =
                  Math.min(1, 0.3 + Math.abs(evt.etfPerformancePct) * 0.07);

                return (
                  <g key={evtIdx}>
                    <rect
                      x={x1}
                      y={y + 2}
                      width={barW}
                      height={BAR_H - 4}
                      fill={fill}
                      opacity={opacity}
                      rx={2}
                    >
                      <title>
                        {name}: {evt.startDate} - {evt.endDate ?? "Active"} (
                        {evt.etfPerformancePct > 0 ? "+" : ""}
                        {evt.etfPerformancePct.toFixed(1)}%)
                      </title>
                    </rect>
                    {/* Pulsing indicator for active rotations */}
                    {evt.endDate === null && (
                      <circle
                        cx={x2}
                        cy={y + BAR_H / 2}
                        r={3}
                        fill={fill}
                      >
                        <animate
                          attributeName="opacity"
                          values="1;0.3;1"
                          dur="2s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Today marker */}
        <line
          x1={W - RIGHT}
          y1={TOP - 5}
          x2={W - RIGHT}
          y2={H - 10}
          stroke="#5ba3e6"
          strokeWidth={1}
          strokeDasharray="3,3"
          opacity={0.5}
        />
        <text
          x={W - RIGHT}
          y={H}
          textAnchor="middle"
          fill="#5ba3e6"
          fontSize={9}
          opacity={0.7}
        >
          Today
        </text>
      </svg>
    </div>
  );
}

// ── Section 4: Pattern Statistics (sortable) ──

type PatternSortKey = "sectorName" | "totalRotations" | "avgDurationDays" | "avgPerformancePct" | "bestPerformancePct" | "worstPerformancePct";

function PatternStatsTable({
  stats,
}: {
  stats: RotationPatternStats[];
}) {
  const [sortKey, setSortKey] = useState<PatternSortKey>("totalRotations");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...stats];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return copy;
  }, [stats, sortKey, sortAsc]);

  if (stats.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center text-[#888]">
        No pattern statistics available
      </div>
    );
  }

  function handleSort(key: PatternSortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "sectorName");
    }
  }

  function SortArrow({ col }: { col: PatternSortKey }) {
    if (sortKey !== col) return <span className="ml-1 text-[#444]">&uarr;&darr;</span>;
    return <span className="ml-1 text-[#5ba3e6]">{sortAsc ? "\u25B2" : "\u25BC"}</span>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2a2a2a] text-left text-xs text-[#888]">
            <th className="cursor-pointer px-3 py-2 select-none hover:text-white" onClick={() => handleSort("sectorName")}>
              Sector<SortArrow col="sectorName" />
            </th>
            <th className="px-3 py-2">ETF</th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("totalRotations")}>
              Rotations (1y)<SortArrow col="totalRotations" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("avgDurationDays")}>
              Avg Duration<SortArrow col="avgDurationDays" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("avgPerformancePct")}>
              Avg Perf<SortArrow col="avgPerformancePct" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("bestPerformancePct")}>
              Best<SortArrow col="bestPerformancePct" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("worstPerformancePct")}>
              Worst<SortArrow col="worstPerformancePct" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr
              key={s.sectorId}
              className="border-b border-[#1a1a1a] transition-colors hover:bg-[#1a1a1a]"
            >
              <td className="px-3 py-2 font-medium text-white">
                {s.sectorName}
              </td>
              <td className="px-3 py-2 font-mono text-[#888]">{s.etf}</td>
              <td className="px-3 py-2 text-right text-white">
                {s.totalRotations}
              </td>
              <td className="px-3 py-2 text-right text-[#ccc]">
                {s.avgDurationDays}d
              </td>
              <td
                className={`px-3 py-2 text-right font-semibold ${perfColor(s.avgPerformancePct)}`}
              >
                {s.avgPerformancePct > 0 ? "+" : ""}
                {s.avgPerformancePct.toFixed(1)}%
              </td>
              <td
                className={`px-3 py-2 text-right ${perfColor(s.bestPerformancePct)}`}
              >
                {s.bestPerformancePct > 0 ? "+" : ""}
                {s.bestPerformancePct.toFixed(1)}%
              </td>
              <td
                className={`px-3 py-2 text-right ${perfColor(s.worstPerformancePct)}`}
              >
                {s.worstPerformancePct > 0 ? "+" : ""}
                {s.worstPerformancePct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Recently Ended Rotations ──

function RecentlyEndedList({ events }: { events: RotationEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      {events.map((e, i) => {
        const h = getHealth(e);
        return (
        <div
          key={`${e.sectorId}-${i}`}
          className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <div>
              <span className="font-medium text-white">{e.sectorName}</span>
              <span className="ml-2 text-xs text-[#888]">{e.etf}</span>
              <span className={`ml-2 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${quadrantBadge(h.quadrant).className}`}>
                {h.quadrant}
              </span>
            </div>
            <span className="text-xs text-[#666]">
              {e.startDate} — {e.endDate} ({e.daysActive}d)
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-xs sm:flex sm:gap-3">
              <span className={accelColor(h.acceleration)}>
                Accel: {h.acceleration > 0 ? "+" : ""}{h.acceleration.toFixed(2)}
              </span>
              <span className={cmfColor(h.cmf20)}>
                CMF: {h.cmf20 > 0 ? "+" : ""}{h.cmf20.toFixed(3)}
              </span>
            </div>
            <span className={`font-semibold ${perfColor(e.etfPerformancePct)}`}>
              {e.etfPerformancePct > 0 ? "+" : ""}
              {e.etfPerformancePct.toFixed(1)}%
            </span>
          </div>
        </div>
        );
      })}
    </div>
  );
}

// ── Sector Heatmap Strip (all sectors at a glance) ──

function heatmapQuadrantBg(q: RRGQuadrant): string {
  switch (q) {
    case "LEADING": return "bg-green-500/20 border-green-500/30";
    case "WEAKENING": return "bg-amber-500/20 border-amber-500/30";
    case "LAGGING": return "bg-red-500/20 border-red-500/30";
    case "IMPROVING": return "bg-cyan-500/20 border-cyan-500/30";
  }
}

function heatmapQuadrantText(q: RRGQuadrant): string {
  switch (q) {
    case "LEADING": return "text-green-400";
    case "WEAKENING": return "text-amber-400";
    case "LAGGING": return "text-red-400";
    case "IMPROVING": return "text-cyan-400";
  }
}

function SectorHeatmapStrip({ sectors }: { sectors: SectorRotationScore[] }) {
  const sorted = useMemo(() =>
    [...sectors].sort((a, b) => b.compositeScore - a.compositeScore),
    [sectors]
  );

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium text-[#888]">All Sectors — RRG Quadrants</h3>
        <Link
          href="/sectors"
          className="flex items-center gap-1 text-[10px] text-[#5ba3e6] hover:text-[#7bb8f0] transition-colors"
        >
          Full Sector Dashboard <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((s) => (
          <Link
            key={s.etf}
            href={`/sectors?sector=${encodeURIComponent(s.etf)}`}
            className={`rounded border px-2 py-1 text-center transition-colors hover:brightness-125 ${heatmapQuadrantBg(s.quadrant)}`}
            title={`${s.sector}: ${s.quadrant} — Score ${s.compositeScore.toFixed(0)} — RS ${s.rsRatio.toFixed(1)} / Mom ${s.rsMomentum.toFixed(1)}`}
          >
            <div className="text-[10px] font-semibold text-white">{s.etf}</div>
            <div className={`text-[9px] font-medium ${heatmapQuadrantText(s.quadrant)}`}>
              {s.compositeScore.toFixed(0)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Copy/Export Bar for Stock Tables ──

function CopyExportBar({
  stocks,
  sectorName,
}: {
  stocks: RotationStockPerformance[];
  sectorName: string;
}) {
  const [copied, setCopied] = useState(false);

  function copyTickers() {
    const tickers = stocks.map((s) => s.symbol).join(", ");
    navigator.clipboard.writeText(tickers).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function exportCsv() {
    const headers = ["Symbol", "Phase", "Name", "Start Price", "Current", "% Change", "Above 50MA", "Vol vs Avg", "RS 20d", "Trend Accel", "Sector RS", "RS Delta", "RS Improving", "Vol Consistency", "Earnings (days)", "Earnings Date", "Turnaround", "Verdict", "Score"];
    const rows = stocks.map((s) => [
      s.symbol,
      phaseBadge(getRotationStockPhase(s)).label,
      s.name,
      s.priceAtRotationStart.toFixed(2),
      s.priceNow.toFixed(2),
      s.performancePct.toFixed(2),
      s.aboveSma50 ? "Yes" : "No",
      s.volumeVsAvg.toFixed(2),
      s.rs20d != null ? s.rs20d.toFixed(1) : "",
      s.trendAccel != null ? s.trendAccel.toFixed(2) : "",
      (s.rsAcceleration ?? 0).toFixed(2),
      (s.rsDelta ?? 0).toFixed(2),
      s.rsImproving ? "Yes" : "No",
      String(s.volumeConsistency ?? 0),
      s.daysToEarnings != null ? String(s.daysToEarnings) : "",
      s.nextEarningsDate ?? "",
      s.isTurnaroundCandidate ? "Yes" : "No",
      s.verdict ?? "",
      s.finalScore != null && s.finalScore > 0 ? String(s.finalScore) : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sectorName.replace(/\s+/g, "-").toLowerCase()}-rotation-stocks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={copyTickers}
        className="flex items-center gap-1 rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-[10px] text-[#888] transition-colors hover:text-white hover:border-[#444]"
        title="Copy all tickers"
        aria-label="Copy tickers"
      >
        {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy Tickers"}
      </button>
      <button
        onClick={exportCsv}
        className="flex items-center gap-1 rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-[10px] text-[#888] transition-colors hover:text-white hover:border-[#444]"
        title="Export as CSV"
        aria-label="Export to CSV"
      >
        <FileDown className="h-3 w-3" />
        CSV
      </button>
    </div>
  );
}

// ── Filter Recipes ──

function FilterRecipes() {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button
        onClick={() => setOpen(!open)}
        className="mb-3 flex w-full items-center gap-2 text-lg font-semibold text-white text-left"
        aria-label="Toggle filter recipes"
      >
        {open ? <ChevronUp className="h-5 w-5 text-[#5ba3e6]" /> : <ChevronDown className="h-5 w-5 text-[#5ba3e6]" />}
        Filter Recipes
        <span className="text-xs font-normal text-[#666]">Using all 3 RS metrics together</span>
      </button>
      {open && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-5 space-y-5">
          {/* 3 Metrics Reference */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">The Three Metrics</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Metric</th>
                    <th className="py-1.5 pr-3 text-left font-medium">What It Measures</th>
                    <th className="py-1.5 text-left font-medium">Green Flag</th>
                  </tr>
                </thead>
                <tbody className="text-[#a0a0a0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-white">RS 20d</td>
                    <td className="py-2 pr-3">20-day relative strength vs the broad market</td>
                    <td className="py-2 text-green-400">Positive = outperforming market</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-white">Trend Accel</td>
                    <td className="py-2 pr-3">Stock&apos;s own trend acceleration (% from 50MA minus % from 200MA)</td>
                    <td className="py-2 text-green-400">Positive = short-term gaining on long-term</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-white">Sector RS</td>
                    <td className="py-2 pr-3">Relative strength acceleration vs sector ETF (5d vs 20d)</td>
                    <td className="py-2 text-green-400">Positive = catching up vs sector</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Recipes */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Recipes</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Goal</th>
                    <th className="py-1.5 text-left font-medium">Filter Combination</th>
                  </tr>
                </thead>
                <tbody className="text-[#a0a0a0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-green-400 whitespace-nowrap">Best entries</td>
                    <td className="py-2">Phase: <span className="text-white">P2 Turnaround</span> + Trend Accel: <span className="text-white">Positive</span> + Sector RS: <span className="text-white">Positive</span> + RS 20d: <span className="text-white">Positive</span></td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-cyan-400 whitespace-nowrap">Momentum leaders</td>
                    <td className="py-2">Phase: <span className="text-white">P3 Trending</span> + RS 20d: <span className="text-white">Positive</span> + Volume: <span className="text-white">Above Avg</span></td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-amber-400 whitespace-nowrap">Catch-up catalyst</td>
                    <td className="py-2">Trend Accel: <span className="text-white">Positive</span> + Sector RS: <span className="text-white">Negative</span> + Earnings: <span className="text-red-400">&le;14d</span> (red/amber)</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-red-400 whitespace-nowrap">Avoid list</td>
                    <td className="py-2">Phase: <span className="text-white">P4 Exhausting</span> + Trend Accel: <span className="text-white">Negative</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-purple-400 whitespace-nowrap">Early watch</td>
                    <td className="py-2">Phase: <span className="text-white">P1 Basing</span> + Sector RS: <span className="text-white">Positive</span> &mdash; add to watchlist, wait for P2 transition</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* SNOW Pattern */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <h3 className="text-sm font-semibold text-amber-400 mb-2">The SNOW Pattern: Catch-Up Catalyst</h3>
            <p className="text-xs text-[#a0a0a0] leading-relaxed">
              In Feb 2025 earnings, SNOW had Trend Accel <span className="text-green-400 font-mono">+27.98</span> (powerful own momentum) but Sector RS <span className="text-red-400 font-mono">&minus;11.3</span> (lagging sector ETF recently).
              The negative Sector RS looked bearish in isolation, but the strong Trend Accel correctly showed the stock had direction.
              SNOW jumped 75 points after earnings &mdash; the catalyst unlocked the gap between individual strength and sector-relative weakness.
            </p>
            <p className="text-xs text-[#a0a0a0] leading-relaxed mt-2">
              <strong className="text-white">Key rule:</strong> Positive Trend Accel + negative Sector RS = coiled catch-up, not breakdown.
              If Trend Accel is also negative, the stock is genuinely weak &mdash; avoid.
              When the two metrics diverge, <strong className="text-white">trust Trend Accel for direction</strong> and use Sector RS for relative positioning.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Main Page Component ──

export default function RotationTrackerPage() {
  const [data, setData] = useState<RotationTrackerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSector, setExpandedSector] = useState<string | null>(null);
  const [showAllSectors, setShowAllSectors] = useState(false);
  const [heatmapSectors, setHeatmapSectors] = useState<SectorRotationScore[] | null>(null);
  const [prerunServerMap, setPrerunServerMap] = useState<Map<string, { verdict: string; score: number; daysToEarnings: number | null; nextEarningsDate: string | null; rs20d: number | null }>>(new Map());

  // Fetch prerun data from server when localStorage is empty
  useEffect(() => {
    const local = loadScanResults();
    if (local.length > 0) return; // localStorage has data, no need for server fallback
    fetch("/api/prerun/latest")
      .then((res) => res.ok ? res.json() : null)
      .then((result: { date: string | null; signals: { ticker: string; verdict: string; score: number; daysToEarnings: number | null; nextEarningsDate: string | null; rs20d: number | null }[] } | null) => {
        if (!result?.signals?.length) return;
        const map = new Map<string, { verdict: string; score: number; daysToEarnings: number | null; nextEarningsDate: string | null; rs20d: number | null }>();
        for (const s of result.signals) map.set(s.ticker, { verdict: s.verdict, score: s.score, daysToEarnings: s.daysToEarnings, nextEarningsDate: s.nextEarningsDate, rs20d: s.rs20d });
        setPrerunServerMap(map);
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async (skipCache = false) => {
    setLoading(true);
    setError(null);

    // Try localStorage cache first
    if (!skipCache) {
      const cached = loadCached();
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/rotation-tracker");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }
      const result = (await res.json()) as RotationTrackerResult;
      setData(result);
      saveCache(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rotation data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch sector heatmap data (separate API)
  const fetchHeatmap = useCallback(async () => {
    try {
      const res = await fetch("/api/sector-rotation");
      if (!res.ok) return;
      const result = await res.json();
      if (result.sectors) setHeatmapSectors(result.sectors);
    } catch {
      // Non-critical — heatmap is supplementary
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
    fetchHeatmap();
  }, [fetchData, fetchHeatmap]);

  // Auto-refresh every 10 minutes
  useEffect(() => {
    const interval = setInterval(() => fetchData(true), AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Enrich stocks with earnings + verdict + score data from prerun scan
  const enrichedData = useMemo(() => {
    if (!data) return null;
    const scanResults = loadScanResults();

    const scanByTicker = new Map<string, (typeof scanResults)[number]>();
    for (const r of scanResults) { if (r.data?.ticker) scanByTicker.set(r.data.ticker, r); }

    const hasLocalData = scanByTicker.size > 0;
    const hasServerData = prerunServerMap.size > 0;
    if (!hasLocalData && !hasServerData) return data;

    return {
      ...data,
      activeRotations: data.activeRotations.map((rotation) => ({
        ...rotation,
        stocks: rotation.stocks.map((s) => {
          const preRun = scanByTicker.get(s.symbol);
          const serverData = prerunServerMap.get(s.symbol);
          if (!preRun && !serverData) return s;
          return {
            ...s,
            daysToEarnings: preRun?.data.daysToEarnings ?? serverData?.daysToEarnings ?? s.daysToEarnings,
            nextEarningsDate: preRun?.data.nextEarningsDate ?? serverData?.nextEarningsDate ?? s.nextEarningsDate,
            rs20d: s.rs20d ?? preRun?.data.relativeStrength20d ?? serverData?.rs20d ?? null,
            verdict: preRun?.verdict ?? serverData?.verdict ?? null,
            finalScore: preRun?.scores.finalScore ?? serverData?.score ?? null,
          };
        }),
      })),
    };
  }, [data, prerunServerMap]);

  // Find expanded rotation detail
  const expandedDetail = useMemo(() => {
    if (!enrichedData || !expandedSector) return null;
    return (
      enrichedData.activeRotations.find((r) => r.event.sectorId === expandedSector) ??
      null
    );
  }, [enrichedData, expandedSector]);

  // Build aggregate data for "All Sectors" view
  const allSectorsForTable = useMemo(() => {
    if (!enrichedData || enrichedData.activeRotations.length === 0) return null;
    const allStocks: RotationStockPerformance[] = [];
    const sectorMap = new Map<string, string>();
    const lifecycleMap = new Map<string, LifecycleStage>();
    const seen = new Set<string>();
    for (const rot of enrichedData.activeRotations) {
      const lc = computeLifecycleStage(rot.event);
      for (const s of rot.stocks) {
        if (seen.has(s.symbol)) continue;
        seen.add(s.symbol);
        allStocks.push(s);
        sectorMap.set(s.symbol, rot.event.sectorName);
        lifecycleMap.set(s.symbol, lc);
      }
    }
    const detail: ActiveRotationDetail = {
      event: {
        ...enrichedData.activeRotations[0].event,
        sectorId: "__all__",
        sectorName: "All Sectors",
        etfPerformancePct: 0,
      },
      stocks: allStocks,
    };
    return { detail, sectorMap, lifecycleMap };
  }, [enrichedData]);

  const handleExpandSector = useCallback((sectorId: string | null) => {
    setExpandedSector(sectorId);
    setShowAllSectors(false);
  }, []);

  const handleShowAllSectors = useCallback(() => {
    setShowAllSectors((prev) => !prev);
    setExpandedSector(null);
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Rotation Tracker</h1>
          <p className="mt-1 text-sm text-[#888]">
            Detect sector rotation inflection points and track stock performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sectors"
            className="rounded-md border border-[#333] bg-[#1a1a1a] px-3 py-1.5 text-xs text-[#a0a0a0] transition-colors hover:text-white hover:border-[#444]"
          >
            Sectors
          </Link>
          {data && <DataAgeBadge calculatedAt={data.calculatedAt} />}
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="rounded-md border border-[#333] bg-[#1a1a1a] p-2 text-[#a0a0a0] transition-colors hover:bg-[#222] hover:text-white disabled:opacity-50"
            aria-label="Refresh data"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#5ba3e6]" />
          <span className="ml-3 text-[#888]">
            Analyzing sector rotations...
          </span>
        </div>
      )}

      {/* Content */}
      {data && (
        <div className="space-y-8">
          {/* Enhancement #4: Regime Banner */}
          {data.regime && (
            <section>
              <RegimeBanner regime={data.regime} />
            </section>
          )}

          {/* Sector Heatmap Strip (all sectors at a glance) */}
          {heatmapSectors && (
            <section>
              <SectorHeatmapStrip sectors={heatmapSectors} />
            </section>
          )}

          {/* Enhancement #7: Pair Z-Score Bar */}
          {data.pairSignals && (
            <section>
              <PairZScoreBar pairSignals={data.pairSignals} />
            </section>
          )}

          {/* Section 1: Active Rotations */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
              <TrendingUp className="h-5 w-5 text-green-400" />
              Active Rotations
              {data.activeRotations.length > 0 && (
                <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-400">
                  {data.activeRotations.length}
                </span>
              )}
              {data.activeRotations.length > 1 && (
                <button
                  onClick={handleShowAllSectors}
                  className={`ml-2 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    showAllSectors
                      ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
                      : "bg-[#1a1a1a] text-[#888] ring-1 ring-[#333] hover:text-[#ccc]"
                  }`}
                >
                  All Sectors
                </button>
              )}
            </h2>
            <ActiveRotationCards
              rotations={data.activeRotations}
              onExpand={handleExpandSector}
              expandedId={expandedSector}
              regime={data.regime}
              patternStats={data.patternStats}
            />
          </section>

          {/* Section 2a: All Sectors aggregate view */}
          {showAllSectors && allSectorsForTable && (
            <section className="rounded-lg border border-[#2a2a2a] bg-[#111] overflow-hidden">
              <div className="border-b border-[#2a2a2a] px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-white">
                    All Sectors — Stocks Across {enrichedData!.activeRotations.length} Active Rotations
                  </h2>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                    {allSectorsForTable.detail.stocks.length} stocks
                  </span>
                </div>
                <CopyExportBar stocks={allSectorsForTable.detail.stocks} sectorName="All Sectors" />
              </div>
              <StockPerformanceTable
                detail={allSectorsForTable.detail}
                lifecycle="EARLY"
                sectorMap={allSectorsForTable.sectorMap}
                lifecycleMap={allSectorsForTable.lifecycleMap}
              />
            </section>
          )}

          {/* Section 2b: Stock Performance (expanded) */}
          {expandedDetail && <ExpandedRotationDetail detail={expandedDetail} regime={data.regime} />}

          {/* Recently Ended */}
          {data.recentlyEndedRotations.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
                <TrendingDown className="h-5 w-5 text-[#888]" />
                Recently Ended
              </h2>
              <RecentlyEndedList events={data.recentlyEndedRotations} />
            </section>
          )}

          {/* Historical Timeline */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              12-Month Timeline
            </h2>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
              <HistoricalTimeline events={data.allEvents} />
              <div className="mt-2 flex items-center justify-center gap-4 text-xs text-[#666]">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-6 rounded bg-green-500/50" />{" "}
                  Positive return
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-6 rounded bg-red-500/50" />{" "}
                  Negative return
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-400" />{" "}
                  Active
                </span>
              </div>
            </div>
          </section>

          {/* Pattern Statistics */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              Pattern Statistics
            </h2>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#111]">
              <PatternStatsTable stats={data.patternStats} />
            </div>
          </section>

          {/* Filter Recipes */}
          <FilterRecipes />
        </div>
      )}
    </main>
  );
}
