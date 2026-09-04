/**
 * Supabase server write functions for scanner signal persistence.
 * All writes are wrapped in try/catch — failures are logged but never break scanner functionality.
 */

import "server-only";

import { createClient, createAdminClient } from "./server";

// ── Types ──

export interface SignalRecord {
  scanner: "ew" | "squeeze" | "confluence" | "prerun" | "catalyst";
  ticker: string;
  signal_date: string; // YYYY-MM-DD
  price_at_signal: number;
  mode?: string;
  signal_strength?: string;
  score?: number;
  target1?: number;
  target2?: number;
  target3?: number;
  invalidation?: number;
  days_to_earnings?: number | null;
  next_earnings_date?: string | null; // YYYY-MM-DD
  relative_strength_20d?: number | null;
}

export interface SIHistoryRecord {
  ticker: string;
  report_date: string; // YYYY-MM-DD
  si_percent: number;
  days_to_cover?: number;
  shares_short?: number;
  float_shares?: number;
  current_price?: number;
}

export interface SectorSnapshotRecord {
  snapshot_date: string; // YYYY-MM-DD
  sector: string;
  etf_symbol: string;
  rs_ratio?: number;
  rs_momentum?: number;
  quadrant?: string;
  momentum_score?: number;
  breadth_pct?: number;
}

export interface FTDRecord {
  ticker: string;
  failure_date: string; // YYYY-MM-DD
  settlement_deadline: string; // YYYY-MM-DD
  ftd_shares: number;
  ftd_pct_float?: number;
}

// ── Write Functions ──

/** Record a scanner signal for outcome tracking. Upserts on (scanner, ticker, signal_date, mode). */
export async function recordSignal(record: SignalRecord): Promise<boolean> {
  try {
    const supabase = await createClient();
    if (!supabase) return false;

    const { error } = await supabase.from("signal_outcomes").upsert(record, {
      onConflict: "scanner,ticker,signal_date,mode",
    });

    if (error) {
      console.error("[persistence] recordSignal error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[persistence] recordSignal exception:", err);
    return false;
  }
}

/** Batch record multiple signals. */
export async function recordSignalBatch(records: SignalRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = await createClient();
    if (!supabase) return 0;

    const { data, error } = await supabase.from("signal_outcomes").upsert(records, {
      onConflict: "scanner,ticker,signal_date,mode",
    }).select("id");

    if (error) {
      console.error("[persistence] recordSignalBatch error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] recordSignalBatch exception:", err);
    return 0;
  }
}

/** Batch record ALL nightly scan results (not just qualifying) for full-universe persistence.
 *  Uses mode='nightly-full' to distinguish from qualifying-only signals. */
export async function recordNightlyScanBatch(
  results: Array<{
    ticker: string;
    price: number;
    score: number;
    verdict: string;
    daysToEarnings?: number | null;
    nextEarningsDate?: string | null;
    rs20d?: number | null;
  }>
): Promise<number> {
  if (results.length === 0) return 0;

  try {
    const supabase = await createClient();
    if (!supabase) return 0;

    const today = new Date().toISOString().slice(0, 10);
    const records = results.map((r) => ({
      scanner: "prerun" as const,
      ticker: r.ticker,
      signal_date: today,
      price_at_signal: r.price,
      mode: "nightly-full",
      signal_strength: r.verdict,
      score: r.score,
      days_to_earnings: r.daysToEarnings ?? null,
      next_earnings_date: r.nextEarningsDate ?? null,
      relative_strength_20d: r.rs20d != null ? Math.round(r.rs20d * 100) / 100 : null,
    }));

    // Upsert in batches of 500 to avoid payload limits
    let upserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const { data, error } = await supabase.from("signal_outcomes").upsert(batch, {
        onConflict: "scanner,ticker,signal_date,mode",
      }).select("id");

      if (error) {
        console.error("[persistence] recordNightlyScanBatch error:", error.message);
      } else {
        upserted += data?.length ?? 0;
      }
    }
    return upserted;
  } catch (err) {
    console.error("[persistence] recordNightlyScanBatch exception:", err);
    return 0;
  }
}

/** Record SI% history for trend tracking. Upserts on (ticker, report_date). */
export async function recordSIHistory(record: SIHistoryRecord): Promise<boolean> {
  try {
    const supabase = await createClient();
    if (!supabase) return false;

    const { error } = await supabase.from("si_history").upsert(record, {
      onConflict: "ticker,report_date",
    });

    if (error) {
      console.error("[persistence] recordSIHistory error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[persistence] recordSIHistory exception:", err);
    return false;
  }
}

/** Batch record SI% history. */
export async function recordSIHistoryBatch(records: SIHistoryRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = await createClient();
    if (!supabase) return 0;

    const { data, error } = await supabase.from("si_history").upsert(records, {
      onConflict: "ticker,report_date",
    }).select("id");

    if (error) {
      console.error("[persistence] recordSIHistoryBatch error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] recordSIHistoryBatch exception:", err);
    return 0;
  }
}

/** Record a sector rotation snapshot. Upserts on (snapshot_date, sector). */
export async function recordSectorSnapshot(record: SectorSnapshotRecord): Promise<boolean> {
  try {
    const supabase = await createClient();
    if (!supabase) return false;

    const { error } = await supabase.from("sector_snapshots").upsert(record, {
      onConflict: "snapshot_date,sector",
    });

    if (error) {
      console.error("[persistence] recordSectorSnapshot error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[persistence] recordSectorSnapshot exception:", err);
    return false;
  }
}

/** Batch record sector snapshots. */
export async function recordSectorSnapshotBatch(records: SectorSnapshotRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = await createClient();
    if (!supabase) return 0;

    const { data, error } = await supabase.from("sector_snapshots").upsert(records, {
      onConflict: "snapshot_date,sector",
    }).select("id");

    if (error) {
      console.error("[persistence] recordSectorSnapshotBatch error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] recordSectorSnapshotBatch exception:", err);
    return 0;
  }
}

/** Record FTD settlement data. Upserts on (ticker, failure_date). */
export async function recordFTD(record: FTDRecord): Promise<boolean> {
  try {
    const supabase = await createClient();
    if (!supabase) return false;

    const { error } = await supabase.from("ftd_settlements").upsert(record, {
      onConflict: "ticker,failure_date",
    });

    if (error) {
      console.error("[persistence] recordFTD error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[persistence] recordFTD exception:", err);
    return false;
  }
}

/** Batch record FTD settlements. */
export async function recordFTDBatch(records: FTDRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = await createClient();
    if (!supabase) return 0;

    const { data, error } = await supabase.from("ftd_settlements").upsert(records, {
      onConflict: "ticker,failure_date",
    }).select("id");

    if (error) {
      console.error("[persistence] recordFTDBatch error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] recordFTDBatch exception:", err);
    return 0;
  }
}

/** Update signal outcomes (called by nightly cron). */
export async function updateSignalOutcome(
  id: string,
  updates: {
    price_7d?: number;
    price_30d?: number;
    price_60d?: number;
    price_90d?: number;
    hit_target1?: boolean;
    hit_target2?: boolean;
    hit_target3?: boolean;
    hit_invalidation?: boolean;
    hit_target1_date?: string;
    max_drawdown_pct?: number;
    max_gain_pct?: number;
  }
): Promise<boolean> {
  try {
    const supabase = await createClient();
    if (!supabase) return false;

    const { error } = await supabase
      .from("signal_outcomes")
      .update({ ...updates, outcome_updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("[persistence] updateSignalOutcome error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[persistence] updateSignalOutcome exception:", err);
    return false;
  }
}

/** Upsert scanner hit rates (pre-computed aggregates). */
export async function upsertHitRates(
  rates: Array<{
    scanner: string;
    mode: string | null;
    signal_strength: string | null;
    period_days: number;
    total_signals: number;
    hit_count: number;
    hit_rate: number;
    avg_return_pct: number;
    avg_max_drawdown_pct: number;
  }>
): Promise<boolean> {
  if (rates.length === 0) return true;

  try {
    const supabase = await createClient();
    if (!supabase) return false;

    const { error } = await supabase.from("scanner_hit_rates").upsert(
      rates.map((r) => ({ ...r, computed_at: new Date().toISOString() })),
      { onConflict: "scanner,mode,signal_strength,period_days" }
    );

    if (error) {
      console.error("[persistence] upsertHitRates error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[persistence] upsertHitRates exception:", err);
    return false;
  }
}

// ── Institutional Ownership Cache ──

export interface InstitutionalCacheRecord {
  symbol: string;
  institutional_pct: number | null;
}

/** Upsert institutional ownership cache records. */
export async function upsertInstitutionalCache(records: InstitutionalCacheRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[persistence] upsertInstitutionalCache: no admin client (missing SUPABASE_SERVICE_ROLE_KEY)");
      return 0;
    }

    const rows = records
      .filter((r) => r.institutional_pct != null)
      .map((r) => ({
        symbol: r.symbol,
        institutional_pct: r.institutional_pct,
        last_updated: new Date().toISOString(),
      }));

    if (rows.length === 0) return 0;

    const { data, error } = await supabase
      .from("stock_institutional_cache")
      .upsert(rows, { onConflict: "symbol" })
      .select("id");

    if (error) {
      console.error("[persistence] upsertInstitutionalCache error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] upsertInstitutionalCache exception:", err);
    return 0;
  }
}

/** Load institutional ownership from cache for given symbols. */
export async function loadInstitutionalCache(symbols: string[]): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  if (symbols.length === 0) return result;

  try {
    const supabase = createAdminClient();
    if (!supabase) return result;

    const { data, error } = await supabase
      .from("stock_institutional_cache")
      .select("symbol, institutional_pct")
      .in("symbol", symbols);

    if (error) {
      console.error("[persistence] loadInstitutionalCache error:", error.message);
      return result;
    }

    for (const row of data ?? []) {
      result.set(row.symbol, row.institutional_pct);
    }
    return result;
  } catch (err) {
    console.error("[persistence] loadInstitutionalCache exception:", err);
    return result;
  }
}

/** Get symbols where institutional data is stale (older than maxAgeDays). */
export async function getStaleInstitutionalSymbols(maxAgeDays: number): Promise<string[]> {
  try {
    const supabase = await createClient();
    if (!supabase) return [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);

    const { data, error } = await supabase
      .from("stock_institutional_cache")
      .select("symbol")
      .lt("last_updated", cutoff.toISOString());

    if (error) {
      console.error("[persistence] getStaleInstitutionalSymbols error:", error.message);
      return [];
    }
    return (data ?? []).map((r) => r.symbol);
  } catch (err) {
    console.error("[persistence] getStaleInstitutionalSymbols exception:", err);
    return [];
  }
}

// ── Inflection Daily Scan ──

export interface InflectionDailyRecord {
  scan_date: string;         // YYYY-MM-DD
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  overall_score: number;
  /** V3 Supply Exhaustion (was Seller Exhaustion) */
  se_score: number;
  /** V3 Compression (column retained from Volatility Compression) */
  vc_score: number;
  /** V3 RS Trajectory */
  rs_score: number;
  /** V3 Demand Emergence — replaces be_score */
  demand_score?: number;
  /** V3 Runner Potential — new dimension, no V2 equivalent */
  runner_score?: number;
  /** Scoring engine version; delta/comparison logic must not mix versions. */
  scanner_version?: number;
  /** Pre-move tier: supply exhausted, compressed, real Runner Potential, not yet moving. */
  is_coiled?: boolean;
  /** Share of the composite weight that was measurable, 0-100. Below ~70 the score rests
   *  on thin data and is not comparable to a fully-measured row. */
  measured_pct?: number;
  /** Legacy V2 columns, no longer written (DB default 0): be_score, la_score, ip_score */
  be_score?: number;
  la_score?: number;
  ip_score?: number;
  stage: string;
  trade_read: string;
  extension_risk: boolean;
  is_primary: boolean;
  is_stronger: boolean;
  bullish_evidence: string[];
  caution_evidence: string[];
  /** Per-slot breakdown keyed by component, e.g. { demand: [{label,earned,possible,hasData,pct}] }.
   *  Diagnostics only - no score depends on it. Labels are schema. */
  component_slots?: Record<string, Array<{ label: string; earned: number; possible: number; hasData: boolean; pct: number | null }>>;
  invalidation: number | null;
}

/** Batch upsert inflection daily scan results. Upserts 500 at a time on (scan_date, ticker). */
export async function upsertInflectionDaily(records: InflectionDailyRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[persistence] upsertInflectionDaily: no admin client");
      return 0;
    }

    let upserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const { data, error } = await supabase
        .from("inflection_daily")
        .upsert(batch, { onConflict: "scan_date,ticker" })
        .select("id");

      if (error) {
        console.error("[persistence] upsertInflectionDaily error:", error.message);
      } else {
        upserted += data?.length ?? 0;
      }
    }
    return upserted;
  } catch (err) {
    console.error("[persistence] upsertInflectionDaily exception:", err);
    return 0;
  }
}

/** Delete inflection_daily rows older than retentionDays. */
export async function purgeOldInflectionDaily(retentionDays = 14): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("inflection_daily")
      .delete()
      .lt("scan_date", cutoffStr)
      .select("id");

    if (error) {
      console.error("[persistence] purgeOldInflectionDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] purgeOldInflectionDaily exception:", err);
    return 0;
  }
}

/** Delete all inflection_daily rows for a date, for a clean re-scan (?clear=true). */
export async function clearInflectionDaily(date: string): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const { data, error } = await supabase
      .from("inflection_daily")
      .delete()
      .eq("scan_date", date)
      .select("id");

    if (error) {
      console.error("[persistence] clearInflectionDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] clearInflectionDaily exception:", err);
    return 0;
  }
}

/** Load inflection daily results for a given date. */
export async function loadInflectionDaily(date: string): Promise<InflectionDailyRecord[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inflection_daily")
      .select("*")
      .eq("scan_date", date)
      .order("overall_score", { ascending: false });

    if (error) {
      console.error("[persistence] loadInflectionDaily error:", error.message);
      return [];
    }
    return (data ?? []) as InflectionDailyRecord[];
  } catch (err) {
    console.error("[persistence] loadInflectionDaily exception:", err);
    return [];
  }
}

/** Load available scan dates (up to limit, most recent first). */
/**
 * PostgREST caps a single select at 1000 rows no matter what .limit() asks for, so any
 * query that scans a whole scan table has to page. The date helpers below select only
 * scan_date and dedupe, but at ~350 rows per scan a single page covers under three days
 * — which silently truncated every date picker in the app to the last few scans.
 */
const SCAN_PAGE_SIZE = 1000;

async function loadDistinctScanDates(table: string, limit: number): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const seen: string[] = [];
    const unique = new Set<string>();

    for (let page = 0; page < 32; page++) {
      const from = page * SCAN_PAGE_SIZE;
      const { data, error } = await supabase
        .from(table)
        .select("scan_date")
        .order("scan_date", { ascending: false })
        .range(from, from + SCAN_PAGE_SIZE - 1);

      if (error) {
        console.error(`[persistence] loadDistinctScanDates(${table}) error:`, error.message);
        break;
      }
      const rows = data ?? [];
      for (const r of rows) {
        const d = r.scan_date as string;
        if (!unique.has(d)) {
          unique.add(d);
          seen.push(d);
          if (seen.length >= limit) return seen;
        }
      }
      // A short page is the last page.
      if (rows.length < SCAN_PAGE_SIZE) break;
    }
    return seen;
  } catch (err) {
    console.error(`[persistence] loadDistinctScanDates(${table}) exception:`, err);
    return [];
  }
}

export async function loadInflectionDailyDates(limit = 14): Promise<string[]> {
  return loadDistinctScanDates("inflection_daily", limit);
}

/** Load inflection daily results for multiple dates (for streak/delta computation).
 *  Returns only ticker, scan_date, overall_score to keep payload small. */
export async function loadInflectionDailyMulti(
  dates: string[]
): Promise<Array<{ scan_date: string; ticker: string; overall_score: number; scanner_version: number }>> {
  if (dates.length === 0) return [];

  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inflection_daily")
      .select("scan_date, ticker, overall_score, scanner_version")
      .in("scan_date", dates)
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadInflectionDailyMulti error:", error.message);
      return [];
    }
    return (data ?? []) as Array<{ scan_date: string; ticker: string; overall_score: number; scanner_version: number }>;
  } catch (err) {
    console.error("[persistence] loadInflectionDailyMulti exception:", err);
    return [];
  }
}

// ── PreRun Daily Scan (Standard scoring — 6 presets) ──

export interface PreRunDailyRecord {
  scan_date: string;
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  market_cap: number | null;
  pct_from_ath: number | null;
  short_float: number | null;
  final_score: number;
  total_score: number;
  score_a: number;
  score_b: number;
  score_c: number;
  score_d: number;
  score_e: number;
  score_f: number;
  score_g: number;
  score_h: number;
  score_i: number;
  score_j: number;
  score_k: number;
  score_l: number;
  score_m: number;
  score_m2: number;
  score_n: number;
  score_o: number;
  score_p: number;
  score_q: number;
  sector_modifier: number;
  sector_quadrant_modifier: number;
  gate1: boolean;
  gate2: boolean;
  gate3: boolean;
  verdict: string;
  obv_divergent: boolean;
  vp_divergence_bullish: boolean;
  higher_lows_count: number | null;
  rrg_quadrant: string | null;
  is_sndk: boolean;
  is_early_mover: boolean;
  is_pullback: boolean;
  is_leading: boolean;
  is_stealth: boolean;
  is_early_plus: boolean;
}

/** Batch upsert prerun daily scan results. */
export async function upsertPreRunDaily(records: PreRunDailyRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[persistence] upsertPreRunDaily: no admin client");
      return 0;
    }

    let upserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const { data, error } = await supabase
        .from("prerun_daily")
        .upsert(batch, { onConflict: "scan_date,ticker" })
        .select("id");

      if (error) {
        console.error("[persistence] upsertPreRunDaily error:", error.message);
      } else {
        upserted += data?.length ?? 0;
      }
    }
    return upserted;
  } catch (err) {
    console.error("[persistence] upsertPreRunDaily exception:", err);
    return 0;
  }
}

/** Delete prerun_daily rows older than retentionDays. */
export async function purgeOldPreRunDaily(retentionDays = 14): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("prerun_daily")
      .delete()
      .lt("scan_date", cutoffStr)
      .select("id");

    if (error) {
      console.error("[persistence] purgeOldPreRunDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] purgeOldPreRunDaily exception:", err);
    return 0;
  }
}

/** Delete all prerun daily results for a specific date. */
export async function clearPreRunDaily(date: string): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const { data, error } = await supabase
      .from("prerun_daily")
      .delete()
      .eq("scan_date", date)
      .select("id");

    if (error) {
      console.error("[persistence] clearPreRunDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] clearPreRunDaily exception:", err);
    return 0;
  }
}

/** Load prerun daily results for a given date. */
export async function loadPreRunDaily(date: string): Promise<PreRunDailyRecord[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("prerun_daily")
      .select("*")
      .eq("scan_date", date)
      .order("final_score", { ascending: false });

    if (error) {
      console.error("[persistence] loadPreRunDaily error:", error.message);
      return [];
    }
    return (data ?? []) as PreRunDailyRecord[];
  } catch (err) {
    console.error("[persistence] loadPreRunDaily exception:", err);
    return [];
  }
}

/** Load just the ticker list for a given date (lightweight, for resume). */
export async function loadPreRunDailyTickers(date: string): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("prerun_daily")
      .select("ticker")
      .eq("scan_date", date);

    if (error) {
      console.error("[persistence] loadPreRunDailyTickers error:", error.message);
      return [];
    }
    return (data ?? []).map((r) => r.ticker as string);
  } catch (err) {
    console.error("[persistence] loadPreRunDailyTickers exception:", err);
    return [];
  }
}

/** Load available prerun daily scan dates. */
export async function loadPreRunDailyDates(limit = 14): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("prerun_daily")
      .select("scan_date")
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadPreRunDailyDates error:", error.message);
      return [];
    }

    const unique = [...new Set((data ?? []).map((r) => r.scan_date as string))];
    return unique.slice(0, limit);
  } catch (err) {
    console.error("[persistence] loadPreRunDailyDates exception:", err);
    return [];
  }
}

/** Load prerun daily results for multiple dates (for streak/delta).
 *  Returns lightweight rows with score + preset flags. */
export async function loadPreRunDailyMulti(
  dates: string[]
): Promise<Array<{ scan_date: string; ticker: string; final_score: number; is_sndk: boolean; is_early_mover: boolean; is_pullback: boolean; is_leading: boolean; is_stealth: boolean; is_early_plus: boolean }>> {
  if (dates.length === 0) return [];

  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("prerun_daily")
      .select("scan_date, ticker, final_score, is_sndk, is_early_mover, is_pullback, is_leading, is_stealth, is_early_plus")
      .in("scan_date", dates)
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadPreRunDailyMulti error:", error.message);
      return [];
    }
    return (data ?? []) as Array<{ scan_date: string; ticker: string; final_score: number; is_sndk: boolean; is_early_mover: boolean; is_pullback: boolean; is_leading: boolean; is_stealth: boolean; is_early_plus: boolean }>;
  } catch (err) {
    console.error("[persistence] loadPreRunDailyMulti exception:", err);
    return [];
  }
}

// ── PreRun 4h Daily Scan ──
// Same schema as prerun_daily, separate table for 4h-timeframe scanner.

/** Batch upsert prerun 4h daily scan results. */
export async function upsertPreRun4hDaily(records: PreRunDailyRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[persistence] upsertPreRun4hDaily: no admin client");
      return 0;
    }

    let upserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const { data, error } = await supabase
        .from("prerun_4h_daily")
        .upsert(batch, { onConflict: "scan_date,ticker" })
        .select("id");

      if (error) {
        console.error("[persistence] upsertPreRun4hDaily error:", error.message);
      } else {
        upserted += data?.length ?? 0;
      }
    }
    return upserted;
  } catch (err) {
    console.error("[persistence] upsertPreRun4hDaily exception:", err);
    return 0;
  }
}

/** Delete prerun_4h_daily rows older than retentionDays. */
export async function purgeOldPreRun4hDaily(retentionDays = 14): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("prerun_4h_daily")
      .delete()
      .lt("scan_date", cutoffStr)
      .select("id");

    if (error) {
      console.error("[persistence] purgeOldPreRun4hDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] purgeOldPreRun4hDaily exception:", err);
    return 0;
  }
}

/** Delete all prerun 4h daily results for a specific date. */
export async function clearPreRun4hDaily(date: string): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const { data, error } = await supabase
      .from("prerun_4h_daily")
      .delete()
      .eq("scan_date", date)
      .select("id");

    if (error) {
      console.error("[persistence] clearPreRun4hDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] clearPreRun4hDaily exception:", err);
    return 0;
  }
}

/** Load prerun 4h daily results for a given date. */
export async function loadPreRun4hDaily(date: string): Promise<PreRunDailyRecord[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("prerun_4h_daily")
      .select("*")
      .eq("scan_date", date)
      .order("final_score", { ascending: false });

    if (error) {
      console.error("[persistence] loadPreRun4hDaily error:", error.message);
      return [];
    }
    return (data ?? []) as PreRunDailyRecord[];
  } catch (err) {
    console.error("[persistence] loadPreRun4hDaily exception:", err);
    return [];
  }
}

/** Load just the ticker list for a given date (lightweight, for resume). */
export async function loadPreRun4hDailyTickers(date: string): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("prerun_4h_daily")
      .select("ticker")
      .eq("scan_date", date);

    if (error) {
      console.error("[persistence] loadPreRun4hDailyTickers error:", error.message);
      return [];
    }
    return (data ?? []).map((r) => r.ticker as string);
  } catch (err) {
    console.error("[persistence] loadPreRun4hDailyTickers exception:", err);
    return [];
  }
}

/** Load available prerun 4h daily scan dates. */
export async function loadPreRun4hDailyDates(limit = 14): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("prerun_4h_daily")
      .select("scan_date")
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadPreRun4hDailyDates error:", error.message);
      return [];
    }

    const unique = [...new Set((data ?? []).map((r) => r.scan_date as string))];
    return unique.slice(0, limit);
  } catch (err) {
    console.error("[persistence] loadPreRun4hDailyDates exception:", err);
    return [];
  }
}

/** Load prerun 4h daily results for multiple dates (for streak/delta). */
export async function loadPreRun4hDailyMulti(
  dates: string[]
): Promise<Array<{ scan_date: string; ticker: string; final_score: number; is_sndk: boolean; is_early_mover: boolean; is_pullback: boolean; is_leading: boolean; is_stealth: boolean; is_early_plus: boolean }>> {
  if (dates.length === 0) return [];

  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("prerun_4h_daily")
      .select("scan_date, ticker, final_score, is_sndk, is_early_mover, is_pullback, is_leading, is_stealth, is_early_plus")
      .in("scan_date", dates)
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadPreRun4hDailyMulti error:", error.message);
      return [];
    }
    return (data ?? []) as Array<{ scan_date: string; ticker: string; final_score: number; is_sndk: boolean; is_early_mover: boolean; is_pullback: boolean; is_leading: boolean; is_stealth: boolean; is_early_plus: boolean }>;
  } catch (err) {
    console.error("[persistence] loadPreRun4hDailyMulti exception:", err);
    return [];
  }
}

// ── VCP Daily Scan ──

export interface VCPDailyRecord {
  scan_date: string;
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  total_score: number;
  trend_score: number;
  volume_score: number;
  compression_score: number;
  rel_strength_score: number;
  risk_quality_score: number;
  phase: string;
  pivot_high: number | null;
  atr_pct: number | null;
  dist_from_sma50_pct: number | null;
  dry_volume_days: number | null;
  tight_closes: boolean | null;
  inside_bar_count: number | null;
  entry: number | null;
  stop: number | null;
  target_2r: number | null;
  target_3r: number | null;
  sma10_exit: number | null;
}

/** Batch upsert VCP daily scan results. */
export async function upsertVCPDaily(records: VCPDailyRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[persistence] upsertVCPDaily: no admin client");
      return 0;
    }

    let upserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const { data, error } = await supabase
        .from("vcp_daily")
        .upsert(batch, { onConflict: "scan_date,ticker" })
        .select("id");

      if (error) {
        console.error("[persistence] upsertVCPDaily error:", error.message);
      } else {
        upserted += data?.length ?? 0;
      }
    }
    return upserted;
  } catch (err) {
    console.error("[persistence] upsertVCPDaily exception:", err);
    return 0;
  }
}

/** Delete vcp_daily rows older than retentionDays. */
export async function purgeOldVCPDaily(retentionDays = 14): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("vcp_daily")
      .delete()
      .lt("scan_date", cutoffStr)
      .select("id");

    if (error) {
      console.error("[persistence] purgeOldVCPDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] purgeOldVCPDaily exception:", err);
    return 0;
  }
}

/** Load VCP daily results for a given date. */
export async function loadVCPDaily(date: string): Promise<VCPDailyRecord[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("vcp_daily")
      .select("*")
      .eq("scan_date", date)
      .order("total_score", { ascending: false });

    if (error) {
      console.error("[persistence] loadVCPDaily error:", error.message);
      return [];
    }
    return (data ?? []) as VCPDailyRecord[];
  } catch (err) {
    console.error("[persistence] loadVCPDaily exception:", err);
    return [];
  }
}

/** Load available VCP daily scan dates. */
export async function loadVCPDailyDates(limit = 14): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("vcp_daily")
      .select("scan_date")
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadVCPDailyDates error:", error.message);
      return [];
    }

    const unique = [...new Set((data ?? []).map((r) => r.scan_date as string))];
    return unique.slice(0, limit);
  } catch (err) {
    console.error("[persistence] loadVCPDailyDates exception:", err);
    return [];
  }
}

/** Load VCP daily results for multiple dates (for streak/delta). */
export async function loadVCPDailyMulti(
  dates: string[]
): Promise<Array<{ scan_date: string; ticker: string; total_score: number }>> {
  if (dates.length === 0) return [];

  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("vcp_daily")
      .select("scan_date, ticker, total_score")
      .in("scan_date", dates)
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadVCPDailyMulti error:", error.message);
      return [];
    }
    return (data ?? []) as Array<{ scan_date: string; ticker: string; total_score: number }>;
  } catch (err) {
    console.error("[persistence] loadVCPDailyMulti exception:", err);
    return [];
  }
}

// ── Institutional Daily Scan ──

export interface InstitutionalDailyRecord {
  scan_date: string;
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  composite_score: number;
  institutional_score: number;
  execution_score: number;
  risk_score: number;
  discipline_score: number;
  classification: string;
  entry_quality: string | null;
  best_trigger: string | null;
  tier: string | null;
  avoid_reason: string | null;
  commentary_summary: string | null;
  rs_accel_spy: number | null;
  rs_accel_qqq: number | null;
  gap_pct: number | null;
  dist_from_ema20_atr: number | null;
}

/** Batch upsert institutional daily scan results. */
export async function upsertInstitutionalDaily(records: InstitutionalDailyRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[persistence] upsertInstitutionalDaily: no admin client");
      return 0;
    }

    let upserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const { data, error } = await supabase
        .from("institutional_daily")
        .upsert(batch, { onConflict: "scan_date,ticker" })
        .select("id");

      if (error) {
        console.error("[persistence] upsertInstitutionalDaily error:", error.message);
      } else {
        upserted += data?.length ?? 0;
      }
    }
    return upserted;
  } catch (err) {
    console.error("[persistence] upsertInstitutionalDaily exception:", err);
    return 0;
  }
}

/** Delete institutional_daily rows older than retentionDays. */
export async function purgeOldInstitutionalDaily(retentionDays = 14): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("institutional_daily")
      .delete()
      .lt("scan_date", cutoffStr)
      .select("id");

    if (error) {
      console.error("[persistence] purgeOldInstitutionalDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] purgeOldInstitutionalDaily exception:", err);
    return 0;
  }
}

/** Load institutional daily results for a given date. */
export async function loadInstitutionalDaily(date: string): Promise<InstitutionalDailyRecord[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("institutional_daily")
      .select("*")
      .eq("scan_date", date)
      .order("composite_score", { ascending: false });

    if (error) {
      console.error("[persistence] loadInstitutionalDaily error:", error.message);
      return [];
    }
    return (data ?? []) as InstitutionalDailyRecord[];
  } catch (err) {
    console.error("[persistence] loadInstitutionalDaily exception:", err);
    return [];
  }
}

/** Load available institutional daily scan dates. */
export async function loadInstitutionalDailyDates(limit = 14): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("institutional_daily")
      .select("scan_date")
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadInstitutionalDailyDates error:", error.message);
      return [];
    }

    const unique = [...new Set((data ?? []).map((r) => r.scan_date as string))];
    return unique.slice(0, limit);
  } catch (err) {
    console.error("[persistence] loadInstitutionalDailyDates exception:", err);
    return [];
  }
}

/** Load institutional daily results for multiple dates (for streak/delta). */
export async function loadInstitutionalDailyMulti(
  dates: string[]
): Promise<Array<{ scan_date: string; ticker: string; composite_score: number }>> {
  if (dates.length === 0) return [];

  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("institutional_daily")
      .select("scan_date, ticker, composite_score")
      .in("scan_date", dates)
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadInstitutionalDailyMulti error:", error.message);
      return [];
    }
    return (data ?? []) as Array<{ scan_date: string; ticker: string; composite_score: number }>;
  } catch (err) {
    console.error("[persistence] loadInstitutionalDailyMulti exception:", err);
    return [];
  }
}

// ── QFE Daily Scan ──

export interface QFEDailyRecord {
  scan_date: string;
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  market_cap: number | null;
  qfe_score: number;
  quality_score: number;
  leadership_score: number;
  entry_score: number;
  market_env_score: number;
  rating: string;
  action: string;
  risk_level: string;
  extension_level: string;
  rs_5d_spy: number | null;
  rs_10d_spy: number | null;
  rs_20d_spy: number | null;
  rs_50d_spy: number | null;
  rs_5d_qqq: number | null;
  rs_10d_qqq: number | null;
  rs_20d_qqq: number | null;
  rs_50d_qqq: number | null;
  rs_5d_sector: number | null;
  rs_10d_sector: number | null;
  rs_20d_sector: number | null;
  rs_50d_sector: number | null;
  money_flow_persistence: number | null;
  rvol_trajectory: number | null;
  float_rotation: number | null;
  weekly_reversal: boolean;
  dist_from_ema10_atr: number | null;
  dist_from_ema20_atr: number | null;
  commentary: string | null;
  source_presets: string[];
  data_quality: number | null;
  market_env_detail: Record<string, unknown> | null;
}

/** Batch upsert QFE daily scan results. */
export async function upsertQFEDaily(records: QFEDailyRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[persistence] upsertQFEDaily: no admin client");
      return 0;
    }

    let upserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const { data, error } = await supabase
        .from("qfe_daily")
        .upsert(batch, { onConflict: "scan_date,ticker" })
        .select("id");

      if (error) {
        console.error("[persistence] upsertQFEDaily error:", error.message);
      } else {
        upserted += data?.length ?? 0;
      }
    }
    return upserted;
  } catch (err) {
    console.error("[persistence] upsertQFEDaily exception:", err);
    return 0;
  }
}

/** Delete qfe_daily rows older than retentionDays. */
export async function purgeOldQFEDaily(retentionDays = 14): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("qfe_daily")
      .delete()
      .lt("scan_date", cutoffStr)
      .select("id");

    if (error) {
      console.error("[persistence] purgeOldQFEDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] purgeOldQFEDaily exception:", err);
    return 0;
  }
}

/** Delete all QFE daily results for a specific date. */
export async function clearQFEDaily(date: string): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const { data, error } = await supabase
      .from("qfe_daily")
      .delete()
      .eq("scan_date", date)
      .select("id");

    if (error) {
      console.error("[persistence] clearQFEDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] clearQFEDaily exception:", err);
    return 0;
  }
}

/** Load QFE daily results for a given date. */
export async function loadQFEDaily(date: string): Promise<QFEDailyRecord[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("qfe_daily")
      .select("*")
      .eq("scan_date", date)
      .order("qfe_score", { ascending: false });

    if (error) {
      console.error("[persistence] loadQFEDaily error:", error.message);
      return [];
    }
    return (data ?? []) as QFEDailyRecord[];
  } catch (err) {
    console.error("[persistence] loadQFEDaily exception:", err);
    return [];
  }
}

/** Load just the ticker list for a given date (lightweight, for resume). */
export async function loadQFEDailyTickers(date: string): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("qfe_daily")
      .select("ticker")
      .eq("scan_date", date);

    if (error) {
      console.error("[persistence] loadQFEDailyTickers error:", error.message);
      return [];
    }
    return (data ?? []).map((r) => r.ticker as string);
  } catch (err) {
    console.error("[persistence] loadQFEDailyTickers exception:", err);
    return [];
  }
}

/** Load available QFE daily scan dates. */
export async function loadQFEDailyDates(limit = 14): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("qfe_daily")
      .select("scan_date")
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadQFEDailyDates error:", error.message);
      return [];
    }

    const unique = [...new Set((data ?? []).map((r) => r.scan_date as string))];
    return unique.slice(0, limit);
  } catch (err) {
    console.error("[persistence] loadQFEDailyDates exception:", err);
    return [];
  }
}

/** Load QFE daily results for multiple dates (for streak/delta). */
export async function loadQFEDailyMulti(
  dates: string[]
): Promise<Array<{ scan_date: string; ticker: string; qfe_score: number; rating: string; action: string }>> {
  if (dates.length === 0) return [];

  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("qfe_daily")
      .select("scan_date, ticker, qfe_score, rating, action")
      .in("scan_date", dates)
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadQFEDailyMulti error:", error.message);
      return [];
    }
    return (data ?? []) as Array<{ scan_date: string; ticker: string; qfe_score: number; rating: string; action: string }>;
  } catch (err) {
    console.error("[persistence] loadQFEDailyMulti exception:", err);
    return [];
  }
}

// ── QFE Forward Return Backfill ──

export interface QFEForwardReturnRow {
  scan_date: string;
  ticker: string;
  price: number;
}

/** Load QFE rows that need forward return backfill for a specific lookback (1d, 5d, or 10d). */
export async function loadQFEPendingForwardReturns(
  scanDate: string,
  column: "fwd_1d_pct" | "fwd_5d_pct" | "fwd_10d_pct",
): Promise<QFEForwardReturnRow[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("qfe_daily")
      .select("scan_date, ticker, price")
      .eq("scan_date", scanDate)
      .is(column, null);

    if (error) {
      console.error(`[persistence] loadQFEPendingForwardReturns(${column}) error:`, error.message);
      return [];
    }
    return (data ?? []) as QFEForwardReturnRow[];
  } catch (err) {
    console.error(`[persistence] loadQFEPendingForwardReturns(${column}) exception:`, err);
    return [];
  }
}

// ── Pre-Runner Radar Daily ──

export interface PreRunnerDailyRecord {
  scan_date: string;
  ticker: string;
  company_name: string | null;
  type: string;
  prerunner_score: number;
  price: number;
  rs_acceleration: number;
  rs_improving: boolean;
  rs_delta: number;
  sector: string;
  sector_etf: string;
  sector_quadrant: string | null;
  sector_composite: number | null;
  lifecycle: string | null;
  rotation_days_active: number | null;
  volume_ratio: number | null;
  regime_alignment: string | null;
  conviction: string | null;
  performance_pct: number | null;
  above_sma50: boolean;
  volume_consistency: number | null;
  trend_accel: number | null;
}

/** Batch upsert pre-runner daily results. */
export async function upsertPreRunnerDaily(records: PreRunnerDailyRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[persistence] upsertPreRunnerDaily: no admin client");
      return 0;
    }

    let upserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const { data, error } = await supabase
        .from("prerunner_daily")
        .upsert(batch, { onConflict: "scan_date,ticker" })
        .select("id");

      if (error) {
        console.error("[persistence] upsertPreRunnerDaily error:", error.message);
      } else {
        upserted += data?.length ?? 0;
      }
    }
    return upserted;
  } catch (err) {
    console.error("[persistence] upsertPreRunnerDaily exception:", err);
    return 0;
  }
}

/** Delete prerunner_daily rows older than retentionDays. */
export async function purgeOldPreRunnerDaily(retentionDays = 14): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("prerunner_daily")
      .delete()
      .lt("scan_date", cutoffStr)
      .select("id");

    if (error) {
      console.error("[persistence] purgeOldPreRunnerDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] purgeOldPreRunnerDaily exception:", err);
    return 0;
  }
}

/** Load pre-runner daily results for a given date. */
export async function loadPreRunnerDaily(date: string): Promise<PreRunnerDailyRecord[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("prerunner_daily")
      .select("*")
      .eq("scan_date", date)
      .order("prerunner_score", { ascending: false });

    if (error) {
      console.error("[persistence] loadPreRunnerDaily error:", error.message);
      return [];
    }
    return (data ?? []) as PreRunnerDailyRecord[];
  } catch (err) {
    console.error("[persistence] loadPreRunnerDaily exception:", err);
    return [];
  }
}

/** Delete all pre-runner daily results for a specific date. */
export async function clearPreRunnerDaily(date: string): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const { data, error } = await supabase
      .from("prerunner_daily")
      .delete()
      .eq("scan_date", date)
      .select("id");

    if (error) {
      console.error("[persistence] clearPreRunnerDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] clearPreRunnerDaily exception:", err);
    return 0;
  }
}

/** Load available pre-runner daily scan dates. */
export async function loadPreRunnerDailyDates(limit = 14): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("prerunner_daily")
      .select("scan_date")
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadPreRunnerDailyDates error:", error.message);
      return [];
    }

    const unique = [...new Set((data ?? []).map((r) => r.scan_date as string))];
    return unique.slice(0, limit);
  } catch (err) {
    console.error("[persistence] loadPreRunnerDailyDates exception:", err);
    return [];
  }
}

/** Load lightweight prerunner_daily rows for multiple dates (streaks/deltas). */
export async function loadPreRunnerDailyMulti(
  dates: string[]
): Promise<Array<{ scan_date: string; ticker: string; prerunner_score: number }>> {
  if (dates.length === 0) return [];

  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("prerunner_daily")
      .select("scan_date, ticker, prerunner_score")
      .in("scan_date", dates)
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadPreRunnerDailyMulti error:", error.message);
      return [];
    }
    return (data ?? []) as Array<{ scan_date: string; ticker: string; prerunner_score: number }>;
  } catch (err) {
    console.error("[persistence] loadPreRunnerDailyMulti exception:", err);
    return [];
  }
}

/** Update forward return for a batch of QFE rows. */
export async function updateQFEForwardReturns(
  updates: { scan_date: string; ticker: string; fwd_pct: number }[],
  column: "fwd_1d_pct" | "fwd_5d_pct" | "fwd_10d_pct",
): Promise<number> {
  if (updates.length === 0) return 0;
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    let updated = 0;
    for (const u of updates) {
      const { error } = await supabase
        .from("qfe_daily")
        .update({ [column]: u.fwd_pct, fwd_return_updated_at: new Date().toISOString() })
        .eq("scan_date", u.scan_date)
        .eq("ticker", u.ticker);

      if (!error) updated++;
    }
    return updated;
  } catch (err) {
    console.error(`[persistence] updateQFEForwardReturns(${column}) exception:`, err);
    return 0;
  }
}

// ── Transition Daily Scan ──

export interface TransitionDailyRecord {
  scan_date: string;
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  overall_score: number;
  /** V3 Supply Exhaustion */
  se_score: number;
  /** V3 Compression */
  compression_score: number;
  /** V3 RS Trajectory */
  rs_score: number;
  /** V3 Structure — ChoCH + BOS merged */
  structure_score?: number;
  /** V3 Demand Emergence — replaces accum_score + volume_score */
  demand_score?: number;
  /** V3 Runner Potential — new dimension, no V2 equivalent */
  runner_score?: number;
  /** Legacy V2 columns, no longer written (DB default 0) */
  accum_score?: number;
  choch_score?: number;
  bos_score?: number;
  hl_score?: number;
  volume_score?: number;
  state: string;
  alert_state: string;
  trigger_level: number | null;
  invalidation: number | null;
  is_primary: boolean;
  is_stronger: boolean;
  /** Near ATH or stretched from EMA20 — blocks TRIGGERED and isPrimarySignal. */
  extension_risk?: boolean;
  /** False when the OHLC series was too short to run ChoCH/BOS detection. */
  structure_available?: boolean;
  /** Pre-break high-conviction setup — the tier that catches a move before it starts. */
  is_coiled?: boolean;
  /** Share of the composite weight that was measurable, 0-100. Below ~70 the score rests
   *  on thin data and is not comparable to a fully-measured row. */
  measured_pct?: number;
  /** Scoring engine version; delta/comparison logic must not mix versions. */
  scanner_version?: number;
  /** Per-slot breakdown keyed by component, e.g. { demand: [{label,earned,possible,hasData,pct}] }.
   *  Diagnostics only - no score depends on it. Labels are schema. */
  component_slots?: Record<string, Array<{ label: string; earned: number; possible: number; hasData: boolean; pct: number | null }>>;
  bullish_evidence: string[];
  caution_evidence: string[];
}

/** Batch upsert transition daily scan results. */
export async function upsertTransitionDaily(records: TransitionDailyRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[persistence] upsertTransitionDaily: no admin client");
      return 0;
    }

    let upserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const { data, error } = await supabase
        .from("transition_daily")
        .upsert(batch, { onConflict: "scan_date,ticker" })
        .select("id");

      if (error) {
        console.error("[persistence] upsertTransitionDaily error:", error.message);
      } else {
        upserted += data?.length ?? 0;
      }
    }
    return upserted;
  } catch (err) {
    console.error("[persistence] upsertTransitionDaily exception:", err);
    return 0;
  }
}

/** Delete transition_daily rows older than retentionDays. */
export async function purgeOldTransitionDaily(retentionDays = 14): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("transition_daily")
      .delete()
      .lt("scan_date", cutoffStr)
      .select("id");

    if (error) {
      console.error("[persistence] purgeOldTransitionDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] purgeOldTransitionDaily exception:", err);
    return 0;
  }
}

/** Delete all transition daily results for a specific date. */
export async function clearTransitionDaily(date: string): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const { data, error } = await supabase
      .from("transition_daily")
      .delete()
      .eq("scan_date", date)
      .select("id");

    if (error) {
      console.error("[persistence] clearTransitionDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] clearTransitionDaily exception:", err);
    return 0;
  }
}

/** Load transition daily results for a given date. */
export async function loadTransitionDaily(date: string): Promise<TransitionDailyRecord[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("transition_daily")
      .select("*")
      .eq("scan_date", date)
      .order("overall_score", { ascending: false });

    if (error) {
      console.error("[persistence] loadTransitionDaily error:", error.message);
      return [];
    }
    return (data ?? []) as TransitionDailyRecord[];
  } catch (err) {
    console.error("[persistence] loadTransitionDaily exception:", err);
    return [];
  }
}

/** Load available scan dates (up to limit, most recent first). */
export async function loadTransitionDailyDates(limit = 14): Promise<string[]> {
  return loadDistinctScanDates("transition_daily", limit);
}

/** Load transition daily results for multiple dates (for streak/delta). */
/**
 * Per-day component series for the trend matrix.
 *
 * The existing load*Multi helpers select only `overall_score`, because their one caller
 * collapses the window into a streak count and a single delta. A trend view needs the
 * components themselves, so this reads them directly rather than widening those helpers
 * and making every daily-page request carry columns it does not render.
 *
 * `stage` on inflection_daily and `state` on transition_daily hold different taxonomies;
 * both are returned as `label` so the caller can render one column either way.
 */
export interface TrendRow {
  scan_date: string;
  ticker: string;
  sector: string | null;
  price: number;
  se_score: number;
  demand_score: number;
  compression_score: number;
  runner_score: number;
  rs_score: number;
  overall_score: number;
  /** Transition only — Inflection has no Structure component. Null there. */
  structure_score: number | null;
  /** stage (inflection) or state (transition). */
  label: string;
  /** trade_read (inflection) or alert_state (transition). */
  read: string;
  is_coiled: boolean;
  is_primary: boolean;
  is_stronger: boolean;
  extension_risk: boolean;
  scanner_version: number | null;
}

/**
 * Current RRG quadrant per sector, from the newest sector_snapshots date.
 *
 * Keyed by the snapshot's `sector` display name, which is the same string
 * getSectorForTicker() puts on every scan row — 17 of the 18 sectors carrying stocks join
 * cleanly. The exception is "Other", the bucket for tickers in no basket at all (CRCL and
 * friends); those have no quadrant because there is no basket to have one.
 *
 * Deliberately the LATEST quadrant rather than a per-scan-date series. This answers "which
 * sectors are working now", which is how you would use it to narrow a watchlist. A
 * historical join would show a name as LEADING on a day the sector has since left, which
 * is a different and much easier question to misread.
 */
export async function loadLatestSectorQuadrants(): Promise<Record<string, string>> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return {};

    const { data: latest, error: dErr } = await supabase
      .from("sector_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1);
    if (dErr || !latest?.length) {
      if (dErr) console.error("[persistence] loadLatestSectorQuadrants date error:", dErr.message);
      return {};
    }

    const { data, error } = await supabase
      .from("sector_snapshots")
      .select("sector, quadrant")
      .eq("snapshot_date", latest[0].snapshot_date as string);
    if (error) {
      console.error("[persistence] loadLatestSectorQuadrants error:", error.message);
      return {};
    }

    const out: Record<string, string> = {};
    for (const r of data ?? []) {
      const sector = r.sector as string;
      const quadrant = r.quadrant as string;
      if (sector && quadrant) out[sector] = quadrant;
    }
    return out;
  } catch (err) {
    console.error("[persistence] loadLatestSectorQuadrants exception:", err);
    return {};
  }
}

// ── Component history archive (migration 033) ──
//
// The scan tables purge at 14 days, which is right for them but caps the component trend
// at a fortnight — and the trend is exactly what a single scan cannot tell you. This is a
// narrow, append-only, never-purged copy of just the scores and labels. See the migration
// for why it is deliberately not a superset of the scan tables.

export interface ComponentHistoryRecord {
  scan_date: string;
  engine: "inflection" | "transition";
  ticker: string;
  sector: string | null;
  price: number;
  se_score: number;
  demand_score: number;
  compression_score: number;
  runner_score: number;
  rs_score: number;
  overall_score: number;
  structure_score: number | null;
  label: string;
  read_label: string;
  is_coiled: boolean;
  is_primary: boolean;
  is_stronger: boolean;
  extension_risk: boolean;
  scanner_version: number | null;
}

/**
 * Upsert archive rows. Returns the number written, or 0 on any failure.
 *
 * Deliberately swallows errors: this runs at the end of a scan cron whose real job is the
 * 14-day table, and the archive is a convenience on top. A missing table (migration not yet
 * applied) or a transient write failure must not fail the scan or lose the primary result.
 */
export async function upsertComponentHistory(records: ComponentHistoryRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    let written = 0;
    // Chunked so one oversized batch cannot reject the whole night's archive.
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      const { error } = await supabase
        .from("component_history")
        .upsert(chunk, { onConflict: "scan_date,engine,ticker" });
      if (error) {
        console.error("[persistence] upsertComponentHistory error:", error.message);
        continue;
      }
      written += chunk.length;
    }
    return written;
  } catch (err) {
    console.error("[persistence] upsertComponentHistory exception:", err);
    return 0;
  }
}

/** Distinct scan dates present in the archive for one engine, newest first. */
export async function loadComponentHistoryDates(
  engine: "inflection" | "transition",
  limit: number,
): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const seen: string[] = [];
    const unique = new Set<string>();
    for (let page = 0; page < 32; page++) {
      const from = page * SCAN_PAGE_SIZE;
      const { data, error } = await supabase
        .from("component_history")
        .select("scan_date")
        .eq("engine", engine)
        .order("scan_date", { ascending: false })
        .range(from, from + SCAN_PAGE_SIZE - 1);
      if (error) {
        console.error("[persistence] loadComponentHistoryDates error:", error.message);
        break;
      }
      const rows = data ?? [];
      for (const r of rows) {
        const d = r.scan_date as string;
        if (!unique.has(d)) {
          unique.add(d);
          seen.push(d);
          if (seen.length >= limit) return seen;
        }
      }
      if (rows.length < SCAN_PAGE_SIZE) break;
    }
    return seen;
  } catch (err) {
    console.error("[persistence] loadComponentHistoryDates exception:", err);
    return [];
  }
}

/** Archive rows for a set of dates, shaped like loadComponentTrend so the two are
 *  interchangeable at the call site. Paged for the same 1000-row reason. */
export async function loadComponentHistory(
  engine: "inflection" | "transition",
  dates: string[],
): Promise<TrendRow[]> {
  if (dates.length === 0) return [];
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const out: TrendRow[] = [];
    for (let page = 0; page < 64; page++) {
      const from = page * SCAN_PAGE_SIZE;
      const { data, error } = await supabase
        .from("component_history")
        .select("*")
        .eq("engine", engine)
        .in("scan_date", dates)
        .order("scan_date", { ascending: false })
        .range(from, from + SCAN_PAGE_SIZE - 1);
      if (error) {
        console.error("[persistence] loadComponentHistory error:", error.message);
        break;
      }
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      for (const row of rows) {
        out.push({
          scan_date: row.scan_date as string,
          ticker: row.ticker as string,
          sector: (row.sector as string | null) ?? null,
          price: Number(row.price ?? 0),
          se_score: (row.se_score as number) ?? 0,
          demand_score: (row.demand_score as number) ?? 0,
          compression_score: (row.compression_score as number) ?? 0,
          runner_score: (row.runner_score as number) ?? 0,
          rs_score: (row.rs_score as number) ?? 0,
          overall_score: (row.overall_score as number) ?? 0,
          structure_score: (row.structure_score as number | null) ?? null,
          label: (row.label as string) ?? "",
          read: (row.read_label as string) ?? "",
          is_coiled: row.is_coiled === true,
          is_primary: row.is_primary === true,
          is_stronger: row.is_stronger === true,
          extension_risk: row.extension_risk === true,
          scanner_version: (row.scanner_version as number | null) ?? null,
        });
      }
      if (rows.length < SCAN_PAGE_SIZE) break;
    }
    return out;
  } catch (err) {
    console.error("[persistence] loadComponentHistory exception:", err);
    return [];
  }
}

export async function loadComponentTrend(
  engine: "inflection" | "transition",
  dates: string[],
): Promise<TrendRow[]> {
  if (dates.length === 0) return [];

  // The two tables name three of these columns differently: Inflection stores compression
  // as vc_score and its read as trade_read, Transition uses compression_score/alert_state
  // and adds structure_score, which has no Inflection equivalent.
  const inflection = engine === "inflection";
  const table = inflection ? "inflection_daily" : "transition_daily";
  const labelCol = inflection ? "stage" : "state";
  const readCol = inflection ? "trade_read" : "alert_state";
  const compressionCol = inflection ? "vc_score" : "compression_score";
  const structureCol = inflection ? "" : ", structure_score";

  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    // A full window is dates x universe — 14 scans of ~350 rows is well past the 1000-row
    // cap, and an unpaged read silently drops the oldest dates. That is the worst possible
    // failure here: the matrix renders a dash, which this view defines to mean "the scanner
    // did not score it", so truncation would read as a scanner gap rather than a fetch bug.
    const raw: Record<string, unknown>[] = [];
    for (let page = 0; page < 32; page++) {
      const from = page * SCAN_PAGE_SIZE;
      const { data, error } = await supabase
        .from(table)
        .select(
          `scan_date, ticker, sector, price, se_score, demand_score, overall_score, ` +
          `runner_score, rs_score, is_coiled, is_primary, is_stronger, extension_risk, ` +
          `scanner_version, ${compressionCol}, ${labelCol}, ${readCol}${structureCol}`
        )
        .in("scan_date", dates)
        .order("scan_date", { ascending: false })
        .range(from, from + SCAN_PAGE_SIZE - 1);

      if (error) {
        console.error(`[persistence] loadComponentTrend(${engine}) error:`, error.message);
        break;
      }
      // The select list is built at runtime, so Supabase cannot infer a row shape and
      // widens to GenericStringError[]. Columns are read defensively below.
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      raw.push(...rows);
      if (rows.length < SCAN_PAGE_SIZE) break;
    }

    return raw.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        scan_date: row.scan_date as string,
        ticker: row.ticker as string,
        sector: (row.sector as string | null) ?? null,
        price: (row.price as number) ?? 0,
        se_score: (row.se_score as number) ?? 0,
        demand_score: (row.demand_score as number) ?? 0,
        compression_score: (row[compressionCol] as number) ?? 0,
        runner_score: (row.runner_score as number) ?? 0,
        rs_score: (row.rs_score as number) ?? 0,
        overall_score: (row.overall_score as number) ?? 0,
        structure_score: inflection ? null : ((row.structure_score as number) ?? 0),
        label: (row[labelCol] as string) ?? "",
        read: (row[readCol] as string) ?? "",
        is_coiled: row.is_coiled === true,
        is_primary: row.is_primary === true,
        is_stronger: row.is_stronger === true,
        extension_risk: row.extension_risk === true,
        scanner_version: (row.scanner_version as number | null) ?? null,
      };
    });
  } catch (err) {
    console.error(`[persistence] loadComponentTrend(${engine}) exception:`, err);
    return [];
  }
}

export async function loadTransitionDailyMulti(
  dates: string[]
): Promise<Array<{ scan_date: string; ticker: string; overall_score: number; scanner_version: number }>> {
  if (dates.length === 0) return [];

  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("transition_daily")
      .select("scan_date, ticker, overall_score, scanner_version")
      .in("scan_date", dates)
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadTransitionDailyMulti error:", error.message);
      return [];
    }
    return (data ?? []) as Array<{ scan_date: string; ticker: string; overall_score: number; scanner_version: number }>;
  } catch (err) {
    console.error("[persistence] loadTransitionDailyMulti exception:", err);
    return [];
  }
}

// ── Cross-Scanner Helpers ──

/** Load all distinct tickers that have appeared in ANY scanner table.
 *  Used by cron routes to skip persistent non-scorers.
 *  Returns empty set on error (fail-open: scan everything). */
export async function loadAllScoredTickers(): Promise<Set<string>> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return new Set();

    const [r1, r2, r3, r4, r5, r6, r7, r8] = await Promise.all([
      supabase.from("prerun_daily").select("ticker").limit(5000),
      supabase.from("prerun_4h_daily").select("ticker").limit(5000),
      supabase.from("inflection_daily").select("ticker").limit(5000),
      supabase.from("vcp_daily").select("ticker").limit(5000),
      supabase.from("institutional_daily").select("ticker").limit(5000),
      supabase.from("transition_daily").select("ticker").limit(5000),
      supabase.from("prerunner_daily").select("ticker").limit(5000),
      supabase.from("ict_daily").select("ticker").limit(5000),
    ]);

    const all = new Set<string>();
    for (const r of [r1, r2, r3, r4, r5, r6, r7, r8]) {
      if (r.data) for (const row of r.data) all.add(row.ticker as string);
    }
    return all;
  } catch (err) {
    console.error("[persistence] loadAllScoredTickers exception:", err);
    return new Set();
  }
}

// ── Trading Bias Daily ──

export interface TradingBiasDailyRecord {
  snapshot_date: string;               // YYYY-MM-DD
  bias: string;                        // "Strong Bull" | "Lean Bull" | "Neutral" | "Lean Bear" | "Strong Bear"
  confidence: number | null;
  preferred_direction: string | null;   // "Long" | "Short" | "Flat"
  direction: string | null;             // "BULL" | "LEAN BULL" | "NEUTRAL" | "LEAN BEAR" | "BEAR"
  posture: string | null;
  regime: string | null;
  leading_asset: string | null;
  weakest_asset: string | null;
  best_to_trade_symbol: string | null;
  best_to_trade_direction: string | null;
  asset_to_avoid: string | null;
  day_type: string | null;
  vix: number | null;
  bias_conflict: boolean;
  futures_snapshot: { symbol: string; price: number; changePct: number }[] | null;
}

export interface TradingBiasOutcomes {
  es_return_pct: number | null;
  nq_return_pct: number | null;
  ym_return_pct: number | null;
  rty_return_pct: number | null;
  bias_correct: boolean | null;
  best_trade_return_pct: number | null;
}

/** Upsert a single trading bias daily prediction. */
export async function upsertTradingBiasDaily(record: TradingBiasDailyRecord): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[persistence] upsertTradingBiasDaily: no admin client");
      return false;
    }

    const { error } = await supabase
      .from("trading_bias_daily")
      .upsert(record, { onConflict: "snapshot_date" });

    if (error) {
      console.error("[persistence] upsertTradingBiasDaily error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[persistence] upsertTradingBiasDaily exception:", err);
    return false;
  }
}

/** Load trading bias for a specific date, or the most recent row if no date given. */
export async function loadTradingBiasDaily(date?: string): Promise<TradingBiasDailyRecord | null> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return null;

    let query = supabase
      .from("trading_bias_daily")
      .select("*")
      .order("snapshot_date", { ascending: false })
      .limit(1);

    if (date) {
      query = query.eq("snapshot_date", date);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[persistence] loadTradingBiasDaily error:", error.message);
      return null;
    }
    return (data?.[0] as TradingBiasDailyRecord) ?? null;
  } catch (err) {
    console.error("[persistence] loadTradingBiasDaily exception:", err);
    return null;
  }
}

/** Load trading bias history for the last N days (for backtest analysis). */
export async function loadTradingBiasDailyHistory(
  days = 30
): Promise<Array<TradingBiasDailyRecord & TradingBiasOutcomes & { outcome_updated_at: string | null }>> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("trading_bias_daily")
      .select("*")
      .gte("snapshot_date", cutoffStr)
      .order("snapshot_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadTradingBiasDailyHistory error:", error.message);
      return [];
    }
    return (data ?? []) as Array<TradingBiasDailyRecord & TradingBiasOutcomes & { outcome_updated_at: string | null }>;
  } catch (err) {
    console.error("[persistence] loadTradingBiasDailyHistory exception:", err);
    return [];
  }
}

/** Delete trading_bias_daily rows older than retentionDays. */
export async function purgeOldTradingBiasDaily(retentionDays = 90): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("trading_bias_daily")
      .delete()
      .lt("snapshot_date", cutoffStr)
      .select("id");

    if (error) {
      console.error("[persistence] purgeOldTradingBiasDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] purgeOldTradingBiasDaily exception:", err);
    return 0;
  }
}

/** Update outcome columns for a specific snapshot_date (backfill). */
export async function updateTradingBiasOutcomes(
  date: string,
  outcomes: TradingBiasOutcomes,
): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return false;

    const { error } = await supabase
      .from("trading_bias_daily")
      .update({ ...outcomes, outcome_updated_at: new Date().toISOString() })
      .eq("snapshot_date", date);

    if (error) {
      console.error("[persistence] updateTradingBiasOutcomes error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[persistence] updateTradingBiasOutcomes exception:", err);
    return false;
  }
}

// ── ICT Daily ──

export type { ICTDailyRecord } from "@/lib/ict/types";

/** Batch upsert ICT daily scan results. */
export async function upsertICTDaily(records: import("@/lib/ict/types").ICTDailyRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[persistence] upsertICTDaily: no admin client");
      return 0;
    }

    let upserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const { data, error } = await supabase
        .from("ict_daily")
        .upsert(batch, { onConflict: "scan_date,ticker" })
        .select("id");

      if (!error) {
        upserted += data?.length ?? 0;
        continue;
      }

      // One bad row used to cost the whole batch, silently: the error is logged
      // and a count returned, so the caller reports "persisted 369" against 422
      // qualifying with no indication of what happened. Fall back to per-row so
      // a rejected value costs one row and names itself in the log.
      console.error("[persistence] upsertICTDaily batch error:", error.message);
      for (const record of batch) {
        const { data: rowData, error: rowError } = await supabase
          .from("ict_daily")
          .upsert([record], { onConflict: "scan_date,ticker" })
          .select("id");
        if (rowError) {
          console.error(`[persistence] upsertICTDaily dropped ${record.ticker}:`, rowError.message);
        } else {
          upserted += rowData?.length ?? 0;
        }
      }
    }
    return upserted;
  } catch (err) {
    console.error("[persistence] upsertICTDaily exception:", err);
    return 0;
  }
}

/** Delete ICT daily rows older than retentionDays. */
export async function purgeOldICTDaily(retentionDays = 14): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("ict_daily")
      .delete()
      .lt("scan_date", cutoffStr)
      .select("id");

    if (error) {
      console.error("[persistence] purgeOldICTDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] purgeOldICTDaily exception:", err);
    return 0;
  }
}

/** Delete all ICT daily results for a specific date. */
export async function clearICTDaily(date: string): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const { data, error } = await supabase
      .from("ict_daily")
      .delete()
      .eq("scan_date", date)
      .select("id");

    if (error) {
      console.error("[persistence] clearICTDaily error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] clearICTDaily exception:", err);
    return 0;
  }
}

/** Load ICT daily results for a given date. */
export async function loadICTDaily(date: string): Promise<import("@/lib/ict/types").ICTDailyRecord[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("ict_daily")
      .select("*")
      .eq("scan_date", date)
      .order("best_score", { ascending: false });

    if (error) {
      console.error("[persistence] loadICTDaily error:", error.message);
      return [];
    }
    return (data ?? []) as import("@/lib/ict/types").ICTDailyRecord[];
  } catch (err) {
    console.error("[persistence] loadICTDaily exception:", err);
    return [];
  }
}

/** Load available ICT scan dates (up to limit, most recent first). */
export async function loadICTDailyDates(limit = 14): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("ict_daily")
      .select("scan_date")
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadICTDailyDates error:", error.message);
      return [];
    }

    const unique = [...new Set((data ?? []).map((r) => r.scan_date as string))];
    return unique.slice(0, limit);
  } catch (err) {
    console.error("[persistence] loadICTDailyDates exception:", err);
    return [];
  }
}

/** Load ICT daily results for multiple dates (for streak/delta). */
export async function loadICTDailyMulti(
  dates: string[]
): Promise<Array<{ scan_date: string; ticker: string; best_score: number }>> {
  if (dates.length === 0) return [];

  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("ict_daily")
      .select("scan_date, ticker, best_score")
      .in("scan_date", dates)
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadICTDailyMulti error:", error.message);
      return [];
    }
    return (data ?? []) as Array<{ scan_date: string; ticker: string; best_score: number }>;
  } catch (err) {
    console.error("[persistence] loadICTDailyMulti exception:", err);
    return [];
  }
}


// ── Rotation screen forward log (migration 032) ──

/**
 * A pre-registered pick from the rotation entry screen.
 *
 * Written when a rotation is first seen, scored 20 trading days later. The point
 * is that `symbols` is committed to before the outcome exists — the screen's
 * thresholds were fitted on 8 firing rotations after trying ~15 configurations, so
 * only out-of-sample observations can tell you whether it works.
 */
export interface RotationScreenLogRecord {
  etf: string;
  sector: string;
  rotation_start: string;
  logged_at: string;
  is_forward: boolean;
  verdict: string;
  qualifying: number;
  symbols: string[];
  gate_breadth: number | null;
  gate_cmf: number | null;
  gate_accel: number | null;
  gate_pass: boolean;
  etf_price_at_start: number | null;
}

export interface RotationScreenLogRow extends RotationScreenLogRecord {
  id: string;
  scored_at: string | null;
  etf_fwd_pct: number | null;
  basket_fwd_pct: number | null;
  names_positive: number | null;
  names_scored: number | null;
  outcomes: Record<string, number> | null;
}

/**
 * Insert rotations not already logged. Deliberately NEVER updates an existing row:
 * the recorded verdict and symbol list are the pre-registration, and revising them
 * once the outcome is visible would quietly destroy the only thing this table is for.
 */
export async function insertRotationScreenLogs(records: RotationScreenLogRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[persistence] insertRotationScreenLogs: no admin client");
      return 0;
    }
    const { data, error } = await supabase
      .from("rotation_screen_log")
      .upsert(records, { onConflict: "etf,rotation_start", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("[persistence] insertRotationScreenLogs:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[persistence] insertRotationScreenLogs threw:", err);
    return 0;
  }
}

/** Rows whose holding window has elapsed and which have not been scored yet. */
export async function loadUnscoredRotationScreenLogs(onOrBefore: string): Promise<RotationScreenLogRow[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("rotation_screen_log")
      .select("*")
      .is("scored_at", null)
      .lte("rotation_start", onOrBefore)
      .order("rotation_start", { ascending: true });
    if (error) {
      console.error("[persistence] loadUnscoredRotationScreenLogs:", error.message);
      return [];
    }
    return (data ?? []) as RotationScreenLogRow[];
  } catch (err) {
    console.error("[persistence] loadUnscoredRotationScreenLogs threw:", err);
    return [];
  }
}

export async function scoreRotationScreenLog(
  id: string,
  outcome: {
    scored_at: string;
    etf_fwd_pct: number | null;
    basket_fwd_pct: number | null;
    names_positive: number | null;
    names_scored: number | null;
    outcomes: Record<string, number>;
  },
): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return false;
    const { error } = await supabase
      .from("rotation_screen_log")
      .update({ ...outcome, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[persistence] scoreRotationScreenLog:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[persistence] scoreRotationScreenLog threw:", err);
    return false;
  }
}

/** Everything logged, newest first — for the results readout. */
export async function loadRotationScreenLogs(limit = 200): Promise<RotationScreenLogRow[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("rotation_screen_log")
      .select("*")
      .order("rotation_start", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[persistence] loadRotationScreenLogs:", error.message);
      return [];
    }
    return (data ?? []) as RotationScreenLogRow[];
  } catch (err) {
    console.error("[persistence] loadRotationScreenLogs threw:", err);
    return [];
  }
}
