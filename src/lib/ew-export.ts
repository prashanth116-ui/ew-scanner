import type { ScoredCandidate } from "./ew-scoring";
import type { EnhancedScoredCandidate, ScannerMode } from "./ew-types";

// ── Original export functions (preserved) ──

export async function exportToExcel(
  candidates: ScoredCandidate[],
  labels: Record<string, string>
) {
  const XLSX = await import("xlsx");

  // Sheet 1: Summary
  const summaryData = candidates.map((c) => ({
    Ticker: c.ticker,
    Name: c.name,
    "Score (0-7)": c.score,
    "Score %": `${(c.normalizedScore * 100).toFixed(0)}%`,
    "Decline %": `${c.declinePct.toFixed(1)}%`,
    "Duration (months)": c.monthsDecline.toFixed(1),
    "Recovery %": `${c.recoveryPct.toFixed(1)}%`,
    Passed: c.passed ? "Yes" : "No",
  }));
  const ws1 = XLSX.utils.json_to_sheet(summaryData);

  // Sheet 2: Price Data
  const priceData = candidates.map((c) => ({
    Ticker: c.ticker,
    Name: c.name,
    ATH: c.ath.toFixed(2),
    "ATH Year": c.athYear,
    Low: c.low.toFixed(2),
    "Low Year": c.lowYear,
    Current: c.current.toFixed(2),
  }));
  const ws2 = XLSX.utils.json_to_sheet(priceData);

  // Sheet 3: EW Labels
  const labelData = candidates.map((c) => ({
    Ticker: c.ticker,
    Name: c.name,
    "EW Label": labels[c.ticker] || "\u2014",
  }));
  const ws3 = XLSX.utils.json_to_sheet(labelData);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Summary");
  XLSX.utils.book_append_sheet(wb, ws2, "Price Data");
  XLSX.utils.book_append_sheet(wb, ws3, "EW Labels");

  XLSX.writeFile(wb, `ew-scan-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportToCsv(
  candidates: ScoredCandidate[],
  labels: Record<string, string>
) {
  const header = [
    "Ticker",
    "Name",
    "Score",
    "Score %",
    "Decline %",
    "Duration (months)",
    "Recovery %",
    "ATH",
    "ATH Year",
    "Low",
    "Low Year",
    "Current",
    "EW Label",
    "Passed",
  ].join(",");

  const rows = candidates.map((c) =>
    [
      c.ticker,
      `"${c.name.replace(/"/g, '""')}"`,
      c.score,
      `${(c.normalizedScore * 100).toFixed(0)}%`,
      `${c.declinePct.toFixed(1)}%`,
      c.monthsDecline.toFixed(1),
      `${c.recoveryPct.toFixed(1)}%`,
      c.ath.toFixed(2),
      c.athYear,
      c.low.toFixed(2),
      c.lowYear,
      c.current.toFixed(2),
      `"${(labels[c.ticker] || "\u2014").replace(/"/g, '""')}"`,
      c.passed ? "Yes" : "No",
    ].join(",")
  );

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ew-scan-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Enhanced export functions (V2) ──

export async function exportEnhancedToExcel(
  candidates: EnhancedScoredCandidate[],
  labels: Record<string, string>,
  mode: ScannerMode
) {
  const XLSX = await import("xlsx");

  const summaryData = candidates.map((c) => ({
    Ticker: c.ticker,
    Name: c.name,
    Sector: c.sector ?? "",
    "Scanner Mode": mode,
    "Base Score (0-7)": c.score,
    "Enhanced Score": c.enhancedScore.toFixed(1),
    "Enhanced %": `${Math.round(c.enhancedNormalized * 100)}%`,
    Confidence: c.confidenceTier,
    "Decline %": `${c.declinePct.toFixed(1)}%`,
    "Duration (months)": c.monthsDecline.toFixed(1),
    "Recovery %": `${c.recoveryPct.toFixed(1)}%`,
    "Fib Zone": c.fibAnalysis?.depthLabel ?? "",
    "Fib Depth": c.fibAnalysis ? `${(c.fibAnalysis.retracementDepth * 100).toFixed(1)}%` : "",
    "Golden Zone": c.fibAnalysis?.withinGoldenZone ? "Yes" : "No",
    "Volume Trend": c.volumeAnalysis?.volumeTrend ?? "",
    "Structure": c.structureAnalysis?.classification ?? "",
    "Swing Count": c.structureAnalysis?.swingCount ?? "",
    "Momentum": c.momentumAnalysis?.score?.toFixed(2) ?? "",
    "Rel Strength": c.relativeStrength?.toFixed(2) ?? "",
    "EW Label": labels[c.ticker] || "",
  }));
  const ws1 = XLSX.utils.json_to_sheet(summaryData);

  const priceData = candidates.map((c) => ({
    Ticker: c.ticker,
    Name: c.name,
    ATH: c.ath.toFixed(2),
    "ATH Year": c.athYear,
    Low: c.low.toFixed(2),
    "Low Year": c.lowYear,
    Current: c.current.toFixed(2),
  }));
  const ws2 = XLSX.utils.json_to_sheet(priceData);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Enhanced Summary");
  XLSX.utils.book_append_sheet(wb, ws2, "Price Data");

  XLSX.writeFile(wb, `ew-scan-v2-${mode}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportEnhancedToCsv(
  candidates: EnhancedScoredCandidate[],
  labels: Record<string, string>,
  mode: ScannerMode
) {
  const header = [
    "Ticker",
    "Name",
    "Sector",
    "Mode",
    "Base Score",
    "Enhanced Score",
    "Enhanced %",
    "Confidence",
    "Decline %",
    "Duration (months)",
    "Recovery %",
    "Fib Zone",
    "Golden Zone",
    "Volume Trend",
    "Structure",
    "Momentum",
    "ATH",
    "ATH Year",
    "Low",
    "Low Year",
    "Current",
    "EW Label",
  ].join(",");

  const rows = candidates.map((c) =>
    [
      c.ticker,
      `"${c.name.replace(/"/g, '""')}"`,
      `"${(c.sector ?? "").replace(/"/g, '""')}"`,
      mode,
      c.score,
      c.enhancedScore.toFixed(1),
      `${Math.round(c.enhancedNormalized * 100)}%`,
      c.confidenceTier,
      `${c.declinePct.toFixed(1)}%`,
      c.monthsDecline.toFixed(1),
      `${c.recoveryPct.toFixed(1)}%`,
      `"${(c.fibAnalysis?.depthLabel ?? "").replace(/"/g, '""')}"`,
      c.fibAnalysis?.withinGoldenZone ? "Yes" : "No",
      c.volumeAnalysis?.volumeTrend ?? "",
      c.structureAnalysis?.classification ?? "",
      c.momentumAnalysis?.score?.toFixed(2) ?? "",
      c.ath.toFixed(2),
      c.athYear,
      c.low.toFixed(2),
      c.lowYear,
      c.current.toFixed(2),
      `"${(labels[c.ticker] || "").replace(/"/g, '""')}"`,
    ].join(",")
  );

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ew-scan-v2-${mode}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
