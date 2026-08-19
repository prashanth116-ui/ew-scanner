/**
 * Sync earnings dates into catalyst_tags from the Finnhub earnings calendar.
 *
 * Earnings are the one binary event that is reliably machine-readable, and typing them
 * in by hand is exactly the chore that does not get done. 16 of the focus list report in
 * any given fortnight.
 *
 * What this does NOT cover, and cannot: clinical readouts, court rulings, product
 * launches. Finnhub's fda-advisory endpoint returns nothing on this key, and no other
 * accessible source carries those dates. MRNA — the name that prompted catalyst tagging
 * at all — would not have been caught by this. Those stay manual.
 *
 * SERVER-ONLY.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

/** Rows the syncer owns outright and may replace or delete at will. */
export const EARNINGS_SOURCE = "auto:earnings";

export interface EarningsSyncResult {
  fetched: number;
  matched: number;
  written: number;
  removed: number;
  errors: string[];
}

interface FinnhubEarnings {
  symbol: string;
  date: string;
  /** "bmo" before open, "amc" after close, "" unknown. */
  hour?: string;
}

const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/**
 * Fetch, reconcile and persist.
 *
 * Reconciliation is a full replace of the syncer's own rows inside the window, not an
 * upsert. Earnings dates move, and an upsert would leave the old date behind as a second
 * tag — so you would be reminded of a date that no longer exists. Deleting only
 * `source = EARNINGS_SOURCE` rows makes that safe: hand-entered tags are never touched.
 *
 * @param tickers restrict to these symbols (the focus list). Empty means write nothing —
 *                a universe-wide sync would bury the alert in earnings badges.
 */
export async function syncEarningsCatalysts(
  tickers: Iterable<string>,
  { withinDays = 21 }: { withinDays?: number } = {},
): Promise<EarningsSyncResult> {
  const out: EarningsSyncResult = { fetched: 0, matched: 0, written: 0, removed: 0, errors: [] };

  const wanted = new Set([...tickers].map((t) => t.toUpperCase()));
  if (wanted.size === 0) {
    out.errors.push("no tickers supplied — refusing to sync the whole universe");
    return out;
  }

  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    out.errors.push("FINNHUB_API_KEY not configured");
    return out;
  }

  const from = iso(0);
  const to = iso(withinDays);

  let calendar: FinnhubEarnings[] = [];
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${key}`,
      { signal: AbortSignal.timeout(20_000) },
    );
    if (!r.ok) {
      out.errors.push(`finnhub ${r.status}`);
      return out;
    }
    calendar = ((await r.json())?.earningsCalendar ?? []) as FinnhubEarnings[];
  } catch (err) {
    out.errors.push(`finnhub fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return out;
  }

  out.fetched = calendar.length;

  // One row per ticker: the soonest date. A ticker can appear twice when a date is
  // revised, and two badges for one event reads as two events.
  const soonest = new Map<string, FinnhubEarnings>();
  for (const e of calendar) {
    if (!e?.symbol || !e?.date) continue;
    const sym = e.symbol.toUpperCase();
    if (!wanted.has(sym)) continue;
    const prev = soonest.get(sym);
    if (!prev || e.date < prev.date) soonest.set(sym, { ...e, symbol: sym });
  }
  out.matched = soonest.size;

  const supabase = createAdminClient();
  if (!supabase) {
    out.errors.push("no admin client");
    return out;
  }

  // Clear this syncer's own rows in the window before rewriting. Scoped to source so a
  // hand-entered tag on the same ticker and date survives untouched.
  try {
    const { data: deleted, error } = await supabase
      .from("catalyst_tags")
      .delete()
      .eq("source", EARNINGS_SOURCE)
      .gte("event_date", from)
      .lte("event_date", to)
      .select("id");
    if (error) out.errors.push(`clear failed: ${error.message}`);
    else out.removed = deleted?.length ?? 0;
  } catch (err) {
    out.errors.push(`clear exception: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (soonest.size === 0) return out;

  const rows = [...soonest.values()].map((e) => ({
    ticker: e.symbol,
    event_date: e.date,
    event_type: "Earnings",
    // The session matters: an `amc` print means the gap lands on the NEXT open, so a
    // position held into the close is exposed to it.
    note: e.hour === "bmo" ? "Before open" : e.hour === "amc" ? "After close" : null,
    source: EARNINGS_SOURCE,
    resolved: false,
    updated_at: new Date().toISOString(),
  }));

  try {
    const { error } = await supabase
      .from("catalyst_tags")
      .upsert(rows, { onConflict: "ticker,event_date,event_type,source" });
    if (error) out.errors.push(`write failed: ${error.message}`);
    else out.written = rows.length;
  } catch (err) {
    out.errors.push(`write exception: ${err instanceof Error ? err.message : String(err)}`);
  }

  return out;
}
