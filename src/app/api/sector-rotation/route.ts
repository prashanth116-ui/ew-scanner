import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { calculateSectorRotation } from "@/lib/sector-rotation/sector-rotation";
import { fetchMacroRegime, getRegimeAdjustment } from "@/lib/sector-rotation/regime";
import { recordSectorSnapshotBatch } from "@/lib/supabase/persistence";

export async function GET(request: NextRequest) {
  const rl = rateLimit(`sector-rotation:${getClientKey(request)}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const [result, regime] = await Promise.all([
      calculateSectorRotation(),
      fetchMacroRegime().catch(() => null),
    ]);

    // Persist sector snapshots (await to ensure completion before Vercel kills function)
    const today = new Date().toISOString().slice(0, 10);
    const snapshots = result.sectors.map((s) => ({
      snapshot_date: today,
      sector: s.sector,
      etf_symbol: s.etf,
      rs_ratio: s.rsRatio,
      rs_momentum: s.rsMomentum,
      quadrant: s.quadrant,
      momentum_score: s.compositeScore,
      breadth_pct: s.breadthPct ?? undefined,
    }));
    await recordSectorSnapshotBatch(snapshots).catch(() => {});

    return NextResponse.json({
      ...result,
      regime: regime
        ? {
            regime: regime.regime,
            vix: regime.vix,
            vixSlope: regime.vixSlope,
            yield10y: regime.yield10y,
            dxy: regime.dxy,
            dxyTrend: regime.dxyTrend,
            favoredSectors: regime.favoredSectors,
            avoidSectors: regime.avoidSectors,
          }
        : undefined,
    });
  } catch (err) {
    logError("api/sector-rotation", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sector rotation calculation failed" },
      { status: 502 }
    );
  }
}
