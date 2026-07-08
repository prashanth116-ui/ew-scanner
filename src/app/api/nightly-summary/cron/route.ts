/**
 * Nightly Summary Cron — consolidated Telegram alert for all nightly scanners.
 *
 * Runs at 03:00 UTC (11:00 PM ET), Tue-Sat, after all individual scanners finish.
 * Reads persisted results from all scanner tables, groups by ticker to surface
 * cross-scanner confluence, and sends a single unified Telegram message.
 *
 * Pure DB reads — no Yahoo Finance fetching. maxDuration = 60.
 */

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { sendTelegramMessage } from "@/lib/ew-wave/telegram";
import { createAdminClient } from "@/lib/supabase/server";
import {
  loadPreRunDaily,
  loadInflectionDaily,
  loadVCPDaily,
  loadInstitutionalDaily,
  loadPreRunnerDaily,
  loadQFEDaily,
  loadPreRunDailyDates,
} from "@/lib/supabase/persistence";
import type {
  PreRunDailyRecord,
  InflectionDailyRecord,
  VCPDailyRecord,
  InstitutionalDailyRecord,
  PreRunnerDailyRecord,
  QFEDailyRecord,
} from "@/lib/supabase/persistence";
import { loadDiscoveredTickers } from "@/lib/discovery/storage";

export const maxDuration = 60;

// ── Types ──

interface ScannerHit {
  scanner: string;
  label: string;
  score: number;
}

interface ConsolidatedTicker {
  ticker: string;
  hits: ScannerHit[];
  maxScore: number;
}

// ── Catalyst signal loader (no existing load function) ──

interface CatalystSignalRow {
  ticker: string;
  signal_strength: string;
  score: number;
}

async function loadCatalystSignals(date: string): Promise<CatalystSignalRow[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("signal_outcomes")
      .select("ticker, signal_strength, score")
      .eq("scanner", "catalyst")
      .eq("signal_date", date);

    if (error) {
      console.error("[nightly-summary] loadCatalystSignals error:", error.message);
      return [];
    }
    return (data ?? []) as CatalystSignalRow[];
  } catch (err) {
    console.error("[nightly-summary] loadCatalystSignals exception:", err);
    return [];
  }
}

// ── Scanner label formatters ──

function prerunLabel(r: PreRunDailyRecord): string {
  const presets: string[] = [];
  if (r.is_leading) presets.push("LD");
  if (r.is_stealth) presets.push("ST");
  if (r.is_sndk) presets.push("SNDK");
  if (r.is_early_mover) presets.push("EM");
  if (r.is_pullback) presets.push("PB");
  if (r.is_early_plus) presets.push("E+");
  return `PreRun ${r.final_score}${presets.length > 0 ? ` (${presets.join(",")})` : ""}`;
}

function inflectionLabel(r: InflectionDailyRecord): string {
  const trMap: Record<string, string> = {
    STARTER_POSITION_CANDIDATE: "STARTER",
    ADD_ON_CONFIRMATION: "ADD_ON",
    WATCH: "WATCH",
  };
  return `Inflect ${trMap[r.trade_read] ?? r.trade_read}`;
}

function vcpLabel(r: VCPDailyRecord): string {
  const phaseMap: Record<string, string> = {
    FOCUS_LIST: "FOCUS",
    WATCHLIST_CANDIDATE: "WATCH",
    EARLY_SETUP: "EARLY",
  };
  return `VCP ${phaseMap[r.phase] ?? r.phase}`;
}

function institutionalLabel(r: InstitutionalDailyRecord): string {
  return `Inst ${r.tier ?? r.classification}`;
}

function prerunnerLabel(r: PreRunnerDailyRecord): string {
  return `Runner ${r.prerunner_score}`;
}

function qfeLabel(r: QFEDailyRecord): string {
  return `QFE ${r.rating}`;
}

function catalystLabel(r: CatalystSignalRow): string {
  return `${r.signal_strength} | ${r.score}`;
}

// ── Consolidation ──

function consolidateResults(
  prerun: PreRunDailyRecord[],
  inflection: InflectionDailyRecord[],
  vcp: VCPDailyRecord[],
  institutional: InstitutionalDailyRecord[],
  prerunner: PreRunnerDailyRecord[],
  qfe: QFEDailyRecord[],
  catalyst: CatalystSignalRow[],
): { multi: ConsolidatedTicker[]; singles: ConsolidatedTicker[]; catalysts: ConsolidatedTicker[] } {
  const map = new Map<string, ScannerHit[]>();

  function add(ticker: string, hit: ScannerHit) {
    if (!map.has(ticker)) map.set(ticker, []);
    map.get(ticker)!.push(hit);
  }

  for (const r of prerun) add(r.ticker, { scanner: "PreRun", label: prerunLabel(r), score: r.final_score });
  for (const r of inflection) add(r.ticker, { scanner: "Inflection", label: inflectionLabel(r), score: r.overall_score });
  for (const r of vcp) add(r.ticker, { scanner: "VCP", label: vcpLabel(r), score: r.total_score });
  for (const r of institutional) add(r.ticker, { scanner: "Institutional", label: institutionalLabel(r), score: r.composite_score });
  for (const r of prerunner) add(r.ticker, { scanner: "PreRunner", label: prerunnerLabel(r), score: r.prerunner_score });
  for (const r of qfe) add(r.ticker, { scanner: "QFE", label: qfeLabel(r), score: r.qfe_score });

  // Build consolidated list (excluding catalyst — handled separately)
  const all: ConsolidatedTicker[] = [];
  for (const [ticker, hits] of map) {
    all.push({
      ticker,
      hits,
      maxScore: Math.max(...hits.map((h) => h.score)),
    });
  }

  // Sort by hit count DESC, then max score DESC
  all.sort((a, b) => b.hits.length - a.hits.length || b.maxScore - a.maxScore);

  const multi = all.filter((t) => t.hits.length >= 2);
  const singles = all.filter((t) => t.hits.length === 1);

  // Catalyst entries (separate section)
  const catalystEntries: ConsolidatedTicker[] = catalyst.map((r) => ({
    ticker: r.ticker,
    hits: [{ scanner: "Catalyst", label: catalystLabel(r), score: r.score }],
    maxScore: r.score,
  }));
  catalystEntries.sort((a, b) => b.maxScore - a.maxScore);

  return { multi, singles, catalysts: catalystEntries };
}

// ── New/Dropped computation ──

async function computeNewDropped(
  today: string,
  todayTickers: Set<string>,
): Promise<{ newTickers: string[]; droppedTickers: string[] }> {
  try {
    const dates = await loadPreRunDailyDates(2);
    const yesterday = dates.find((d) => d !== today);
    if (!yesterday) {
      return { newTickers: [...todayTickers], droppedTickers: [] };
    }

    // Load yesterday's data from all main tables in parallel
    const [prevPrerun, prevInflection, prevVcp, prevInstitutional, prevPrerunner] = await Promise.all([
      loadPreRunDaily(yesterday),
      loadInflectionDaily(yesterday),
      loadVCPDaily(yesterday),
      loadInstitutionalDaily(yesterday),
      loadPreRunnerDaily(yesterday),
    ]);

    const yesterdayTickers = new Set<string>();
    for (const r of prevPrerun) yesterdayTickers.add(r.ticker);
    for (const r of prevInflection) yesterdayTickers.add(r.ticker);
    for (const r of prevVcp) yesterdayTickers.add(r.ticker);
    for (const r of prevInstitutional) yesterdayTickers.add(r.ticker);
    for (const r of prevPrerunner) yesterdayTickers.add(r.ticker);

    const newTickers = [...todayTickers].filter((t) => !yesterdayTickers.has(t));
    const droppedTickers = [...yesterdayTickers].filter((t) => !todayTickers.has(t));

    return { newTickers, droppedTickers };
  } catch {
    return { newTickers: [], droppedTickers: [] };
  }
}

// ── Telegram formatter ──

const MAX_MULTI = 5;
const MAX_SINGLES = 3;
const MAX_CATALYSTS = 3;
const MAX_NEW = 15;
const MAX_DROPPED = 10;

function formatNightlySummary(
  multi: ConsolidatedTicker[],
  singles: ConsolidatedTicker[],
  catalysts: ConsolidatedTicker[],
  newTickers: string[],
  droppedTickers: string[],
  discoveryStocks: number,
  discoveryCrypto: number,
  scannerCounts: Record<string, number>,
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const totalTickers = new Set([
    ...multi.map((t) => t.ticker),
    ...singles.map((t) => t.ticker),
  ]).size;

  const lines: string[] = [];
  lines.push(`<b>NIGHTLY SCAN</b> \u2014 ${date}`);
  lines.push(`${totalTickers} tickers | ${multi.length} multi-scanner`);
  lines.push("");

  // Scanner counts ribbon
  const countParts: string[] = [];
  for (const [scanner, count] of Object.entries(scannerCounts)) {
    if (count > 0) countParts.push(`${scanner}: ${count}`);
  }
  if (countParts.length > 0) {
    lines.push(countParts.join(" | "));
    lines.push("");
  }

  // Multi-scanner section
  if (multi.length > 0) {
    lines.push(`<b>MULTI-SCANNER (${multi.length})</b>`);
    for (const t of multi.slice(0, MAX_MULTI)) {
      const labels = t.hits.map((h) => h.label).join(" + ");
      lines.push(`${t.ticker} \u2014 ${labels}`);
    }
    if (multi.length > MAX_MULTI) {
      lines.push(`... +${multi.length - MAX_MULTI} more`);
    }
    lines.push("");
  }

  // Top singles
  if (singles.length > 0) {
    lines.push(`<b>TOP SINGLES</b>`);
    for (const t of singles.slice(0, MAX_SINGLES)) {
      lines.push(`${t.ticker} \u2014 ${t.hits[0].label}`);
    }
    if (singles.length > MAX_SINGLES) {
      lines.push(`... +${singles.length - MAX_SINGLES} more`);
    }
    lines.push("");
  }

  // Catalysts
  if (catalysts.length > 0) {
    lines.push(`<b>CATALYSTS</b>`);
    for (const t of catalysts.slice(0, MAX_CATALYSTS)) {
      lines.push(`${t.ticker} \u2014 ${t.hits[0].label}`);
    }
    if (catalysts.length > MAX_CATALYSTS) {
      lines.push(`... +${catalysts.length - MAX_CATALYSTS} more`);
    }
    lines.push("");
  }

  // New / Dropped
  if (newTickers.length > 0) {
    const display = newTickers.slice(0, MAX_NEW).join(", ");
    const extra = newTickers.length > MAX_NEW ? ` (+${newTickers.length - MAX_NEW})` : "";
    lines.push(`<b>NEW:</b> ${display}${extra}`);
  }
  if (droppedTickers.length > 0) {
    const display = droppedTickers.slice(0, MAX_DROPPED).join(", ");
    const extra = droppedTickers.length > MAX_DROPPED ? ` (+${droppedTickers.length - MAX_DROPPED})` : "";
    lines.push(`<b>DROPPED:</b> ${display}${extra}`);
  }

  // Discovery
  if (discoveryStocks > 0 || discoveryCrypto > 0) {
    lines.push("");
    lines.push(`Discovery: ${discoveryStocks} stocks | ${discoveryCrypto} crypto`);
  }

  return lines.join("\n");
}

// ── Route Handler ──

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
    const today = new Date().toISOString().slice(0, 10);

    // Load all scanner results for today in parallel
    const [prerun, inflection, vcp, institutional, prerunner, qfe, catalyst, discovered] = await Promise.all([
      loadPreRunDaily(today),
      loadInflectionDaily(today),
      loadVCPDaily(today),
      loadInstitutionalDaily(today),
      loadPreRunnerDaily(today),
      loadQFEDaily(today),
      loadCatalystSignals(today),
      loadDiscoveredTickers(),
    ]);

    // Consolidate
    const { multi, singles, catalysts } = consolidateResults(
      prerun, inflection, vcp, institutional, prerunner, qfe, catalyst,
    );

    // Build today's ticker set for new/dropped
    const todayTickers = new Set<string>();
    for (const r of prerun) todayTickers.add(r.ticker);
    for (const r of inflection) todayTickers.add(r.ticker);
    for (const r of vcp) todayTickers.add(r.ticker);
    for (const r of institutional) todayTickers.add(r.ticker);
    for (const r of prerunner) todayTickers.add(r.ticker);

    // Compute new/dropped
    const { newTickers, droppedTickers } = await computeNewDropped(today, todayTickers);

    // Discovery counts
    const discoveryStocks = discovered.filter((d) => d.asset_class === "stock").length;
    const discoveryCrypto = discovered.filter((d) => d.asset_class === "crypto").length;

    // Scanner counts for ribbon
    const scannerCounts: Record<string, number> = {
      PR: prerun.length,
      INF: inflection.length,
      VCP: vcp.length,
      INST: institutional.length,
      RNR: prerunner.length,
      QFE: qfe.length,
      CAT: catalyst.length,
    };

    // Send Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    let telegramSent = false;
    if (botToken && chatId) {
      const message = formatNightlySummary(
        multi, singles, catalysts, newTickers, droppedTickers,
        discoveryStocks, discoveryCrypto, scannerCounts,
      );
      const tgResult = await sendTelegramMessage(botToken, chatId, message);
      telegramSent = tgResult.ok;
      if (!tgResult.ok) {
        logError("api/nightly-summary/cron/telegram", new Error(tgResult.error ?? "Telegram send failed"));
      }
    }

    return NextResponse.json({
      totalTickers: todayTickers.size,
      multiScannerCount: multi.length,
      scannerCounts,
      newCount: newTickers.length,
      droppedCount: droppedTickers.length,
      discoveryStocks,
      discoveryCrypto,
      telegramSent,
      elapsedMs: Date.now() - startTime,
    });
  } catch (err) {
    logError("api/nightly-summary/cron", err);
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
