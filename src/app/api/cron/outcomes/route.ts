/**
 * Nightly cron: Update signal outcomes and recompute hit rates.
 * Schedule: 22:30 UTC Mon-Fri (after market close)
 *
 * 1. Fetch pending signals older than 7 days
 * 2. Batch-fetch current prices from Yahoo
 * 3. Compute 7d/30d/60d/90d returns, target hits, max gain/drawdown
 * 4. Recompute scanner hit rates
 */

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPendingSignals, fetchCompletedSignals } from "@/lib/supabase/query";
import { updateSignalOutcome, upsertHitRates } from "@/lib/supabase/persistence";
import { fetchWithRetry } from "@/lib/yahoo-utils";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Step 1: Fetch signals needing outcome updates
    const pending = await fetchPendingSignals(undefined, 7);
    if (pending.length === 0) {
      // Still recompute hit rates even if no pending signals
      await recomputeHitRates();
      return NextResponse.json({ updated: 0, hitRatesRecomputed: true });
    }

    // Step 2: Get unique tickers and fetch current prices
    const tickers = [...new Set(pending.map((s) => s.ticker))];
    const priceMap = await fetchBatchPrices(tickers);

    // Step 3: Update outcomes
    let updated = 0;
    for (const signal of pending) {
      const currentPrice = priceMap.get(signal.ticker);
      if (currentPrice == null) continue;

      const daysSinceSignal = Math.floor(
        (Date.now() - new Date(signal.signal_date).getTime()) / 86400000
      );

      const returnPct = ((currentPrice - signal.price_at_signal) / signal.price_at_signal) * 100;

      const updates: Record<string, unknown> = {};

      // Set price_Nd based on elapsed time
      if (daysSinceSignal >= 7) updates.price_7d = currentPrice;
      if (daysSinceSignal >= 30) updates.price_30d = currentPrice;
      if (daysSinceSignal >= 60) updates.price_60d = currentPrice;
      if (daysSinceSignal >= 90) updates.price_90d = currentPrice;

      // Direction-aware target hit checks:
      // Compare target to entry price to determine if upside or downside target
      if (signal.target1 != null) {
        updates.hit_target1 = signal.target1 >= signal.price_at_signal
          ? currentPrice >= signal.target1   // Upside target
          : currentPrice <= signal.target1;  // Downside target
      }
      if (signal.target2 != null) {
        updates.hit_target2 = signal.target2 >= signal.price_at_signal
          ? currentPrice >= signal.target2
          : currentPrice <= signal.target2;
      }
      if (signal.target3 != null) {
        updates.hit_target3 = signal.target3 >= signal.price_at_signal
          ? currentPrice >= signal.target3
          : currentPrice <= signal.target3;
      }
      if (signal.invalidation != null) {
        updates.hit_invalidation = signal.invalidation < signal.price_at_signal
          ? currentPrice <= signal.invalidation  // Below entry → bearish invalidation
          : currentPrice >= signal.invalidation; // Above entry → bullish invalidation
      }

      // Max gain/drawdown — direction-aware for bearish signals
      const bearish = signal.mode === "wave5";
      if (bearish) {
        updates.max_gain_pct = Math.max(0, -returnPct);    // Negative return = gain for bearish
        updates.max_drawdown_pct = Math.min(0, -returnPct); // Positive return = drawdown for bearish
      } else {
        updates.max_gain_pct = Math.max(0, returnPct);
        updates.max_drawdown_pct = Math.min(0, returnPct);
      }

      const success = await updateSignalOutcome(signal.id, updates as Parameters<typeof updateSignalOutcome>[1]);
      if (success) updated++;
    }

    // Step 4: Recompute hit rates
    await recomputeHitRates();

    return NextResponse.json({ updated, total: pending.length, hitRatesRecomputed: true });
  } catch (err) {
    logError("cron/outcomes", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Fetch Yahoo prices for batch of tickers. */
async function fetchBatchPrices(tickers: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  const BATCH = 20;

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const promises = batch.map(async (ticker) => {
      try {
        const url = `${YAHOO_CHART}/${ticker}?range=1d&interval=1d`;
        const res = await fetchWithRetry(url, {
          headers: { "User-Agent": UA },
        }, { timeout: 10000, retries: 1 });

        if (!res.ok) return;
        const json = await res.json();
        const quote = json?.chart?.result?.[0]?.meta;
        if (quote?.regularMarketPrice) {
          priceMap.set(ticker, quote.regularMarketPrice);
        }
      } catch {
        // Skip ticker on failure
      }
    });

    await Promise.allSettled(promises);

    // Rate limit between batches
    if (i + BATCH < tickers.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return priceMap;
}

/** Recompute hit rates from completed signals. */
async function recomputeHitRates(): Promise<void> {
  const scanners = ["ew", "squeeze", "confluence", "prerun"] as const;
  const rates: Parameters<typeof upsertHitRates>[0] = [];

  for (const scanner of scanners) {
    const signals = await fetchCompletedSignals(scanner);
    if (signals.length === 0) continue;

    // Group by mode and strength
    const groups = new Map<string, typeof signals>();
    for (const s of signals) {
      const key = `${s.mode ?? "all"}|${s.signal_strength ?? "all"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }

    for (const [key, group] of groups) {
      const [mode, strength] = key.split("|");

      for (const periodDays of [7, 30]) {
        const priceField = periodDays === 7 ? "price_7d" : "price_30d";
        const withPrice = group.filter((s) => s[priceField] != null);
        if (withPrice.length < 5) continue; // Need at least 5 signals for meaningful stats

        const isBearish = mode === "wave5";
        const returns = withPrice.map((s) => {
          const futurePrice = s[priceField]!;
          return ((futurePrice - s.price_at_signal) / s.price_at_signal) * 100;
        });

        // Direction-aware: bearish signals "hit" when price drops (negative return)
        const hitCount = returns.filter((r) => isBearish ? r < 0 : r > 0).length;
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const drawdowns = withPrice
          .map((s) => s.max_drawdown_pct)
          .filter((d): d is number => d != null);
        const avgDrawdown = drawdowns.length > 0
          ? drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length
          : 0;

        rates.push({
          scanner,
          mode: mode === "all" ? null : mode,
          signal_strength: strength === "all" ? null : strength,
          period_days: periodDays,
          total_signals: withPrice.length,
          hit_count: hitCount,
          hit_rate: Math.round((hitCount / withPrice.length) * 1000) / 1000,
          avg_return_pct: Math.round(avgReturn * 100) / 100,
          avg_max_drawdown_pct: Math.round(avgDrawdown * 100) / 100,
        });
      }
    }
  }

  if (rates.length > 0) {
    await upsertHitRates(rates);
  }
}
