"use client";

import type { RotationTurn } from "@/lib/sector-rotation/rotation-turn";
import { rotationTurnBadge, rotationTurnReason } from "@/lib/sector-rotation/rotation-turn";
import { InfoTip } from "./info-tip";

const TONE_STYLE: Record<string, string> = {
  // Forming is a watchlist state with no measured edge, so it reads as information —
  // muted and dashed — rather than as a call to act.
  forming: "text-sky-300/80 border-sky-400/25 bg-sky-400/5 border-dashed",
  // A fresh, unconfirmed turn is the actionable-but-unproven state, so it gets the
  // attention colour rather than the success colour.
  fresh: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  confirmed: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  late: "text-[#888] border-[#333] bg-[#1a1a1a]",
  none: "text-[#555] border-transparent",
};

/**
 * Dated RS turn, shown beside the quadrant rather than instead of it.
 *
 * The quadrant tells you where the sector sits; this tells you when the relative-strength
 * line actually turned and how many sessions the label took to agree. On the 2026-09-21
 * board SMH reads "turn 2026-09-17 · quadrant +2" — the label was two sessions behind,
 * and the RS low it came off was 09-14.
 */
export function RotationTurnBadge({ turn, compact = false }: { turn: RotationTurn | null | undefined; compact?: boolean }) {
  if (!turn || turn.stage === "NONE") return null;
  if (!turn.turnDate && turn.stage !== "TURN_FORMING") return null;
  const { label, tone } = rotationTurnBadge(turn);

  return (
    <span className="flex items-center gap-1">
      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-mono ${TONE_STYLE[tone]}`}>
        {label}
      </span>
      {!compact && <InfoTip text={rotationTurnReason(turn)} />}
    </span>
  );
}

/**
 * The full dated sequence, for the expanded card. Four dates in the order they happen,
 * so the lag is visible as a gap rather than as a number to interpret.
 *
 * `rsLowDate` is labelled "RS low (retrospective)" on purpose — on that session every
 * input was still falling, and a reader who treats it as an entry date is reading a
 * number that was not knowable at the time.
 */
export function RotationTurnTimeline({ turn }: { turn: RotationTurn | null | undefined }) {
  if (!turn || turn.stage === "NONE") return null;
  if (!turn.turnDate && turn.stage !== "TURN_FORMING") return null;
  const dir = turn.direction === "UP" ? "into" : "out of";

  const rows: { label: string; value: string | null; muted?: boolean }[] = [
    { label: `RS ${turn.direction === "UP" ? "low" : "high"} (retrospective)`, value: turn.rsLowDate, muted: true },
    { label: "Forming — RS rising into the fast SMA", value: turn.formingDate, muted: true },
    { label: "Turn — fast SMA reclaimed", value: turn.turnDate },
    { label: "Confirmed — slow SMA cleared", value: turn.confirmedDate },
    {
      label: turn.quadrantAlreadyAligned ? "Quadrant (already aligned)" : "Quadrant agreed",
      value: turn.quadrantDate,
      muted: turn.quadrantAlreadyAligned,
    },
  ];

  return (
    <div className="mt-2 rounded border border-[#2a2a2a] bg-[#141414] p-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wide text-[#888]">Rotation {dir} sector</span>
        {turn.legLowDate && turn.legLowDate !== turn.rsLowDate && (
          <span className="text-[10px] text-[#666] font-mono">leg low {turn.legLowDate}</span>
        )}
      </div>
      <div className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-2 text-[10px]">
            <span className={r.muted ? "text-[#666]" : "text-[#a0a0a0]"}>{r.label}</span>
            <span className={`font-mono ${r.value ? (r.muted ? "text-[#777]" : "text-[#d0d0d0]") : "text-[#555]"}`}>
              {r.value ?? "not yet"}
            </span>
          </div>
        ))}
      </div>
      {turn.stage === "TURN_FORMING" && (
        <p className="mt-1.5 text-[10px] leading-snug text-sky-300/70">
          Watchlist only. Measured over 37 ETFs and 3 years, this stage carries no forward
          edge over a random session and fewer than half are followed by a reclaim within
          five sessions. Use it to pick names and set levels, not to size.
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[10px] text-[#777] font-mono">
        <span>held {turn.heldSessions}d</span>
        {turn.quadrantLagBars !== null && <span>label lag {turn.quadrantLagBars}d</span>}
        {turn.priorFailedAttempts > 0 && (
          <span className="text-amber-400/70" title="Earlier reclaims of the fast SMA that failed before this one">
            {turn.priorFailedAttempts} failed {turn.priorFailedAttempts === 1 ? "attempt" : "attempts"} first
          </span>
        )}
        {turn.stale && <span className="text-[#666]">stale ({turn.barsSinceTurn}d old)</span>}
      </div>
    </div>
  );
}
