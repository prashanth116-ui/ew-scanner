import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData, prefetchSectorETFs } from "@/lib/prerun/data";
import { autoScorePreRun } from "@/lib/prerun/scoring";
import { SP500_MEMBERS, NDX100_MEMBERS, SP400_MEMBERS } from "@/data/index-tiers";
import { getSectorForTicker } from "@/data/prerun-universe";
import { sendTelegramMessage } from "@/lib/ew-telegram";
import { createAdminClient } from "@/lib/supabase/server";
import {
  upsertPreRunDaily,
  purgeOldPreRunDaily,
  loadPreRunDailyDates,
  loadPreRunDaily,
} from "@/lib/supabase/persistence";
import type { PreRunDailyRecord } from "@/lib/supabase/persistence";
import type { PreRunResult } from "@/lib/prerun/types";

export const maxDuration = 300;

const BATCH_SIZE = 10;
const BATCH_DELAY = 1100;
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
    pullback: pctFromAth <= 40 && s.finalScore >= 15 && s.scoreM2 >= 1 && s.scoreF >= 1 && s.scoreL >= 1,
    leading: s.totalScore >= 12 && s.scoreM >= 1 && (quadrant === "LEADING" || quadrant === "IMPROVING"),
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

function formatTelegramSummary(
  scannedCount: number,
  records: PreRunDailyRecord[],
  newTickers: string[],
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push("<b>PreRun Daily Scan</b>");
  lines.push(`${date} | ${scannedCount} scanned | ${records.length} qualifying`);
  lines.push("");

  const presetCounts = {
    SNDK: records.filter((r) => r.is_sndk).length,
    "Early Mover": records.filter((r) => r.is_early_mover).length,
    Pullback: records.filter((r) => r.is_pullback).length,
    Leading: records.filter((r) => r.is_leading).length,
    Stealth: records.filter((r) => r.is_stealth).length,
    "Early+": records.filter((r) => r.is_early_plus).length,
  };

  for (const [name, count] of Object.entries(presetCounts)) {
    if (count > 0) {
      lines.push(`<b>${name}:</b> ${count}`);
    }
  }
  lines.push("");

  // Top tickers by score
  const top = [...records].sort((a, b) => b.final_score - a.final_score).slice(0, 10);
  if (top.length > 0) {
    lines.push("<b>Top 10:</b>");
    for (const r of top) {
      const presets: string[] = [];
      if (r.is_sndk) presets.push("SNDK");
      if (r.is_early_mover) presets.push("EM");
      if (r.is_pullback) presets.push("PB");
      if (r.is_leading) presets.push("LD");
      if (r.is_stealth) presets.push("ST");
      if (r.is_early_plus) presets.push("E+");
      lines.push(`* ${r.ticker} ${r.final_score} | ${presets.join(",")}`);
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
    // Build universe: SP500 + NDX100 + SP400 (deduplicated)
    const universe = [...new Set([...SP500_MEMBERS, ...NDX100_MEMBERS, ...SP400_MEMBERS])];
    const today = new Date().toISOString().slice(0, 10);

    // Pre-warm sector ETF cache + load sector quadrants
    const [, sectorQuadrants] = await Promise.all([
      prefetchSectorETFs(),
      loadSectorQuadrants(),
    ]);

    const allRecords: PreRunDailyRecord[] = [];
    let pendingRecords: PreRunDailyRecord[] = [];
    let totalPersisted = 0;
    let fetchedCount = 0;

    for (let i = 0; i < universe.length; i += BATCH_SIZE) {
      const batch = universe.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchPreRunData(ticker);
          if (!data) return null;
          const sector = getSectorForTicker(ticker);
          const quadrant = sector ? sectorQuadrants[sector] ?? null : null;
          const result = autoScorePreRun(data, quadrant);
          return { result, quadrant };
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          fetchedCount++;
          const { result, quadrant } = r.value;
          const record = resultToRecord(result, today, quadrant);
          if (record) {
            allRecords.push(record);
            pendingRecords.push(record);
          }
        }
      }

      // Incremental persist
      if (pendingRecords.length >= PERSIST_INTERVAL) {
        const n = await upsertPreRunDaily(pendingRecords).catch((err) => {
          console.error("[prerun-daily] incremental persist error:", err);
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
      const n = await upsertPreRunDaily(pendingRecords).catch((err) => {
        console.error("[prerun-daily] flush persist error:", err);
        return 0;
      });
      totalPersisted += n;
    }

    // Purge old data
    const purged = await purgeOldPreRunDaily(14).catch(() => 0);

    // Determine "new today"
    let newTickers: string[] = [];
    try {
      const dates = await loadPreRunDailyDates(2);
      const yesterday = dates.find((d) => d !== today);
      if (yesterday) {
        const prevResults = await loadPreRunDaily(yesterday);
        const prevTickers = new Set(prevResults.map((r) => r.ticker));
        newTickers = allRecords.map((r) => r.ticker).filter((t) => !prevTickers.has(t));
      } else {
        newTickers = allRecords.map((r) => r.ticker);
      }
    } catch {
      // Non-critical
    }

    // Send Telegram summary
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    let telegramSent = false;
    if (botToken && chatId) {
      const message = formatTelegramSummary(universe.length, allRecords, newTickers);
      const tgResult = await sendTelegramMessage(botToken, chatId, message);
      telegramSent = tgResult.ok;
      if (!tgResult.ok) {
        logError("api/prerun/cron/preset/telegram", new Error(tgResult.error ?? "Telegram send failed"));
      }
    }

    return NextResponse.json({
      scannedCount: universe.length,
      fetchedCount,
      qualifyingCount: allRecords.length,
      persistedCount: totalPersisted,
      purgedCount: purged,
      newTodayCount: newTickers.length,
      telegramSent,
      presetCounts: {
        sndk: allRecords.filter((r) => r.is_sndk).length,
        early_mover: allRecords.filter((r) => r.is_early_mover).length,
        pullback: allRecords.filter((r) => r.is_pullback).length,
        leading: allRecords.filter((r) => r.is_leading).length,
        stealth: allRecords.filter((r) => r.is_stealth).length,
        early_plus: allRecords.filter((r) => r.is_early_plus).length,
      },
    });
  } catch (err) {
    logError("api/prerun/cron/preset", err);
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
