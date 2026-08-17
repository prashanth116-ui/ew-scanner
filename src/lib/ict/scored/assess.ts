/**
 * Scored ICT assessment.
 *
 * Runs every detector independently, converts each detection into points, and
 * subtracts risk penalties. No component gates any other component.
 *
 * The contrast with src/lib/ict/scoring.ts is the whole reason this exists:
 * there, every component opened with `if (setup.currentState < X) return 0`,
 * so scoring sat downstream of the state machine and inherited its failures.
 * A stock stalled at rung 7 scored zero on displacement quality even when its
 * displacement candle was textbook. Here each detector answers for itself.
 */

import { WINDOW, WEIGHTS, PENALTIES, RISK, GRADES } from "./config";
import {
  detectSSLRaid,
  detectDisplacement,
  detectMSS,
  detectFVG,
  detectReaccumulation,
  detectBSL,
  detectCompression,
  findInvalidation,
  countConsecutiveExpansion,
} from "./detectors";
import type {
  CandleSeries,
  ICTAssessment,
  ICTComponents,
  ICTDetections,
  ICTGrade,
  ICTRiskFlags,
} from "./types";

/** Shortest of the four OHLC arrays — guards against ragged input. */
function usableLength(s: CandleSeries): number {
  return Math.min(s.opens.length, s.highs.length, s.lows.length, s.closes.length);
}

function emptyAssessment(barsAssessed: number): ICTAssessment {
  return {
    score: 0,
    rawScore: 0,
    grade: "NONE",
    components: {
      ssl: 0,
      displacement: 0,
      mss: 0,
      fvg: 0,
      reaccumulation: 0,
      bsl: 0,
      compression: 0,
      coherence: 0,
    },
    detections: {
      ssl: null,
      displacement: null,
      mss: null,
      fvg: null,
      reaccumulation: null,
      bsl: null,
      compression: null,
    },
    flags: { invalidated: false, extended: false, chasing: false },
    penalties: [],
    protectedLow: null,
    bslTarget: null,
    ingredientsFound: 0,
    coherenceRatio: 0,
    evidence: [],
    barsAssessed,
  };
}

/**
 * Chronological coherence: of the event orderings that CAN be tested, how many
 * hold? Correct order is rewarded, wrong order is not fatal.
 */
function computeCoherence(d: ICTDetections): { ratio: number; testable: number } {
  const pairs: boolean[] = [];

  if (d.ssl && d.displacement) pairs.push(d.ssl.barsAgo > d.displacement.barsAgo);
  if (d.displacement && d.mss) pairs.push(d.displacement.barsAgo >= d.mss.barsAgo);
  if (d.displacement && d.fvg) pairs.push(d.displacement.barsAgo >= d.fvg.barsAgo);
  if (d.mss && d.reaccumulation) pairs.push(d.mss.barsAgo > d.reaccumulation.barsAgo);
  if (d.fvg && d.reaccumulation) pairs.push(d.fvg.barsAgo > d.reaccumulation.barsAgo);

  if (pairs.length === 0) return { ratio: 0, testable: 0 };
  return {
    ratio: pairs.filter(Boolean).length / pairs.length,
    testable: pairs.length,
  };
}

/**
 * Grade is a label on top of the score, never a change to it.
 *
 * Two rules beyond the raw bands: an invalidated setup is dead whatever it
 * scores, and PRIME requires actual readiness — a liquidity target overhead and
 * a coil — not just clean structure behind it.
 */
function gradeFor(score: number, components: ICTComponents, invalidated: boolean): ICTGrade {
  if (invalidated) return "NONE";

  const readiness = components.bsl + components.compression;
  if (score >= GRADES.PRIME) {
    return readiness >= GRADES.PRIME_MIN_READINESS ? "PRIME" : "BUILDING";
  }
  if (score >= GRADES.BUILDING) return "BUILDING";
  if (score >= GRADES.FORMING) return "FORMING";
  return "NONE";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Assess a candle series for ICT pre-expansion structure.
 *
 * @param s      OHLC series, oldest bar first.
 * @param endIdx Bar to assess. Defaults to the most recent bar.
 */
export function assessICT(s: CandleSeries, endIdx?: number): ICTAssessment {
  const len = usableLength(s);
  const idx = endIdx ?? len - 1;

  if (len < WINDOW.MIN_BARS || idx < 0 || idx >= len) {
    return emptyAssessment(len);
  }

  const w = WINDOW.EVENT_BARS;

  // ── Detection ──
  //
  // Each detector answers on its own evidence; none can zero another. The only
  // ordering here is which BAR a detector is pointed at, and it exists for one
  // reason: the raid that matters is the one the impulse came out of.
  //
  // Searching for the most recent raid instead let a later sell-off — one that
  // swept the base and destroyed the setup — register as a fresh raid. That
  // moved the protected low down onto the crash bar, so the invalidation check
  // then compared price against the wreckage rather than the structure, and a
  // broken setup scored as a live one.
  const displacement = detectDisplacement(s, idx, w);
  const ssl = displacement
    ? detectSSLRaid(s, idx, w, displacement.barIndex - 1)
    : detectSSLRaid(s, idx, w);
  const mss = detectMSS(s, idx, w, ssl ? ssl.barIndex : null);
  const fvg = detectFVG(s, idx, w, 0);

  // The structural stop: the raid low, else the displacement candle's low.
  const protectedLow = ssl?.raidLow ?? displacement?.candleLow ?? null;
  const anchorIdx = ssl?.barIndex ?? displacement?.barIndex ?? null;

  const reaccumulation = detectReaccumulation(s, idx, w, protectedLow, 0);
  const bsl = detectBSL(s, idx);
  const compression = detectCompression(s, idx, bsl ? bsl.level : null);

  const detections: ICTDetections = {
    ssl,
    displacement,
    mss,
    fvg,
    reaccumulation,
    bsl,
    compression,
  };

  // ── Components ──
  const coherence = computeCoherence(detections);

  const components: ICTComponents = {
    ssl: round1(ssl ? WEIGHTS.SSL * ssl.quality : 0),
    displacement: round1(displacement ? WEIGHTS.DISPLACEMENT * displacement.quality : 0),
    mss: round1(mss ? WEIGHTS.MSS * mss.quality : 0),
    fvg: round1(fvg ? WEIGHTS.FVG * fvg.quality : 0),
    reaccumulation: round1(reaccumulation ? WEIGHTS.REACCUMULATION * reaccumulation.quality : 0),
    bsl: round1(bsl ? WEIGHTS.BSL * bsl.quality : 0),
    compression: round1(compression ? WEIGHTS.COMPRESSION * compression.quality : 0),
    coherence: round1(WEIGHTS.COHERENCE * coherence.ratio),
  };

  const rawScore =
    components.ssl +
    components.displacement +
    components.mss +
    components.fvg +
    components.reaccumulation +
    components.bsl +
    components.compression +
    components.coherence;

  // ── Risk flags and penalties ──
  const penalties: { reason: string; points: number }[] = [];

  const invalidationBar =
    protectedLow !== null && anchorIdx !== null
      ? findInvalidation(s, anchorIdx, idx, protectedLow)
      : null;
  const invalidated = invalidationBar !== null;
  if (invalidated) {
    penalties.push({
      reason: `Close broke protected low ${protectedLow!.toFixed(2)} at bar ${invalidationBar}`,
      points: PENALTIES.INVALIDATED,
    });
  }

  let extended = false;
  if (fvg && !fvg.filled) {
    const mid = (fvg.upper + fvg.lower) / 2;
    if (mid > 0) {
      const abovePct = ((s.closes[idx] - mid) / mid) * 100;
      if (abovePct > RISK.EXTENDED_ABOVE_FVG_PCT) {
        extended = true;
        penalties.push({
          reason: `${abovePct.toFixed(1)}% above FVG midpoint — entry is late`,
          points: PENALTIES.EXTENDED,
        });
      }
    }
  }

  const expansionRun = countConsecutiveExpansion(s, idx);
  const chasing = expansionRun >= RISK.CHASE_CANDLES;
  if (chasing) {
    penalties.push({
      reason: `${expansionRun} consecutive expansion candles — chasing`,
      points: PENALTIES.CHASING,
    });
  }

  const totalPenalty = penalties.reduce((sum, p) => sum + p.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(rawScore - totalPenalty)));

  const flags: ICTRiskFlags = { invalidated, extended, chasing };

  // ── Evidence ──
  const evidence: string[] = [];
  if (ssl) {
    evidence.push(
      `SSL raid ${ssl.barsAgo} bars ago: swept ${ssl.sweptLevel.toFixed(2)}` +
        (ssl.reclaimed ? ", reclaimed" : ", NOT reclaimed"),
    );
  }
  if (displacement) {
    evidence.push(
      `Displacement ${displacement.barsAgo} bars ago: body ${(displacement.bodyRatio * 100).toFixed(0)}% of range, ` +
        `${displacement.expansionRatio.toFixed(1)}x prior bodies`,
    );
  }
  if (mss) {
    evidence.push(
      `MSS ${mss.barsAgo} bars ago: closed ${mss.marginPct.toFixed(1)}% above structure ${mss.structureHigh.toFixed(2)}` +
        (mss.anchored ? " (anchored to raid)" : " (rolling — no raid anchor)"),
    );
  }
  if (fvg) {
    evidence.push(
      `FVG ${fvg.lower.toFixed(2)}-${fvg.upper.toFixed(2)} (${fvg.gapPct.toFixed(2)}%), ` +
        `retraced ${(fvg.retracedFraction * 100).toFixed(0)}%` +
        (fvg.filled ? " — FILLED" : ""),
    );
  }
  if (reaccumulation) {
    evidence.push(
      `Higher low ${reaccumulation.higherLow.toFixed(2)}, ` +
        `${reaccumulation.marginPct.toFixed(1)}% above protected low`,
    );
  }
  if (bsl) {
    evidence.push(
      `BSL ${bsl.level.toFixed(2)} with ${bsl.clusterCount} clustered high(s), ` +
        `${bsl.distancePct.toFixed(1)}% away`,
    );
  }
  if (compression) {
    evidence.push(
      `Compression: range ${(compression.contractionRatio * 100).toFixed(0)}% of prior block, ` +
        `${compression.consecutiveHigherLows} higher low(s)`,
    );
  }
  evidence.push(
    `Sequence: ${(coherence.ratio * 100).toFixed(0)}% of ${coherence.testable} orderings correct`,
  );

  const ingredientsFound = [ssl, displacement, mss, fvg, reaccumulation, bsl, compression].filter(
    Boolean,
  ).length;

  return {
    score,
    rawScore: round1(rawScore),
    grade: gradeFor(score, components, invalidated),
    components,
    detections,
    flags,
    penalties,
    protectedLow,
    bslTarget: bsl ? bsl.level : null,
    ingredientsFound,
    coherenceRatio: coherence.ratio,
    evidence,
    barsAssessed: len,
  };
}
