/**
 * Pre-rotation leading signals.
 * Aggregates signals per sector that historically precede quadrant changes.
 * SERVER-ONLY: Uses Finnhub/Yahoo data.
 */

import "server-only";

export interface LeadingSignals {
  sector: string;
  insiderBuyCount: number;
  earningsBeatPct: number | null;
  pcrDeclining: boolean;
  signalCount: number; // Number of active leading signals (0-3)
  isBuilding: boolean; // 2+ signals active
}

/**
 * Aggregate leading signals for a sector.
 * Uses pre-fetched data to avoid extra API calls.
 */
export function computeLeadingSignals(
  sector: string,
  sectorData: {
    insiderBuys?: number;
    earningsBeatPct?: number;
    aggregatePCR?: number;
    prevPCR?: number;
  }
): LeadingSignals {
  let signalCount = 0;

  const insiderBuyCount = sectorData.insiderBuys ?? 0;
  if (insiderBuyCount >= 3) signalCount++; // Cluster insider buying

  const earningsBeatPct = sectorData.earningsBeatPct ?? null;
  if (earningsBeatPct != null && earningsBeatPct >= 70) signalCount++; // Strong beat rate

  const pcrDeclining =
    sectorData.aggregatePCR != null &&
    sectorData.prevPCR != null &&
    sectorData.aggregatePCR < sectorData.prevPCR;
  if (pcrDeclining) signalCount++; // P/C ratio declining (bullish)

  return {
    sector,
    insiderBuyCount,
    earningsBeatPct,
    pcrDeclining,
    signalCount,
    isBuilding: signalCount >= 2,
  };
}
