import type { SectorRotationResult, SectorRotationScore } from "./types";

export async function exportSectorsToExcel(
  result: SectorRotationResult
): Promise<void> {
  const XLSX = await import("xlsx");

  // Sheet 1: Sector scores
  const sectorRows = result.sectors.map((s: SectorRotationScore) => ({
    Sector: s.sector,
    ETF: s.etf,
    "Composite Score": s.compositeScore.toFixed(1),
    Quadrant: s.quadrant,
    Trend: s.trend,
    "Momentum Composite": s.momentumComposite.toFixed(1),
    "Momentum %ile": s.momentumPercentile.toFixed(0),
    Acceleration: s.acceleration.toFixed(3),
    "Mansfield RS": s.mansfieldRS.toFixed(2),
    CMF: s.cmf20.toFixed(3),
    "OBV Trend": s.obvTrend === 1 ? "UP" : s.obvTrend === -1 ? "DOWN" : "FLAT",
    "Breadth %": s.breadthPct?.toFixed(1) ?? "-",
    "Smart Money Score": s.smartMoneyScore.toFixed(1),
    "Insider Buys": s.aggregateInsiderBuys,
    "Put/Call": s.aggregatePCR?.toFixed(2) ?? "-",
    "Earnings Beat %": s.earningsBeatPct.toFixed(0),
    "Data Quality": s.dataQuality.toFixed(0),
    "Stealth Accumulation": s.stealthAccumulation ? "YES" : "",
    "RS Ratio": s.rsRatio.toFixed(2),
    "RS Momentum": s.rsMomentum.toFixed(2),
  }));
  const ws1 = XLSX.utils.json_to_sheet(sectorRows);

  // Sheet 2: Top stocks per sector
  const stockRows: Record<string, unknown>[] = [];
  for (const group of result.topStocksToWatch) {
    for (const stock of group.stocks) {
      const quote = result.stockQuotes?.[stock.ticker];
      stockRows.push({
        Sector: group.sector,
        Ticker: stock.ticker,
        Score: stock.score.toFixed(1),
        Price: quote?.price?.toFixed(2) ?? "-",
        "SMA50": quote?.sma50?.toFixed(2) ?? "-",
        "% from SMA50": quote?.pctFromSma50?.toFixed(1) ?? "-",
        Reasons: stock.reasons.join("; "),
      });
    }
  }
  const ws2 = XLSX.utils.json_to_sheet(stockRows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Sector Scores");
  XLSX.utils.book_append_sheet(wb, ws2, "Top Stocks");

  XLSX.writeFile(
    wb,
    `sector-rotation-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
