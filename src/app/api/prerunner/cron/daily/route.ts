import { NextRequest, NextResponse } from "next/server";
import { computePreRunnerRadar } from "@/lib/prerunner/scoring";
import { sendTelegramMessage } from "@/lib/ew-telegram";
import {
  upsertPreRunnerDaily,
  purgeOldPreRunnerDaily,
  clearPreRunnerDaily,
  loadPreRunnerDaily,
} from "@/lib/supabase/persistence";
import type { PreRunnerDailyRecord } from "@/lib/supabase/persistence";
import type { PreRunnerCandidate } from "@/lib/prerunner/types";
import { PRERUNNER } from "@/lib/sector-rotation/config";

export const maxDuration = 120;

function candidateToRecord(c: PreRunnerCandidate, scanDate: string): PreRunnerDailyRecord {
  return {
    scan_date: scanDate,
    ticker: c.symbol,
    company_name: c.name,
    type: c.type,
    prerunner_score: c.preRunnerScore,
    price: c.price,
    rs_acceleration: c.rsAcceleration,
    rs_improving: c.rsImproving,
    rs_delta: c.rsDelta,
    sector: c.sector,
    sector_etf: c.sectorEtf,
    sector_quadrant: c.sectorQuadrant,
    sector_composite: c.sectorComposite,
    lifecycle: c.lifecycle,
    rotation_days_active: c.rotationDaysActive,
    volume_ratio: c.volumeRatio,
    regime_alignment: c.regimeAlignment,
    conviction: c.conviction,
    performance_pct: c.performancePct,
    above_sma50: c.aboveSma50,
    volume_consistency: c.volumeConsistency,
    trend_accel: c.trendAccel,
  };
}

function formatTelegramSummary(
  records: PreRunnerDailyRecord[],
  newTickers: string[],
  exitTickers: string[],
  regime: string | null,
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const turnaroundCount = records.filter((r) => r.type === "TURNAROUND").length;
  const leaderCount = records.filter((r) => r.type === "LEADER").length;
  const activeSectors = [...new Set(records.map((r) => r.sector))];

  const lines: string[] = [];
  lines.push("<b>Pre-Runner Radar</b>");
  lines.push(
    `${date} | ${records.length} candidate${records.length !== 1 ? "s" : ""} | ${turnaroundCount} TURNAROUND + ${leaderCount} LEADER`,
  );
  lines.push("");

  // Top candidates
  const top = records.slice(0, PRERUNNER.MAX_TELEGRAM_CANDIDATES);
  if (top.length > 0) {
    lines.push("<b>Top " + top.length + ":</b>");
    for (let i = 0; i < top.length; i++) {
      const r = top[i];
      const typeIcon = r.type === "TURNAROUND" ? "\u{1F504}" : "\u{1F451}";
      const rsArrow = r.rs_improving ? "\u2191" : "\u2193";
      const lifecycleStr = r.lifecycle ? ` | ${r.sector} ${r.lifecycle}` : ` | ${r.sector}`;
      lines.push(
        `${i + 1}. ${r.ticker} ${r.prerunner_score} ${typeIcon} | RS ${r.rs_acceleration > 0 ? "+" : ""}${r.rs_acceleration.toFixed(1)} ${rsArrow}${lifecycleStr}`,
      );
    }
    lines.push("");
  }

  // New / exits
  if (newTickers.length > 0) {
    lines.push(
      `<b>New (${newTickers.length}):</b> ${newTickers.slice(0, 10).join(", ")}${newTickers.length > 10 ? ` (+${newTickers.length - 10} more)` : ""}`,
    );
  }
  if (exitTickers.length > 0) {
    lines.push(
      `<b>Exits (${exitTickers.length}):</b> ${exitTickers.slice(0, 10).join(", ")}${exitTickers.length > 10 ? ` (+${exitTickers.length - 10} more)` : ""}`,
    );
  }

  // Regime + sectors
  if (regime || activeSectors.length > 0) {
    const parts: string[] = [];
    if (regime) parts.push(`Regime: ${regime}`);
    if (activeSectors.length > 0) parts.push(`${activeSectors.length} sector${activeSectors.length !== 1 ? "s" : ""}`);
    lines.push(parts.join(" | "));
  }

  return lines.join("\n");
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
    const today = new Date().toISOString().slice(0, 10);
    const shouldClear = searchParams.get("clear") === "true";

    // Optionally clear today's data
    if (shouldClear) {
      const cleared = await clearPreRunnerDaily(today);
      console.log(`[prerunner-cron] Cleared ${cleared} rows for ${today}`);
    }

    // Load yesterday's tickers for new/exit comparison
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    // Find the most recent weekday
    while (yesterday.getDay() === 0 || yesterday.getDay() === 6) {
      yesterday.setDate(yesterday.getDate() - 1);
    }
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const yesterdayRecords = await loadPreRunnerDaily(yesterdayStr);
    const yesterdayTickers = new Set(yesterdayRecords.map((r) => r.ticker));

    // Compute radar
    console.log("[prerunner-cron] Computing Pre-Runner Radar...");
    const result = await computePreRunnerRadar();
    console.log(
      `[prerunner-cron] Found ${result.candidates.length} candidates (${result.leaderCount} leaders, ${result.turnaroundCount} turnarounds)`,
    );

    // Map to DB records and persist
    const records = result.candidates.map((c) => candidateToRecord(c, today));
    const upserted = await upsertPreRunnerDaily(records);
    console.log(`[prerunner-cron] Upserted ${upserted} records`);

    // Purge old data
    const purged = await purgeOldPreRunnerDaily(14);
    if (purged > 0) console.log(`[prerunner-cron] Purged ${purged} old rows`);

    // Load full DB results for today (in case of resume/merge)
    const finalRecords = await loadPreRunnerDaily(today);
    const todayTickers = new Set(finalRecords.map((r) => r.ticker));

    // Compute new / exits
    const newTickers = [...todayTickers].filter((t) => !yesterdayTickers.has(t));
    const exitTickers = [...yesterdayTickers].filter((t) => !todayTickers.has(t));

    // Send Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (botToken && chatId && finalRecords.length > 0) {
      const msg = formatTelegramSummary(finalRecords, newTickers, exitTickers, result.regime);
      const tgResult = await sendTelegramMessage(botToken, chatId, msg);
      if (!tgResult.ok) {
        console.error("[prerunner-cron] Telegram error:", tgResult.error);
      }
    }

    return NextResponse.json({
      ok: true,
      date: today,
      candidates: finalRecords.length,
      leaders: finalRecords.filter((r) => r.type === "LEADER").length,
      turnarounds: finalRecords.filter((r) => r.type === "TURNAROUND").length,
      newTickers: newTickers.length,
      exitTickers: exitTickers.length,
      purged,
    });
  } catch (err) {
    console.error("[prerunner-cron] Fatal error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
