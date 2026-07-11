import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData, prefetchSectorETFs } from "@/lib/prerun/data";
import { autoScorePreRun, passesUniverseQualityGates } from "@/lib/prerun/scoring";
import { buildScanUniverse } from "@/data/index-tiers";
import { getSectorForTicker } from "@/data/prerun-universe";

import { createAdminClient } from "@/lib/supabase/server";
import {
  upsertPreRun4hDaily,
  purgeOldPreRun4hDaily,
  clearPreRun4hDaily,
  loadPreRun4hDailyTickers,
  loadAllScoredTickers,
} from "@/lib/supabase/persistence";
import type { PreRunDailyRecord } from "@/lib/supabase/persistence";
import type { PreRunResult } from "@/lib/prerun/types";

export const maxDuration = 300;

const BATCH_SIZE = 15;
const BATCH_DELAY = 500;
const PERSIST_INTERVAL = 50;

type PresetName = "sndk" | "early_mover" | "pullback" | "leading" | "stealth" | "early_plus";

/** Compute which presets a result qualifies for. */
function computePresetFlags(
  result: PreRunResult,
  quadrant: string | null,
): Record<PresetName, boolean> {
  const s = result.scores;
  const d = result.data;
  const pctFromAth = d.pctFromAth ?? 0;
  const shortFloat = d.shortFloat ?? 0;

  return {
    // SNDK: Squeeze recovery — deep discount + heavy shorts + technical readiness + volume confirmation
    // pctFromAth (stale 2-6d, weekly chart) | shortFloat (stale 14-35d, FINRA bi-monthly) | finalScore (~50% fresh EOD technicals)
    sndk: pctFromAth >= 40 && shortFloat >= 15 && s.finalScore >= 18 && s.scoreF >= 1,
    // Early Mover: Beaten-down + EMA timing + structure + volume (4h: tighter finalScore >= 16)
    // pctFromAth (stale 2-6d) | M2,L,F all fresh EOD
    early_mover: pctFromAth >= 25 && s.finalScore >= 16 && s.scoreM2 >= 1 && s.scoreL >= 1 && s.scoreF >= 1,
    // Pullback: Recovery from pullback — volume accumulation + structural higher lows (4h: tighter finalScore >= 18)
    // pctFromAth (stale 2-6d) | F (volume, fresh EOD) + L (higher lows, fresh EOD)
    // M2 intentionally NOT required — EMA timing is a late signal, wrong for early pullback recovery
    pullback: pctFromAth <= 40 && s.finalScore >= 18 && s.scoreF >= 1 && s.scoreL >= 1,
    // Leading: High score + momentum + RS + volume + LEADING sector quadrant only (4h: tighter finalScore >= 20)
    // quadrant from sector_snapshots (stale up to 24h) | M,J,F fresh EOD
    leading: s.finalScore >= 20 && s.scoreM >= 1 && s.scoreJ >= 1 && s.scoreF >= 1 && quadrant === "LEADING",
    // Stealth: Hidden accumulation — EMA timing + OBV/VP divergence (all fresh EOD, 4h: tighter finalScore >= 15)
    // Merged with former Early+ preset (Early+ was 100% redundant)
    stealth: s.finalScore >= 15 && s.scoreM2 >= 1 && (d.obvDivergent === true || d.vpDivergenceBullish === true),
    // Early+ deprecated — merged into Stealth. Flag kept for DB schema compatibility.
    early_plus: false,
  };
}

/** Convert a scored result to a database record. */
function resultToRecord(
  result: PreRunResult,
  scanDate: string,
  quadrant: string | null,
): PreRunDailyRecord | null {
  if (result.scores.finalScore <= 0) return null;

  const flags = computePresetFlags(result, quadrant);
  const anyPreset = Object.values(flags).some(Boolean);
  if (!anyPreset) return null;

  const s = result.scores;
  const d = result.data;

  return {
    scan_date: scanDate,
    ticker: d.ticker,
    company_name: d.companyName,
    sector: getSectorForTicker(d.ticker),
    price: d.currentPrice ?? 0,
    market_cap: d.marketCap,
    pct_from_ath: d.pctFromAth,
    short_float: d.shortFloat,
    final_score: s.finalScore,
    total_score: s.totalScore,
    score_a: s.scoreA,
    score_b: s.scoreB,
    score_c: s.scoreC,
    score_d: s.scoreD,
    score_e: s.scoreE,
    score_f: s.scoreF,
    score_g: s.scoreG,
    score_h: s.scoreH,
    score_i: s.scoreI,
    score_j: s.scoreJ,
    score_k: s.scoreK,
    score_l: s.scoreL,
    score_m: s.scoreM,
    score_m2: s.scoreM2,
    score_n: s.scoreN,
    score_o: s.scoreO,
    score_p: s.scoreP,
    score_q: s.scoreQ,
    sector_modifier: s.sectorModifier,
    sector_quadrant_modifier: s.sectorQuadrant,
    gate1: result.gates.gate1,
    gate2: result.gates.gate2,
    gate3: result.gates.gate3,
    verdict: result.verdict,
    obv_divergent: d.obvDivergent === true,
    vp_divergence_bullish: d.vpDivergenceBullish === true,
    higher_lows_count: d.higherLowsCount,
    rrg_quadrant: quadrant,
    is_sndk: flags.sndk,
    is_early_mover: flags.early_mover,
    is_pullback: flags.pullback,
    is_leading: flags.leading,
    is_stealth: flags.stealth,
    is_early_plus: flags.early_plus,
  };
}

/** Load sector quadrant map from Supabase sector_snapshots. */
async function loadSectorQuadrants(): Promise<Record<string, string>> {
  const quadrants: Record<string, string> = {};
  try {
    const supabase = createAdminClient();
    if (!supabase) return quadrants;

    const { data: dates } = await supabase
      .from("sector_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1);

    if (!dates?.length) return quadrants;

    const { data } = await supabase
      .from("sector_snapshots")
      .select("sector, quadrant")
      .eq("snapshot_date", dates[0].snapshot_date);

    for (const row of data ?? []) {
      quadrants[row.sector] = row.quadrant;
    }
  } catch {
    // Non-critical
  }
  return quadrants;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const startTime = Date.now();
    const TIME_LIMIT_MS = 240_000;

    // Build universe: SP500 + NDX100 + ADDITIONAL (deduplicated)
    const universe = buildScanUniverse();
    const today = new Date().toISOString().slice(0, 10);

    // Clear today's data if requested
    let cleared = 0;
    if (searchParams.get("clear") === "true") {
      cleared = await clearPreRun4hDaily(today);
      console.log(`[prerun-4h] cleared ${cleared} rows for ${today}`);
    }

    // Resume mode: skip tickers already in DB for today
    let scanUniverse = universe;
    let skippedCount = 0;
    if (searchParams.get("resume") === "true" && searchParams.get("clear") !== "true") {
      const existing = await loadPreRun4hDailyTickers(today);
      const existingSet = new Set(existing);
      scanUniverse = universe.filter((t) => !existingSet.has(t));
      skippedCount = universe.length - scanUniverse.length;
      console.log(`[prerun-4h] resume mode: skipping ${skippedCount} already-scanned tickers, ${scanUniverse.length} remaining`);
    }

    // Pre-warm sector ETF cache + load sector quadrants + load historically-scored tickers
    const [, sectorQuadrants, scoredTickers] = await Promise.all([
      prefetchSectorETFs(),
      loadSectorQuadrants(),
      loadAllScoredTickers(),
    ]);
    const hasHistory = scoredTickers.size > 50;

    const allRecords: PreRunDailyRecord[] = [];
    let pendingRecords: PreRunDailyRecord[] = [];
    let totalPersisted = 0;
    let fetchedCount = 0;
    let timedOut = false;

    for (let i = 0; i < scanUniverse.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > TIME_LIMIT_MS) {
        console.log(`[prerun-4h] time limit reached at ${fetchedCount}/${scanUniverse.length} tickers`);
        timedOut = true;
        break;
      }

      const batch = scanUniverse.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          // Persistent non-scorer gate: skip tickers never seen in any scanner
          if (hasHistory && !scoredTickers.has(ticker)) return null;
          // scanner4h=true: uses 4h-aggregated chart with barMultiplier=6
          const data = await fetchPreRunData(ticker, "4h", undefined, true);
          if (!data) return null;
          if (!passesUniverseQualityGates(data, ticker)) return null;
          const sector = getSectorForTicker(ticker);
          const quadrant = sector ? sectorQuadrants[sector] ?? null : null;
          const result = autoScorePreRun(data, quadrant, 10);
          return { result, quadrant };
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          fetchedCount++;
          const { result, quadrant } = r.value;
          const record = resultToRecord(result, today, quadrant);
          if (record) {
            allRecords.push(record);
            pendingRecords.push(record);
          }
        }
      }

      // Incremental persist
      if (pendingRecords.length >= PERSIST_INTERVAL) {
        const n = await upsertPreRun4hDaily(pendingRecords).catch((err) => {
          console.error("[prerun-4h] incremental persist error:", err);
          return 0;
        });
        totalPersisted += n;
        pendingRecords = [];
      }

      if (i + BATCH_SIZE < scanUniverse.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    // Flush remaining
    if (pendingRecords.length > 0) {
      const n = await upsertPreRun4hDaily(pendingRecords).catch((err) => {
        console.error("[prerun-4h] flush persist error:", err);
        return 0;
      });
      totalPersisted += n;
    }

    // Purge old data
    const purged = await purgeOldPreRun4hDaily(14).catch(() => 0);

    return NextResponse.json({
      scanner: "prerun-4h",
      scannedCount: universe.length,
      fetchedCount,
      skippedCount,
      qualifyingCount: allRecords.length,
      persistedCount: totalPersisted,
      clearedCount: cleared,
      purgedCount: purged,
      timedOut,
      elapsedMs: Date.now() - startTime,
      presetCounts: {
        sndk: allRecords.filter((r) => r.is_sndk).length,
        early_mover: allRecords.filter((r) => r.is_early_mover).length,
        pullback: allRecords.filter((r) => r.is_pullback).length,
        leading: allRecords.filter((r) => r.is_leading).length,
        stealth: allRecords.filter((r) => r.is_stealth).length,
        early_plus: allRecords.filter((r) => r.is_early_plus).length,
      },
    });
  } catch (err) {
    logError("api/prerun/cron/preset-4h", err);
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
