/**
 * API route for recording scanner signals and fetching hit rates.
 * POST: Record signals from scan results
 * GET: Fetch hit rates for a scanner/mode
 */

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { recordSignalBatch } from "@/lib/supabase/persistence";
import { fetchHitRates } from "@/lib/supabase/query";
import type { SignalRecord } from "@/lib/supabase/persistence";

/** POST: Record scanner signals after scan completes. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signals } = body as { signals: SignalRecord[] };

    if (!signals || !Array.isArray(signals) || signals.length === 0) {
      return NextResponse.json({ error: "signals array required" }, { status: 400 });
    }

    // Validate and sanitize
    const valid = signals
      .filter((s) => s.scanner && s.ticker && s.signal_date && s.price_at_signal > 0)
      .slice(0, 100); // Max 100 per request

    const recorded = await recordSignalBatch(valid);
    return NextResponse.json({ recorded, total: valid.length });
  } catch (err) {
    logError("api/signals POST", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** GET: Fetch hit rates for a scanner. ?scanner=ew&mode=wave2&strength=high */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scanner = searchParams.get("scanner");
    if (!scanner) {
      return NextResponse.json({ error: "scanner param required" }, { status: 400 });
    }

    const mode = searchParams.get("mode") ?? undefined;
    const strength = searchParams.get("strength") ?? undefined;

    const rates = await fetchHitRates(scanner, mode, strength);
    return NextResponse.json({ rates });
  } catch (err) {
    logError("api/signals GET", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
