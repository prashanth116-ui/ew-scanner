/**
 * Earnings data fetcher using Yahoo Finance quoteSummary.
 * SERVER-ONLY: Used by /api/earnings.
 *
 * Modules fetched:
 *   calendarEvents, earningsHistory, earningsTrend, earnings, price,
 *   recommendationTrend, upgradeDowngradeHistory, insiderTransactions,
 *   financialData, majorHoldersBreakdown
 */

import "server-only";

import { getYahooCrumb, invalidateCrumbCache } from "@/lib/squeeze/fetch";
import { extractRaw } from "@/lib/yahoo-utils";
import { logError } from "@/lib/error-logger";

const YAHOO_SUMMARY =
  "https://query1.finance.yahoo.com/v10/finance/quoteSummary";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── Existing types ──

export interface EarningsQuarter {
  quarter: string;
  date: string;
  epsEstimate: number | null;
  epsActual: number | null;
  epsSurprise: number | null;
  surprisePercent: number | null;
}

export interface EarningsEstimate {
  period: string;
  epsAvg: number | null;
  epsLow: number | null;
  epsHigh: number | null;
  numAnalysts: number | null;
  revenueAvg: number | null;
  revenueLow: number | null;
  revenueHigh: number | null;
}

export interface EarningsFinancial {
  quarter: string;
  revenue: number | null;
  earnings: number | null;
}

// ── New types ──

export interface AnalystRatings {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  targetMean: number | null;
  targetMedian: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  recommendationKey: string | null;
  recommendationMean: number | null;
  numAnalysts: number | null;
}

export interface UpgradeDowngrade {
  date: string;
  firm: string;
  toGrade: string;
  fromGrade: string;
  action: string;
}

export interface InsiderTransaction {
  name: string;
  relation: string;
  date: string;
  shares: number | null;
  value: number | null;
  text: string;
}

export interface KeyFinancials {
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  grossMargins: number | null;
  operatingMargins: number | null;
  profitMargins: number | null;
  totalRevenue: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
  currentRatio: number | null;
}

export interface Ownership {
  insidersPercent: number | null;
  institutionsPercent: number | null;
  institutionsFloatPercent: number | null;
  institutionsCount: number | null;
}

// ── Main response ──

export interface EarningsData {
  ticker: string;
  name: string;
  currentPrice: number | null;
  nextEarningsDate: string | null;
  nextEpsEstimate: number | null;
  nextRevenueAvg: number | null;
  nextRevenueLow: number | null;
  nextRevenueHigh: number | null;
  exDividendDate: string | null;
  dividendDate: string | null;
  history: EarningsQuarter[];
  estimates: EarningsEstimate[];
  financials: EarningsFinancial[];
  analystRatings: AnalystRatings | null;
  upgradeDowngrades: UpgradeDowngrade[];
  insiderTransactions: InsiderTransaction[];
  keyFinancials: KeyFinancials | null;
  ownership: Ownership | null;
}

const PERIOD_LABELS: Record<string, string> = {
  "0q": "Current Qtr",
  "+1q": "Next Qtr",
  "0y": "Current Year",
  "+1y": "Next Year",
};

const MODULES = [
  "calendarEvents",
  "earningsHistory",
  "earningsTrend",
  "earnings",
  "price",
  "recommendationTrend",
  "upgradeDowngradeHistory",
  "insiderTransactions",
  "financialData",
  "majorHoldersBreakdown",
].join(",");

/** Fetch earnings data for a single ticker via Yahoo Finance quoteSummary. */
export async function fetchEarningsData(
  ticker: string
): Promise<EarningsData | null> {
  const auth = await getYahooCrumb();
  if (!auth) return null;

  const url = `${YAHOO_SUMMARY}/${encodeURIComponent(ticker)}?modules=${MODULES}&crumb=${encodeURIComponent(auth.crumb)}`;

  let res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: auth.cookie },
  });

  // If 401, invalidate crumb and retry once
  if (res.status === 401) {
    invalidateCrumbCache();
    const retryAuth = await getYahooCrumb();
    if (!retryAuth) return null;

    const retryUrl = `${YAHOO_SUMMARY}/${encodeURIComponent(ticker)}?modules=${MODULES}&crumb=${encodeURIComponent(retryAuth.crumb)}`;
    res = await fetch(retryUrl, {
      headers: { "User-Agent": UA, Cookie: retryAuth.cookie },
    });
  }

  if (!res.ok) return null;
  const data = await res.json();

  const result = (
    data as { quoteSummary?: { result?: Record<string, unknown>[] } }
  )?.quoteSummary?.result?.[0];
  if (!result) {
    logError("earnings/fetch", new Error("Empty modules"), { ticker, modules: Object.keys((data as Record<string, unknown>)?.quoteSummary ?? {}) });
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (key: string) => (result[key] ?? {}) as Record<string, any>;

  const price = mod("price");
  const calendarEvents = mod("calendarEvents");
  const earningsHistory = mod("earningsHistory");
  const earningsTrend = mod("earningsTrend");
  const earnings = mod("earnings");
  const recTrend = mod("recommendationTrend");
  const upgradeHistory = mod("upgradeDowngradeHistory");
  const insiderTx = mod("insiderTransactions");
  const finData = mod("financialData");
  const holders = mod("majorHoldersBreakdown");

  // ── Calendar events ──
  const earningsInfo = (calendarEvents.earnings ?? {}) as Record<
    string,
    unknown
  >;
  const earningsDates = earningsInfo.earningsDate as
    | { raw: number; fmt: string }[]
    | undefined;
  const nextEarningsDate = earningsDates?.[0]?.fmt ?? null;
  const nextEpsEstimate = extractRaw(earningsInfo.earningsAverage);
  const nextRevenueAvg = extractRaw(earningsInfo.revenueAverage);
  const nextRevenueLow = extractRaw(earningsInfo.revenueLow);
  const nextRevenueHigh = extractRaw(earningsInfo.revenueHigh);

  const exDividendDate =
    (calendarEvents.exDividendDate as { fmt?: string })?.fmt ?? null;
  const dividendDate =
    (calendarEvents.dividendDate as { fmt?: string })?.fmt ?? null;

  // ── Historical quarterly EPS ──
  const historyRaw = (earningsHistory.history ?? []) as Record<
    string,
    unknown
  >[];
  const history: EarningsQuarter[] = historyRaw
    .map((h) => ({
      quarter: (h.period as string) ?? "",
      date: (h.quarter as { fmt: string })?.fmt ?? "",
      epsEstimate: extractRaw(h.epsEstimate),
      epsActual: extractRaw(h.epsActual),
      epsSurprise: extractRaw(h.epsDifference),
      surprisePercent: extractRaw(h.surprisePercent),
    }))
    .reverse();

  // ── Forward estimates ──
  const trendRaw = (earningsTrend.trend ?? []) as Record<string, unknown>[];
  const estimates: EarningsEstimate[] = trendRaw.map((t) => {
    const epsEst = (t.earningsEstimate ?? {}) as Record<string, unknown>;
    const revEst = (t.revenueEstimate ?? {}) as Record<string, unknown>;
    return {
      period:
        PERIOD_LABELS[t.period as string] ?? (t.period as string) ?? "",
      epsAvg: extractRaw(epsEst.avg),
      epsLow: extractRaw(epsEst.low),
      epsHigh: extractRaw(epsEst.high),
      numAnalysts: extractRaw(epsEst.numberOfAnalysts),
      revenueAvg: extractRaw(revEst.avg),
      revenueLow: extractRaw(revEst.low),
      revenueHigh: extractRaw(revEst.high),
    };
  });

  // ── Quarterly financials ──
  const financialsChart = (earnings.financialsChart ?? {}) as Record<
    string,
    unknown
  >;
  const quarterlyRaw = (financialsChart.quarterly ?? []) as Record<
    string,
    unknown
  >[];
  const financials: EarningsFinancial[] = quarterlyRaw.map((q) => ({
    quarter: (q.date as string) ?? "",
    revenue: extractRaw(q.revenue),
    earnings: extractRaw(q.earnings),
  }));

  // ── Analyst ratings (current month) ──
  let analystRatings: AnalystRatings | null = null;
  const trendArr = (recTrend.trend ?? []) as Record<string, unknown>[];
  const current = trendArr.find((t) => t.period === "0m") ?? trendArr[0];
  if (current) {
    analystRatings = {
      strongBuy: (current.strongBuy as number) ?? 0,
      buy: (current.buy as number) ?? 0,
      hold: (current.hold as number) ?? 0,
      sell: (current.sell as number) ?? 0,
      strongSell: (current.strongSell as number) ?? 0,
      targetMean: extractRaw(finData.targetMeanPrice),
      targetMedian: extractRaw(finData.targetMedianPrice),
      targetHigh: extractRaw(finData.targetHighPrice),
      targetLow: extractRaw(finData.targetLowPrice),
      recommendationKey: (finData.recommendationKey as string) ?? null,
      recommendationMean: extractRaw(finData.recommendationMean),
      numAnalysts: extractRaw(finData.numberOfAnalystOpinions),
    };
  }

  // ── Upgrade/downgrade history (last 15) ──
  const udRaw = (upgradeHistory.history ?? []) as Record<string, unknown>[];
  const upgradeDowngrades: UpgradeDowngrade[] = udRaw.slice(0, 15).map((u) => {
    const epoch = extractRaw(u.epochGradeDate);
    const dateStr = epoch
      ? new Date(epoch * 1000).toISOString().slice(0, 10)
      : "";
    return {
      date: dateStr,
      firm: (u.firm as string) ?? "",
      toGrade: (u.toGrade as string) ?? "",
      fromGrade: (u.fromGrade as string) ?? "",
      action: (u.action as string) ?? "",
    };
  });

  // ── Insider transactions (last 15) ──
  const txRaw = (insiderTx.transactions ?? []) as Record<string, unknown>[];
  const insiderTransactions: InsiderTransaction[] = txRaw
    .slice(0, 15)
    .map((t) => ({
      name: (t.filerName as string) ?? "",
      relation: (t.filerRelation as string) ?? "",
      date: (t.startDate as { fmt?: string })?.fmt ?? "",
      shares: extractRaw(t.shares),
      value: extractRaw(t.value),
      text: (t.transactionText as string) ?? "",
    }))
    .filter((t) => t.name && t.date);

  // ── Key financials ──
  const keyFinancials: KeyFinancials = {
    revenueGrowth: extractRaw(finData.revenueGrowth),
    earningsGrowth: extractRaw(finData.earningsGrowth),
    grossMargins: extractRaw(finData.grossMargins),
    operatingMargins: extractRaw(finData.operatingMargins),
    profitMargins: extractRaw(finData.profitMargins),
    totalRevenue: extractRaw(finData.totalRevenue),
    totalDebt: extractRaw(finData.totalDebt),
    totalCash: extractRaw(finData.totalCash),
    debtToEquity: extractRaw(finData.debtToEquity),
    returnOnEquity: extractRaw(finData.returnOnEquity),
    currentRatio: extractRaw(finData.currentRatio),
  };

  // ── Ownership ──
  const ownership: Ownership = {
    insidersPercent: extractRaw(holders.insidersPercentHeld),
    institutionsPercent: extractRaw(holders.institutionsPercentHeld),
    institutionsFloatPercent: extractRaw(
      holders.institutionsFloatPercentHeld
    ),
    institutionsCount: extractRaw(holders.institutionsCount),
  };

  return {
    ticker: ticker.toUpperCase(),
    name:
      (price.shortName as string) ??
      (price.longName as string) ??
      ticker.toUpperCase(),
    currentPrice: extractRaw(price.regularMarketPrice),
    nextEarningsDate,
    nextEpsEstimate,
    nextRevenueAvg,
    nextRevenueLow,
    nextRevenueHigh,
    exDividendDate,
    dividendDate,
    history,
    estimates,
    financials,
    analystRatings,
    upgradeDowngrades,
    insiderTransactions,
    keyFinancials,
    ownership,
  };
}
