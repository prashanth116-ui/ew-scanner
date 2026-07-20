import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifySectorTier,
  computeMarketPosture,
  computeSectorTiers,
  computeRiskFlags,
  computeWhatChanged,
  savePosture,
  loadPreviousPosture,
  type MarketPosture,
  type RiskFlag,
} from "./brief";
import type { SectorRotationResult, SectorRotationScore } from "./types";
import type { RotationTrackerResult } from "./rotation-types";
import type { DailySnapshot } from "./history";

const baseSector = (overrides: Partial<SectorRotationScore> = {}): SectorRotationScore => ({
  sector: "Technology",
  etf: "XLK",
  subsectors: [],
  category: "gics_sector",
  momentumComposite: 50,
  momentumPercentile: 50,
  acceleration: 1,
  mansfieldRS: 2,
  cmf20: 0.05,
  obvTrend: 1,
  flowPriceDivergence: false,
  breadthDivergence: false,
  accelerationInflection: false,
  breadthPct: 60,
  aggregateInsiderBuys: 0,
  aggregatePCR: null,
  unusualVolume: false,
  earningsBeatPct: 50,
  smartMoneyScore: 50,
  rsRatio: 102,
  rsMomentum: 102,
  quadrant: "LEADING",
  compositeScore: 70,
  dataQuality: 100,
  trend: "UP",
  trendArrow: "↑",
  stealthAccumulation: false,
  rrgTrail: [],
  rotationVelocity: 0.5,
  ...overrides,
});

const baseData = (overrides: Partial<SectorRotationResult> = {}): SectorRotationResult => ({
  calculatedAt: new Date().toISOString(),
  sectors: [baseSector()],
  rotationActive: true,
  rotationSummary: "Rotation active",
  dispersionIndex: 6,
  sectorSpread: 10,
  crossSectorPairs: { xlyXlp: { ratio: 1, trend: "Rising" }, xlkXlu: { ratio: 1, trend: "Rising" } },
  topStocksToWatch: [],
  stockQuotes: {},
  correlationBreak: false,
  regime: {
    regime: "RISK_ON",
    regimeConfidence: 70,
    vix: 16,
    vixSlope: "falling",
    yield10y: 4,
    dxy: 100,
    dxyTrend: "flat",
    favoredSectors: [],
    avoidSectors: [],
  },
  ...overrides,
});

const baseRotation = (overrides: Partial<RotationTrackerResult> = {}): RotationTrackerResult => ({
  calculatedAt: new Date().toISOString(),
  activeRotations: [],
  recentlyEndedRotations: [],
  patternStats: [],
  allEvents: [],
  ...overrides,
});

const makeRotation = (etf: string, daysActive = 10, signalCount = 3): NonNullable<RotationTrackerResult["activeRotations"][number]> => ({
  event: {
    sectorId: etf,
    etf,
    sectorName: etf,
    startDate: "2026-01-01",
    endDate: null,
    daysActive,
    etfPriceAtStart: 100,
    etfPriceNow: 105,
    etfPerformancePct: 5,
    signals: { rsGoldenCross: true, volumeSurge: true, priceAbove50MA: true, signalCount },
    health: { quadrant: "LEADING", acceleration: 2, cmf20: 0.2 },
    signalHistory: Array.from({ length: 5 }, (_, i) => ({ date: `2026-01-0${i + 1}`, signalCount, close: 100 + i })),
  },
  stocks: [],
});

describe("classifySectorTier", () => {
  it("classifies LEADING + high score as actionable", () => {
    expect(classifySectorTier({ quadrant: "LEADING", compositeScore: 70, acceleration: 1 }, false)).toBe("actionable");
  });

  it("classifies IMPROVING + positive accel + high score as actionable", () => {
    expect(classifySectorTier({ quadrant: "IMPROVING", compositeScore: 65, acceleration: 1 }, false)).toBe("actionable");
  });

  it("classifies IMPROVING with negative acceleration as watch", () => {
    expect(classifySectorTier({ quadrant: "IMPROVING", compositeScore: 65, acceleration: -1 }, false)).toBe("watch");
  });

  it("promotes WATCH sector with conviction to actionable", () => {
    expect(classifySectorTier({ quadrant: "LEADING", compositeScore: 55, acceleration: -1 }, true)).toBe("actionable");
  });

  it("classifies LAGGING as avoid", () => {
    expect(classifySectorTier({ quadrant: "LAGGING", compositeScore: 30, acceleration: -1 }, false)).toBe("avoid");
  });

  it("applies hysteresis buffer for positive acceleration", () => {
    // IMPROVING + positive accel = BUILD; without positive accel = WATCH.
    // Threshold drops from 60 to 58 when acceleration > 0.
    expect(classifySectorTier({ quadrant: "IMPROVING", compositeScore: 58, acceleration: 0 }, false)).toBe("watch");
    expect(classifySectorTier({ quadrant: "IMPROVING", compositeScore: 58, acceleration: 1 }, false)).toBe("actionable");
  });
});

describe("computeMarketPosture", () => {
  it("returns AGGRESSIVE in risk-on with conviction rotations and dispersion", () => {
    const rotation = makeRotation("XLK");
    const data = baseData({ dispersionIndex: 6 });
    const result = computeMarketPosture(data, baseRotation({ activeRotations: [rotation, makeRotation("XLY", 10, 3)] }));
    expect(result.posture).toBe("AGGRESSIVE");
  });

  it("returns SELECTIVE with moderate rotations", () => {
    const data = baseData({ dispersionIndex: 3 });
    const result = computeMarketPosture(data, baseRotation({ activeRotations: [makeRotation("XLK")] }));
    expect(result.posture).toBe("SELECTIVE");
  });

  it("returns CASH in risk-off with high VIX and no conviction", () => {
    const data = baseData({
      regime: { regime: "RISK_OFF", regimeConfidence: 70, vix: 32, vixSlope: "rising", yield10y: 4, dxy: 100, dxyTrend: "flat", favoredSectors: [], avoidSectors: [] },
    });
    const result = computeMarketPosture(data, baseRotation());
    expect(result.posture).toBe("CASH");
  });

  it("caps AGGRESSIVE at SELECTIVE when leadership is narrow", () => {
    const data = baseData({
      dispersionIndex: 6,
      leadershipBasketScores: [
        baseSector({ sector: "MAGS", etf: "MAGS", compositeScore: 90, quadrant: "LEADING" }),
      ],
    });
    const result = computeMarketPosture(
      data,
      baseRotation({ activeRotations: [makeRotation("XLK"), makeRotation("XLY")] }),
      { score: 30, label: "Narrow", summary: "", bullets: [], megaCapDominant: true, broadening: false, specRiskOn: false }
    );
    expect(result.posture).toBe("SELECTIVE");
  });
});

describe("computeSectorTiers", () => {
  it("sorts sectors into actionable/watch/avoid", () => {
    const sectors = [
      baseSector({ sector: "Tech", etf: "XLK", quadrant: "LEADING", compositeScore: 75 }),
      baseSector({ sector: "Util", etf: "XLU", quadrant: "LAGGING", compositeScore: 30 }),
      baseSector({ sector: "Health", etf: "XLV", quadrant: "IMPROVING", compositeScore: 62, acceleration: 1 }),
    ];
    const tiers = computeSectorTiers(sectors, baseRotation());
    expect(tiers.actionable.map((s) => s.etf)).toEqual(["XLK", "XLV"]);
    expect(tiers.avoid.map((s) => s.etf)).toEqual(["XLU"]);
    expect(tiers.watch).toHaveLength(0);
  });

  it("promotes sector with active rotation conviction", () => {
    const sectors = [baseSector({ sector: "Tech", etf: "XLK", quadrant: "LEADING", compositeScore: 55, acceleration: -1 })];
    const rotation = baseRotation({ activeRotations: [makeRotation("XLK", 10, 4)] });
    const tiers = computeSectorTiers(sectors, rotation);
    expect(tiers.actionable.map((s) => s.etf)).toEqual(["XLK"]);
  });
});

describe("computeRiskFlags", () => {
  it("flags leading sector with negative acceleration", () => {
    const sectors = [baseSector({ quadrant: "LEADING", acceleration: -1 })];
    const flags = computeRiskFlags(baseData({ sectors }), baseRotation());
    const messages = flags.map((f) => f.message);
    expect(messages.some((m) => m.includes("losing momentum"))).toBe(true);
  });

  it("flags VIX rising", () => {
    const data = baseData({
      regime: { regime: "RISK_ON", regimeConfidence: 70, vix: 20, vixSlope: "rising", yield10y: 4, dxy: 100, dxyTrend: "flat", favoredSectors: [], avoidSectors: [] },
    });
    const flags = computeRiskFlags(data, baseRotation());
    expect(flags.some((f) => f.message === "VIX rising")).toBe(true);
  });

  it("flags cross-asset risk-off when GLD and TLT rise", () => {
    const data = baseData({
      crossAssetScores: [
        baseSector({ sector: "Gold", etf: "GLD", acceleration: 3 }),
        baseSector({ sector: "Treasuries", etf: "TLT", acceleration: 3 }),
      ],
    });
    const flags = computeRiskFlags(data, baseRotation());
    expect(flags.some((f) => f.message.includes("Cross-asset risk-off"))).toBe(true);
  });

  it("flags low data quality sectors", () => {
    const sectors = [baseSector({ dataQuality: 30 })];
    const flags = computeRiskFlags(baseData({ sectors }), baseRotation());
    expect(flags.some((f) => f.message.includes("low data quality"))).toBe(true);
  });
});

describe("computeWhatChanged", () => {
  const makeSnapshot = (date: string, sectors: SectorRotationScore[]): DailySnapshot => ({
    date,
    sectors: sectors.map((s) => ({
      sector: s.sector,
      etf: s.etf,
      compositeScore: s.compositeScore,
      quadrant: s.quadrant,
      acceleration: s.acceleration,
      mansfieldRS: s.mansfieldRS,
      breadthPct: s.breadthPct,
      trend: s.trend,
    })),
    rotationSummary: "Rotation active",
    dispersionIndex: 5,
  });

  it("reports no history when previous snapshot is null", () => {
    const result = computeWhatChanged(baseData(), "SELECTIVE", null, null, baseRotation());
    expect(result.noHistory).toBe(true);
  });

  it("detects posture change", () => {
    const prev = makeSnapshot("2026-01-01", [baseSector({ quadrant: "LEADING", compositeScore: 70, acceleration: 1 })]);
    const data = baseData({ sectors: [baseSector({ quadrant: "LEADING", compositeScore: 70, acceleration: 1 })] });
    const result = computeWhatChanged(data, "AGGRESSIVE", prev, "SELECTIVE", baseRotation());
    expect(result.postureChange).toEqual({ from: "SELECTIVE", to: "AGGRESSIVE" });
  });

  it("detects quadrant transitions", () => {
    const prev = makeSnapshot("2026-01-01", [baseSector({ quadrant: "IMPROVING", compositeScore: 65, acceleration: 1 })]);
    const data = baseData({ sectors: [baseSector({ quadrant: "LEADING", compositeScore: 70, acceleration: 1 })] });
    const result = computeWhatChanged(data, "AGGRESSIVE", prev, "SELECTIVE", baseRotation());
    expect(result.quadrantTransitions).toHaveLength(1);
    expect(result.quadrantTransitions[0].category).toBe("breakout_confirmed");
  });

  it("detects tier changes", () => {
    const prev = makeSnapshot("2026-01-01", [baseSector({ quadrant: "IMPROVING", compositeScore: 50, acceleration: 1 })]);
    const data = baseData({ sectors: [baseSector({ quadrant: "IMPROVING", compositeScore: 65, acceleration: 1 })] });
    const result = computeWhatChanged(data, "SELECTIVE", prev, "SELECTIVE", baseRotation());
    expect(result.tierChanges).toHaveLength(1);
    expect(result.tierChanges[0].from).toBe("watch");
    expect(result.tierChanges[0].to).toBe("actionable");
  });

  it("detects score movers above threshold", () => {
    const prev = makeSnapshot("2026-01-01", [baseSector({ quadrant: "LEADING", compositeScore: 60, acceleration: 1 })]);
    const data = baseData({ sectors: [baseSector({ quadrant: "LEADING", compositeScore: 70, acceleration: 1 })] });
    const result = computeWhatChanged(data, "SELECTIVE", prev, "SELECTIVE", baseRotation());
    expect(result.scoreMovers).toHaveLength(1);
    expect(result.scoreMovers[0].delta).toBe(10);
  });

  it("ignores score changes below threshold", () => {
    const prev = makeSnapshot("2026-01-01", [baseSector({ quadrant: "LEADING", compositeScore: 60, acceleration: 1 })]);
    const data = baseData({ sectors: [baseSector({ quadrant: "LEADING", compositeScore: 62, acceleration: 1 })] });
    const result = computeWhatChanged(data, "SELECTIVE", prev, "SELECTIVE", baseRotation());
    expect(result.scoreMovers).toHaveLength(0);
  });
});

describe("posture persistence", () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    Object.assign(globalThis, {
      window: globalThis,
      localStorage: {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, value: string) => { mockStorage[key] = value; },
        removeItem: (key: string) => { delete mockStorage[key]; },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  it("loads previous posture from a prior day", () => {
    mockStorage["ew-brief-posture"] = JSON.stringify({ date: "2026-01-01", posture: "AGGRESSIVE" });
    const prev = loadPreviousPosture(new Date("2026-01-02T12:00:00Z"));
    expect(prev).toBe("AGGRESSIVE");
  });

  it("returns null when loading today's posture", () => {
    mockStorage["ew-brief-posture"] = JSON.stringify({ date: "2026-01-03", posture: "SELECTIVE" });
    const prev = loadPreviousPosture(new Date("2026-01-03T12:00:00Z"));
    expect(prev).toBeNull();
  });
});
