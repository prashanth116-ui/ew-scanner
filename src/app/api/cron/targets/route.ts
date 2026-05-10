/**
 * Market-hours cron: Check watchlist tickers vs targets/invalidation levels.
 * Schedule: Every 15 min during market hours (13:30-21:00 UTC = 9:30-17:00 ET)
 *
 * 1. Fetch open signals with targets set
 * 2. Batch-fetch current prices
 * 3. Send Telegram alert when price crosses target or invalidation
 */

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { sendTelegramMessage } from "@/lib/ew-telegram";
import { fetchWithRetry } from "@/lib/yahoo-utils";
import { createClient } from "@/lib/supabase/server";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const maxDuration = 30;

interface OpenSignal {
  id: string;
  scanner: string;
  ticker: string;
  price_at_signal: number;
  target1: number | null;
  target2: number | null;
  target3: number | null;
  invalidation: number | null;
  hit_target1: boolean | null;
  hit_target2: boolean | null;
  hit_target3: boolean | null;
  hit_invalidation: boolean | null;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return NextResponse.json({ error: "Telegram not configured" }, { status: 500 });
  }

  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    // Fetch open signals with targets that haven't been fully hit
    const { data: signals, error } = await supabase
      .from("signal_outcomes")
      .select("id, scanner, ticker, price_at_signal, target1, target2, target3, invalidation, hit_target1, hit_target2, hit_target3, hit_invalidation")
      .or("target1.not.is.null,target2.not.is.null,target3.not.is.null,invalidation.not.is.null")
      .or("hit_target1.is.null,hit_target1.eq.false,hit_target2.is.null,hit_target2.eq.false,hit_target3.is.null,hit_target3.eq.false,hit_invalidation.is.null,hit_invalidation.eq.false")
      .order("signal_date", { ascending: false })
      .limit(80);

    if (error) {
      logError("cron/targets", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!signals || signals.length === 0) {
      return NextResponse.json({ checked: 0, alerts: 0 });
    }

    // Fetch current prices
    const tickers = [...new Set((signals as OpenSignal[]).map((s) => s.ticker))];
    const priceMap = await fetchBatchPrices(tickers);

    // Check each signal against targets
    const alerts: string[] = [];
    const updates: Array<{ id: string; field: string; value: boolean }> = [];

    for (const signal of signals as OpenSignal[]) {
      const price = priceMap.get(signal.ticker);
      if (price == null) continue;

      // Check target1
      if (signal.target1 != null && !signal.hit_target1 && price >= signal.target1) {
        alerts.push(`${signal.ticker} hit T1 ($${signal.target1.toFixed(2)}) — now $${price.toFixed(2)} [${signal.scanner}]`);
        updates.push({ id: signal.id, field: "hit_target1", value: true });
      }

      // Check target2
      if (signal.target2 != null && !signal.hit_target2 && price >= signal.target2) {
        alerts.push(`${signal.ticker} hit T2 ($${signal.target2.toFixed(2)}) — now $${price.toFixed(2)} [${signal.scanner}]`);
        updates.push({ id: signal.id, field: "hit_target2", value: true });
      }

      // Check target3
      if (signal.target3 != null && !signal.hit_target3 && price >= signal.target3) {
        alerts.push(`${signal.ticker} hit T3 ($${signal.target3.toFixed(2)}) — now $${price.toFixed(2)} [${signal.scanner}]`);
        updates.push({ id: signal.id, field: "hit_target3", value: true });
      }

      // Check invalidation
      if (signal.invalidation != null && !signal.hit_invalidation && price <= signal.invalidation) {
        alerts.push(`${signal.ticker} INVALIDATED ($${signal.invalidation.toFixed(2)}) — now $${price.toFixed(2)} [${signal.scanner}]`);
        updates.push({ id: signal.id, field: "hit_invalidation", value: true });
      }
    }

    // Persist target hits
    for (const u of updates) {
      await supabase
        .from("signal_outcomes")
        .update({
          [u.field]: u.value,
          ...(u.field === "hit_target1" ? { hit_target1_date: new Date().toISOString().slice(0, 10) } : {}),
          outcome_updated_at: new Date().toISOString(),
        })
        .eq("id", u.id);
    }

    // Send Telegram alert
    if (alerts.length > 0) {
      const message = [
        "<b>Scanner Target Alert</b>",
        "",
        ...alerts.map((a) => a.startsWith("INVALIDATED") ? `* ${a}` : `${a}`),
      ].join("\n");

      await sendTelegramMessage(botToken, chatId, message);
    }

    return NextResponse.json({
      checked: signals.length,
      alerts: alerts.length,
      triggered: alerts,
    });
  } catch (err) {
    logError("cron/targets", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function fetchBatchPrices(tickers: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();

  const promises = tickers.map(async (ticker) => {
    try {
      const url = `${YAHOO_CHART}/${ticker}?range=1d&interval=1d`;
      const res = await fetchWithRetry(url, {
        headers: { "User-Agent": UA },
      }, { timeout: 8000, retries: 1 });

      if (!res.ok) return;
      const json = await res.json();
      const quote = json?.chart?.result?.[0]?.meta;
      if (quote?.regularMarketPrice) {
        priceMap.set(ticker, quote.regularMarketPrice);
      }
    } catch {
      // Skip ticker
    }
  });

  await Promise.allSettled(promises);
  return priceMap;
}
