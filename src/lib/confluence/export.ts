import type { ConfluenceResult } from "./types";

export async function exportConfluenceToExcel(
  results: ConfluenceResult[]
): Promise<void> {
  const XLSX = await import("xlsx");

  const rows = results.map((r) => ({
    Ticker: r.ticker,
    Name: r.name,
    Sector: r.sector,
    Price: r.price?.toFixed(2) ?? "-",
    "Confluence Score %": Math.round(r.scores.confluenceScore * 100),
    "Pass Count": r.scores.passCount,
    Signal: r.signal,
    "EW Score": Math.round(r.scores.ewNormalized * 100),
    "Squeeze Score": Math.round(r.scores.squeezeNormalized * 100),
    "Pre-Run Score": Math.round(r.scores.prerunNormalized * 100),
    "Sector Score": Math.round(r.scores.sectorNormalized * 100),
    "Wave Score": Math.round((r.scores.waveNormalized ?? 0) * 100),
    "EW Confidence": r.ewResult?.confidenceTier ?? "-",
    "EW Fib Zone": r.ewResult?.fibDepthLabel ?? "-",
    "EW Wave": r.ewResult?.wavePosition ?? "-",
    "Squeeze Tier": r.squeezeResult?.tier ?? "-",
    "Squeeze SI%": r.squeezeResult?.shortPercentOfFloat?.toFixed(1) ?? "-",
    "PreRun Verdict": r.prerunResult?.verdict ?? "-",
    "PreRun % from ATH": r.prerunResult?.pctFromAth?.toFixed(1) ?? "-",
    "Sector Quadrant": r.sectorResult?.quadrant ?? "-",
    "Sector Trend": r.sectorResult?.trend ?? "-",
    "Strat Score": r.stratResult ? r.stratResult.totalScore : "-",
    "Strat Signal": r.stratResult?.signal ?? "-",
    "Strat TFC": r.stratResult?.tfcAlignment ?? "-",
    "Strat Direction": r.stratResult?.actionDirection ?? "-",
    "Strat Bonus": r.stratBonus != null ? `${(r.stratBonus * 100).toFixed(0)}%` : "-",
    "Wave Pattern": r.waveResult?.label ?? "-",
    "Wave Confidence": r.waveResult?.confidence ?? "-",
    "Wave Correction": r.waveResult?.hasCorrection ? "Yes" : "-",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Confluence Scan");

  XLSX.writeFile(
    wb,
    `confluence-scan-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
