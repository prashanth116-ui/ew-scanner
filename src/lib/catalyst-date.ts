/**
 * Catalyst date arithmetic, shared by the server loader and the client badge.
 *
 * Isomorphic on purpose. The countdown appears in the nightly Telegram and on the page,
 * and those two disagreeing by a day — which is exactly what happens when the same
 * arithmetic is written twice — would be worse than not showing it at all.
 */

/**
 * Whole days from today to `date` (YYYY-MM-DD). Negative once the date has passed.
 *
 * Both sides are floored to a UTC midnight before subtracting, so the answer does not
 * change with the time of day. A countdown that reads "in 2d" at 23:50 and "in 1d" ten
 * minutes later is a bug you only notice at the worst possible moment.
 */
export function daysUntil(date: string, today: Date = new Date()): number {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const [y, m, d] = date.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - t) / 86_400_000);
}

/**
 * "in 3d" / "today" / "2d ago".
 *
 * The countdown leads rather than the date, because a date alone forces mental
 * arithmetic at exactly the moment you are deciding whether to size into something.
 */
export function countdownLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days}d`;
  if (days === -1) return "yesterday";
  return `${Math.abs(days)}d ago`;
}
