import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData } from "@/lib/prerun/data";
import { autoScorePreRun } from "@/lib/prerun/scoring";

export async function GET(request: NextRequest) {
  const rl = rateLimit(`prerun-stock:${getClientKey(request)}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker param required" }, { status: 400 });
  }

  try {
    const data = await fetchPreRunData(ticker);
    if (!data) {
      return NextResponse.json({ error: "No data found" }, { status: 404 });
    }
    const result = autoScorePreRun(data);
    return NextResponse.json(result);
  } catch (err) {
    logError("api/prerun/stock", err, { ticker });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 502 }
    );
  }
}
