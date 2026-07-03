/**
 * Spot-check 50 stocks for wave count inconsistencies.
 * Fetches series data from the deployed API, runs wave counter locally
 * (matching what the frontend does client-side).
 *
 * Usage: npx tsx scripts/spot-check.ts
 */

import { countWaves, countWavesMultiCycle, getWaveStatusInfo } from "../src/lib/ew-wave-counter";
import { findRecentCyclePivot } from "../src/lib/ew-structural";

const BASE_URL = "https://quantradar.com";

const TICKERS = [
  // SP500 mix
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "JPM", "V", "UNH",
  "XOM", "JNJ", "PG", "HD", "CRM", "AMD", "NFLX", "WMT", "BAC", "MRK",
  "ORCL", "CVX", "KO", "PEP", "TMO", "CSCO", "MCD", "ADBE", "DIS", "NEE",
  "CAT", "GS", "BA", "IBM", "GE", "ISRG",
  // Biotech/Energy/Financials
  "LLY", "ABBV", "GILD", "VRTX", "MRNA",
  "COP", "EOG", "ENPH", "FSLR",
  "BLK", "PYPL", "COIN",
  // Consumer extras
  "COST", "NKE", "ABNB", "BKNG",
];

async function fetchQuote(ticker) {
  const url = `${BASE_URL}/api/quote?ticker=${ticker}&detail=1`;
  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`Quote failed for ${ticker}: ${res.status}`);
  return res.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const issues = [];
  const results = [];
  let processed = 0;
  let noWaveCount = 0;

  // Process in batches of 5 to respect rate limits
  for (let i = 0; i < TICKERS.length; i += 5) {
    const batch = TICKERS.slice(i, i + 5);
    const promises = batch.map(async (ticker) => {
      try {
        const data = await fetchQuote(ticker);
        processed++;
        return { ticker, data, error: null };
      } catch (e) {
        processed++;
        return { ticker, data: null, error: e.message };
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
    process.stderr.write(`\rFetched ${processed}/${TICKERS.length}...`);

    if (i + 5 < TICKERS.length) await sleep(500);
  }
  process.stderr.write("\n");

  // Multi-cycle stats
  let multiCycleImproved = 0;
  let multiCycleDifferent = 0;
  const multiCycleDetails: { ticker: string; oldScore: number; newScore: number; oldPos: string; newPos: string; cycleSource: string }[] = [];

  // Now analyze each result for issues
  for (const { ticker, data, error } of results) {
    if (error) {
      issues.push({ ticker, category: "FETCH_ERROR", detail: error });
      continue;
    }

    const { current, athIdx, lowIdx, series, recentCycleAthIdx, recentCycleLowIdx } = data;

    if (!series || athIdx == null || lowIdx == null) {
      issues.push({ ticker, category: "NO_SERIES", detail: "API returned no series data" });
      continue;
    }

    // Run both old (single-cycle) and new (multi-cycle) wave counters
    const oldWaveCount = countWaves(series, athIdx, lowIdx);

    // Try to find recent cycle pivot locally (API may not return it yet since it's deployed)
    let localRecentAthIdx = recentCycleAthIdx;
    let localRecentLowIdx = recentCycleLowIdx;
    if (localRecentAthIdx == null && series.high && series.low) {
      const pivot = findRecentCyclePivot(series.high, series.low, athIdx, lowIdx);
      if (pivot) {
        localRecentAthIdx = pivot.peakIdx;
        localRecentLowIdx = pivot.troughIdx;
      }
    }

    const multiCycle = countWavesMultiCycle(series, athIdx, lowIdx, localRecentAthIdx, localRecentLowIdx);
    const waveCount = multiCycle.best;

    // Track multi-cycle improvements
    if (oldWaveCount && waveCount && oldWaveCount !== waveCount) {
      multiCycleDifferent++;
      const improved = waveCount.score > oldWaveCount.score ||
        (waveCount.cycleSource === "recent" && oldWaveCount.cycleSource !== "recent");
      if (improved) multiCycleImproved++;
      multiCycleDetails.push({
        ticker,
        oldScore: oldWaveCount.score,
        newScore: waveCount.score,
        oldPos: oldWaveCount.position,
        newPos: waveCount.position,
        cycleSource: waveCount.cycleSource ?? "global",
      });
    } else if (!oldWaveCount && waveCount) {
      multiCycleDifferent++;
      multiCycleImproved++;
      multiCycleDetails.push({
        ticker,
        oldScore: 0,
        newScore: waveCount.score,
        oldPos: "(no count)",
        newPos: waveCount.position,
        cycleSource: waveCount.cycleSource ?? "global",
      });
    }

    if (!waveCount) {
      noWaveCount++;
      continue; // No pattern found — not an issue
    }

    const { waves, isValid, violations, score, position, direction, alternateCount } = waveCount;
    const labels = waves.map((w) => w.label);
    const isABC = labels.includes("A");
    const hasAllFive = ["1", "2", "3", "4", "5"].every((l) => labels.includes(l));
    const pos = position?.toLowerCase() || "";

    // Run status info for target checks
    const statusInfo = getWaveStatusInfo(waveCount, current);

    // ── CHECK 1: Violation flagged but still primary count ──
    if (violations && violations.length > 0) {
      issues.push({
        ticker,
        category: "HAS_VIOLATIONS",
        detail: `Score ${score}/100, Labels: ${labels.join("-")}, Violations: ${violations.join("; ")}`,
      });
    }

    // ── CHECK 2: Position says "decline" but price is above C ──
    if (isABC) {
      const wC = waves.find((w) => w.label === "C");
      if (wC && pos.includes("decline") && current > wC.price) {
        issues.push({
          ticker,
          category: "POSITION_BUG_DECLINE_ABOVE_C",
          detail: `Says "${position}" but price $${current.toFixed(2)} > C $${wC.price.toFixed(2)}`,
        });
      }
      if (wC && pos.includes("rally") && current < wC.price) {
        issues.push({
          ticker,
          category: "POSITION_BUG_RALLY_BELOW_C",
          detail: `Says "${position}" but price $${current.toFixed(2)} < C $${wC.price.toFixed(2)}`,
        });
      }
    }

    // ── CHECK 3: Status label contradicts position ──
    if (pos.includes("extending") && statusInfo.status === "completed") {
      issues.push({
        ticker,
        category: "STATUS_CONTRADICTION",
        detail: `Position says "extending" but status is "completed" (label: ${statusInfo.statusLabel})`,
      });
    }

    // ── CHECK 4: Wave B exceeds start in correction ──
    if (isABC && violations?.some((v) => v.includes("Wave B exceeds start"))) {
      issues.push({
        ticker,
        category: "WAVE_B_EXCEEDS_START",
        detail: `A-B-C with B > start. Score: ${score}. Prices: ${waves.map((w) => `W${w.label}=$${w.price.toFixed(2)}`).join(", ")}`,
      });
    }

    // ── CHECK 5: Direction vs position mismatch ──
    if (direction === "up" && pos.includes("decline")) {
      issues.push({
        ticker,
        category: "DIRECTION_MISMATCH",
        detail: `direction="up" but position says "${position}" (decline)`,
      });
    }

    // ── CHECK 6: Targets make sense relative to current price ──
    if (hasAllFive) {
      const w5 = waves.find((w) => w.label === "5");
      if (w5) {
        if (direction === "up" && current > w5.price * 1.2) {
          issues.push({
            ticker,
            category: "PRICE_FAR_BEYOND_W5",
            detail: `Bullish impulse W5=$${w5.price.toFixed(2)} but current=$${current.toFixed(2)} (${((current / w5.price - 1) * 100).toFixed(1)}% above)`,
          });
        }
        if (direction === "down" && current < w5.price * 0.8) {
          issues.push({
            ticker,
            category: "PRICE_FAR_BEYOND_W5",
            detail: `Bearish impulse W5=$${w5.price.toFixed(2)} but current=$${current.toFixed(2)} (${((1 - current / w5.price) * 100).toFixed(1)}% below)`,
          });
        }
      }
    }

    // ── CHECK 7: Wave progression violations (not caught by validator) ──
    if (hasAllFive && direction === "up") {
      const wp = (l) => waves.find((w) => w.label === l);
      const w1 = wp("1"), w3 = wp("3");
      if (w1 && w3) {
        if (w3.price < w1.price) {
          issues.push({
            ticker,
            category: "WAVE_ORDER_WRONG",
            detail: `Up impulse but W3=$${w3.price.toFixed(2)} < W1=$${w1.price.toFixed(2)}`,
          });
        }
      }
    }

    // ── CHECK 8: Alternate count contradicts primary ──
    if (alternateCount) {
      const altLabels = alternateCount.waves?.map((w) => w.label) || [];

      // Both have violations
      if (violations?.length > 0 && alternateCount.violations?.length > 0) {
        issues.push({
          ticker,
          category: "BOTH_COUNTS_INVALID",
          detail: `Primary: ${labels.join("-")} (${violations.length} violations), Alt: ${altLabels.join("-")} (${alternateCount.violations.length} violations)`,
        });
      }

      // Alternate scores higher than primary
      if (alternateCount.score > score) {
        issues.push({
          ticker,
          category: "ALT_SCORES_HIGHER",
          detail: `Primary ${labels.join("-")} score=${score}, Alt ${altLabels.join("-")} score=${alternateCount.score}`,
        });
      }
    }

    // ── CHECK 9: Inflated score for old pattern ──
    if (score > 90 && series?.close) {
      const lastWave = waves[waves.length - 1];
      const totalBars = series.close.length;
      const fractionOld = (totalBars - 1 - lastWave.index) / totalBars;
      if (fractionOld > 0.3) {
        issues.push({
          ticker,
          category: "INFLATED_SCORE",
          detail: `Score ${score} but last wave is ${Math.round(fractionOld * 100)}% of bars from end`,
        });
      }
    }

    // ── CHECK 10: Very low score as primary (<30) ──
    if (score < 30) {
      issues.push({
        ticker,
        category: "LOW_SCORE_PRIMARY",
        detail: `Primary count ${labels.join("-")} scores only ${score}/100. Position: ${position}`,
      });
    }

    // ── CHECK 11: Wave dates are chronologically ordered ──
    if (waves.length >= 2) {
      let prevIdx = -1;
      for (const w of waves) {
        if (w.index <= prevIdx) {
          issues.push({
            ticker,
            category: "WAVE_DATE_ORDER",
            detail: `Wave ${w.label} index ${w.index} <= previous wave index ${prevIdx}`,
          });
          break;
        }
        prevIdx = w.index;
      }
    }

    // ── CHECK 12: Position text doesn't match wave structure ──
    if (hasAllFive && pos.includes("developing")) {
      issues.push({
        ticker,
        category: "STATUS_MISMATCH",
        detail: `Has 5 completed waves (1-2-3-4-5) but position says "${position}" (developing)`,
      });
    }
    if (labels.length <= 3 && !isABC && (pos.includes("post-wave 5") || pos.includes("beyond wave 5"))) {
      issues.push({
        ticker,
        category: "STATUS_MISMATCH",
        detail: `Only ${labels.length} waves but position says "${position}" (post-wave 5)`,
      });
    }

    // ── CHECK 13: Stale/old wave count (last wave very far from current bar) ──
    if (waves.length > 0 && series?.timestamps) {
      const lastWave = waves[waves.length - 1];
      const totalBars = series.timestamps.length;
      const barsFromEnd = totalBars - 1 - lastWave.index;
      if (barsFromEnd > totalBars * 0.8) {
        issues.push({
          ticker,
          category: "STALE_WAVE_COUNT",
          detail: `Last wave (${lastWave.label}) is ${barsFromEnd} bars from end (${totalBars} total). May be outdated.`,
        });
      }
    }
  }

  // ── Output Report ──
  console.log("\n" + "=".repeat(80));
  console.log("WAVE COUNT SPOT CHECK — 50 STOCKS");
  console.log("=".repeat(80));

  // Group by category
  const categories = {};
  for (const issue of issues) {
    if (!categories[issue.category]) categories[issue.category] = [];
    categories[issue.category].push(issue);
  }

  // Sort categories by count (most frequent first)
  const sortedCats = Object.entries(categories).sort((a, b) => b[1].length - a[1].length);

  console.log(`\nTotal issues found: ${issues.length} across ${new Set(issues.map((i) => i.ticker)).size} stocks`);
  console.log(`No wave count (no pattern found): ${noWaveCount}/${TICKERS.length}\n`);

  for (const [cat, catIssues] of sortedCats) {
    console.log(`\n── ${cat} (${catIssues.length}) ──`);
    for (const issue of catIssues) {
      console.log(`  ${issue.ticker}: ${issue.detail}`);
    }
  }

  // Summary stats
  const tickersWithIssues = new Set(issues.map((i) => i.ticker));
  const cleanTickers = TICKERS.filter((t) => !tickersWithIssues.has(t));
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Clean stocks (no issues): ${cleanTickers.length}/${TICKERS.length}`);
  if (cleanTickers.length > 0) console.log(`  ${cleanTickers.join(", ")}`);

  // Multi-cycle comparison report
  console.log(`\n${"=".repeat(80)}`);
  console.log("MULTI-CYCLE COMPARISON (countWaves vs countWavesMultiCycle)");
  console.log("=".repeat(80));
  console.log(`Stocks where multi-cycle picked a different count: ${multiCycleDifferent}`);
  console.log(`Stocks improved by multi-cycle: ${multiCycleImproved}`);
  if (multiCycleDetails.length > 0) {
    console.log("\nDetails:");
    for (const d of multiCycleDetails) {
      const scoreDelta = d.newScore - d.oldScore;
      const deltaStr = scoreDelta > 0 ? `+${scoreDelta}` : `${scoreDelta}`;
      console.log(`  ${d.ticker}: score ${d.oldScore} → ${d.newScore} (${deltaStr}), cycle=${d.cycleSource}`);
      console.log(`    old: "${d.oldPos}"`);
      console.log(`    new: "${d.newPos}"`);
    }
  } else {
    console.log("  (no differences — all stocks used the same count)");
  }
}

main().catch(console.error);
