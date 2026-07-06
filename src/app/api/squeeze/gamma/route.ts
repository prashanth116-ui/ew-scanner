/**
 * API route for options gamma zone detection.
 * POST: Detect gamma zones for a batch of tickers.
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { detectGammaBatch } from "@/lib/squeeze/options";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const rl = rateLimit(`squeeze-gamma:${getClientKey(request)}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  try {
    const body = await request.json();
    const { tickers } = body as { tickers: Array<{ ticker: string; price: number }> };

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json({ error: "tickers array required" }, { status: 400 });
    }

    // Limit to 20 tickers
    const batch = tickers.slice(0, 20);
    const results = await detectGammaBatch(batch);

    // Convert Map to plain object
    const gammaMap: Record<string, { hasGammaTrigger: boolean; nearestGammaStrike: number | null; gammaZones: unknown[] }> = {};
    for (const [ticker, result] of results) {
      gammaMap[ticker] = {
        hasGammaTrigger: result.hasGammaTrigger,
        nearestGammaStrike: result.nearestGammaStrike,
        gammaZones: result.gammaZones,
      };
    }

    return NextResponse.json({ gamma: gammaMap });
  } catch (err) {
    logError("api/squeeze/gamma", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
