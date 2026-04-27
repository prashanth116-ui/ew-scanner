/**
 * Shared formatting utilities used across scanner pages.
 */

/** Format large numbers as M/B (e.g., 1500000 -> "1.5M", 2000000000 -> "2.0B"). */
export function formatM(val: number | null): string {
  if (val == null) return "-";
  const m = val / 1_000_000;
  if (m >= 1000) return `${(m / 1000).toFixed(1)}B`;
  return `${m.toFixed(1)}M`;
}

/** Format market cap with $ prefix (e.g., 5000000000 -> "$5.0B"). */
export function formatMktCap(val: number | null): string {
  if (val == null) return "-";
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(0)}M`;
  return `$${val.toFixed(0)}`;
}

/** Format number with optional decimal places. */
export function formatNum(val: number | null, decimals = 2): string {
  if (val == null) return "-";
  return val.toFixed(decimals);
}

/** Format unix timestamp (seconds) as locale date string. */
export function formatDate(ts: number | null): string {
  if (ts == null) return "-";
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Format percentage, with null handling. */
export function formatPct(val: number | null, decimals = 1): string {
  if (val == null) return "-";
  return `${val.toFixed(decimals)}%`;
}
