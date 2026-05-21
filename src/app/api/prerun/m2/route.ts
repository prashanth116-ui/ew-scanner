import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTickers } from "@/lib/api-utils";
import { fetchM2Only } from "@/lib/prerun/data";
import type { EmaTimeframe, MultiTFM2Result, M2TimeframeResult } from "@/lib/prerun/types";
import { ALL_EMA_TIMEFRAMES } from "@/lib/prerun/types";

const BATCH_SIZE = 10;
const BATCH_DELAY = 1000;

export async function POST(request: NextRequest) {
  const rl = rateLimit(`prerun-m2:${getClientKey(request)}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const body = (await request.json()) as {
      tickers: string[];
      timeframes?: EmaTimeframe[];
    };
    const tickers = validateTickers(body.tickers).slice(0, 200);
    const timeframes = (body.timeframes ?? [...ALL_EMA_TIMEFRAMES]).filter(
      (tf) => ALL_EMA_TIMEFRAMES.includes(tf)
    );

    if (!tickers.length) {
      return NextResponse.json(
        { error: "tickers array required (valid A-Z tickers)" },
        { status: 400 }
      );
    }
    if (!timeframes.length) {
      return NextResponse.json(
        { error: "timeframes array required" },
        { status: 400 }
      );
    }

    const results: MultiTFM2Result[] = [];

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const tfResults: Partial<Record<EmaTimeframe, M2TimeframeResult | null>> = {};

          // Fetch all timeframes for this ticker in parallel
          const tfSettled = await Promise.allSettled(
            timeframes.map(async (tf) => {
              const result = await fetchM2Only(ticker, tf);
              return { tf, result };
            })
          );

          for (const r of tfSettled) {
            if (r.status === "fulfilled") {
              tfResults[r.value.tf] = r.value.result;
            }
          }

          return { ticker: ticker.toUpperCase(), timeframes: tfResults } as MultiTFM2Result;
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled") {
          results.push(r.value);
        }
      }

      // Delay between batches
      if (i + BATCH_SIZE < tickers.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    return NextResponse.json({ results, count: results.length });
  } catch (err) {
    logError("api/prerun/m2", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "M2 fetch failed" },
      { status: 502 }
    );
  }
}
