import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { buildScanUniverse } from "@/data/index-tiers";
import { skipAsNonScorer } from "@/lib/prerun/scan-gate";
import { getSectorForTicker } from "@/data/prerun-universe";
import { fetchBatchQuotes } from "@/lib/prerun/data";
import type { BatchQuote } from "@/lib/prerun/data";
import { fetchICTData } from "@/lib/ict/data";
import { runMultiTimeframe } from "@/lib/ict/multi-tf";
import { CRON } from "@/lib/ict/config";
import { ICT_STATE_LABELS } from "@/lib/ict/types";
import type { ICTDailyRecord, ICTMultiTFResult } from "@/lib/ict/types";
import type { Timeframe } from "@/lib/ict/config";

import {
  upsertICTDaily,
  purgeOldICTDaily,
  clearICTDaily,
  loadAllScoredTickers,
} from "@/lib/supabase/persistence";

export const maxDuration = 300; // 5 minutes

function resultToRecord(r: ICTMultiTFResult, scanDate: string, companyName: string): ICTDailyRecord {
  const tfState = (tf: Timeframe) => {
    const found = r.timeframes.find((t) => t.timeframe === tf);
    return found ? ICT_STATE_LABELS[found.setup.currentState] : null;
  };
  const tfScore = (tf: Timeframe) => {
    const found = r.timeframes.find((t) => t.timeframe === tf);
    return found ? found.score.total : null;
  };

  return {
    scan_date: scanDate,
    ticker: r.ticker,
    company_name: companyName,
    sector: getSectorForTicker(r.ticker),
    price: r.price,
    best_state: ICT_STATE_LABELS[r.bestState],
    best_state_order: r.bestState,
    best_timeframe: r.bestTimeframe,
    best_score: r.bestScore,
    confluence_score: r.confluenceScore,
    armed_timeframes: r.armedTimeframes,
    bsl_target: r.bslTarget,
    protected_low: r.protectedLow,
    fvg_upper: r.fvgUpper,
    fvg_lower: r.fvgLower,
    distance_to_bsl_pct: r.distanceToBslPct,
    risk_reward: r.riskReward,
    htf_bias: r.htfBias,
    range_retracement: r.rangeRetracement,
    in_discount: r.inDiscount,
    in_ote: r.inOTE,
    state_bars_ago: r.stateBarsAgo,
    is_tradeable: r.isTradeable,
    prior_invalidation_state: r.priorInvalidationState,
    prior_invalidation_bars_ago: r.priorInvalidationBarsAgo,
    prior_invalidation_reason: r.priorInvalidationReason,
    is_chasing: r.isChasing,
    is_late_entry: r.isLateEntry,
    state_1h: tfState("1h"),
    state_4h: tfState("4h"),
    state_1d: tfState("1d"),
    state_1wk: tfState("1wk"),
    score_1h: tfScore("1h"),
    score_4h: tfScore("4h"),
    score_1d: tfScore("1d"),
    score_1wk: tfScore("1wk"),
    state_score: r.bestScoreDetail.components.stateScore,
    displacement_quality: r.bestScoreDetail.components.displacementQuality,
    fvg_quality: r.bestScoreDetail.components.fvgQuality,
    retracement_depth: r.bestScoreDetail.components.retracementDepth,
    entry_quality: r.bestScoreDetail.components.entryQuality,
    bsl_quality: r.bestScoreDetail.components.bslQuality,
    compression_quality: r.bestScoreDetail.components.compressionQuality,
    structure_coherence: r.bestScoreDetail.components.structureCoherence,
    invalidation_distance: r.bestScoreDetail.components.invalidationDistance,
    recency_score: r.bestScoreDetail.components.recency,
    bullish_evidence: r.bullishEvidence,
    caution_evidence: r.cautionEvidence,
  };
}

export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret
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
    const searchParams = request.nextUrl.searchParams;

    // Build universe
    const universe = buildScanUniverse();
    const today = new Date().toISOString().slice(0, 10);

    // Clear today's data if requested
    let cleared = 0;
    if (searchParams.get("clear") === "true") {
      cleared = await clearICTDaily(today);
    }

    // Load historically-scored tickers for non-scorer gate
    const scoredTickers = await loadAllScoredTickers();
    const hasHistory = scoredTickers.size > 50;

    // One batched quote sweep up front. Supplies the company names — which were
    // previously persisted as "" on every row, leaving the page's name search
    // permanently matching nothing — and pre-filters sub-$10 names so they never
    // cost three chart calls each.
    const quotes: Map<string, BatchQuote> = await fetchBatchQuotes(universe).catch(
      () => new Map<string, BatchQuote>(),
    );
    let priceGated = 0;

    const qualifying: ICTMultiTFResult[] = [];
    let pendingRecords: ICTDailyRecord[] = [];
    let totalPersisted = 0;
    let fetchedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < universe.length; i += CRON.BATCH_SIZE) {
      // Time guard
      if (Date.now() - startTime > CRON.TIME_GUARD_MS) break;

      const batch = universe.slice(i, i + CRON.BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          // Persistent non-scorer gate
          if (skipAsNonScorer(ticker, hasHistory, scoredTickers)) return null;

          // Cheap price gate before spending chart calls
          const quote = quotes.get(ticker);
          if (quote && quote.price > 0 && quote.price < CRON.MIN_PRICE) {
            priceGated++;
            return null;
          }

          // Fetch all timeframes
          const data = await fetchICTData(ticker);
          if (!data.currentPrice || data.currentPrice < CRON.MIN_PRICE) return null;

          fetchedCount++;

          // Run multi-TF engine
          const result = runMultiTimeframe(ticker, data);
          if (!result) return null;

          return result;
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          const result = r.value;

          // Persistence filter: state order >= 3 AND score >= 15
          if (result.bestState < CRON.MIN_STATE_ORDER || result.bestScore < CRON.MIN_SCORE) {
            skippedCount++;
            continue;
          }

          qualifying.push(result);
          pendingRecords.push(
            resultToRecord(result, today, quotes.get(result.ticker)?.name ?? ""),
          );
        }
      }

      // Incremental persist
      if (pendingRecords.length >= CRON.PERSIST_INTERVAL) {
        const n = await upsertICTDaily(pendingRecords).catch((err) => {
          console.error("[ict-daily] incremental persist error:", err);
          return 0;
        });
        totalPersisted += n;
        pendingRecords = [];
      }

      if (i + CRON.BATCH_SIZE < universe.length) {
        await new Promise((r) => setTimeout(r, CRON.BATCH_DELAY));
      }
    }

    // Flush remaining
    if (pendingRecords.length > 0) {
      const n = await upsertICTDaily(pendingRecords).catch((err) => {
        console.error("[ict-daily] flush persist error:", err);
        return 0;
      });
      totalPersisted += n;
    }

    // Purge old data
    const purged = await purgeOldICTDaily(CRON.RETENTION_DAYS).catch(() => 0);

    // State distribution
    const stateCounts: Record<string, number> = {};
    for (const r of qualifying) {
      const label = ICT_STATE_LABELS[r.bestState];
      stateCounts[label] = (stateCounts[label] ?? 0) + 1;
    }

    // HTF bias distribution
    const biasCounts: Record<string, number> = {};
    for (const r of qualifying) {
      biasCounts[r.htfBias] = (biasCounts[r.htfBias] ?? 0) + 1;
    }

    const armedCount = qualifying.filter((r) => r.armedTimeframes.length > 0).length;
    const tradeableCount = qualifying.filter((r) => r.isTradeable).length;

    return NextResponse.json({
      success: true,
      scanDate: today,
      scannedCount: universe.length,
      fetchedCount,
      priceGated,
      qualifyingCount: qualifying.length,
      skippedCount,
      persistedCount: totalPersisted,
      clearedCount: cleared,
      purgedCount: purged,
      armedCount,
      tradeableCount,
      stateCounts,
      biasCounts,
      elapsedMs: Date.now() - startTime,
    });
  } catch (err) {
    logError("api/ict/cron/daily", err);
    const message = err instanceof Error ? err.message : "ICT cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
