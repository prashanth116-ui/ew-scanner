/**
 * Hand-entered catalysts — dated events no price scanner can see.
 *
 * MRNA is why this exists: flat at $63 for a week with five scanners tracking it, then
 * +117% on 9.5x volume from a clinical readout. No OHLCV-derived engine predicts that.
 * What the system can do is tell you the date is coming, so the position is sized
 * deliberately rather than by surprise.
 *
 * Unlike every other table here these rows are NOT purged. Scan rows are derived and
 * reproducible; these are typed by hand and cannot be regenerated.
 *
 * SERVER-ONLY.
 */

import "server-only";

import { createAdminClient } from "./server";
import { daysUntil } from "@/lib/catalyst-date";

export interface CatalystTag {
  id?: string;
  ticker: string;
  /** YYYY-MM-DD. */
  event_date: string;
  /** Free text — the interesting catalysts are the ones nobody anticipated a category for. */
  event_type: string;
  note?: string | null;
  resolved?: boolean;
  outcome?: string | null;
  /** 'manual' = typed by hand, never touched by a syncer. 'auto:*' = feed-owned. Drives
   *  alert behaviour: only manual tags promote a name past the FOCUS tier gate. */
  source?: string;
  created_at?: string;
  updated_at?: string;
}

/** A tag plus how many days out it is, negative meaning it has passed. */
export interface CatalystTagWithCountdown extends CatalystTag {
  daysUntil: number;
}

/** Create or update a tag. Re-entering the same ticker/date/type updates it. */
export async function upsertCatalystTag(tag: CatalystTag): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return false;
    const { error } = await supabase
      .from("catalyst_tags")
      .upsert(
        { ...tag, ticker: tag.ticker.toUpperCase(), updated_at: new Date().toISOString() },
        { onConflict: "ticker,event_date,event_type" },
      );
    if (error) {
      console.error("[catalyst-tags] upsert error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[catalyst-tags] upsert exception:", err);
    return false;
  }
}

export async function deleteCatalystTag(id: string): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return false;
    const { error } = await supabase.from("catalyst_tags").delete().eq("id", id);
    if (error) {
      console.error("[catalyst-tags] delete error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[catalyst-tags] delete exception:", err);
    return false;
  }
}

/**
 * Load tags, newest event first.
 *
 * `withinDays` bounds how far ahead to look. Past events are included back to
 * `pastDays` so a catalyst that fired yesterday is still visible while you judge the
 * reaction — the point of keeping resolved rows at all.
 */
export async function loadCatalystTags(
  { withinDays = 90, pastDays = 7, includeResolved = false }: {
    withinDays?: number;
    pastDays?: number;
    includeResolved?: boolean;
  } = {},
): Promise<CatalystTagWithCountdown[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const iso = (offset: number) =>
      new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

    let query = supabase
      .from("catalyst_tags")
      .select("*")
      .gte("event_date", iso(-pastDays))
      .lte("event_date", iso(withinDays))
      .order("event_date", { ascending: true });

    if (!includeResolved) query = query.eq("resolved", false);

    const { data, error } = await query;
    if (error) {
      console.error("[catalyst-tags] load error:", error.message);
      return [];
    }
    return (data ?? []).map((t) => ({ ...t, daysUntil: daysUntil(t.event_date) }));
  } catch (err) {
    console.error("[catalyst-tags] load exception:", err);
    return [];
  }
}

/** Ticker → its soonest upcoming tag, for badging a scanner table. */
export async function loadCatalystMap(
  opts: Parameters<typeof loadCatalystTags>[0] = {},
): Promise<Map<string, CatalystTagWithCountdown>> {
  const tags = await loadCatalystTags(opts);
  const map = new Map<string, CatalystTagWithCountdown>();
  // Sorted ascending by date, so the first one seen for a ticker is the soonest —
  // including one that has just passed, which is what you want to see beside the row.
  for (const t of tags) if (!map.has(t.ticker)) map.set(t.ticker, t);
  return map;
}
