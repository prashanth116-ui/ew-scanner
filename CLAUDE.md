# EW-Scanner Project Instructions

## Overview
Next.js 16 market analysis platform on Vercel + Supabase. Multiple stock scanners (Elliott Wave, Confluence, Catalyst, Squeeze, PreRun), sector rotation (39 ETFs), pre-market trading bias, crypto rotation, automated nightly crons with Telegram alerts.

**Before every commit:** run `npx tsc --noEmit`.

## Architecture

### Universal Quality Gate
All cron scanners share a quality gate — `passesUniverseQualityGates()` in `src/lib/prerun/scoring.ts` holds the thresholds (price, market cap, dollar volume, data quality, ATR%).

**Non-scorer gate:** `loadAllScoredTickers()` in `persistence.ts` — skips tickers never seen in any scanner table during 14-day window. Safety: only activates when `scoredTickers.size > 50`. Applied in PreRun, PreRun 4h, Inflection, Transition, VCP.

**Sector rotation gate** (`applyQualityGates()` in `stock-enrichment.ts`): Stricter thresholds via `QUALITY_GATES` in `config.ts` — price >= $15, mcap >= $10B, dollarVol >= $200M, avgVol >= 1.0M, institutional >= 5%, plus SCAN_EXCLUSIONS filter and null mcap rejection.

**Rotation tracker gate** (`fetchStockPerformance()` in `rotation-tracker.ts`): Lightweight pre-filter before fetching 6mo charts: `price >= MIN_PRICE ($10)`, `dollarVol >= MIN_DOLLAR_VOLUME ($200M)`. Plus SCAN_EXCLUSIONS filtering when collecting stock symbols. Saves chart API calls for low-quality stocks.

Applied in 6 cron routes: PreRun preset/4h, Inflection, Transition, VCP, Institutional. NOT in single-ticker lookups or PreRunner.

### Scan Universe
- **Universe:** SP500 + NDX100 + ADDITIONAL_MEMBERS minus SCAN_EXCLUSIONS minus SCAN_SKIP (~464 tickers). Built via `buildScanUniverse()` in `src/data/index-tiers.ts`.
- **SCAN_EXCLUSIONS (145 tickers):** Structurally boring stocks (low ATR, secular decline, utility-like). Suppressed **everywhere** — scanners *and* the sector-rotation measurement path, so edits move sector breadth (see the Sector Rotation section). Review quarterly.
- **SCAN_SKIP (empty):** Scanner-universe-only exclusions. Read by `buildScanUniverse()` and nothing else — no breadth, enrichment, rotation tracker or sector bucketing. **Use this, not SCAN_EXCLUSIONS, to shrink the scan pool.** Safe because scanner scoring is per-ticker and absolute; removing ticker X cannot change ticker Y's score. The only cross-sectional couplings are the RS percentile in `topStocksToWatch` (needs >= 3 scored PreRun names per sector) and the Tier-2 breadth fallback (needs >= 5). Populate from evidence, not taste.
- **ADDITIONAL_MEMBERS (98 tickers):** Non-index stocks added for momentum/breakout relevance. Exempt from mcap gate — but price >= $10 and dollar volume >= $150M still apply, so sub-gate names sit dormant until they clear. Defined in `src/data/index-tiers.ts`. Last updated 2026-08-15. Review quarterly.
- **Share-class tickers:** Index lists use the dotted form (`BRK.B`, `BF.B`, `MOG.A`); Yahoo only accepts the dashed form. `toYahooSymbol()` in `yahoo-utils.ts` rewrites the outbound request and `fetchBatchQuotes` maps the response back, so internal/persisted symbols stay dotted. Any **new** Yahoo fetch site must call it — a dotted symbol returns an undefined price rather than an error, so it fails silently.
- **NDX100 updated:** Reflects June 22, 2026 rebalance + July 7, 2026 SPCX addition.
- **SP500 updated:** Reflects March 2026 (LITE, SATS) and June 2026 (MRVL, FLEX) additions.

### Preset Cron Details
- **Vercel limit:** 300s maxDuration, 240s time guard for Telegram
- **Batch settings:** BATCH_SIZE=15, BATCH_DELAY=500ms, PERSIST_INTERVAL=50
- **Params:** `?clear=true` (delete today's data), `?resume=true` (skip existing)
- **Telegram:** Always sends summary using full DB data (not in-memory partial)
- **Noise guards:** `finalScore > 0` required for persistence, Leading preset uses `finalScore` not `totalScore`

### Preset Qualification Criteria
| Preset | Key Criteria |
|--------|-------------|
| SNDK | pctFromAth >= 40, shortFloat >= 15, finalScore >= 18, scoreF >= 1 |
| Early Mover | pctFromAth >= 25, finalScore >= 14/16 (daily/4h), M2+L+F all >= 1 |
| Pullback | pctFromAth <= 40, finalScore >= 17/18, F >= 1 + L >= 1 |
| Leading | finalScore >= 18/20, M >= 1, J >= 1, F >= 1, quadrant LEADING/IMPROVING |
| Stealth | finalScore >= 14/15, M2 >= 1, OBV divergent or VP bullish |
| Early+ | **Deprecated** — merged into Stealth |

### Scanner Architecture

10 scanners unified via nightly confluence. **5 count for confluence:** Setup, Inflect, Trans, Inst, Rot. **5 badge-only:** QFE (derived from PreRun), Setup4h (same methodology), INF WATCH (low conviction), VCP (overlaps Setup), ICT (separate price-action methodology). **2 separate:** Catalyst (different timeframe), Squeeze (niche).

**Confluence scanners:**
| Scanner | Label | Detects | Key Files |
|---------|-------|---------|-----------|
| PreRun Setup | `Setup` | Breakouts from deep pullbacks (20%+ from ATH) | `scoring.ts`, `data.ts` |
| Inflection | `Inflect` | Accumulation cycle stage transitions | `inflection-scoring.ts` |
| Transition | `Trans` | Market structure transitions (ChoCH, BOS) | `transition-scoring.ts`, `market-structure.ts` |
| Institutional | `Inst` | Large-cap institutional runners ($20B+) | `institutional-scoring.ts` |
| PreRunner | `Rot` | Sector rotation leaders + turnarounds | `src/lib/prerunner/scoring.ts` |

### Scanner V3 — Leading Inputs + Runner Potential
Both accumulation-stage scanners were rebuilt to remove lagging inputs and add a magnitude dimension. **Intent unchanged:** Inflection still answers WHERE in the accumulation cycle; Transition still answers whether structure has flipped.

**Removed as lagging:** RSI position, EMA21/50 reclaim, higher-low counts, absolute RS levels, institutional ownership % (quarterly 13F, ~45d stale), the Liquidity multiplier (near-inert against a $150M-gated universe).

**Order-flow primitives** (`data.ts`, all from existing OHLCV, no new API calls):
| Field | Meaning | Replaces |
|---|---|---|
| `absorption` | share of down bars with >=1.2x volume and <=0.7x range (Wyckoff effort/result) | RSI in both SE components |
| `closeLocationMean` / `closeLocationFlat` | mean close position in range over 10 bars + flat-price flag | EMA reclaim |
| `pocketPivots` | up days whose volume beat every down day of the prior 10 | accumulation-day count |
| `structuralSpring` | undercut of a real swing low, reclaimed and held (2 = on volume) | `failedBreakdownRecovery`; works below the 50-day |
| `rangeAsymmetry` | mean up-bar range / mean down-bar range over 20 bars | up/down volume ratio |
| `rvolTrajectory` | 5-bar regression slope of relative volume — **existed already**, was QFE-only | nothing |
| `overheadSupply` | % of last year's volume transacted above current price, from the 5y weekly chart | nothing |

**Runner Potential** (`runner-potential.ts`, shared by both engines): overhead supply 30 · ATR% 25 · base energy 20 · float rotation 15 · insider buys 10. Answers *how far can this move*, which neither engine previously asked — two names with identical setup scores but 1.2% vs 4.5% ATR ranked the same. Deliberately **excluded from stage/state classification**: magnitude says nothing about cycle position. Required at >= 50 for `isStrongerSignal` in both engines.

**Component counts:** Inflection 6 → 5 (SE 25 / Demand 25 / Compression 15 / **Runner 25** / RS 10). Transition 8 → 6 (Structure 25 / SE 15 / Demand 20 / Compression 10 / **Runner 20** / RS 10).

**Regime gate** (`regime-gate.ts`): `buildRegimeGate()` maps the macro regime onto a threshold penalty (RISK_OFF +10, INFLATIONARY/MIXED +5, scaled by confidence) applied to `isPrimarySignal`, `isStrongerSignal` and TRIGGERED. **Not a scoring component** — it raises the bar for the alert tiers without changing scores, so backtests compare like with like across regimes. Both crons fetch it once via `fetchMacroRegime()` and report it in the response.

**Shared aggregator:** `score-slot.ts` holds `ScoreSlot` + `nullNeutralScore()`, used by both scorers and Runner Potential.

### Shared Feature Semantics
Fields in `PreRunStockData` that scorers must read carefully:
- **`obvDivergent`** — OBV within 15% of its 20-bar **range** high while price is >10% below its 20-bar high. Normalized by range, not by the cumulative OBV level (that level depends on where the chart series starts and is not comparable across tickers).
- **`rsi14`** — true Wilder RSI(14) on daily; rescaled period on intraday only.
- **`higherLowsCount`** — range is **0-2**, not 0-3 (three swing lows give two pairwise comparisons). A `>= 3` branch is unreachable. `scoreL` in `scoring.ts` still has one, so PreRun criterion L currently caps at 1 — left as-is because widening the window shifts calibrated PreRun/QFE/Institutional thresholds.
- **`recentSwingLow`** — most recent confirmed swing low; the preferred structural stop.
- **null vs false/0** — `failedBreakdownRecovery` is null when price is below the SMA50, and `vpDivergenceBullish` is null when no recent lower low exists. Null means *the pattern does not apply*, and null-neutral scorers exclude the slot; `false`/`0` means real negative evidence. Consumers using `=== true` or `?? 0` are unaffected.

**Known unfixed:** `calcVolumeAccumulation`/`calcMoneyFlowPersistence` define an up day as `close > open` while `calcOBV`/`calcAccumulationDays`/`calcDistributionDays` use `close > prevClose`. `atrRatio5v20` compares the last 5 bars against a 20-bar window that contains them, biasing the ratio toward 1. Both feed calibrated thresholds in PreRun criterion N and Institutional, so changing them shifts other scanners.

**Scanner overlap:** Setup is the core engine (QFE 100% derived from it). VCP partially overlaps Setup criteria N+L. Institutional partially overlaps Setup F+M+J but targets mega-caps ($20B+). Inflection answers WHERE in cycle (stage) vs HOW STRONG (score) — different question from Setup. Transition complements Inflection (structural pivots vs statistical components). Rot is unique (ties stocks to macro rotation). Catalyst has unique timeframe. Squeeze has no overlap (SI%, FTD, float).

### Transition Scanner
**11-state model** (ordered bearish to bullish):

| # | State | Description |
|---|-------|-------------|
| 0 | MARKDOWN | Active downtrend, lower highs + lower lows |
| 1 | SELLING_EXHAUSTION | Down-volume declining, RSI recovering |
| 2 | ACCUMULATION | Range-bound, OBV divergence, volume drying up |
| 3 | DEMAND_INCREASING | Up-volume expanding, higher lows forming |
| 4 | BULLISH_CHOCH | Close above most recent swing high (change of character) |
| 5 | HIGHER_LOW_FORMATION | Higher low confirmed after ChoCH |
| 6 | BULLISH_BOS | Close above preceding swing high (break of structure) |
| 7 | COMPRESSION | Range tightening before expansion |
| 8 | EARLY_EXPANSION | Breakout with volume confirmation |
| 9 | SUSTAINED_MARKUP | Trending higher with healthy pullbacks |
| 10 | EXTENDED | Overextended — caution |

**5 alert states:** WATCH (states 1-3), ARMED (state 4+ with trigger level), READY (within 2 ATR of trigger, **or** a cleared trigger whose break lacked participation), TRIGGERED (cleared trigger + confirmed break + not extended), INVALIDATED (price below invalidation level, or MARKDOWN).

**Trigger level** (`computeTriggerLevel`): the nearest *unbroken* swing high above current price within a 40-bar lookback; if price has cleared every recent pivot, the highest of those cleared pivots. It must be a level price still has to clear — using the most recent swing high made the trigger self-satisfying, since ChoCH is *defined* as a close above that pivot, so every ChoCH read as TRIGGERED.

**Break confirmation** (`evaluateBreakConfirmation`): the break bar must show volume >= 1.3x the 50d average **or** close in the top 40% of its range. Unconfirmed breaks stop at READY.

**Failed breaks:** `ChoCHResult.holding` / `BOSResult.holding` report whether the latest close is still above the broken level. A failed break scores 12/40 instead of 40 in ChoCH 3a / BOS 4a rather than counting the same as a live one.

**Extension guard:** `checkExtensionRisk` (pctFromAth < 5 **or** distEma > 3 ATR) blocks TRIGGERED and `isPrimarySignal`, and is persisted as `extension_risk`. Note this is deliberately broader than the EXTENDED *state* (which requires both) — a risk flag should be conservative, a state should be specific.

**6 scoring components** (V3, weighted to 100): Structure 25%, Supply Exhaustion 15%, Demand Emergence 20%, Compression 10%, **Runner Potential 20%**, RS Trajectory 10%. Uses N-bar pivots (default 3-bar) for swing detection.

**Pre-structure scoring:** when no ChoCH/BOS has printed, the Structure slots are `hasData: false` and its 25% is redistributed proportionally across the remaining components. Previously a stock at the moment of maximum opportunity — supply done, demand emerging, structure about to flip — was charged a zero across 25% of the composite for an event that had not happened yet, and could never rank highly. A **detected-but-failed** break is still scored (ChoCH 12/40, BOS 10/35) because that is real negative evidence. Score answers *how good is the evidence*; state answers *where in the cycle* — a coiled pre-breakout name can score 75 while sitting in ACCUMULATION.

**Cron:** Fetches 3mo daily chart for OHLC. Skips MARKDOWN state, gate failures, and scores < 25. Supports `?clear=true`. Series under 30 bars are scored with `structure_available = false` and excluded from confluence.

**UI:** Top Picks banner (top 10 TRIGGERED+READY), state distribution bar (clickable filter pills), INF cross-reference badge on overlapping tickers.

### ICT Pre-Expansion Scanner
Badge-only scanner (`Setup`-independent) at `/prerun/ict-daily`, cron `/api/ict/cron/daily` 02:35 UTC Tue-Sat. Pure OHLC state machine — no MA, RSI, OBV, ATR or volume anywhere in it. Files: `src/lib/ict/{engine,scoring,multi-tf,cisd,data,aggregate,config,types}.ts`.

**Bullish only.** There is no bearish mirror — no buy-side raid, bearish MSS or sell-side draw. In a downtrend it keeps emitting long setups and says nothing about the other side. Stated on the page header, the guide and `config.ts`.

**11-state ladder** (strictly ordered; one candle may satisfy several rungs):
SSL raid -> structure high -> displacement -> MSS -> FVG -> retrace -> higher low -> BSL built -> armed -> trigger (CISD) -> ignition.

| Construct | Rule |
|---|---|
| SSL raid | Sweep + reclaim of a level holding >= `SSL.MIN_CLUSTER_COUNT` (2) roughly equal lows. A pool, not a rolling 10-bar minimum |
| FVG | 3-candle gap whose **middle candle** clears `FVG.MIN_LEG_BODY_RATIO` — an imbalance matters because displacement left it |
| Higher low | Pivot-confirmed low above the protected low, reclaimed next bar. **Trails the protected low** to that level |
| BSL | Nearest **unbroken** pivot-high cluster **above price** in a 40-bar window; falls back to the highest cleared pivot with `unbroken: false` |
| CISD | Close above the open of the **first candle of the contiguous bearish run**, not the last lone down bar |

**Invalidation** is two-sided: a close at/below the protected low, **and** a close below the FVG floor (an inverted gap is resistance). On a break the engine resets and keeps hunting — it always reports the **live** state and carries the earlier break as `prior_invalidation_*`. It never returns a dead high-water setup.

**Dealing range** = raid low to the running high. Drives premium/discount and the OTE band (0.62-0.79). This is a different scale from FVG retracement depth: a setup can be mid-gap and still in premium.

**Score (100 pts, 10 components):** State 12 · Displacement 14 · Entry (P/D + OTE) 14 · FVG 10 · BSL 10 · Compression 10 · Retrace depth 8 · Coherence 8 · Invalidation 8 · Recency 6. State is deliberately a minority — every other component is already gated on reaching a state, so a tall state weight charges twice and collapses `score` into `state_order`. Invalidation distance is a **band** (1.5-5% ideal), not a ramp: precision is the edge. Coherence and recency budgets are **per-timeframe** (`BAR_BUDGETS`).

**Timeframes: 1h, 4h, 1d, 1wk** in two families — intraday (1h/4h, one shared chart) and swing (1d/1wk). Confluence blends the best member of **each family once** plus a bonus per additional armed family, so one chart cannot be counted three times. 8h/12h were removed: a 6.5h RTH session cannot form either candle.

**Aggregation:** `aggregateSessions()` in `aggregate.ts`, **not** the shared `aggregate4hOHLC`. That helper groups by index from the series start (buckets straddle days) and drops the trailing partial group. Both are fine for the calibrated PreRun 4h scanner it serves and neither is acceptable here, so this is a separate function rather than a change to that one.

**HTF bias** (`computeHTFBias`): ALIGNED (a swing TF past MSS) / NEUTRAL (raided, not flipped) / COUNTER (no bullish structure on either). Applied as a **gate on `is_tradeable` and the nightly badge, never as a score adjustment** — same treatment the regime gate gets in Inflection/Transition, so scores stay comparable across regimes.

**Cron:** one `fetchBatchQuotes(universe)` up front supplies `company_name` and a sub-$10 price pre-gate (saves 3 chart calls per rejected name). Persists state order >= 3 and score >= 15. 14-day retention, `?clear=true`.

**Not in confluence.** ICT is one of the badge-only scanners (`NON_CONFLUENCE` in the nightly summary) — it is a separate methodology, not a fifth confirming vote.

**`src/lib/ict/scored/`** is a second, complete implementation imported by nothing. It grades each ingredient independently rather than laddering. Left in place; it is dead code and will drift.

### Sector Rotation System
Scores 39 ETFs across 4 categories via Yahoo Finance chart API.

**⚠️ Sector stock lists are load-bearing for scoring.** `sector-rotation.ts` computes **breadth** — 15% of the composite (`COMPOSITE.BASE_WEIGHTS.breadth`) — as the % of a sector's `stocks` trading above their 50d SMA. Names that fail `QUALITY_GATES` still vote; those gates apply in enrichment, not breadth. **SCAN_EXCLUSIONS members do not vote**, and the path is indirect: `sector-rotation.ts:134-136` filters the set out of the batch-quote fetch, and Tier-1 breadth resolves each listed member through those same batch quotes (`:244-247`), so an excluded symbol has no quote and drops out of `quotesInSector`. 100 of the 594 sector symbols are currently excluded this way. **Adding a name to SCAN_EXCLUSIONS therefore shifts breadth** — use SCAN_SKIP instead when the intent is only to stop scanning. Consequences when editing a `stocks` array:
- Breadth is a *percentage*, so list size doesn't dilute it — but **composition shifts it**. Cutting weak names inflates breadth and the composite (survivorship bias); cutting strong names deflates it.
- Tier 1 breadth needs **>= `SCORING_SIGNALS.BREADTH_MIN_CONSTITUENTS` (5) stocks with a resolvable quote + SMA50**. Below that it falls back to PreRun data (Tier 2). If Tier 2 also falls short, a basket that **lists stocks** reports `breadthPct: null` and `computeComposite()` reweights the remaining 5 components (dataQuality drops to 85). The ETF sigmoid proxy (Tier 3) is reserved for genuinely **stock-less** baskets — cross-asset ETFs and the money-flow theme ETFs — because it is derived from the ETF's own price vs SMA20 and would otherwise restate momentum (25% of composite) as breadth (15%).
- Removing a symbol from its **canonical** sector also changes `getSectorForSymbol()`, which buckets the PreRun universe — the ticker falls to "Other".

**Canonical sector is pinned, not positional.** `PRIMARY_SECTOR` in `sector-universe.ts` maps every symbol listed in 2+ baskets to its canonical sector id. `_symbolToSector` honors pins first and falls back to first-wins only for uncontested symbols. This drives the `sector` column on every scanner row, the PreRun/STRAT universe buckets, and the Tier-2 breadth pool. **Any new symbol added to a second basket must be pinned** — `findUnpinnedContested()` returns unpinned overlaps and `sector-universe.test.ts` fails the build if the list is non-empty. 103 symbols currently pinned.

**Multi-listed symbols emit one enrichment row per basket.** 105 of the 594 sector symbols sit in 2+ baskets (86 in two, 16 in three, 3 in four), and the `stockInputs` loop in `sector-rotation.ts` iterates listed members, not canonical owners — so ORCL is enriched three times (IGV / XLK / AIQ), each row carrying that basket's quadrant, composite, acceleration and stealth. That is deliberate: 5 of the 6.5 `scoreConviction()` weights plus the P4 penalty are basket-dependent, so ORCL-as-software and ORCL-as-AI are genuinely different reads, and `/sectors/picks` groups by `sectorEtf` to show them side by side. **Breadth is unaffected** — it is a per-basket percentage, so overlap is not double-counting.

The hazard is symbol-keyed consumers. `enrichStocks()` sorts HIGH → MEDIUM → WATCH before returning, so a bare `map.set()` loop over `passed` kept the *weakest* read of a multi-listed symbol. `EnrichedStock.isCanonicalSector` (set from `getSectorForSymbol()`) marks the one row matching the `PRIMARY_SECTOR` pin; `buildEnrichedMap()`, the daily-briefing top-5, `/rotation` and the two daily pages filter on it. **Absent/undefined means canonical** — crypto dedupes upstream via `seenTokens`, and pre-flag snapshots must not filter to empty. Do **not** apply the filter in the producer loop: `artificial-intelligence` owns 7 of its 57 listed names and `space-defense-innovation` owns 0, so canonical-only enrichment would empty the sub-sector picks. Guarded by `canonical-row.test.ts`.

**Thin baskets:** UFO carries 4 members after the 2026-08-08 micro-cap trim, so it reports null breadth by design; reaching the minimum would mean re-adding the trimmed names. ARKX (8), KRE (6) clear it. Sub-sector baskets mostly do not own their members canonically (ARKX owns 0, AIQ owns 7 of 57) — that is fine for Tier 1, which counts listed members regardless of ownership, but it empties their Tier-2 pool.
- To trim safely, remove above-SMA and below-SMA names in the sector's current breadth ratio and re-verify breadth is unchanged. Last trim 2026-08-15: 88 symbols removed across GICS sectors, verified 0 breadth drift in all 22 sectors. Sub-sector baskets (AIQ, ITA, ARKX...) are hand-curated and excluded from mechanical trimming.

**ETF Universe (39 total):**
| Category | Count | Examples |
|----------|-------|---------|
| GICS Sectors | 14 | XLK, XLF, XLE, XLV, XLI, XLY, XLP, XLU, XLB, XLRE, XLC, SMH, IGV, XBI |
| Sub-Sectors | 16 | KRE, XHB, XRT, IYT, ITA, ARKX, UFO, AIQ, DRAM, EUV, CIBR, WGMI, DTCR, BOTZ, NLR, QTUM |
| Cross-Asset | 5 | GLD, TLT, HYG, EEM, UUP |
| Leadership Baskets | 4 | MAGS, QQQ, IWM, ARKK |

**Money-flow theme ETFs (added 2026-08-15):** DRAM, EUV, CIBR, WGMI, DTCR, BOTZ, NLR, QTUM are **ETF-only** (`stocks: []`) — scored for RS/RRG/composite/acceleration but excluded from sector picks and rotation × scanner confluence via `getSectorsWithStocks()`. BOTZ overlaps AIQ and EUV overlaps SMH/DRAM by design.

**Pipeline:** Fetch 1y OHLCV → RS vs SPY → RRG quadrant → composite (0-100) → acceleration/momentum/stealth → regime alignment. Acceleration: fixed-range normalization ([-10, 10]). Momentum weights: 63d=0.35, 126d=0.25, 189d=0.25, 252d=0.15.

**Centralized Config:** All thresholds in `src/lib/sector-rotation/config.ts`. Sections: REGIME, COMPOSITE, ROTATION, QUALITY_GATES, CONVICTION, LEADERSHIP, RISK_FLAGS, POSTURE, SMART_MONEY, TOP_STOCK_WEIGHTS, CLASSIFICATION, SCORING_SIGNALS, ROTATION_LIFECYCLE, ROTATION_CONVICTION, SUB_SECTOR, CRYPTO_QUALITY_GATES, EXTENSION_TIERS, PRERUNNER, CRYPTO_WEIGHTS, PREMARKET_SCORING. **Never hardcode thresholds** — always add to config.ts and import.

### Pre-Market Trading Bias Engine
Inputs: ES=F, NQ=F, YM=F, RTY=F, VIX, sector breadth.

**Classification (`classifyBias`):** magnitude gate (< 0.08% → Neutral) → unanimous check → magnitude-weighted majority (1.5x ratio) → count-based override (3+ agree) → even-split tiebreaker (±0.15%) → fallback to checklist score.

**`sign()` threshold:** Futures with |changePct| < 0.1% = "flat". **Alignment reasons:** `buildReasons()` annotates which futures are below threshold, e.g., "2 of 4 equity futures aligned bullish (ES below threshold)".

**Asset-to-avoid (`pickBestWorst`):** Median-deviation — futures contract deviating most from group median flagged as avoid (min 0.15pp deviation). **Conflict guard:** if `assetToAvoid` matches `bestToTrade.symbol`, `assetToAvoid` is cleared.

**Best-to-trade:** When bias is Neutral/Flat, no trade recommended (`bestToTrade: null`). When bullish, picks futures with highest changePct for long. When bearish, picks most negative for short.

**Outputs:** `TradingBias` object with bias, confidence (0-100), preferredDirection (Long/Short/Flat), leading/weakest asset, bestToTrade/assetToAvoid, dayType, VIX interpretation, playbook text, reasons array.

**9 AM Snapshot** (`/sectors/brief`): Shows persisted prediction + live bias (2-min refresh). Divergence badges: Reversed (red), Faded (amber), Shifted (amber), Adjusted (gray). Snapshot futures filtered to equity only (ES/NQ/YM/RTY).

**Backtesting:** Daily briefing cron backfills previous day's open-to-close returns, evaluates `bias_correct`, purges > 90 days.

### Crypto Rotation
Mirrors equity sector rotation for crypto. Adapted quality gates from `CRYPTO_QUALITY_GATES` in config (lower thresholds, `MAX_EXTENSION_PCT: 200`). Reuses equity classification/conviction. Null mcap rejection aligned with equity.

**Canonical basket is pinned**, same as equity. `CRYPTO_PRIMARY_SECTOR` in `crypto-sector-universe.ts` maps each of the 9 tokens listed in 2+ of the 10 baskets to its canonical id; `findUnpinnedContestedCrypto()` plus `crypto-sector-universe.test.ts` fail the build on an unpinned overlap. Tie-break, in order: **(1) a basket's proxy token — its `etf` — is pinned to that basket**, since benchmarking a basket against a token scored elsewhere is incoherent; (2) otherwise the narrative that drives the price. Unlike equity, crypto emits **one row per token** — `crypto-rotation.ts` skips non-canonical baskets outright, so `isCanonicalSector` is always true there and there is no per-basket picks view to preserve.

## Patterns & Conventions

### Centralized Config Pattern
All sector rotation thresholds in `src/lib/sector-rotation/config.ts`. **Never hardcode thresholds** — add to config.ts and import.

### Stock Enrichment
**Phase classification** (`classifyPhase()` in `stock-enrichment.ts`):
- P2_TURNAROUND: pctFrom50ma in [-5%, 3%] AND rsAccel > 0.5 AND volRatio >= 1.2 (checked first — most specific)
- P1_BASING: below 50MA AND rsAccel > 0
- P3_TRENDING: above 50MA AND pctFrom50ma > 3% AND rsAccel >= 0 AND volRatio >= 0.7
- P4_EXHAUSTING: above 50MA AND rsAccel < -2.0 AND sectorAccel < -3 (dual gate required — single negative metric doesn't trigger)

**Fallback (above 50MA):** rsAccel AND sectorAccel both deeply negative → P4, rsAccel >= 0 + volRatio >= 0.7 → P3, else → P2 (not P1 — can't be "basing" above 50MA). **Fallback (below 50MA):** always P1_BASING.

The `rsAccel` metric (`pctFrom50 - pctFrom200`) is naturally deeply negative for healthy uptrends, so P4 requires BOTH metrics deeply negative.

**Conviction** (`scoreConviction()`): 6 weighted signals plus phase penalty.

| Signal | Weight | Condition | Type |
|--------|--------|-----------|------|
| sectorQuadrant | 1.5 | IMPROVING or LEADING | Structural |
| sectorComposite | 1.5 | >= 70 | Structural |
| stockCategory | 1.0 | TURNAROUND or LEADER | Structural |
| rsAccel | 1.0 | >= 3.0 | Tactical |
| sectorStealth | 1.0 | stealth + (volRatio >= 0.8 or TURNAROUND/LEADER) | Structural |
| volumeRatio | 0.5 | >= 1.2 | Tactical |

P4 penalty: -1.5. Tiers: HIGH >= 4.0, MEDIUM >= 2.5, WATCH < 2.5.

**Category:** LEADER (above 50MA + outperforms sector + vol >= 1.0x), CATCH_UP (above 50MA fallback), TURNAROUND (below 50MA + rsAccel > 0.5 + vol >= 1.0x, or rsAccel > 1.0 alone), AVOID (below 50MA, no turnaround signal).

**Null-data tracking:** `marketCap` null rejected when `REJECT_NULL_MARKET_CAP: true`. When `institutionalPct` or `ret20d` are null, corresponding gates are bypassed (don't reject on missing data) but tracked via `dataWarnings: string[]` on `EnrichedStock`.

### Cross-Page Phase Classification
Three pages classify phases using different above-50MA metrics (intentional design tradeoff):
- `/sectors` dashboard: `sectorRS` (stock vs sector ETF), single-metric gate
- `/sectors/picks` enrichment: `rsAccel` with dual gate (rsAccel AND sectorAccel both deeply negative)
- `/rotation` tracker: `rsAcceleration` (stock vs sector ETF, 5d vs 20d)

Dashboard card conviction (0-11 additive) differs from enrichment conviction (6 weighted signals) — intentionally different systems for different contexts.

**Known differences (by design):**
- `sectorRS = -3` but `sectorAccel > -3` → "exhausting" on dashboard but NOT P4 in enrichment (dual gate fails). Dashboard is quick-glance; enrichment is rigorous.
- Dashboard conviction (0-11 additive) vs enrichment conviction (6 weighted signals) — intentionally different systems.
- Both `sectorRS` and `rs20d` null → dashboard defaults to "neutral" (correct for insufficient data).
- Below-50MA: `rsAccel` used consistently across all pages — meaningful in this context.

### Persistence Functions (per table)
5 standard functions: `upsert*()`, `purgeOld*()`, `load*()`, `load*Dates()`, `load*Multi()`.

### Cron Route Pattern
CRON_SECRET auth via Bearer token, batched scanning with time guard, incremental persist, purge old data, full DB read for final counts. Individual crons do NOT send Telegram — consolidated via nightly summary.

### Daily Page Pattern
Client component, date tabs, sortable table, filters, streak badges, score delta, dropped section, sector pills, CSV export, copy watchlist. Use `fmtNum` from `@/lib/daily-format`, wrap tables in `TableErrorBoundary`.

### Audit Standard
When asked for audit, check: (1) functional correctness, (2) code quality/resilience, (3) content flow, (4) user flow, (5) task flow, (6) screen flow, (7) navigation flow, (8) state flow, (9) UX consistency, (10) data accuracy, (11) edge cases.

### Regime Sector Alignment
`isRegimeAligned()` in `rotation-helpers.ts` maps sector display names to GICS parent via `REGIME_SECTOR_DISPLAY_MAP`. Regime's `favoredSectors`/`avoidSectors` use GICS parent names.

**Sub-sector mappings:**

| GICS Parent | Mapped Sub-Sectors |
|---|---|
| Technology | Semiconductors, Software & Cloud, AI & Robotics, Memory, Lithography & Photonics, Cybersecurity, Robotics, Quantum |
| Health Care | Biotech |
| Consumer Discretionary | Homebuilders, Retail |
| Financials | Regional Banks, HPC & Bitcoin Miners |
| Industrials | Transports, Aerospace & Defense, Space & Defense Innovation |
| Energy | Nuclear |
| Real Estate | Data Centers |

**Intentionally unmapped:** Cross-asset and leadership baskets return "neutral" — regime opinions are equity-sector focused.

### Scanner Backtesting
- **`GET /api/backtest/scanner?engine=inflection|transition&days=14&minScore=N`** — evaluates **persisted daily rows** against forward returns. No lookahead: scores are read, not recomputed. Groups by state, alert state, score bucket and signal flags, with each bucket's edge measured against the whole-cohort average. Window is bounded by the 14-day table purge, which the response reports.
- **`POST /api/backtest/inflection`** — re-scores history from live data. Reaches further back, but quote/fundamental fields are as-of-now, so Institutional Participation (15% of the composite) carries lookahead. The response says so.
- **Calibrate after, not before.** Any change to a shared feature field shifts every score distribution, so re-tune `classifyStage`/`classifyState` thresholds only once the inputs are settled.

### Focus List
`src/data/focus-list.ts` — separates **the names you scan** (~464) from **the names you trade** (109). The universe stays wide so the scanners can still notice a name *entering* the tradeable set; the noise is filtered at the output, where a rejected name is one query away instead of gone.

**One hand-owned list. `FOCUS_LIST` + `isFocusTicker()`, nothing else** — no scoring, no override sets, no precedence. Membership *is* the answer. Add a ticker to see it, delete it to stop. Isomorphic (no `server-only`) so pages and the nightly Telegram read the same list.

**Seeded 2026-08-18** by measuring a 1y daily history for all 302 scanned members of the technology, semiconductor, software, health care, financial, consumer-discretionary, AI, aerospace, defense and space baskets, screening on **ATR% >= 3.0 · avg dollar volume >= $300M/day · price >= $15**. 154 cleared it; the seed took the top of each sector by tradeability (ATR% x log10 dollar volume), **capped per sector** — an uncapped global rank comes back ~60% semis, which defeats a rotation-driven system. **No momentum term:** a list that reads recent performance needs rebuilding every regime turn and drops exactly the names that are basing before they run.

Why ATR% is the discriminator: below ~3% a 3-5 day swing does not clear its own slippage — which is what most SCAN_EXCLUSIONS comments ("ATR% ~1.0%") are really saying. The $300M bar is ~2x the universe gate; raising it further selects for mega-cap, not tradeability, and starves every sector except semis and software.

**32 hand-additions on 2026-08-18** put back the large-cap core the ATR%-weighted cap had squeezed out (semis AVGO/TSM/ASML/QCOM/TXN/ADI; software CRWD/PANW/SNOW/ADBE/CRM/INTU/MDB/ZS/OKTA; consumer BKNG/ABNB/DASH/MELI/EBAY/LULU). A further 10 came from baskets the seed never drew from — communication services (APP/RDDT/RBLX/SPOT), the datacenter-buildout industrials (FIX/PWR), CEG (same AI-power trade as VST/NRG but filed under utilities), MNST/CELH, and CRCL — plus SPCX, which had been dropped by a 60-bar history minimum despite carrying the second-heaviest dollar volume in the universe. Several sectors now exceed the generator caps and five sectors exist that the script does not generate — expected, since the cap governs what the script *proposes*, not what the list holds. **`CRCL` is in no sector basket**, so it reports as "Other" on scanner rows.

`node scripts/measure-focus-candidates.mjs` re-measures and prints a fresh block. Treat it as a suggestion to diff against — the list is hand-owned, not generated. The inline ATR%/volume comments record why each name qualified; they are not live.

**Tests** (`focus-list.test.ts`) guard the failure mode that matters: every focus ticker must be in `buildScanUniverse()`. Adding a ticker to the focus list does **not** add it to the universe — an unreachable name sits there looking active while being structurally invisible.

**Wired into:**
- **Nightly Telegram** — `★ FOCUS` section at the top carries the only full two-line blocks (ticker, RS, sector, tier, runner score, scanner labels). Tiers 5/4/3 collapse to one line of names each, `★` marking focus members and `*` marking new. Tiers 2/1 stay counts. A focus name always appears in full above, so collapsing never hides one.
- **`/prerun/inflection-daily`, `/prerun/transition-daily`** — Focus toggle beside High Conviction.

Note the **second Telegram message** (`DETAIL_CAP`, per-scanner breakdowns, sent separately at route.ts:969) was left untouched — it is still full-length.

### Component Slot Breakdown
`inflection_daily.component_slots` / `transition_daily.component_slots` (JSONB, migration 027) carry the per-slot parts behind each component score, keyed by component:

```
{"demand":[{"label":"pocket_pivots","earned":0,"possible":24,"hasData":true,"pct":0},
           {"label":"rvol_trajectory","earned":12,"possible":16,"hasData":true,"pct":75}]}
```

**Why:** a component score cannot be attributed. "demand_score = 20" does not say whether volume was flat, whether there were no pocket pivots, or whether OBV could not be measured — and those lead to different decisions. V2 exposed `accum_score` and `volume_score` separately; V3 merged them into `demand_score` and lost the granularity, despite computing strictly more slots than V2 did (six for demand alone against V2's two).

**No scoring change.** The slots always existed and were summed before persisting; this names and stores them. `slot-breakdown.test.ts` asserts the slots reproduce the component score they explain.

`ScoreSlot.label` is **required**, so the compiler proves all 70 slots are named — an unnamed slot persists an unattributable number. `hasData` is kept rather than collapsed to zero: "measured, and the answer is no" must stay distinct from "could not measure", or downstream consumers reintroduce the bug `nullNeutralScore` prevents. **Labels are schema** — renaming one breaks saved queries.

### Catalyst Tags
`catalyst_tags` (migration 028) holds hand-entered dated events — readouts, earnings, court rulings — that no price scanner can see. MRNA is the motivating case: flat at $63 for a week with five scanners on it, then +117% on 9.5x volume from a clinical readout.

- **Never purged.** Scan rows are derived and reproducible; these are typed by hand and often entered weeks ahead, beyond the 14-day window.
- **Free-text `event_type`**, not an enum — the catalysts that matter are the ones nobody anticipated a category for.
- **Auth required on read and write.** An open POST would let anyone write rows that appear in the nightly Telegram; a tracked catalyst is a trading intention, not public information.
- **UI:** `/catalysts`. Badge component `catalyst-badge.tsx`; date arithmetic shared with the server via `lib/catalyst-date.ts` so Telegram and the page can never disagree by a day.
- **Alert behaviour:** see `src/app/api/CLAUDE.md` — a catalyst within 5 days promotes a focus name past the tier gate.

## Open Items
- **Preset-resume may be redundant** with ~470 ticker universe fitting in single pass.
- **NDX100 next rebalance:** September 2026 — update `src/data/index-tiers.ts`.
- **ADDITIONAL_MEMBERS:** Review quarterly. Last cleanup 2026-07-11.
