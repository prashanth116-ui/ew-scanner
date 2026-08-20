/**
 * Shared helpers for building scanner-rotation confluence data.
 * Used by both the 6 PM sector alert (stale scanner badges for Message 2)
 * and the 11 PM confluence cron (fresh scanner data for Message 3).
 */

import type { RotationTopStock, ScannerHit, RotationSnapshot } from "./transitions";
import type { ActiveRotationDetail, RotationStockPerformance } from "./rotation-types";
import { computeLifecycleStage, computeConviction } from "./rotation-helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScannerRow = Record<string, any>;

/** Build ticker → ScannerHit[] map from loaded scanner table data. */
export function buildScannerHitMap(
  prerunData: ScannerRow[],
  inflectionData: ScannerRow[],
  transitionData: ScannerRow[],
  institutionalData: ScannerRow[],
): Map<string, ScannerHit[]> {
  const map = new Map<string, ScannerHit[]>();
  const addHit = (ticker: string, hit: ScannerHit) => {
    const arr = map.get(ticker) ?? [];
    arr.push(hit);
    map.set(ticker, arr);
  };

  for (const r of prerunData) {
    if (r.final_score > 0 && (r.verdict === "PRIORITY" || r.verdict === "KEEP")) {
      addHit(r.ticker, { scanner: "Setup", detail: r.verdict });
    }
  }
  for (const r of inflectionData) {
    if (r.trade_read === "STARTER" || r.trade_read === "ADD_ON") {
      addHit(r.ticker, { scanner: "Inflect", detail: r.trade_read });
    }
  }
  for (const r of transitionData) {
    if (r.alert_state === "TRIGGERED" || r.alert_state === "READY") {
      addHit(r.ticker, { scanner: "Trans", detail: r.alert_state });
    }
  }
  for (const r of institutionalData) {
    if (r.tier === "SHORTLIST" || r.tier === "WATCHLIST") {
      addHit(r.ticker, { scanner: "Inst", detail: r.tier });
    }
  }

  return map;
}

/**
 * Build ticker → { conviction, category } lookup from enriched sector rotation stocks.
 *
 * `passed` carries one row per basket a symbol is listed in (105 of 594 symbols
 * sit in 2+), and it arrives sorted HIGH → MEDIUM → WATCH. Collapsing it into a
 * symbol-keyed map without filtering therefore kept the *last* row — the weakest
 * conviction read of that symbol. Keep the canonical-sector row instead, so this
 * agrees with PRIMARY_SECTOR and with the `sector` column on every scanner row.
 *
 * Rows without the flag (crypto, snapshots persisted before it existed) are
 * treated as canonical — those paths dedupe upstream.
 */
export function buildEnrichedMap(
  enrichedStocks?: { passed?: { symbol: string; conviction: string; category: string; isCanonicalSector?: boolean }[] },
): Map<string, { conviction: string; category: string }> {
  const map = new Map<string, { conviction: string; category: string }>();
  if (enrichedStocks?.passed) {
    for (const s of enrichedStocks.passed) {
      if (s.isCanonicalSector === false) continue;
      map.set(s.symbol, { conviction: s.conviction, category: s.category });
    }
  }
  return map;
}

/**
 * Build sectorId → top 15 stocks across 4 categories (turnaround, inflection, leading, momentum).
 * Filters: dailyChangePct < 8% (no chasing), AVOID-classified stocks excluded.
 * Sort: rsDelta descending (fastest RS acceleration change).
 */
export function buildStockMap(
  activeRotations: ActiveRotationDetail[],
  scannerHitMap: Map<string, ScannerHit[]>,
  enrichedMap: Map<string, { conviction: string; category: string }>,
): {
  stockMap: Map<string, RotationTopStock[]>;
  candidateMap: Map<string, { tradeable: number; tracked: number }>;
} {
  const stockMap = new Map<string, RotationTopStock[]>();
  // Tradeable-candidate counts, NOT breadth — see RotationSnapshot.candidates.
  const candidateMap = new Map<string, { tradeable: number; tracked: number }>();

  const passesFilters = (s: RotationStockPerformance): boolean => {
    if (Math.abs(s.dailyChangePct) >= 8) return false;
    const enriched = enrichedMap.get(s.symbol);
    if (enriched?.category === "AVOID") return false;
    return true;
  };

  const toTopStock = (s: RotationStockPerformance, category: RotationTopStock["category"]): RotationTopStock => {
    const enriched = enrichedMap.get(s.symbol);
    return {
      symbol: s.symbol,
      performancePct: s.performancePct,
      rsAcceleration: s.rsAcceleration,
      rsDelta: s.rsDelta,
      trendAccel: s.trendAccel,
      dailyChangePct: s.dailyChangePct,
      aboveSma50: s.aboveSma50,
      volumeVsAvg: s.volumeVsAvg,
      volumeConsistency: s.volumeConsistency,
      isTurnaroundCandidate: s.isTurnaroundCandidate,
      category,
      scannerHits: scannerHitMap.get(s.symbol),
      enrichedConviction: enriched?.conviction,
      enrichedCategory: enriched?.category,
    };
  };

  for (const r of activeRotations) {
    const eligible = r.stocks.filter(passesFilters);
    const turnaroundSet = new Set<string>();

    // 1. Turnarounds: below SMA50, curated flag, sustained volume
    const turnarounds = eligible
      .filter((s) => s.isTurnaroundCandidate && s.volumeConsistency >= 2)
      .sort((a, b) => b.rsDelta - a.rsDelta)
      .slice(0, 8);
    for (const s of turnarounds) turnaroundSet.add(s.symbol);

    // 2. Inflections: RS accelerating, some volume, not already picked
    const inflectionSet = new Set<string>();
    const inflections = eligible
      .filter((s) =>
        !turnaroundSet.has(s.symbol) &&
        !s.isTurnaroundCandidate &&
        s.rsDelta > 0 &&
        s.volumeConsistency >= 1 &&
        s.rsAcceleration > 0
      )
      .sort((a, b) => b.rsDelta - a.rsDelta)
      .slice(0, 8);
    for (const s of inflections) inflectionSet.add(s.symbol);

    // 3. Leaders: above SMA50, positive RS, some volume
    const leaderSet = new Set<string>();
    const leaders = eligible
      .filter((s) =>
        !turnaroundSet.has(s.symbol) &&
        !inflectionSet.has(s.symbol) &&
        s.aboveSma50 &&
        s.rsAcceleration > 0 &&
        s.volumeConsistency >= 1
      )
      .sort((a, b) => b.rsDelta - a.rsDelta)
      .slice(0, 8);
    for (const s of leaders) leaderSet.add(s.symbol);

    // 4. Momentum: above SMA50, positive performance, not in other categories
    const pickedSoFar = new Set([...turnaroundSet, ...inflectionSet, ...leaderSet]);
    const momentum = eligible
      .filter((s) =>
        !pickedSoFar.has(s.symbol) &&
        s.aboveSma50 &&
        s.performancePct > 0
      )
      .sort((a, b) => b.performancePct - a.performancePct)
      .slice(0, 8);

    const combined = [
      ...turnarounds.map((s) => toTopStock(s, "turnaround")),
      ...inflections.map((s) => toTopStock(s, "inflection")),
      ...leaders.map((s) => toTopStock(s, "leading")),
      ...momentum.map((s) => toTopStock(s, "momentum")),
    ].slice(0, 15);
    if (combined.length > 0) stockMap.set(r.event.sectorId, combined);

    candidateMap.set(r.event.sectorId, {
      tradeable: eligible.length,
      tracked: r.stocks.length,
    });
  }

  return { stockMap, candidateMap };
}

/** Build RotationSnapshot[] from active rotation details. */
export function buildCurrentRotations(
  activeRotations: ActiveRotationDetail[],
): RotationSnapshot[] {
  return activeRotations.map((r) => ({
    sectorId: r.event.sectorId,
    sectorName: r.event.sectorName,
    etf: r.event.etf,
    lifecycle: computeLifecycleStage(r.event),
    conviction: computeConviction(r.event).level,
    quadrant: r.event.health.quadrant,
    daysActive: r.event.daysActive,
    startDate: r.event.startDate,
  }));
}

/** Collect unique tickers with scanner hits across active rotations. */
export function computeConfluenceTickers(
  stockMap: Map<string, RotationTopStock[]>,
  currentRotations: RotationSnapshot[],
): string[] {
  const tickers: string[] = [];
  for (const [sectorId, stocks] of stockMap) {
    if (!currentRotations.some((r) => r.sectorId === sectorId)) continue;
    for (const s of stocks) {
      if (s.scannerHits && s.scannerHits.length > 0) {
        tickers.push(s.symbol);
      }
    }
  }
  return [...new Set(tickers)];
}
