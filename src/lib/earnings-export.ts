import type { ConfluenceResult } from "./confluence/types";

// ── Single-ticker export (earnings detail page) ──

export interface SingleEarningsData {
  ticker: string;
  name: string;
  currentPrice: number | null;
  nextEarningsDate: string | null;
  nextEpsEstimate: number | null;
  nextRevenueAvg: number | null;
  history: {
    quarter: string;
    date: string;
    epsEstimate: number | null;
    epsActual: number | null;
    epsSurprise: number | null;
    surprisePercent: number | null;
  }[];
  estimates: {
    period: string;
    epsAvg: number | null;
    epsLow: number | null;
    epsHigh: number | null;
    numAnalysts: number | null;
    revenueAvg: number | null;
  }[];
  financials: {
    quarter: string;
    revenue: number | null;
    earnings: number | null;
  }[];
  insiderTransactions: {
    name: string;
    relation: string;
    date: string;
    shares: number | null;
    value: number | null;
    text: string;
  }[];
}

export async function exportSingleEarningsToExcel(
  data: SingleEarningsData,
  scanResult: ConfluenceResult | null
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summary = [
    {
      Ticker: data.ticker,
      Name: data.name,
      Price: data.currentPrice ?? "-",
      "Next Earnings": data.nextEarningsDate ?? "-",
      "Next EPS Est": data.nextEpsEstimate ?? "-",
      "Next Rev Est": data.nextRevenueAvg ?? "-",
      "Confluence %": scanResult ? Math.round(scanResult.scores.confluenceScore * 100) : "-",
      Signal: scanResult?.signal ?? "-",
      "Pass Count": scanResult?.scores.passCount ?? "-",
      "EW Score": scanResult ? Math.round(scanResult.scores.ewNormalized * 100) : "-",
      "Squeeze Score": scanResult ? Math.round(scanResult.scores.squeezeNormalized * 100) : "-",
      "Pre-Run Score": scanResult ? Math.round(scanResult.scores.prerunNormalized * 100) : "-",
      "Sector Score": scanResult ? Math.round(scanResult.scores.sectorNormalized * 100) : "-",
      "EW Wave": scanResult?.ewResult?.wavePosition ?? "-",
      "Squeeze Tier": scanResult?.squeezeResult?.tier ?? "-",
      "PreRun Verdict": scanResult?.prerunResult?.verdict ?? "-",
      "Sector Quadrant": scanResult?.sectorResult?.quadrant ?? "-",
      Sector: scanResult?.sector ?? "-",
    },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");

  // Sheet 2: Earnings History
  if (data.history.length > 0) {
    const historyRows = data.history.map((h) => ({
      Quarter: h.quarter || h.date,
      "EPS Est": h.epsEstimate ?? "-",
      "EPS Actual": h.epsActual ?? "-",
      Surprise: h.epsSurprise ?? "-",
      "Surprise %": h.surprisePercent != null ? `${(h.surprisePercent * 100).toFixed(1)}%` : "-",
      Result: h.epsSurprise != null ? (h.epsSurprise > 0 ? "Beat" : h.epsSurprise < 0 ? "Miss" : "Met") : "-",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(historyRows), "Earnings History");
  }

  // Sheet 3: Estimates
  if (data.estimates.length > 0) {
    const estRows = data.estimates.map((e) => ({
      Period: e.period,
      "EPS Avg": e.epsAvg ?? "-",
      "EPS Low": e.epsLow ?? "-",
      "EPS High": e.epsHigh ?? "-",
      Analysts: e.numAnalysts ?? "-",
      "Revenue Est": e.revenueAvg ?? "-",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(estRows), "Estimates");
  }

  // Sheet 4: Financials
  if (data.financials.length > 0) {
    const finRows = data.financials.map((f) => ({
      Quarter: f.quarter,
      Revenue: f.revenue ?? "-",
      Earnings: f.earnings ?? "-",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(finRows), "Financials");
  }

  // Sheet 5: Insider Activity
  if (data.insiderTransactions.length > 0) {
    const insiderRows = data.insiderTransactions.map((t) => ({
      Date: t.date,
      Name: t.name,
      Title: t.relation,
      Type: t.text,
      Shares: t.shares ?? "-",
      Value: t.value ?? "-",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(insiderRows), "Insider Activity");
  }

  XLSX.writeFile(wb, `earnings-${data.ticker}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Calendar bulk export ──

export interface EarningsExportEntry {
  date: string;
  symbol: string;
  hour: string;
  quarter: number | null;
  year: number | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}

export async function exportEarningsToExcel(
  entries: EarningsExportEntry[],
  scanResults: Map<string, ConfluenceResult>
): Promise<void> {
  const XLSX = await import("xlsx");

  // Sort: date asc, then confluence score desc
  const sorted = [...entries].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    const scoreA = scanResults.get(a.symbol)?.scores.confluenceScore ?? -1;
    const scoreB = scanResults.get(b.symbol)?.scores.confluenceScore ?? -1;
    return scoreB - scoreA;
  });

  const rows = sorted.map((e) => {
    const sr = scanResults.get(e.symbol);
    return {
      Date: e.date,
      Symbol: e.symbol,
      Timing: e.hour.toUpperCase(),
      Quarter: e.quarter != null ? `Q${e.quarter}` : "-",
      "EPS Est": e.epsEstimate ?? "-",
      "EPS Actual": e.epsActual ?? "-",
      "Rev Est": e.revenueEstimate ?? "-",
      "Rev Actual": e.revenueActual ?? "-",
      Price: sr?.price?.toFixed(2) ?? "-",
      "Confluence %": sr ? Math.round(sr.scores.confluenceScore * 100) : "-",
      Signal: sr?.signal ?? "-",
      "Pass Count": sr?.scores.passCount ?? "-",
      "EW Score": sr ? Math.round(sr.scores.ewNormalized * 100) : "-",
      "Squeeze Score": sr ? Math.round(sr.scores.squeezeNormalized * 100) : "-",
      "Pre-Run Score": sr ? Math.round(sr.scores.prerunNormalized * 100) : "-",
      "Sector Score": sr ? Math.round(sr.scores.sectorNormalized * 100) : "-",
      "EW Wave": sr?.ewResult?.wavePosition ?? "-",
      "Squeeze Tier": sr?.squeezeResult?.tier ?? "-",
      "PreRun Verdict": sr?.prerunResult?.verdict ?? "-",
      "Sector Quadrant": sr?.sectorResult?.quadrant ?? "-",
      Name: sr?.name ?? "-",
      Sector: sr?.sector ?? "-",
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Earnings Scan");

  XLSX.writeFile(
    wb,
    `earnings-scan-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
