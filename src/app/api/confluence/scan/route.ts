import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTickers } from "@/lib/api-utils";
import { fetchEWQuoteData } from "@/lib/ew-quote-fetch";
import { scoreEnhanced } from "@/lib/ew-scoring";
import { fetchSqueezeData } from "@/lib/squeeze-fetch";
import { computeSqueezeScore } from "@/lib/squeeze-scoring";
import { fetchPreRunData } from "@/lib/prerun/data";
import { autoScorePreRun } from "@/lib/prerun/scoring";
import type { ConfluenceScanResult, ConfluenceEWResult, ConfluenceSqueezeResult, ConfluencePreRunResult } from "@/lib/confluence/types";

const MAX_BATCH = 10;

export async function POST(request: NextRequest) {
  const rl = rateLimit(`confluence-scan:${getClientKey(request)}`, 10, 60_000);
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
        { error: "tickers array required (valid A-Z tickers, max 10)" },
        { status: 400 }
      );
    }

    const results: ConfluenceScanResult[] = [];

    const settled = await Promise.allSettled(
      tickers.map(async (ticker): Promise<ConfluenceScanResult | null> => {
        // Run all 3 per-ticker fetches in parallel
        const [ewSettled, squeezeSettled, prerunSettled] = await Promise.allSettled([
          fetchAndScoreEW(ticker),
          fetchAndScoreSqueeze(ticker),
          fetchAndScorePreRun(ticker),
        ]);

        const ewResult = ewSettled.status === "fulfilled" ? ewSettled.value : null;
        const squeezeResult = squeezeSettled.status === "fulfilled" ? squeezeSettled.value : null;
        const prerunResult = prerunSettled.status === "fulfilled" ? prerunSettled.value : null;

        // Need at least one scanner result
        if (!ewResult && !squeezeResult && !prerunResult) return null;

        // Determine company name from whichever source has it
        const name =
          (squeezeResult as ConfluenceSqueezeResult & { _name?: string })?._name ??
          (prerunResult as ConfluencePreRunResult & { _name?: string })?._name ??
          ticker;

        return {
          ticker,
          name,
          ewResult: ewResult ? stripInternal(ewResult) : null,
          squeezeResult: squeezeResult ? stripInternal(squeezeResult) : null,
          prerunResult: prerunResult ? stripInternal(prerunResult) : null,
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

/** Strip internal _name field before sending to client. */
function stripInternal<T>(obj: T): T {
  if (obj && typeof obj === "object" && "_name" in obj) {
    const { _name, ...rest } = obj as Record<string, unknown>;
    void _name;
    return rest as T;
  }
  return obj;
}

async function fetchAndScoreEW(ticker: string): Promise<(ConfluenceEWResult & { _name?: string }) | null> {
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
  };
}

async function fetchAndScoreSqueeze(ticker: string): Promise<(ConfluenceSqueezeResult & { _name?: string }) | null> {
  const data = await fetchSqueezeData(ticker);
  if (!data) return null;

  const scored = computeSqueezeScore(data);

  return {
    squeezeScore: scored.squeezeScore,
    tier: scored.tier,
    shortPercentOfFloat: data.shortPercentOfFloat,
    shortRatio: data.shortRatio,
    _name: data.name,
  };
}

async function fetchAndScorePreRun(ticker: string): Promise<(ConfluencePreRunResult & { _name?: string }) | null> {
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
