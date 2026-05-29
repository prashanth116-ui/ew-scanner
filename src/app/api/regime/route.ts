/**
 * API route for fetching current market regime.
 * Returns SPY vs 200d SMA classification.
 * Cached server-side for 5 min.
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { fetchMarketRegime } from "@/lib/ew-regime";

export async function GET(request: NextRequest) {
  const rl = rateLimit(`regime:${getClientKey(request)}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const regime = await fetchMarketRegime();
  if (!regime) {
    return NextResponse.json({ regime: "neutral", available: false });
  }
  return NextResponse.json({ ...regime, available: true });
}
