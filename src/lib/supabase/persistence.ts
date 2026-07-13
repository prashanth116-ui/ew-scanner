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
  se_score: number;
  vc_score: number;
  be_score: number;
  rs_score: number;
  la_score: number;
  ip_score: number;
  stage: string;
  trade_read: string;
  extension_risk: boolean;
  is_primary: boolean;
  is_stronger: boolean;
  bullish_evidence: string[];
  caution_evidence: string[];
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
export async function loadInflectionDailyDates(limit = 14): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inflection_daily")
      .select("scan_date")
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadInflectionDailyDates error:", error.message);
      return [];
    }

    // Dedupe and limit
    const unique = [...new Set((data ?? []).map((r) => r.scan_date as string))];
    return unique.slice(0, limit);
  } catch (err) {
    console.error("[persistence] loadInflectionDailyDates exception:", err);
    return [];
  }
}

/** Load inflection daily results for multiple dates (for streak/delta computation).
 *  Returns only ticker, scan_date, overall_score to keep payload small. */
export async function loadInflectionDailyMulti(
  dates: string[]
): Promise<Array<{ scan_date: string; ticker: string; overall_score: number }>> {
  if (dates.length === 0) return [];

  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inflection_daily")
      .select("scan_date, ticker, overall_score")
      .in("scan_date", dates)
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadInflectionDailyMulti error:", error.message);
      return [];
    }
    return (data ?? []) as Array<{ scan_date: string; ticker: string; overall_score: number }>;
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
  se_score: number;
  accum_score: number;
  choch_score: number;
  bos_score: number;
  compression_score: number;
  hl_score: number;
  rs_score: number;
  volume_score: number;
  state: string;
  alert_state: string;
  trigger_level: number | null;
  invalidation: number | null;
  is_primary: boolean;
  is_stronger: boolean;
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
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("transition_daily")
      .select("scan_date")
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadTransitionDailyDates error:", error.message);
      return [];
    }

    const unique = [...new Set((data ?? []).map((r) => r.scan_date as string))];
    return unique.slice(0, limit);
  } catch (err) {
    console.error("[persistence] loadTransitionDailyDates exception:", err);
    return [];
  }
}

/** Load transition daily results for multiple dates (for streak/delta). */
export async function loadTransitionDailyMulti(
  dates: string[]
): Promise<Array<{ scan_date: string; ticker: string; overall_score: number }>> {
  if (dates.length === 0) return [];

  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("transition_daily")
      .select("scan_date, ticker, overall_score")
      .in("scan_date", dates)
      .order("scan_date", { ascending: false });

    if (error) {
      console.error("[persistence] loadTransitionDailyMulti error:", error.message);
      return [];
    }
    return (data ?? []) as Array<{ scan_date: string; ticker: string; overall_score: number }>;
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

    const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
      supabase.from("prerun_daily").select("ticker").limit(5000),
      supabase.from("prerun_4h_daily").select("ticker").limit(5000),
      supabase.from("inflection_daily").select("ticker").limit(5000),
      supabase.from("vcp_daily").select("ticker").limit(5000),
      supabase.from("institutional_daily").select("ticker").limit(5000),
      supabase.from("transition_daily").select("ticker").limit(5000),
      supabase.from("prerunner_daily").select("ticker").limit(5000),
    ]);

    const all = new Set<string>();
    for (const r of [r1, r2, r3, r4, r5, r6, r7]) {
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
