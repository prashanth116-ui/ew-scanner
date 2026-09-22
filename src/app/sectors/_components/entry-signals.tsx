"use client";

import { useMemo } from "react";
import { ArrowUpCircle, Plus, Shield, TrendingUp, ChevronRight } from "lucide-react";
import Link from "next/link";
import type {
  SectorRotationScore,
  RRGQuadrant,
  EnrichedStock,
} from "@/lib/sector-rotation/types";
import type { RotationTrackerResult, ActiveRotationDetail, RotationPatternStats, LifecycleStage, ConvictionResult, RotationTurn, RotationEvent, RotationHealthSignals } from "@/lib/sector-rotation/rotation-types";
import { RotationTurnBadge } from "./turn-badge";
import {
  getHealth,
  computeLifecycleStage,
  computeConviction,
  computeActionSignal,
  isRegimeAligned,
  type ActionSignal,
} from "@/lib/sector-rotation/rotation-helpers";
import { ROTATION } from "@/lib/sector-rotation/config";
import { rotationAgeSessions, turnCorroboratesRotation } from "@/lib/sector-rotation/rotation-turn-view";
import { quadrantColor } from "./helpers";
import { CollapsiblePanel } from "./shared";

// ── Timing Classification ──

type SignalTiming = "EARLY" | "CONFIRMED" | "DELAYED" | "MATURE";

const TIMING_STYLE: Record<SignalTiming, { bg: string; border: string; text: string; label: string }> = {
  EARLY: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-400", label: "Early" },
  CONFIRMED: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400", label: "Confirmed" },
  DELAYED: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", label: "Delayed" },
  MATURE: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", label: "Mature" },
};

const TIMING_RANK: Record<SignalTiming, number> = { EARLY: 0, CONFIRMED: 1, DELAYED: 2, MATURE: 3 };

function classifyTiming(daysActive: number, health: { acceleration: number; cmf20: number }): SignalTiming {
  const hasHealthConfirmation = health.cmf20 > 0 && health.acceleration > 0;

  if (daysActive <= ROTATION.EARLY_TIMING_DAYS) return "EARLY";
  if (daysActive <= ROTATION.EARLY_TIMING_DAYS + 3 && !hasHealthConfirmation) return "EARLY";
  if (daysActive <= ROTATION.DELAYED_TIMING_DAYS) return "CONFIRMED";
  if (daysActive <= ROTATION.MATURE_TIMING_DAYS) return "DELAYED";
  return "MATURE";
}

/**
 * Trailing 20-day (or shorter) average signal count against MIN_AVG_SIGNAL_COUNT.
 *
 * Returns **null** when there is not enough history to judge, rather than false. The
 * distinction is the one the root CLAUDE.md draws for every shared feature: null means the
 * test does not apply, false means it was measured and failed. Collapsing them here meant
 * a rotation the tracker had only just noticed was rejected as "unsustained" — SMH on
 * 2026-09-22 carried one bar of history (its own Day 1) and one signalCount of 3, so the
 * average passed easily and the length guard vetoed it anyway.
 *
 * That guard is not wrong: three bars really is too few to call a signal sustained. It is
 * the wrong question when the history is short only because the detector was late, which
 * is why the caller treats null as "needs corroboration" instead of "fails".
 */
function isSignalSustained(signalHistory: { date: string; signalCount: number; close: number }[]): boolean | null {
  if (signalHistory.length < 3) return null;
  const window = signalHistory.slice(-20);
  const avgSignal = window.reduce((sum, h) => sum + h.signalCount, 0) / window.length;
  return avgSignal >= ROTATION.MIN_AVG_SIGNAL_COUNT;
}

/** Trailing 20-day average signal count for display. */
function trailingAvgSignalCount(signalHistory: { date: string; signalCount: number; close: number }[]): number {
  if (signalHistory.length === 0) return 0;
  const window = signalHistory.slice(-20);
  return window.reduce((sum, h) => sum + h.signalCount, 0) / window.length;
}

// ── Types ──

interface EntrySignalSector {
  /** Age on the longer of the two clocks — see rotationAgeSessions. Shown beside the raw
   *  Day N so a late detector is visible rather than silently understating the age. */
  ageSessions: number;
  rotation: ActiveRotationDetail;
  signal: ActionSignal;
  lifecycle: LifecycleStage;
  conviction: ConvictionResult;
  regimeAlignment: "aligned" | "headwind" | "neutral";
  health: { acceleration: number; cmf20: number; quadrant: RRGQuadrant };
  patternStats: RotationPatternStats | undefined;
  topStocks: EnrichedStock[];
  timing: SignalTiming;
}

// ── Component ──

export function RotationEntrySignals({
  rotationData,
  enrichedStocks,
  sectors,
  collapsed,
  onToggle,
  inflectionMap,
  transitionMap,
  onSectorClick,
}: {
  rotationData: RotationTrackerResult;
  enrichedStocks: EnrichedStock[];
  sectors: SectorRotationScore[];
  collapsed: boolean;
  onToggle: (id: string) => void;
  inflectionMap?: Map<string, { trade_read: string; score: number }>;
  transitionMap?: Map<string, { alert_state: string; state: string; score: number }>;
  onSectorClick?: (sectorName: string) => void;
}) {
  const { entries, emerging, emergingList, exiting, unsustained } = useMemo(() => {
    const results: EntrySignalSector[] = [];
    const regime = rotationData.regime;
    let emergingCount = 0;
    const emergingList: { event: RotationEvent; health: RotationHealthSignals }[] = [];
    let exitingCount = 0;
    let unsustainedCount = 0;

    for (const rotation of rotationData.activeRotations) {
      const event = rotation.event;
      const health = getHealth(event);
      const lifecycle = computeLifecycleStage(event);
      const conviction = computeConviction(event);
      const alignment = regime ? isRegimeAligned(event.sectorName, regime) : "neutral";
      const signal = computeActionSignal(lifecycle, conviction, alignment, health);

      // Filter EXIT rotations
      if (signal.action === "EXIT") { exitingCount++; continue; }

      // Blip filter, measured on the LONGER of the two clocks and waived when the RS turn
      // confirms the move independently.
      //
      // `daysActive` counts from the signal-count start bar, and that detector can be
      // badly late — SMH on 2026-09-22 read Day 1 against an RS line that reclaimed its
      // 20d on 09-17 and began rising 09-16. Filtering on the raw day count rejected the
      // youngest, strongest, highest-conviction rotation on the board for being young,
      // when it was five sessions old and only the detector was late. Even the corrected
      // age (3-4 sessions) still misses a threshold of 5, so the confirmed turn is what
      // carries it: a cleared slow SMA is direct evidence the move is real, standing in
      // for the days the tracker failed to count.
      //
      // A genuine blip - signals fired, RS not confirmed - is still filtered, which is
      // the whole point of the threshold. MIN_ROTATION_DAYS itself is unchanged.
      const turn = rotationData.rotationTurns?.[event.sectorId] ?? null;
      const ageSessions = rotationAgeSessions(event.daysActive, turn);
      if (ageSessions < ROTATION.MIN_ROTATION_DAYS && !turnCorroboratesRotation(turn)) {
        emergingCount++;
        emergingList.push({ event, health });
        continue;
      }

      // Filter unsustained signals
      // Unsustained signals. `null` means too little history to judge - a confirmed RS
      // turn stands in for it, exactly as it does for the age filter above. A measured
      // `false` is real negative evidence and is never waived.
      const sustained = isSignalSustained(event.signalHistory ?? []);
      if (sustained === false || (sustained === null && !turnCorroboratesRotation(turn))) {
        unsustainedCount++;
        emergingList.push({ event, health });
        continue;
      }

      const timing = classifyTiming(event.daysActive, health);

      const sectorStocks = enrichedStocks.filter((s) => s.sectorEtf === event.etf);
      const qualityStocks = sectorStocks.filter(
        (s) => (s.conviction === "HIGH" || s.conviction === "MEDIUM") &&
          (s.category === "LEADER" || s.category === "TURNAROUND" || (s.category === "CATCH_UP" && s.conviction === "HIGH"))
      );

      const CONVICTION_SORT: Record<string, number> = { HIGH: 0, MEDIUM: 1, WATCH: 2 };
      const topStocks = [...qualityStocks]
        .sort((a, b) => (CONVICTION_SORT[a.conviction] ?? 9) - (CONVICTION_SORT[b.conviction] ?? 9) || (b.rsAccel ?? 0) - (a.rsAccel ?? 0))
        .slice(0, 3);

      const stats = rotationData.patternStats.find((p) => p.etf === event.etf);

      results.push({
        ageSessions,
        rotation,
        signal,
        lifecycle,
        conviction,
        regimeAlignment: alignment,
        health,
        patternStats: stats,
        topStocks,
        timing,
      });
    }

    // Sort: EARLY first → CONFIRMED → DELAYED; within tier: conviction score desc
    results.sort((a, b) => TIMING_RANK[a.timing] - TIMING_RANK[b.timing] || b.conviction.score - a.conviction.score);

    return { entries: results, emerging: emergingCount, emergingList, exiting: exitingCount, unsustained: unsustainedCount };
  }, [rotationData, enrichedStocks]);

  // Panel badge color based on best timing
  const bestTiming: SignalTiming | null = entries.length > 0 ? entries[0].timing : null;
  const badgeStyle = bestTiming ? TIMING_STYLE[bestTiming] : null;

  // Leader/turnaround counts across all signals
  const leaderCount = entries.reduce((sum, e) => sum + e.topStocks.filter((s) => s.category === "LEADER").length, 0);
  const turnaroundCount = entries.reduce((sum, e) => sum + e.topStocks.filter((s) => s.category === "TURNAROUND").length, 0);

  // Group entries by timing tier
  const groups = useMemo(() => {
    const map = new Map<SignalTiming, EntrySignalSector[]>();
    for (const e of entries) {
      const arr = map.get(e.timing) ?? [];
      arr.push(e);
      map.set(e.timing, arr);
    }
    const ordered: { timing: SignalTiming; items: EntrySignalSector[] }[] = [];
    for (const t of ["EARLY", "CONFIRMED", "DELAYED", "MATURE"] as SignalTiming[]) {
      const items = map.get(t);
      if (items && items.length > 0) ordered.push({ timing: t, items });
    }
    return ordered;
  }, [entries]);

  return (
    <CollapsiblePanel
      id="entry-signals"
      title="Rotation Signals"
      collapsed={collapsed}
      onToggle={onToggle}
      badge={
        entries.length === 0
          ? <span className="rounded-full border border-[#333] bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-medium text-[#666]">No signals</span>
          : <div className="flex items-center gap-1.5">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeStyle!.border} ${badgeStyle!.bg} ${badgeStyle!.text}`}>
                {entries.length} {entries.length === 1 ? "signal" : "signals"}
              </span>
              {(leaderCount > 0 || turnaroundCount > 0) && (
                <span className="text-[10px] text-[#666]">
                  {leaderCount > 0 && <span className="text-green-400/70">{leaderCount}L</span>}
                  {leaderCount > 0 && turnaroundCount > 0 && " + "}
                  {turnaroundCount > 0 && <span className="text-cyan-400/70">{turnaroundCount}T</span>}
                </span>
              )}
            </div>
      }
      className={entries.length > 0 && badgeStyle ? badgeStyle.border : ""}
    >
      <div className="space-y-3">
        <Link href="/rotation" className="inline-flex items-center gap-1 text-[10px] text-[#666] hover:text-[#5ba3e6] transition-colors">
          Full lifecycle analysis <ChevronRight className="h-3 w-3" />
        </Link>
        {entries.length === 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-[#666]">No active rotations pass noise filters. Check the <a href="/rotation" className="text-[#5ba3e6] hover:underline">Rotation Tracker</a> for current rotation status.</p>
            <div className="text-[11px] text-[#555] space-y-0.5">
              {exiting > 0 && <p>{exiting} rotation{exiting !== 1 ? "s" : ""} ending</p>}
              {unsustained > 0 && <p>{unsustained} rotation{unsustained !== 1 ? "s" : ""} with unsustained signals</p>}
            </div>
          </div>
        )}

        {/* Too young for the noise filter, shown anyway.
            MIN_ROTATION_DAYS is a calibrated filter and is NOT weakened here — these are
            rendered outside the signal groups, muted, and labelled as not yet qualifying.
            The RS turn date is the useful context: a day-1 rotation whose RS line turned
            several sessions ago is a different proposition from one that turned today. */}
        {emergingList.length > 0 && (
          <div className="rounded border border-dashed border-[#2a2a2a] bg-[#121212] px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#666]">
              Below the noise filters — too young, or too little history to judge
            </div>
            <div className="mt-1 space-y-0.5">
              {emergingList.map(({ event }) => (
                <div key={event.etf} className="flex flex-wrap items-center gap-x-2 text-[11px]">
                  <span className="font-semibold text-[#a0a0a0]">{event.sectorName}</span>
                  <span className="text-[#5ba3e6]">{event.etf}</span>
                  <span className="text-[#666]">day {event.daysActive}</span>
                  <RotationTurnBadge turn={rotationData.rotationTurns?.[event.sectorId]} compact />
                </div>
              ))}
            </div>
            <p className="mt-1 text-[10px] leading-snug text-[#555]">
              Not signals — these have not cleared the age or sustained-signal filters. Check the{" "}
              <a href="/rotation" className="text-[#5ba3e6] hover:underline">Rotation Tracker</a> before acting.
            </p>
          </div>
        )}

        {groups.map((group) => {
          const style = TIMING_STYLE[group.timing];
          return (
            <div key={group.timing}>
              {/* Section header */}
              <div className="mb-2 flex items-center gap-2">
                <div className="h-px flex-1 bg-[#2a2a2a]" />
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>
                  {style.label} Signals ({group.items.length})
                </span>
                <div className="h-px flex-1 bg-[#2a2a2a]" />
              </div>

              <div className="space-y-3">
                {group.items.map((entry) => (
                  <SignalCard key={entry.rotation.event.etf} entry={entry} sectors={sectors} inflectionMap={inflectionMap} transitionMap={transitionMap} onSectorClick={onSectorClick} turn={rotationData.rotationTurns?.[entry.rotation.event.sectorId]} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </CollapsiblePanel>
  );
}

// ── Signal Card ──

function SignalCard({ entry, sectors, inflectionMap, transitionMap, onSectorClick, turn }: { entry: EntrySignalSector; sectors: SectorRotationScore[]; inflectionMap?: Map<string, { trade_read: string; score: number }>; transitionMap?: Map<string, { alert_state: string; state: string; score: number }>; onSectorClick?: (sectorName: string) => void; turn?: RotationTurn }) {
  const { rotation, signal, lifecycle, conviction, regimeAlignment, health, patternStats, topStocks, timing } = entry;
  const event = rotation.event;
  const sectorScore = sectors.find((s) => s.sector === event.sectorName);
  const style = TIMING_STYLE[timing];

  const signalHistory = event.signalHistory ?? [];
  const avgSignalCount = trailingAvgSignalCount(signalHistory);

  // Health indicator colors
  const cmfColor = health.cmf20 > 0 ? "bg-green-500/10 text-green-400 border-green-500/30"
    : health.cmf20 > ROTATION.HEALTH_CMF_AMBER ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
    : "bg-red-500/10 text-red-400 border-red-500/30";
  const accelColor = health.acceleration > 0 ? "bg-green-500/10 text-green-400 border-green-500/30"
    : health.acceleration > ROTATION.HEALTH_ACCEL_AMBER ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
    : "bg-red-500/10 text-red-400 border-red-500/30";
  const signalColor = avgSignalCount >= 2.5 ? "text-green-400" : avgSignalCount >= 1.5 ? "text-cyan-400" : "text-amber-400";
  const convictionColor = conviction.level === "HIGH" ? "border-green-500/30 bg-green-500/10 text-green-400"
    : conviction.level === "MODERATE" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"
    : conviction.level === "EXIT" ? "border-red-500/30 bg-red-500/10 text-red-400"
    : "border-amber-500/30 bg-amber-500/10 text-amber-400";

  // Action badge
  const actionIcon = signal.action === "ENTER"
    ? <ArrowUpCircle className="mr-1 inline h-3 w-3" />
    : signal.action === "ADD ON PULLBACK"
      ? <Plus className="mr-1 inline h-3 w-3" />
      : <Shield className="mr-1 inline h-3 w-3" />;
  const actionLabel = signal.action === "HOLD — TIGHTEN STOPS" ? "HOLD" : signal.action;

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} p-3`}>
      {/* Header row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {onSectorClick ? (
          <button type="button" onClick={() => onSectorClick(event.sectorName)} className="font-semibold text-white hover:text-[#5ba3e6] transition-colors cursor-pointer">
            {event.sectorName}
          </button>
        ) : (
          <span className="font-semibold text-white">{event.sectorName}</span>
        )}
        <span className="text-xs text-[#666]">{event.etf}</span>
        {sectorScore && (
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${quadrantColor(sectorScore.quadrant)}`}>
            {sectorScore.quadrant}
          </span>
        )}
        {/* Timing badge */}
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${style.border} ${style.bg} ${style.text}`}>
          <TrendingUp className="h-3 w-3" />
          {style.label} (Day {event.daysActive})
        </span>
        {/* Action badge */}
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${signal.borderColor} ${signal.bgColor} ${signal.color}`}>
          {actionIcon}{actionLabel}
        </span>
        {regimeAlignment === "aligned" && (
          <span className="rounded-full border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400">Regime Aligned</span>
        )}
      </div>

      <p className="mb-2 text-xs text-[#a0a0a0]">{signal.description}</p>

      {/* Stage + Day info. `Day N` counts from the signalCount start date; the turn
          badge dates the RS line itself, which is usually the earlier of the two. */}
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-[#666]">Stage: <span className="text-white">{lifecycle}</span></span>
        <span className="text-[#666]">Day {event.daysActive}{patternStats ? ` / avg ${Math.round(patternStats.avgDurationDays)}d` : ""}</span>
        {entry.ageSessions > event.daysActive && (
          <span className="text-[#666]" title="Sessions since the RS line turned. The signal-count detector started this rotation later than the RS did.">
            RS {entry.ageSessions}d
          </span>
        )}
        <RotationTurnBadge turn={turn} compact />
      </div>

      {/* Health indicator badges */}
      <div className="mb-2 flex flex-wrap gap-2 text-[10px]">
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 ${cmfColor}`}>
          CMF {health.cmf20 > 0 ? "+" : ""}{health.cmf20.toFixed(2)}
        </span>
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 ${accelColor}`}>
          Accel {health.acceleration > 0 ? "+" : ""}{health.acceleration.toFixed(2)}
        </span>
        <span className={`inline-flex items-center rounded-full border border-[#333] bg-[#1a1a1a] px-1.5 py-0.5`}>
          <span className={signalColor}>{avgSignalCount.toFixed(1)}/3</span><span className="text-[#666] ml-0.5">signals</span>
        </span>
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 ${convictionColor}`}>
          {conviction.level}
        </span>
        {regimeAlignment === "headwind" && (
          <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-red-400">Headwind</span>
        )}
      </div>

      {/* Top picks */}
      {topStocks.length > 0 ? (
        <div className="rounded-md border border-[#2a2a2a] bg-[#0d0d0d] p-2">
          <div className="mb-1 text-[10px] font-medium text-[#666] uppercase tracking-wide">Top Picks</div>
          <div className="space-y-1">
            {topStocks.map((stock) => (
              <div key={stock.symbol} className="flex items-center gap-2 text-xs">
                <a
                  href={`https://finance.yahoo.com/quote/${stock.symbol}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#5ba3e6] hover:underline"
                >
                  {stock.symbol}
                </a>
                {stock.category === "LEADER" && (
                  <span className="rounded border border-green-500/30 bg-green-500/10 px-1 py-0.5 text-[8px] font-bold text-green-400" title="Sector Leader">L</span>
                )}
                {stock.category === "TURNAROUND" && (
                  <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1 py-0.5 text-[8px] font-bold text-cyan-400" title="Turnaround Candidate">T</span>
                )}
                {inflectionMap?.has(stock.symbol) && (
                  <span
                    className="rounded border border-sky-500/30 bg-sky-500/10 px-1 py-0.5 text-[8px] font-bold text-sky-400"
                    title={`Inflection: ${inflectionMap.get(stock.symbol)!.trade_read} (${inflectionMap.get(stock.symbol)!.score})`}
                  >INF</span>
                )}
                {transitionMap?.has(stock.symbol) && (
                  <span
                    className="rounded border border-violet-500/30 bg-violet-500/10 px-1 py-0.5 text-[8px] font-bold text-violet-400"
                    title={`Transition: ${transitionMap.get(stock.symbol)!.alert_state} / ${transitionMap.get(stock.symbol)!.state} (${transitionMap.get(stock.symbol)!.score})`}
                  >TRANS</span>
                )}
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${stock.conviction === "HIGH" ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"}`}>
                  {stock.conviction}
                </span>
                {stock.rsAccel != null && (
                  <span className={`text-[10px] ${stock.rsAccel > 0 ? "text-green-400" : "text-red-400"}`}>
                    RS {stock.rsAccel > 0 ? "+" : ""}{stock.rsAccel.toFixed(1)}
                  </span>
                )}
                {stock.institutionalPct != null && (
                  <span className="text-[10px] text-[#666]">Inst {stock.institutionalPct.toFixed(0)}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-[#2a2a2a] bg-[#0d0d0d] p-2">
          <p className="text-[10px] text-[#555] italic">No quality stocks yet — monitoring for leaders/turnarounds</p>
        </div>
      )}
    </div>
  );
}
