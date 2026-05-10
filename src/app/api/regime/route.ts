/**
 * API route for fetching current market regime.
 * Returns SPY vs 200d SMA classification.
 * Cached server-side for 5 min.
 */

import { NextResponse } from "next/server";
import { fetchMarketRegime } from "@/lib/ew-regime";

export async function GET() {
  const regime = await fetchMarketRegime();
  if (!regime) {
    return NextResponse.json({ regime: "neutral", available: false });
  }
  return NextResponse.json({ ...regime, available: true });
}
