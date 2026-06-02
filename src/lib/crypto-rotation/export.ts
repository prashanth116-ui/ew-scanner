import type { CryptoRotationResult } from "./types";
import type { SectorRotationScore } from "../sector-rotation/types";

export async function exportCryptoRotationToExcel(
  result: CryptoRotationResult
): Promise<void> {
  const XLSX = await import("xlsx");

  // Sheet 1: Sector scores
  const sectorRows = result.sectors.map((s: SectorRotationScore) => ({
    Sector: s.sector,
    Proxy: s.etf,
    "Composite Score": s.compositeScore.toFixed(1),
    Quadrant: s.quadrant,
    Trend: s.trend,
    "Momentum Composite": s.momentumComposite.toFixed(1),
    "Momentum %ile": s.momentumPercentile.toFixed(0),
    Acceleration: s.acceleration.toFixed(3),
    "Mansfield RS (vs BTC)": s.mansfieldRS.toFixed(2),
    CMF: s.cmf20.toFixed(3),
    "OBV Trend": s.obvTrend === 1 ? "UP" : s.obvTrend === -1 ? "DOWN" : "FLAT",
    "Stealth Accumulation": s.stealthAccumulation ? "YES" : "",
    "RS Ratio": s.rsRatio.toFixed(2),
    "RS Momentum": s.rsMomentum.toFixed(2),
    Velocity: s.rotationVelocity.toFixed(2),
  }));
  const ws1 = XLSX.utils.json_to_sheet(sectorRows);

  // Sheet 2: Enriched tokens
  const tokenRows = (result.enrichedStocks?.passed ?? []).map((t) => ({
    Symbol: t.symbol,
    Name: t.shortName,
    Sector: t.sector,
    Price: t.price.toFixed(4),
    "% from 50MA": t.pctFrom50ma?.toFixed(1) ?? "-",
    "% from 200MA": t.pctFrom200ma?.toFixed(1) ?? "-",
    "RS Accel": t.rsAccel?.toFixed(2) ?? "-",
    "Vol Ratio": t.volRatio.toFixed(2),
    Category: t.category,
    Phase: t.phase,
    Conviction: t.conviction,
    "Conviction Signals": t.convictionSignals,
    Quadrant: t.sectorQuadrant,
  }));
  const ws2 = XLSX.utils.json_to_sheet(tokenRows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Sector Scores");
  XLSX.utils.book_append_sheet(wb, ws2, "Token Picks");

  XLSX.writeFile(
    wb,
    `crypto-rotation-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
