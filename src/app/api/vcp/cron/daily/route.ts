import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData, prefetchSectorETFs } from "@/lib/prerun/data";
import { scoreVCP } from "@/lib/prerun/vcp-scoring";
import { SP500_MEMBERS, NDX100_MEMBERS } from "@/data/index-tiers";
import { getSectorForTicker } from "@/data/prerun-universe";
import { sendTelegramMessage } from "@/lib/ew-wave/telegram";
import {
  upsertVCPDaily,
  purgeOldVCPDaily,
  loadVCPDailyDates,
  loadVCPDaily,
} from "@/lib/supabase/persistence";
import type { VCPDailyRecord } from "@/lib/supabase/persistence";
import type { VCPResult } from "@/lib/prerun/types";

export const maxDuration = 300;

const BATCH_SIZE = 10;
const BATCH_DELAY = 1100;
const PERSIST_INTERVAL = 50;

function resultToRecord(r: VCPResult, scanDate: string): VCPDailyRecord {
  return {
    scan_date: scanDate,
    ticker: r.data.ticker,
    company_name: r.data.companyName,
    sector: getSectorForTicker(r.data.ticker),
    price: r.data.currentPrice ?? 0,
    total_score: r.scores.totalScore,
    trend_score: r.scores.trendScore,
    volume_score: r.scores.volumeScore,
    compression_score: r.scores.compressionScore,
    rel_strength_score: r.scores.relStrengthScore,
    risk_quality_score: r.scores.riskQualityScore,
    phase: r.phase,
    pivot_high: r.data.vcpPivotHigh,
    atr_pct: r.data.vcpAtrPct,
    dist_from_sma50_pct: r.data.vcpDistFromSma50Pct,
    dry_volume_days: r.data.vcpDryVolumeDays,
    tight_closes: r.data.vcpTightCloses,
    inside_bar_count: r.data.vcpInsideBarCount,
    entry: r.riskCalc.entry,
    stop: r.riskCalc.stop,
    target_2r: r.riskCalc.target2R,
    target_3r: r.riskCalc.target3R,
    sma10_exit: r.riskCalc.sma10Exit,
  };
}

function formatTelegramSummary(
  scannedCount: number,
  records: VCPDailyRecord[],
  newTickers: string[],
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push("<b>VCP Daily Scan</b>");
  lines.push(`${date} | ${scannedCount} scanned | ${records.length} qualifying`);
  lines.push("");

  const phaseCounts = {
    FOCUS_LIST: records.filter((r) => r.phase === "FOCUS_LIST").length,
    WATCHLIST_CANDIDATE: records.filter((r) => r.phase === "WATCHLIST_CANDIDATE").length,
    EARLY_SETUP: records.filter((r) => r.phase === "EARLY_SETUP").length,
  };

  for (const [phase, count] of Object.entries(phaseCounts)) {
    if (count > 0) {
      lines.push(`<b>${phase.replace(/_/g, " ")}:</b> ${count}`);
    }
  }
  lines.push("");

  const top = [...records].sort((a, b) => b.total_score - a.total_score).slice(0, 10);
  if (top.length > 0) {
    lines.push("<b>Top 10:</b>");
    for (const r of top) {
      lines.push(`* ${r.ticker} ${r.total_score} | ${r.phase.replace(/_/g, " ")}`);
    }
    lines.push("");
  }

  if (newTickers.length > 0) {
    lines.push(
      `<b>New today:</b> ${newTickers.slice(0, 10).join(", ")}${newTickers.length > 10 ? ` (+${newTickers.length - 10} more)` : ""}`
    );
  }

  return lines.join("\n");
}

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
    const startTime = Date.now();

    const universe = [...new Set([...SP500_MEMBERS, ...NDX100_MEMBERS])];
    const today = new Date().toISOString().slice(0, 10);

    await prefetchSectorETFs();

    const qualifying: VCPDailyRecord[] = [];
    let pendingRecords: VCPDailyRecord[] = [];
    let totalPersisted = 0;
    let fetchedCount = 0;

    for (let i = 0; i < universe.length; i += BATCH_SIZE) {
      const batch = universe.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchPreRunData(ticker);
          if (!data) return null;
          return scoreVCP(data);
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          fetchedCount++;
          const result = r.value;

          // Skip if gates fail or phase is IGNORE
          if (!result.gates.allPass || result.phase === "IGNORE") continue;

          const record = resultToRecord(result, today);
          qualifying.push(record);
          pendingRecords.push(record);
        }
      }

      // Incremental persist
      if (pendingRecords.length >= PERSIST_INTERVAL) {
        const n = await upsertVCPDaily(pendingRecords).catch((err) => {
          console.error("[vcp-daily] incremental persist error:", err);
          return 0;
        });
        totalPersisted += n;
        pendingRecords = [];
      }

      if (i + BATCH_SIZE < universe.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    // Flush remaining
    if (pendingRecords.length > 0) {
      const n = await upsertVCPDaily(pendingRecords).catch((err) => {
        console.error("[vcp-daily] flush persist error:", err);
        return 0;
      });
      totalPersisted += n;
    }

    // Purge old data
    const purged = await purgeOldVCPDaily(14).catch(() => 0);

    // Determine "new today"
    let newTickers: string[] = [];
    try {
      const dates = await loadVCPDailyDates(2);
      const yesterday = dates.find((d) => d !== today);
      if (yesterday) {
        const prevResults = await loadVCPDaily(yesterday);
        const prevTickers = new Set(prevResults.map((r) => r.ticker));
        newTickers = qualifying.map((r) => r.ticker).filter((t) => !prevTickers.has(t));
      } else {
        newTickers = qualifying.map((r) => r.ticker);
      }
    } catch {
      // Non-critical
    }

    // Send Telegram summary (with time guard to avoid Vercel timeout)
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    let telegramSent = false;
    const elapsedMs = Date.now() - startTime;
    const timedOut = elapsedMs > 240_000;
    if (botToken && chatId && !timedOut) {
      const message = formatTelegramSummary(universe.length, qualifying, newTickers);
      const tgResult = await sendTelegramMessage(botToken, chatId, message);
      telegramSent = tgResult.ok;
      if (!tgResult.ok) {
        logError("api/vcp/cron/daily/telegram", new Error(tgResult.error ?? "Telegram send failed"));
      }
    }

    return NextResponse.json({
      scannedCount: universe.length,
      fetchedCount,
      qualifyingCount: qualifying.length,
      persistedCount: totalPersisted,
      purgedCount: purged,
      newTodayCount: newTickers.length,
      telegramSent,
      timedOut,
      elapsedMs: Date.now() - startTime,
      phaseCounts: {
        focus_list: qualifying.filter((r) => r.phase === "FOCUS_LIST").length,
        watchlist_candidate: qualifying.filter((r) => r.phase === "WATCHLIST_CANDIDATE").length,
        early_setup: qualifying.filter((r) => r.phase === "EARLY_SETUP").length,
      },
    });
  } catch (err) {
    logError("api/vcp/cron/daily", err);
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
