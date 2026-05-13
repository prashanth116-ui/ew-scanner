import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTickers } from "@/lib/api-utils";
import { fetchStratData } from "@/lib/strat/data";
import { scoreStrat } from "@/lib/strat/scoring";
import { getStratTickerInfo } from "@/data/strat-universe";

const BATCH_SIZE = 10;
const BATCH_DELAY = 1000;

export async function POST(request: NextRequest) {
  const rl = rateLimit(`strat-scan:${getClientKey(request)}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const body = (await request.json()) as { tickers: string[] };
    const tickers = validateTickers(body.tickers).slice(0, 1500);
    if (!tickers.length) {
      return NextResponse.json(
        { error: "tickers array required (valid A-Z tickers)" },
        { status: 400 }
      );
    }

    const results = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchStratData(ticker);
          if (!data) return null;
          const info = getStratTickerInfo(ticker);
          const companyName = info?.name ?? data.companyName;
          return scoreStrat(
            ticker,
            companyName,
            data.currentPrice,
            data.monthly,
            data.weekly,
            data.daily
          );
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

    // Sort by totalScore desc
    results.sort((a, b) => b.scores.totalScore - a.scores.totalScore);

    return NextResponse.json({ results, count: results.length });
  } catch (err) {
    logError("api/strat/scan", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 502 }
    );
  }
}
