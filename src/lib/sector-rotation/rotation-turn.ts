/**
 * Rotation turn — a dated read of when a sector's relative strength actually turned,
 * independent of when the RRG quadrant gets around to saying so.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A FASTER QUADRANT
 *
 * `calcRRG` stacks four transforms: a 10-period EMA of the raw RS line, a 200-bar
 * rolling z-score of that, a 10-period ROC of the z-score, then a second 200-bar
 * z-score. RS-Momentum therefore cannot cross 100 until a turn has been underway for
 * weeks. SMH is the motivating case: the RS line bottomed 2026-09-14, reclaimed its
 * 20d SMA on 09-17 and its 50d on 09-18, and ran +8.4% against SPY in five sessions —
 * but the quadrant only printed LEADING on 09-21, by which point most member names
 * had already made their move.
 *
 * The obvious fix — speed up the quadrant — was measured and rejected. Across 37 ETFs,
 * three years of point-in-time quadrants (~27k sessions) and eleven candidate triggers:
 *
 *   - Median lead over the shipped quadrant was 0-1 sessions, not the week the SMH case
 *     suggests. Fast rules flip so often that by the time the slow one fires, the fast
 *     one has usually just re-fired after several failures.
 *   - Signal count went from 751 to 1,008-1,823. Reverts within 5 sessions went from
 *     17% to 34-61%. Median run length went from 14 sessions to 4.
 *   - Forward 20-day return vs SPY after promotion: unconditional control 47.7% positive
 *     / +0.19%, shipped quadrant 45.6% / -0.05%, every fast rule 45-47% / +0.0-0.2%.
 *     Promotion carries no standalone edge at either speed, so there is nothing to be
 *     early to. `scripts/rotation-backtest/README.md` found the same from the other
 *     direction: "The gate alone is worthless... The veto does most of the work."
 *
 * So the quadrant keeps its calibrated semantics and its 40-odd consumers, and the turn
 * is reported beside it as dates. The point is to make the lag VISIBLE and DATED rather
 * than to pretend it is not there: `quadrantLagBars` is the number that answers "how
 * late was the label this time".
 *
 * WHAT IT IS HONEST ABOUT
 *
 * The turn cannot be dated to the RS low on the day of the low. On 2026-09-14 SMH
 * underperformed SPY by 4.31%, its RS line sat 2.83% below its 20d SMA and Mansfield RS
 * was at its low for the leg — every measurable input was still falling. `rsLowDate`
 * is therefore reported as retrospective context, and `turnDate` (the reclaim, knowable
 * at that close) is the only date a live rule can act on.
 *
 * `priorFailedAttempts` is the cost of that speed, stated rather than hidden. SMH
 * reclaimed its 20d SMA five times in seven weeks — 08-07, 08-12, 08-27 and 09-04 all
 * failed within 1-7 sessions; only 09-17 held. A reader who sees TURN_DETECTED with
 * four prior failures knows what they are looking at.
 *
 * REJECTED: BREADTH VELOCITY AS A FILTER ON TURN_FORMING — do not re-propose without
 * new evidence.
 *
 * The obvious way to sharpen TURN_FORMING is to rank the ~9-13 weekly candidates by
 * member-breadth velocity rather than level, since SMH went 17% -> 22% -> 31% above their
 * 50d over the three sessions into 09-16 — a sharp rise off a washed-out base that a
 * level gate (ENTRY_SCREEN's 60%) reads as a fail. It was measured on 446 TURN_FORMING
 * events across the 21 baskets with >= 5 members, 2024-11-19 to 2026-07-21, with member
 * breadth computed the same way ENTRY_SCREEN computes it. It does not work:
 *
 *   - Correlation between 3-session breadth velocity and forward 10d relative return:
 *     0.016. There is no relationship to exploit.
 *   - Top velocity quartile does lift reclaim-within-5-sessions from 43% to 54%, but its
 *     forward returns (+0.15%/3d, +0.17%/5d, -0.13%/10d, +0.33%/20d, 46-53% positive) are
 *     not distinguishable from the unconditional control.
 *   - `vel3 >= +15pp` performs WORSE than `vel3 >= +10pp` on every horizon. A threshold
 *     that reverses as it tightens is fitting noise.
 *   - The exact SMH-09-16 shape — velocity >= +10pp with level < 45% — is historically a
 *     LOSING setup on a 20-day hold: n=21, -0.99% mean, 33% positive. Loosened to
 *     velocity >= +5pp (n=51) it is -1.30% and 37% positive. One excellent trade came out
 *     of a shape that has not paid in general.
 *
 * One unexpected result from the same run is worth a proper study rather than a change:
 * breadth LEVEL at the forming date appears INVERTED. Bottom-quartile level returned
 * +0.65%/20d at 58% positive while top quartile returned -0.60% at 37%, and events
 * clearing the 60% gate ran -0.61%/20d at 37% positive against -0.14%/+53% for those
 * under 40%. A mean-reversion reading (low breadth means the members have not moved yet)
 * is coherent, and it is measured at a different point than ENTRY_SCREEN's rotation-start
 * bar so it does not contradict that study. But it is one slice among roughly twenty
 * examined over 1.7 years on 21 baskets, so it is a hypothesis, not a finding.
 */

import { calcRRG } from "./math";
import { ROTATION_TURN } from "./config";
import type { RRGQuadrant } from "./types";

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
   * Reclaims within the lookback that failed before this one. The noise count: four
   * prior failures means this rule fired four times on nothing before it fired on this.
   */
  priorFailedAttempts: number;
  /** True once the turn is older than MAX_TURN_AGE_BARS — no longer news. */
  stale: boolean;
  /** RS line as a % of its fast SMA, signed by direction. Magnitude of the reclaim. */
  distanceFromFastPct: number;
}

function smaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

const isBullQuadrant = (q: RRGQuadrant): boolean => q === "LEADING" || q === "IMPROVING";

/** Is bar `i` on the turn's side of the SMA? */
function onSide(ratio: number, sma: number | null, dir: TurnDirection): boolean | null {
  if (sma === null) return null;
  return dir === "UP" ? ratio > sma : ratio < sma;
}

const EMPTY: RotationTurn = {
  stage: "NONE",
  direction: "UP",
  rsLowDate: null,
  legLowDate: null,
  formingDate: null,
  barsSinceForming: null,
  turnDate: null,
  confirmedDate: null,
  quadrantDate: null,
  barsSinceTurn: null,
  quadrantLagBars: null,
  quadrantAlreadyAligned: false,
  heldSessions: 0,
  priorFailedAttempts: 0,
  stale: false,
  distanceFromFastPct: 0,
};

/**
 * Date the sector's current relative-strength turn.
 *
 * `dates` must be ISO `YYYY-MM-DD`, same length and order as the close arrays, oldest
 * first. Series shorter than the slow SMA plus the lookback return a NONE turn rather
 * than a partial one — a turn dated off an incomplete SMA is worse than no turn.
 *
 * The quadrant history used to date `quadrantDate` is re-derived here on expanding
 * windows, because callers hold only the current quadrant. That is a slightly different
 * window than the fixed 252-bar one the live read uses, so `quadrantDate` is accurate to
 * within a session or so on older transitions. The live quadrant is always the caller's,
 * never this function's.
 */
export function computeRotationTurn(
  dates: string[],
  sectorCloses: number[],
  benchmarkCloses: number[],
  currentQuadrant: RRGQuadrant,
): RotationTurn {
  const n = Math.min(dates.length, sectorCloses.length, benchmarkCloses.length);
  const need = ROTATION_TURN.SLOW_SMA + ROTATION_TURN.LOOKBACK_BARS;
  if (n < need) return EMPTY;

  const d = dates.slice(-n);
  const sc = sectorCloses.slice(-n);
  const bc = benchmarkCloses.slice(-n);

  const ratio: number[] = new Array(n);
  for (let i = 0; i < n; i++) ratio[i] = bc[i] !== 0 ? sc[i] / bc[i] : 0;

  const fast = smaSeries(ratio, ROTATION_TURN.FAST_SMA);
  const slow = smaSeries(ratio, ROTATION_TURN.SLOW_SMA);
  const last = n - 1;
  const fastNow = fast[last];
  if (fastNow === null || fastNow === 0) return EMPTY;

  // Direction comes from which side of the fast SMA the RS line closed on. This is a
  // statement about the RS line only — deliberately not about the quadrant, since the
  // whole point is to report the two separately.
  //
  // One exception, below: a line UNDER the SMA that is rising into it is anticipating an
  // UP turn, not reporting a DOWN one.
  const aboveFast = ratio[last] > fastNow;
  const direction: TurnDirection = aboveFast ? "UP" : "DOWN";
  const distanceFromFastPct =
    ((ratio[last] / fastNow - 1) * 100) * (direction === "UP" ? 1 : -1);

  // ── TURN_FORMING: the pre-reclaim state, checked before the DOWN path claims the bar ──
  //
  // Only evaluated from BELOW the fast SMA, so it can only ever anticipate an UP turn.
  // The mirror (a line above the SMA falling into it, anticipating a DOWN turn) is
  // deliberately absent: it would fire on any two-day dip inside a healthy uptrend and
  // would overwrite the turnDate/confirmedDate of every sector in one, which is a
  // regression dressed as a feature. An exit-warning product can be built separately.
  if (!aboveFast) {
    const fmt = ROTATION_TURN.FORMING_RISING_SESSIONS;
    const forming = (i: number): boolean => {
      if (i - fmt < 0) return false;
      // Rising for `fmt` consecutive sessions...
      for (let k = i; k > i - fmt; k--) if (!(ratio[k] > ratio[k - 1])) return false;
      // ...and closing the gap to the SMA on each of those sessions. Rising alone is not
      // enough: a line rising slower than its own SMA is falling further behind.
      for (let k = i; k > i - fmt; k--) {
        const a = fast[k], b = fast[k - 1];
        if (a === null || b === null) return false;
        if (ratio[k] >= a) return false; // must still be below, or this is a reclaim
        if (!(a - ratio[k] < b - ratio[k - 1])) return false;
      }
      return true;
    };

    if (forming(last)) {
      // Walk back to the first session of the current uninterrupted forming run.
      let formingIdx = last;
      while (formingIdx - 1 >= ROTATION_TURN.SLOW_SMA && forming(formingIdx - 1)) formingIdx--;

      // The excursion low this is rising off, bounded by the last session above the SMA.
      const lookFrom = Math.max(0, formingIdx - ROTATION_TURN.LOOKBACK_BARS);
      let excStart = lookFrom;
      for (let i = formingIdx - 1; i >= lookFrom; i--) {
        if (onSide(ratio[i], fast[i], "UP") === true) { excStart = i + 1; break; }
      }
      let lowIdx = excStart;
      for (let i = excStart; i <= last; i++) if (ratio[i] < ratio[lowIdx]) lowIdx = i;
      let legIdx = lookFrom;
      for (let i = lookFrom; i <= last; i++) if (ratio[i] < ratio[legIdx]) legIdx = i;

      // Failed reclaims in the lookback — the same honesty this module owes everywhere.
      let failed = 0;
      for (let i = lookFrom + 1; i < last; i++) {
        if (onSide(ratio[i], fast[i], "UP") === true && onSide(ratio[i - 1], fast[i - 1], "UP") === false) failed++;
      }

      return {
        ...EMPTY,
        stage: "TURN_FORMING",
        direction: "UP",
        rsLowDate: d[lowIdx],
        legLowDate: d[legIdx],
        formingDate: d[formingIdx],
        barsSinceForming: last - formingIdx,
        // No reclaim has printed, so there is no turn to date and no lag to measure.
        // Leaving these null is the point: a consumer must not be able to read a
        // forming setup as a completed one.
        turnDate: null,
        confirmedDate: null,
        heldSessions: last - formingIdx + 1,
        priorFailedAttempts: failed,
        distanceFromFastPct: (ratio[last] / fastNow - 1) * 100, // negative: still below
      };
    }
  }

  // How long the current side has held, walking back while still on that side.
  let heldSessions = 1;
  while (heldSessions < n) {
    const i = last - heldSessions;
    if (i < 0) break;
    if (onSide(ratio[i], fast[i], direction) !== true) break;
    heldSessions++;
  }
  const turnIdx = last - (heldSessions - 1);

  if (heldSessions < ROTATION_TURN.MIN_HOLD_SESSIONS) {
    return { ...EMPTY, direction, distanceFromFastPct, heldSessions };
  }

  const lookStart = Math.max(0, turnIdx - ROTATION_TURN.LOOKBACK_BARS);

  // The leg extreme: lowest (UP) or highest (DOWN) RS reading across the whole lookback.
  let legIdx = lookStart;
  for (let i = lookStart; i <= turnIdx; i++) {
    const better = direction === "UP" ? ratio[i] < ratio[legIdx] : ratio[i] > ratio[legIdx];
    if (better) legIdx = i;
  }

  // The extreme THIS turn came off, which is a different bar and the one a reader means.
  // Walk back from the turn to the last session that was on this side of the fast SMA;
  // the excursion between that and the reclaim is what the turn reversed. Bounded by
  // lookStart so an all-window excursion still yields a date.
  let excursionStart = lookStart;
  for (let i = turnIdx - 1; i >= lookStart; i--) {
    if (onSide(ratio[i], fast[i], direction) === true) { excursionStart = i + 1; break; }
  }
  let extremeIdx = excursionStart;
  for (let i = excursionStart; i <= turnIdx; i++) {
    const better = direction === "UP" ? ratio[i] < ratio[extremeIdx] : ratio[i] > ratio[extremeIdx];
    if (better) extremeIdx = i;
  }

  // Failed reclaims before this one: each entry onto this side of the fast SMA within
  // the lookback that did not survive to the current session.
  let priorFailedAttempts = 0;
  for (let i = lookStart + 1; i < turnIdx; i++) {
    const here = onSide(ratio[i], fast[i], direction);
    const before = onSide(ratio[i - 1], fast[i - 1], direction);
    if (here === true && before === false) priorFailedAttempts++;
  }

  // Slow-SMA confirmation: first session at or after the turn that cleared it and has
  // held that side since. Scanned forward so the date is the first clear, not the latest.
  let confirmedIdx: number | null = null;
  for (let i = turnIdx; i <= last; i++) {
    if (onSide(ratio[i], slow[i], direction) === true) {
      let held = true;
      for (let k = i + 1; k <= last; k++) {
        if (onSide(ratio[k], slow[k], direction) !== true) { held = false; break; }
      }
      if (held) { confirmedIdx = i; break; }
    }
  }

  // Quadrant agreement. Re-derive just enough history to date the transition into the
  // matching bucket; anything older than the scan window is reported as un-caught-up,
  // which is the truthful answer for a turn this recent.
  const wantBull = direction === "UP";
  let quadrantIdx: number | null = null;
  if (isBullQuadrant(currentQuadrant) === wantBull) {
    const scanFrom = Math.max(ROTATION_TURN.FAST_SMA, n - ROTATION_TURN.QUADRANT_SCAN_BARS);
    let agreeSince: number | null = null;
    for (let i = last; i >= scanFrom; i--) {
      const g = calcRRG(sc.slice(0, i + 1), bc.slice(0, i + 1));
      if (isBullQuadrant(g.quadrant) === wantBull) agreeSince = i;
      else break;
    }
    quadrantIdx = agreeSince;
  }

  let stage: TurnStage = "TURN_DETECTED";
  if (quadrantIdx !== null && confirmedIdx !== null) stage = "QUADRANT_CONFIRMED";
  else if (confirmedIdx !== null) stage = "TURN_CONFIRMED";

  const barsSinceTurn = last - turnIdx;
  // A quadrant that entered the bucket at or before the turn was never late — it never
  // left. Only a strictly later entry is a lag.
  const quadrantAlreadyAligned = quadrantIdx !== null && quadrantIdx <= turnIdx;

  return {
    stage,
    direction,
    rsLowDate: d[extremeIdx],
    legLowDate: d[legIdx],
    // A completed turn has a reclaim date; the forming run that preceded it is no longer
    // the fact to read, so it is not carried forward.
    formingDate: null,
    barsSinceForming: null,
    turnDate: d[turnIdx],
    confirmedDate: confirmedIdx !== null ? d[confirmedIdx] : null,
    quadrantDate: quadrantIdx !== null ? d[quadrantIdx] : null,
    barsSinceTurn,
    quadrantLagBars: quadrantIdx !== null && !quadrantAlreadyAligned ? quadrantIdx - turnIdx : null,
    quadrantAlreadyAligned,
    heldSessions,
    priorFailedAttempts,
    stale: barsSinceTurn > ROTATION_TURN.MAX_TURN_AGE_BARS,
    distanceFromFastPct,
  };
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
