/**
 * Scored ICT scanner — public surface.
 *
 * Pure price action: sweep, displacement, market structure shift, fair value
 * gap, reaccumulation, buy-side liquidity, compression. No moving averages, no
 * oscillators, no volume.
 *
 * Every ingredient is detected and graded independently, so a missing one costs
 * its own weight and nothing more.
 */

export { assessICT } from "./assess";
export {
  ramp,
  detectSSLRaid,
  detectDisplacement,
  detectMSS,
  detectFVG,
  detectReaccumulation,
  detectBSL,
  detectCompression,
  findInvalidation,
  countConsecutiveExpansion,
} from "./detectors";
export { assessMultiTimeframe, isTradeable, CONFLUENCE } from "./multi-tf";
export type { ICTMultiTFScored, TimeframeAssessment } from "./multi-tf";
export * from "./types";
export * as ictConfig from "./config";
