import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { fetchPremarketData } from "@/lib/premarket/fetch";
import { computeBiasScore } from "@/lib/premarket/scoring";
import { computeTradingBias } from "@/lib/premarket/trading-bias";
import type { VixBounds } from "@/lib/premarket/trading-bias";
import { calculateSectorRotation } from "@/lib/sector-rotation/sector-rotation";
import { calculateRotationTracker } from "@/lib/sector-rotation/rotation-tracker";
import { fetchMacroRegime, enhanceRegimeWithCrossAsset } from "@/lib/sector-rotation/regime";
import { computeMarketPosture, computeSectorTiers, computeRiskFlags } from "@/lib/sector-rotation/brief";
import type { PostureResult } from "@/lib/sector-rotation/brief";
import type { PremarketData, SectorBreadth } from "@/lib/premarket/types";
import { COMPOSITE } from "@/lib/sector-rotation/config";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const rl = rateLimit(`premarket:${getClientKey(request)}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    // Fetch all data sources in parallel
    const [premarketResult, sectorResult, regime, rotationData] = await Promise.all([
      fetchPremarketData(),
      calculateSectorRotation().catch(() => null),
      fetchMacroRegime().catch(() => null),
      calculateRotationTracker().catch(() => null),
    ]);

    // Enhance regime if cross-asset data available
    const enhancedRegime = regime && sectorResult?.crossAssetScores
      ? enhanceRegimeWithCrossAsset(regime, {
          gld: sectorResult.crossAssetScores.find((s) => s.etf === "GLD")?.acceleration,
          tlt: sectorResult.crossAssetScores.find((s) => s.etf === "TLT")?.acceleration,
        })
      : regime;

    // Compute posture (needs sector data with regime attached)
    let posture: PostureResult = { posture: "SELECTIVE", reasoning: "Sector data unavailable — defaulting to selective." };
    const dataWithRegime = sectorResult ? {
      ...sectorResult,
      regime: enhancedRegime ? {
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
      } : undefined,
    } : null;
    if (dataWithRegime) {
      posture = computeMarketPosture(dataWithRegime, rotationData);
    }

    // Compute sector breadth from GICS sector ETF data (needed by both bias score and trading bias)
    let sectorBreadth: SectorBreadth | null = null;
    if (sectorResult) {
      const gicsSectors = sectorResult.sectors.filter((s) => s.category === "gics_sector");
      let advancing = 0;
      let declining = 0;
      for (const s of gicsSectors) {
        // Use composite score vs config threshold for consistency with sector tier classification
        if (s.compositeScore >= COMPOSITE.ACTIONABLE_THRESHOLD) advancing++;
        else declining++;
      }
      const total = advancing + declining;
      sectorBreadth = {
        advancing,
        declining,
        ratio: total > 0 ? advancing / total : 0.5,
      };
    }

    // Compute bias score and checklist
    const { score, label, checklist } = computeBiasScore(
      premarketResult.futures,
      posture,
      enhancedRegime,
      sectorBreadth,
    );

    // Add sector-level checklist items
    if (dataWithRegime) {
      const tiers = computeSectorTiers(dataWithRegime.sectors, rotationData);
      const riskFlags = computeRiskFlags(dataWithRegime, rotationData);

      checklist.push({
        id: "actionable-sectors",
        category: "sectors",
        label: `${tiers.actionable.length} actionable sector${tiers.actionable.length !== 1 ? "s" : ""}`,
        status: tiers.actionable.length >= 3 ? "bullish" : tiers.actionable.length >= 1 ? "neutral" : "bearish",
        detail: tiers.actionable.length > 0
          ? `Top: ${tiers.actionable.slice(0, 3).map((s) => s.sector).join(", ")}`
          : "No sectors meet actionable criteria",
        autoChecked: tiers.actionable.length >= 3,
      });

      checklist.push({
        id: "risk-flags",
        category: "sectors",
        label: riskFlags.length === 0
          ? "No risk flags"
          : `${riskFlags.length} risk flag${riskFlags.length !== 1 ? "s" : ""}`,
        status: riskFlags.length === 0 ? "bullish" : riskFlags.filter((f) => f.severity === "high").length > 0 ? "bearish" : "neutral",
        detail: riskFlags.length === 0
          ? "Clean risk environment"
          : riskFlags.slice(0, 2).map((f) => f.message).join("; "),
        autoChecked: riskFlags.length === 0,
      });
    }

    // Use adaptive VIX bounds from regime (computed from 3-month 25th/75th percentiles)
    const vixBounds: VixBounds | null = enhancedRegime?.vixBounds ?? null;

    const tradingBias = computeTradingBias(
      premarketResult.futures,
      premarketResult.vixData,
      score,
      sectorBreadth,
      vixBounds,
    );

    // Detect conflict between macro bias (regime/posture-driven) and futures bias.
    // Two independent classifiers can reach different conclusions — flag when they
    // diverge by 2+ levels so the UI can surface the disagreement.
    // Only compare when both data sources are reliable — if sectorResult or regime
    // failed, macro bias defaults to Neutral/SELECTIVE, producing false conflicts.
    if (tradingBias && sectorResult && regime) {
      const biasLevels: Record<string, number> = {
        "Strong Bear": -2, "Lean Bear": -1, "Neutral": 0, "Lean Bull": 1, "Strong Bull": 2,
      };
      const macroLevel = biasLevels[label] ?? 0;
      const futuresLevel = biasLevels[tradingBias.bias] ?? 0;
      // Only flag conflict when macro has a directional view — Neutral macro
      // is permissive and shouldn't conflict with any futures direction.
      if (macroLevel !== 0 && futuresLevel !== 0 && Math.sign(macroLevel) !== Math.sign(futuresLevel)) {
        tradingBias.biasConflict = true;
        tradingBias.biasConflictDetail = `Macro bias "${label}" (from regime + posture) conflicts with futures bias "${tradingBias.bias}" (from price action). Macro reflects structural positioning; futures reflect real-time sentiment. When they diverge, trust futures direction but reduce size.`;
      }
    }

    const response: PremarketData = {
      futures: premarketResult.futures,
      internals: premarketResult.internals,
      sectorBreadth,
      vixData: premarketResult.vixData,
      checklist,
      biasScore: score,
      biasLabel: label,
      tradingBias,
      timestamp: Date.now(),
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=60" },
    });
  } catch (err) {
    logError("api/premarket", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pre-market data fetch failed" },
      { status: 502 }
    );
  }
}
