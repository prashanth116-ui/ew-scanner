import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { createClient } from "@/lib/supabase/server";
import { calculateSectorRotation } from "@/lib/sector-rotation/sector-rotation";
import type { SectorRotationResult, EnrichedStock, RejectedStock } from "@/lib/sector-rotation/types";

/** Map TS SectorRotationScore → snake_case SectorData for the picks page. */
function mapTsSectors(ts: SectorRotationResult) {
  return ts.sectors.map((s) => ({
    etf: s.etf,
    name: s.sector,
    momentum_raw: s.momentumComposite,
    acceleration: s.acceleration,
    mansfield_rs: s.mansfieldRS,
    rs_ratio: s.rsRatio,
    rs_momentum: s.rsMomentum,
    cmf: s.cmf20,
    cmf_positive_days: 0, // not tracked in TS engine
    breadth_pct: s.breadthPct,
    smart_money_pct: s.smartMoneyScore,
    quadrant: s.quadrant,
    ret_20d: 0, // ETF ROC not exposed on SectorRotationScore — not used by picks UI
    stealth_accumulation: s.stealthAccumulation,
    stealth_signals: [s.flowPriceDivergence, s.breadthDivergence, s.accelerationInflection].filter(Boolean).length,
    flow_price_div: s.flowPriceDivergence,
    accel_inflection: s.accelerationInflection,
    breadth_div: s.breadthDivergence,
    composite: s.compositeScore,
  }));
}

/** Map TS EnrichedStock → snake_case StockData for the picks page. */
function mapTsStock(s: EnrichedStock) {
  return {
    symbol: s.symbol,
    etf: s.sectorEtf,
    sector_name: s.sector,
    price: s.price,
    sma50: s.sma50 ?? 0,
    sma200: s.sma200 ?? 0,
    above_50ma: s.above50ma,
    pct_from_50ma: s.pctFrom50ma ?? 0,
    pct_from_200ma: s.pctFrom200ma ?? 0,
    vol_5d: s.avgVolume, // no separate 5d vol — use avg
    vol_20d: s.avgVolume,
    vol_ratio: s.volRatio,
    ret_20d: s.ret20d ?? 0,
    etf_ret_20d: s.etfRet20d,
    rs_accel: s.rsAccel ?? 0,
    rs_accel_desc: s.rsAccelDesc,
    market_cap: s.marketCap,
    institutional_pct: s.institutionalPct,
    short_name: s.shortName,
    sector_quadrant: s.sectorQuadrant,
    sector_composite: s.sectorComposite,
    sector_stealth: s.sectorStealth,
    sector_acceleration: 0, // not exposed per-stock — not used by picks UI
    category: s.category,
    phase: s.phase,
    conviction: s.conviction,
    conviction_signals: s.convictionSignals,
  };
}

/** Map TS RejectedStock → snake_case StockData stub for the rejected list. */
function mapTsRejected(s: RejectedStock) {
  return {
    symbol: s.symbol,
    etf: "",
    sector_name: s.sector,
    price: 0,
    sma50: 0,
    sma200: 0,
    above_50ma: false,
    pct_from_50ma: 0,
    pct_from_200ma: 0,
    vol_5d: 0,
    vol_20d: 0,
    vol_ratio: 0,
    ret_20d: 0,
    etf_ret_20d: 0,
    rs_accel: 0,
    rs_accel_desc: "",
    market_cap: null,
    institutional_pct: null,
    short_name: "",
    sector_quadrant: "",
    sector_composite: null,
    sector_stealth: false,
    sector_acceleration: 0,
    category: "AVOID",
    phase: "P1_BASING",
    conviction: "WATCH",
    conviction_signals: 0,
    rejection_reasons: s.reasons,
  };
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(`rotation-picks:${getClientKey(request)}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    // Fetch TS sector rotation (primary) + Supabase (fallback) in parallel
    const supabasePromise = createClient().then(async (supabase) => {
      if (!supabase) return null;
      const { data } = await supabase
        .from("rotation_scan_results")
        .select("scan_date, sectors_data, passed_stocks, rejected_stocks, summary, created_at")
        .order("scan_date", { ascending: false })
        .limit(1)
        .single();
      return data;
    }).catch(() => null);

    const [tsRotation, supabaseData] = await Promise.all([
      calculateSectorRotation().catch(() => null),
      supabasePromise,
    ]);

    // Primary: TS enriched stocks
    if (tsRotation?.enrichedStocks) {
      const passed = tsRotation.enrichedStocks.passed.map(mapTsStock);
      const rejected = tsRotation.enrichedStocks.rejected.map(mapTsRejected);
      const sectorsData = mapTsSectors(tsRotation);

      return NextResponse.json({
        scanDate: tsRotation.calculatedAt.slice(0, 10),
        sectorsData,
        passedStocks: passed,
        rejectedStocks: rejected,
        summary: {
          sectors_analyzed: tsRotation.sectors.length,
          interesting_sectors: tsRotation.sectors.filter(
            (s) => s.stealthAccumulation || s.quadrant === "IMPROVING"
          ).length,
          stocks_enriched: passed.length + rejected.length,
          stocks_passed: passed.length,
          alerts_sent: 0,
          scan_date: tsRotation.calculatedAt.slice(0, 10),
        },
        calculatedAt: tsRotation.calculatedAt,
      });
    }

    // Fallback: Supabase data
    if (supabaseData) {
      return NextResponse.json({
        scanDate: supabaseData.scan_date,
        sectorsData: supabaseData.sectors_data,
        passedStocks: supabaseData.passed_stocks,
        rejectedStocks: supabaseData.rejected_stocks,
        summary: supabaseData.summary,
        calculatedAt: supabaseData.created_at,
      });
    }

    return NextResponse.json(
      { error: "No scan data available" },
      { status: 404 }
    );
  } catch (err) {
    logError("api/rotation-picks", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch scan data" },
      { status: 502 }
    );
  }
}
