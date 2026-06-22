/**
 * Supabase CRUD for discovered_tickers table.
 * Pattern: createAdminClient(), try/catch wrapping, graceful degradation.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import type { AssetClass, DiscoveredTicker } from "./types";

const EXPIRY_DAYS = 7;

/** Batch upsert discovered tickers. Extends expires_at on re-discovery. */
export async function upsertDiscoveredTickers(
  tickers: DiscoveredTicker[]
): Promise<number> {
  if (tickers.length === 0) return 0;

  try {
    const supabase = createAdminClient();
    if (!supabase) {
      console.error(
        "[discovery] upsertDiscoveredTickers: no admin client (missing SUPABASE_SERVICE_ROLE_KEY)"
      );
      return 0;
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const rows = tickers.map((t) => ({
      symbol: t.symbol,
      name: t.name,
      asset_class: t.asset_class,
      source: t.source,
      price_change_pct: t.price_change_pct,
      volume: t.volume,
      market_cap: t.market_cap,
      price_at_discovery: t.price_at_discovery,
      last_seen_at: now,
      expires_at: expiresAt,
    }));

    const { data, error } = await supabase
      .from("discovered_tickers")
      .upsert(rows, { onConflict: "symbol,asset_class" })
      .select("id");

    if (error) {
      console.error("[discovery] upsertDiscoveredTickers error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[discovery] upsertDiscoveredTickers exception:", err);
    return 0;
  }
}

/** Load active (non-expired) discovered tickers, optionally filtered by asset class. */
export async function loadDiscoveredTickers(
  assetClass?: AssetClass
): Promise<DiscoveredTicker[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    let query = supabase
      .from("discovered_tickers")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("last_seen_at", { ascending: false });

    if (assetClass) {
      query = query.eq("asset_class", assetClass);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[discovery] loadDiscoveredTickers error:", error.message);
      return [];
    }
    return (data ?? []) as DiscoveredTicker[];
  } catch (err) {
    console.error("[discovery] loadDiscoveredTickers exception:", err);
    return [];
  }
}

/** Delete rows where expires_at < now(). Returns count of purged rows. */
export async function purgeExpiredTickers(): Promise<number> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return 0;

    const { data, error } = await supabase
      .from("discovered_tickers")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .select("id");

    if (error) {
      console.error("[discovery] purgeExpiredTickers error:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error("[discovery] purgeExpiredTickers exception:", err);
    return 0;
  }
}
