import { NextRequest, NextResponse } from "next/server";
import { calculateSectorRotation } from "@/lib/sector-rotation/sector-rotation";
import { calculateRotationTracker } from "@/lib/sector-rotation/rotation-tracker";
import { formatRotationConfluence } from "@/lib/sector-rotation/transitions";
import type { RotationSnapshot } from "@/lib/sector-rotation/transitions";
import {
  buildScannerHitMap,
  buildEnrichedMap,
  buildStockMap,
  buildCurrentRotations,
  computeConfluenceTickers,
} from "@/lib/sector-rotation/confluence";
import { sendTelegramMessage, getTelegramChatId } from "@/lib/ew-wave/telegram";
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

    if (botToken && chatId) {
      const confluenceMsg = formatRotationConfluence(
        currentRotations, stockMap, sectorResult.calculatedAt, previousTickers,
      );
      if (confluenceMsg) {
        // Count unique stocks with scanner hits
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
