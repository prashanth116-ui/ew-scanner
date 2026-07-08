/**
 * Discovery cron — finds trending/pumping tickers via free APIs
 * and upserts them into discovered_tickers for universe merging.
 *
 * Schedule: every 6 hours (via vercel.json)
 * Auth: CRON_SECRET Bearer token (same as other crons)
 */

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";

import { getAllSectorSymbols } from "@/data/sector-universe";
import { getAllCryptoSymbols } from "@/data/crypto-sector-universe";
import { getAllCatalystSymbols } from "@/data/catalyst-universe";
import {
  fetchCoinGeckoTrending,
  fetchCoinGeckoTopVolume,
  fetchYahooGainers,
} from "@/lib/discovery/fetchers";
import {
  upsertDiscoveredTickers,
  purgeExpiredTickers,
} from "@/lib/discovery/storage";
import type { DiscoveredTicker, DiscoveryResult } from "@/lib/discovery/types";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Auth — same pattern as all other crons
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const errors: string[] = [];
  const allDiscovered: DiscoveredTicker[] = [];

  // Build dedup set from all static universes (case-insensitive)
  const staticSymbols = new Set<string>();
  for (const sym of getAllSectorSymbols()) staticSymbols.add(sym.toUpperCase());
  for (const sym of getAllCryptoSymbols()) staticSymbols.add(sym.toUpperCase());
  for (const sym of getAllCatalystSymbols()) staticSymbols.add(sym.toUpperCase());

  // 1. CoinGecko trending (no key needed)
  try {
    const trending = await fetchCoinGeckoTrending();
    for (const t of trending) {
      if (!staticSymbols.has(t.symbol.toUpperCase())) {
        allDiscovered.push(t);
      }
    }
    console.log(`[discovery] CoinGecko trending: ${trending.length} fetched, ${allDiscovered.length} new`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`coingecko_trending: ${msg}`);
    logError("discovery/coingecko_trending", err);
  }

  // 2. CoinGecko top volume (optional API key for higher rate limits)
  try {
    const cgKey = process.env.COINGECKO_API_KEY;
    const topVolume = await fetchCoinGeckoTopVolume(cgKey);
    let added = 0;
    const seenSymbols = new Set(allDiscovered.map((d) => d.symbol.toUpperCase()));
    for (const t of topVolume) {
      const upper = t.symbol.toUpperCase();
      if (!staticSymbols.has(upper) && !seenSymbols.has(upper)) {
        allDiscovered.push(t);
        seenSymbols.add(upper);
        added++;
      }
    }
    console.log(`[discovery] CoinGecko top volume: ${topVolume.length} movers, ${added} new`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`coingecko_top_volume: ${msg}`);
    logError("discovery/coingecko_top_volume", err);
  }

  // 3. Yahoo Finance stock gainers (no API key needed)
  try {
    const gainers = await fetchYahooGainers();
    let added = 0;
    const seenSymbols = new Set(
      allDiscovered.map((d) => d.symbol.toUpperCase())
    );
    for (const t of gainers) {
      const upper = t.symbol.toUpperCase();
      if (!staticSymbols.has(upper) && !seenSymbols.has(upper)) {
        allDiscovered.push(t);
        seenSymbols.add(upper);
        added++;
      }
    }
    console.log(`[discovery] Yahoo gainers: ${gainers.length} fetched, ${added} new`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`yahoo_gainers: ${msg}`);
    logError("discovery/yahoo_gainers", err);
  }

  // Upsert to Supabase
  const upserted = await upsertDiscoveredTickers(allDiscovered);

  // Purge expired
  const purged = await purgeExpiredTickers();

  const cryptoCount = allDiscovered.filter(
    (d) => d.asset_class === "crypto"
  ).length;
  const stockCount = allDiscovered.filter(
    (d) => d.asset_class === "stock"
  ).length;

  const result: DiscoveryResult = {
    discovered: allDiscovered.length,
    upserted,
    purged,
    crypto: cryptoCount,
    stocks: stockCount,
    errors,
  };

  return NextResponse.json(result);
}
