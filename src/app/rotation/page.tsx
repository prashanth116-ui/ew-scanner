"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  PauseCircle,
  LayoutGrid,
  Rows3,
} from "lucide-react";
import Link from "next/link";
import type {
  RotationTrackerResult,
  ActiveRotationDetail,
  RotationEvent,
  RotationHealthSignals,
  RotationPatternStats,
  RotationStockPerformance,
  ConvictionResult,
  RRGQuadrant,
  LifecycleStage,
  ConvictionLevel,
  RegimeData,
  PairSignalData,
  StockCategory,
} from "@/lib/sector-rotation/rotation-types";
import type { SectorRotationScore } from "@/lib/sector-rotation/types";
import {
  evaluateEntryScreen,
  entryScreenReason,
  liveGateDrift,
  type EntryScreenResult,
  type GateReading,
} from "@/lib/sector-rotation/entry-screen";
import { ENTRY_SCREEN } from "@/lib/sector-rotation/config";
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
import { CollapsiblePanel, useCollapsedPanels } from "@/app/sectors/_components";
import { type StockPhase, phaseBadge, PHASE_RANK } from "@/lib/phase-utils";

// ── localStorage cache (4-hour TTL) ──

const CACHE_KEY = "ew-rotation-tracker-v7";
const VIEW_MODE_KEY = "ew-rotation-view-v1";
const CACHE_TTL = 4 * 60 * 60 * 1000;
const AUTO_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 3;

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
  // Turnaround candidates first — curated flag from rotation tracker
  if (s.isTurnaroundCandidate) return "turnaround";

  if (!s.aboveSma50) {
    // Below SMA50: trendAccel (pctFrom50 - pctFrom200) IS meaningful here —
    // positive = recovering faster towards 50MA than 200MA
    const ta = s.trendAccel ?? 0;
    if (ta > 0 && s.performancePct <= 0) return "basing";
    return "basing";
  }

  // Above SMA50: use rsAcceleration (stock vs sector ETF, 5d vs 20d)
  // instead of trendAccel (pctFrom50 - pctFrom200) which is naturally
  // deeply negative for established uptrends (e.g. +14% from SMA50,
  // +24% from SMA200 → trendAccel = -10, but stock is healthy)
  if (s.rsAcceleration < -2 && !s.rsImproving) return "exhausting";
  if (s.rsAcceleration > 0) return "trending";
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
  const MAX_POINTS = 50;

  // Downsample long histories using average-per-bin for honest representation
  let data = history;
  if (history.length > MAX_POINTS) {
    const binSize = history.length / MAX_POINTS;
    const sampled: typeof history = [];
    for (let b = 0; b < MAX_POINTS; b++) {
      const start = Math.floor(b * binSize);
      const end = Math.floor((b + 1) * binSize);
      let sum = 0;
      let count = 0;
      for (let j = start; j < end && j < history.length; j++) {
        sum += history[j].signalCount;
        count++;
      }
      // Use last entry in bin for date/close, averaged signalCount
      const representative = history[Math.min(end - 1, history.length - 1)];
      sampled.push({ ...representative, signalCount: count > 0 ? sum / count : 0 });
    }
    data = sampled;
  }

  const points = data.map((h, i) => {
    const x = pad + (i / (data.length - 1)) * (W - 2 * pad);
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

  // Signal count drop: compare last 5 days vs prior 5 days for stable detection
  if (hist.length >= 10) {
    const recent = hist.slice(-5);
    const prior = hist.slice(-10, -5);
    const recentAvg = recent.reduce((s, entry) => s + entry.signalCount, 0) / recent.length;
    const priorAvg = prior.reduce((s, entry) => s + entry.signalCount, 0) / prior.length;
    if (recentAvg < priorAvg - EXIT_SIGNAL_DECLINE_THRESHOLD) {
      warnings.push("Signal strength declining");
    }
  } else if (hist.length >= 6) {
    // Non-overlapping windows: last 3 vs prior 3 (no shared entries)
    const recent = hist.slice(-3);
    const prior = hist.slice(-6, -3);
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
    case "wait":
      return <PauseCircle className={className} />;
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
  const hasAvgReturn = stats.avgPerformancePct !== 0;
  const pctThroughReturn = hasAvgReturn
    ? Math.round((event.etfPerformancePct / stats.avgPerformancePct) * 100)
    : null;
  const isPastAvgDuration = event.daysActive > stats.avgDurationDays;
  const isBeatingAvg = pctThroughReturn !== null && (stats.avgPerformancePct >= 0
    ? pctThroughReturn > 100
    : pctThroughReturn < 100);

  return (
    <div className="mt-2 rounded-md bg-[#151515] px-3 py-2 text-[11px] text-[#999]">
      <span className="text-[#666]">Based on {completedCount} prior rotations:</span>{" "}
      avg {stats.avgDurationDays}d (you&apos;re at {event.daysActive}d —{" "}
      <span className={isPastAvgDuration ? "text-red-400" : "text-green-400/70"}>
        {pctThroughDuration > 200 ? ">200" : pctThroughDuration}%
      </span>
      ), avg return{" "}
      {stats.avgPerformancePct > 0 ? "+" : ""}{stats.avgPerformancePct.toFixed(1)}% (you&apos;re at{" "}
      {event.etfPerformancePct > 0 ? "+" : ""}{event.etfPerformancePct.toFixed(1)}% —{" "}
      <span className={isBeatingAvg ? "text-green-400" : "text-[#999]"}>
        {pctThroughReturn !== null ? `${pctThroughReturn}% of historical` : "—"}
      </span>
      )
    </div>
  );
}

// ── Section 1: Active Rotation Cards (enhanced) ──

/**
 * Is this rotation broad, or one stock?
 *
 * Two numbers, because they fail differently. `breadthPct` is the % of sector members
 * above their own 50d SMA — the same figure that feeds 15% of the rotation composite and
 * that /sectors displays. It is a trend measure and immune to a single outlier: one stock
 * doubling moves it by one member.
 *
 * The median member move is today's participation. A cap-weighted ETF return can be one
 * name; a median cannot. On 2026-08-19 biotech showed breadth 82% and a +3.78% median —
 * the pair is what proved the healthcare rotation was real rather than MRNA's +177%
 * dragging the composite.
 *
 * Deliberately NOT the tradeable-candidate count from the 6pm alert. That figure excludes
 * names gapping >= 8%, so it FALLS when a sector rips — it answers "how many can I act
 * on", not "is this real", and putting it here would re-import the confusion.
 */
function participation(
  stocks: { dailyChangePct: number }[],
  breadthPct: number | null | undefined,
): { breadth: number | null; median: number | null } {
  const moves = stocks.map((s) => s.dailyChangePct).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const median = moves.length ? moves[Math.floor(moves.length / 2)] : null;
  return { breadth: breadthPct ?? null, median };
}

/**
 * Cross-scanner hits and enrichment conviction — the part of the Telegram confluence
 * alert that previously existed nowhere in the UI.
 *
 * Colour is by scanner, not by strength, so the eye groups by source. Strength lives in
 * the detail text (READY vs TRIGGERED), which is what actually differs between rows.
 */
const SCANNER_TONE: Record<string, string> = {
  Setup: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Inflect: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Trans: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Inst: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

function ScannerBadges({ hits }: { hits?: { scanner: string; detail: string }[] }) {
  if (!hits?.length) return <span className="text-[#444]">—</span>;
  return (
    <span className="flex flex-wrap justify-center gap-0.5">
      {/* Two or more independent scanners is the signal worth catching at a glance;
          the alert marks it with a star and so does this. */}
      {hits.length >= 2 && <span title="Multiple scanners agree" className="text-amber-400">★</span>}
      {hits.map((h) => (
        <span
          key={`${h.scanner}-${h.detail}`}
          title={`${h.scanner}: ${h.detail}`}
          className={`rounded border px-1 py-px text-[9px] font-medium whitespace-nowrap ${
            SCANNER_TONE[h.scanner] ?? "bg-[#1a1a1a] text-[#999] border-[#333]"
          }`}
        >
          {h.scanner}:{h.detail}
        </span>
      ))}
    </span>
  );
}

function ConvictionCell({ level }: { level?: string }) {
  if (!level) return <span className="text-[#444]">—</span>;
  const tone = level === "HIGH" ? "text-green-400"
    : level === "MEDIUM" ? "text-amber-400"
      : "text-[#888]";
  return <span className={`text-[10px] font-semibold ${tone}`}>{level}</span>;
}

/**
 * One derived row per active rotation.
 *
 * Cards and the comparison table render the same six judgements - lifecycle,
 * conviction, regime alignment, action, breadth, median - so they are derived once
 * here. Computing them twice is how two views of the same rotation start disagreeing.
 */
interface RotationRow {
  detail: ActiveRotationDetail;
  health: RotationHealthSignals;
  lifecycle: LifecycleStage;
  conviction: ConvictionResult;
  regimeAlignment: "aligned" | "headwind" | "neutral";
  actionSignal: ActionSignal;
  exitWarnings: string[];
  breadth: number | null;
  median: number | null;
  /** Two-stage entry screen: is this rotation tradeable, and which names. */
  screen: EntryScreenResult;
  /** Sector Mansfield RS - % deviation of the sector/SPY ratio from its own
   *  200d average. Zero-centred, so positive means the sector is outperforming
   *  its own relative trend, not merely rising. */
  sectorRs: number | null;
}

function buildRotationRows(
  rotations: ActiveRotationDetail[],
  regime: RegimeData | null | undefined,
  sectorScores: SectorRotationScore[] | null,
): RotationRow[] {
  const breadthByEtf = new Map((sectorScores ?? []).map((x) => [x.etf, x.breadthPct]));
  const scoreByEtf = new Map((sectorScores ?? []).map((x) => [x.etf, x]));
  return rotations.map((detail) => {
    const health = getHealth(detail.event);
    const lifecycle = computeLifecycleStage(detail.event);
    const conviction = computeConviction(detail.event);
    const regimeAlignment = regime ? isRegimeAligned(detail.event.sectorName, regime) : "neutral";
    const part = participation(detail.stocks, breadthByEtf.get(detail.event.etf));
    return {
      detail,
      health,
      lifecycle,
      conviction,
      regimeAlignment,
      actionSignal: computeActionSignal(lifecycle, conviction, regimeAlignment, health),
      exitWarnings: computeExitWarnings(detail.event),
      breadth: part.breadth,
      median: part.median,
      screen: evaluateEntryScreen(detail),
      sectorRs: scoreByEtf.get(detail.event.etf)?.mansfieldRS ?? null,
    };
  });
}

/**
 * The entry-screen verdict. The qualifying-name count is the interface: it is
 * simultaneously the position list and the breadth confirmation, because a sector
 * where only one or two names can post a breakout with above-median strength is
 * drifting rather than rotating.
 */
function screenTone(v: EntryScreenResult["verdict"]): string {
  switch (v) {
    case "TRADE": return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
    case "SKIP_THIN": return "bg-amber-500/10 text-amber-400/90 border-amber-500/30";
    case "SKIP_GATE": return "bg-red-500/10 text-red-400/80 border-red-500/30";
    default: return "bg-[#1a1a1a] text-[#666] border-[#333]";
  }
}

function screenLabel(r: EntryScreenResult): string {
  switch (r.verdict) {
    case "TRADE": return `${r.qualifying} QUALIFY — TRADE`;
    case "SKIP_THIN": return `${r.qualifying} QUALIFY — TOO THIN`;
    case "SKIP_GATE": return "GATE FAILED";
    default: return "NOT SCREENABLE";
  }
}

function GateTicks({ gate, dim }: { gate: GateReading; dim?: boolean }) {
  if (!gate.complete) return <span className="text-[10px] text-[#555]">gate inputs unavailable</span>;
  const item = (label: string, ok: boolean, val: string) => (
    <span
      className={dim
        ? (ok ? "text-green-400/50" : "text-red-400/50")
        : (ok ? "text-green-400/90" : "text-red-400/90")}
      title={`${label}: ${val}`}
    >
      {ok ? "✓" : "✗"} {label}
    </span>
  );
  return (
    <span className="flex flex-wrap items-center gap-2 text-[10px]">
      {item("breadth", gate.breadthPass, `${gate.breadth?.toFixed(0)}% (need >= ${ENTRY_SCREEN.MIN_BREADTH_PCT}%)`)}
      {item("flow", gate.cmfPass, `CMF ${gate.cmf?.toFixed(3)} (need > 0)`)}
      {item("accel", gate.accelPass, `${gate.accel?.toFixed(1)} (need > 0)`)}
    </span>
  );
}

/** Copies just the screened names, so the qualifying list can leave the page
 *  without dragging the other 25 basket members along with it. */
function CopyTickers({ symbols }: { symbols: string[] }) {
  const [done, setDone] = useState(false);
  if (!symbols.length) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(symbols.join(", ")).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        });
      }}
      className="shrink-0 rounded border border-[#333] bg-[#1a1a1a] px-1.5 py-0.5 text-[9px] text-[#888] transition-colors hover:text-white"
      title={`Copy these ${symbols.length} tickers`}
    >
      {done ? <Check className="h-3 w-3 text-green-400" /> : `Copy ${symbols.length}`}
    </button>
  );
}

function EntryScreenPanel({ screen }: { screen: EntryScreenResult }) {
  const drift = liveGateDrift(screen);
  return (
    <div className="mt-2 rounded-md border border-[#2a2a2a] bg-[#131313] px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${screenTone(screen.verdict)}`}
          title={entryScreenReason(screen)}
        >
          {screenLabel(screen)}
        </span>
        <GateTicks gate={screen.gate} />
      </div>

      {/* Live gate is a health read, never a verdict input. Shown dimmed and
          labelled so it cannot be mistaken for the gate that decided the trade. */}
      {screen.live.complete && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-[#555]" title="Rotation gate re-read on the latest bar. Does not affect the verdict above, which is measured on the rotation start bar.">
            now
          </span>
          <GateTicks gate={screen.live} dim />
          {drift === "faded" && (
            <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-medium text-amber-400/90" title="This rotation passed the gate at entry and no longer does. The names above were valid at the start bar; conditions have since decayed.">
              faded
            </span>
          )}
          {drift === "recovered" && (
            <span className="rounded bg-sky-500/10 px-1 py-0.5 text-[9px] font-medium text-sky-400/80" title="The gate failed at the rotation start but passes now. Not a validated entry - the study only tested entering at the start bar.">
              recovered
            </span>
          )}
        </div>
      )}
      {screen.verdict === "TRADE" && (
        <div className="mt-1 flex items-start gap-1.5">
          {/* Wraps rather than truncates: a 16-name list behind a tooltip is not
              a list you can act on. */}
          <div className="flex flex-1 flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] font-mono text-[#999]">
            {screen.picks.map((x) => (
              <span key={x.symbol}>{x.symbol}</span>
            ))}
          </div>
          <CopyTickers symbols={screen.picks.map((x) => x.symbol)} />
        </div>
      )}
      {screen.verdict === "SKIP_THIN" && screen.qualifying > 0 && (
        <div className="mt-1 text-[10px] text-[#666]">
          would have been {screen.picks.map((x) => x.symbol).join(", ")}
        </div>
      )}
    </div>
  );
}

// -- Comparison table view (same rows as the cards, one line each) --

type RotationSortKey =
  | "etf" | "sector" | "days" | "perf" | "lifecycle"
  | "conviction" | "regime" | "action" | "breadth" | "median" | "sectorRs" | "screen";

// TRADE first, then near-misses, then hard rejects.
const SCREEN_RANK: Record<string, number> = { TRADE: 0, SKIP_THIN: 1, SKIP_GATE: 2, NO_DATA: 3 };

const LIFECYCLE_RANK: Record<LifecycleStage, number> = { EARLY: 0, MATURING: 1, LATE: 2, EXHAUSTING: 3 };
const ACTION_RANK: Record<ActionSignal["action"], number> = {
  "ENTER": 0,
  "ADD ON PULLBACK": 1,
  "HOLD — TIGHTEN STOPS": 2,
  "WAIT": 3,
  "EXIT": 4,
};
const REGIME_RANK: Record<string, number> = { aligned: 0, neutral: 1, headwind: 2 };

const ROTATION_COLS: { key: RotationSortKey; label: string; align: string; title: string }[] = [
  { key: "etf", label: "ETF", align: "text-left", title: "Sector proxy ETF" },
  { key: "sector", label: "Sector", align: "text-left", title: "Sector or sub-sector basket" },
  { key: "days", label: "Days", align: "text-right", title: "Trading days since the rotation was detected" },
  { key: "perf", label: "ETF %", align: "text-right", title: "ETF return since the rotation start date" },
  { key: "lifecycle", label: "Lifecycle", align: "text-left", title: "EARLY <= 5d, MATURING <= 15d, then LATE, then EXHAUSTING" },
  { key: "conviction", label: "Conviction", align: "text-left", title: "Quadrant + acceleration + money flow + signal trend. Hover a cell for the factors." },
  { key: "regime", label: "Regime", align: "text-left", title: "Alignment with the macro regime favoured/avoided sector lists" },
  { key: "action", label: "Action", align: "text-left", title: "Same banner the card shows" },
  { key: "breadth", label: "Breadth", align: "text-right", title: "Percentage of sector members trading above their own 50-day SMA" },
  { key: "median", label: "Median", align: "text-right", title: "Median move of the sector stocks in the latest session" },
  { key: "sectorRs", label: "Sec RS", align: "text-right", title: "Sector relative strength vs SPY (Mansfield) — % deviation of the sector/SPY ratio from its own 200-day average" },
  { key: "screen", label: "Screen", align: "text-left", title: "Entry screen: how many members clear breakout + top-half basket strength + ATR, and whether the rotation gate passed" },
];

function ActiveRotationTable({
  rows,
  onExpand,
  expandedId,
  hasRegime,
}: {
  rows: RotationRow[];
  onExpand: (id: string | null) => void;
  expandedId: string | null;
  hasRegime: boolean;
}) {
  // Default order is the API order (strongest first); sorting is opt-in per column.
  const [sortKey, setSortKey] = useState<RotationSortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const val = (r: RotationRow): string | number => {
      switch (sortKey) {
        case "etf": return r.detail.event.etf;
        case "sector": return r.detail.event.sectorName;
        case "days": return r.detail.event.daysActive;
        case "perf": return r.detail.event.etfPerformancePct;
        case "lifecycle": return LIFECYCLE_RANK[r.lifecycle];
        case "conviction": return r.conviction.score;
        case "regime": return REGIME_RANK[r.regimeAlignment] ?? 1;
        case "action": return ACTION_RANK[r.actionSignal.action] ?? 9;
        // Unmeasured breadth sorts to the bottom rather than reading as zero -
        // "not enough constituents to measure" is not "no breadth".
        case "breadth": return r.breadth ?? Number.NEGATIVE_INFINITY;
        case "median": return r.median ?? Number.NEGATIVE_INFINITY;
        case "sectorRs": return r.sectorRs ?? Number.NEGATIVE_INFINITY;
        // Sort by verdict first so TRADE rows group, then by how many qualified.
        case "screen": return -(SCREEN_RANK[r.screen.verdict] ?? 9) * 1000 + r.screen.qualifying;
      }
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  function handleSort(key: RotationSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "etf" || key === "sector" ? "asc" : "desc");
    }
  }

  const ariaSort = (k: RotationSortKey): "ascending" | "descending" | "none" =>
    sortKey !== k ? "none" : sortDir === "asc" ? "ascending" : "descending";

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center text-[#888]">
        No active rotations detected
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[#2a2a2a] bg-[#111]">
      <table className="w-full min-w-[900px] text-xs">
        <thead className="border-b border-[#2a2a2a] text-[10px] uppercase tracking-wider text-[#666]">
          <tr>
            {ROTATION_COLS.map((c) => (
              <th
                key={c.key}
                onClick={() => handleSort(c.key)}
                aria-sort={ariaSort(c.key)}
                title={c.title}
                className={`cursor-pointer select-none px-2 py-2 hover:text-white ${c.align}`}
              >
                {c.label}
                {sortKey === c.key && (
                  <span className="ml-0.5 text-[#5ba3e6]">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const e = row.detail.event;
            const isExpanded = expandedId === e.sectorId;
            const lcBadge = lifecycleBadge(row.lifecycle);
            return (
              <tr
                key={e.sectorId}
                onClick={() => onExpand(isExpanded ? null : e.sectorId)}
                className={`cursor-pointer border-b border-[#1f1f1f] transition-colors last:border-0 ${
                  isExpanded ? "bg-green-500/5 ring-1 ring-inset ring-green-500/30" : "hover:bg-[#181818]"
                }`}
              >
                <td className="px-2 py-2 font-semibold text-[#5ba3e6]">{e.etf}</td>
                <td className="px-2 py-2 text-[#ddd]">{e.sectorName}</td>
                <td className="px-2 py-2 text-right text-[#a0a0a0]">{e.daysActive}d</td>
                <td className={`px-2 py-2 text-right font-semibold ${perfColor(e.etfPerformancePct)}`}>
                  {e.etfPerformancePct > 0 ? "+" : ""}
                  {e.etfPerformancePct.toFixed(1)}%
                </td>
                <td className="px-2 py-2">
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${lcBadge.className}`} title={lcBadge.guidance}>
                    {row.lifecycle}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${convictionBadge(row.conviction.level)}`}
                    title={row.conviction.reason}
                  >
                    {row.conviction.level} ({row.conviction.score})
                  </span>
                  {row.conviction.negatives.length > 0 && (
                    <span className="ml-1 text-[10px] text-amber-400/80" title={`Against: ${row.conviction.negatives.join(", ")}`}>
                      !{row.conviction.negatives.length}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-[10px]">
                  {!hasRegime ? (
                    <span className="text-[#444]">-</span>
                  ) : row.regimeAlignment === "aligned" ? (
                    <span className="text-green-400">Aligned</span>
                  ) : row.regimeAlignment === "headwind" ? (
                    <span className="text-red-400">Headwind</span>
                  ) : (
                    <span className="text-[#666]">neutral</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${row.actionSignal.borderColor} ${row.actionSignal.bgColor} ${row.actionSignal.color}`}
                    title={row.actionSignal.description}
                  >
                    <ActionIcon icon={row.actionSignal.icon} className="h-3 w-3 shrink-0" />
                    {row.actionSignal.action}
                  </span>
                  {row.exitWarnings.length > 0 && (
                    <span className="ml-1 align-middle text-amber-400" title={row.exitWarnings.join("; ")}>
                      <AlertTriangle className="inline h-3 w-3" />
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  {/* n/a is deliberately distinct from 0%: a basket below the
                      5-constituent minimum reports null, which is not zero breadth. */}
                  {row.breadth === null ? (
                    <span className="text-[#444]" title="Not enough resolvable constituents to measure">n/a</span>
                  ) : (
                    <span
                      className={
                        row.breadth >= 60
                          ? "font-semibold text-green-400"
                          : row.breadth >= 40
                            ? "font-semibold text-amber-400"
                            : "font-semibold text-red-400"
                      }
                    >
                      {row.breadth}%
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  {row.median === null ? (
                    <span className="text-[#444]">n/a</span>
                  ) : (
                    <span className={row.median >= 0 ? "text-green-400" : "text-red-400"}>
                      {row.median > 0 ? "+" : ""}
                      {row.median.toFixed(2)}%
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  {row.sectorRs === null ? (
                    <span className="text-[#444]">n/a</span>
                  ) : (
                    <span className={row.sectorRs >= 0 ? "text-green-400" : "text-red-400"}>
                      {row.sectorRs >= 0 ? "+" : ""}
                      {row.sectorRs.toFixed(1)}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${screenTone(row.screen.verdict)}`}
                    title={entryScreenReason(row.screen)}
                  >
                    {screenLabel(row.screen)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActiveRotationCards({
  rows,
  onExpand,
  expandedId,
  regime,
  patternStats,
}: {
  rows: RotationRow[];
  onExpand: (id: string | null) => void;
  expandedId: string | null;
  regime: RegimeData | null | undefined;
  patternStats: RotationPatternStats[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center text-[#888]">
        No active rotations detected
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((row) => {
        const { detail: r, health: h, lifecycle, conviction, regimeAlignment, actionSignal, exitWarnings } = row;
        const isExpanded = expandedId === r.event.sectorId;
        const lcBadge = lifecycleBadge(lifecycle);
        const part = { breadth: row.breadth, median: row.median };

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
                  {row.sectorRs !== null && (
                    <span
                      className={`text-[10px] font-medium ${row.sectorRs >= 0 ? "text-green-400/90" : "text-red-400/90"}`}
                      title={`Sector relative strength vs SPY (Mansfield): the sector/SPY ratio is ${Math.abs(row.sectorRs).toFixed(1)}% ${row.sectorRs >= 0 ? "above" : "below"} its own 200-day average. Zero-centred, so this measures out-performance, not just price direction.`}
                    >
                      RS {row.sectorRs >= 0 ? "+" : ""}{row.sectorRs.toFixed(1)}
                    </span>
                  )}
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

            {/* Is this broad, or one stock? Breadth is the 50d-SMA trend measure that
                feeds the composite; the median is today's participation. Both are
                immune to a single outlier, which a cap-weighted ETF return is not. */}
            {(part.breadth !== null || part.median !== null) && (
              <div className="mt-2 flex items-center gap-3 text-[10px]">
                {part.breadth !== null && (
                  <span
                    className="flex items-center gap-1"
                    title="Percentage of sector members trading above their own 50-day SMA. Unaffected by any single stock's move."
                  >
                    <span className="text-[#888]">Breadth</span>
                    <span className={
                      part.breadth >= 60 ? "font-semibold text-green-400"
                        : part.breadth >= 40 ? "font-semibold text-amber-400"
                          : "font-semibold text-red-400"
                    }>{part.breadth}%</span>
                  </span>
                )}
                {part.median !== null && (
                  <span
                    className="flex items-center gap-1"
                    title="Median move of the sector's stocks today. A cap-weighted return can be one name; a median cannot."
                  >
                    <span className="text-[#888]">Median</span>
                    <span className={part.median >= 0 ? "font-semibold text-green-400" : "font-semibold text-red-400"}>
                      {part.median > 0 ? "+" : ""}{part.median.toFixed(1)}%
                    </span>
                  </span>
                )}
              </div>
            )}

            {/* Enhancement #2: Conviction score */}
            <div className="mt-2 flex items-center gap-2">
              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${convictionBadge(conviction.level)}`}>
                {conviction.level}
              </span>
              <span className="text-[10px] leading-tight">
                <span className="text-[#666]">
                  {conviction.positives.length ? conviction.positives.join(", ") : "no supporting factors"}
                </span>
                {conviction.negatives.length > 0 && (
                  <span className="text-amber-400/80"> — against: {conviction.negatives.join(", ")}</span>
                )}
              </span>
            </div>

            <EntryScreenPanel screen={row.screen} />

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

type StockSortKey = "symbol" | "name" | "action" | "phase" | "sector" | "priceAtRotationStart" | "priceNow" | "dailyChangePct" | "performancePct" | "vsEtf" | "aboveSma50" | "volumeVsAvg" | "rs20d" | "trendAccel" | "rsAcceleration" | "earnings" | "verdict" | "finalScore" | "rsVsSector20";

function StockPerformanceTable({
  detail,
  lifecycle,
  sectorMap,
  lifecycleMap,
  screenPicks,
}: {
  detail: ActiveRotationDetail;
  lifecycle: LifecycleStage;
  sectorMap?: Map<string, string>;
  lifecycleMap?: Map<string, LifecycleStage>;
  /** Symbols that cleared the entry screen at the rotation start, for marking. */
  screenPicks?: Set<string>;
}) {
  const [sortKey, setSortKey] = useState<StockSortKey>("performancePct");
  const [sortAsc, setSortAsc] = useState(false);
  const [screenedOnly, setScreenedOnly] = useState(false);
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

  const hasActiveFilter = screenedOnly || actionFilter.size > 0 || sma50Filter !== "all" || rsAccelFilter !== "all" || volFilter !== "all" || phaseFilter !== "all" || trendAccelFilter !== "all" || rs20dFilter !== "all" || qualityFilter !== "all" || verdictFilter !== "all";

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
    setScreenedOnly(false);
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
    if (screenedOnly && screenPicks) copy = copy.filter(item => screenPicks.has(item.stock.symbol));
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
  }, [detail.stocks, sectorAvgPct, sortKey, sortAsc, lifecycle, lifecycleMap, etfPerfPct, actionFilter, sma50Filter, rsAccelFilter, volFilter, phaseFilter, trendAccelFilter, rs20dFilter, qualityFilter, verdictFilter, sectorMap, screenedOnly, screenPicks]);

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
        {screenPicks && screenPicks.size > 0 && (
          <>
            <div className="h-4 w-px bg-[#333]" />
            <button
              onClick={() => setScreenedOnly((v) => !v)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                screenedOnly
                  ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                  : "bg-[#1a1a1a] text-[#888] ring-1 ring-[#333] hover:text-[#ccc]"
              }`}
              title="Show only the names that cleared the entry screen on the rotation start bar"
            >
              Screened ({screenPicks.size})
            </button>
          </>
        )}
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
            <th
              className="cursor-pointer px-1.5 py-1.5 text-right select-none hover:text-white"
              onClick={() => handleSort("rsVsSector20")}
              aria-sort={stockAriaSort("rsVsSector20")}
              title="20-day return minus the sector ETF's over the same window. Measured against the SECTOR, not SPY — inside one basket, subtracting an index return is the same constant for everyone, so RS-vs-SPY would rank identically to the raw return column. Positive = leading its own rotation."
            >
              RS/Sec<SortArrow col="rsVsSector20" />
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
            <th className="cursor-pointer px-1.5 py-1.5 text-right select-none hover:text-white" onClick={() => handleSort("rsAcceleration")} aria-sort={stockAriaSort("rsAcceleration")} title="Relative strength ACCELERATION vs the sector ETF (5d vs 20d) — a short-term burst, not a level. Note: in the rotation entry study this scored a consistently NEGATIVE information coefficient (-0.095, stable train to test), meaning names already bursting against their own sector tended to underperform over the next 20 days. Read a high value as caution, not confirmation.">
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
            <th className="px-1.5 py-1.5 text-center" title="Which other scanners flagged this name tonight">
              Scanners
            </th>
            <th className="px-1.5 py-1.5 text-center" title="Sector-enrichment conviction: 6 weighted signals plus a phase penalty">
              Conv
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
                  {screenPicks?.has(s.symbol) && (
                    <span
                      className="ml-1 inline-flex items-center rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-medium text-emerald-300"
                      title="Cleared the entry screen on the rotation start bar: breakout above the 20-day high, 20-day return in the top half of the basket, ATR >= 3%"
                    >
                      ✓
                    </span>
                  )}
                </td>
                <td className={`px-1.5 py-1.5 text-right font-mono ${
                  s.rsVsSector20 == null ? "text-[#444]"
                    : s.rsVsSector20 > 0 ? "text-green-400" : "text-red-400"
                }`}>
                  {s.rsVsSector20 == null ? "—" : `${s.rsVsSector20 > 0 ? "+" : ""}${s.rsVsSector20.toFixed(1)}`}
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
                <td className="px-1.5 py-1.5 text-center"><ScannerBadges hits={s.scannerHits} /></td>
                <td className="px-1.5 py-1.5 text-center"><ConvictionCell level={s.enrichedConviction} /></td>
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

function ExpandedRotationDetail({ detail, regime, screen }: { detail: ActiveRotationDetail; regime: RegimeData | null | undefined; screen?: EntryScreenResult }) {
  const lc = computeLifecycleStage(detail.event);
  const conv = computeConviction(detail.event);
  const ra = regime ? isRegimeAligned(detail.event.sectorName, regime) : "neutral";
  const as_ = computeActionSignal(lc, conv, ra, getHealth(detail.event));
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
      {screen && (
        <div className="border-b border-[#2a2a2a] px-4 py-2">
          <EntryScreenPanel screen={screen} />
        </div>
      )}
      <StockPerformanceTable
        detail={detail}
        lifecycle={lc}
        screenPicks={screen ? new Set(screen.picks.map((x) => x.symbol)) : undefined}
      />
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

  let holdTrimCount = 0;
  let entryCandidates = 0;
  let avoidCount = 0;
  let turnaroundCount = 0;

  for (const s of detail.stocks) {
    const cat = categorizeStock(s, sectorAvgPct);
    const action = computeStockAction(cat, lifecycle);
    // Use sortOrder instead of label strings to avoid silent breakage on rename:
    // 0 = Buy/Speculative Buy, 1 = Hold, 2 = Trim, 3 = Watch/Risky, 4 = Avoid, 5 = Exit
    if (cat === "turnaround") turnaroundCount++;
    else if (action.sortOrder <= 0) entryCandidates++;
    else if (action.sortOrder <= 2) holdTrimCount++;
    else avoidCount++;
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
          {holdTrimCount > 0 && <span>Positioned: <span className="text-green-400 font-medium">{holdTrimCount}</span></span>}
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

type TimelineSortMode = "alpha" | "quadrant";

const QUADRANT_ORDER: Record<string, number> = { LEADING: 0, IMPROVING: 1, WEAKENING: 2, LAGGING: 3 };
const QUADRANT_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  LEADING: { text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30" },
  IMPROVING: { text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30" },
  WEAKENING: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  LAGGING: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
};

function HistoricalTimeline({ events, activeRotations }: { events: RotationEvent[]; activeRotations?: ActiveRotationDetail[] }) {
  const [sortMode, setSortMode] = useState<TimelineSortMode>("alpha");

  // Build current quadrant map from active rotations
  const quadrantMap = useMemo(() => {
    const map = new Map<string, RRGQuadrant>();
    if (activeRotations) {
      for (const rot of activeRotations) {
        map.set(rot.event.sectorId, rot.event.health.quadrant);
      }
    }
    return map;
  }, [activeRotations]);

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
    const arr = Array.from(map.entries());
    if (sortMode === "quadrant") {
      arr.sort((a, b) => {
        const qa = quadrantMap.get(a[0]);
        const qb = quadrantMap.get(b[0]);
        const oa = qa ? QUADRANT_ORDER[qa] : 99;
        const ob = qb ? QUADRANT_ORDER[qb] : 99;
        return oa - ob || a[1].name.localeCompare(b[1].name);
      });
    } else {
      arr.sort((a, b) => a[1].name.localeCompare(b[1].name));
    }
    return arr;
  }, [events, sortMode, quadrantMap]);

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

  // Build quadrant group dividers for SVG rendering
  const quadrantDividers = useMemo(() => {
    if (sortMode !== "quadrant") return [];
    const dividers: { y: number; label: string; color: string }[] = [];
    let lastQuadrant: string | undefined;
    for (let i = 0; i < sectors.length; i++) {
      const q = quadrantMap.get(sectors[i][0]) ?? "NONE";
      if (q !== lastQuadrant) {
        dividers.push({
          y: TOP + i * 32 - 4,
          label: q === "NONE" ? "No Active Rotation" : q,
          color: QUADRANT_COLORS[q]?.text ?? "text-[#555]",
        });
        lastQuadrant = q;
      }
    }
    return dividers;
  }, [sectors, sortMode, quadrantMap]);

  return (
    <div>
      {/* Sort toggle */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] text-[#555] uppercase tracking-wider">Sort:</span>
        <button
          type="button"
          onClick={() => setSortMode("alpha")}
          className={`rounded border px-2 py-0.5 text-[10px] transition-colors ${
            sortMode === "alpha"
              ? "border-[#5ba3e6]/30 bg-[#5ba3e6]/10 text-[#5ba3e6]"
              : "border-[#333] bg-[#1a1a1a] text-[#888] hover:text-white"
          }`}
        >
          A-Z
        </button>
        <button
          type="button"
          onClick={() => setSortMode("quadrant")}
          className={`rounded border px-2 py-0.5 text-[10px] transition-colors ${
            sortMode === "quadrant"
              ? "border-[#5ba3e6]/30 bg-[#5ba3e6]/10 text-[#5ba3e6]"
              : "border-[#333] bg-[#1a1a1a] text-[#888] hover:text-white"
          }`}
        >
          By Quadrant
        </button>
      </div>
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

        {/* Quadrant divider labels (when sorting by quadrant) */}
        {quadrantDividers.map((d, i) => {
          const svgColor = d.label === "LEADING" ? "#22c55e" : d.label === "IMPROVING" ? "#06b6d4" : d.label === "WEAKENING" ? "#f59e0b" : d.label === "LAGGING" ? "#ef4444" : "#555";
          return (
            <g key={i}>
              <line x1={LEFT} y1={d.y} x2={W - RIGHT} y2={d.y} stroke={svgColor} strokeWidth={0.5} opacity={0.4} />
            </g>
          );
        })}

        {/* Sector rows */}
        {sectors.map(([sectorId, { etf, name, events: sectorEvents }], rowIdx) => {
          const y = TOP + rowIdx * 32;
          const quadrant = quadrantMap.get(sectorId);
          const qDotColor = quadrant === "LEADING" ? "#22c55e" : quadrant === "IMPROVING" ? "#06b6d4" : quadrant === "WEAKENING" ? "#f59e0b" : quadrant === "LAGGING" ? "#ef4444" : undefined;

          return (
            <g key={sectorId}>
              {/* Quadrant dot (when sorting by quadrant) */}
              {sortMode === "quadrant" && qDotColor && (
                <circle cx={4} cy={y + BAR_H / 2} r={3} fill={qDotColor} opacity={0.7}>
                  <title>{quadrant}</title>
                </circle>
              )}
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
  // Cards vs one-line comparison table. Read lazily rather than in an effect so the
  // first paint is already the remembered view instead of flashing the default.
  const [viewMode, setViewMode] = useState<"cards" | "table">(() => {
    if (typeof window === "undefined") return "cards";
    return window.localStorage.getItem(VIEW_MODE_KEY) === "table" ? "table" : "cards";
  });
  const [heatmapSectors, setHeatmapSectors] = useState<SectorRotationScore[] | null>(null);
  // Superset of heatmapSectors. An active rotation can be a sub-sector (AIQ), a
  // cross-asset ETF or a leadership basket, none of which appear in `sectors` — so a
  // breadth lookup against the GICS list alone silently drops the Breadth chip on
  // exactly those cards. AIQ has a breadth of 48%; the card was rendering nothing.
  const [allSectorScores, setAllSectorScores] = useState<SectorRotationScore[] | null>(null);
  const [enrichedStocks, setEnrichedStocks] = useState<{ symbol: string; conviction: string }[]>([]);
  const [prerunServerMap, setPrerunServerMap] = useState<Map<string, { verdict: string; score: number; daysToEarnings: number | null; nextEarningsDate: string | null; rs20d: number | null }>>(new Map());
  const [collapsedPanels, togglePanel] = useCollapsedPanels("ew-rotation-collapsed-v1", ["timeline", "pattern-stats", "recently-ended"]);
  const consecutiveFailures = useRef(0);

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
      consecutiveFailures.current = 0;
    } catch (err) {
      consecutiveFailures.current++;
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
      const merged: SectorRotationScore[] = [
        ...(result.sectors ?? []),
        ...(result.subSectorScores ?? []),
        ...(result.crossAssetScores ?? []),
        ...(result.leadershipBasketScores ?? []),
      ];
      if (merged.length) setAllSectorScores(merged);
      // The same response already carries enrichment. Keeping it costs nothing and
      // saves a second request for the conviction column.
      if (result.enrichedStocks?.passed) {
        // Keyed by symbol below — keep only the canonical-sector row per symbol.
        setEnrichedStocks(
          (result.enrichedStocks.passed as { symbol: string; conviction: string; isCanonicalSector?: boolean }[])
            .filter((s) => s.isCanonicalSector !== false),
        );
      }
    } catch {
      // Non-critical — heatmap is supplementary
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
    fetchHeatmap();
  }, [fetchData, fetchHeatmap]);

  // Auto-refresh every 10 minutes (pauses in background tabs or after repeated failures)
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return;
      if (consecutiveFailures.current >= MAX_CONSECUTIVE_FAILURES) return;
      fetchData(true);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Enrich stocks with earnings + verdict + score data from prerun scan, and with
  // sector-enrichment conviction from the rotation response.
  const enrichedData = useMemo(() => {
    if (!data) return null;
    const scanResults = loadScanResults();
    const convictionByTicker = new Map(enrichedStocks.map((e) => [e.symbol, e.conviction]));

    const scanByTicker = new Map<string, (typeof scanResults)[number]>();
    for (const r of scanResults) { if (r.data?.ticker) scanByTicker.set(r.data.ticker, r); }

    const hasLocalData = scanByTicker.size > 0;
    const hasServerData = prerunServerMap.size > 0;
    // Conviction alone is worth a pass — bailing here on an empty prerun scan used to
    // drop it silently.
    if (!hasLocalData && !hasServerData && convictionByTicker.size === 0) return data;

    return {
      ...data,
      activeRotations: data.activeRotations.map((rotation) => ({
        ...rotation,
        stocks: rotation.stocks.map((s) => {
          const preRun = scanByTicker.get(s.symbol);
          const serverData = prerunServerMap.get(s.symbol);
          const conviction = convictionByTicker.get(s.symbol);
          if (!preRun && !serverData) return conviction ? { ...s, enrichedConviction: conviction } : s;
          return {
            ...s,
            enrichedConviction: conviction,
            daysToEarnings: preRun?.data.daysToEarnings ?? serverData?.daysToEarnings ?? s.daysToEarnings,
            nextEarningsDate: preRun?.data.nextEarningsDate ?? serverData?.nextEarningsDate ?? s.nextEarningsDate,
            rs20d: s.rs20d ?? preRun?.data.relativeStrength20d ?? serverData?.rs20d ?? null,
            verdict: preRun?.verdict ?? serverData?.verdict ?? null,
            finalScore: preRun?.scores.finalScore ?? serverData?.score ?? null,
          };
        }),
      })),
    };
  }, [data, prerunServerMap, enrichedStocks]);

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

  const setView = useCallback((mode: "cards" | "table") => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // Private mode / quota - the toggle still works for this session.
    }
  }, []);

  const rotationRows = useMemo(
    () => (data ? buildRotationRows(data.activeRotations, data.regime, allSectorScores ?? heatmapSectors) : []),
    [data, allSectorScores, heatmapSectors],
  );

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
          <Link
            href="/sectors/picks"
            className="rounded-md border border-[#333] bg-[#1a1a1a] px-3 py-1.5 text-xs text-[#a0a0a0] transition-colors hover:text-white hover:border-[#444]"
          >
            Stock Picks
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
          {/* Compact Regime Pill */}
          {data.regime && (
            <div className="flex items-center gap-4 rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-2">
              <span className="text-[10px] text-[#555] uppercase tracking-wider">Regime</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${regimeColor(data.regime.regime)} ${
                data.regime.regime === "RISK_ON" ? "bg-green-500/15" :
                data.regime.regime === "RISK_OFF" ? "bg-red-500/15" :
                data.regime.regime === "INFLATIONARY" ? "bg-amber-500/15" :
                "bg-[#2a2a2a]"
              }`}>
                {data.regime.regime.replace("_", " ")}
              </span>
              <span className="text-[11px] text-[#888]">VIX {data.regime.vix.toFixed(1)}</span>
              <span className="text-[11px] text-[#888]">Confidence {data.regime.regimeConfidence}%</span>
            </div>
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
              <div className="ml-auto flex items-center gap-0.5 rounded-md border border-[#333] bg-[#1a1a1a] p-0.5">
                {([["cards", "Cards"], ["table", "Table"]] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setView(mode)}
                    aria-pressed={viewMode === mode}
                    title={mode === "cards" ? "Detail cards" : "One line per rotation - sortable"}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                      viewMode === mode ? "bg-[#2a2a2a] text-white" : "text-[#888] hover:text-[#ccc]"
                    }`}
                  >
                    {mode === "cards" ? <LayoutGrid className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}
                    {label}
                  </button>
                ))}
              </div>
            </h2>
            {viewMode === "cards" ? (
              <ActiveRotationCards
                rows={rotationRows}
                onExpand={handleExpandSector}
                expandedId={expandedSector}
                regime={data.regime}
                patternStats={data.patternStats}
              />
            ) : (
              <ActiveRotationTable
                rows={rotationRows}
                onExpand={handleExpandSector}
                expandedId={expandedSector}
                hasRegime={Boolean(data.regime)}
              />
            )}
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
          {expandedDetail && (
            <ExpandedRotationDetail
              detail={expandedDetail}
              regime={data.regime}
              screen={rotationRows.find((r) => r.detail.event.sectorId === expandedSector)?.screen}
            />
          )}

          {/* Recently Ended */}
          {data.recentlyEndedRotations.length > 0 && (
            <CollapsiblePanel
              id="recently-ended"
              title="Recently Ended"
              collapsed={collapsedPanels.has("recently-ended")}
              onToggle={togglePanel}
              badge={<span className="text-[10px] text-[#888]">{data.recentlyEndedRotations.length}</span>}
            >
              <RecentlyEndedList events={data.recentlyEndedRotations} />
            </CollapsiblePanel>
          )}

          {/* Historical Timeline */}
          <CollapsiblePanel
            id="timeline"
            title="12-Month Timeline"
            collapsed={collapsedPanels.has("timeline")}
            onToggle={togglePanel}
          >
            <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
              <HistoricalTimeline events={data.allEvents} activeRotations={data.activeRotations} />
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
          </CollapsiblePanel>

          {/* Pattern Statistics */}
          <CollapsiblePanel
            id="pattern-stats"
            title="Pattern Statistics"
            collapsed={collapsedPanels.has("pattern-stats")}
            onToggle={togglePanel}
          >
            <div className="rounded-lg border border-[#2a2a2a] bg-[#111]">
              <PatternStatsTable stats={data.patternStats} />
            </div>
          </CollapsiblePanel>

          {/* Filter Recipes */}
          <FilterRecipes />
        </div>
      )}
    </main>
  );
}
