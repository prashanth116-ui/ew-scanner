import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData, prefetchSectorETFs } from "@/lib/prerun/data";
import { scoreInstitutionalAcceleration } from "@/lib/prerun/institutional-scoring";
import { SP500_MEMBERS, NDX100_MEMBERS } from "@/data/index-tiers";
import { getSectorForTicker } from "@/data/prerun-universe";
import { sendTelegramMessage } from "@/lib/ew-telegram";
import {
  upsertInstitutionalDaily,
  purgeOldInstitutionalDaily,
  loadInstitutionalDailyDates,
  loadInstitutionalDaily,
} from "@/lib/supabase/persistence";
import type { InstitutionalDailyRecord } from "@/lib/supabase/persistence";
import type { InstitutionalResult } from "@/lib/prerun/types";

export const maxDuration = 300;

const BATCH_SIZE = 10;
const BATCH_DELAY = 1100;
const PERSIST_INTERVAL = 50;

function resultToRecord(r: InstitutionalResult, scanDate: string): InstitutionalDailyRecord {
  return {
    scan_date: scanDate,
    ticker: r.data.ticker,
    company_name: r.data.companyName,
    sector: getSectorForTicker(r.data.ticker),
    price: r.data.currentPrice ?? 0,
    composite_score: r.scores.compositeScore,
    institutional_score: r.scores.institutionalScore,
    execution_score: r.scores.executionScore,
    risk_score: r.scores.riskScore,
    discipline_score: r.scores.disciplineScore,
    classification: r.classification,
    entry_quality: r.entryQuality,
    best_trigger: r.bestTrigger,
    tier: r.tier,
    avoid_reason: r.avoidReason,
    commentary_summary: r.commentary.summary,
    rs_accel_spy: r.data.instRsAccelVsSPY,
    rs_accel_qqq: r.data.instRsAccelVsQQQ,
    gap_pct: r.data.instGapPct,
    dist_from_ema20_atr: r.data.instDistFromEma20Atr,
  };
}

function formatTelegramSummary(
  scannedCount: number,
  records: InstitutionalDailyRecord[],
  newTickers: string[],
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push("<b>Institutional Daily Scan</b>");
  lines.push(`${date} | ${scannedCount} scanned | ${records.length} qualifying`);
  lines.push("");

  const tierCounts = {
    SHORTLIST: records.filter((r) => r.tier === "SHORTLIST").length,
    WATCHLIST: records.filter((r) => r.tier === "WATCHLIST").length,
    SPECULATIVE: records.filter((r) => r.tier === "SPECULATIVE").length,
  };

  for (const [tier, count] of Object.entries(tierCounts)) {
    if (count > 0) {
      lines.push(`<b>${tier}:</b> ${count}`);
    }
  }
  lines.push("");

  const top = [...records].sort((a, b) => b.composite_score - a.composite_score).slice(0, 10);
  if (top.length > 0) {
    lines.push("<b>Top 10:</b>");
    for (const r of top) {
      lines.push(`* ${r.ticker} ${r.composite_score} | ${r.classification.replace(/_/g, " ")} | ${r.tier ?? "-"}`);
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
    const universe = [...new Set([...SP500_MEMBERS, ...NDX100_MEMBERS])];
    const today = new Date().toISOString().slice(0, 10);

    await prefetchSectorETFs();

    const qualifying: InstitutionalDailyRecord[] = [];
    let pendingRecords: InstitutionalDailyRecord[] = [];
    let totalPersisted = 0;
    let fetchedCount = 0;

    for (let i = 0; i < universe.length; i += BATCH_SIZE) {
      const batch = universe.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchPreRunData(ticker);
          if (!data) return null;
          return scoreInstitutionalAcceleration(data);
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          fetchedCount++;
          const result = r.value;

          // Skip if gates fail or classification starts with AVOID_
          if (!result.gates.allPass || result.classification.startsWith("AVOID_")) continue;

          const record = resultToRecord(result, today);
          qualifying.push(record);
          pendingRecords.push(record);
        }
      }

      // Incremental persist
      if (pendingRecords.length >= PERSIST_INTERVAL) {
        const n = await upsertInstitutionalDaily(pendingRecords).catch((err) => {
          console.error("[institutional-daily] incremental persist error:", err);
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
      const n = await upsertInstitutionalDaily(pendingRecords).catch((err) => {
        console.error("[institutional-daily] flush persist error:", err);
        return 0;
      });
      totalPersisted += n;
    }

    // Purge old data
    const purged = await purgeOldInstitutionalDaily(14).catch(() => 0);

    // Determine "new today"
    let newTickers: string[] = [];
    try {
      const dates = await loadInstitutionalDailyDates(2);
      const yesterday = dates.find((d) => d !== today);
      if (yesterday) {
        const prevResults = await loadInstitutionalDaily(yesterday);
        const prevTickers = new Set(prevResults.map((r) => r.ticker));
        newTickers = qualifying.map((r) => r.ticker).filter((t) => !prevTickers.has(t));
      } else {
        newTickers = qualifying.map((r) => r.ticker);
      }
    } catch {
      // Non-critical
    }

    // Send Telegram summary
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    let telegramSent = false;
    if (botToken && chatId) {
      const message = formatTelegramSummary(universe.length, qualifying, newTickers);
      const tgResult = await sendTelegramMessage(botToken, chatId, message);
      telegramSent = tgResult.ok;
      if (!tgResult.ok) {
        logError("api/institutional/cron/daily/telegram", new Error(tgResult.error ?? "Telegram send failed"));
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
      tierCounts: {
        shortlist: qualifying.filter((r) => r.tier === "SHORTLIST").length,
        watchlist: qualifying.filter((r) => r.tier === "WATCHLIST").length,
        speculative: qualifying.filter((r) => r.tier === "SPECULATIVE").length,
      },
    });
  } catch (err) {
    logError("api/institutional/cron/daily", err);
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
