/**
 * Crypto rotation helpers — thin wrappers of equity rotation-helpers.
 * Re-exports lifecycle, conviction, and action signal functions.
 */

export {
  computeLifecycleStage,
  computeConviction,
  computeActionSignal,
  getHealth,
  DEFAULT_HEALTH,
} from "../sector-rotation/rotation-helpers";

export type { ActionSignal } from "../sector-rotation/rotation-helpers";

import type { CryptoRegimeData } from "./crypto-regime";

/**
 * Check if a crypto sector is aligned with the current regime.
 */
export function isCryptoRegimeAligned(
  sectorName: string,
  regime: CryptoRegimeData
): "aligned" | "headwind" | "neutral" {
  if (regime.favoredSectors.includes(sectorName)) return "aligned";
  if (regime.avoidSectors.includes(sectorName)) return "headwind";
  return "neutral";
}
