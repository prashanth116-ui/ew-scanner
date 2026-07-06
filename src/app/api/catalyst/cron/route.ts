import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { runCatalystScan } from "@/lib/catalyst/scan";
import { sendTelegramMessage } from "@/lib/ew-wave/telegram";
import { recordSignalBatch } from "@/lib/supabase/persistence";
import type { CatalystResult, CatalystCalendarEvent } from "@/lib/catalyst/types";

export const maxDuration = 300; // 5 min — full universe scan with batch delays

function formatCalendarRibbon(events: CatalystCalendarEvent[]): string {
  const top = events.slice(0, 3);
  if (top.length === 0) return "";
  const lines = top.map((e) => {
    const badge = e.daysAway === 0 ? "TODAY" : `${e.daysAway}d`;
    return `  ${badge} ${e.label}`;
  });
  return lines.join("\n");
}

function formatResults(label: string, results: CatalystResult[]): string {
  if (results.length === 0) return "";
  const lines: string[] = [`<b>${label}:</b>`];
  for (const r of results.slice(0, 10)) {
    const parts: string[] = [
      `${r.symbol} ${r.totalScore.toFixed(0)}/100`,
    ];
    if (r.nextCatalyst && r.nextCatalystDays !== undefined) {
      parts.push(`${r.nextCatalyst} (${r.nextCatalystDays}d)`);
    }
    if (r.shortPercentFloat > 5) {
      parts.push(`${r.shortPercentFloat.toFixed(1)}% SI`);
    }
    if (r.peersThatSpiked?.length) {
      parts.push(`Peers: ${r.peersThatSpiked.join(", ")}`);
    }
    lines.push(`${r.fireDrill ? "* " : ""}${parts.join(", ")}`);
  }
  if (results.length > 10) {
    lines.push(`... and ${results.length - 10} more`);
  }
  return lines.join("\n");
}

function formatTelegramMessage(
  prespike: CatalystResult[],
  watch: CatalystResult[],
  fireDrills: CatalystResult[],
  calendar: CatalystCalendarEvent[],
  scannedCount: number
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push(`<b>AI Radar</b>`);
  lines.push(`${date} | ${scannedCount} scanned`);
  lines.push("");

  // Calendar countdown
  const ribbon = formatCalendarRibbon(calendar);
  if (ribbon) {
    lines.push("<b>Upcoming Catalysts:</b>");
    lines.push(ribbon);
    lines.push("");
  }

  // Fire drills
  if (fireDrills.length > 0) {
    lines.push(formatResults("FIRE DRILL", fireDrills));
    lines.push("");
  }

  // PRE_SPIKE
  const prespikeSection = formatResults("PRE_SPIKE", prespike);
  if (prespikeSection) {
    lines.push(prespikeSection);
    lines.push("");
  }

  // WATCH
  const watchSection = formatResults("WATCH", watch);
  if (watchSection) {
    lines.push(watchSection);
  }

  if (prespike.length === 0 && watch.length === 0 && fireDrills.length === 0) {
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
    const result = await runCatalystScan();

    // Collect fire drills from all buckets
    const allResults = [
      ...result.prespike,
      ...result.watch,
      ...result.monitor,
    ];
    const fireDrills = allResults.filter((r) => r.fireDrill);

    // Record PRE_SPIKE + WATCH signals to Supabase
    const today = new Date().toISOString().slice(0, 10);
    const signalRecords = [...result.prespike, ...result.watch].map((r) => ({
      scanner: "catalyst" as const,
      ticker: r.symbol,
      signal_date: today,
      price_at_signal: r.price,
      signal_strength: r.verdict,
      score: r.totalScore,
    }));
    await recordSignalBatch(signalRecords).catch(() => {});

    // Send Telegram alert
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    let telegramSent = false;
    if (botToken && chatId) {
      const scannedCount = allResults.length +
        Object.values(result.misses).reduce((a, b) => a + b.length, 0);
      const message = formatTelegramMessage(
        result.prespike,
        result.watch,
        fireDrills,
        result.calendar,
        scannedCount
      );
      const tgResult = await sendTelegramMessage(botToken, chatId, message);
      telegramSent = tgResult.ok;
      if (!tgResult.ok) {
        logError("api/catalyst/cron/telegram", new Error(tgResult.error ?? "Telegram send failed"));
      }
    }

    return NextResponse.json({
      prespikeCount: result.prespike.length,
      watchCount: result.watch.length,
      monitorCount: result.monitor.length,
      missCount: Object.values(result.misses).reduce((a, b) => a + b.length, 0),
      fireDrillCount: fireDrills.length,
      telegramSent,
      prespike: result.prespike,
      watch: result.watch,
    });
  } catch (err) {
    logError("api/catalyst/cron", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
