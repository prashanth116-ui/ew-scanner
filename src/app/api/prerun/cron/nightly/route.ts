import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData } from "@/lib/prerun/data";
import { autoScorePreRun } from "@/lib/prerun/scoring";
import { getAllPreRunTickers } from "@/data/prerun-universe";
import type { PreRunResult } from "@/lib/prerun/types";

const BATCH_SIZE = 10;
const BATCH_DELAY = 1100; // Respect Finnhub 60/min rate limit

export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tickers = getAllPreRunTickers();
    const results: PreRunResult[] = [];

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

      if (i + BATCH_SIZE < tickers.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    // Filter to qualifying candidates (gates pass + score >= 7)
    const qualifying = results.filter(
      (r) => r.gates.gate1 && r.gates.gate3 && r.scores.finalScore >= 7
    );

    qualifying.sort((a, b) => b.scores.finalScore - a.scores.finalScore);

    return NextResponse.json({
      scannedCount: tickers.length,
      fetchedCount: results.length,
      qualifyingCount: qualifying.length,
      qualifying: qualifying.map((r) => ({
        ticker: r.data.ticker,
        companyName: r.data.companyName,
        score: r.scores.finalScore,
        verdict: r.verdict,
        pctFromAth: r.data.pctFromAth,
        shortFloat: r.data.shortFloat,
        daysToEarnings: r.data.daysToEarnings,
      })),
    });
  } catch (err) {
    logError("api/prerun/cron/nightly", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
