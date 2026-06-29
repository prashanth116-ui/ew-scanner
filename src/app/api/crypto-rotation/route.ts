import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { calculateCryptoRotation } from "@/lib/crypto-rotation/crypto-rotation";
import { recordSectorSnapshotBatch, type SectorSnapshotRecord } from "@/lib/supabase/persistence";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const rl = rateLimit(`crypto-rotation:${getClientKey(request)}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const result = await calculateCryptoRotation();

    // Persist crypto sector snapshots to Supabase (non-blocking, failures are logged but never break)
    try {
      const today = new Date(result.calculatedAt).toISOString().slice(0, 10);
      const records: SectorSnapshotRecord[] = result.sectors.map((s) => ({
        snapshot_date: today,
        sector: `crypto:${s.sector}`,
        etf_symbol: s.etf,
        rs_ratio: s.rsRatio,
        rs_momentum: s.rsMomentum,
        quadrant: s.quadrant,
        momentum_score: s.compositeScore,
        breadth_pct: undefined,
      }));
      recordSectorSnapshotBatch(records).catch(() => {});
    } catch {
      // Non-critical — log but don't fail
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err) {
    logError("api/crypto-rotation", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Crypto rotation calculation failed" },
      { status: 502 }
    );
  }
}
