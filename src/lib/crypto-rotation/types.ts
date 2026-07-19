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
import type { CryptoRegimeData } from "./crypto-regime";

// Re-export for convenience
export type { SectorRotationScore, EnrichedStock, RejectedStock };

export interface CryptoRotationResult extends Omit<SectorRotationResult, "crossSectorPairs"> {
  assetClass: "crypto";
  btcDominance?: {
    current: number;
    trend: "rising" | "falling" | "flat";
    altSeasonSignal: boolean;
  };
  /** Native crypto regime data (avoids round-trip inversion via equity-compat fields). */
  cryptoRegime?: CryptoRegimeData;
  /** Symbols added by the discovery layer (for UI "trending" badges). */
  discoveredSymbols?: string[];
}
