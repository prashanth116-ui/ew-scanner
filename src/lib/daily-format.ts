/** Safe number formatter — returns "-" for null/undefined/NaN values. */
export function fmtNum(v: unknown, decimals: number): string {
  if (v == null) return "-";
  const n = Number(v);
  if (isNaN(n)) return "-";
  return n.toFixed(decimals);
}
