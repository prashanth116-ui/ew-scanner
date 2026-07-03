import { NextRequest, NextResponse } from "next/server";
import { loadThemeEvents } from "@/lib/policy-pulse/persistence";
import type { ThemeEventRow } from "@/lib/policy-pulse/persistence";
import { getThemeLabel } from "@/data/theme-map";
import { loadPreRunDaily, loadQFEDaily } from "@/lib/supabase/persistence";
import type { ThemeEventWithCrossRef, ScannerCrossRef } from "@/lib/policy-pulse/types";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const days = parseInt(searchParams.get("days") ?? "7", 10);
  const themeId = searchParams.get("theme") ?? undefined;
  const minImpact = parseInt(searchParams.get("minImpact") ?? "0", 10);

  const events = await loadThemeEvents({
    days: Math.min(days, 30),
    themeId,
    minImpact: minImpact || undefined,
  });

  // Cross-reference impacted tickers against today's scanner data
  const today = new Date().toISOString().slice(0, 10);
  const [prerunRows, qfeRows] = await Promise.all([
    loadPreRunDaily(today),
    loadQFEDaily(today),
  ]);

  // Build lookup maps
  const prerunMap = new Map<string, { verdict: string; score: number }>();
  for (const row of prerunRows) {
    prerunMap.set(row.ticker, {
      verdict: row.verdict,
      score: row.final_score,
    });
  }

  const qfeMap = new Map<string, { rating: string; score: number }>();
  for (const row of qfeRows) {
    qfeMap.set(row.ticker, {
      rating: row.rating,
      score: row.qfe_score,
    });
  }

  // Enrich events with cross-refs
  const enriched: ThemeEventWithCrossRef[] = events.map(
    (event: ThemeEventRow) => {
      const scannerData: ScannerCrossRef[] = event.impacted_tickers.map(
        (ticker) => {
          const qfe = qfeMap.get(ticker);
          const prerun = prerunMap.get(ticker);
          return {
            ticker,
            ...(qfe && { qfeRating: qfe.rating, qfeScore: qfe.score }),
            ...(prerun && {
              prerunVerdict: prerun.verdict,
              prerunScore: prerun.score,
            }),
          };
        },
      );

      return {
        id: event.id,
        urlHash: event.url_hash,
        themeId: event.theme_id,
        themeName: getThemeLabel(event.theme_id),
        headline: event.headline,
        summary: event.summary,
        source: event.source,
        sourceUrl: event.source_url,
        publishedAt: event.published_at,
        ingestedAt: event.ingested_at,
        impactScore: event.impact_score,
        impactedTickers: event.impacted_tickers,
        impactedEtfs: event.impacted_etfs,
        expired: event.expired,
        scannerData,
      };
    },
  );

  return NextResponse.json(enriched, {
    headers: {
      "Cache-Control": "s-maxage=300, stale-while-revalidate=120",
    },
  });
}
