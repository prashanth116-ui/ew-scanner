/**
 * Shared utility functions for all daily scanner pages.
 * Eliminates duplication across preset-daily, inflection-daily, vcp-daily,
 * institutional-daily, and qfe-daily.
 */

import { fmtNum } from "@/lib/daily-format";

/** Format a YYYY-MM-DD date string as a short pill label (e.g. "Jul 3"). */
export function formatDatePill(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Tailwind classes for streak badge (green 5+, cyan 3+, gray default). */
export function streakColor(streak: number): string {
  if (streak >= 5) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (streak >= 3) return "text-cyan-400 bg-cyan-500/10 border-cyan-500/30";
  return "text-[#666] bg-[#1a1a1a] border-[#2a2a2a]";
}

/**
 * Score color with configurable thresholds.
 * Defaults to 0-100 scale (80/65/50). Pass custom thresholds for other scales.
 */
export function scoreColor(
  score: number,
  thresholds: [number, number, number] = [80, 65, 50],
): string {
  if (score >= thresholds[0]) return "text-emerald-400";
  if (score >= thresholds[1]) return "text-cyan-400";
  if (score >= thresholds[2]) return "text-amber-400";
  return "text-red-400";
}

/** Score bar background color based on percentage of max. */
export function scoreBarColor(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.6) return "bg-emerald-500";
  if (pct >= 0.45) return "bg-cyan-500";
  if (pct >= 0.3) return "bg-amber-500";
  return "bg-red-500";
}

/** Format market cap as $1.2T / $45.3B / $800M. */
export function formatMktCap(v: number | null | undefined): string {
  if (v == null) return "-";
  if (v >= 1e12) return `$${fmtNum(v / 1e12, 1)}T`;
  if (v >= 1e9) return `$${fmtNum(v / 1e9, 1)}B`;
  if (v >= 1e6) return `$${fmtNum(v / 1e6, 0)}M`;
  return `$${v}`;
}

/** Trigger CSV download for a daily page's data. */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
