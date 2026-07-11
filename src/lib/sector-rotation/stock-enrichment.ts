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
import { CONVICTION, QUALITY_GATES, EXTENSION_TIERS, CLASSIFICATION } from "./config";

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

    // Gate 0a: Price >= minimum
    if (s.price < QUALITY_GATES.MIN_PRICE) {
      otherReasons.push(`price=$${s.price.toFixed(2)} (<$${QUALITY_GATES.MIN_PRICE})`);
    }

    // Gate 0b: Dollar volume >= minimum
    const dollarVol = s.price * s.avgVolume10d;
    if (dollarVol < QUALITY_GATES.MIN_DOLLAR_VOLUME) {
      otherReasons.push(`dollarVol=$${(dollarVol / 1e6).toFixed(0)}M (<$${QUALITY_GATES.MIN_DOLLAR_VOLUME / 1e6}M)`);
    }

    // Gate 0c: Price <= maximum (except Semiconductors)
    if (s.price > QUALITY_GATES.MAX_PRICE && s.sector !== "Semiconductors") {
      otherReasons.push(`price=$${s.price.toFixed(0)} (>$${QUALITY_GATES.MAX_PRICE})`);
    }

    // Gate 1: Market cap >= minimum (skip if null)
    if (s.marketCap != null && s.marketCap < QUALITY_GATES.MIN_MARKET_CAP) {
      otherReasons.push(`market_cap=$${(s.marketCap / 1e9).toFixed(1)}B (<$${QUALITY_GATES.MIN_MARKET_CAP / 1e9}B)`);
    }

    // Gate 2: Avg daily volume >= minimum
    if (s.avgVolume10d < QUALITY_GATES.MIN_AVG_VOLUME) {
      otherReasons.push(`vol_20d=${(s.avgVolume10d / 1e6).toFixed(1)}M (<${QUALITY_GATES.MIN_AVG_VOLUME / 1e6}M)`);
    }

    // Gate 3: Volume spike ratio <= max
    if (volRatio > QUALITY_GATES.MAX_VOLUME_SPIKE) {
      otherReasons.push(`vol_spike=${volRatio.toFixed(1)}x (>${QUALITY_GATES.MAX_VOLUME_SPIKE}x)`);
    }

    // Gate 4: Price extension <= max % above 200-SMA
    if (pctFrom200ma != null && pctFrom200ma > QUALITY_GATES.MAX_EXTENSION_PCT) {
      failedExtension = true;
    }

    // Gate 5: Above 50-SMA or turnaround signal.
    // Graduated exception: strong RS acceleration alone (>2x threshold) qualifies
    // without volume confirmation — a stock clearly accelerating relative to its
    // sector shouldn't be rejected for having average volume.
    const strongRsAccel = rsAccel != null && rsAccel > QUALITY_GATES.TURNAROUND_RS_ACCEL * 2;
    const standardTurnaround = rsAccel != null && rsAccel > QUALITY_GATES.TURNAROUND_RS_ACCEL && volRatio >= QUALITY_GATES.TURNAROUND_VOL_RATIO;
    if (!above50ma && !strongRsAccel && !standardTurnaround) {
      otherReasons.push("below_50MA_no_turnaround");
    }

    // Gate 6: Institutional ownership > minimum (structural filter, not timing signal)
    // This is a liquidity/quality characteristic — stocks with low institutional
    // ownership are structurally more prone to manipulation and liquidity gaps.
    // Based on quarterly 13F filings; ownership levels rarely shift dramatically.
    if (s.institutionalPct != null && s.institutionalPct < QUALITY_GATES.MIN_INSTITUTIONAL_PCT) {
      otherReasons.push(`institutional=${s.institutionalPct.toFixed(0)}% (<${QUALITY_GATES.MIN_INSTITUTIONAL_PCT}%)`);
    }

    // Gate 7: Sector correlation — stock 20d return within threshold of ETF
    if (s.ret20d != null) {
      const retDiff = Math.abs(s.ret20d - s.etfRet20d);
      if (retDiff > QUALITY_GATES.MAX_ETF_DEVIATION) {
        otherReasons.push(`uncorrelated_ret_diff=${retDiff.toFixed(1)}%`);
      }
    }

    const allReasons = [...otherReasons];
    if (failedExtension) {
      allReasons.push(`extension=${(pctFrom200ma ?? 0).toFixed(0)}% (>${QUALITY_GATES.MAX_EXTENSION_PCT}%)`);
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
    // Require both SMA200 and SMA50 — null SMA50 produces meaningless pctFrom50ma=0
    .filter((s) => s.sma200 != null && s.sma200 > 0 && s.sma50 != null && s.sma50 > 0)
    .map((s) => {
      const pctFrom200ma = calcPctFrom(s.price, s.sma200) ?? 0;
      const pctFrom50ma = calcPctFrom(s.price, s.sma50) ?? 0;
      const volRatio = calcVolRatio(s.volume, s.avgVolume10d);
      const distanceTo80Pct = Math.round((pctFrom200ma - QUALITY_GATES.MAX_EXTENSION_PCT) * 10) / 10;

      let tier: ExtensionTier;
      if (pctFrom200ma <= EXTENSION_TIERS.MODERATE_CEILING) {
        tier = "MODERATE_EXTENSION";
      } else if (pctFrom200ma <= EXTENSION_TIERS.HIGH_CEILING && pctFrom50ma <= EXTENSION_TIERS.HIGH_MAX_FROM_50) {
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
        sma50: s.sma50 ?? s.price,
        sma200: s.sma200 ?? s.price,
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


// ── Step 6: Classification ──

function classifyCategory(
  above50ma: boolean,
  ret20d: number | null,
  etfRet20d: number,
  volRatio: number,
  rsAccel: number | null
): StockCategory {
  if (above50ma && ret20d != null && ret20d > etfRet20d && volRatio >= CLASSIFICATION.LEADER_VOL_RATIO) {
    return "LEADER";
  }
  if (above50ma) {
    return "CATCH_UP";
  }
  if (rsAccel != null && rsAccel > QUALITY_GATES.TURNAROUND_RS_ACCEL && volRatio >= QUALITY_GATES.TURNAROUND_VOL_RATIO) {
    return "TURNAROUND";
  }
  // Strong RS acceleration passed quality gate without volume — classify consistently
  if (rsAccel != null && rsAccel > QUALITY_GATES.TURNAROUND_RS_ACCEL * 2) {
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

  // P2: Near 50MA crossover with strong acceleration + volume (checked first —
  // more specific than P1, catches below-50MA turnaround setups that P1 would swallow)
  if (pct >= CLASSIFICATION.P2_PCT_LOW && pct <= CLASSIFICATION.P2_PCT_HIGH && accel > CLASSIFICATION.P2_RS_ACCEL && volRatio >= CLASSIFICATION.P2_VOL_RATIO) {
    return "P2_TURNAROUND";
  }
  // P1: Below 50MA with positive acceleration — early basing
  if (!above50ma && accel > 0) {
    return "P1_BASING";
  }
  // P3: Clearly trending above 50MA with non-negative acceleration + minimum volume.
  // Without the volume gate, stocks with 0.5x volume get P3 despite weak participation.
  if (above50ma && pct > CLASSIFICATION.P3_PCT_LOW && accel >= 0 && volRatio >= CLASSIFICATION.P3_MIN_VOL_RATIO) {
    return "P3_TRENDING";
  }
  // P4: Above 50MA but deeply negative RS or sector acceleration — exhaustion
  // Must be above 50MA: stocks below can't exhaust from a trend they're not in
  if (above50ma && (accel < CLASSIFICATION.P4_RS_ACCEL || sectorAcceleration < CLASSIFICATION.P4_SECTOR_ACCEL)) {
    return "P4_EXHAUSTING";
  }
  // Fallback: enforce the same volume gate as the explicit P3 check —
  // without it, low-volume stocks bypass the P3_MIN_VOL_RATIO requirement.
  return above50ma
    ? (accel < 0 ? "P4_EXHAUSTING" : (volRatio >= CLASSIFICATION.P3_MIN_VOL_RATIO ? "P3_TRENDING" : "P1_BASING"))
    : "P1_BASING";
}

function rsAccelDescription(rsAccel: number | null): string {
  if (rsAccel == null) return "n/a";
  if (rsAccel >= CLASSIFICATION.RS_DESC_STRONG) return "strong catch-up";
  if (rsAccel >= CLASSIFICATION.RS_DESC_MODERATE) return "moderate";
  if (rsAccel >= CLASSIFICATION.RS_DESC_NEUTRAL) return "neutral";
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
  sectorQuadrant: RRGQuadrant,
  sectorComposite: number,
  sectorStealth: boolean
): { conviction: ConvictionLevel; convictionSignals: number } {
  // Weighted conviction: structural signals (sector-level) worth more than tactical (stock-level)
  const W = CONVICTION.SIGNAL_WEIGHTS;
  let weightedScore = 0;
  let signals = 0;

  if (sectorQuadrant === "IMPROVING" || sectorQuadrant === "LEADING") { weightedScore += W.sectorQuadrant; signals++; }
  if (sectorComposite >= CONVICTION.HIGH_COMPOSITE) { weightedScore += W.sectorComposite; signals++; }
  if (category === "TURNAROUND" || category === "LEADER") { weightedScore += W.stockCategory; signals++; }
  if (rsAccel != null && rsAccel >= CONVICTION.STRONG_RS_ACCEL) { weightedScore += W.rsAccel; signals++; }
  // Stealth credit only when the stock itself shows participation — a low-volume
  // stock in a stealth sector isn't accumulating, it's just along for the ride.
  if (sectorStealth && (volRatio >= 0.8 || category === "TURNAROUND" || category === "LEADER")) { weightedScore += W.sectorStealth; signals++; }
  if (volRatio >= CONVICTION.HIGH_VOL_RATIO) { weightedScore += W.volumeRatio; signals++; }

  let conviction: ConvictionLevel;
  if (weightedScore >= CONVICTION.WEIGHTED_HIGH) conviction = "HIGH";
  else if (weightedScore >= CONVICTION.WEIGHTED_MEDIUM) conviction = "MEDIUM";
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
  const pullbackWatch = buildExtendedWatch(extensionOnly);

  return { passed: enriched, rejected, pullbackWatch };
}
