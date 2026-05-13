import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTicker } from "@/lib/api-utils";
import { fetchStratData } from "@/lib/strat/data";
import { scoreStrat } from "@/lib/strat/scoring";
import { getStratTickerInfo } from "@/data/strat-universe";

export async function GET(request: NextRequest) {
  const rl = rateLimit(`strat-stock:${getClientKey(request)}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const rawTicker = request.nextUrl.searchParams.get("ticker");
  const ticker = validateTicker(rawTicker);
  if (!ticker) {
    return NextResponse.json(
      { error: "ticker param required (valid A-Z symbol)" },
      { status: 400 }
    );
  }

  try {
    const data = await fetchStratData(ticker);
    if (!data) {
      return NextResponse.json({ error: "No data found" }, { status: 404 });
    }
    const info = getStratTickerInfo(ticker);
    const companyName = info?.name ?? data.companyName;
    const result = scoreStrat(
      ticker,
      companyName,
      data.currentPrice,
      data.monthly,
      data.weekly,
      data.daily
    );
    return NextResponse.json(result);
  } catch (err) {
    logError("api/strat", err, { ticker });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 502 }
    );
  }
}
