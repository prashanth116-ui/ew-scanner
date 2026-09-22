/**
 * Rotation turn — types and display helpers.
 *
 * ISOMORPHIC BY CONTRACT. Nothing here may import a module that reaches "server-only",
 * directly or transitively, because `turn-badge.tsx` is a client component and imports
 * these as runtime values.
 *
 * That is not theoretical. These helpers first lived in `rotation-turn.ts` beside
 * `computeRotationTurn`, which imports `calcRRG` from `math.ts`, which imports
 * `prerun/data.ts`, which is `server-only`. The client bundle therefore pulled a
 * server-only module in and the Turbopack build failed with ten errors — while
 * `tsc --noEmit` and the full test suite both passed, because tsc does no bundle
 * analysis and vitest stubs `server-only` outright. `npm run build` is the only gate
 * that catches this, and it belongs in the pre-commit routine for that reason.
 *
 * The measurement and design rationale for the turn itself stays in `rotation-turn.ts`.
 */

import { ROTATION_TURN } from "./config";

/**
 * Where the turn is in its own lifecycle. Ordered, but NOT a score — a later stage is
 * further along, not necessarily better.
 */
export type TurnStage =
  /** RS line is on the wrong side of its fast SMA and not closing on it. Nothing here. */
  | "NONE"
  /**
   * ANTICIPATION. The RS line is still BELOW its fast SMA but has risen for two sessions
   * with the gap to the SMA narrowing each time. No reclaim yet — `turnDate` is null.
   *
   * This exists for one reason: it is the only construct that fires the session before a
   * reclaim, and on SMH that session was 2026-09-16 against a 09-17 reclaim and a 09-21
   * quadrant. Entering at the 09-16 close returned +6.67% against SPY by 09-21 versus
   * +4.89% from 09-17 and 0.00% from the quadrant.
   *
   * NOT A POSITION SIGNAL, and the measurement says so plainly. Over 37 ETFs and 3 years
   * it fires 1,895 times (12.7/week board-wide) with forward returns vs SPY of +0.02%/3d,
   * -0.04%/5d, -0.14%/10d, -0.04%/20d against an unconditional control of
   * +0.03%/+0.04%/+0.08%/+0.19% — at or fractionally below chance on every horizon. Fewer
   * than half are followed by an actual reclaim within five sessions.
   *
   * What it buys is preparation time, not conviction. The thing that separated SMH on
   * 09-16 from the ~12 other baskets forming that week was NOT visible in its own RS
   * line, and member breadth said no: 31% above their 50d against ENTRY_SCREEN's 60%
   * gate, zero 20-day breakouts, median member 3.79% behind SPY over five sessions.
   * Treat it as a watchlist that tells you where to look tomorrow.
   */
  | "TURN_FORMING"
  /** Fast SMA reclaimed and held. The earliest date a completed turn exists. */
  | "TURN_DETECTED"
  /** Slow SMA reclaimed too. */
  | "TURN_CONFIRMED"
  /** The RRG quadrant has caught up and agrees. */
  | "QUADRANT_CONFIRMED";

/** Stage ordering, for sorting and for "at least this far along" comparisons. */
export const TURN_STAGE_ORDER: Record<TurnStage, number> = {
  NONE: 0,
  TURN_FORMING: 1,
  TURN_DETECTED: 2,
  TURN_CONFIRMED: 3,
  QUADRANT_CONFIRMED: 4,
};

export type TurnDirection = "UP" | "DOWN";

export interface RotationTurn {
  stage: TurnStage;
  /** UP = rotating into the sector, DOWN = out of it. Mirrored rules throughout. */
  direction: TurnDirection;

  /**
   * The RS extreme of the excursion this turn came off — the low (UP) or high (DOWN)
   * printed between the last session on this side of the fast SMA and the reclaim.
   *
   * RETROSPECTIVE. On this date every input was still falling, so no live rule fired
   * here; it is the date a reader means by "when it bottomed", not a trigger. For SMH
   * this is 2026-09-14, three sessions before the actionable reclaim.
   */
  rsLowDate: string | null;
  /**
   * The RS extreme over the whole LOOKBACK_BARS window — the leg's low, which may be
   * far older than `rsLowDate` and is usually a different bar. SMH prints 2026-07-29
   * here against 2026-09-14 for `rsLowDate`: the leg low, then a higher low six weeks
   * later that the reclaim actually came off. Both are worth showing; conflating them
   * would overstate how long this particular turn has been building.
   */
  legLowDate: string | null;
  /**
   * TURN_FORMING only: session the anticipation run began, and has held since. Null at
   * every other stage — once a reclaim prints, `turnDate` is the date that matters and
   * keeping a stale forming date alongside it invites reading the wrong one.
   */
  formingDate: string | null;
  /** Sessions since `formingDate`. Null unless TURN_FORMING. */
  barsSinceForming: number | null;
  /** Session the RS line reclaimed its fast SMA and has held it since. The trigger. */
  turnDate: string | null;
  /** Session it also cleared the slow SMA. */
  confirmedDate: string | null;
  /** Session the RRG quadrant entered the matching bucket, if it has. */
  quadrantDate: string | null;

  /** Sessions since `turnDate`. 0 on the turn session itself. */
  barsSinceTurn: number | null;
  /**
   * Sessions the quadrant trailed the turn, never negative. Null in the two cases where
   * no lag exists to report: the quadrant has not caught up at all, and
   * `quadrantAlreadyAligned` — so read it with `stage`, not instead of it.
   */
  quadrantLagBars: number | null;
  /**
   * The quadrant was already in the matching bucket before this turn — the sector never
   * left the bucket, the RS line just dipped under its fast SMA and came back. Not a
   * late label, a different situation, and reporting it as a negative lag (IGV at -39,
   * ARKK at -27 on the 2026-09-21 board) made the field meaningless.
   */
  quadrantAlreadyAligned: boolean;
  /** Consecutive sessions held on the right side of the fast SMA. */
  heldSessions: number;
  /**
   * Reclaims within the lookback that failed before this one.
   *
   * NOT PREDICTIVE. Stage 8 measured it at -2pp on whether a turn matures into a tradeable
   * rotation, and 3+ failures scored mildly BETTER than 1-2 — the opposite of the intuition
   * it was built on. It survives as tooltip texture because "this basket has been choppy"
   * is worth knowing, but it must never lead a line or carry a warning colour, and nothing
   * should gate on it.
   */
  priorFailedAttempts: number;
  /** True once the turn is older than MAX_TURN_AGE_BARS — no longer news. */
  stale: boolean;
  /** RS line as a % of its fast SMA, signed by direction. Magnitude of the reclaim. */
  distanceFromFastPct: number;
}

/** One line for a card or a tooltip. Says what turned, when, and what it cost. */
export function rotationTurnReason(t: RotationTurn): string {
  if (t.stage === "TURN_FORMING" && t.formingDate) {
    // Phrased as a watchlist line, not a trade line. The measurement behind TURN_FORMING
    // says it carries no forward edge, so the copy must not imply one.
    const bits = [
      `RS rising into its ${ROTATION_TURN.FAST_SMA}d average since ${t.formingDate} — no reclaim yet`,
      `${t.distanceFromFastPct.toFixed(2)}% below it`,
    ];
    if (t.rsLowDate) bits.push(`RS low ${t.rsLowDate}`);
    if (t.priorFailedAttempts > 0) {
      bits.push(`${t.priorFailedAttempts} earlier reclaim${t.priorFailedAttempts === 1 ? "" : "s"} failed`);
    }
    bits.push("watchlist only — confirm on the reclaim");
    return bits.join(" · ");
  }
  if (t.stage === "NONE" || !t.turnDate) return "No relative-strength turn in progress";
  const dir = t.direction === "UP" ? "into" : "out of";
  const parts: string[] = [];
  parts.push(`RS turned ${dir} the sector on ${t.turnDate} (${t.barsSinceTurn} session${t.barsSinceTurn === 1 ? "" : "s"} ago)`);
  if (t.rsLowDate && t.rsLowDate !== t.turnDate) {
    parts.push(`RS ${t.direction === "UP" ? "low" : "high"} ${t.rsLowDate}`);
  }
  if (t.confirmedDate) parts.push(`confirmed ${t.confirmedDate}`);
  if (t.quadrantAlreadyAligned) {
    parts.push(`quadrant already aligned since ${t.quadrantDate}`);
  } else if (t.quadrantDate && t.quadrantLagBars !== null) {
    parts.push(
      `quadrant agreed ${t.quadrantDate}, ${t.quadrantLagBars} session${t.quadrantLagBars === 1 ? "" : "s"} later`,
    );
  } else {
    parts.push("quadrant has not caught up");
  }
  if (t.priorFailedAttempts > 0) {
    parts.push(`${t.priorFailedAttempts} earlier reclaim${t.priorFailedAttempts === 1 ? "" : "s"} failed first`);
  }
  return parts.join(" · ");
}

/**
 * Short badge label. `stale` is surfaced because a 40-session-old turn and a 2-session-old
 * turn are the same stage but very different reads.
 */
export function rotationTurnBadge(t: RotationTurn): { label: string; tone: "forming" | "fresh" | "confirmed" | "late" | "none" } {
  if (t.stage === "TURN_FORMING" && t.formingDate) {
    return { label: `~ forming ${t.formingDate}`, tone: "forming" };
  }
  if (t.stage === "NONE" || !t.turnDate) return { label: "—", tone: "none" };
  const arrow = t.direction === "UP" ? "↑" : "↓";
  if (t.stale) return { label: `${arrow} turned ${t.turnDate}`, tone: "late" };
  switch (t.stage) {
    case "TURN_DETECTED":
      return { label: `${arrow} turn ${t.turnDate}`, tone: "fresh" };
    case "TURN_CONFIRMED":
      return { label: `${arrow} turn ${t.turnDate} confirmed`, tone: "confirmed" };
    default:
      // Only advertise a lag when there was one; "+0" on an already-aligned quadrant
      // reads as a claim the label kept up, which is a different fact.
      return {
        label: t.quadrantLagBars !== null
          ? `${arrow} turn ${t.turnDate} · quadrant +${t.quadrantLagBars}`
          : `${arrow} turn ${t.turnDate} · quadrant aligned`,
        tone: "confirmed",
      };
  }
}

/**
 * How many sessions a rotation has really been running.
 *
 * `RotationEvent.daysActive` counts from the signal-count start bar, and that detector can
 * be badly late: its RS input is a 10d-vs-30d SMA cross, which for SMH did not fire until
 * 2026-09-21 — the same session as the RRG quadrant — while the RS line had reclaimed its
 * 20d on 09-17 and started rising on 09-16. The rotation was five sessions old and the
 * tracker called it Day 1.
 *
 * So age is the longer of the two clocks. Where the tracker fires first (the common case —
 * XLK started 08-13 against a 09-04 turn) this returns `daysActive` unchanged.
 */
export function rotationAgeSessions(daysActive: number, turn: RotationTurn | null | undefined): number {
  if (!turn || turn.direction !== "UP") return daysActive;
  // barsSince* counts sessions AFTER the event, so +1 makes it inclusive like daysActive.
  const fromTurn = turn.barsSinceTurn != null ? turn.barsSinceTurn + 1 : null;
  const fromForming = turn.barsSinceForming != null ? turn.barsSinceForming + 1 : null;
  return Math.max(daysActive, fromTurn ?? 0, fromForming ?? 0);
}

/**
 * Does the RS turn independently corroborate a young rotation?
 *
 * The blip filter asks "has this run long enough to not be noise", and uses a day count as
 * the proxy. When a rotation is young *only because the detector was late*, the day count
 * answers the wrong question. A turn that has cleared its slow SMA is direct evidence the
 * move is real — the same confirmation the turn ladder uses — so it stands in for the days
 * the tracker did not count.
 *
 * Deliberately requires CONFIRMED, not merely TURN_DETECTED: a bare reclaim carries no
 * measured edge (see the TURN_FORMING notes) and admitting it would reopen the filter to
 * exactly the noise it exists to remove.
 */
export function turnCorroboratesRotation(turn: RotationTurn | null | undefined): boolean {
  if (!turn || turn.direction !== "UP") return false;
  return turn.stage === "TURN_CONFIRMED" || turn.stage === "QUADRANT_CONFIRMED";
}
