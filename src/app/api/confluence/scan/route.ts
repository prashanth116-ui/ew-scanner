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

        const ewRaw = ewSettled.status === "fulfilled" ? ewSettled.value : null;
        const squeezeRaw = squeezeSettled.status === "fulfilled" ? squeezeSettled.value : null;
        const prerunRaw = prerunSettled.status === "fulfilled" ? prerunSettled.value : null;

        // Need at least one scanner result
        if (!ewRaw && !squeezeRaw && !prerunRaw) return null;

        // Determine company name from whichever source has it
        const name =
          (squeezeRaw as ConfluenceSqueezeResult & { _name?: string })?._name ??
          (prerunRaw as ConfluencePreRunResult & { _name?: string })?._name ??
          ticker;

        // Extract price before stripping internal fields
        const price = (ewRaw as ConfluenceEWResult & { _price?: number })?._price;

        return {
          ticker,
          name,
          price,
          ewResult: ewRaw ? stripInternal(ewRaw) : null,
          squeezeResult: squeezeRaw ? stripInternal(squeezeRaw) : null,
          prerunResult: prerunRaw ? stripInternal(prerunRaw) : null,
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

/** Strip internal _-prefixed fields before sending to client. */
function stripInternal<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    let hasInternal = false;
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      if (key.startsWith("_")) {
        hasInternal = true;
      } else {
        cleaned[key] = val;
      }
    }
    return hasInternal ? (cleaned as T) : obj;
  }
  return obj;
}

async function fetchAndScoreEW(ticker: string): Promise<(ConfluenceEWResult & { _price?: number }) | null> {
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
    _price: quoteData.current,
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
    components: scored.components,
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
