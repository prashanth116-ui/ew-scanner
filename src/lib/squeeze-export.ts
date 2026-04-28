import type { ScoredSqueezeCandidate } from "./ew-types";

export async function exportSqueezeToExcel(
  results: ScoredSqueezeCandidate[]
): Promise<void> {
  const XLSX = await import("xlsx");

  const rows = results.map((r) => ({
    Ticker: r.ticker,
    Name: r.name,
    Score: r.squeezeScore,
    Tier: r.tier,
    "SI%": r.shortPercentOfFloat?.toFixed(1) ?? "-",
    "Days to Cover": r.shortRatio?.toFixed(1) ?? "-",
    "Float (M)": r.floatShares ? (r.floatShares / 1e6).toFixed(1) : "-",
    "Vol Ratio": r.volumeRatio?.toFixed(2) ?? "-",
    Price: r.currentPrice?.toFixed(2) ?? "-",
    "Near 52w Low %": r.nearLowPct?.toFixed(1) ?? "-",
    "Market Cap (M)": r.marketCap ? (r.marketCap / 1e6).toFixed(0) : "-",
    "Shares Short (M)": r.sharesShort ? (r.sharesShort / 1e6).toFixed(2) : "-",
    "Avg Volume (3mo)": r.avgVolume3Month ?? "-",
    "Insider %": r.heldPercentInsiders?.toFixed(1) ?? "-",
    "Institutional %": r.heldPercentInstitutions?.toFixed(1) ?? "-",
    "EW Position": r.ewPosition ?? "-",
    "EW Confidence": r.ewConfidence ?? "-",
    "SI Score": r.components.siPercent,
    "DTC Score": r.components.daysTocover,
    "Float Score": r.components.floatSize,
    "Volume Score": r.components.volumeSurge,
    "Near Low Score": r.components.near52wLow,
    "EW Score": r.components.ewAlignment,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Squeeze Scan");

  XLSX.writeFile(
    wb,
    `squeeze-scan-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

export function exportSqueezeToCsv(
  results: ScoredSqueezeCandidate[]
): void {
  const header = [
    "Ticker", "Name", "Score", "Tier", "SI%", "Days to Cover",
    "Float (M)", "Vol Ratio", "Price", "Near 52w Low %",
    "Market Cap (M)", "EW Position",
  ].join(",");

  const rows = results.map((r) =>
    [
      r.ticker,
      `"${(r.name ?? "").replace(/"/g, '""')}"`,
      r.squeezeScore,
      r.tier,
      r.shortPercentOfFloat?.toFixed(1) ?? "",
      r.shortRatio?.toFixed(1) ?? "",
      r.floatShares ? (r.floatShares / 1e6).toFixed(1) : "",
      r.volumeRatio?.toFixed(2) ?? "",
      r.currentPrice?.toFixed(2) ?? "",
      r.nearLowPct?.toFixed(1) ?? "",
      r.marketCap ? (r.marketCap / 1e6).toFixed(0) : "",
      `"${(r.ewPosition ?? "").replace(/"/g, '""')}"`,
    ].join(",")
  );

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `squeeze-scan-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
