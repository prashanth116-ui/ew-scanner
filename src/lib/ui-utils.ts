/** Shared UI utility functions used across scanner pages. */

/** Get Tailwind classes for a confidence tier badge. */
export function confidenceBadgeClass(tier: string): string {
  switch (tier) {
    case "high":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "probable":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

/** Get Tailwind classes for a risk level badge. */
export function riskBadgeClass(level: string): string {
  switch (level) {
    case "Low":
      return "bg-green-500/20 text-green-400";
    case "High":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-yellow-500/20 text-yellow-400";
  }
}

/** Dot status for finding rows. */
export type DotStatus = "pass" | "warn" | "fail";

export function getDotStatus(value: number, threshold: number): DotStatus {
  if (value >= threshold) return "pass";
  if (value >= threshold * 0.5) return "warn";
  return "fail";
}

export const dotCss: Record<DotStatus, string> = {
  pass: "bg-green-400",
  warn: "bg-yellow-400",
  fail: "bg-red-400",
};

/** Format a year number as string. */
export function fmtYear(y: number): string {
  return String(y);
}
