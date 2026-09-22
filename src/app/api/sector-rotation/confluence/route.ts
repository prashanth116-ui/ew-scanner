import { NextRequest, NextResponse } from "next/server";
import { calculateSectorRotation } from "@/lib/sector-rotation/sector-rotation";
import { calculateRotationTracker } from "@/lib/sector-rotation/rotation-tracker";
import { formatRotationConfluence, formatRotationTurns, buildTurnMembers } from "@/lib/sector-rotation/transitions";
import type { RotationSnapshot } from "@/lib/sector-rotation/transitions";
import {
  buildScannerHitMap,
  buildEnrichedMap,
  buildStockMap,
  buildCurrentRotations,
  computeConfluenceTickers,
} from "@/lib/sector-rotation/confluence";
import { sendTelegramMessage, getTelegramChatId } from "@/lib/ew-wave/telegram";
import { SECTOR_UNIVERSE } from "@/data/sector-universe";
import { focusSectorEtfs, FOCUS_LIST } from "@/data/focus-list";
import { logError } from "@/lib/error-logger";
import {
  loadPreRunDaily,
  loadInflectionDaily,
  loadTransitionDaily,
  loadInstitutionalDaily,
} from "@/lib/supabase/persistence";

/**
 * Rotation × Scanner Confluence cron — runs at 03:02 UTC (11:02 PM ET) Tue-Sat.
 * Fires AFTER all nightly scanners finish (~02:50 UTC), so scanner data is fresh.
 *
 * Sends Message 3 (previously part of the 6 PM sector alert) to the SECTOR channel
 * with tonight's scanner data instead of last night's stale data.
 *
 * State persistence for NEW detection uses a separate KV key from the sector alert.
 */

const KV_KEY = "sector-rotation:confluence-tickers";
const KV_TTL = 7 * 24 * 60 * 60; // 7 days

// Module-level cache for previous confluence tickers
let cachedPreviousTickers: string[] | null = null;

async function loadPreviousTickers(): Promise<string[]> {
  if (cachedPreviousTickers) return cachedPreviousTickers;
  if (!process.env.KV_REST_API_URL) return [];
  try {
    const { kv } = await import("@vercel/kv");
    const tickers = await kv.get<string[]>(KV_KEY);
    return tickers ?? [];
  } catch {
    return [];
  }
}

async function savePreviousTickers(tickers: string[]): Promise<void> {
  cachedPreviousTickers = tickers;
  if (!process.env.KV_REST_API_URL) return;
  try {
    const { kv } = await import("@vercel/kv");
    await kv.set(KV_KEY, tickers, { ex: KV_TTL });
  } catch {
    // Non-critical — module cache still works
  }
}

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Compute live sector rotation (for enriched stocks)
    const sectorResult = await calculateSectorRotation();

    // 2. Compute live rotation tracker (for active rotations + stocks)
    const rotationResult = await calculateRotationTracker();

    // 3. Load FRESH scanner data — at 03:02 UTC, tonight's scanners (02:00-02:50 UTC)
    //    have saved data for today's UTC date, reflecting today's market close
    const today = new Date().toISOString().slice(0, 10);
    const [prerunData, inflectionData, transitionData, institutionalData] = await Promise.all([
      loadPreRunDaily(today).catch(() => []),
      loadInflectionDaily(today).catch(() => []),
      loadTransitionDaily(today).catch(() => []),
      loadInstitutionalDaily(today).catch(() => []),
    ]);

    // 4. Build confluence data structures using shared helpers
    const scannerHitMap = buildScannerHitMap(prerunData, inflectionData, transitionData, institutionalData);
    const enrichedMap = buildEnrichedMap(sectorResult.enrichedStocks);
    const { stockMap } = buildStockMap(rotationResult.activeRotations, scannerHitMap, enrichedMap);
    const currentRotations: RotationSnapshot[] = buildCurrentRotations(rotationResult.activeRotations);

    // 5. Load previous confluence tickers for NEW detection
    const previousTickers = await loadPreviousTickers();

    // 6. Format and send Message 3
    let confluenceSent = false;
    let confluenceStockCount = 0;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = getTelegramChatId("SECTOR");

    // Tonight's new RS turns, scoped to baskets holding names on the focus list.
    //
    // Sent with the confluence message rather than as its own alert: the turn says WHERE
    // money started moving and the confluence below says WHICH of your names are in it,
    // and splitting them across two notifications means reading one without the other.
    // It leads because it is the earlier signal — the quadrant transition alert at 6 PM
    // fires 3-5 sessions after this does, which is the whole reason the section exists.
    //
    // Built even when the confluence body is null, because a night with no scanner-hit
    // rotations is exactly a night when a forming turn is the only thing worth saying.
    // Focus members come from stockQuotes, which the rotation pipeline already built —
    // naming them is what turns "Semiconductors turned" into something you can act on.
    const turnMembers = buildTurnMembers(SECTOR_UNIVERSE, FOCUS_LIST, sectorResult.stockQuotes);
    // ALL basket categories, not just `sectors`.
    //
    // `sectorResult.sectors` holds only the 14 GICS baskets; sub-sectors, cross-asset and
    // leadership baskets live in their own arrays. Passing `sectors` alone silently
    // dropped AIQ, ARKX and ITA — 3 of the 12 focus-scoped baskets — so they could never
    // fire, and it mis-ranked the standing-leaders footer by leaving AIQ (+8.7) out while
    // showing XBI (+7.0). The focus scope filters this list anyway, so including every
    // category costs nothing and is the only way the scope means what it says.
    const allScores = [
      ...sectorResult.sectors,
      ...(sectorResult.subSectorScores ?? []),
      ...(sectorResult.crossAssetScores ?? []),
      ...(sectorResult.leadershipBasketScores ?? []),
    ];
    // Lifecycle by ETF, so a turn line can say "Day 39 LATE" beside its reclaim date
    // instead of leaving the reader to reconcile it with the Monitor section below.
    const lifecycleByEtf = new Map(
      currentRotations.map((r) => [r.etf, { lifecycle: r.lifecycle, daysActive: r.daysActive }]),
    );
    const turnsMsg = formatRotationTurns(
      allScores.map((s) => ({
        sector: s.sector,
        etf: s.etf,
        quadrant: s.quadrant,
        mansfieldRS: s.mansfieldRS,
        lifecycle: lifecycleByEtf.get(s.etf)?.lifecycle,
        daysActive: lifecycleByEtf.get(s.etf)?.daysActive,
        rotationTurn: s.rotationTurn,
        focusMembers: turnMembers.get(s.etf),
      })),
      focusSectorEtfs(SECTOR_UNIVERSE),
      sectorResult.calculatedAt,
      new Set(scannerHitMap.keys()),
    );

    if (botToken && chatId) {
      // Both clocks on the same line: "Day N" counts from the signal-count start bar,
      // the annotation from the RS turn. They diverge in both directions — SMH read Day 1
      // with an RS turn four sessions old, XLE read Day 45 with an RS turn that session.
      const turnsByEtf = new Map(
        allScores.filter((s) => s.rotationTurn).map((s) => [s.etf, s.rotationTurn!]),
      );
      const confluenceBody = formatRotationConfluence(
        currentRotations, stockMap, sectorResult.calculatedAt, previousTickers, turnsByEtf,
      );
      const confluenceMsg = turnsMsg
        ? (confluenceBody ? `${turnsMsg}

────────────────────

${confluenceBody}` : turnsMsg)
        : confluenceBody;
      if (confluenceMsg) {
        // Count unique stocks with scanner hits (from the confluence body — the turns
        // section carries no stocks, so folding it in would inflate the reported count)
        const seenTickers = new Set<string>();
        for (const [sectorId, stocks] of stockMap) {
          if (!currentRotations.some((r) => r.sectorId === sectorId)) continue;
          let count = 0;
          for (const s of stocks) {
            if (s.scannerHits && s.scannerHits.length > 0 && count < 5) {
              seenTickers.add(s.symbol);
              count++;
            }
          }
        }
        confluenceStockCount = seenTickers.size;
        const result = await sendTelegramMessage(botToken, chatId, confluenceMsg);
        confluenceSent = result.ok;
        if (!result.ok) {
          logError("sector-rotation/confluence", new Error(result.error ?? "Telegram send failed"));
        }
      }
    }

    // 7. Persist current confluence tickers for next run's NEW detection
    const currentConfluenceTickers = computeConfluenceTickers(stockMap, currentRotations);
    await savePreviousTickers(currentConfluenceTickers);

    return NextResponse.json({
      confluenceSent,
      confluenceStockCount,
      turnsIncluded: turnsMsg != null,
      scannerDate: today,
      activeRotations: currentRotations.length,
      scannerCounts: {
        prerun: prerunData.length,
        inflection: inflectionData.length,
        transition: transitionData.length,
        institutional: institutionalData.length,
      },
    });
  } catch (err) {
    logError("sector-rotation/confluence", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Confluence cron failed" },
      { status: 500 },
    );
  }
}
