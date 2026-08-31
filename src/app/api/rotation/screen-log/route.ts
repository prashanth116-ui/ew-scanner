import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { calculateRotationTracker } from "@/lib/sector-rotation/rotation-tracker";
import { evaluateEntryScreen } from "@/lib/sector-rotation/entry-screen";
import { ENTRY_SCREEN } from "@/lib/sector-rotation/config";
import { fetchYahooChart } from "@/lib/prerun/data";
import {
  insertRotationScreenLogs,
  loadUnscoredRotationScreenLogs,
  scoreRotationScreenLog,
  type RotationScreenLogRecord,
} from "@/lib/supabase/persistence";

export const maxDuration = 300;

/**
 * Forward log for the rotation entry screen.
 *
 * Two passes per run:
 *   1. record every active rotation's screen verdict, if not already recorded
 *   2. score any recorded rotation whose 20 trading-day window has elapsed
 *
 * Why this exists: the screen's thresholds were fitted on 8 firing rotations after
 * trying roughly fifteen configurations, in a window where only 8 of 78 rotations
 * had a negative 20-day ETF return. That is a calibration, not evidence. Recording
 * the picks before the outcome is known is the only thing that converts it, and at
 * ~5-6 firings a year the clock matters more than the code.
 *
 * Rows are inserted, never updated, so a verdict cannot be quietly revised once the
 * result is visible.
 */

/** A rotation first seen this many sessions after it started is a backfill. */
const FORWARD_GRACE_DAYS = 4;
/** Calendar days that comfortably cover ENTRY_SCREEN.HOLD_DAYS trading days. */
const SCORE_AFTER_CALENDAR_DAYS = Math.ceil(ENTRY_SCREEN.HOLD_DAYS * 1.5) + 4;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = iso(new Date());

  try {
    // ── Pass 1: record ──
    const tracker = await calculateRotationTracker();
    const records: RotationScreenLogRecord[] = [];

    for (const rotation of tracker.activeRotations) {
      const screen = evaluateEntryScreen(rotation);
      const start = rotation.event.startDate;
      records.push({
        etf: rotation.event.etf,
        sector: rotation.event.sectorName,
        rotation_start: start,
        logged_at: today,
        // Honest about provenance: a rotation already weeks old when we first see it
        // is not a real-time observation, and mixing the two would flatter the result.
        is_forward: daysBetween(start, today) <= FORWARD_GRACE_DAYS,
        verdict: screen.verdict,
        qualifying: screen.qualifying,
        symbols: screen.picks.map((p) => p.symbol),
        gate_breadth: screen.gate.breadth,
        gate_cmf: screen.gate.cmf,
        gate_accel: screen.gate.accel,
        gate_pass: screen.gate.pass,
        etf_price_at_start: rotation.event.etfPriceAtStart,
      });
    }
    const inserted = await insertRotationScreenLogs(records);

    // ── Pass 2: score ──
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - SCORE_AFTER_CALENDAR_DAYS);
    const due = await loadUnscoredRotationScreenLogs(iso(cutoff));

    let scored = 0;
    const scoreDetail: { etf: string; start: string; basket: number | null; etf_fwd: number | null }[] = [];

    for (const row of due) {
      // A rotation the screen declined still gets closed out, with a null basket —
      // otherwise the unscored queue grows forever and every SKIP looks pending.
      const etfSeries = await fetchYahooChart(row.etf, "1y", "1d").catch(() => null);
      const etfFwd = forwardReturn(etfSeries, row.rotation_start);

      const outcomes: Record<string, number> = {};
      for (const sym of row.symbols) {
        const chart = await fetchYahooChart(sym, "1y", "1d").catch(() => null);
        const r = forwardReturn(chart, row.rotation_start);
        if (r !== null) outcomes[sym] = Math.round(r * 100) / 100;
      }

      const values = Object.values(outcomes);
      const ok = await scoreRotationScreenLog(row.id, {
        scored_at: today,
        etf_fwd_pct: etfFwd === null ? null : Math.round(etfFwd * 100) / 100,
        basket_fwd_pct: values.length
          ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
          : null,
        names_positive: values.length ? values.filter((v) => v > 0).length : null,
        names_scored: values.length,
        outcomes,
      });
      if (ok) {
        scored++;
        scoreDetail.push({
          etf: row.etf, start: row.rotation_start,
          basket: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
          etf_fwd: etfFwd,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      date: today,
      activeRotations: tracker.activeRotations.length,
      logged: inserted,
      alreadyLogged: records.length - inserted,
      due: due.length,
      scored,
      scoreDetail,
      holdDays: ENTRY_SCREEN.HOLD_DAYS,
    });
  } catch (err) {
    logError("api/rotation/screen-log", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "screen log failed" },
      { status: 500 },
    );
  }
}

/**
 * Return over ENTRY_SCREEN.HOLD_DAYS trading bars starting from the bar on or
 * before `startDate`. Null when the series does not reach that far — better an
 * unscored row than a return measured over the wrong window.
 */
function forwardReturn(
  chart: { closes: number[]; timestamps: number[] } | null,
  startDate: string,
): number | null {
  if (!chart?.timestamps?.length) return null;
  const startTs = new Date(startDate).getTime() / 1000;
  let i = -1;
  for (let k = chart.timestamps.length - 1; k >= 0; k--) {
    if (chart.timestamps[k] <= startTs + 86_400) { i = k; break; }
  }
  if (i < 0) return null;
  const exit = i + ENTRY_SCREEN.HOLD_DAYS;
  if (exit >= chart.closes.length) return null;
  const entry = chart.closes[i];
  if (!entry) return null;
  return (chart.closes[exit] / entry - 1) * 100;
}
