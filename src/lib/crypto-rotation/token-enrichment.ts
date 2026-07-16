/**
 * Crypto token enrichment — quality gates + classification + conviction.
 * Wraps existing equity stock-enrichment with crypto-specific thresholds.
 * SERVER-ONLY.
 */

import "server-only";

import type { EnrichedStock, RejectedStock, PullbackWatchStock } from "../sector-rotation/types";
import type { StockInput } from "../sector-rotation/stock-enrichment";
import { classifyStock, scoreConviction } from "../sector-rotation/stock-enrichment";
import { CRYPTO_QUALITY_GATES } from "../sector-rotation/config";

// ── Crypto Quality Gates ──

function applyCryptoQualityGates(
  stocks: StockInput[]
): { passed: StockInput[]; rejected: RejectedStock[] } {
  const passed: StockInput[] = [];
  const rejected: RejectedStock[] = [];

  for (const s of stocks) {
    const reasons: string[] = [];
    const volRatio = s.avgVolume10d > 0 ? s.volume / s.avgVolume10d : 0;

    // Gate 1: Market cap >= minimum (crypto: much lower than equity)
    if (s.marketCap != null && s.marketCap < CRYPTO_QUALITY_GATES.MIN_MARKET_CAP) {
      reasons.push(`market_cap=$${(s.marketCap / 1e6).toFixed(0)}M (<$${CRYPTO_QUALITY_GATES.MIN_MARKET_CAP / 1e6}M)`);
    }

    // Gate 2: Dollar volume >= minimum
    // Yahoo Finance reports crypto volume in coin units, not USD — multiply by price
    const dollarVolume = s.volume * s.price;
    if (dollarVolume < CRYPTO_QUALITY_GATES.MIN_DOLLAR_VOLUME) {
      reasons.push(`dollar_vol=$${(dollarVolume / 1e3).toFixed(0)}K (<$${CRYPTO_QUALITY_GATES.MIN_DOLLAR_VOLUME / 1e3}K)`);
    }

    // Gate 3: Volume spike ratio <= max (crypto is more volatile than equities)
    if (volRatio > CRYPTO_QUALITY_GATES.MAX_VOLUME_SPIKE) {
      reasons.push(`vol_spike=${volRatio.toFixed(1)}x (>${CRYPTO_QUALITY_GATES.MAX_VOLUME_SPIKE}x)`);
    }

    // Gate 4: Price extension <= max above 200-SMA (crypto: wider than equity)
    if (s.sma200 != null && s.sma200 > 0) {
      const pctFrom200 = ((s.price - s.sma200) / s.sma200) * 100;
      if (pctFrom200 > CRYPTO_QUALITY_GATES.MAX_EXTENSION_PCT) {
        reasons.push(`extension=${pctFrom200.toFixed(0)}% (>${CRYPTO_QUALITY_GATES.MAX_EXTENSION_PCT}%)`);
      }
    }

    // Gate 5: Liquidity depth proxy — volume-to-market-cap ratio
    if (s.marketCap != null && s.marketCap > 0) {
      const volToMcap = dollarVolume / s.marketCap;
      if (volToMcap < CRYPTO_QUALITY_GATES.MIN_VOL_TO_MCAP) {
        reasons.push(`liquidity_depth=${(volToMcap * 100).toFixed(3)}% (<${CRYPTO_QUALITY_GATES.MIN_VOL_TO_MCAP * 100}%)`);
      }
    }

    // Gate 6: Price stability (anti-rug check)
    if (s.sma200 != null && s.sma200 > 0) {
      const pctFrom200 = ((s.price - s.sma200) / s.sma200) * 100;
      if (pctFrom200 < CRYPTO_QUALITY_GATES.EXTREME_DECLINE_PCT) {
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

  // Classify + score each passing token (reuse equity logic).
  // NOTE: Crypto tokens cannot reach LEADER classification because classifyCategory()
  // requires ret20d != null (crypto doesn't have 20d ETF-relative returns).
  // Tokens land in CATCH_UP (above 50MA) or TURNAROUND (below 50MA) instead.
  const enriched: EnrichedStock[] = gated.map((s) => {
    const classified = classifyStock(s, s.sectorAcceleration);
    let scored = scoreConviction(
      classified.category,
      classified.phase,
      classified.rsAccel,
      classified.volRatio,
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
          adjustedSignals >= CRYPTO_QUALITY_GATES.CONVICTION_HIGH_SIGNALS
            ? "HIGH" as const
            : adjustedSignals >= CRYPTO_QUALITY_GATES.CONVICTION_MEDIUM_SIGNALS
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
