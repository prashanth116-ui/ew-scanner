/**
 * Shared EW quote data fetching from Yahoo Finance.
 * SERVER-ONLY: Used by /api/quote and /api/confluence/scan.
 */

import "server-only";

import { findStructuralReferences } from "./ew-structural";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface EWQuoteResult {
  ath: number;
  low: number;
  current: number;
  athYear: number;
  lowYear: number;
  series?: {
    timestamps: number[];
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume: number[];
  };
  athIdx?: number;
  lowIdx?: number;
  trueAth?: number;
  trueAthYear?: number;
  preAthLow?: number;
  preAthLowYear?: number;
}

/**
 * Fetch EW quote data for a single ticker (5y weekly chart from Yahoo).
 * Returns ATH/low detection with structural fallback, optional series data.
 */
export async function fetchEWQuoteData(
  ticker: string,
  options: { detail?: boolean } = {},
): Promise<EWQuoteResult | null> {
  const { detail = true } = options;

  const url = `${YAHOO_CHART}/${encodeURIComponent(ticker)}?interval=1wk&range=5y&includePrePost=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;

  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  if (!quote || !timestamps.length) return null;

  const highs: (number | null)[] = quote.high ?? [];
  const lows: (number | null)[] = quote.low ?? [];
  const closes: (number | null)[] = quote.close ?? [];
  const current: number = result.meta?.regularMarketPrice ?? 0;

  // Find ATH (highest weekly high)
  let athIdx = 0;
  let athValue = -Infinity;
  for (let i = 0; i < highs.length; i++) {
    if (highs[i] != null && highs[i]! > athValue) {
      athValue = highs[i]!;
      athIdx = i;
    }
  }

  // Find lowest low BEFORE ATH (impulse start for Fibonacci)
  let preAthLowIdx = 0;
  let preAthLowValue = Infinity;
  for (let i = 0; i < athIdx; i++) {
    if (lows[i] != null && lows[i]! < preAthLowValue) {
      preAthLowValue = lows[i]!;
      preAthLowIdx = i;
    }
  }

  // Find lowest low AFTER ATH
  let lowIdx = athIdx;
  let lowValue = Infinity;
  for (let i = athIdx; i < lows.length; i++) {
    if (lows[i] != null && lows[i]! < lowValue) {
      lowValue = lows[i]!;
      lowIdx = i;
    }
  }

  if (lowValue === Infinity) lowValue = current;

  const toYear = (ts: number) => new Date(ts * 1000).getFullYear();

  // Structural fallback for stocks at/near ATH
  let trueAth: number | undefined;
  let trueAthYear: number | undefined;

  const cleanHighsForStruct: number[] = [];
  const cleanLowsForStruct: number[] = [];
  const structCleanToRaw: number[] = [];
  const rawToStructClean = new Map<number, number>();
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue;
    rawToStructClean.set(i, cleanHighsForStruct.length);
    structCleanToRaw.push(i);
    cleanHighsForStruct.push(highs[i] ?? closes[i]!);
    cleanLowsForStruct.push(lows[i] ?? closes[i]!);
  }
  const structAthIdx = rawToStructClean.get(athIdx) ?? 0;
  let structLowIdx = rawToStructClean.get(lowIdx) ?? structAthIdx;
  if (structLowIdx <= structAthIdx && cleanHighsForStruct.length > 0) {
    structLowIdx = Math.min(structAthIdx + 1, cleanHighsForStruct.length - 1);
  }

  const structural = findStructuralReferences(
    cleanHighsForStruct, cleanLowsForStruct,
    structAthIdx, structLowIdx, athValue, lowValue,
  );
  if (structural) {
    trueAth = Math.round(athValue * 100) / 100;
    trueAthYear = toYear(timestamps[athIdx]);
    athValue = structural.peakPrice;
    athIdx = structCleanToRaw[structural.peakIdx];
    lowValue = structural.troughPrice;
    lowIdx = structCleanToRaw[structural.troughIdx];
  }

  const response: EWQuoteResult = {
    ath: Math.round(athValue * 100) / 100,
    low: Math.round(lowValue * 100) / 100,
    current: Math.round(current * 100) / 100,
    athYear: toYear(timestamps[athIdx]),
    lowYear: toYear(timestamps[lowIdx]),
  };
  if (trueAth != null) {
    response.trueAth = trueAth;
    response.trueAthYear = trueAthYear;
  }
  if (preAthLowValue < Infinity) {
    response.preAthLow = Math.round(preAthLowValue * 100) / 100;
    response.preAthLowYear = toYear(timestamps[preAthLowIdx]);
  }

  if (detail) {
    const opens: (number | null)[] = quote.open ?? [];
    const volumes: (number | null)[] = quote.volume ?? [];

    const cleanOpen: number[] = [];
    const cleanHigh: number[] = [];
    const cleanLow: number[] = [];
    const cleanClose: number[] = [];
    const cleanVolume: number[] = [];
    const cleanTimestamps: number[] = [];
    const rawToClean: Map<number, number> = new Map();

    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      rawToClean.set(i, cleanClose.length);
      cleanTimestamps.push(timestamps[i]);
      cleanOpen.push(opens[i] ?? closes[i]!);
      cleanHigh.push(highs[i] ?? closes[i]!);
      cleanLow.push(lows[i] ?? closes[i]!);
      cleanClose.push(closes[i]!);
      cleanVolume.push(volumes[i] ?? 0);
    }

    let cleanAthIdx = rawToClean.get(athIdx) ?? 0;
    let cleanLowIdx = rawToClean.get(lowIdx) ?? cleanAthIdx;
    if (cleanLowIdx <= cleanAthIdx && cleanClose.length > 0) {
      cleanLowIdx = Math.min(cleanAthIdx + 1, cleanClose.length - 1);
    }

    response.series = {
      timestamps: cleanTimestamps,
      open: cleanOpen,
      high: cleanHigh,
      low: cleanLow,
      close: cleanClose,
      volume: cleanVolume,
    };
    response.athIdx = cleanAthIdx;
    response.lowIdx = cleanLowIdx;
  }

  return response;
}
