/**
 * Crypto Rotation types.
 * Extends equity SectorRotationResult with crypto-specific fields.
 */

import type {
  SectorRotationScore,
  SectorRotationResult,
  EnrichedStock,
  RejectedStock,
} from "../sector-rotation/types";

// Re-export for convenience
export type { SectorRotationScore, EnrichedStock, RejectedStock };

export interface CryptoRotationResult extends Omit<SectorRotationResult, "crossSectorPairs"> {
  assetClass: "crypto";
  btcDominance?: {
    current: number;
    trend: "rising" | "falling" | "flat";
    altSeasonSignal: boolean;
  };
  /** Symbols added by the discovery layer (for UI "trending" badges). */
  discoveredSymbols?: string[];
}
