/**
 * Supabase CRUD for promoted_tickers table.
 * Discovered tickers that score WATCH+ (finalScore >= 14) get promoted
 * to permanent universe inclusion with a 180-day TTL.
 *
 * Pattern: createAdminClient(), try/catch wrapping, graceful degradation.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import type { AssetClass } from "./types";

const PROMOTION_EXPIRY_DAYS = 180;

export interface PromotionCandidate {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  sector: string;
  score: number;
  verdict: string;
}

export interface PromotedTicker {
  id: string;
  symbol: string;
  name: string | null;
  asset_class: AssetClass;
  sector: string | null;
  promoted_at: string;
  last_qualified_at: string;
  best_score: number;
  best_verdict: string | null;
  source: string;
  expires_at: string;
}

/**
 * Upsert qualifying tickers to promoted_tickers.
 * On re-promotion: update last_qualified_at, best_score (if higher), reset expires_at.
 */
export async function promoteDiscoveredTickers(
  candidates: PromotionCandidate[]
): Promise<number> {
  if (candidates.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error(
        "[promotion] promoteDiscoveredTickers: no admin client (missing SUPABASE_SERVICE_ROLE_KEY)"
      );
      return 0;
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + PROMOTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // For each candidate, we need to handle best_score correctly:
    // Only update best_score if the new score is higher.
    // Supabase upsert doesn't support conditional column updates,
    // so we first load existing records to compare scores.
    const symbols = candidates.map((c) => c.symbol);
    const { data: existing } = await supabase
      .from("promoted_tickers")
      .select("symbol, best_score")
      .in("symbol", symbols);

    const existingScores = new Map<string, number>(
      (existing ?? []).map((r: { symbol: string; best_score: number }) => [
        r.symbol,
        r.best_score,
      ])
    );

    const rows = candidates.map((c) => {
      const prevBest = existingScores.get(c.symbol) ?? 0;
      return {
        symbol: c.symbol,
        name: c.name,
        asset_class: c.assetClass,
        sector: c.sector,
        last_qualified_at: now,
        best_score: Math.max(c.score, prevBest),
        best_verdict: c.verdict,
        source: "discovery",
        expires_at: expiresAt,
      };
    });

    const { data, error } = await supabase
      .from("promoted_tickers")
      .upsert(rows, { onConflict: "symbol,asset_class" })
      .select("id");

    if (error) {
      console.error("[promotion] promoteDiscoveredTickers error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[promotion] promoteDiscoveredTickers exception:", err);
    return 0;
  }
}

/** Load active (non-expired) promoted tickers, optionally filtered by asset class. */
export async function loadPromotedTickers(
  assetClass?: AssetClass
): Promise<PromotedTicker[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    let query = supabase
      .from("promoted_tickers")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("best_score", { ascending: false });

    if (assetClass) {
      query = query.eq("asset_class", assetClass);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[promotion] loadPromotedTickers error:", error.message);
      return [];
    }
    return (data ?? []) as PromotedTicker[];
  } catch (err) {
    console.error("[promotion] loadPromotedTickers exception:", err);
    return [];
  }
}

/** Delete rows where expires_at < now(). Returns count of purged rows. */
export async function purgeExpiredPromotions(): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const { data, error } = await supabase
      .from("promoted_tickers")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .select("id");

    if (error) {
      console.error("[promotion] purgeExpiredPromotions error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[promotion] purgeExpiredPromotions exception:", err);
    return 0;
  }
}

/** Count active (non-expired) promoted tickers. */
export async function countActivePromotions(): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const { count, error } = await supabase
      .from("promoted_tickers")
      .select("*", { count: "exact", head: true })
      .gt("expires_at", new Date().toISOString());

    if (error) {
      console.error("[promotion] countActivePromotions error:", error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error("[promotion] countActivePromotions exception:", err);
    return 0;
  }
}
