/**
 * FTD (Failure to Deliver) T+35 settlement calendar.
 * Parses FTD data and computes settlement deadlines.
 * SERVER-ONLY: Used by squeeze scan API and cron.
 */

import "server-only";

import { recordFTDBatch, type FTDRecord } from "./supabase/persistence";

export interface FTDEntry {
  ticker: string;
  failureDate: string; // YYYY-MM-DD
  settlementDeadline: string; // YYYY-MM-DD (failure + 35 calendar days)
  ftdShares: number;
  ftdPctFloat?: number;
}

export interface FTDCalendarWeek {
  weekStart: string; // YYYY-MM-DD (Monday)
  entries: FTDEntry[];
  totalShares: number;
}

/**
 * Compute T+35 settlement deadline from a failure date.
 * T+35 = 35 calendar days from failure date.
 */
export function computeSettlementDeadline(failureDate: string): string {
  const date = new Date(failureDate);
  date.setDate(date.getDate() + 35);
  return date.toISOString().slice(0, 10);
}

/**
 * Process raw FTD data into settlement entries.
 * @param ftdData - Array of { ticker, date (YYYY-MM-DD), quantity, float? }
 */
export function processFTDData(
  ftdData: Array<{ ticker: string; date: string; quantity: number; float?: number }>
): FTDEntry[] {
  return ftdData
    .filter((d) => d.quantity > 0)
    .map((d) => ({
      ticker: d.ticker,
      failureDate: d.date,
      settlementDeadline: computeSettlementDeadline(d.date),
      ftdShares: d.quantity,
      ftdPctFloat: d.float && d.float > 0 ? (d.quantity / d.float) * 100 : undefined,
    }));
}

/**
 * Group FTD entries by upcoming week.
 */
export function groupFTDByWeek(entries: FTDEntry[]): FTDCalendarWeek[] {
  const now = new Date();
  const upcoming = entries.filter(
    (e) => new Date(e.settlementDeadline) >= now
  );

  // Sort by deadline
  upcoming.sort((a, b) => a.settlementDeadline.localeCompare(b.settlementDeadline));

  const weeks = new Map<string, FTDEntry[]>();
  for (const entry of upcoming) {
    const date = new Date(entry.settlementDeadline);
    // Get Monday of the week
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(date);
    monday.setDate(monday.getDate() + diff);
    const weekKey = monday.toISOString().slice(0, 10);

    if (!weeks.has(weekKey)) weeks.set(weekKey, []);
    weeks.get(weekKey)!.push(entry);
  }

  return Array.from(weeks.entries()).map(([weekStart, entries]) => ({
    weekStart,
    entries,
    totalShares: entries.reduce((sum, e) => sum + e.ftdShares, 0),
  }));
}

/**
 * Score FTD pressure for a ticker based on imminent settlements.
 * Within 7 days + >0.5% of float = high pressure.
 */
export function scoreFTDImminence(
  entries: FTDEntry[],
  withinDays = 7
): number {
  const cutoff = new Date(Date.now() + withinDays * 86400000);
  const imminent = entries.filter(
    (e) => new Date(e.settlementDeadline) <= cutoff
  );

  if (imminent.length === 0) return 0;

  // Check if any single entry has >0.5% float
  const highPressure = imminent.some(
    (e) => e.ftdPctFloat != null && e.ftdPctFloat >= 0.5
  );
  if (highPressure) return 8;

  // Moderate pressure: significant shares but below 0.5% threshold
  const totalShares = imminent.reduce((sum, e) => sum + e.ftdShares, 0);
  if (totalShares > 100000) return 4;

  return 2;
}

/**
 * Persist FTD data to Supabase.
 */
export async function persistFTDData(entries: FTDEntry[]): Promise<number> {
  const records: FTDRecord[] = entries.map((e) => ({
    ticker: e.ticker,
    failure_date: e.failureDate,
    settlement_deadline: e.settlementDeadline,
    ftd_shares: e.ftdShares,
    ftd_pct_float: e.ftdPctFloat,
  }));
  return recordFTDBatch(records);
}
