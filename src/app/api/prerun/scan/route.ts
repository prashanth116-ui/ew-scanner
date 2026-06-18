import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTickers } from "@/lib/api-utils";
import { fetchPreRunData } from "@/lib/prerun/data";
import { autoScorePreRun } from "@/lib/prerun/scoring";
import { scoreVCP } from "@/lib/prerun/vcp-scoring";
import { getSectorForTicker } from "@/data/prerun-universe";
import type { EmaTimeframe, VCPViewMode } from "@/lib/prerun/types";

const BATCH_SIZE = 25;
const BATCH_DELAY = 300;

export async function POST(request: NextRequest) {
  const rl = rateLimit(`prerun-scan:${getClientKey(request)}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const body = (await request.json()) as { tickers: string[]; emaTimeframe?: EmaTimeframe; sectorQuadrants?: Record<string, string>; viewMode?: VCPViewMode };
    const tickers = validateTickers(body.tickers).slice(0, 1500);
    const emaTimeframe = body.emaTimeframe ?? "15m";
    const sectorQuadrants = body.sectorQuadrants ?? {};
    const viewMode = body.viewMode ?? "standard";
    if (!tickers.length) {
      return NextResponse.json({ error: "tickers array required (valid A-Z tickers)" }, { status: 400 });
    }

    const results = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchPreRunData(ticker, emaTimeframe);
          if (!data) return null;
          if (viewMode === "vcp") {
            return scoreVCP(data);
          }
          const sector = getSectorForTicker(ticker);
          const quadrant = sector ? sectorQuadrants[sector] ?? null : null;
          return autoScorePreRun(data, quadrant);
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

    // Sort by score desc
    if (viewMode === "vcp") {
      results.sort((a, b) => {
        const aScore = "totalScore" in a.scores ? (a.scores as { totalScore: number }).totalScore : 0;
        const bScore = "totalScore" in b.scores ? (b.scores as { totalScore: number }).totalScore : 0;
        return bScore - aScore;
      });
    } else {
      results.sort((a, b) => {
        const aScore = "finalScore" in a.scores ? (a.scores as { finalScore: number }).finalScore : 0;
        const bScore = "finalScore" in b.scores ? (b.scores as { finalScore: number }).finalScore : 0;
        return bScore - aScore;
      });
    }

    return NextResponse.json({ results, count: results.length, viewMode });
  } catch (err) {
    logError("api/prerun/scan", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 502 }
    );
  }
}
