import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";

const YAHOO_SUMMARY =
  "https://query1.finance.yahoo.com/v10/finance/quoteSummary";

function extractRaw(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (typeof val === "object" && "raw" in (val as Record<string, unknown>)) {
    return (val as { raw: number }).raw;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(`squeeze:${getClientKey(request)}`, 200, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json(
      { error: "ticker param required" },
      { status: 400 }
    );
  }

  try {
    const url = `${YAHOO_SUMMARY}/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,price`;
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
    const result = data?.quoteSummary?.result?.[0];
    if (!result) {
      return NextResponse.json(
        { error: "No summary data" },
        { status: 404 }
      );
    }

    const stats = result.defaultKeyStatistics ?? {};
    const price = result.price ?? {};

    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      name: price.shortName ?? price.longName ?? ticker.toUpperCase(),
      shortPercentOfFloat: extractRaw(stats.shortPercentOfFloat),
      shortRatio: extractRaw(stats.shortRatio),
      sharesShort: extractRaw(stats.sharesShort),
      floatShares: extractRaw(stats.floatShares),
      sharesOutstanding: extractRaw(stats.sharesOutstanding),
      dateShortInterest: extractRaw(stats.dateShortInterest),
      currentVolume: extractRaw(price.regularMarketVolume),
      avgVolume3Month: extractRaw(price.averageDailyVolume3Month),
      currentPrice: extractRaw(price.regularMarketPrice),
      marketCap: extractRaw(price.marketCap),
    });
  } catch (err) {
    logError("api/squeeze", err, { ticker });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 502 }
    );
  }
}
