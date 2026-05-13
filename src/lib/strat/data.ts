/**
 * Strat data fetching — fetches 3 timeframes per ticker via Yahoo Finance.
 * SERVER-ONLY: Used by /api/strat/* routes.
 */

import "server-only";

import type { StratTimeframe, StratBar } from "./types";
import { classifyBars, barDirection } from "./engine";
import { fetchYahooChart } from "@/lib/prerun/data";

/** Fetch and classify bars for a single timeframe. */
async function fetchTimeframe(
  ticker: string,
  range: string,
  interval: string,
  label: "monthly" | "weekly" | "daily"
): Promise<StratTimeframe | null> {
  const chart = await fetchYahooChart(ticker, range, interval);
  if (!chart || chart.closes.length < 2) return null;

  const allBars = classifyBars(
    chart.opens,
    chart.highs,
    chart.lows,
    chart.closes,
    chart.volumes,
    chart.timestamps
  );

  if (allBars.length < 2) return null;

  // Keep last 10 bars for combo + PMG detection
  const bars = allBars.slice(-10);
  const currentBar = bars[bars.length - 1];
  const priorBar = bars.length >= 2 ? bars[bars.length - 2] : bars[0];

  return {
    label,
    bars,
    currentBarType: currentBar.barType,
    priorBarType: priorBar.barType,
    direction: barDirection(currentBar.barType, currentBar.open, currentBar.close),
  };
}

/** Fetch all 3 timeframes for a ticker in parallel. */
export async function fetchStratData(ticker: string): Promise<{
  monthly: StratTimeframe | null;
  weekly: StratTimeframe | null;
  daily: StratTimeframe | null;
  currentPrice: number | null;
  companyName: string;
} | null> {
  const [monthlyResult, weeklyResult, dailyResult] = await Promise.allSettled([
    fetchTimeframe(ticker, "5y", "1mo", "monthly"),
    fetchTimeframe(ticker, "5y", "1wk", "weekly"),
    fetchTimeframe(ticker, "1y", "1d", "daily"),
  ]);

  const monthly = monthlyResult.status === "fulfilled" ? monthlyResult.value : null;
  const weekly = weeklyResult.status === "fulfilled" ? weeklyResult.value : null;
  const daily = dailyResult.status === "fulfilled" ? dailyResult.value : null;

  // Need at least daily data to produce results
  if (!daily) return null;

  const lastBar = daily.bars[daily.bars.length - 1];
  const currentPrice = lastBar?.close ?? null;

  return {
    monthly,
    weekly,
    daily,
    currentPrice,
    companyName: ticker.toUpperCase(),
  };
}
