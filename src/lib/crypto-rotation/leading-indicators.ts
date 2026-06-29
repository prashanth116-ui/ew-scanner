/**
 * Crypto-specific leading indicators computed from existing rotation data.
 * No new external API calls required — all derived from CryptoRotationResult.
 */

import type { CryptoRotationResult } from "./types";
import { CRYPTO_UNIVERSE } from "@/data/crypto-sector-universe";

// Sector name constants derived from the universe definition
const SECTOR_NAMES = Object.fromEntries(
  CRYPTO_UNIVERSE.map((s) => [s.id, s.displayName])
) as Record<string, string>;

export interface CryptoLeadingIndicator {
  name: string;
  signal: "bullish" | "bearish" | "neutral";
  description: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Compute crypto-specific leading indicators from existing rotation data.
 */
export function computeCryptoLeadingIndicators(
  data: CryptoRotationResult,
): CryptoLeadingIndicator[] {
  const indicators: CryptoLeadingIndicator[] = [];
  const sectorMap = new Map(data.sectors.map((s) => [s.sector, s]));

  // 1. Memecoin momentum — speculative euphoria indicator
  const meme = sectorMap.get(SECTOR_NAMES["meme"]);
  if (meme) {
    if (
      meme.acceleration > 2 &&
      (meme.quadrant === "LEADING" || meme.quadrant === "IMPROVING")
    ) {
      indicators.push({
        name: "Memecoin Euphoria",
        signal: "bearish",
        description: `Memecoins accelerating (${meme.acceleration.toFixed(1)}) in ${meme.quadrant} quadrant. Speculative euphoria often precedes a market top.`,
        confidence: meme.acceleration > 4 ? "high" : "medium",
      });
    } else if (
      meme.quadrant === "LAGGING" &&
      meme.acceleration < -2
    ) {
      indicators.push({
        name: "Memecoin Washout",
        signal: "neutral",
        description: "Memecoins declining with negative acceleration. Speculative froth has been cleared.",
        confidence: "medium",
      });
    }
  }

  // 2. DeFi health — crypto liquidity indicator
  const defi = sectorMap.get(SECTOR_NAMES["defi"]);
  if (defi) {
    if (
      defi.cmf20 > 0 &&
      (defi.quadrant === "IMPROVING" || defi.quadrant === "LEADING")
    ) {
      indicators.push({
        name: "DeFi Health",
        signal: "bullish",
        description: `DeFi sector has positive money flow (CMF ${defi.cmf20.toFixed(3)}) in ${defi.quadrant} quadrant. Crypto liquidity expanding.`,
        confidence: defi.compositeScore > 60 ? "high" : "medium",
      });
    } else if (defi.cmf20 < 0 && defi.quadrant === "LAGGING") {
      indicators.push({
        name: "DeFi Health",
        signal: "bearish",
        description: `DeFi sector has negative money flow (CMF ${defi.cmf20.toFixed(3)}) in LAGGING quadrant. Crypto liquidity contracting.`,
        confidence: "medium",
      });
    }
  }

  // 3. Infrastructure strength — developer activity proxy
  const infra = sectorMap.get(SECTOR_NAMES["infra"]);
  if (infra) {
    if (infra.acceleration > 1 && infra.mansfieldRS > 0) {
      indicators.push({
        name: "Infrastructure Strength",
        signal: "bullish",
        description: `Infrastructure tokens (LINK, GRT) accelerating with positive RS. Developer and oracle activity proxy is bullish leading indicator.`,
        confidence: infra.acceleration > 3 ? "high" : "medium",
      });
    }
  }

  // 4. Exchange token trend — exchange activity / volume leading indicator
  const exchange = sectorMap.get(SECTOR_NAMES["exchange"]);
  if (exchange) {
    if (
      exchange.acceleration > 0 &&
      (exchange.quadrant === "IMPROVING" || exchange.quadrant === "LEADING")
    ) {
      indicators.push({
        name: "Exchange Activity Rising",
        signal: "bullish",
        description: `Exchange tokens strengthening (${exchange.quadrant}, accel ${exchange.acceleration.toFixed(1)}). Rising exchange activity is a volume leading indicator.`,
        confidence: "medium",
      });
    } else if (
      exchange.acceleration < -1 &&
      exchange.quadrant === "WEAKENING"
    ) {
      indicators.push({
        name: "Exchange Activity Declining",
        signal: "bearish",
        description: "Exchange tokens weakening with negative acceleration. Trading activity may be declining.",
        confidence: "medium",
      });
    }
  }

  // 5. Gaming/Metaverse inflection — risk appetite indicator
  const gaming = sectorMap.get(SECTOR_NAMES["gaming"]);
  if (gaming) {
    if (
      gaming.quadrant === "IMPROVING" &&
      gaming.acceleration > 0
    ) {
      indicators.push({
        name: "Gaming Inflection",
        signal: "bullish",
        description: "Gaming/Metaverse sector crossing into IMPROVING with positive acceleration. Risk appetite returning to speculative sectors.",
        confidence: "low",
      });
    }
  }

  // 6. L1 vs L2 divergence — scaling narrative indicator
  const l1 = sectorMap.get(SECTOR_NAMES["layer-1"]);
  const l2 = sectorMap.get(SECTOR_NAMES["layer-2"]);
  if (l1 && l2) {
    const l2Outperforming =
      l2.compositeScore > l1.compositeScore + 10 &&
      l2.acceleration > l1.acceleration;
    const l1Outperforming =
      l1.compositeScore > l2.compositeScore + 10 &&
      l1.acceleration > l2.acceleration;

    if (l2Outperforming) {
      indicators.push({
        name: "L2 > L1 Rotation",
        signal: "bullish",
        description: `L2 sector (${l2.compositeScore}) outperforming L1 (${l1.compositeScore}). Scaling narrative active — usage-driven rotation.`,
        confidence: Math.abs(l2.compositeScore - l1.compositeScore) > 20 ? "high" : "medium",
      });
    } else if (l1Outperforming) {
      indicators.push({
        name: "L1 > L2 Rotation",
        signal: "neutral",
        description: `L1 sector (${l1.compositeScore}) outperforming L2 (${l2.compositeScore}). Capital flowing to base layers.`,
        confidence: "medium",
      });
    }
  }

  return indicators;
}
