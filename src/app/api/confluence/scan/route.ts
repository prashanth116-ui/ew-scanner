import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTickers } from "@/lib/api-utils";
import { fetchEWQuoteData } from "@/lib/ew-wave/quote-fetch";
import { scoreEnhanced } from "@/lib/ew-wave/scoring";
import { fetchSqueezeData } from "@/lib/squeeze/fetch";
import { computeSqueezeScore } from "@/lib/squeeze/scoring";
import { fetchPreRunData } from "@/lib/prerun/data";
import { autoScorePreRun } from "@/lib/prerun/scoring";
import { fetchStratData } from "@/lib/strat/data";
import { scoreStrat } from "@/lib/strat/scoring";
import type { ConfluenceScanResult, ConfluenceEWResult, ConfluenceSqueezeResult, ConfluencePreRunResult, ConfluenceStratResult, ConfluenceWaveResult } from "@/lib/confluence/types";
import { detectElliottWaves } from "@/lib/wave-scanner/wave-detector";

const MAX_BATCH = 25;
const FETCH_TIMEOUT = 15000;

/** Create a timeout promise that rejects after ms. */
function timeout<T>(ms: number): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
}

/** Internal result types with _-prefixed transport fields. */
interface InternalEWResult extends ConfluenceEWResult {
  _price?: number;
}
interface InternalSqueezeResult extends ConfluenceSqueezeResult {
  _name?: string;
}
interface InternalPreRunResult extends ConfluencePreRunResult {
  _name?: string;
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(`confluence-scan:${getClientKey(request)}`, 120, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const body = (await request.json()) as { tickers: string[] };
    const tickers = validateTickers(body.tickers).slice(0, MAX_BATCH);
    if (!tickers.length) {
      return NextResponse.json(
        { error: "tickers array required (valid A-Z tickers, max 25)" },
        { status: 400 }
      );
    }

    const results: ConfluenceScanResult[] = [];

    const settled = await Promise.allSettled(
      tickers.map(async (ticker): Promise<ConfluenceScanResult | null> => {
        // Run all 5 per-ticker fetches in parallel
        const [ewSettled, squeezeSettled, prerunSettled, stratSettled, waveSettled] = await Promise.allSettled([
          Promise.race([fetchAndScoreEW(ticker), timeout<InternalEWResult | null>(FETCH_TIMEOUT)]),
          Promise.race([fetchAndScoreSqueeze(ticker), timeout<InternalSqueezeResult | null>(FETCH_TIMEOUT)]),
          Promise.race([fetchAndScorePreRun(ticker), timeout<InternalPreRunResult | null>(FETCH_TIMEOUT)]),
          Promise.race([fetchAndScoreStratData(ticker), timeout<ConfluenceStratResult | null>(FETCH_TIMEOUT)]),
          Promise.race([fetchAndScoreWave(ticker), timeout<ConfluenceWaveResult | null>(FETCH_TIMEOUT)]),
        ]);

        const ewRaw = ewSettled.status === "fulfilled" ? ewSettled.value : null;
        const squeezeRaw = squeezeSettled.status === "fulfilled" ? squeezeSettled.value : null;
        const prerunRaw = prerunSettled.status === "fulfilled" ? prerunSettled.value : null;
        const stratResult = stratSettled.status === "fulfilled" ? stratSettled.value : null;
        const waveResult = waveSettled.status === "fulfilled" ? waveSettled.value : null;

        // Count how many of the 5 scanners returned data
        const scannerCount = [ewRaw, squeezeRaw, prerunRaw, stratResult, waveResult]
          .filter((r) => r != null).length;

        // Need at least 2 scanner results for meaningful confluence
        if (scannerCount < 2) return null;

        // Determine company name from whichever source has it
        const name =
          (squeezeRaw as InternalSqueezeResult | null)?._name ??
          (prerunRaw as InternalPreRunResult | null)?._name ??
          ticker;

        // Extract and strip internal fields via destructuring
        let ewResult: ConfluenceEWResult | null = null;
        if (ewRaw) {
          const { _price: _, ...ew } = ewRaw as InternalEWResult;
          ewResult = ew;
        }

        let squeezeResult: ConfluenceSqueezeResult | null = null;
        if (squeezeRaw) {
          const { _name: _, ...sq } = squeezeRaw as InternalSqueezeResult;
          squeezeResult = sq;
        }

        let prerunResult: ConfluencePreRunResult | null = null;
        if (prerunRaw) {
          const { _name: _, ...pr } = prerunRaw as InternalPreRunResult;
          prerunResult = pr;
        }

        const price = (ewRaw as InternalEWResult | null)?._price;

        return {
          ticker,
          name,
          price,
          ewResult,
          squeezeResult,
          prerunResult,
          stratResult,
          waveResult,
          scannerCount,
        };
      })
    );

    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) {
        results.push(r.value);
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    logError("api/confluence/scan", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 502 }
    );
  }
}

async function fetchAndScoreEW(ticker: string): Promise<InternalEWResult | null> {
  const quoteData = await fetchEWQuoteData(ticker, { detail: true });
  if (!quoteData) return null;

  const scored = scoreEnhanced(
    {
      ticker,
      name: ticker,
      ath: quoteData.ath,
      low: quoteData.low,
      current: quoteData.current,
      athYear: quoteData.athYear,
      lowYear: quoteData.lowYear,
      series: quoteData.series,
      athIdx: quoteData.athIdx,
      lowIdx: quoteData.lowIdx,
      trueAth: quoteData.trueAth,
      trueAthYear: quoteData.trueAthYear,
      trueLow: quoteData.trueLow,
      trueLowYear: quoteData.trueLowYear,
      preAthLow: quoteData.preAthLow,
      preAthLowYear: quoteData.preAthLowYear,
    },
    { minDecline: 10, minDuration: 3, minRecovery: 5 }
  );

  return {
    enhancedScore: scored.enhancedScore,
    enhancedNormalized: scored.enhancedNormalized,
    confidenceTier: scored.confidenceTier,
    fibDepthLabel: scored.fibAnalysis?.nearestLevel?.label ?? undefined,
    wavePosition: scored.waveCount?.position ?? undefined,
    _price: quoteData.current,
  };
}

async function fetchAndScoreSqueeze(ticker: string): Promise<InternalSqueezeResult | null> {
  const data = await fetchSqueezeData(ticker);
  if (!data) return null;

  const scored = computeSqueezeScore(data);

  return {
    squeezeScore: scored.squeezeScore,
    tier: scored.tier,
    shortPercentOfFloat: data.shortPercentOfFloat,
    shortRatio: data.shortRatio,
    components: scored.components,
    _name: data.name,
  };
}

async function fetchAndScorePreRun(ticker: string): Promise<InternalPreRunResult | null> {
  const data = await fetchPreRunData(ticker);
  if (!data) return null;

  const result = autoScorePreRun(data);

  return {
    finalScore: result.scores.finalScore,
    verdict: result.verdict,
    pctFromAth: data.pctFromAth,
    shortFloat: data.shortFloat,
    daysToEarnings: data.daysToEarnings,
    _name: data.companyName,
  };
}

async function fetchAndScoreStratData(ticker: string): Promise<ConfluenceStratResult | null> {
  const data = await fetchStratData(ticker);
  if (!data) return null;

  const result = scoreStrat(ticker, data.companyName, data.currentPrice, data.monthly, data.weekly, data.daily);

  return {
    totalScore: result.scores.totalScore,
    normalizedScore: Math.min(1, result.scores.totalScore / 13),
    signal: result.signal,
    actionDirection: result.actionDirection,
    tfcAlignment: result.tfc.alignment,
    comboCount: result.combos.length,
    hasBroadening: result.broadenings.length > 0,
    longTrigger: result.triggers.longTrigger,
    shortTrigger: result.triggers.shortTrigger,
  };
}

async function fetchAndScoreWave(ticker: string): Promise<ConfluenceWaveResult | null> {
  const quoteData = await fetchEWQuoteData(ticker, { detail: true });
  if (!quoteData?.series || quoteData.series.close.length < 20) return null;

  const ewResult = detectElliottWaves(quoteData.series, [3, 5, 8]);
  const validPatterns = ewResult.patterns.filter((p) => p.isValid);

  if (validPatterns.length === 0) return null;

  const best = validPatterns.reduce((a, b) => (b.confidence > a.confidence ? b : a));

  let score = Math.round((best.confidence / 95) * 100);
  const hasCorrection = best.correction !== null;
  if (hasCorrection) score = Math.min(100, score + 10);

  // Check if price is in fib entry zone
  const currentPrice = quoteData.series.close[quoteData.series.close.length - 1];
  const idx = ewResult.patterns.indexOf(best);
  const fibs = ewResult.fibTargets.get(idx);
  if (fibs && !hasCorrection) {
    const f382 = fibs.levels.find((l) => l.ratio === 0.382);
    const f618 = fibs.levels.find((l) => l.ratio === 0.618);
    if (f382 && f618) {
      const lo = Math.min(f382.price, f618.price);
      const hi = Math.max(f382.price, f618.price);
      if (currentPrice >= lo && currentPrice <= hi) {
        score = Math.min(100, score + 10);
      }
    }
  }

  let label = `${best.direction === 1 ? "Bull" : "Bear"} impulse (${best.confidence}%)`;
  if (hasCorrection) label += ` + ABC ${best.correction!.correctionType}`;

  return {
    score: Math.min(100, score),
    label,
    direction: best.direction,
    confidence: best.confidence,
    hasCorrection,
  };
}
