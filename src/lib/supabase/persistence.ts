/**
 * Supabase server write functions for scanner signal persistence.
 * All writes are wrapped in try/catch — failures are logged but never break scanner functionality.
 */

import "server-only";

import { createClient } from "./server";

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
