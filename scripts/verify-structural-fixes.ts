/**
 * Verify structural override fixes for the 21 affected stocks.
 * Tests: forward targets, reliability scoring, mode filtering, volume/momentum.
 *
 * Usage: npx tsx scripts/verify-structural-fixes.ts
 */

import { countWaves, getWaveStatusInfo, computeForwardTargets } from "../src/lib/ew-wave-counter";
import { computeReliabilityScore } from "../src/lib/ew-reliability";
import { applyModeFilters } from "../src/lib/ew-scanner-modes";
import { analyzeVolume } from "../src/lib/ew-volume";
import { analyzeMomentum } from "../src/lib/ew-momentum";
import type { EnhancedScoredCandidate, PriceSeries } from "../src/lib/ew-types";

const BASE_URL = "https://ew-scanner.vercel.app";

// Structural override stocks identified in the audit
const STRUCTURAL_TICKERS = [
  "AMD", "NVDA", "GOOGL", "AMZN", "AVGO", "CSCO", "CAT", "MS", "AMAT",
  "LRCX", "TXN", "WMB", "NEE", "BKR", "MU", "INTC", "MRVL", "MPC", "FANG", "KMI", "MO",
];

// Non-structural stocks for regression check
const NON_STRUCTURAL_TICKERS = ["ENPH", "BA", "NKE", "DIS", "MRNA"];

async function fetchQuote(ticker: string) {
  const url = `${BASE_URL}/api/quote?ticker=${ticker}&detail=1`;
  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`Quote failed for ${ticker}: ${res.status}`);
  return res.json();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface TestResult {
  ticker: string;
  isStructural: boolean;
  current: number;
  trueAth?: number;
  // Wave count
  waveScore?: number;
  wavePosition?: string;
  // Original targets
  originalTargets?: { label: string; price: number }[];
  allTargetsBelowPrice: boolean;
  // Forward targets
  forwardSupport?: { label: string; price: number }[];
  forwardExtensions?: { label: string; price: number }[];
  // Reliability
  reliabilityScore?: number;
  reliabilityLabel?: string;
  reliabilityPenalty?: number;
  // Mode filters
  passesWave2: boolean;
  passesWave4: boolean;
  passesWave5: boolean;
  passesBreakout: boolean;
  // Volume/momentum with recentBars
  volumeTrend?: string;
  momentumScore?: number;
  // Issues
  issues: string[];
}

async function analyzeStock(ticker: string, expectStructural: boolean): Promise<TestResult> {
  const data = await fetchQuote(ticker);
  const { current, athIdx, lowIdx, series, ath, low } = data;
  const issues: string[] = [];

  // Determine if structural (trueAth presence from API)
  const isStructural = data.trueAth != null;

  if (expectStructural && !isStructural) {
    issues.push(`Expected structural override but trueAth is null`);
  }

  const result: TestResult = {
    ticker,
    isStructural,
    current,
    trueAth: data.trueAth,
    allTargetsBelowPrice: false,
    passesWave2: false,
    passesWave4: false,
    passesWave5: false,
    passesBreakout: false,
    issues,
  };

  if (!series || athIdx == null || lowIdx == null) {
    issues.push("No series data");
    return result;
  }

  // Run wave counter
  const waveCount = countWaves(series, athIdx, lowIdx);
  if (!waveCount) {
    issues.push("No wave count produced");
    return result;
  }

  result.waveScore = waveCount.score;
  result.wavePosition = waveCount.position;

  // Get original targets
  const statusInfo = getWaveStatusInfo(waveCount, current);
  result.originalTargets = statusInfo.targets;
  result.allTargetsBelowPrice = statusInfo.targets.length > 0 &&
    statusInfo.targets.every(t => t.price < current);

  // Test forward targets for structural stocks
  if (isStructural && data.trueAth && low) {
    const fwd = computeForwardTargets(data.trueAth, low, current);
    result.forwardSupport = fwd.support;
    result.forwardExtensions = fwd.extensions;

    // Verify forward extensions are above current price
    if (fwd.extensions.length > 0) {
      const allAbove = fwd.extensions.every(t => t.price > current);
      if (!allAbove) {
        issues.push(`Forward extensions not all above current price: ${fwd.extensions.map(t => `$${t.price}`).join(", ")}`);
      }
    } else {
      issues.push("No forward extension targets generated");
    }

    // Verify support levels are below current price
    if (fwd.support.length > 0) {
      const allBelow = fwd.support.every(t => t.price < current);
      if (!allBelow) {
        issues.push(`Forward support not all below current price`);
      }
    }
  }

  // Reliability scoring
  const mockCandidate = {
    ticker,
    current,
    waveCount,
    trueAth: data.trueAth,
  } as EnhancedScoredCandidate;

  const reliability = computeReliabilityScore(mockCandidate);
  result.reliabilityScore = reliability.score;
  result.reliabilityLabel = reliability.label;
  result.reliabilityPenalty = reliability.breakdown.structuralPenalty;

  // Structural stocks should NEVER have "High" reliability
  if (isStructural && reliability.label === "High") {
    issues.push(`Structural stock has "High" reliability — should be capped at "Medium"`);
  }

  // Structural penalty should be >= -20 (more negative)
  if (isStructural && reliability.breakdown.structuralPenalty > -20) {
    issues.push(`Structural penalty only ${reliability.breakdown.structuralPenalty}, expected <= -20`);
  }

  // Mode filters
  const candidateForFilter = {
    ...mockCandidate,
    declinePct: ath > 0 ? ((ath - low) / ath) * 100 : 0,
    recoveryPct: low > 0 ? ((current - low) / low) * 100 : 0,
    fibAnalysis: { retracementDepth: low > 0 && ath > low ? (current - low) / (ath - low) : 0 },
  } as EnhancedScoredCandidate;

  result.passesWave2 = applyModeFilters([candidateForFilter], "wave2").length > 0;
  result.passesWave4 = applyModeFilters([candidateForFilter], "wave4").length > 0;
  result.passesWave5 = applyModeFilters([candidateForFilter], "wave5").length > 0;
  result.passesBreakout = applyModeFilters([candidateForFilter], "breakout").length > 0;

  // Structural stocks should NOT pass wave2
  if (isStructural && result.passesWave2) {
    issues.push("Structural stock passes Wave 2 filter — should be rejected");
  }

  // Volume/momentum with recentBars
  const recentOpts = isStructural ? { recentBars: 26 } : undefined;
  const vol = analyzeVolume(series, athIdx, lowIdx, recentOpts);
  const mom = analyzeMomentum(series, athIdx, lowIdx, recentOpts);
  result.volumeTrend = vol.volumeTrend;
  result.momentumScore = mom.score;

  // Check for NaN/Infinity
  if (!Number.isFinite(vol.declineAvgVol) || !Number.isFinite(vol.recoveryAvgVol)) {
    issues.push(`Volume has NaN/Infinity: decline=${vol.declineAvgVol}, recovery=${vol.recoveryAvgVol}`);
  }
  if (!Number.isFinite(mom.score)) {
    issues.push(`Momentum score is NaN/Infinity: ${mom.score}`);
  }

  return result;
}

async function main() {
  console.log("=".repeat(90));
  console.log("STRUCTURAL OVERRIDE FIX VERIFICATION");
  console.log("=".repeat(90));

  const allResults: TestResult[] = [];

  // Process structural stocks
  console.log(`\nFetching ${STRUCTURAL_TICKERS.length} structural stocks...`);
  for (let i = 0; i < STRUCTURAL_TICKERS.length; i += 5) {
    const batch = STRUCTURAL_TICKERS.slice(i, i + 5);
    const promises = batch.map(t => analyzeStock(t, true));
    const results = await Promise.all(promises);
    allResults.push(...results);
    process.stderr.write(`\r  ${Math.min(i + 5, STRUCTURAL_TICKERS.length)}/${STRUCTURAL_TICKERS.length}`);
    if (i + 5 < STRUCTURAL_TICKERS.length) await sleep(600);
  }
  process.stderr.write("\n");

  // Process non-structural stocks
  console.log(`Fetching ${NON_STRUCTURAL_TICKERS.length} non-structural stocks (regression)...`);
  const nonStructResults = await Promise.all(NON_STRUCTURAL_TICKERS.map(t => analyzeStock(t, false)));
  allResults.push(...nonStructResults);

  // ── Report ──
  console.log("\n" + "─".repeat(90));
  console.log("STRUCTURAL STOCKS");
  console.log("─".repeat(90));

  const structuralResults = allResults.filter(r => STRUCTURAL_TICKERS.includes(r.ticker));
  for (const r of structuralResults) {
    const fwdTargets = r.forwardExtensions?.map(t => `$${t.price.toFixed(2)}`).join(", ") ?? "none";
    const origTargets = r.originalTargets?.map(t => `$${t.price.toFixed(2)}`).join(", ") ?? "none";
    const stale = r.allTargetsBelowPrice ? "YES (stale)" : "no";

    console.log(`\n  ${r.ticker} (current: $${r.current.toFixed(2)}, trueAth: ${r.trueAth ? `$${r.trueAth.toFixed(2)}` : "N/A"})`);
    console.log(`    Wave: score=${r.waveScore ?? "N/A"}, position="${r.wavePosition ?? "N/A"}"`);
    console.log(`    Original targets all below price: ${stale}`);
    console.log(`    Forward extensions: ${fwdTargets}`);
    console.log(`    Forward support: ${r.forwardSupport?.map(t => `$${t.price.toFixed(2)}`).join(", ") ?? "none"}`);
    console.log(`    Reliability: ${r.reliabilityScore}/100 (${r.reliabilityLabel}), penalty=${r.reliabilityPenalty}`);
    console.log(`    Modes: W2=${r.passesWave2 ? "PASS" : "reject"} W4=${r.passesWave4 ? "PASS" : "reject"} W5=${r.passesWave5 ? "PASS" : "reject"} BRK=${r.passesBreakout ? "PASS" : "reject"}`);
    console.log(`    Volume: ${r.volumeTrend}, Momentum: ${r.momentumScore?.toFixed(2) ?? "N/A"}`);
    if (r.issues.length > 0) {
      console.log(`    ⚠ ISSUES: ${r.issues.join("; ")}`);
    }
  }

  console.log("\n" + "─".repeat(90));
  console.log("NON-STRUCTURAL STOCKS (Regression Check)");
  console.log("─".repeat(90));

  for (const r of nonStructResults) {
    console.log(`\n  ${r.ticker} (current: $${r.current.toFixed(2)})`);
    console.log(`    Wave: score=${r.waveScore ?? "N/A"}, position="${r.wavePosition ?? "N/A"}"`);
    console.log(`    Targets: ${r.originalTargets?.map(t => `$${t.price.toFixed(2)}`).join(", ") ?? "none"}`);
    console.log(`    Reliability: ${r.reliabilityScore}/100 (${r.reliabilityLabel})`);
    console.log(`    Modes: W2=${r.passesWave2 ? "PASS" : "reject"} W4=${r.passesWave4 ? "PASS" : "reject"} W5=${r.passesWave5 ? "PASS" : "reject"} BRK=${r.passesBreakout ? "PASS" : "reject"}`);
    console.log(`    Volume: ${r.volumeTrend}, Momentum: ${r.momentumScore?.toFixed(2) ?? "N/A"}`);
    if (r.issues.length > 0) {
      console.log(`    ⚠ ISSUES: ${r.issues.join("; ")}`);
    }
  }

  // ── Summary ──
  const structuralIssues = structuralResults.flatMap(r => r.issues);
  const nonStructIssues = nonStructResults.flatMap(r => r.issues);

  console.log("\n" + "=".repeat(90));
  console.log("SUMMARY");
  console.log("=".repeat(90));
  console.log(`Structural stocks tested: ${structuralResults.length}`);
  console.log(`  - Actually structural (trueAth != null): ${structuralResults.filter(r => r.isStructural).length}`);
  console.log(`  - Stale targets (all below price): ${structuralResults.filter(r => r.allTargetsBelowPrice).length}`);
  console.log(`  - Forward extensions generated: ${structuralResults.filter(r => (r.forwardExtensions?.length ?? 0) > 0).length}`);
  console.log(`  - Reliability capped at Medium: ${structuralResults.filter(r => r.isStructural && r.reliabilityLabel !== "High").length}/${structuralResults.filter(r => r.isStructural).length}`);
  console.log(`  - Rejected from Wave 2: ${structuralResults.filter(r => r.isStructural && !r.passesWave2).length}/${structuralResults.filter(r => r.isStructural).length}`);
  console.log(`  - Issues: ${structuralIssues.length}`);
  if (structuralIssues.length > 0) {
    for (const issue of structuralIssues) {
      console.log(`    - ${issue}`);
    }
  }
  console.log(`\nNon-structural regression: ${nonStructResults.length} stocks, ${nonStructIssues.length} issues`);
  if (nonStructIssues.length > 0) {
    for (const issue of nonStructIssues) {
      console.log(`    - ${issue}`);
    }
  }

  // Final verdict
  const criticalIssues = [
    ...structuralResults.filter(r => r.isStructural && r.reliabilityLabel === "High").map(r => `${r.ticker}: reliability not capped`),
    ...structuralResults.filter(r => r.isStructural && r.passesWave2).map(r => `${r.ticker}: passes Wave 2 filter`),
    ...allResults.filter(r => r.issues.some(i => i.includes("NaN") || i.includes("Infinity"))).map(r => `${r.ticker}: NaN/Infinity in analysis`),
  ];

  if (criticalIssues.length === 0) {
    console.log("\n✓ All critical checks PASSED");
  } else {
    console.log(`\n✗ ${criticalIssues.length} CRITICAL FAILURES:`);
    for (const issue of criticalIssues) {
      console.log(`  - ${issue}`);
    }
  }
}

main().catch(console.error);
