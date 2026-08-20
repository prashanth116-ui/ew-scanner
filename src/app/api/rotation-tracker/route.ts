import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { calculateRotationTracker } from "@/lib/sector-rotation/rotation-tracker";
import { buildScannerHitMap } from "@/lib/sector-rotation/confluence";
import {
  loadPreRunDaily,
  loadInflectionDaily,
  loadTransitionDaily,
  loadInstitutionalDaily,
} from "@/lib/supabase/persistence";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const rl = rateLimit(`rotation-tracker:${getClientKey(request)}`, 3, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const result = await calculateRotationTracker();

    // Attach cross-scanner hits so the page can render the same confluence the Telegram
    // alert does. Four indexed reads on already-persisted rows — cheap next to the
    // tracker itself, which fetches 6-month charts.
    //
    // Scanner rows are written by crons at 02:00-02:50 UTC for the current UTC date. Any
    // request before that lands on an empty set, so fall back one day rather than showing
    // a page with every badge missing.
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    const load = async (d: string) => Promise.all([
      loadPreRunDaily(d).catch(() => []),
      loadInflectionDaily(d).catch(() => []),
      loadTransitionDaily(d).catch(() => []),
      loadInstitutionalDaily(d).catch(() => []),
    ]);

    let rows = await load(today);
    let hitsDate = today;
    if (rows.every((r) => r.length === 0)) {
      rows = await load(yesterday);
      hitsDate = yesterday;
    }
    const hasScannerData = rows.some((r) => r.length > 0);
    const scannerHitMap = buildScannerHitMap(rows[0], rows[1], rows[2], rows[3]);

    if (hasScannerData) {
      for (const rot of result.activeRotations) {
        for (const s of rot.stocks) {
          const hits = scannerHitMap.get(s.symbol);
          if (hits?.length) s.scannerHits = hits;
        }
      }
    }

    return NextResponse.json({ ...result, scannerHitsDate: hasScannerData ? hitsDate : null }, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err) {
    logError("api/rotation-tracker", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rotation tracker calculation failed" },
      { status: 502 }
    );
  }
}
