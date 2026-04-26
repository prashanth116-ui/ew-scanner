import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTicker } from "@/lib/api-utils";
import { fetchSqueezeData } from "@/lib/squeeze-fetch";

export async function GET(request: NextRequest) {
  const rl = rateLimit(`squeeze:${getClientKey(request)}`, 200, 60_000);
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
    const data = await fetchSqueezeData(ticker);
    if (!data) {
      return NextResponse.json(
        { error: "No summary data" },
        { status: 404 }
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    logError("api/squeeze", err, { ticker });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 502 }
    );
  }
}
