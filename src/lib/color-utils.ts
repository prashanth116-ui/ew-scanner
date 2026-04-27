/**
 * Shared color utility functions used across scanner pages.
 */

/** Squeeze tier badge colors. */
export function tierColor(tier: string): string {
  switch (tier) {
    case "high":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "medium":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    default:
      return "bg-[#2a2a2a] text-[#a0a0a0] border-[#333]";
  }
}

/** Pre-Run verdict badge colors. */
export function verdictColor(verdict: string): string {
  switch (verdict) {
    case "PRIORITY":
      return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "KEEP":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "WATCH":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "DISCARD":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-[#2a2a2a] text-[#a0a0a0] border-[#333]";
  }
}

/** Score-based progress bar gradient (green/amber/red). */
export function scoreBarGradient(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.7) return "bg-green-500";
  if (pct >= 0.5) return "bg-amber-500";
  return "bg-red-500";
}

/** Score-based dot color (green/amber/red). */
export function scoreDotColor(val: number, max = 2): string {
  const pct = max > 0 ? val / max : 0;
  if (pct >= 0.75) return "bg-green-500";
  if (pct >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

/** Sector composite score bar color. */
export function compositeColor(score: number): string {
  if (score >= 67) return "bg-green-500";
  if (score >= 33) return "bg-amber-500";
  return "bg-red-500";
}

/** Sector composite score text color. */
export function compositeTextColor(score: number): string {
  if (score >= 67) return "text-green-400";
  if (score >= 33) return "text-amber-400";
  return "text-red-400";
}
