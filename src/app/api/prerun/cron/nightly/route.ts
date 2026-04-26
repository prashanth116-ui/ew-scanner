import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData } from "@/lib/prerun/data";
import { autoScorePreRun } from "@/lib/prerun/scoring";
import { getAllPreRunTickers } from "@/data/prerun-universe";
import { sendTelegramMessage } from "@/lib/ew-telegram";
import type { PreRunResult } from "@/lib/prerun/types";

const BATCH_SIZE = 10;
const BATCH_DELAY = 1100; // Respect Finnhub 60/min rate limit

function formatTelegramSummary(
  scannedCount: number,
  qualifying: PreRunResult[]
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push(`<b>Pre-Run Nightly Scan</b>`);
  lines.push(`${date} | ${scannedCount} scanned | ${qualifying.length} qualifying`);
  lines.push("");

  const priority = qualifying.filter((r) => r.verdict === "PRIORITY");
  const keep = qualifying.filter((r) => r.verdict === "KEEP");
  const watch = qualifying.filter((r) => r.verdict === "WATCH");

  if (priority.length > 0) {
    lines.push("<b>PRIORITY:</b>");
    for (const r of priority) {
      const parts = [`${r.data.ticker} ${r.scores.finalScore}/14`];
      if (r.data.pctFromAth !== null) parts.push(`${Math.round(r.data.pctFromAth)}% from ATH`);
      if (r.data.shortFloat !== null) parts.push(`${r.data.shortFloat.toFixed(1)}% SI`);
      if (r.data.daysToEarnings !== null) parts.push(`Earnings ${r.data.daysToEarnings}d`);
      lines.push(`* ${parts.join(", ")}`);
    }
    lines.push("");
  }

  if (keep.length > 0) {
    lines.push("<b>KEEP:</b>");
    for (const r of keep) {
      const parts = [`${r.data.ticker} ${r.scores.finalScore}/14`];
      if (r.data.pctFromAth !== null) parts.push(`${Math.round(r.data.pctFromAth)}% from ATH`);
      if (r.data.shortFloat !== null) parts.push(`${r.data.shortFloat.toFixed(1)}% SI`);
      lines.push(parts.join(", "));
    }
    lines.push("");
  }

  if (watch.length > 0) {
    const top5 = watch.slice(0, 5);
    lines.push(`<b>WATCH (top ${Math.min(5, watch.length)}):</b>`);
    for (const r of top5) {
      const parts = [`${r.data.ticker} ${r.scores.finalScore}/14`];
      if (r.data.pctFromAth !== null) parts.push(`${Math.round(r.data.pctFromAth)}% from ATH`);
      if (r.data.shortFloat !== null) parts.push(`${r.data.shortFloat.toFixed(1)}% SI`);
      lines.push(parts.join(", "));
    }
    if (watch.length > 5) {
      lines.push(`... and ${watch.length - 5} more`);
    }
  }

  if (qualifying.length === 0) {
    lines.push("No qualifying candidates today.");
  }

  return lines.join("\n");
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
    const tickers = getAllPreRunTickers();
    const results: PreRunResult[] = [];

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchPreRunData(ticker);
          if (!data) return null;
          return autoScorePreRun(data);
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          results.push(r.value);
        }
      }

      if (i + BATCH_SIZE < tickers.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    // Filter to qualifying candidates (gates pass + score >= 7)
    const qualifying = results.filter(
      (r) => r.gates.gate1 && r.gates.gate3 && r.scores.finalScore >= 7
    );

    qualifying.sort((a, b) => b.scores.finalScore - a.scores.finalScore);

    // Send Telegram summary
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    let telegramSent = false;
    if (botToken && chatId) {
      const message = formatTelegramSummary(tickers.length, qualifying);
      const tgResult = await sendTelegramMessage(botToken, chatId, message);
      telegramSent = tgResult.ok;
      if (!tgResult.ok) {
        logError("api/prerun/cron/nightly/telegram", new Error(tgResult.error ?? "Telegram send failed"));
      }
    }

    return NextResponse.json({
      scannedCount: tickers.length,
      fetchedCount: results.length,
      qualifyingCount: qualifying.length,
      telegramSent,
      // Full results for downstream caching (client can call saveScanResults)
      results: qualifying,
    });
  } catch (err) {
    logError("api/prerun/cron/nightly", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
