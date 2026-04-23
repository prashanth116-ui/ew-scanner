import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";

const YAHOO_SUMMARY =
  "https://query1.finance.yahoo.com/v10/finance/quoteSummary";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── Yahoo Crumb/Cookie Cache ──
// quoteSummary v10 requires a cookie + crumb pair.
// We fetch once and cache for 30 minutes (crumbs are long-lived).
let cachedCrumb: string | null = null;
let cachedCookie: string | null = null;
let crumbFetchedAt = 0;
const CRUMB_TTL = 30 * 60 * 1000; // 30 min

async function getYahooCrumb(): Promise<{
  crumb: string;
  cookie: string;
} | null> {
  const now = Date.now();
  if (cachedCrumb && cachedCookie && now - crumbFetchedAt < CRUMB_TTL) {
    return { crumb: cachedCrumb, cookie: cachedCookie };
  }

  try {
    // Step 1: Get session cookie from fc.yahoo.com
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA },
      redirect: "manual",
    });

    const setCookies = cookieRes.headers.getSetCookie?.() ?? [];
    const cookie = setCookies
      .map((c) => c.split(";")[0].trim())
      .join("; ");

    if (!cookie) return null;

    // Step 2: Get crumb using session cookie
    const crumbRes = await fetch(
      "https://query2.finance.yahoo.com/v1/test/getcrumb",
      {
        headers: { "User-Agent": UA, Cookie: cookie },
      }
    );

    if (!crumbRes.ok) return null;
    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes("error")) return null;

    cachedCrumb = crumb;
    cachedCookie = cookie;
    crumbFetchedAt = now;

    return { crumb, cookie };
  } catch {
    return null;
  }
}

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
    const auth = await getYahooCrumb();
    if (!auth) {
      return NextResponse.json(
        { error: "Failed to authenticate with Yahoo" },
        { status: 502 }
      );
    }

    const url = `${YAHOO_SUMMARY}/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,price&crumb=${encodeURIComponent(auth.crumb)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Cookie: auth.cookie,
      },
    });

    // If 401, invalidate cache and retry once
    if (res.status === 401) {
      cachedCrumb = null;
      cachedCookie = null;
      crumbFetchedAt = 0;

      const retryAuth = await getYahooCrumb();
      if (!retryAuth) {
        return NextResponse.json(
          { error: "Yahoo auth failed after retry" },
          { status: 502 }
        );
      }

      const retryUrl = `${YAHOO_SUMMARY}/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,price&crumb=${encodeURIComponent(retryAuth.crumb)}`;
      const retryRes = await fetch(retryUrl, {
        headers: {
          "User-Agent": UA,
          Cookie: retryAuth.cookie,
        },
      });

      if (!retryRes.ok) {
        return NextResponse.json(
          { error: `Yahoo returned ${retryRes.status}` },
          { status: 502 }
        );
      }

      const retryData = await retryRes.json();
      return buildResponse(ticker, retryData);
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo returned ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return buildResponse(ticker, data);
  } catch (err) {
    logError("api/squeeze", err, { ticker });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 502 }
    );
  }
}

function buildResponse(
  ticker: string,
  data: Record<string, unknown>
): NextResponse {
  const result = (
    data as { quoteSummary?: { result?: Record<string, unknown>[] } }
  )?.quoteSummary?.result?.[0];

  if (!result) {
    return NextResponse.json({ error: "No summary data" }, { status: 404 });
  }

  const stats = (result.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const price = (result.price ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    ticker: ticker.toUpperCase(),
    name:
      (price.shortName as string) ??
      (price.longName as string) ??
      ticker.toUpperCase(),
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
}
