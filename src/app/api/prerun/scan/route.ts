import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTickers } from "@/lib/api-utils";
import { fetchPreRunData, preFilterTickers } from "@/lib/prerun/data";
import { autoScorePreRun } from "@/lib/prerun/scoring";
import { scoreVCP } from "@/lib/prerun/vcp-scoring";
import { scoreInstitutionalAcceleration } from "@/lib/prerun/institutional-scoring";
import { scoreInflection } from "@/lib/prerun/inflection-scoring";
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
    const body = (await request.json()) as { tickers: string[]; emaTimeframe?: EmaTimeframe; sectorQuadrants?: Record<string, string>; viewMode?: VCPViewMode; targetDate?: string; preFilter?: boolean };
    let tickers = validateTickers(body.tickers).slice(0, 1500);
    const emaTimeframe = body.emaTimeframe ?? "15m";
    const sectorQuadrants = body.sectorQuadrants ?? {};
    const viewMode = body.viewMode ?? "standard";
    const targetDate = body.targetDate;
    const usePreFilter = body.preFilter ?? true;
    if (!tickers.length) {
      return NextResponse.json({ error: "tickers array required (valid A-Z tickers)" }, { status: 400 });
    }
    if (targetDate) {
      const d = new Date(targetDate);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid targetDate format (expected YYYY-MM-DD)" }, { status: 400 });
      }
    }

    // Pre-filter: eliminate penny stocks, delisted, and sub-$100M market cap
    let preFilterSkipped = 0;
    if (usePreFilter) {
      const pf = await preFilterTickers(tickers);
      preFilterSkipped = pf.skipped;
      tickers = pf.passed;
    }

    const results = [];
    const failedTickers: string[] = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchPreRunData(ticker, emaTimeframe, targetDate);
          if (!data) return { ticker, failed: true as const };
          if (viewMode === "vcp") {
            return scoreVCP(data);
          }
          if (viewMode === "institutional") {
            return scoreInstitutionalAcceleration(data);
          }
          if (viewMode === "inflection") {
            return scoreInflection(data);
          }
          const sector = getSectorForTicker(ticker);
          const quadrant = sector ? sectorQuadrants[sector] ?? null : null;
          return autoScorePreRun(data, quadrant);
        })
      );

      for (let j = 0; j < settled.length; j++) {
        const r = settled[j];
        if (r.status === "fulfilled" && r.value) {
          if ("failed" in r.value) {
            failedTickers.push(batch[j]);
          } else {
            results.push(r.value);
          }
        } else if (r.status === "rejected") {
          failedTickers.push(batch[j]);
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
    } else if (viewMode === "institutional") {
      results.sort((a, b) => {
        const aScore = "compositeScore" in a.scores ? (a.scores as { compositeScore: number }).compositeScore : 0;
        const bScore = "compositeScore" in b.scores ? (b.scores as { compositeScore: number }).compositeScore : 0;
        return bScore - aScore;
      });
    } else if (viewMode === "inflection") {
      results.sort((a, b) => {
        const aScore = "overallScore" in a.scores ? (a.scores as { overallScore: number }).overallScore : 0;
        const bScore = "overallScore" in b.scores ? (b.scores as { overallScore: number }).overallScore : 0;
        return bScore - aScore;
      });
    } else {
      results.sort((a, b) => {
        const aScore = "finalScore" in a.scores ? (a.scores as { finalScore: number }).finalScore : 0;
        const bScore = "finalScore" in b.scores ? (b.scores as { finalScore: number }).finalScore : 0;
        return bScore - aScore;
      });
    }

    return NextResponse.json({ results, count: results.length, viewMode, targetDate, preFilterSkipped: preFilterSkipped > 0 ? preFilterSkipped : undefined, failedTickers: failedTickers.length > 0 ? failedTickers : undefined });
  } catch (err) {
    logError("api/prerun/scan", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 502 }
    );
  }
}
