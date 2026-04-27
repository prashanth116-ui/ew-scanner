import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTicker } from "@/lib/api-utils";
import { fetchEWQuoteData } from "@/lib/ew-quote-fetch";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

export async function GET(request: NextRequest) {
  // Rate limit: 200 req/min per IP
  const rl = rateLimit(`quote:${getClientKey(request)}`, 200, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const ticker = validateTicker(request.nextUrl.searchParams.get("ticker"));
  if (!ticker) {
    return NextResponse.json({ error: "Invalid or missing ticker" }, { status: 400 });
  }

  const detail = request.nextUrl.searchParams.get("detail") === "1";
  const mtf = request.nextUrl.searchParams.get("mtf") === "1";

  try {
    const quoteData = await fetchEWQuoteData(ticker, { detail });
    if (!quoteData) {
      return NextResponse.json({ error: "No chart data" }, { status: 404 });
    }

    const baseResponse: Record<string, unknown> = {
      ath: quoteData.ath,
      low: quoteData.low,
      current: quoteData.current,
      athYear: quoteData.athYear,
      lowYear: quoteData.lowYear,
    };
    if (quoteData.trueAth != null) {
      baseResponse.trueAth = quoteData.trueAth;
      baseResponse.trueAthYear = quoteData.trueAthYear;
    }
    if (quoteData.preAthLow != null) {
      baseResponse.preAthLow = quoteData.preAthLow;
      baseResponse.preAthLowYear = quoteData.preAthLowYear;
    }
    if (quoteData.series) {
      baseResponse.series = quoteData.series;
      baseResponse.athIdx = quoteData.athIdx;
      baseResponse.lowIdx = quoteData.lowIdx;
    }

    // MTF: Fetch daily data alongside weekly
    if (mtf && detail) {
      try {
        const dailyUrl = `${YAHOO_CHART}/${encodeURIComponent(ticker)}?interval=1d&range=1y&includePrePost=false`;
        const dailyRes = await fetch(dailyUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        if (dailyRes.ok) {
          const dailyData = await dailyRes.json();
          const dailyResult = dailyData?.chart?.result?.[0];
          if (dailyResult) {
            const dTimestamps: number[] = dailyResult.timestamp ?? [];
            const dQuote = dailyResult.indicators?.quote?.[0];
            if (dQuote && dTimestamps.length > 0) {
              const dCloses: (number | null)[] = dQuote.close ?? [];
              const dOpen: number[] = [];
              const dHigh: number[] = [];
              const dLow: number[] = [];
              const dClose: number[] = [];
              const dVol: number[] = [];
              const dTs: number[] = [];

              for (let i = 0; i < dTimestamps.length; i++) {
                if (dCloses[i] == null) continue;
                dTs.push(dTimestamps[i]);
                dOpen.push((dQuote.open?.[i] as number) ?? dCloses[i]!);
                dHigh.push((dQuote.high?.[i] as number) ?? dCloses[i]!);
                dLow.push((dQuote.low?.[i] as number) ?? dCloses[i]!);
                dClose.push(dCloses[i]!);
                dVol.push((dQuote.volume?.[i] as number) ?? 0);
              }

              baseResponse.dailySeries = {
                timestamps: dTs,
                open: dOpen,
                high: dHigh,
                low: dLow,
                close: dClose,
                volume: dVol,
              };
            }
          }
        }
      } catch {
        // Daily data is non-critical
      }
    }

    return NextResponse.json(baseResponse);
  } catch (err) {
    logError("api/quote", err, { ticker });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 502 }
    );
  }
}
