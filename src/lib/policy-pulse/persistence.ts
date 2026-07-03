import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import type { ThemeEventRecord } from "./types";

/** Batch upsert theme events. Upserts 500 at a time on (url_hash, theme_id). */
export async function upsertThemeEvents(records: ThemeEventRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[policy-pulse] upsertThemeEvents: no admin client");
      return 0;
    }

    let upserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const { data, error } = await supabase
        .from("theme_events")
        .upsert(batch, { onConflict: "url_hash,theme_id" })
        .select("id");

      if (error) {
        console.error("[policy-pulse] upsertThemeEvents error:", error.message);
      } else {
        upserted += data?.length ?? 0;
      }
    }
    return upserted;
  } catch (err) {
    console.error("[policy-pulse] upsertThemeEvents exception:", err);
    return 0;
  }
}

/** Load theme events with optional filters. */
export async function loadThemeEvents(opts: {
  days?: number;
  themeId?: string;
  minImpact?: number;
}): Promise<ThemeEventRow[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    let query = supabase
      .from("theme_events")
      .select("*")
      .eq("expired", false)
      .order("published_at", { ascending: false });

    if (opts.days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - opts.days);
      query = query.gte("published_at", cutoff.toISOString());
    }

    if (opts.themeId) {
      query = query.eq("theme_id", opts.themeId);
    }

    if (opts.minImpact) {
      query = query.gte("impact_score", opts.minImpact);
    }

    const { data, error } = await query.limit(200);

    if (error) {
      console.error("[policy-pulse] loadThemeEvents error:", error.message);
      return [];
    }
    return (data ?? []) as ThemeEventRow[];
  } catch (err) {
    console.error("[policy-pulse] loadThemeEvents exception:", err);
    return [];
  }
}

/** Load top N recent events by impact score (for brief widget). */
export async function loadRecentThemeEvents(limit: number): Promise<ThemeEventRow[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 2); // last 48h

    const { data, error } = await supabase
      .from("theme_events")
      .select("*")
      .eq("expired", false)
      .gte("published_at", cutoff.toISOString())
      .order("impact_score", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[policy-pulse] loadRecentThemeEvents error:", error.message);
      return [];
    }
    return (data ?? []) as ThemeEventRow[];
  } catch (err) {
    console.error("[policy-pulse] loadRecentThemeEvents exception:", err);
    return [];
  }
}

/** Delete theme events older than retentionDays. */
export async function purgeOldThemeEvents(retentionDays = 30): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const { data, error } = await supabase
      .from("theme_events")
      .delete()
      .lt("published_at", cutoff.toISOString())
      .select("id");

    if (error) {
      console.error("[policy-pulse] purgeOldThemeEvents error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[policy-pulse] purgeOldThemeEvents exception:", err);
    return 0;
  }
}

/** Load distinct dates that have theme events. */
export async function loadThemeEventDates(limit = 30): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("theme_events")
      .select("published_at")
      .order("published_at", { ascending: false });

    if (error) {
      console.error("[policy-pulse] loadThemeEventDates error:", error.message);
      return [];
    }

    const unique = [
      ...new Set(
        (data ?? []).map((r) =>
          new Date(r.published_at as string).toISOString().slice(0, 10),
        ),
      ),
    ];
    return unique.slice(0, limit);
  } catch (err) {
    console.error("[policy-pulse] loadThemeEventDates exception:", err);
    return [];
  }
}

/** Raw DB row shape (snake_case). */
export interface ThemeEventRow {
  id: number;
  url_hash: string;
  theme_id: string;
  headline: string;
  summary: string | null;
  source: string;
  source_url: string | null;
  published_at: string;
  ingested_at: string;
  impact_score: number;
  impacted_tickers: string[];
  impacted_etfs: string[];
  expired: boolean;
}
