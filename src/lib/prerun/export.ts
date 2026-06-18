/** Pre-Run export to Excel/CSV. */

import type { PreRunResult, VCPResult } from "./types";
import { MAX_SCORE, VCP_MAX_SCORE } from "./types";

export async function exportPreRunToExcel(results: PreRunResult[]): Promise<void> {
  const XLSX = await import("xlsx");

  const rows = results.map((r) => ({
    Ticker: r.data.ticker,
    Company: r.data.companyName,
    Price: r.data.currentPrice,
    "% From ATH": r.data.pctFromAth?.toFixed(1),
    ATH: r.data.allTimeHigh?.toFixed(2) ?? "-",
    "52w High": r.data.high52w?.toFixed(2) ?? "-",
    "Weeks in Base": r.data.weeksInBase ?? "-",
    "Inst %": r.data.institutionalPct !== null ? r.data.institutionalPct.toFixed(1) : "-",
    "Short Float %": r.data.shortFloat?.toFixed(1),
    "Market Cap": r.data.marketCap ? `$${(r.data.marketCap / 1e9).toFixed(1)}B` : "-",
    "Days to Earnings": r.data.daysToEarnings ?? "-",
    "Revenue Growth YoY": r.data.revenueGrowthYoY ? `${r.data.revenueGrowthYoY.toFixed(1)}%` : "-",
    "Earnings Beat Streak": r.data.earningsBeatStreak ?? "-",
    "Insider Buys 90d": r.data.insiderBuys90d ?? "-",
    "Put/Call Ratio": r.data.putCallRatio?.toFixed(2) ?? "-",
    "Call Volume": r.data.callVolume?.toLocaleString() ?? "-",
    "Put Volume": r.data.putVolume?.toLocaleString() ?? "-",
    "Rel Strength 20d": r.data.relativeStrength20d?.toFixed(1) ?? "-",
    "Sector Return 20d": r.data.sectorReturn20d?.toFixed(1) ?? "-",
    "% From Base High": r.data.pctFromBaseHigh?.toFixed(1) ?? "-",
    "Float Turnover 20d": r.data.floatTurnover20d?.toFixed(2) ?? "-",
    "OBV Divergence": r.data.obvDivergent === true ? "Y" : r.data.obvDivergent === false ? "N" : "-",
    "OBV % From High": r.data.obvPctFromHigh?.toFixed(1) ?? "-",
    "Price % From 20d High": r.data.pricePctFromHigh20d?.toFixed(1) ?? "-",
    "VP Divergence": r.data.vpDivergenceBullish === true ? "Y" : r.data.vpDivergenceBullish === false ? "N" : "-",
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
    "H (Insider)": r.scores.scoreH,
    "I (Options)": r.scores.scoreI,
    "J (RelStr)": r.scores.scoreJ,
    "K (Breakout)": r.scores.scoreK,
    "L (HigherLows)": r.scores.scoreL,
    "M (EMAReclaim)": r.scores.scoreM,
    "M2 (EMA Timing)": r.scores.scoreM2,
    "N (RangeCoil)": r.scores.scoreN,
    "O (FailedBD)": r.scores.scoreO,
    "P (Revisions)": r.scores.scoreP,
    "Q (Squeeze)": r.scores.scoreQ,
    "Sector Mod": r.scores.sectorModifier,
    [`Score (/${MAX_SCORE})`]: r.scores.finalScore,
    Verdict: r.verdict,
    "Pattern Match": r.patternMatch ? `${r.patternMatch.template} (${r.patternMatch.similarity}%)` : "-",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pre-Run Scan");

  XLSX.writeFile(wb, `prerun-scan-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportVCPToExcel(results: VCPResult[]): Promise<void> {
  const XLSX = await import("xlsx");

  const rows = results.map((r) => {
    const d = r.data;
    const s = r.scores;
    const g = r.gates;
    const rc = r.riskCalc;
    return {
      Ticker: d.ticker,
      Company: d.companyName,
      Price: d.currentPrice?.toFixed(2) ?? "-",
      Phase: r.phase,
      [`Total Score (/${VCP_MAX_SCORE})`]: s.totalScore,
      "Trend /25": s.trendScore,
      "Volume /20": s.volumeScore,
      "Compression /25": s.compressionScore,
      "RS /15": s.relStrengthScore,
      "Risk Quality /15": s.riskQualityScore,
      "Gate: P>$10": g.priceAbove10 ? "Y" : "N",
      "Gate: Vol>500k": g.avgVolAbove500k ? "Y" : "N",
      "Gate: $Vol>$20M": g.dollarVolAbove20m ? "Y" : "N",
      "Gate: MCap>$1B": g.mktCapAbove1b ? "Y" : "N",
      "Gate: >200SMA": g.aboveSma200 ? "Y" : "N",
      "Gate: >50SMA": g.aboveSma50 ? "Y" : "N",
      "Dist 50SMA %": d.vcpDistFromSma50Pct?.toFixed(1) ?? "-",
      "Dist 200SMA %": d.vcpDistFromSma200Pct?.toFixed(1) ?? "-",
      "% From 52w High": d.pctFromAth?.toFixed(1) ?? "-",
      "ATR %": d.vcpAtrPct?.toFixed(2) ?? "-",
      "Range 5d %": d.vcpRange5d?.toFixed(2) ?? "-",
      "Range 10d %": d.vcpRange10d?.toFixed(2) ?? "-",
      "Range 20d %": d.vcpRange20d?.toFixed(2) ?? "-",
      "Tight Closes": d.vcpTightCloses === true ? "Y" : d.vcpTightCloses === false ? "N" : "-",
      "Inside Bars": d.vcpInsideBarCount ?? "-",
      "Dry Vol Days": d.vcpDryVolumeDays ?? "-",
      "OBV Divergence": d.obvDivergent === true ? "Y" : d.obvDivergent === false ? "N" : "-",
      "OBV % From High": d.obvPctFromHigh?.toFixed(1) ?? "-",
      "Price % From 20d High": d.pricePctFromHigh20d?.toFixed(1) ?? "-",
      "VP Divergence": d.vpDivergenceBullish === true ? "Y" : d.vpDivergenceBullish === false ? "N" : "-",
      "Avg Dollar Vol": d.vcpAvgDollarVolume ? `$${(d.vcpAvgDollarVolume / 1e6).toFixed(0)}M` : "-",
      "Market Cap": d.marketCap ? `$${(d.marketCap / 1e9).toFixed(1)}B` : "-",
      Entry: rc.entry?.toFixed(2) ?? "-",
      Stop: rc.stop?.toFixed(2) ?? "-",
      "Risk/Share": rc.riskPerShare?.toFixed(2) ?? "-",
      Shares: rc.shares ?? "-",
      "2R Target": rc.target2R?.toFixed(2) ?? "-",
      "3R Target": rc.target3R?.toFixed(2) ?? "-",
      "6R Target": rc.target6R?.toFixed(2) ?? "-",
      "10R Target": rc.target10R?.toFixed(2) ?? "-",
      "10 SMA Exit": rc.sma10Exit?.toFixed(2) ?? "-",
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "VCP Breakout Scan");

  XLSX.writeFile(wb, `vcp-scan-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
