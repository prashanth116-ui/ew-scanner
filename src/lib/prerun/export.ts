/** Pre-Run export to Excel/CSV. */

import type { PreRunResult } from "./types";

function verdictLabel(v: string): string {
  return v;
}

export async function exportPreRunToExcel(results: PreRunResult[]): Promise<void> {
  const XLSX = await import("xlsx");

  const rows = results.map((r) => ({
    Ticker: r.data.ticker,
    Company: r.data.companyName,
    Price: r.data.currentPrice,
    "% From ATH": r.data.pctFromAth?.toFixed(1),
    "ATH": r.data.allTimeHigh?.toFixed(2) ?? "-",
    "52w High": r.data.high52w?.toFixed(2) ?? "-",
    "Weeks in Base": r.data.weeksInBase ?? "-",
    "Inst %": r.data.institutionalPct !== null ? r.data.institutionalPct.toFixed(1) : "-",
    "Short Float %": r.data.shortFloat?.toFixed(1),
    "Market Cap": r.data.marketCap ? `$${(r.data.marketCap / 1e9).toFixed(1)}B` : "-",
    "Days to Earnings": r.data.daysToEarnings ?? "-",
    "Revenue Growth YoY": r.data.revenueGrowthYoY ? `${r.data.revenueGrowthYoY.toFixed(1)}%` : "-",
    Analysts: r.data.analystCount ?? "-",
    "Gate 1": r.gates.gate1 ? "PASS" : "FAIL",
    "Gate 2": r.gates.gate2 ? "PASS" : "FAIL",
    "Gate 3": r.gates.gate3 ? "PASS" : "FAIL",
    "A (Base)": r.scores.scoreA,
    "B (SI)": r.scores.scoreB,
    "C (Catalyst)": r.scores.scoreC,
    "D (Earnings)": r.scores.scoreD,
    "E (Inst)": r.scores.scoreE,
    "F (Volume)": r.scores.scoreF,
    "G (Index)": r.scores.scoreG,
    Score: r.scores.finalScore,
    Verdict: verdictLabel(r.verdict),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pre-Run Scan");

  XLSX.writeFile(wb, `prerun-scan-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
