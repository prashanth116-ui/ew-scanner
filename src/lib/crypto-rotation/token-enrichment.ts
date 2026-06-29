/**
 * Crypto token enrichment — quality gates + classification + conviction.
 * Wraps existing equity stock-enrichment with crypto-specific thresholds.
 * SERVER-ONLY.
 */

import "server-only";

import type { EnrichedStock, RejectedStock, PullbackWatchStock } from "../sector-rotation/types";
import type { StockInput } from "../sector-rotation/stock-enrichment";
import { classifyStock, scoreConviction } from "../sector-rotation/stock-enrichment";

// ── Crypto Quality Gates ──

function applyCryptoQualityGates(
  stocks: StockInput[]
): { passed: StockInput[]; rejected: RejectedStock[] } {
  const passed: StockInput[] = [];
  const rejected: RejectedStock[] = [];

  for (const s of stocks) {
    const reasons: string[] = [];
    const volRatio = s.avgVolume10d > 0 ? s.volume / s.avgVolume10d : 0;

    // Gate 1: Market cap >= $50M (crypto: much lower than equity $2B)
    if (s.marketCap != null && s.marketCap < 50_000_000) {
      reasons.push(`market_cap=$${(s.marketCap / 1e6).toFixed(0)}M (<$50M)`);
    }

    // Gate 2: Dollar volume >= $500K
    // Yahoo Finance reports crypto volume in coin units, not USD — multiply by price
    const dollarVolume = s.volume * s.price;
    if (dollarVolume < 500_000) {
      reasons.push(`dollar_vol=$${(dollarVolume / 1e3).toFixed(0)}K (<$500K)`);
    }

    // Gate 3: Volume spike ratio <= 10x (crypto is more volatile than equities)
    if (volRatio > 10.0) {
      reasons.push(`vol_spike=${volRatio.toFixed(1)}x (>10x)`);
    }

    // Gate 4: Price extension <= 150% above 200-SMA (crypto: wider than equity 80%)
    if (s.sma200 != null && s.sma200 > 0) {
      const pctFrom200 = ((s.price - s.sma200) / s.sma200) * 100;
      if (pctFrom200 > 150) {
        reasons.push(`extension=${pctFrom200.toFixed(0)}% (>150%)`);
      }
    }

    // Gate 5: Liquidity depth proxy — volume-to-market-cap ratio
    // Extremely illiquid tokens (vol/mcap < 0.001) are unreliable
    if (s.marketCap != null && s.marketCap > 0) {
      const volToMcap = dollarVolume / s.marketCap;
      if (volToMcap < 0.001) {
        reasons.push(`liquidity_depth=${(volToMcap * 100).toFixed(3)}% (<0.1%)`);
      }
    }

    // Gate 6: Price stability (anti-rug check)
    // If price is more than 50% below 200-SMA, flag as extreme decline
    if (s.sma200 != null && s.sma200 > 0) {
      const pctFrom200 = ((s.price - s.sma200) / s.sma200) * 100;
      if (pctFrom200 < -50) {
        reasons.push(`extreme_decline=${pctFrom200.toFixed(0)}% from 200MA`);
      }
    }

    // Skip: institutional ownership gate (unavailable for crypto)
    // Skip: ETF return correlation gate

    if (reasons.length > 0) {
      rejected.push({ symbol: s.symbol, sector: s.sector, reasons });
    } else {
      passed.push(s);
    }
  }

  return { passed, rejected };
}

// ── Full enrichment pipeline (crypto) ──

export function enrichCryptoTokens(
  stocks: StockInput[],
  regimeFavoredSectors?: string[],
  regimeAvoidSectors?: string[],
): {
  passed: EnrichedStock[];
  rejected: RejectedStock[];
  pullbackWatch: PullbackWatchStock[];
} {
  // Crypto quality gates
  const { passed: gated, rejected } = applyCryptoQualityGates(stocks);

  // Classify + score each passing token (reuse equity logic)
  const enriched: EnrichedStock[] = gated.map((s) => {
    const classified = classifyStock(s, s.sectorAcceleration);
    let scored = scoreConviction(
      classified.category,
      classified.rsAccel,
      classified.volRatio,
      null, // no institutional data for crypto
      s.sectorQuadrant,
      s.sectorComposite,
      s.sectorStealth
    );

    // Regime alignment adjustment
    if (regimeFavoredSectors || regimeAvoidSectors) {
      let adjustedSignals = scored.convictionSignals;
      if (regimeFavoredSectors?.includes(s.sector)) {
        adjustedSignals += 1; // Regime-aligned boost
      }
      if (regimeAvoidSectors?.includes(s.sector)) {
        adjustedSignals -= 1; // Regime headwind penalty
      }

      // Reclassify conviction based on adjusted signals
      if (adjustedSignals !== scored.convictionSignals) {
        const newConviction =
          adjustedSignals >= 4
            ? "HIGH" as const
            : adjustedSignals >= 2
            ? "MEDIUM" as const
            : "WATCH" as const;
        scored = {
          conviction: newConviction,
          convictionSignals: adjustedSignals,
        };
      }
    }

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
      institutionalPct: null, // not available for crypto
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
  const convictionOrder = { HIGH: 0, MEDIUM: 1, WATCH: 2 } as const;
  enriched.sort((a, b) => {
    const co = (convictionOrder[a.conviction] ?? 2) - (convictionOrder[b.conviction] ?? 2);
    if (co !== 0) return co;
    return (b.rsAccel ?? -999) - (a.rsAccel ?? -999);
  });

  return { passed: enriched, rejected, pullbackWatch: [] };
}
