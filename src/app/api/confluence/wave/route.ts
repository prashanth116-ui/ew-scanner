import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTickers } from "@/lib/api-utils";
import { fetchEWQuoteData } from "@/lib/ew-quote-fetch";
import { detectElliottWaves, type P2ImpulsePattern } from "@/lib/phase2-wave-detector";
import type { PriceSeries } from "@/lib/ew-types";

const FETCH_TIMEOUT = 15000;

interface WaveScoreResult {
  score: number;
  label: string;
  direction: 1 | -1 | null;
  confidence: number;
  hasCorrection: boolean;
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(`confluence-wave:${getClientKey(request)}`, 120, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const body = (await request.json()) as {
      tickers: string[];
      timeframe?: "weekly" | "daily";
      scales?: number[];
    };
    const tickers = validateTickers(body.tickers).slice(0, 25);
    if (!tickers.length) {
      return NextResponse.json(
        { error: "tickers array required (max 25)" },
        { status: 400 }
      );
    }

    const timeframe = body.timeframe ?? "weekly";
    const scales = body.scales ?? (timeframe === "weekly" ? [3, 5, 8] : [4, 8, 16]);

    const results: Record<string, WaveScoreResult> = {};

    const settled = await Promise.allSettled(
      tickers.map(async (ticker): Promise<[string, WaveScoreResult] | null> => {
        const result = await Promise.race([
          scoreWaveForTicker(ticker, timeframe, scales),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), FETCH_TIMEOUT)
          ),
        ]);
        if (!result) return null;
        return [ticker, result];
      })
    );

    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) {
        results[r.value[0]] = r.value[1];
      }
    }

    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }
    );
  } catch (err) {
    logError("api/confluence/wave", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Wave scan failed" },
      { status: 502 }
    );
  }
}

async function scoreWaveForTicker(
  ticker: string,
  timeframe: "weekly" | "daily",
  scales: number[],
): Promise<WaveScoreResult | null> {
  const quoteData = await fetchEWQuoteData(ticker, { detail: true });
  if (!quoteData) return null;

  const series: PriceSeries | undefined = timeframe === "weekly"
    ? quoteData.series
    : undefined;

  // For daily, we need to fetch separately
  if (!series && timeframe === "weekly") return null;

  const effectiveSeries = series ?? quoteData.series;
  if (!effectiveSeries || effectiveSeries.close.length < 20) return null;

  const ewResult = detectElliottWaves(effectiveSeries, scales);
  const validPatterns = ewResult.patterns.filter((p) => p.isValid);

  if (validPatterns.length === 0) {
    return { score: 0, label: "No patterns", direction: null, confidence: 0, hasCorrection: false };
  }

  // Find highest confidence pattern
  const best = validPatterns.reduce((a, b) =>
    b.confidence > a.confidence ? b : a
  );

  // Score formula: confidence (0-95 -> 0-100), bonus for ABC, bonus for correction entry zone
  let score = Math.round((best.confidence / 95) * 100);

  const hasCorrection = best.correction !== null;
  if (hasCorrection) score = Math.min(100, score + 10);

  // Bonus for correction entry zone: price near fib levels
  const currentPrice = effectiveSeries.close[effectiveSeries.close.length - 1];
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

  // Generate label
  let label = `${best.direction === 1 ? "Bull" : "Bear"} impulse (${best.confidence}%)`;
  if (hasCorrection) {
    label += ` + ABC ${best.correction!.correctionType}`;
  }

  return {
    score: Math.min(100, score),
    label,
    direction: best.direction,
    confidence: best.confidence,
    hasCorrection,
  };
}
