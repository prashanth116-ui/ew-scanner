/**
 * Catalyst Scanner orchestrator.
 * SERVER-ONLY: Ties universe, data fetching, scoring, and calendar together.
 */

import "server-only";

import type { CatalystLayer } from "@/data/catalyst-universe";
import {
  getCatalystUniverse,
  getAllSectorETFs,
} from "@/data/catalyst-universe";
import { fetchBatchCatalystData, fetchAllETFData } from "./data";
import { computeScores, buildResult, detectFireDrills } from "./scoring";
import { getUpcomingCatalysts, getDaysToCatalyst } from "./calendar";
import type { CatalystScanResponse, CatalystResult } from "./types";

/**
 * Run the full catalyst scan.
 * 1. Get universe (optionally filtered)
 * 2. Fetch ETF data for sector momentum
 * 3. Batch fetch all ticker data
 * 4. Score all tickers (cross-referencing peers)
 * 5. Classify verdicts and misses
 * 6. Merge calendar events
 * 7. Return structured response
 */
export async function runCatalystScan(options?: {
  layers?: CatalystLayer[];
  tiers?: number[];
}): Promise<CatalystScanResponse> {
  // 1. Get universe (optionally filtered)
  let universe = getCatalystUniverse();
  if (options?.layers?.length) {
    universe = universe.filter((t) => options.layers!.includes(t.layer));
  }
  if (options?.tiers?.length) {
    universe = universe.filter((t) => options.tiers!.includes(t.tier));
  }

  const symbols = universe.map((t) => t.symbol);

  // 2. Fetch all layer ETF data (for sector momentum factor)
  const etfSymbols = getAllSectorETFs();
  const etfDataMap = await fetchAllETFData(etfSymbols);

  // 3. Batch fetch catalyst data for all tickers
  const allData = await fetchBatchCatalystData(symbols, 10, 500);

  // 4. Detect fire drills (any stock with 1d change > 10%)
  const fireDrills = detectFireDrills(allData);

  // 5. Score all tickers and build results
  const results: CatalystResult[] = [];

  for (const ticker of universe) {
    const data = allData.get(ticker.symbol);
    if (!data) continue;

    // Get catalyst info
    const catalystInfo = await getDaysToCatalyst(ticker.symbol);
    const daysToCatalyst = catalystInfo?.days ?? null;
    const catalystLabel = catalystInfo?.label ?? null;

    // Get ETF data for this ticker's sector
    const etfData = etfDataMap.get(ticker.sectorETF) ?? null;

    // Check if this ticker's layer has a fire drill
    const isFireDrill = fireDrills.has(ticker.layer);

    // Compute scores
    const { scores, totalScore, peersThatSpiked } = computeScores(
      data,
      daysToCatalyst,
      allData,
      etfData
    );

    // Build full result
    const result = buildResult(
      data,
      ticker,
      scores,
      totalScore,
      peersThatSpiked,
      daysToCatalyst,
      catalystLabel,
      isFireDrill,
      etfData
    );

    results.push(result);
  }

  // 6. Merge calendar events
  const calendar = await getUpcomingCatalysts(symbols, 30);

  // 7. Sort and bucket results
  const prespike: CatalystResult[] = [];
  const watch: CatalystResult[] = [];
  const monitor: CatalystResult[] = [];
  const misses: CatalystScanResponse["misses"] = {
    already_moved: [],
    wrong_sector: [],
    wrong_pattern: [],
    too_early: [],
    post_spike: [],
  };

  for (const r of results) {
    switch (r.verdict) {
      case "PRE_SPIKE":
        prespike.push(r);
        break;
      case "WATCH":
        watch.push(r);
        break;
      case "MONITOR":
        monitor.push(r);
        break;
      case "MISS":
        if (r.missCategory) {
          misses[r.missCategory].push(r);
        }
        break;
    }
  }

  // Sort each bucket by score descending
  const byScore = (a: CatalystResult, b: CatalystResult) => b.totalScore - a.totalScore;
  prespike.sort(byScore);
  watch.sort(byScore);
  monitor.sort(byScore);
  Object.values(misses).forEach((arr) => arr.sort(byScore));

  return {
    prespike,
    watch,
    monitor,
    misses,
    calendar,
    scannedAt: new Date().toISOString(),
  };
}
