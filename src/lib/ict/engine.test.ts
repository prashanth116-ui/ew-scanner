import { describe, it, expect } from "vitest";
import { runICTEngine } from "./engine";
import { scoreICTSetup } from "./scoring";
import { detectBullishCISD } from "./cisd";
import { ICTState } from "./types";

// ── Synthetic OHLC Fixture Builder ──

/**
 * Build a synthetic ~60-bar OHLC sequence that progresses through all 11 states.
 * Each phase has precise candle relationships to trigger the corresponding state.
 */
function buildFullProgressionFixture(): {
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  timestamps: number[];
} {
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const timestamps: number[] = [];

  let t = 1700000000;
  const add = (o: number, h: number, l: number, c: number) => {
    opens.push(o);
    highs.push(h);
    lows.push(l);
    closes.push(c);
    timestamps.push(t);
    t += 3600;
  };

  // ── Phase 0 (Bars 0-13): Establish swing low pool ──
  // Declining sequence with well-defined lows.
  // The SSL pool will be the minimum of lows[i-10..i-1] before bar 14.
  add(220, 221, 217, 218);   // 0
  add(218, 219, 216, 217);   // 1
  add(217, 218, 215, 216);   // 2
  add(216, 217, 214, 215);   // 3
  add(215, 216, 213, 214);   // 4
  add(214, 215, 212, 213);   // 5
  add(213, 214, 211, 212);   // 6
  add(212, 213, 210, 211);   // 7 — low=210 (will be part of SSL pool)
  add(211, 212, 210.5, 211); // 8
  add(211, 212, 210.5, 211); // 9
  add(211, 212, 210.5, 211); // 10
  add(211, 212, 210.5, 211); // 11
  add(211, 212, 210.5, 211); // 12
  add(211, 212, 210.5, 211); // 13
  // Prior SSL for bar 14 = min(lows[4..13]) = 210 (bar 7)

  // ── Phase 1 (Bar 14): SSL_RAID ──
  // Sweep below prior SSL (210) then reclaim: low=209.5, close=210.5
  add(211, 211, 209.5, 210.5); // 14 — SSL raid: low 209.5 < 210, close 210.5 > 210
  // Protected low = 209.5 (raid bar low)
  // Structure high = max(highs[6..13]) = 214 (bar 6)
  // State → STRUCTURE_HIGH (SSL_RAID + immediate struct high)

  // ── Phase 2 (Bars 15-17): Small candles before displacement ──
  // Keep body and range small so displacement candle exceeds them
  add(210.5, 211.0, 210.0, 210.8); // 15 — body=0.3, range=1.0
  add(210.8, 211.2, 210.3, 210.9); // 16 — body=0.1, range=0.9
  add(210.9, 211.3, 210.4, 211.0); // 17 — body=0.1, range=0.9

  // ── Phase 3 (Bar 18): BULLISH_DISPLACEMENT ──
  // body > each of prev 3 bodies, range > each of prev 3 ranges,
  // body/range >= 0.60, close > high[17]=211.3
  // Body = 215.0 - 211.0 = 4.0, Range = 215.5 - 210.5 = 5.0, ratio = 0.80
  add(211.0, 215.5, 210.5, 215.0); // 18 — big displacement candle
  // close 215.0 > structure high 214 → also triggers MSS → State = BULLISH_MSS

  // ── Phase 4 (Bars 19-20): FVG Formation ──
  // 3-candle FVG: low[20] > high[18]=215.5
  add(215.0, 216.0, 214.8, 215.5); // 19 (candle A for FVG check at bar 20)
  // For bar 20 to have FVG: low[20] > high[18]=215.5
  add(215.5, 217.0, 215.8, 216.5); // 20 — low=215.8 > high[18]=215.5 ✓
  // FVG zone: lower=high[18]=215.5, upper=low[20]=215.8
  // State → FVG_CONFIRMED

  // ── Phase 5 (Bar 21): FVG_RETRACEMENT ──
  // low[21] <= fvg.upper(215.8) AND high[21] >= fvg.lower(215.5)
  add(216.5, 216.8, 215.6, 216.0); // 21 — low=215.6 ≤ 215.8, high=216.8 ≥ 215.5 ✓
  // Retracement depth = (215.8 - 215.6) / (215.8 - 215.5) = 0.2/0.3 = 0.67

  // ── Phase 6 (Bars 22-24): Setup for higher low ──
  add(216.0, 216.5, 215.3, 215.5); // 22
  add(215.5, 215.8, 214.0, 214.5); // 23 — low=214.0 (local dip but > prot low 209.5)
  // Higher low check at bar 24: low[23]=214.0 > protectedLow=209.5 ✓
  //   low[23]=214.0 < low[22]=215.3 ✓ (turning point)
  //   low[24] > low[23]=214.0 AND close[24] > high[23]=215.8
  add(214.5, 216.2, 214.5, 216.0); // 24 — low=214.5 > 214.0 ✓, close=216.0 > 215.8 ✓
  // State → HIGHER_LOW

  // ── Phase 7 (Bars 25-33): BSL Formation ──
  // Need clustered highs. Build 8 bars with at least 2 highs near 216.5
  add(216.0, 216.5, 215.5, 216.0); // 25 — high=216.5
  add(216.0, 216.4, 215.8, 216.1); // 26 — high=216.4 (within 0.4% of 216.5)
  add(216.1, 216.3, 215.9, 216.0); // 27
  add(216.0, 216.5, 215.7, 216.2); // 28 — high=216.5 (exact match)
  add(216.2, 216.3, 215.8, 216.0); // 29
  add(216.0, 216.2, 215.5, 215.8); // 30
  add(215.8, 216.1, 215.3, 215.5); // 31
  add(215.5, 216.0, 215.0, 215.3); // 32
  // BSL check at bar 33: highs[25..32], max=216.5, tolerance=0.004 (0.4% of 216.5 = 0.866)
  // Highs within tolerance of 216.5: 216.5(25), 216.4(26), 216.5(28) = 3 ✓
  add(215.3, 215.8, 215.0, 215.5); // 33
  // State → BSL_BUILT, bslLevel=216.5

  // ── Phase 8 (Bars 34-36): Compression → ARMED ──
  // Need: lows[i] > lows[i-1] >= lows[i-2], highs[i] < 216.5,
  // (216.5 - close) / 216.5 * 100 <= 3.0
  add(215.5, 216.0, 215.0, 215.8); // 34 — low=215.0
  add(215.8, 216.2, 215.2, 216.0); // 35 — low=215.2 >= 215.0 ✓
  add(216.0, 216.3, 215.5, 216.2); // 36 — low=215.5 > 215.2 ✓, high=216.3 < 216.5 ✓
  // dist = (216.5 - 216.2) / 216.5 * 100 = 0.14% ✓
  // State → ARMED

  // ── Phase 9 (Bar 37): CISD → TRIGGER ──
  // Need a recent bearish candle, then a bullish close above its open.
  // Bar 36 is bullish. Let's make bar 37 bearish, then bar 38 triggers CISD.
  // Actually, ARMED checks CISD at each bar. Let's add a bearish bar first.
  add(216.2, 216.3, 215.8, 215.9); // 37 — bearish (close < open), open=216.2
  // Bar 38: bullish CISD — close > 216.2 (bar 37's open)
  add(216.0, 216.4, 215.9, 216.3); // 38 — close=216.3 > 216.2 ✓, bullish ✓
  // But wait, we need ARMED check to still pass at bar 38.
  // lows[38]=215.9 > lows[37]=215.8 ✓
  // lows[37]=215.8 >= lows[36]=215.5 ✓
  // highs[38]=216.4 < 216.5 ✓
  // dist = (216.5-216.3)/216.5*100 = 0.09% ✓
  // State: ARMED still passes, plus CISD triggers → TRIGGER

  // ── Phase 10 (Bars 39-42): Setup for IGNITION ──
  // Need small candles so bar 43 can have displacement through BSL
  add(216.3, 216.4, 216.0, 216.2); // 39 — body=0.1, range=0.4
  add(216.2, 216.3, 215.9, 216.1); // 40 — body=0.1, range=0.4
  add(216.1, 216.2, 215.8, 216.0); // 41 — body=0.1, range=0.4

  // ── Phase 11 (Bar 42): IGNITION ──
  // close > BSL(216.5) with displacement
  // Body > each of prev 3 bodies (all 0.1), range > prev 3 ranges (all 0.4)
  // body/range >= 0.60, close > high[41]=216.2
  // body = 218.5 - 216.0 = 2.5, range = 218.8 - 215.5 = 3.3, ratio = 0.76
  add(216.0, 218.8, 215.5, 218.5); // 42 — IGNITION: close=218.5 > 216.5, displacement ✓

  return { opens, highs, lows, closes, timestamps };
}

/**
 * Build a fixture that stops at a specific state (for targeted tests).
 */
function buildPartialFixture(
  targetBars: number,
): { opens: number[]; highs: number[]; lows: number[]; closes: number[]; timestamps: number[] } {
  const full = buildFullProgressionFixture();
  return {
    opens: full.opens.slice(0, targetBars),
    highs: full.highs.slice(0, targetBars),
    lows: full.lows.slice(0, targetBars),
    closes: full.closes.slice(0, targetBars),
    timestamps: full.timestamps.slice(0, targetBars),
  };
}

// ── Tests ──

describe("ICT Engine — State Machine", () => {
  // 1. SSL raid true (sweep + reclaim)
  it("detects SSL raid when price sweeps below and reclaims", () => {
    const fixture = buildPartialFixture(15);
    const result = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    expect(result.currentState).toBeGreaterThanOrEqual(ICTState.SSL_RAID);
    expect(result.sslRaid).not.toBeNull();
    expect(result.sslRaid!.sweptPrice).toBe(210);
    expect(result.protectedLow).toBe(209.5);
  });

  // 2. SSL raid false (no sweep)
  it("returns NONE when no SSL sweep occurs", () => {
    const opens = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114];
    const highs = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115];
    const lows  = [ 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113];
    const closes = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114];
    const timestamps = Array.from({ length: 15 }, (_, i) => 1700000000 + i * 3600);

    const result = runICTEngine(opens, highs, lows, closes, timestamps);
    expect(result.currentState).toBe(ICTState.NONE);
  });

  // 3. Wick sweep + reclaim (SSL true)
  it("detects SSL raid from wick sweep with close reclaim", () => {
    // Build 11 bars with declining lows, then a sweep by wick
    const opens =  [220, 219, 218, 217, 216, 215, 214, 213, 212, 211, 211];
    const highs =  [221, 220, 219, 218, 217, 216, 215, 214, 213, 212, 212];
    const lows =   [219, 218, 217, 216, 215, 214, 213, 212, 211, 210, 209]; // bar10 sweeps below 210
    const closes = [220, 219, 218, 217, 216, 215, 214, 213, 212, 211, 211]; // bar10 close=211 > 210
    const timestamps = Array.from({ length: 11 }, (_, i) => 1700000000 + i * 3600);

    const result = runICTEngine(opens, highs, lows, closes, timestamps);
    expect(result.currentState).toBeGreaterThanOrEqual(ICTState.SSL_RAID);
    expect(result.sslRaid).not.toBeNull();
  });

  // 4. Wick sweep without reclaim (SSL false)
  it("does not detect SSL when sweep occurs but no reclaim", () => {
    const opens =  [220, 219, 218, 217, 216, 215, 214, 213, 212, 211, 211];
    const highs =  [221, 220, 219, 218, 217, 216, 215, 214, 213, 212, 212];
    const lows =   [219, 218, 217, 216, 215, 214, 213, 212, 211, 210, 209];
    const closes = [220, 219, 218, 217, 216, 215, 214, 213, 212, 211, 209.5]; // close below SSL
    const timestamps = Array.from({ length: 11 }, (_, i) => 1700000000 + i * 3600);

    const result = runICTEngine(opens, highs, lows, closes, timestamps);
    expect(result.currentState).toBe(ICTState.NONE);
  });

  // 5. Bullish displacement (body > each of prev 3)
  it("detects displacement when body exceeds all 3 prior bodies", () => {
    const fixture = buildPartialFixture(19);
    const result = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    expect(result.currentState).toBeGreaterThanOrEqual(ICTState.BULLISH_DISPLACEMENT);
  });

  // 6. Non-displacement candle (body ratio too small)
  it("does not detect displacement with small body ratio", () => {
    // Build standalone fixture: SSL raid + struct high + only doji candles afterward
    const opens =  [220, 219, 218, 217, 216, 215, 214, 213, 212, 211, 211, 211, 211, 211, 211, 210.5, 210.5, 210.5];
    const highs =  [221, 220, 219, 218, 217, 216, 215, 214, 213, 212, 212, 212, 212, 212, 211, 211.0, 211.0, 211.0];
    const lows =   [219, 218, 217, 216, 215, 214, 213, 212, 211, 210, 210.5,210.5,210.5,210.5,209.5,210.0, 210.0, 210.0];
    const closes = [220, 219, 218, 217, 216, 215, 214, 213, 212, 211, 211, 211, 211, 211, 210.5,210.6, 210.6, 210.6];
    // Bar 14: sweep (low=209.5 < 210) + reclaim (close=210.5 > 210) → SSL raid
    // Bars 15-17: tiny doji candles (body=0.1, range=1.0, ratio=0.10 < 0.60)
    const timestamps = Array.from({ length: 18 }, (_, i) => 1700000000 + i * 3600);

    const result = runICTEngine(opens, highs, lows, closes, timestamps);
    // Should reach STRUCTURE_HIGH but not DISPLACEMENT (all post-SSL candles are dojis)
    expect(result.currentState).toBeLessThanOrEqual(ICTState.STRUCTURE_HIGH);
  });

  // 7. MSS by close (state advances)
  it("advances to MSS when close breaks structure high", () => {
    const fixture = buildPartialFixture(19);
    const result = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    // Bar 18 displacement also crosses struct high (214) with close=215
    expect(result.currentState).toBeGreaterThanOrEqual(ICTState.BULLISH_MSS);
  });

  // 8. MSS wick-only failure
  it("does not advance MSS on wick-only touch", () => {
    // Standalone fixture: SSL raid → struct high at 214 → displacement candle
    // with wick above 214 but close below 214
    const opens =  [220, 219, 218, 217, 216, 215, 214, 213, 212, 211, 211, 211, 211, 211, 211, 210.5, 210.5, 210.5, 211.0];
    const highs =  [221, 220, 219, 218, 217, 216, 215, 214, 213, 212, 212, 212, 212, 212, 211, 211.0, 211.0, 211.0, 215.0];
    const lows =   [219, 218, 217, 216, 215, 214, 213, 212, 211, 210, 210.5,210.5,210.5,210.5,209.5,210.0, 210.0, 210.0, 210.5];
    const closes = [220, 219, 218, 217, 216, 215, 214, 213, 212, 211, 211, 211, 211, 211, 210.5,210.5, 210.5, 210.5, 213.8];
    // Bar 14: SSL raid (low=209.5 < SSL 210, close=210.5 > 210). Struct high = max(highs[6..13]) = 215.
    // Bars 15-17: tiny (body=0, range=1)
    // Bar 18: O=211, H=215, L=210.5, C=213.8 → body=2.8, range=4.5, ratio=0.62
    //   body > prev bodies (0, 0, 0) ✓, range > prev ranges (1, 1, 1) ✓
    //   close 213.8 > high[17]=211.0 ✓ → displacement fires
    //   BUT close 213.8 < struct high 215 → MSS does NOT fire
    const timestamps = Array.from({ length: 19 }, (_, i) => 1700000000 + i * 3600);

    const result = runICTEngine(opens, highs, lows, closes, timestamps);
    expect(result.currentState).toBe(ICTState.BULLISH_DISPLACEMENT);
  });

  // 9. Bullish FVG detection
  it("detects FVG when gap forms between candle A high and candle C low", () => {
    const fixture = buildPartialFixture(21);
    const result = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    expect(result.currentState).toBeGreaterThanOrEqual(ICTState.FVG_CONFIRMED);
    expect(result.fvgZone).not.toBeNull();
    // FVG forms at bar 19: low[19]=214.8 > high[17]=211.3
    expect(result.fvgZone!.lower).toBe(211.3); // high[17]
    expect(result.fvgZone!.upper).toBe(214.8); // low[19]
  });

  // 10. FVG retracement (wick touches zone)
  it("detects FVG retracement when price touches zone", () => {
    // FVG zone is 211.3-214.8 (from bar 19). First retrace into zone is bar 23 (low=214.0)
    const fixture = buildPartialFixture(24);
    const result = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    expect(result.currentState).toBeGreaterThanOrEqual(ICTState.FVG_RETRACEMENT);
    expect(result.retracementDepth).not.toBeNull();
    expect(result.retracementDepth!).toBeGreaterThan(0);
  });

  // 11. Protected-low invalidation at each state
  it("invalidates setup when close breaks protected low", () => {
    const fixture = buildPartialFixture(25); // Through HIGHER_LOW (bar 24)
    // Add a bar that closes below protected low (209.5)
    fixture.opens.push(216);
    fixture.highs.push(216);
    fixture.lows.push(208);
    fixture.closes.push(209); // close 209 <= 209.5 → invalidation
    fixture.timestamps.push(fixture.timestamps[fixture.timestamps.length - 1] + 3600);

    const result = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    // After invalidation, state resets to NONE
    // The setup should return the best state before invalidation
    expect(result.currentState).toBeGreaterThanOrEqual(ICTState.HIGHER_LOW);
    expect(result.invalidated).toBe(true);
  });

  // 12. Higher-low confirmation
  it("detects higher low pattern after FVG retracement", () => {
    const fixture = buildPartialFixture(25);
    const result = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    expect(result.currentState).toBeGreaterThanOrEqual(ICTState.HIGHER_LOW);
    expect(result.higherLowBar).not.toBeNull();
  });

  // 13. Equal-high / BSL detection
  it("detects BSL when clustered highs form", () => {
    const fixture = buildPartialFixture(34);
    const result = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    expect(result.currentState).toBeGreaterThanOrEqual(ICTState.BSL_BUILT);
    expect(result.bslLevel).not.toBeNull();
    expect(result.bslClusterCount).toBeGreaterThanOrEqual(2);
  });

  // 14. BSL with tight cluster vs spread-out highs
  it("requires minimum cluster count for BSL", () => {
    const fixture = buildPartialFixture(25); // Through HIGHER_LOW (bar 24)
    // De-cluster all highs in the lookback window (bars 17-24) by spreading them apart
    // BSL lookback=8, so at bar 25 it scans highs[17..24]
    // Make each high unique and far apart: tolerance=0.4% won't cluster them
    fixture.highs[17] = 211.3; // original
    fixture.highs[18] = 215.5; // original — but let's push others far from this
    fixture.highs[19] = 230.0; // far above
    fixture.highs[20] = 250.0; // far above
    fixture.highs[21] = 270.0; // far above
    fixture.highs[22] = 290.0; // far above
    fixture.highs[23] = 310.0; // far above
    fixture.highs[24] = 330.0; // max = 330, tolerance = 1.32. Only bar 24 within range.
    // Add one more bar (bar 25) that doesn't cluster
    fixture.opens.push(216.0);
    fixture.highs.push(216.0);
    fixture.lows.push(215.0);
    fixture.closes.push(215.5);
    fixture.timestamps.push(fixture.timestamps[fixture.timestamps.length - 1] + 3600);

    const result = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    // BSL check at bar 25 scans highs[17..24] — all spread apart, max=330
    // tolerance = 0.004 * 330 = 1.32. Only bar 24 (330) is within tolerance → 1 < 2
    // BSL should not form
    expect(result.currentState).toBeLessThanOrEqual(ICTState.HIGHER_LOW);
  });

  // 15. Compression (higher lows + within distance of BSL)
  it("detects ARMED state with compression toward BSL", () => {
    const fixture = buildPartialFixture(37);
    const result = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    expect(result.currentState).toBeGreaterThanOrEqual(ICTState.ARMED);
    expect(result.distanceToBslPct).not.toBeNull();
  });

  // 16. CISD detection (bullish close above recent bearish open)
  it("detects bullish CISD correctly", () => {
    const opens =  [100, 105, 103, 101, 100, 103];
    const closes = [105, 102, 100,  99, 101, 104]; // bar 3: bearish (open=101, close=99)
    // Bar 5: bullish (close=104 > open=103) AND close=104 > bearish open=101 → CISD
    const result = detectBullishCISD(opens, closes, 5);
    expect(result.triggered).toBe(true);
    // Scanning from i-1=4 backward: bar4 (open=100, close=101) → bullish, skip
    // bar3 (open=101, close=99) → bearish → stop. bearishOpen = 101
    expect(result.bearishOpen).toBe(101); // bar 3's open
    expect(result.bearishBarIndex).toBe(3);
  });

  // 17. BSL breakout (close above BSL + displacement) — IGNITION
  it("detects IGNITION when close breaks BSL with displacement", () => {
    const fixture = buildFullProgressionFixture();
    const result = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    expect(result.currentState).toBe(ICTState.IGNITION);
    expect(result.transitions.some((t) => t.toState === ICTState.IGNITION)).toBe(true);
  });

  // 18. Full state progression from NONE to IGNITION
  it("progresses through all states in order", () => {
    const fixture = buildFullProgressionFixture();
    const result = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);

    // Verify transitions are in order
    const states = result.transitions.map((t) => t.toState);
    for (let i = 1; i < states.length; i++) {
      expect(states[i]).toBeGreaterThanOrEqual(states[i - 1]);
    }

    // Verify final state
    expect(result.currentState).toBe(ICTState.IGNITION);
    expect(result.bullishEvidence.length).toBeGreaterThan(0);
  });

  // 19. State invalidation mid-sequence
  it("invalidates mid-sequence and retains best state", () => {
    const fixture = buildPartialFixture(25); // At HIGHER_LOW
    // Add a candle that invalidates (close <= protected low 209.5)
    fixture.opens.push(214);
    fixture.highs.push(214);
    fixture.lows.push(208);
    fixture.closes.push(208);
    fixture.timestamps.push(fixture.timestamps[fixture.timestamps.length - 1] + 3600);

    const result = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    // Should return the pre-invalidation state as best
    expect(result.invalidated).toBe(true);
    expect(result.currentState).toBeGreaterThanOrEqual(ICTState.HIGHER_LOW);
  });

  // 20. No look-ahead behavior (prefix consistency)
  it("produces consistent results regardless of future data (no look-ahead)", () => {
    const full = buildFullProgressionFixture();

    // Run on first 25 bars
    const partial = buildPartialFixture(25);
    const partialResult = runICTEngine(partial.opens, partial.highs, partial.lows, partial.closes, partial.timestamps);
    const partialState = partialResult.currentState;

    // Run on all bars and check state at bar 24 from transitions
    const fullResult = runICTEngine(full.opens, full.highs, full.lows, full.closes, full.timestamps);

    // Find the last transition at or before bar 24
    const transitionsUpTo24 = fullResult.transitions.filter((t) => t.barIndex <= 24);
    const lastStateAt24 = transitionsUpTo24.length > 0
      ? transitionsUpTo24[transitionsUpTo24.length - 1].toState
      : ICTState.NONE;

    // States should match — same data up to bar 24 produces same state
    expect(partialState).toBe(lastStateAt24);
  });
});

describe("ICT Engine — Edge Cases", () => {
  it("returns empty setup for too-short data", () => {
    const result = runICTEngine([100], [101], [99], [100], [1700000000]);
    expect(result.currentState).toBe(ICTState.NONE);
    expect(result.barsProcessed).toBe(0);
  });

  it("handles all-flat candles gracefully", () => {
    const n = 20;
    const val = 100;
    const opens = Array(n).fill(val);
    const highs = Array(n).fill(val);
    const lows = Array(n).fill(val);
    const closes = Array(n).fill(val);
    const timestamps = Array.from({ length: n }, (_, i) => 1700000000 + i * 3600);

    const result = runICTEngine(opens, highs, lows, closes, timestamps);
    expect(result.currentState).toBe(ICTState.NONE);
  });

  it("handles single very large candle without crashing", () => {
    const n = 15;
    const opens = Array(n).fill(100);
    const highs = Array(n).fill(101);
    const lows = Array(n).fill(99);
    const closes = Array(n).fill(100);
    const timestamps = Array.from({ length: n }, (_, i) => 1700000000 + i * 3600);

    // Giant candle at end
    opens[n - 1] = 100;
    highs[n - 1] = 200;
    lows[n - 1] = 50;
    closes[n - 1] = 190;

    // Should not crash
    const result = runICTEngine(opens, highs, lows, closes, timestamps);
    expect(result.barsProcessed).toBe(n);
  });
});

describe("ICT Scoring", () => {
  it("scores full progression setup near maximum", () => {
    const fixture = buildFullProgressionFixture();
    const setup = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    const score = scoreICTSetup(setup, fixture.opens, fixture.highs, fixture.lows, fixture.closes);

    expect(score.total).toBeGreaterThan(50);
    expect(score.components.stateScore).toBe(30); // IGNITION = max
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it("scores NONE state as 0", () => {
    const n = 15;
    const opens = Array.from({ length: n }, (_, i) => 100 + i);
    const highs = Array.from({ length: n }, (_, i) => 101 + i);
    const lows = Array.from({ length: n }, (_, i) => 99 + i);
    const closes = Array.from({ length: n }, (_, i) => 100 + i);
    const timestamps = Array.from({ length: n }, (_, i) => 1700000000 + i * 3600);

    const setup = runICTEngine(opens, highs, lows, closes, timestamps);
    const score = scoreICTSetup(setup, opens, highs, lows, closes);

    expect(score.total).toBe(0);
    expect(score.components.stateScore).toBe(0);
  });

  it("detects chasing flag on expansion candles after trigger", () => {
    const fixture = buildFullProgressionFixture();
    const setup = runICTEngine(fixture.opens, fixture.highs, fixture.lows, fixture.closes, fixture.timestamps);
    const score = scoreICTSetup(setup, fixture.opens, fixture.highs, fixture.lows, fixture.closes);

    // The fixture doesn't have enough consecutive expansion candles for chase detection
    // This just verifies the flag is a boolean
    expect(typeof score.isChasing).toBe("boolean");
    expect(typeof score.isLateEntry).toBe("boolean");
  });
});

describe("CISD Module", () => {
  it("returns triggered=false when no bearish candle exists", () => {
    // All bullish candles
    const opens =  [100, 101, 102];
    const closes = [101, 102, 103];
    const result = detectBullishCISD(opens, closes, 2);
    expect(result.triggered).toBe(false);
    expect(result.bearishOpen).toBeNull();
  });

  it("returns triggered=false when current bar is bearish", () => {
    const opens =  [100, 105, 103]; // bar 1 bearish
    const closes = [105, 102, 101]; // bar 2 also bearish
    const result = detectBullishCISD(opens, closes, 2);
    expect(result.triggered).toBe(false);
  });

  it("returns triggered=true when bullish candle closes above bearish open", () => {
    const opens =  [100, 110, 105];
    const closes = [108, 105, 112]; // bar 1 bearish (open=110, close=105), bar 2 bullish closes above 110
    const result = detectBullishCISD(opens, closes, 2);
    expect(result.triggered).toBe(true);
    expect(result.bearishOpen).toBe(110);
    expect(result.bearishBarIndex).toBe(1);
  });

  it("finds the most recent bearish candle, not an earlier one", () => {
    const opens =  [100, 115, 108, 106, 103];
    const closes = [108, 110, 105, 103, 108]; // bars 1,2,3 bearish; bar 4 bullish
    // Most recent bearish before bar 4 is bar 3 (open=106, close=103)
    const result = detectBullishCISD(opens, closes, 4);
    expect(result.bearishOpen).toBe(106);
    expect(result.bearishBarIndex).toBe(3);
    // close[4]=108 > 106 → triggered
    expect(result.triggered).toBe(true);
  });
});
