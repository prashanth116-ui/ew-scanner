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
  rsAccel: number | null; // RS acceleration (positive = improving vs SPY)
  sector: string | null;  // GICS sector for context
  isNew: boolean;         // true if ticker is new today (not in yesterday's scans)
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

// ── Scanner label formatters (compact for Telegram) ──

function prerunLabel(r: PreRunDailyRecord): string {
  const presets: string[] = [];
  if (r.is_leading) presets.push("LD");
  if (r.is_stealth) presets.push("ST");
  if (r.is_sndk) presets.push("SNDK");
  if (r.is_early_mover) presets.push("EM");
  if (r.is_pullback) presets.push("PB");
  if (r.is_early_plus) presets.push("E+");
  return `PR ${r.final_score}${presets.length > 0 ? ` (${presets.join(",")})` : ""}`;
}

function inflectionLabel(r: InflectionDailyRecord): string {
  const trMap: Record<string, string> = {
    STARTER_POSITION_CANDIDATE: "STARTER",
    ADD_ON_CONFIRMATION: "ADD_ON",
    WATCH: "WATCH",
  };
  return `INF ${trMap[r.trade_read] ?? r.trade_read}`;
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
  const tierMap: Record<string, string> = {
    SHORTLIST: "SL",
    WATCHLIST: "WL",
    SPECULATIVE: "SPEC",
    TOO_EXTENDED: "EXT",
    MOMENTUM_CHASER: "MCHSR",
  };
  return `INST ${r.tier ? tierMap[r.tier] ?? r.tier : r.classification}`;
}

function prerunnerLabel(r: PreRunnerDailyRecord): string {
  return `RNR ${r.prerunner_score}`;
}

function catalystLabel(r: CatalystSignalRow): string {
  return `${r.signal_strength} | ${r.score}`;
}

// ── RS Acceleration ──

/**
 * Build a Map<ticker, rsAccel> from all available RS data.
 * Priority: QFE (widest coverage, multi-timeframe) > PreRunner > Institutional.
 * QFE accel = rs_5d_spy - rs_20d_spy (short-term RS outpacing medium-term = accelerating).
 */
function buildRsAccelMap(
  qfe: QFEDailyRecord[],
  prerunner: PreRunnerDailyRecord[],
  institutional: InstitutionalDailyRecord[],
): Map<string, number> {
  const rsMap = new Map<string, number>();

  // Institutional rs_accel_spy (lowest priority, overwritten by better sources)
  for (const r of institutional) {
    if (r.rs_accel_spy != null) rsMap.set(r.ticker, r.rs_accel_spy);
  }

  // PreRunner rs_acceleration (mid priority)
  for (const r of prerunner) {
    if (r.rs_acceleration != null) rsMap.set(r.ticker, r.rs_acceleration);
  }

  // QFE: rs_5d_spy - rs_20d_spy (highest priority, widest coverage)
  for (const r of qfe) {
    if (r.rs_5d_spy != null && r.rs_20d_spy != null) {
      rsMap.set(r.ticker, r.rs_5d_spy - r.rs_20d_spy);
    }
  }

  return rsMap;
}

// ── Consolidation ──

/**
 * QFE is derived from PreRun data, so counting both inflates confluence.
 * We count only 5 independent scanners (PreRun, Inflection, VCP, Institutional, PreRunner)
 * for confluence ranking. QFE rating is appended as an inline badge when present.
 * Tickers within each tier are sorted by RS acceleration DESC.
 */
function consolidateResults(
  prerun: PreRunDailyRecord[],
  inflection: InflectionDailyRecord[],
  vcp: VCPDailyRecord[],
  institutional: InstitutionalDailyRecord[],
  prerunner: PreRunnerDailyRecord[],
  qfe: QFEDailyRecord[],
  catalyst: CatalystSignalRow[],
  newTickerSet: Set<string>,
): { tiers: Map<number, ConsolidatedTicker[]>; catalysts: ConsolidatedTicker[] } {
  // Independent scanner hits (count toward confluence)
  const map = new Map<string, ScannerHit[]>();

  function add(ticker: string, hit: ScannerHit) {
    if (!map.has(ticker)) map.set(ticker, []);
    map.get(ticker)!.push(hit);
  }

  for (const r of prerun) add(r.ticker, { scanner: "PreRun", label: prerunLabel(r), score: r.final_score });
  // INF WATCH is low-conviction — show as badge but don't count for confluence
  for (const r of inflection) {
    const isWatch = r.trade_read === "WATCH";
    add(r.ticker, { scanner: isWatch ? "INF_WATCH" : "Inflection", label: inflectionLabel(r), score: r.overall_score });
  }
  for (const r of vcp) add(r.ticker, { scanner: "VCP", label: vcpLabel(r), score: r.total_score });
  for (const r of institutional) add(r.ticker, { scanner: "Institutional", label: institutionalLabel(r), score: r.composite_score });
  for (const r of prerunner) add(r.ticker, { scanner: "PreRunner", label: prerunnerLabel(r), score: r.prerunner_score });

  // QFE lookup (badge only, not counted for confluence)
  const qfeMap = new Map<string, string>();
  for (const r of qfe) qfeMap.set(r.ticker, r.rating);

  // RS acceleration lookup
  const rsAccelMap = buildRsAccelMap(qfe, prerunner, institutional);

  // Sector lookup (first match wins — PreRun has widest coverage)
  const sectorMap = new Map<string, string>();
  for (const r of prerun) { if (!sectorMap.has(r.ticker)) sectorMap.set(r.ticker, r.sector); }
  for (const r of inflection) { if (!sectorMap.has(r.ticker)) sectorMap.set(r.ticker, r.sector); }
  for (const r of vcp) { if (!sectorMap.has(r.ticker)) sectorMap.set(r.ticker, r.sector); }
  for (const r of institutional) { if (!sectorMap.has(r.ticker)) sectorMap.set(r.ticker, r.sector); }
  for (const r of prerunner) { if (!sectorMap.has(r.ticker)) sectorMap.set(r.ticker, r.sector); }

  // Build consolidated list with tiers
  const tiers = new Map<number, ConsolidatedTicker[]>();

  // Only show QFE badge for high-conviction ratings (A+, A, B+)
  const QFE_SHOW_RATINGS = new Set(["A+", "A", "B+"]);

  for (const [ticker, hits] of map) {
    const qfeRating = qfeMap.get(ticker);
    if (qfeRating && QFE_SHOW_RATINGS.has(qfeRating)) {
      hits.push({ scanner: "QFE", label: `QFE ${qfeRating}`, score: 0 }); // score 0 = badge only
    }

    const NON_CONFLUENCE = new Set(["QFE", "INF_WATCH"]);
    const independentCount = hits.filter((h) => !NON_CONFLUENCE.has(h.scanner)).length;
    const maxScore = Math.max(...hits.filter((h) => !NON_CONFLUENCE.has(h.scanner)).map((h) => h.score));
    const rsAccel = rsAccelMap.get(ticker) ?? null;
    const sector = sectorMap.get(ticker) ?? null;

    const entry: ConsolidatedTicker = { ticker, hits, maxScore, rsAccel, sector, isNew: newTickerSet.has(ticker) };

    if (!tiers.has(independentCount)) tiers.set(independentCount, []);
    tiers.get(independentCount)!.push(entry);
  }

  // Sort each tier by RS acceleration DESC (nulls last), then maxScore DESC as tiebreaker
  for (const entries of tiers.values()) {
    entries.sort((a, b) => {
      const rsA = a.rsAccel ?? -999;
      const rsB = b.rsAccel ?? -999;
      if (rsA !== rsB) return rsB - rsA;
      return b.maxScore - a.maxScore;
    });
  }

  // Catalyst entries (separate section)
  const catalystEntries: ConsolidatedTicker[] = catalyst.map((r) => ({
    ticker: r.ticker,
    hits: [{ scanner: "Catalyst", label: catalystLabel(r), score: r.score }],
    maxScore: r.score,
    rsAccel: null,
    sector: null,
    isNew: false,
  }));
  catalystEntries.sort((a, b) => b.maxScore - a.maxScore);

  return { tiers, catalysts: catalystEntries };
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

// Per-tier display caps
const TIER_CAPS: Record<number, number> = {
  5: 10, // 5/5 scanners — show all (very rare)
  4: 7,  // 4/5 — top 7
  3: 5,  // 3/5 — top 5
};
const MAX_CATALYSTS = 3;
const MAX_DROPPED = 5;

/** Short sector labels for inline display — covers all 31 sector-universe.ts displayNames */
const SECTOR_SHORT: Record<string, string> = {
  "Technology": "Tech",
  "Information Technology": "Tech",
  "Software & Cloud": "SW",
  "Semiconductors": "Semi",
  "Health Care": "HC",
  "Healthcare": "HC",
  "Biotech": "Bio",
  "Financials": "Fin",
  "Regional Banks": "Bank",
  "Consumer Discretionary": "Disc",
  "Consumer Staples": "Stpl",
  "Communication Services": "Comm",
  "Industrials": "Ind",
  "Aerospace & Defense": "A&D",
  "Space & Defense Innovation": "SpDf",
  "Transports": "Trns",
  "Energy": "Enrg",
  "Materials": "Mat",
  "Real Estate": "RE",
  "Utilities": "Util",
  "Homebuilders": "Home",
  "Retail": "Rtl",
  "AI & Robotics": "AI",
  "Space": "Spce",
  "Gold": "Gold",
  "Treasuries 20Y+": "Bond",
  "High Yield Corp": "HY",
  "Emerging Markets": "EM",
  "US Dollar": "USD",
  "Magnificent 7": "MAG7",
  "Nasdaq 100": "NDX",
  "Russell 2000": "RUT",
  "ARK Innovation": "ARKK",
  "Other": "Othr",
};

function shortSector(sector: string | null): string {
  if (!sector) return "";
  return SECTOR_SHORT[sector] ?? sector.slice(0, 4);
}

/**
 * Two-line format for readability on mobile:
 * Line 1: *HUBS [RS +2.3] Tech
 * Line 2:   PR 22 (LD,ST) · INF STARTER · INST SL · QFE A+
 */
function formatTickerBlock(t: ConsolidatedTicker): string[] {
  const newBadge = t.isNew ? "*" : "";
  const rsTag = t.rsAccel != null
    ? ` [RS ${t.rsAccel > 0 ? "+" : ""}${t.rsAccel.toFixed(1)}]`
    : "";
  const sectorTag = t.sector ? ` ${shortSector(t.sector)}` : "";
  const labels = t.hits.map((h) => h.label).join(" \u00b7 ");

  return [
    `${newBadge}<b>${t.ticker}</b>${rsTag}${sectorTag}`,
    `  ${labels}`,
  ];
}

function formatNightlySummary(
  tiers: Map<number, ConsolidatedTicker[]>,
  catalysts: ConsolidatedTicker[],
  droppedTickers: string[],
  discoveryStocks: number,
  discoveryCrypto: number,
  scannerCounts: Record<string, number>,
  totalTickers: number,
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const multiCount = [...tiers.entries()]
    .filter(([count]) => count >= 2)
    .reduce((sum, [, entries]) => sum + entries.length, 0);

  const lines: string[] = [];

  // Header — merge scanner counts into one compact line
  lines.push(`<b>NIGHTLY SCAN</b> \u2014 ${date}`);
  const countParts: string[] = [];
  for (const [scanner, count] of Object.entries(scannerCounts)) {
    if (count > 0) countParts.push(`${scanner}:${count}`);
  }
  lines.push(`${totalTickers} tickers \u00b7 ${multiCount} multi | ${countParts.join(" ")}`);
  lines.push("");

  // Tiers 5 and 4 — full two-line display (highest conviction)
  for (const tierLevel of [5, 4]) {
    const entries = tiers.get(tierLevel);
    if (!entries || entries.length === 0) continue;

    const cap = TIER_CAPS[tierLevel] ?? 7;
    lines.push(`<b>\u25c6 ${tierLevel}/5 SCANNERS (${entries.length})</b>`);
    for (const t of entries.slice(0, cap)) {
      lines.push(...formatTickerBlock(t));
    }
    if (entries.length > cap) {
      lines.push(`... +${entries.length - cap} more`);
    }
    lines.push("");
  }

  // Tier 3 — two-line display with tighter cap
  const tier3 = tiers.get(3);
  if (tier3 && tier3.length > 0) {
    const cap = TIER_CAPS[3] ?? 5;
    lines.push(`<b>\u25c6 3/5 (${tier3.length})</b>`);
    for (const t of tier3.slice(0, cap)) {
      lines.push(...formatTickerBlock(t));
    }
    if (tier3.length > cap) {
      lines.push(`... +${tier3.length - cap} more`);
    }
    lines.push("");
  }

  // Tier 2 — count only (too many to list)
  const tier2Count = tiers.get(2)?.length ?? 0;
  if (tier2Count > 0) {
    // Surface new entries from tier 2
    const tier2New = (tiers.get(2) ?? []).filter((t) => t.isNew);
    if (tier2New.length > 0) {
      const newNames = tier2New.slice(0, 5).map((t) => t.ticker).join(", ");
      const extra = tier2New.length > 5 ? ` +${tier2New.length - 5}` : "";
      lines.push(`<b>2/5:</b> ${tier2Count} tickers (${tier2New.length} new: ${newNames}${extra})`);
    } else {
      lines.push(`<b>2/5:</b> ${tier2Count} tickers`);
    }
  }

  // 1-scanner count
  const singleCount = tiers.get(1)?.length ?? 0;
  if (singleCount > 0) {
    lines.push(`<b>1/5:</b> ${singleCount} tickers`);
  }
  if (tier2Count > 0 || singleCount > 0) lines.push("");

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

  // NEW — only multi-scanner new tickers (2+), sorted by tier then RS
  const multiNew: ConsolidatedTicker[] = [];
  for (const [level, entries] of tiers) {
    if (level >= 2) {
      for (const t of entries) {
        if (t.isNew) multiNew.push(t);
      }
    }
  }
  if (multiNew.length > 0) {
    const newNames = multiNew.slice(0, 8).map((t) => t.ticker).join(", ");
    const extra = multiNew.length > 8 ? ` (+${multiNew.length - 8})` : "";
    lines.push(`<b>NEW (multi):</b> ${newNames}${extra}`);
  }

  // DROPPED — capped at 5
  if (droppedTickers.length > 0) {
    const display = droppedTickers.slice(0, MAX_DROPPED).join(", ");
    const extra = droppedTickers.length > MAX_DROPPED ? ` (+${droppedTickers.length - MAX_DROPPED})` : "";
    lines.push(`<b>DROPPED:</b> ${display}${extra}`);
  }

  // Discovery
  if (discoveryStocks > 0 || discoveryCrypto > 0) {
    lines.push(`Discovery: ${discoveryStocks} stocks | ${discoveryCrypto} crypto`);
  }

  // TOP PICKS watchlist — top tickers from tier 3+ by RS accel, copyable
  const topPicks: string[] = [];
  for (const tierLevel of [5, 4, 3]) {
    const entries = tiers.get(tierLevel) ?? [];
    for (const t of entries) {
      if (topPicks.length >= 10) break;
      topPicks.push(t.ticker);
    }
    if (topPicks.length >= 10) break;
  }
  if (topPicks.length > 0) {
    lines.push("");
    lines.push(`<code>${topPicks.join(", ")}</code>`);
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

    // Build today's ticker set for new/dropped
    const todayTickers = new Set<string>();
    for (const r of prerun) todayTickers.add(r.ticker);
    for (const r of inflection) todayTickers.add(r.ticker);
    for (const r of vcp) todayTickers.add(r.ticker);
    for (const r of institutional) todayTickers.add(r.ticker);
    for (const r of prerunner) todayTickers.add(r.ticker);

    // Compute new/dropped BEFORE consolidation (so we can tag new tickers)
    const { newTickers, droppedTickers } = await computeNewDropped(today, todayTickers);
    const newTickerSet = new Set(newTickers);

    // Consolidate (QFE excluded from confluence count — derived from PreRun)
    const { tiers, catalysts } = consolidateResults(
      prerun, inflection, vcp, institutional, prerunner, qfe, catalyst, newTickerSet,
    );

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

    // Tier counts for JSON response
    const tierCounts: Record<string, number> = {};
    let multiScannerCount = 0;
    for (const [level, entries] of tiers) {
      tierCounts[`tier_${level}`] = entries.length;
      if (level >= 2) multiScannerCount += entries.length;
    }

    // Send Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    let telegramSent = false;
    if (botToken && chatId) {
      const message = formatNightlySummary(
        tiers, catalysts, droppedTickers,
        discoveryStocks, discoveryCrypto, scannerCounts, todayTickers.size,
      );
      const tgResult = await sendTelegramMessage(botToken, chatId, message);
      telegramSent = tgResult.ok;
      if (!tgResult.ok) {
        logError("api/nightly-summary/cron/telegram", new Error(tgResult.error ?? "Telegram send failed"));
      }
    }

    return NextResponse.json({
      totalTickers: todayTickers.size,
      multiScannerCount,
      tierCounts,
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
