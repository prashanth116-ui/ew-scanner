import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData, prefetchSectorETFs } from "@/lib/prerun/data";
import { scoreInflection } from "@/lib/prerun/inflection-scoring";
import { SP500_MEMBERS, NDX100_MEMBERS } from "@/data/index-tiers";
import { getSectorForTicker } from "@/data/prerun-universe";
import { sendTelegramMessage } from "@/lib/ew-wave/telegram";
import {
  upsertInflectionDaily,
  purgeOldInflectionDaily,
} from "@/lib/supabase/persistence";
import type { InflectionDailyRecord } from "@/lib/supabase/persistence";
import type { InflectionResult } from "@/lib/prerun/types";

export const maxDuration = 300; // 5 minutes

const BATCH_SIZE = 10;
const BATCH_DELAY = 1100; // Respect Finnhub 60/min rate limit
const PERSIST_INTERVAL = 50;

function formatTelegramSummary(
  scannedCount: number,
  results: InflectionResult[],
  newTickers: string[],
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push("<b>Inflection Daily Scan</b>");
  lines.push(`${date} | ${scannedCount} scanned | ${results.length} qualifying`);
  lines.push("");

  const starters = results.filter(
    (r) => r.tradeRead === "STARTER_POSITION_CANDIDATE"
  );
  const addOns = results.filter(
    (r) => r.tradeRead === "ADD_ON_CONFIRMATION"
  );
  const watchers = results.filter((r) => r.tradeRead === "WATCH");

  if (starters.length > 0) {
    lines.push(`<b>STARTER (${starters.length}):</b>`);
    for (const r of starters.slice(0, 15)) {
      const s = r.scores;
      lines.push(
        `* ${r.data.ticker} ${s.overallScore} | ${r.stage} | SE:${s.sellerExhaustion} BE:${s.buyerEmergence} RS:${s.relativeStrength}`
      );
    }
    if (starters.length > 15) {
      lines.push(`... and ${starters.length - 15} more`);
    }
    lines.push("");
  }

  if (addOns.length > 0) {
    lines.push(`<b>ADD_ON (${addOns.length}):</b>`);
    for (const r of addOns.slice(0, 10)) {
      lines.push(`${r.data.ticker} ${r.scores.overallScore} | ${r.stage}`);
    }
    if (addOns.length > 10) {
      lines.push(`... and ${addOns.length - 10} more`);
    }
    lines.push("");
  }

  if (watchers.length > 0) {
    lines.push(`<b>WATCH (${watchers.length}):</b>`);
    for (const r of watchers.slice(0, 5)) {
      lines.push(`${r.data.ticker} ${r.scores.overallScore} | ${r.stage}`);
    }
    if (watchers.length > 5) {
      lines.push(`... and ${watchers.length - 5} more`);
    }
    lines.push("");
  }

  if (results.length === 0) {
    lines.push("No qualifying candidates today.");
  }

  // New today summary
  if (newTickers.length > 0) {
    const newStarters = newTickers.filter((t) =>
      starters.some((r) => r.data.ticker === t)
    );
    lines.push(
      `<b>New today:</b> ${newTickers.slice(0, 10).join(", ")}${newTickers.length > 10 ? ` (+${newTickers.length - 10} more)` : ""}`
    );
    if (newStarters.length > 0) {
      lines.push(`(+${newStarters.length} new STARTER)`);
    }
  }

  return lines.join("\n");
}

function resultToRecord(r: InflectionResult, scanDate: string): InflectionDailyRecord {
  return {
    scan_date: scanDate,
    ticker: r.data.ticker,
    company_name: r.data.companyName,
    sector: getSectorForTicker(r.data.ticker),
    price: r.data.currentPrice ?? 0,
    overall_score: r.scores.overallScore,
    se_score: r.scores.sellerExhaustion,
    vc_score: r.scores.volatilityCompression,
    be_score: r.scores.buyerEmergence,
    rs_score: r.scores.relativeStrength,
    la_score: r.scores.liquidityAuction,
    ip_score: r.scores.institutionalParticipation,
    stage: r.stage,
    trade_read: r.tradeRead,
    extension_risk: r.extensionRisk,
    is_primary: r.isPrimarySignal,
    is_stronger: r.isStrongerSignal,
    bullish_evidence: r.bullishEvidence,
    caution_evidence: r.cautionEvidence,
    invalidation: r.invalidationLevel,
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

    // Build universe: SP500 union NDX100 (deduplicated)
    const universe = [...new Set([...SP500_MEMBERS, ...NDX100_MEMBERS])];
    const today = new Date().toISOString().slice(0, 10);

    // Pre-warm sector ETF cache
    await prefetchSectorETFs();

    const qualifying: InflectionResult[] = [];
    let pendingRecords: InflectionDailyRecord[] = [];
    let totalPersisted = 0;
    let fetchedCount = 0;

    for (let i = 0; i < universe.length; i += BATCH_SIZE) {
      const batch = universe.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchPreRunData(ticker);
          if (!data) return null;
          return scoreInflection(data);
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          fetchedCount++;
          const result = r.value;

          // Skip if gates fail or stage is DISTRIBUTION
          if (!result.gates.allPass || result.stage === "DISTRIBUTION") continue;

          qualifying.push(result);
          pendingRecords.push(resultToRecord(result, today));
        }
      }

      // Incremental persist every PERSIST_INTERVAL results
      if (pendingRecords.length >= PERSIST_INTERVAL) {
        const n = await upsertInflectionDaily(pendingRecords).catch((err) => {
          console.error("[inflection-daily] incremental persist error:", err);
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
      const n = await upsertInflectionDaily(pendingRecords).catch((err) => {
        console.error("[inflection-daily] flush persist error:", err);
        return 0;
      });
      totalPersisted += n;
    }

    // Sort by overall score
    qualifying.sort((a, b) => b.scores.overallScore - a.scores.overallScore);

    // Purge old data
    const purged = await purgeOldInflectionDaily(14).catch(() => 0);

    // Determine "new today" — tickers not in yesterday's results
    // Load yesterday's tickers from Supabase for comparison
    let newTickers: string[] = [];
    try {
      const { loadInflectionDailyDates, loadInflectionDaily } = await import("@/lib/supabase/persistence");
      const dates = await loadInflectionDailyDates(2);
      const yesterday = dates.find((d) => d !== today);
      if (yesterday) {
        const prevResults = await loadInflectionDaily(yesterday);
        const prevTickers = new Set(prevResults.map((r) => r.ticker));
        newTickers = qualifying
          .map((r) => r.data.ticker)
          .filter((t) => !prevTickers.has(t));
      } else {
        // First run — all are new
        newTickers = qualifying.map((r) => r.data.ticker);
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
        logError("api/inflection/cron/daily/telegram", new Error(tgResult.error ?? "Telegram send failed"));
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
      starters: qualifying.filter((r) => r.tradeRead === "STARTER_POSITION_CANDIDATE").length,
      addOns: qualifying.filter((r) => r.tradeRead === "ADD_ON_CONFIRMATION").length,
      watchers: qualifying.filter((r) => r.tradeRead === "WATCH").length,
    });
  } catch (err) {
    logError("api/inflection/cron/daily", err);
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
