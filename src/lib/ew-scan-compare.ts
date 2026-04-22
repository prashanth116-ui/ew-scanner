import type { SavedScan, ScanComparison } from "./ew-types";

export function compareScansPair(scanA: SavedScan, scanB: SavedScan): ScanComparison {
  const tickersA = new Set(scanA.candidates.map((c) => c.ticker));
  const tickersB = new Set(scanB.candidates.map((c) => c.ticker));

  const newTickers = scanB.candidates
    .filter((c) => !tickersA.has(c.ticker))
    .map((c) => c.ticker);

  const droppedTickers = scanA.candidates
    .filter((c) => !tickersB.has(c.ticker))
    .map((c) => c.ticker);

  // Score changes for tickers present in both scans
  const mapA = new Map(scanA.candidates.map((c) => [c.ticker, c]));
  const mapB = new Map(scanB.candidates.map((c) => [c.ticker, c]));

  const scoreChanges: ScanComparison["scoreChanges"] = [];
  for (const [ticker, candA] of mapA) {
    const candB = mapB.get(ticker);
    if (!candB) continue;
    const delta = candB.enhancedNormalized - candA.enhancedNormalized;
    scoreChanges.push({
      ticker,
      name: candA.name,
      scoreA: candA.enhancedNormalized,
      scoreB: candB.enhancedNormalized,
      delta,
    });
  }

  // Sort by absolute delta descending
  scoreChanges.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { scanA, scanB, newTickers, droppedTickers, scoreChanges };
}
