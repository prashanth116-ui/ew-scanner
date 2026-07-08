import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData } from "@/lib/prerun/data";
import { autoScorePreRun } from "@/lib/prerun/scoring";
import { getSectorForTicker } from "@/data/prerun-universe";
import type { EmaTimeframe } from "@/lib/prerun/types";

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
  const emaTimeframe = (request.nextUrl.searchParams.get("emaTimeframe") ?? "15m") as EmaTimeframe;
  const scanner4h = request.nextUrl.searchParams.get("scanner") === "4h";

  try {
    const data = await fetchPreRunData(ticker, scanner4h ? "4h" : emaTimeframe, undefined, scanner4h);
    if (!data) {
      return NextResponse.json({ error: "No data found" }, { status: 404 });
    }
    const sectorQuadrant = request.nextUrl.searchParams.get("sectorQuadrant") ?? null;
    const result = autoScorePreRun(data, sectorQuadrant);
    return NextResponse.json(result);
  } catch (err) {
    logError("api/prerun/stock", err, { ticker });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 502 }
    );
  }
}
