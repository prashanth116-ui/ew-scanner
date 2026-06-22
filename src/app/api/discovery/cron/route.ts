/**
 * Discovery cron — finds trending/pumping tickers via free APIs
 * and upserts them into discovered_tickers for universe merging.
 *
 * Schedule: every 6 hours (via vercel.json)
 * Auth: CRON_SECRET Bearer token (same as other crons)
 */

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { sendTelegramMessage } from "@/lib/ew-telegram";
import { getAllSectorSymbols } from "@/data/sector-universe";
import { getAllCryptoSymbols } from "@/data/crypto-sector-universe";
import { getAllCatalystSymbols } from "@/data/catalyst-universe";
import {
  fetchCoinGeckoTrending,
  fetchCoinGeckoTopVolume,
  fetchPolygonMovers,
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

  // 3. Polygon stock movers (requires API key)
  const polygonKey = process.env.POLYGON_API_KEY;
  if (polygonKey) {
    try {
      const movers = await fetchPolygonMovers(polygonKey);
      let added = 0;
      const seenSymbols = new Set(
        allDiscovered.map((d) => d.symbol.toUpperCase())
      );
      for (const t of movers) {
        const upper = t.symbol.toUpperCase();
        if (!staticSymbols.has(upper) && !seenSymbols.has(upper)) {
          allDiscovered.push(t);
          seenSymbols.add(upper);
          added++;
        }
      }
      console.log(`[discovery] Polygon movers: ${movers.length} fetched, ${added} new`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`polygon_movers: ${msg}`);
      logError("discovery/polygon_movers", err);
    }
  } else {
    console.log("[discovery] POLYGON_API_KEY not set, skipping stock movers");
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

  // Telegram notification (if any new tickers found)
  if (allDiscovered.length > 0) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (botToken && chatId) {
      const lines: string[] = [];
      lines.push("<b>Ticker Discovery</b>");
      lines.push(
        `${allDiscovered.length} new | ${cryptoCount} crypto, ${stockCount} stocks | ${purged} purged`
      );
      lines.push("");

      if (cryptoCount > 0) {
        lines.push("<b>Crypto:</b>");
        for (const t of allDiscovered.filter((d) => d.asset_class === "crypto").slice(0, 10)) {
          const pct = t.price_change_pct != null ? ` ${t.price_change_pct > 0 ? "+" : ""}${t.price_change_pct.toFixed(1)}%` : "";
          lines.push(`${t.symbol}${pct} (${t.source.replace("coingecko_", "CG ")})`);
        }
        lines.push("");
      }

      if (stockCount > 0) {
        lines.push("<b>Stocks:</b>");
        for (const t of allDiscovered.filter((d) => d.asset_class === "stock").slice(0, 10)) {
          const pct = t.price_change_pct != null ? ` +${t.price_change_pct.toFixed(1)}%` : "";
          lines.push(`${t.symbol}${pct}`);
        }
      }

      if (errors.length > 0) {
        lines.push("");
        lines.push(`\u26a0\ufe0f ${errors.length} error(s): ${errors.join(", ")}`);
      }

      const tgResult = await sendTelegramMessage(
        botToken,
        chatId,
        lines.join("\n")
      );
      if (!tgResult.ok) {
        logError(
          "discovery/telegram",
          new Error(tgResult.error ?? "Telegram send failed")
        );
      }
    }
  }

  return NextResponse.json(result);
}
