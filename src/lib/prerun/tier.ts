import type { InstitutionalClassification, ShortlistTier } from "./types";

const ACTIONABLE = new Set<InstitutionalClassification>([
  "CONTINUATION_LEADER",
  "RECOVERY_LEADER",
  "FRESH_ROTATION",
  "INSTITUTIONAL_ACCUMULATION",
  "TIGHT_BASE",
  "CONSTRUCTIVE_SETUP",
  "OVERSOLD_REVERSAL",
]);

export function computeTier(
  classification: InstitutionalClassification,
  compositeScore: number,
): ShortlistTier {
  if (!ACTIONABLE.has(classification)) return null;
  if (classification === "OVERSOLD_REVERSAL") return "SPECULATIVE";
  if (classification === "INSTITUTIONAL_ACCUMULATION") return "SPECULATIVE";
  if (classification === "TIGHT_BASE") return "SHORTLIST";
  if (compositeScore >= 55) return "SHORTLIST";
  if (compositeScore >= 40) return "WATCHLIST";
  return "SPECULATIVE";
}
