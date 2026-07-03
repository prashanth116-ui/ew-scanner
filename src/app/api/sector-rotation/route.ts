import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { calculateSectorRotation } from "@/lib/sector-rotation/sector-rotation";
import { fetchMacroRegime, enhanceRegimeWithCrossAsset } from "@/lib/sector-rotation/regime";
import { recordSectorSnapshotBatch } from "@/lib/supabase/persistence";
import type { SectorSnapshotRecord } from "@/lib/supabase/persistence";

export const maxDuration = 60;

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

    // Enhance regime confidence with cross-asset data if available
    const enhancedRegime = regime && result.crossAssetScores
      ? enhanceRegimeWithCrossAsset(regime, {
          gld: result.crossAssetScores.find((s) => s.etf === "GLD")?.acceleration,
          tlt: result.crossAssetScores.find((s) => s.etf === "TLT")?.acceleration,
        })
      : regime;

    // Persist all sector snapshots (GICS + sub-sectors + cross-asset with category)
    const today = new Date().toISOString().slice(0, 10);
    const allScores = [
      ...result.sectors,
      ...(result.subSectorScores ?? []),
      ...(result.crossAssetScores ?? []),
      ...(result.leadershipBasketScores ?? []),
    ];
    const snapshots: SectorSnapshotRecord[] = allScores.map((s) => ({
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

    return NextResponse.json(
      {
        ...result,
        regime: enhancedRegime
          ? {
              regime: enhancedRegime.regime,
              regimeConfidence: enhancedRegime.regimeConfidence,
              vix: enhancedRegime.vix,
              vixSlope: enhancedRegime.vixSlope,
              yield10y: enhancedRegime.yield10y,
              dxy: enhancedRegime.dxy,
              dxyTrend: enhancedRegime.dxyTrend,
              favoredSectors: enhancedRegime.favoredSectors,
              avoidSectors: enhancedRegime.avoidSectors,
              vixBounds: enhancedRegime.vixBounds,
            }
          : undefined,
      },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=120" } }
    );
  } catch (err) {
    logError("api/sector-rotation", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sector rotation calculation failed" },
      { status: 502 }
    );
  }
}
