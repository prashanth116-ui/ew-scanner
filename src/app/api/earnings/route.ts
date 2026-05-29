import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTicker } from "@/lib/api-utils";
import { fetchEarningsData } from "@/lib/earnings-fetch";

export async function GET(request: NextRequest) {
  // Rate limit: 60 req/min per IP
  const rl = rateLimit(`earnings:${getClientKey(request)}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const ticker = validateTicker(request.nextUrl.searchParams.get("ticker"));
  if (!ticker) {
    return NextResponse.json(
      { error: "Invalid or missing ticker" },
      { status: 400 }
    );
  }

  try {
    const data = await fetchEarningsData(ticker);
    if (!data) {
      return NextResponse.json(
        { error: "No earnings data found" },
        { status: 404 }
      );
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (err) {
    logError("api/earnings", err, { ticker });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 502 }
    );
  }
}
