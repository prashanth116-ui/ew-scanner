import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTicker } from "@/lib/api-utils";
import { findStructuralReferences } from "@/lib/ew-structural";

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
    const url = `${YAHOO_CHART}/${encodeURIComponent(ticker)}?interval=1wk&range=5y&includePrePost=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      return NextResponse.json({ error: "No chart data" }, { status: 404 });
    }

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    if (!quote || !timestamps.length) {
      return NextResponse.json({ error: "No OHLC data" }, { status: 404 });
    }

    const opens: (number | null)[] = quote.open ?? [];
    const highs: (number | null)[] = quote.high ?? [];
    const lows: (number | null)[] = quote.low ?? [];
    const closes: (number | null)[] = quote.close ?? [];
    const volumes: (number | null)[] = quote.volume ?? [];
    const current: number = result.meta?.regularMarketPrice ?? 0;

    // Find ATH (highest weekly high)
    let athIdx = 0;
    let athValue = -Infinity;
    for (let i = 0; i < highs.length; i++) {
      if (highs[i] != null && highs[i]! > athValue) {
        athValue = highs[i]!;
        athIdx = i;
      }
    }

    // Find lowest low BEFORE ATH (impulse start for Fibonacci)
    let preAthLowIdx = 0;
    let preAthLowValue = Infinity;
    for (let i = 0; i < athIdx; i++) {
      if (lows[i] != null && lows[i]! < preAthLowValue) {
        preAthLowValue = lows[i]!;
        preAthLowIdx = i;
      }
    }

    // Find lowest low AFTER ATH
    let lowIdx = athIdx;
    let lowValue = Infinity;
    for (let i = athIdx; i < lows.length; i++) {
      if (lows[i] != null && lows[i]! < lowValue) {
        lowValue = lows[i]!;
        lowIdx = i;
      }
    }

    if (lowValue === Infinity) lowValue = current;

    const toYear = (ts: number) => new Date(ts * 1000).getFullYear();

    // Structural fallback for stocks at/near ATH
    let trueAth: number | undefined;
    let trueAthYear: number | undefined;

    // Build clean highs/lows for structural detection (need non-null arrays)
    const cleanHighsForStruct: number[] = [];
    const cleanLowsForStruct: number[] = [];
    const structCleanToRaw: number[] = [];
    const rawToStructClean = new Map<number, number>();
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      rawToStructClean.set(i, cleanHighsForStruct.length);
      structCleanToRaw.push(i);
      cleanHighsForStruct.push(highs[i] ?? closes[i]!);
      cleanLowsForStruct.push(lows[i] ?? closes[i]!);
    }
    const structAthIdx = rawToStructClean.get(athIdx) ?? 0;
    let structLowIdx = rawToStructClean.get(lowIdx) ?? structAthIdx;
    if (structLowIdx <= structAthIdx && cleanHighsForStruct.length > 0) {
      structLowIdx = Math.min(structAthIdx + 1, cleanHighsForStruct.length - 1);
    }

    const structural = findStructuralReferences(
      cleanHighsForStruct, cleanLowsForStruct,
      structAthIdx, structLowIdx, athValue, lowValue,
    );
    if (structural) {
      trueAth = Math.round(athValue * 100) / 100;
      trueAthYear = toYear(timestamps[athIdx]);
      // Replace with structural references, mapping clean indices back to raw
      athValue = structural.peakPrice;
      athIdx = structCleanToRaw[structural.peakIdx];
      lowValue = structural.troughPrice;
      lowIdx = structCleanToRaw[structural.troughIdx];
    }

    const baseResponse: Record<string, unknown> = {
      ath: Math.round(athValue * 100) / 100,
      low: Math.round(lowValue * 100) / 100,
      current: Math.round(current * 100) / 100,
      athYear: toYear(timestamps[athIdx]),
      lowYear: toYear(timestamps[lowIdx]),
    };
    if (trueAth != null) {
      baseResponse.trueAth = trueAth;
      baseResponse.trueAthYear = trueAthYear;
    }
    if (preAthLowValue < Infinity) {
      baseResponse.preAthLow = Math.round(preAthLowValue * 100) / 100;
      baseResponse.preAthLowYear = toYear(timestamps[preAthLowIdx]);
    }

    if (detail) {
      // Build clean arrays, skipping null bars.
      // Map raw athIdx/lowIdx to clean array positions.
      const cleanOpen: number[] = [];
      const cleanHigh: number[] = [];
      const cleanLow: number[] = [];
      const cleanClose: number[] = [];
      const cleanVolume: number[] = [];
      const cleanTimestamps: number[] = [];
      const rawToClean: Map<number, number> = new Map();

      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] == null) continue;
        rawToClean.set(i, cleanClose.length);
        cleanTimestamps.push(timestamps[i]);
        cleanOpen.push(opens[i] ?? closes[i]!);
        cleanHigh.push(highs[i] ?? closes[i]!);
        cleanLow.push(lows[i] ?? closes[i]!);
        cleanClose.push(closes[i]!);
        cleanVolume.push(volumes[i] ?? 0);
      }

      // Map raw indices to clean array positions (fallback to nearest valid)
      let cleanAthIdx = rawToClean.get(athIdx) ?? 0;
      let cleanLowIdx = rawToClean.get(lowIdx) ?? cleanAthIdx;
      // Ensure low is after ATH in clean array
      if (cleanLowIdx <= cleanAthIdx && cleanClose.length > 0) {
        cleanLowIdx = Math.min(cleanAthIdx + 1, cleanClose.length - 1);
      }

      baseResponse.series = {
        timestamps: cleanTimestamps,
        open: cleanOpen,
        high: cleanHigh,
        low: cleanLow,
        close: cleanClose,
        volume: cleanVolume,
      };
      baseResponse.athIdx = cleanAthIdx;
      baseResponse.lowIdx = cleanLowIdx;
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
