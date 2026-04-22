/**
 * Shared alert logic used by both /api/alert (manual) and /api/alert/cron (scheduled).
 * Extracts the common fetch → score → filter → send pipeline.
 */

import { scoreBatchEnhanced, type EnrichedQuoteInput } from "@/lib/ew-scoring";
import { applyModeFilters } from "@/lib/ew-scanner-modes";
import { formatAlertMessage, sendTelegramMessage } from "@/lib/ew-telegram";
import { UNIVERSES, type UniverseKey } from "@/data/ew-universes";
import type { AlertConfig, ConfidenceTier, ScannerMode, EnhancedScoredCandidate } from "@/lib/ew-types";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { logError } from "./error-logger";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const LAST_ALERT_PATH = join(tmpdir(), "ew-last-alert.json");
const BATCH_SIZE = 10;
const BATCH_DELAY = 300;

const CONFIDENCE_ORDER: Record<ConfidenceTier, number> = {
  high: 0,
  probable: 1,
  speculative: 2,
};

export async function fetchQuote(ticker: string): Promise<EnrichedQuoteInput | null> {
  try {
    const url = `${YAHOO_CHART}/${encodeURIComponent(ticker)}?interval=1wk&range=5y&includePrePost=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
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

    let athIdx = 0, athValue = -Infinity;
    for (let i = 0; i < highs.length; i++) {
      if (highs[i] != null && highs[i]! > athValue) { athValue = highs[i]!; athIdx = i; }
    }

    let lowIdx = athIdx, lowValue = Infinity;
    for (let i = athIdx; i < lows.length; i++) {
      if (lows[i] != null && lows[i]! < lowValue) { lowValue = lows[i]!; lowIdx = i; }
    }
    if (lowValue === Infinity) lowValue = current;

    const toYear = (ts: number) => new Date(ts * 1000).getFullYear();

    // Build clean series
    const cleanOpen: number[] = [], cleanHigh: number[] = [], cleanLow: number[] = [];
    const cleanClose: number[] = [], cleanVolume: number[] = [], cleanTs: number[] = [];
    const rawToClean = new Map<number, number>();
    const opens: (number | null)[] = quote.open ?? [];
    const volumes: (number | null)[] = quote.volume ?? [];

    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      rawToClean.set(i, cleanClose.length);
      cleanTs.push(timestamps[i]);
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

    return {
      ticker,
      name: ticker,
      ath: Math.round(athValue * 100) / 100,
      low: Math.round(lowValue * 100) / 100,
      current: Math.round(current * 100) / 100,
      athYear: toYear(timestamps[athIdx]),
      lowYear: toYear(timestamps[lowIdx]),
      series: {
        timestamps: cleanTs,
        open: cleanOpen,
        high: cleanHigh,
        low: cleanLow,
        close: cleanClose,
        volume: cleanVolume,
      },
      athIdx: cleanAthIdx,
      lowIdx: cleanLowIdx,
    };
  } catch (err) {
    logError("fetchQuote", err, { ticker });
    return null;
  }
}

export async function runAlertPipeline(config: AlertConfig): Promise<{
  sent: boolean;
  candidateCount: number;
  newCount: number;
  filtered: EnhancedScoredCandidate[];
  error?: string;
}> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return { sent: false, candidateCount: 0, newCount: 0, filtered: [], error: "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set" };
  }

  const { mode, universe, minConfidence, filters } = config;

  // Resolve tickers
  const tickers = UNIVERSES[universe as UniverseKey] ?? [];
  if (tickers.length === 0) {
    return { sent: false, candidateCount: 0, newCount: 0, filtered: [], error: `Unknown universe: ${universe}` };
  }

  // Fetch quotes in batches
  const quotes: EnrichedQuoteInput[] = [];
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((t) => fetchQuote(t.symbol).then((q) => {
        if (q) { q.name = t.name; q.sector = t.sector; }
        return q;
      }))
    );
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) quotes.push(r.value);
    }
    if (i + BATCH_SIZE < tickers.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  if (quotes.length === 0) {
    return { sent: false, candidateCount: 0, newCount: 0, filtered: [], error: "No quotes fetched" };
  }

  // Score
  const scored = scoreBatchEnhanced(quotes, {
    minDecline: filters.minDecline,
    minDuration: filters.minMonths,
    minRecovery: filters.minRecovery,
    mode: mode as ScannerMode,
  });

  const passed = scored.filter((s) => s.passed);
  const modeFiltered = applyModeFilters(passed, mode as ScannerMode);

  // Filter by confidence
  const minConf = CONFIDENCE_ORDER[minConfidence] ?? 2;
  const filtered = modeFiltered.filter(
    (c) => CONFIDENCE_ORDER[c.confidenceTier] <= minConf
  );

  // Load previous alert for diff
  let previousTickers: string[] = [];
  try {
    if (existsSync(LAST_ALERT_PATH)) {
      const prev = JSON.parse(readFileSync(LAST_ALERT_PATH, "utf-8"));
      previousTickers = prev.tickers ?? [];
    }
  } catch {
    // ignore
  }

  const currentTickers = filtered.map((c) => c.ticker);
  const prevSet = new Set(previousTickers);
  const newTickers = currentTickers.filter((t) => !prevSet.has(t));

  // Format and send
  const message = formatAlertMessage(filtered, mode as ScannerMode, universe, newTickers, {});
  const tgResult = await sendTelegramMessage(botToken, chatId, message);

  // Save current for next diff
  try {
    writeFileSync(
      LAST_ALERT_PATH,
      JSON.stringify({ tickers: currentTickers, timestamp: new Date().toISOString() })
    );
  } catch {
    // ignore -- /tmp may not persist on serverless
  }

  return {
    sent: tgResult.ok,
    candidateCount: filtered.length,
    newCount: newTickers.length,
    filtered,
    ...(tgResult.error ? { error: tgResult.error } : {}),
  };
}
