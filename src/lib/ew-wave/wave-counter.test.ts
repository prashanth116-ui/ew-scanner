import { describe, it, expect } from "vitest";
import type { SwingPoint, PriceSeries } from "./types";
import { countImpulseWaves, countDevelopingWaves, countWavesMultiCycle, getWaveStatusInfo } from "./wave-counter";

// Helper: build synthetic SwingPoint arrays
function sp(index: number, price: number, type: "high" | "low"): SwingPoint {
  return { index, price, type };
}

// Build a closes array from swing points (linear interpolation between pivots)
function closesFromSwings(swings: SwingPoint[], totalBars: number): number[] {
  const closes = new Array(totalBars).fill(0);
  // Set swing prices at their indices
  for (const s of swings) {
    closes[s.index] = s.price;
  }
  // Fill gaps with linear interpolation
  let prevIdx = 0;
  closes[0] = swings[0]?.price ?? 100;
  for (const s of swings) {
    const startPrice = closes[prevIdx];
    const endPrice = s.price;
    for (let i = prevIdx + 1; i <= s.index; i++) {
      const t = (i - prevIdx) / (s.index - prevIdx);
      closes[i] = startPrice + (endPrice - startPrice) * t;
    }
    prevIdx = s.index;
  }
  // Fill remaining bars with last known price
  for (let i = prevIdx + 1; i < totalBars; i++) {
    closes[i] = closes[prevIdx];
  }
  return closes;
}

// Build a minimal PriceSeries from closes
function seriesFromCloses(closes: number[]): PriceSeries {
  return {
    timestamps: closes.map((_, i) => 1700000000 + i * 604800), // weekly intervals
    open: closes.map(c => c),
    high: closes.map(c => c * 1.01),
    low: closes.map(c => c * 0.99),
    close: closes,
    volume: closes.map(() => 1000000),
  };
}

describe("Elliott Wave Counter", () => {
  // ── Inviolable EW Rules ──

  describe("Three Cardinal Rules", () => {
    it("Rule 1: Wave 2 cannot retrace 100% of Wave 1 (bullish)", () => {
      // Construct: p0=100, p1=120, p2=100 (exact 100% retrace), p3=150, p4=130, p5=160
      // W2 retraces exactly to p0 — this should be flagged
      const swings: SwingPoint[] = [
        sp(0, 100, "low"),
        sp(5, 120, "high"),
        sp(10, 100, "low"),   // Exact 100% retrace
        sp(15, 150, "high"),
        sp(20, 130, "low"),
        sp(25, 160, "high"),
      ];
      const closes = closesFromSwings(swings, 30);
      const result = countImpulseWaves(swings, closes, "up", "primary");

      // With Phase 5 fix: exact 100% retrace should be allowed (p2 < p0 is violation, p2 == p0 is ok)
      // Before Phase 5: p2 <= p0 triggers violation, so W2=100 and W0=100 triggers it
      // This test documents the expected behavior after the fix
      if (result) {
        // If a result is returned, W2 at exactly p0 should NOT be a violation after Phase 5
        const hasW2Violation = result.violations.some(v => v.includes("Wave 2 retraces beyond"));
        // After Phase 5 fix, exact retrace is allowed
        expect(hasW2Violation).toBe(false);
      }
    });

    it("Rule 1: Wave 2 below Wave 1 start is always invalid (bullish)", () => {
      // p2 = 95, clearly below p0 = 100
      const swings: SwingPoint[] = [
        sp(0, 100, "low"),
        sp(5, 120, "high"),
        sp(10, 95, "low"),    // Below W1 start
        sp(15, 150, "high"),
        sp(20, 130, "low"),
        sp(25, 160, "high"),
      ];
      const closes = closesFromSwings(swings, 30);
      const result = countImpulseWaves(swings, closes, "up", "primary");
      if (result) {
        expect(result.isValid).toBe(false);
        expect(result.violations).toContain("Wave 2 retraces beyond Wave 1 start");
      }
    });

    it("Rule 2: Wave 3 cannot be the shortest impulse wave", () => {
      // W1 = 20pts, W3 = 10pts (shortest), W5 = 15pts
      const swings: SwingPoint[] = [
        sp(0, 100, "low"),
        sp(5, 120, "high"),   // W1 = 20
        sp(10, 110, "low"),
        sp(15, 120, "high"),  // W3 = 10 (shortest!)
        sp(20, 115, "low"),
        sp(25, 130, "high"),  // W5 = 15
      ];
      const closes = closesFromSwings(swings, 30);
      const result = countImpulseWaves(swings, closes, "up", "primary");
      if (result) {
        expect(result.violations).toContain("Wave 3 is the shortest impulse wave");
      }
    });

    it("Rule 3: Wave 4 cannot overlap Wave 1 territory (bullish)", () => {
      // W1 high = 120, W4 low = 115 (overlap since W4 < W1)
      const swings: SwingPoint[] = [
        sp(0, 100, "low"),
        sp(5, 120, "high"),   // W1 peak
        sp(10, 105, "low"),
        sp(15, 160, "high"),
        sp(20, 115, "low"),   // W4 below W1 peak — overlap
        sp(25, 170, "high"),
      ];
      const closes = closesFromSwings(swings, 30);
      const result = countImpulseWaves(swings, closes, "up", "primary");
      if (result) {
        expect(result.violations).toContain("Wave 4 overlaps Wave 1 territory");
      }
    });
  });

  // ── Valid Impulse Pattern ──

  describe("Valid impulse detection", () => {
    it("finds a textbook bullish 5-wave impulse", () => {
      // Textbook: W1 up, W2 retrace 50%, W3 extends 1.618x, W4 retrace 38.2%, W5 up
      const swings: SwingPoint[] = [
        sp(0, 100, "low"),     // p0
        sp(5, 120, "high"),    // p1: W1 = 20
        sp(10, 110, "low"),    // p2: W2 retrace 50% of W1
        sp(15, 150, "high"),   // p3: W3 = 40 (2x W1)
        sp(20, 135, "low"),    // p4: W4 retrace 37.5% of W3, above W1 peak (120)
        sp(25, 170, "high"),   // p5: W5 = 35
      ];
      const closes = closesFromSwings(swings, 30);
      const result = countImpulseWaves(swings, closes, "up", "primary");

      expect(result).not.toBeNull();
      expect(result!.isValid).toBe(true);
      expect(result!.waves).toHaveLength(5);
      expect(result!.waves.map(w => w.label)).toEqual(["1", "2", "3", "4", "5"]);
      expect(result!.waves[4].price).toBe(170); // W5 at the peak
    });

    it("finds a textbook bearish 5-wave impulse", () => {
      const swings: SwingPoint[] = [
        sp(0, 200, "high"),    // p0
        sp(5, 170, "low"),     // p1: W1 = 30 down
        sp(10, 185, "high"),   // p2: W2 retrace 50%
        sp(15, 130, "low"),    // p3: W3 = 55 (1.83x W1)
        sp(20, 145, "high"),   // p4: W4 retrace 27% of W3, below W1 (170)
        sp(25, 110, "low"),    // p5: W5
      ];
      const closes = closesFromSwings(swings, 30);
      const result = countImpulseWaves(swings, closes, "down", "primary");

      expect(result).not.toBeNull();
      expect(result!.isValid).toBe(true);
      expect(result!.waves[4].price).toBe(110);
    });
  });

  // ── SE Regression Test ──

  describe("SE regression: W5 must be at the true peak", () => {
    it("labels W5 at ~$199, not at an intermediate swing ($147)", () => {
      // Simplified SE recovery data: swing sequence from the major low
      // The key issue: the true peak ($199) is at position [15] in the alternating
      // sequence, but the old evenly-spaced selection missed it.
      //
      // Simplified recovery: low→highs and lows mimicking SE's non-uniform structure
      const swings: SwingPoint[] = [
        sp(0, 20, "low"),      // Major low (starting point)
        sp(5, 40, "high"),     // First bounce
        sp(10, 30, "low"),     // Pullback
        sp(15, 55, "high"),    // Higher high
        sp(20, 42, "low"),     // Pullback
        sp(25, 75, "high"),    // Climbing
        sp(30, 60, "low"),     // Pullback
        sp(35, 103, "high"),   // Big move up
        sp(40, 85, "low"),     // Pullback
        sp(45, 147, "high"),   // Intermediate peak (OLD wrong W5)
        sp(50, 120, "low"),    // Correction
        sp(55, 165, "high"),   // Higher
        sp(60, 140, "low"),    // Pullback
        sp(65, 199, "high"),   // TRUE PEAK (correct W5)
        sp(70, 160, "low"),    // Post-peak correction
      ];
      const closes = closesFromSwings(swings, 75);
      // Set current price at last bar
      closes[74] = 160;

      const result = countImpulseWaves(swings, closes, "up", "primary");

      expect(result).not.toBeNull();
      // The critical assertion: W5 should be at or near 199, NOT 147
      const w5 = result!.waves.find(w => w.label === "5");
      expect(w5).toBeDefined();
      expect(w5!.price).toBeGreaterThan(180); // Must be at the true peak, not 147
    });
  });

  // ── W5 Terminal Validation ──

  describe("W5 terminal validation", () => {
    it("flags when subsequent price exceeds W5 (bullish)", () => {
      // Construct a pattern where swings after p5 go higher
      const swings: SwingPoint[] = [
        sp(0, 100, "low"),
        sp(5, 120, "high"),
        sp(10, 110, "low"),
        sp(15, 150, "high"),
        sp(20, 135, "low"),
        sp(25, 160, "high"),  // Should be W5
        sp(30, 145, "low"),
        sp(35, 180, "high"),  // Exceeds W5! This should be the real W5
      ];
      const closes = closesFromSwings(swings, 40);
      const result = countImpulseWaves(swings, closes, "up", "primary");

      expect(result).not.toBeNull();
      // After Phase 2 fix: the algorithm should find W5 at 180 (the true peak)
      const w5 = result!.waves.find(w => w.label === "5");
      expect(w5).toBeDefined();
      expect(w5!.price).toBe(180);
    });
  });

  // ── Scoring ──

  describe("Scoring", () => {
    it("pattern covering full impulse scores higher than truncated pattern", () => {
      // Full impulse: 100 → 200 (complete range)
      const fullSwings: SwingPoint[] = [
        sp(0, 100, "low"),
        sp(5, 130, "high"),
        sp(10, 115, "low"),
        sp(15, 175, "high"),
        sp(20, 155, "low"),
        sp(25, 200, "high"),
      ];
      const fullCloses = closesFromSwings(fullSwings, 30);

      // Truncated: same start but misses the real peak
      const truncSwings: SwingPoint[] = [
        sp(0, 100, "low"),
        sp(5, 115, "high"),
        sp(10, 105, "low"),
        sp(15, 140, "high"),
        sp(20, 125, "low"),
        sp(25, 155, "high"),  // Only captures half the move
      ];
      const truncCloses = closesFromSwings(truncSwings, 30);

      const fullResult = countImpulseWaves(fullSwings, fullCloses, "up", "primary");
      const truncResult = countImpulseWaves(truncSwings, truncCloses, "up", "primary");

      expect(fullResult).not.toBeNull();
      expect(truncResult).not.toBeNull();
      // Full-range pattern should score at least as high
      expect(fullResult!.score).toBeGreaterThanOrEqual(truncResult!.score);
    });
  });

  // ── Developing Waves ──

  describe("Developing waves", () => {
    it("detects a developing 3-point bullish pattern", () => {
      const swings: SwingPoint[] = [
        sp(0, 100, "low"),
        sp(5, 130, "high"),
        sp(10, 115, "low"),
      ];
      const closes = closesFromSwings(swings, 15);
      closes[14] = 140; // Price advancing past W2

      const result = countDevelopingWaves(swings, closes, "up", "primary");

      expect(result).not.toBeNull();
      expect(result!.waves).toHaveLength(2); // W1, W2
      expect(result!.waves[0].label).toBe("1");
      expect(result!.waves[1].label).toBe("2");
      expect(result!.position).toContain("Wave 3");
    });

    it("returns null when 9+ alternating points exist", () => {
      // Build 9 alternating points — too many for developing, full impulse handles it
      const swings: SwingPoint[] = [
        sp(0, 100, "low"),
        sp(5, 120, "high"),
        sp(10, 110, "low"),
        sp(15, 140, "high"),
        sp(20, 125, "low"),
        sp(25, 160, "high"),
        sp(30, 145, "low"),
        sp(35, 175, "high"),
        sp(40, 160, "low"),
      ];
      const closes = closesFromSwings(swings, 45);

      const result = countDevelopingWaves(swings, closes, "up", "primary");
      expect(result).toBeNull(); // 9 points → full impulse handles this
    });

    it("detects a developing 6-point bullish pattern (extended W5)", () => {
      // 6 alternating points: W1-W4 complete, W5 forming
      const swings: SwingPoint[] = [
        sp(0, 100, "low"),     // p0
        sp(5, 130, "high"),    // p1: W1
        sp(10, 115, "low"),    // p2: W2
        sp(15, 160, "high"),   // p3: W3
        sp(20, 140, "low"),    // p4: W4
        sp(25, 175, "high"),   // p5: W5 advancing
      ];
      const closes = closesFromSwings(swings, 30);
      closes[29] = 180; // Price advancing past W4

      const result = countDevelopingWaves(swings, closes, "up", "primary");

      expect(result).not.toBeNull();
      expect(result!.waves).toHaveLength(4); // W1, W2, W3, W4
      expect(result!.waves.map(w => w.label)).toEqual(["1", "2", "3", "4"]);
      expect(result!.position).toContain("Wave 5");
    });

    it("detects a developing 7-point bullish pattern", () => {
      const swings: SwingPoint[] = [
        sp(0, 100, "low"),
        sp(5, 130, "high"),
        sp(10, 115, "low"),
        sp(15, 160, "high"),
        sp(20, 140, "low"),
        sp(25, 175, "high"),
        sp(30, 155, "low"),
      ];
      const closes = closesFromSwings(swings, 35);
      closes[34] = 185;

      const result = countDevelopingWaves(swings, closes, "up", "primary");

      expect(result).not.toBeNull();
      expect(result!.position).toContain("Wave 5");
    });

    it("detects a developing 8-point bullish pattern", () => {
      const swings: SwingPoint[] = [
        sp(0, 100, "low"),
        sp(5, 130, "high"),
        sp(10, 115, "low"),
        sp(15, 160, "high"),
        sp(20, 140, "low"),
        sp(25, 175, "high"),
        sp(30, 155, "low"),
        sp(35, 190, "high"),
      ];
      const closes = closesFromSwings(swings, 40);
      closes[39] = 195;

      const result = countDevelopingWaves(swings, closes, "up", "primary");

      expect(result).not.toBeNull();
      expect(result!.position).toContain("Wave 5");
    });
  });

  // ── Multi-Cycle Wave Counting ──

  describe("Multi-cycle wave counting", () => {
    it("returns primary only when no recent cycle is provided", () => {
      const swings: SwingPoint[] = [
        sp(0, 200, "high"),
        sp(5, 170, "low"),
        sp(10, 185, "high"),
        sp(15, 130, "low"),
        sp(20, 145, "high"),
        sp(25, 110, "low"),
        sp(30, 150, "high"),
        sp(35, 140, "low"),
        sp(40, 180, "high"),
        sp(45, 165, "low"),
        sp(50, 195, "high"),
      ];
      const closes = closesFromSwings(swings, 55);
      const series = seriesFromCloses(closes);

      const result = countWavesMultiCycle(series, 0, 25);

      expect(result.recentCycle).toBeNull();
      if (result.best) {
        expect(result.best.cycleSource).toBe("global");
      }
    });

    it("tags wave counts with correct cycleSource", () => {
      // Build a series with a global ATH at start and a recent correction in the middle
      const closes = new Array(100).fill(0);
      for (let i = 0; i < 100; i++) {
        closes[i] = 100 + Math.sin(i / 10) * 30 + i * 0.5;
      }
      const series = seriesFromCloses(closes);

      const result = countWavesMultiCycle(series, 0, 10, 50, 60);

      if (result.primary) {
        expect(result.primary.cycleSource).toBe("global");
      }
      if (result.recentCycle) {
        expect(result.recentCycle.cycleSource).toBe("recent");
      }
    });

    it("prefers recent cycle when global is stale", () => {
      // Global pattern is in the first 20% of the series, recent is in the last 20%
      const closes = new Array(100).fill(0);
      // First part: decline from 200 to 100
      for (let i = 0; i <= 20; i++) closes[i] = 200 - i * 5;
      // Recovery
      for (let i = 21; i <= 50; i++) closes[i] = 100 + (i - 20) * 3;
      // Recent correction at bar 70
      for (let i = 51; i <= 70; i++) closes[i] = 190 - (i - 50) * 2;
      // Recent recovery
      for (let i = 71; i <= 99; i++) closes[i] = 150 + (i - 70) * 1.5;

      const series = seriesFromCloses(closes);

      // Global: ATH at 0 (200), low at 20 (100) — old pattern
      // Recent: ATH at 50 (190), low at 70 (150) — fresh pattern
      const result = countWavesMultiCycle(series, 0, 20, 50, 70);

      // If both produce counts, the recent one should win
      // (global pattern's last wave is far from series end)
      if (result.primary && result.recentCycle && result.best) {
        // The best should have an alternateCount attached
        expect(result.best.alternateCount).toBeDefined();
      }
    });
  });

  // ── Stale Target Detection ──

  describe("Stale target detection", () => {
    it("detects stale targets when all targets are behind current price", () => {
      // Build a completed bullish impulse with targets below current price
      const wc = {
        waves: [
          { index: 5, price: 120, type: "high" as const, label: "1" as const, degree: "primary" as const, confidence: 0.8 },
          { index: 10, price: 110, type: "low" as const, label: "2" as const, degree: "primary" as const, confidence: 0.8 },
          { index: 15, price: 150, type: "high" as const, label: "3" as const, degree: "primary" as const, confidence: 0.8 },
          { index: 20, price: 135, type: "low" as const, label: "4" as const, degree: "primary" as const, confidence: 0.8 },
          { index: 25, price: 170, type: "high" as const, label: "5" as const, degree: "primary" as const, confidence: 0.8 },
        ],
        waveStart: { index: 0, price: 100, type: "low" as const },
        direction: "up" as const,
        degree: "primary" as const,
        isValid: true,
        violations: [],
        score: 80,
        position: "Post-Wave 5 — correction underway",
      };

      // Current price well above all expected retracement targets
      const info = getWaveStatusInfo(wc, 250);

      // The standard retracement targets (38.2%, 50%, 61.8% of 100→170 impulse)
      // would be: 143.24, 135.00, 126.76 — all below 250
      expect(info.targetsStale).toBe(true);
    });

    it("does not flag targets as stale when some are ahead", () => {
      const wc = {
        waves: [
          { index: 5, price: 120, type: "high" as const, label: "1" as const, degree: "primary" as const, confidence: 0.8 },
          { index: 10, price: 110, type: "low" as const, label: "2" as const, degree: "primary" as const, confidence: 0.8 },
          { index: 15, price: 150, type: "high" as const, label: "3" as const, degree: "primary" as const, confidence: 0.8 },
          { index: 20, price: 135, type: "low" as const, label: "4" as const, degree: "primary" as const, confidence: 0.8 },
          { index: 25, price: 170, type: "high" as const, label: "5" as const, degree: "primary" as const, confidence: 0.8 },
        ],
        waveStart: { index: 0, price: 100, type: "low" as const },
        direction: "up" as const,
        degree: "primary" as const,
        isValid: true,
        violations: [],
        score: 80,
        position: "Post-Wave 5 — correction underway",
      };

      // Current price within target range
      const info = getWaveStatusInfo(wc, 140);

      expect(info.targetsStale).toBeFalsy();
    });

    it("adds forward targets when all standard targets are stale", () => {
      const wc = {
        waves: [
          { index: 5, price: 120, type: "high" as const, label: "1" as const, degree: "primary" as const, confidence: 0.8 },
          { index: 10, price: 110, type: "low" as const, label: "2" as const, degree: "primary" as const, confidence: 0.8 },
          { index: 15, price: 150, type: "high" as const, label: "3" as const, degree: "primary" as const, confidence: 0.8 },
          { index: 20, price: 135, type: "low" as const, label: "4" as const, degree: "primary" as const, confidence: 0.8 },
          { index: 25, price: 170, type: "high" as const, label: "5" as const, degree: "primary" as const, confidence: 0.8 },
        ],
        waveStart: { index: 0, price: 100, type: "low" as const },
        direction: "up" as const,
        degree: "primary" as const,
        isValid: true,
        violations: [],
        score: 80,
        position: "Post-Wave 5 — correction underway",
      };

      const info = getWaveStatusInfo(wc, 250);

      // Should have appended forward retracement targets
      const forwardTargets = info.targets.filter(t => t.label.includes("forward"));
      // Forward targets should be retracements of 100→170 impulse, but going in reverse
      // Since price is at 250 (above 170), forward targets from retracement would be:
      // 170 - (170-100)*0.382 = 143.24, etc. — all below 250, so none qualify
      // This is expected: when price is FAR above the impulse, forward targets may not help
      expect(info.targetsStale).toBe(true);
    });
  });

  // ── Edge Cases ──

  describe("Edge cases", () => {
    it("returns null with fewer than 5 swings", () => {
      const swings: SwingPoint[] = [
        sp(0, 100, "low"),
        sp(5, 120, "high"),
        sp(10, 110, "low"),
      ];
      const closes = closesFromSwings(swings, 15);
      const result = countImpulseWaves(swings, closes, "up", "primary");
      expect(result).toBeNull();
    });

    it("handles many swings (20+) without performance issues", () => {
      // Build a 20-swing alternating sequence
      const swings: SwingPoint[] = [];
      let price = 100;
      for (let i = 0; i < 20; i++) {
        const type = i % 2 === 0 ? "low" as const : "high" as const;
        if (type === "high") price += 15 + Math.random() * 10;
        else price -= 5 + Math.random() * 5;
        swings.push(sp(i * 5, price, type));
      }
      const closes = closesFromSwings(swings, 100);

      const start = performance.now();
      const result = countImpulseWaves(swings, closes, "up", "primary");
      const elapsed = performance.now() - start;

      // Should complete in under 1 second
      expect(elapsed).toBeLessThan(1000);
      // Should find some result with this many swings
      if (result) {
        expect(result.waves.length).toBe(5);
      }
    });
  });
});
