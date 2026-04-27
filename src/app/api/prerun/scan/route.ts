import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTickers } from "@/lib/api-utils";
import { fetchPreRunData } from "@/lib/prerun/data";
import { autoScorePreRun } from "@/lib/prerun/scoring";

const BATCH_SIZE = 10;
const BATCH_DELAY = 1000; // 1s between batches for rate limiting

export async function POST(request: NextRequest) {
  const rl = rateLimit(`prerun-scan:${getClientKey(request)}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const body = (await request.json()) as { tickers: string[] };
    const tickers = validateTickers(body.tickers).slice(0, 800);
    if (!tickers.length) {
      return NextResponse.json({ error: "tickers array required (valid A-Z tickers)" }, { status: 400 });
    }

    const results = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchPreRunData(ticker);
          if (!data) return null;
          return autoScorePreRun(data);
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          results.push(r.value);
        }
      }

      // Delay between batches
      if (i + BATCH_SIZE < tickers.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    // Sort by finalScore desc
    results.sort((a, b) => b.scores.finalScore - a.scores.finalScore);

    return NextResponse.json({ results, count: results.length });
  } catch (err) {
    logError("api/prerun/scan", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 502 }
    );
  }
}
