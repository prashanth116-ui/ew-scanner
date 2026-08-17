# QFE ICT thinkScript — v2.0

thinkScript projection of the ICT pre-expansion engine in `src/lib/ict/`.

| File | Use |
|---|---|
| `qfe-ict-scanner-v2.tos` | Stock Hacker scan filter |
| `qfe-ict-study-v2.tos` | Chart study — same engine, plus levels, arrows, transition bubbles, diagnostic labels |

Pure price action. No moving average, VWAP, ATR, RSI, MACD, ADX, TSI, Bollinger, Stochastic, or volume anywhere in either file.

---

## Why v2.0 is a rewrite and not a patch

`src/lib/ict/engine.ts` is a 12-state sequential machine: it walks candles in order, freezes levels at the bar that created them, and hard-resets when price closes through the protected low.

TOS v1.3 tried to reconstruct that same sequence after the fact by comparing event *ages* obtained from `GetMaxValueOffset`. That function returns the **most recent** occurrence of an event — and MSS, FVG, and pullback all re-fire constantly inside a base. A single green bar closing above a tight base's 8-bar high reset `mssAge` to ~0 and broke `pullbackAge < mssAge`, silently dropping the setup exactly as it matured.

v2.0 carries state in `rec` variables, one stage at a time, mirroring the engine. Every v1.3 sequencing bug disappears structurally rather than being patched.

The chain is deliberately anchored on `protectedLow` (NaN = flat, non-NaN = live setup). That makes every downstream stage expressible from already-declared variables, which is what keeps a twelve-stage machine declarable in a single pass without a circular `rec` reference.

---

## Parity with `src/lib/ict/`

| Concept | `engine.ts` | TOS v1.3 | TOS v2.0 |
|---|---|---|---|
| Sequencing | sequential state machine | age comparisons | state machine ✅ |
| Structure high | frozen at the raid bar | rolling `Highest(high[1],8)` on current bar | frozen ✅ |
| Invalidation | `close <= protectedLow` → reset | none | ✅ |
| BSL | max high over 8 bars **+ ≥2 equal highs within 0.4%** | max high over 30 bars, no cluster | ✅ engine |
| ARMED distance | ≤ 3.0% below BSL | runway 0.25 – 15% | 3.0% ✅ |
| Trigger | CISD (close > last bearish open) | absent | ✅ |
| FVG | zone stored, retracement + depth measured | existence only | ✅ |
| Higher low | anchored to `protectedLow` | unanchored local swing low | ✅ |

### Two deliberate deviations — read these

**1. The v1.3 "post-displacement base" block is gone.**
`engine.ts` has no equivalent. It expresses compression as the ARMED condition instead: consecutive higher lows, high still below BSL, close within 3% of it. That is stricter and better-anchored than v1.3's base test — which, separately, was broken (`rangeContracted` compared a 4-bar max against a 6-bar max, so it passed on window width rather than on actual contraction).

**2. `minCloseLocation` (0.70) exists only in thinkScript.**
`checkDisplacement()` in `engine.ts` does not test where the candle closed within its range. This is the one place TOS is stricter than the backend, so the two will disagree.

Pick one:
- Add the check to `checkDisplacement()` — recommended, it is a sound ICT filter (a displacement candle should close near its high), or
- Set `minCloseLocation = 0.0` in both `.tos` files for exact parity.

### Timeframes

`TIMEFRAMES` in `src/lib/ict/config.ts` lists `8h` and `12h`. thinkorswim has no 8H or 12H aggregation — only 1H / 2H / 4H / DAY / WEEK. Those two timeframes are backend-only and have no TOS counterpart. Correct the v1.3 header claim wherever it is repeated.

---

## Open bug in the production scanner

`runICTEngine` returns the furthest state reached before invalidation, flagged `invalidated: true`. That flag is then dropped:

- `ICTDailyRecord` (`src/lib/ict/types.ts`) has no `invalidated` field.
- `src/app/api/ict/cron/daily/route.ts:138` filters on `bestState >= 3 && bestScore >= 15` only.
- `invalidated` appears nowhere in `src/app/api/ict/**` or `src/app/prerun/ict-daily/**`.

So a stock that reached ARMED and then closed through its protected low is persisted and displayed as a live armed candidate, indistinguishable from a valid one. TOS v2.0 does not have this problem — invalidation resets `state` to 0 — which means **the scanner and the daily page will disagree until this is fixed**, and the scanner will be the correct one.

Fix: add `invalidated` to `ICTDailyRecord` and either exclude invalidated setups at `route.ts:138` or surface them as a distinct state on the daily page.

---

## Validation

Load `qfe-ict-study-v2.tos` on a chart before trusting any scan output. The `waiting:` label names the stage a live setup is blocked on, so a name that fails to appear can be diagnosed instead of guessed at.

Acceptance cases from the original v1.3 header:

| Ticker | Bar | Expected |
|---|---|---|
| CRWV | before the vertical expansion | `ARMED` (9) |
| CRWV | the expansion candle | `IGNITION` (11), first bar |
| U | after expansion | `IGNITION` (11), not first bar → scans as LATE |

Compare hit counts against v1.3 with care: v2.0 removes false negatives on mature bases *and* removes false positives from the biased contraction test. Net count may look similar while composition changes almost entirely. Judge by pulling charts, not by the result count.

---

## Tuning order

Do not touch parameters until the state machine is validated on charts. When you do, the ones that matter most:

| Input | Default | Source |
|---|---|---|
| `bslLookback` | 8 | `BSL.LOOKBACK` — v1.3 used 30, a large behavioral change |
| `maxDistanceToBslPct` | 3.0 | `ARMED.MAX_DISTANCE_PCT` — replaces the 0.25–15% runway band |
| `bslMinCluster` | 2 | `BSL.MIN_CLUSTER_COUNT` — raise to 3 for stricter liquidity pools |
| `minCloseLocation` | 0.70 | TOS-only, see parity note above |

Change these in `src/lib/ict/config.ts` and both `.tos` files together, or the two sides drift.
