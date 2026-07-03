/**
 * Verify deep analysis output for structural and non-structural stocks.
 * Calls the local dev server's /api/deep endpoint.
 *
 * Usage: npx tsx scripts/verify-deep-analysis.ts
 * Requires: dev server running on localhost:3099
 */

const LOCAL_URL = "http://localhost:3099";
const PROD_URL = "https://quantradar.com";

interface DeepResult {
  ticker: string;
  isStructural: boolean;
  success: boolean;
  nextTarget: number | null;
  invalidation: number | null;
  keyLevels: { label: string; price: number }[];
  wavePosition: string;
  confidence: string;
  riskLevel: string;
  summary: string;
  issues: string[];
}

async function fetchQuote(ticker: string) {
  const url = `${PROD_URL}/api/quote?ticker=${ticker}&detail=1`;
  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`Quote failed for ${ticker}: ${res.status}`);
  return res.json();
}

async function runDeepAnalysis(ticker: string): Promise<DeepResult> {
  const issues: string[] = [];

  // Fetch quote data from production (has series data)
  console.log(`  Fetching quote for ${ticker}...`);
  const quote = await fetchQuote(ticker);
  const { current, ath, low, athDate, lowDate, series, athIdx, lowIdx } = quote;
  const isStructural = quote.trueAth != null;

  // Import wave counter to compute targets locally (same as page.tsx does)
  const { countWaves, getWaveStatusInfo, computeForwardTargets } = await import("../src/lib/ew-wave-counter");

  let waveCount = null;
  try {
    waveCount = countWaves(series, athIdx, lowIdx);
  } catch { /* non-critical */ }

  let waveTargets: { label: string; price: number }[] | undefined;
  if (waveCount) {
    const info = getWaveStatusInfo(waveCount, current);
    waveTargets = info.targets.length > 0 ? info.targets : undefined;

    // Replace stale targets for structural stocks (same logic as page.tsx)
    if (isStructural && waveTargets && waveTargets.every((t: { price: number }) => t.price < current)) {
      const fwd = computeForwardTargets(quote.trueAth, low, current);
      const forwardTargets = [...fwd.support, ...fwd.extensions];
      if (forwardTargets.length > 0) waveTargets = forwardTargets;
    }
  }

  const declinePct = ath > 0 ? ((ath - low) / ath) * 100 : 0;
  const recoveryPct = low > 0 ? ((current - low) / low) * 100 : 0;

  // Build payload matching page.tsx
  const payload = {
    ticker,
    name: ticker,
    ath,
    athDate: athDate || "unknown",
    low,
    lowDate: lowDate || "unknown",
    current,
    declinePct,
    durationMonths: 12,
    recoveryPct,
    score: 15,
    htf: "Weekly",
    ltf: "Daily",
    trueAth: quote.trueAth,
    trueAthDate: quote.trueAthYear ? String(quote.trueAthYear) : undefined,
    trueLow: quote.trueLow,
    trueLowDate: quote.trueLowYear ? String(quote.trueLowYear) : undefined,
    waveCountValid: waveCount?.isValid,
    waveCountScore: waveCount?.score,
    waveCountPosition: waveCount?.position,
    waveCountViolations: waveCount?.violations,
    waveLabels: waveCount?.waves.map((w: { label: string }) => w.label).join("-"),
    wavePoints: waveCount?.waves.map((w: { label: string; price: number; index: number; type: string }) => ({
      label: w.label,
      price: w.price,
      date: series && w.index >= 0 && w.index < series.timestamps.length
        ? new Date(series.timestamps[w.index] * 1000).toISOString().slice(0, 10)
        : "unknown",
      type: w.type,
    })),
    waveTargets,
    waveStartPrice: waveCount?.waveStart?.price,
  };

  console.log(`  Calling deep analysis API for ${ticker}...`);
  const res = await fetch(`${LOCAL_URL}/api/deep`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": LOCAL_URL,
      "Host": "localhost:3099",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    return {
      ticker, isStructural, success: false,
      nextTarget: null, invalidation: null, keyLevels: [],
      wavePosition: "", confidence: "", riskLevel: "",
      summary: data.error || "API error",
      issues: [`API error: ${data.error || res.status}`],
    };
  }

  const s = data.structured;
  if (!s) {
    return {
      ticker, isStructural, success: false,
      nextTarget: null, invalidation: null, keyLevels: [],
      wavePosition: "", confidence: "", riskLevel: "",
      summary: data.analysis || "No structured response",
      issues: ["No structured response from API"],
    };
  }

  // Validate the response
  if (isStructural) {
    if (s.nextTarget != null && s.nextTarget < current) {
      issues.push(`nextTarget ($${s.nextTarget.toFixed(2)}) is BELOW current price ($${current.toFixed(2)}) — should be above for structural stocks`);
    }
    if (s.nextTarget == null) {
      issues.push("nextTarget is null — should have an upside target for structural stock");
    }
  }

  // Check keyLevels for support/resistance
  if (s.keyLevels && s.keyLevels.length > 0) {
    const hasAbove = s.keyLevels.some((l: { price: number }) => l.price > current);
    const hasBelow = s.keyLevels.some((l: { price: number }) => l.price < current);
    if (!hasAbove) issues.push("No key levels above current price (missing resistance/target)");
    if (!hasBelow) issues.push("No key levels below current price (missing support)");
  } else {
    issues.push("No key levels returned");
  }

  return {
    ticker,
    isStructural,
    success: true,
    nextTarget: s.nextTarget,
    invalidation: s.invalidation,
    keyLevels: s.keyLevels || [],
    wavePosition: s.wavePosition || "",
    confidence: s.confidence || "",
    riskLevel: s.riskLevel || "",
    summary: s.summary || "",
    issues,
  };
}

async function main() {
  const tickers = [
    { ticker: "AMD", structural: true },
    { ticker: "NVDA", structural: true },
    { ticker: "GOOGL", structural: true },
    { ticker: "AMZN", structural: true },
    { ticker: "ENPH", structural: false },  // non-structural regression
    { ticker: "BA", structural: false },     // non-structural regression
  ];

  console.log("=".repeat(90));
  console.log("DEEP ANALYSIS VERIFICATION");
  console.log("=".repeat(90));

  for (const { ticker, structural } of tickers) {
    console.log(`\n${"─".repeat(90)}`);
    console.log(`${ticker} (${structural ? "STRUCTURAL" : "non-structural"})`);
    console.log("─".repeat(90));

    try {
      const result = await runDeepAnalysis(ticker);

      console.log(`  Current: $${(await fetchQuote(ticker)).current.toFixed(2)}`);
      console.log(`  Wave Position: ${result.wavePosition}`);
      console.log(`  Confidence: ${result.confidence}`);
      console.log(`  Risk Level: ${result.riskLevel}`);
      console.log(`  Next Target: ${result.nextTarget != null ? `$${result.nextTarget.toFixed(2)}` : "null"}`);
      console.log(`  Invalidation: ${result.invalidation != null ? `$${result.invalidation.toFixed(2)}` : "null"}`);
      console.log(`  Key Levels:`);
      for (const kl of result.keyLevels) {
        console.log(`    ${kl.label}: $${typeof kl.price === 'number' ? kl.price.toFixed(2) : kl.price}`);
      }
      console.log(`  Summary: ${result.summary}`);
      if (result.issues.length > 0) {
        console.log(`  ISSUES:`);
        for (const issue of result.issues) {
          console.log(`    - ${issue}`);
        }
      } else {
        console.log(`  Status: PASS`);
      }
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Rate limit between API calls
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n${"=".repeat(90)}`);
  console.log("VERIFICATION COMPLETE");
  console.log("=".repeat(90));
}

main().catch(console.error);
