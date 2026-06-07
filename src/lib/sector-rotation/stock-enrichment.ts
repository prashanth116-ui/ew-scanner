/**
 * Stock-level enrichment: quality gates, classification, conviction scoring.
 * Ported from runners/rotation_scanner.py (steps 5-7).
 */

import type {
  RRGQuadrant,
  EnrichedStock,
  RejectedStock,
  PullbackWatchStock,
  ExtensionTier,
  StockCategory,
  StockPhase,
  ConvictionLevel,
} from "./types";

/** Raw input for a stock before enrichment. */
export interface StockInput {
  symbol: string;
  shortName: string;
  sector: string;
  sectorEtf: string;
  price: number;
  sma50: number | null;
  sma200: number | null;
  volume: number;
  avgVolume10d: number;
  marketCap: number | null;
  institutionalPct: number | null;
  ret20d: number | null;
  etfRet20d: number;
  sectorQuadrant: RRGQuadrant;
  sectorComposite: number;
  sectorAcceleration: number;
  sectorStealth: boolean;
}

// ── Derived helpers ──

function calcPctFrom(price: number, sma: number | null): number | null {
  if (sma == null || sma === 0) return null;
  return ((price - sma) / sma) * 100;
}

function calcRsAccel(pctFrom50: number | null, pctFrom200: number | null): number | null {
  if (pctFrom50 == null || pctFrom200 == null) return null;
  return Math.round((pctFrom50 - pctFrom200) * 100) / 100;
}

function calcVolRatio(volume: number, avgVolume: number): number {
  if (avgVolume <= 0) return 0;
  return Math.round((volume / avgVolume) * 100) / 100;
}

// ── Step 5: Quality Gates ──

export function applyQualityGates(
  stocks: StockInput[]
): { passed: StockInput[]; rejected: RejectedStock[]; extensionOnly: StockInput[] } {
  const passed: StockInput[] = [];
  const rejected: RejectedStock[] = [];
  const extensionOnly: StockInput[] = [];

  for (const s of stocks) {
    const otherReasons: string[] = [];
    const pctFrom50ma = calcPctFrom(s.price, s.sma50);
    const pctFrom200ma = calcPctFrom(s.price, s.sma200);
    const rsAccel = calcRsAccel(pctFrom50ma, pctFrom200ma);
    const volRatio = calcVolRatio(s.volume, s.avgVolume10d);
    const above50ma = s.sma50 != null && s.price > s.sma50;
    let failedExtension = false;

    // Gate 1: Market cap >= $2B (skip if null)
    if (s.marketCap != null && s.marketCap < 2_000_000_000) {
      otherReasons.push(`market_cap=$${(s.marketCap / 1e9).toFixed(1)}B (<$2B)`);
    }

    // Gate 2: Avg daily volume >= 1M shares
    if (s.avgVolume10d < 1_000_000) {
      otherReasons.push(`vol_20d=${(s.avgVolume10d / 1e6).toFixed(1)}M (<1M)`);
    }

    // Gate 3: Volume spike ratio <= 5x
    if (volRatio > 5.0) {
      otherReasons.push(`vol_spike=${volRatio.toFixed(1)}x (>5x)`);
    }

    // Gate 4: Price extension <= 80% above 200-SMA
    if (pctFrom200ma != null && pctFrom200ma > 80) {
      failedExtension = true;
    }

    // Gate 5: Above 50-SMA or turnaround signal
    if (!above50ma && !(rsAccel != null && rsAccel > 0.5 && volRatio >= 1.0)) {
      otherReasons.push("below_50MA_no_turnaround");
    }

    // Gate 6: Institutional ownership > 30% (structural filter, not timing signal)
    // This is a liquidity/quality characteristic — stocks with <30% institutional
    // ownership are structurally more prone to manipulation and liquidity gaps.
    // Based on quarterly 13F filings; ownership levels rarely shift dramatically.
    if (s.institutionalPct != null && s.institutionalPct < 30) {
      otherReasons.push(`institutional=${s.institutionalPct.toFixed(0)}% (<30%)`);
    }

    // Gate 7: Sector correlation — stock 20d return within 30% of ETF
    if (s.ret20d != null) {
      const retDiff = Math.abs(s.ret20d - s.etfRet20d);
      if (retDiff > 30) {
        otherReasons.push(`uncorrelated_ret_diff=${retDiff.toFixed(1)}%`);
      }
    }

    const allReasons = [...otherReasons];
    if (failedExtension) {
      allReasons.push(`extension=${(pctFrom200ma ?? 0).toFixed(0)}% (>80%)`);
    }

    if (allReasons.length === 0) {
      passed.push(s);
    } else if (failedExtension && otherReasons.length === 0 && above50ma) {
      // Failed ONLY Gate 4, passed all others, still above 50-SMA → pullback candidate
      extensionOnly.push(s);
      rejected.push({ symbol: s.symbol, sector: s.sector, reasons: allReasons });
    } else {
      rejected.push({ symbol: s.symbol, sector: s.sector, reasons: allReasons });
    }
  }

  return { passed, rejected, extensionOnly };
}

// ── Extended Stocks Watch ──

export function buildExtendedWatch(extensionOnly: StockInput[]): PullbackWatchStock[] {
  return extensionOnly
    .map((s) => {
      const pctFrom200ma = calcPctFrom(s.price, s.sma200)!;
      const pctFrom50ma = calcPctFrom(s.price, s.sma50)!;
      const volRatio = calcVolRatio(s.volume, s.avgVolume10d);
      const distanceTo80Pct = Math.round((pctFrom200ma - 80) * 10) / 10;

      let tier: ExtensionTier;
      if (pctFrom200ma <= 100) {
        tier = "MODERATE_EXTENSION";
      } else if (pctFrom200ma <= 150 && pctFrom50ma <= 15) {
        tier = "HIGH_EXTENSION";
      } else {
        tier = "EXTREME_EXTENSION";
      }

      return {
        symbol: s.symbol,
        shortName: s.shortName,
        sector: s.sector,
        sectorEtf: s.sectorEtf,
        price: s.price,
        sma50: s.sma50!,
        sma200: s.sma200!,
        pctFrom200ma: Math.round(pctFrom200ma * 10) / 10,
        pctFrom50ma: Math.round(pctFrom50ma * 10) / 10,
        distanceTo80Pct,
        volRatio,
        marketCap: s.marketCap,
        institutionalPct: s.institutionalPct,
        sectorQuadrant: s.sectorQuadrant,
        tier,
      };
    })
    .sort((a, b) => {
      const tierOrder: Record<ExtensionTier, number> = { MODERATE_EXTENSION: 0, HIGH_EXTENSION: 1, EXTREME_EXTENSION: 2 };
      const tierCmp = tierOrder[a.tier] - tierOrder[b.tier];
      if (tierCmp !== 0) return tierCmp;
      return a.pctFrom200ma - b.pctFrom200ma;
    });
}

/** @deprecated Use buildExtendedWatch */
export const buildPullbackWatch = buildExtendedWatch;

// ── Step 6: Classification ──

function classifyCategory(
  above50ma: boolean,
  ret20d: number | null,
  etfRet20d: number,
  volRatio: number,
  rsAccel: number | null
): StockCategory {
  if (above50ma && ret20d != null && ret20d > etfRet20d && volRatio >= 1.0) {
    return "LEADER";
  }
  if (above50ma) {
    return "CATCH_UP";
  }
  if (rsAccel != null && rsAccel > 0.5 && volRatio >= 1.0) {
    return "TURNAROUND";
  }
  return "AVOID";
}

function classifyPhase(
  above50ma: boolean,
  pctFrom50ma: number | null,
  rsAccel: number | null,
  volRatio: number,
  sectorAcceleration: number
): StockPhase {
  const pct = pctFrom50ma ?? 0;
  const accel = rsAccel ?? 0;

  if (!above50ma && accel > 0) {
    return "P1_BASING";
  }
  if (pct >= -5 && pct <= 3 && accel > 0.5 && volRatio >= 1.2) {
    return "P2_TURNAROUND";
  }
  if (pct > 3 && accel >= 0) {
    return "P3_TRENDING";
  }
  if (accel < -2.0 || sectorAcceleration < -3) {
    return "P4_EXHAUSTING";
  }
  return above50ma ? "P3_TRENDING" : "P1_BASING";
}

function rsAccelDescription(rsAccel: number | null): string {
  if (rsAccel == null) return "n/a";
  if (rsAccel >= 3.0) return "strong catch-up";
  if (rsAccel >= 0.5) return "moderate";
  if (rsAccel >= -0.5) return "neutral";
  return "decelerating";
}

export function classifyStock(
  s: StockInput,
  sectorAcceleration: number
): Pick<EnrichedStock, "category" | "phase" | "rsAccelDesc"> & {
  above50ma: boolean;
  pctFrom50ma: number | null;
  pctFrom200ma: number | null;
  rsAccel: number | null;
  volRatio: number;
} {
  const pctFrom50ma = calcPctFrom(s.price, s.sma50);
  const pctFrom200ma = calcPctFrom(s.price, s.sma200);
  const rsAccel = calcRsAccel(pctFrom50ma, pctFrom200ma);
  const volRatio = calcVolRatio(s.volume, s.avgVolume10d);
  const above50ma = s.sma50 != null && s.price > s.sma50;

  const category = classifyCategory(above50ma, s.ret20d, s.etfRet20d, volRatio, rsAccel);
  const phase = classifyPhase(above50ma, pctFrom50ma, rsAccel, volRatio, sectorAcceleration);
  const rsAccelDesc = rsAccelDescription(rsAccel);

  return { category, phase, rsAccelDesc, above50ma, pctFrom50ma, pctFrom200ma, rsAccel, volRatio };
}

// ── Step 7: Conviction Scoring ──

export function scoreConviction(
  category: StockCategory,
  rsAccel: number | null,
  volRatio: number,
  _institutionalPct: number | null,
  sectorQuadrant: RRGQuadrant,
  sectorComposite: number,
  sectorStealth: boolean
): { conviction: ConvictionLevel; convictionSignals: number } {
  let signals = 0;

  if (sectorQuadrant === "IMPROVING" || sectorQuadrant === "LEADING") signals++;
  if (sectorComposite >= 70) signals++;
  if (category === "TURNAROUND" || category === "LEADER") signals++;
  if (rsAccel != null && rsAccel >= 3.0) signals++;
  if (sectorStealth) signals++;
  if (volRatio >= 1.2) signals++;

  let conviction: ConvictionLevel;
  if (signals >= 3) conviction = "HIGH";
  else if (signals >= 2) conviction = "MEDIUM";
  else conviction = "WATCH";

  return { conviction, convictionSignals: signals };
}

// ── Full enrichment pipeline ──

export function enrichStocks(stocks: StockInput[]): {
  passed: EnrichedStock[];
  rejected: RejectedStock[];
  pullbackWatch: PullbackWatchStock[];
} {
  // Step 5: Quality gates
  const { passed: gated, rejected, extensionOnly } = applyQualityGates(stocks);

  // Steps 6-7: Classify + score each passing stock
  const enriched: EnrichedStock[] = gated.map((s) => {
    const classified = classifyStock(s, s.sectorAcceleration);
    const scored = scoreConviction(
      classified.category,
      classified.rsAccel,
      classified.volRatio,
      s.institutionalPct,
      s.sectorQuadrant,
      s.sectorComposite,
      s.sectorStealth
    );

    return {
      symbol: s.symbol,
      shortName: s.shortName,
      sector: s.sector,
      sectorEtf: s.sectorEtf,
      price: s.price,
      sma50: s.sma50,
      sma200: s.sma200,
      above50ma: classified.above50ma,
      pctFrom50ma: classified.pctFrom50ma != null ? Math.round(classified.pctFrom50ma * 10) / 10 : null,
      pctFrom200ma: classified.pctFrom200ma != null ? Math.round(classified.pctFrom200ma * 10) / 10 : null,
      rsAccel: classified.rsAccel,
      volRatio: classified.volRatio,
      volume: s.volume,
      avgVolume: s.avgVolume10d,
      marketCap: s.marketCap,
      institutionalPct: s.institutionalPct,
      ret20d: s.ret20d,
      etfRet20d: s.etfRet20d,
      category: classified.category,
      phase: classified.phase,
      rsAccelDesc: classified.rsAccelDesc,
      conviction: scored.conviction,
      convictionSignals: scored.convictionSignals,
      sectorQuadrant: s.sectorQuadrant,
      sectorComposite: s.sectorComposite,
      sectorStealth: s.sectorStealth,
    };
  });

  // Sort: HIGH first, then by rsAccel descending
  const convictionOrder: Record<ConvictionLevel, number> = { HIGH: 0, MEDIUM: 1, WATCH: 2 };
  enriched.sort((a, b) => {
    const co = convictionOrder[a.conviction] - convictionOrder[b.conviction];
    if (co !== 0) return co;
    return (b.rsAccel ?? -999) - (a.rsAccel ?? -999);
  });

  // Build pullback watch from extension-only rejects
  const pullbackWatch = buildPullbackWatch(extensionOnly);

  return { passed: enriched, rejected, pullbackWatch };
}
