import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData, prefetchSectorETFs } from "@/lib/prerun/data";
import { autoScorePreRun, passesUniverseQualityGates } from "@/lib/prerun/scoring";
import { computeQFE, computeMarketEnvironment } from "@/lib/prerun/qfe-scoring";
import type { MarketEnvironment } from "@/lib/prerun/qfe-scoring";
import { SP500_MEMBERS, NDX100_MEMBERS, ADDITIONAL_MEMBERS } from "@/data/index-tiers";
import { getSectorForTicker } from "@/data/prerun-universe";

import { createAdminClient } from "@/lib/supabase/server";
import {
  upsertPreRunDaily,
  purgeOldPreRunDaily,
  clearPreRunDaily,
  loadPreRunDailyDates,
  loadPreRunDaily,
  loadPreRunDailyTickers,
  upsertQFEDaily,
  purgeOldQFEDaily,
  clearQFEDaily,
  loadQFEDaily,
} from "@/lib/supabase/persistence";
import type { PreRunDailyRecord, QFEDailyRecord } from "@/lib/supabase/persistence";
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
    sndk: pctFromAth >= 40 && shortFloat >= 15 && s.finalScore >= 18,
    early_mover: pctFromAth >= 25 && s.finalScore >= 14 && s.scoreM2 >= 1 && s.scoreL >= 1 && s.scoreF >= 1,
    pullback: pctFromAth <= 40 && s.finalScore >= 15 && [s.scoreM2 >= 1, s.scoreF >= 1, s.scoreL >= 1].filter(Boolean).length >= 2,
    leading: s.finalScore >= 15 && s.scoreM >= 1 && s.scoreJ >= 1 && (quadrant === "LEADING" || quadrant === "IMPROVING"),
    stealth: s.finalScore >= 11 && s.scoreM2 >= 1 && (d.obvDivergent === true || d.vpDivergenceBullish === true),
    early_plus: s.finalScore >= 10 && s.scoreM2 >= 1 && s.scoreN >= 1 && (d.obvDivergent === true || d.vpDivergenceBullish === true),
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

/** Build a QFE database record from scan data + QFE result. */
function buildQFERecord(
  result: PreRunResult,
  qfe: ReturnType<typeof computeQFE>,
  scanDate: string,
  marketEnv: MarketEnvironment,
): QFEDailyRecord {
  const d = result.data;
  return {
    scan_date: scanDate,
    ticker: d.ticker,
    company_name: d.companyName,
    sector: getSectorForTicker(d.ticker),
    price: d.currentPrice ?? 0,
    market_cap: d.marketCap,
    qfe_score: qfe.scores.composite,
    quality_score: qfe.scores.quality,
    leadership_score: qfe.scores.leadership,
    entry_score: qfe.scores.entry,
    market_env_score: qfe.scores.marketEnv,
    rating: qfe.rating,
    action: qfe.action,
    risk_level: qfe.riskLevel,
    extension_level: qfe.extensionLevel,
    rs_5d_spy: d.rs5dVsSPY,
    rs_10d_spy: d.rs10dVsSPY,
    rs_20d_spy: d.relativeStrength20d,
    rs_50d_spy: d.rs50dVsSPY,
    rs_5d_qqq: d.rs5dVsQQQ,
    rs_10d_qqq: d.rs10dVsQQQ,
    rs_20d_qqq: d.instRsVsQQQ,
    rs_50d_qqq: d.rs50dVsQQQ,
    rs_5d_sector: d.rs5dVsSector,
    rs_10d_sector: d.rs10dVsSector,
    rs_20d_sector: d.sectorReturn20d !== null && d.relativeStrength20d !== null ? d.relativeStrength20d : null,
    rs_50d_sector: d.rs50dVsSector,
    money_flow_persistence: d.moneyFlowPersistence,
    rvol_trajectory: d.rvolTrajectory,
    float_rotation: d.floatTurnover20d,
    weekly_reversal: d.weeklyReversalSignal === true,
    dist_from_ema10_atr: d.distFromEma10Atr,
    dist_from_ema20_atr: d.instDistFromEma20Atr,
    commentary: qfe.commentary,
    source_presets: qfe.sourcePresets,
    data_quality: d.dataQuality,
    market_env_detail: {
      spyTrendScore: marketEnv.spyTrendScore,
      qqqTrendScore: marketEnv.qqqTrendScore,
      sectorBreadthScore: marketEnv.sectorBreadthScore,
      distributionDayScore: marketEnv.distributionDayScore,
      spyDistFromHighScore: marketEnv.spyDistFromHighScore,
      regime: marketEnv.regime,
      spyAboveSma50: marketEnv.spyAboveSma50,
      spyAboveSma200: marketEnv.spyAboveSma200,
      spyDistributionDays: marketEnv.spyDistributionDays,
      leadingSectors: marketEnv.leadingSectors,
      improvingSectors: marketEnv.improvingSectors,
      computedAt: marketEnv.computedAt,
    },
  };
}

/** Load sector quadrant map from Supabase sector_snapshots. */
async function loadSectorQuadrants(): Promise<Record<string, string>> {
  const quadrants: Record<string, string> = {};
  try {
    const supabase = createAdminClient();
    if (!supabase) return quadrants;

    // Get the most recent snapshot date
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
    const TIME_LIMIT_MS = 240_000; // 240s — leave 60s for flush + purge + telegram

    // Build universe: SP500 + NDX100 + ADDITIONAL (deduplicated)
    const universe = [...new Set([...SP500_MEMBERS, ...NDX100_MEMBERS, ...ADDITIONAL_MEMBERS])];
    const today = new Date().toISOString().slice(0, 10);

    // Clear today's data if requested (for full re-scan)
    let cleared = 0;
    if (searchParams.get("clear") === "true") {
      const [prerunCleared, qfeCleared] = await Promise.all([
        clearPreRunDaily(today),
        clearQFEDaily(today),
      ]);
      cleared = prerunCleared;
      console.log(`[prerun-daily] cleared ${prerunCleared} prerun + ${qfeCleared} qfe rows for ${today}`);
    }

    // Resume mode: skip tickers already in DB for today
    let scanUniverse = universe;
    let skippedCount = 0;
    if (searchParams.get("resume") === "true" && searchParams.get("clear") !== "true") {
      const existing = await loadPreRunDailyTickers(today);
      const existingSet = new Set(existing);
      scanUniverse = universe.filter((t) => !existingSet.has(t));
      skippedCount = universe.length - scanUniverse.length;
      console.log(`[prerun-daily] resume mode: skipping ${skippedCount} already-scanned tickers, ${scanUniverse.length} remaining`);
    }

    // Pre-warm sector ETF cache + load sector quadrants
    const [, sectorQuadrants] = await Promise.all([
      prefetchSectorETFs(),
      loadSectorQuadrants(),
    ]);

    // Compute market environment ONCE (1 extra API call for SPY 1y)
    let marketEnv: MarketEnvironment;
    try {
      marketEnv = await computeMarketEnvironment(sectorQuadrants);
    } catch (err) {
      logError("api/prerun/cron/preset/marketEnv", err);
      // Fallback to neutral market
      marketEnv = {
        spyTrendScore: 15, qqqTrendScore: 8, sectorBreadthScore: 12,
        distributionDayScore: 10, spyDistFromHighScore: 8, totalScore: 53,
        spyAboveSma50: true, spyAboveSma200: true, spyDistributionDays: 3,
        leadingSectors: 3, improvingSectors: 3, regime: "Neutral",
        computedAt: new Date().toISOString(),
      };
    }

    const allRecords: PreRunDailyRecord[] = [];
    let pendingRecords: PreRunDailyRecord[] = [];
    const allQFERecords: QFEDailyRecord[] = [];
    let pendingQFERecords: QFEDailyRecord[] = [];
    let totalPersisted = 0;
    let totalQFEPersisted = 0;
    let fetchedCount = 0;
    let timedOut = false;

    for (let i = 0; i < scanUniverse.length; i += BATCH_SIZE) {
      // Time guard: break early to guarantee Telegram sends
      if (Date.now() - startTime > TIME_LIMIT_MS) {
        console.log(`[prerun-daily] time limit reached at ${fetchedCount}/${scanUniverse.length} tickers, proceeding to summary`);
        timedOut = true;
        break;
      }

      const batch = scanUniverse.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchPreRunData(ticker);
          if (!data) return null;
          if (!passesUniverseQualityGates(data, ticker)) return null;
          const sector = getSectorForTicker(ticker);
          const quadrant = sector ? sectorQuadrants[sector] ?? null : null;
          const result = autoScorePreRun(data, quadrant);

          // QFE scoring (pure arithmetic, <1ms)
          const flags = computePresetFlags(result, quadrant);
          const sourcePresets: string[] = [];
          if (flags.sndk) sourcePresets.push("SNDK");
          if (flags.early_mover) sourcePresets.push("Early Mover");
          if (flags.pullback) sourcePresets.push("Pullback");
          if (flags.leading) sourcePresets.push("Leading");
          if (flags.stealth) sourcePresets.push("Stealth");
          if (flags.early_plus) sourcePresets.push("Early+");

          const qfe = computeQFE(data, marketEnv, sourcePresets, quadrant);
          return { result, quadrant, qfe };
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          fetchedCount++;
          const { result, quadrant, qfe } = r.value;
          const record = resultToRecord(result, today, quadrant);
          if (record) {
            allRecords.push(record);
            pendingRecords.push(record);
          }
          // QFE: persist all tickers with C rating or better (composite >= 45)
          if (qfe.scores.composite >= 45) {
            const qfeRecord = buildQFERecord(result, qfe, today, marketEnv);
            allQFERecords.push(qfeRecord);
            pendingQFERecords.push(qfeRecord);
          }
        }
      }

      // Incremental persist (prerun + QFE in parallel)
      if (pendingRecords.length >= PERSIST_INTERVAL || pendingQFERecords.length >= PERSIST_INTERVAL) {
        const [n, nQFE] = await Promise.all([
          pendingRecords.length > 0
            ? upsertPreRunDaily(pendingRecords).catch((err) => { console.error("[prerun-daily] incremental persist error:", err); return 0; })
            : Promise.resolve(0),
          pendingQFERecords.length > 0
            ? upsertQFEDaily(pendingQFERecords).catch((err) => { console.error("[qfe-daily] incremental persist error:", err); return 0; })
            : Promise.resolve(0),
        ]);
        totalPersisted += n;
        totalQFEPersisted += nQFE;
        pendingRecords = [];
        pendingQFERecords = [];
      }

      if (i + BATCH_SIZE < scanUniverse.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    // Flush remaining (parallel)
    if (pendingRecords.length > 0 || pendingQFERecords.length > 0) {
      const [n, nQFE] = await Promise.all([
        pendingRecords.length > 0
          ? upsertPreRunDaily(pendingRecords).catch((err) => { console.error("[prerun-daily] flush persist error:", err); return 0; })
          : Promise.resolve(0),
        pendingQFERecords.length > 0
          ? upsertQFEDaily(pendingQFERecords).catch((err) => { console.error("[qfe-daily] flush persist error:", err); return 0; })
          : Promise.resolve(0),
      ]);
      totalPersisted += n;
      totalQFEPersisted += nQFE;
    }

    // Purge old data (parallel)
    const [purged] = await Promise.all([
      purgeOldPreRunDaily(14).catch(() => 0),
      purgeOldQFEDaily(14).catch(() => 0),
    ]);

    // Read full DB results for today (includes data from this + previous runs)
    let dbRecords: PreRunDailyRecord[] = allRecords;
    let dbQFERecords: QFEDailyRecord[] = allQFERecords;
    try {
      const [fullResults, fullQFE] = await Promise.all([
        loadPreRunDaily(today),
        loadQFEDaily(today),
      ]);
      if (fullResults.length > 0) {
        dbRecords = fullResults as PreRunDailyRecord[];
      }
      if (fullQFE.length > 0) {
        dbQFERecords = fullQFE as QFEDailyRecord[];
      }
    } catch {
      // Fall back to in-memory records
    }

    // Determine "new today" using full DB data
    let newTickers: string[] = [];
    try {
      const dates = await loadPreRunDailyDates(2);
      const yesterday = dates.find((d) => d !== today);
      if (yesterday) {
        const prevResults = await loadPreRunDaily(yesterday);
        const prevTickers = new Set(prevResults.map((r) => r.ticker));
        newTickers = dbRecords.map((r) => r.ticker).filter((t) => !prevTickers.has(t));
      } else {
        newTickers = dbRecords.map((r) => r.ticker);
      }
    } catch {
      // Non-critical
    }

    let telegramSent = false;

    return NextResponse.json({
      scannedCount: universe.length,
      fetchedCount,
      skippedCount,
      qualifyingCount: dbRecords.length,
      persistedCount: totalPersisted,
      clearedCount: cleared,
      purgedCount: purged,
      newTodayCount: newTickers.length,
      telegramSent,
      timedOut,
      elapsedMs: Date.now() - startTime,
      presetCounts: {
        sndk: dbRecords.filter((r) => r.is_sndk).length,
        early_mover: dbRecords.filter((r) => r.is_early_mover).length,
        pullback: dbRecords.filter((r) => r.is_pullback).length,
        leading: dbRecords.filter((r) => r.is_leading).length,
        stealth: dbRecords.filter((r) => r.is_stealth).length,
        early_plus: dbRecords.filter((r) => r.is_early_plus).length,
      },
      qfe: {
        totalRated: dbQFERecords.length,
        persistedCount: totalQFEPersisted,
        marketRegime: marketEnv.regime,
        marketEnvScore: marketEnv.totalScore,
        buyNowCount: dbQFERecords.filter((r) => r.action === "Buy Now").length,
        aPlusCount: dbQFERecords.filter((r) => r.rating === "A+").length,
        aCount: dbQFERecords.filter((r) => r.rating === "A").length,
      },
    });
  } catch (err) {
    logError("api/prerun/cron/preset", err);
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
