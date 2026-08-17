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
- **Universe:** SP500 + NDX100 + ADDITIONAL_MEMBERS minus SCAN_EXCLUSIONS (~463 tickers). Built via `buildScanUniverse()` in `src/data/index-tiers.ts`.
- **SCAN_EXCLUSIONS (145 tickers):** Structurally boring stocks (low ATR, secular decline, utility-like). Defined in `src/data/index-tiers.ts`. Review quarterly.
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

9 scanners unified via nightly confluence. **5 count for confluence:** Setup, Inflect, Trans, Inst, Rot. **4 badge-only:** QFE (derived from PreRun), Setup4h (same methodology), INF WATCH (low conviction), VCP (overlaps Setup). **2 separate:** Catalyst (different timeframe), Squeeze (niche).

**Confluence scanners:**
| Scanner | Label | Detects | Key Files |
|---------|-------|---------|-----------|
| PreRun Setup | `Setup` | Breakouts from deep pullbacks (20%+ from ATH) | `scoring.ts`, `data.ts` |
| Inflection | `Inflect` | Accumulation cycle stage transitions | `inflection-scoring.ts` |
| Transition | `Trans` | Market structure transitions (ChoCH, BOS) | `transition-scoring.ts`, `market-structure.ts` |
| Institutional | `Inst` | Large-cap institutional runners ($20B+) | `institutional-scoring.ts` |
| PreRunner | `Rot` | Sector rotation leaders + turnarounds | `src/lib/prerunner/scoring.ts` |

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

**8 scoring components** (weighted, 0-100): SE 10%, Acc 15%, ChCH 15%, BOS 10%, Cmp 10%, HL 10%, RS 10%, VP 20%. Uses N-bar pivots (default 3-bar) for swing detection. RS 7b reads `vcpRelStrengthVsSPY` (benchmark) and 7c reads `rs5dVsSector` (peers) with no cross-fallback. HL scores one higher-low count plus structural risk distance (price to invalidation, in ATR). BOS 4c scores higher-high follow-through.

**Cron:** Fetches 3mo daily chart for OHLC. Skips MARKDOWN state, gate failures, and scores < 25. Supports `?clear=true`. Series under 30 bars are scored with `structure_available = false` and excluded from confluence.

**UI:** Top Picks banner (top 10 TRIGGERED+READY), state distribution bar (clickable filter pills), INF cross-reference badge on overlapping tickers.

### Sector Rotation System
Scores 39 ETFs across 4 categories via Yahoo Finance chart API.

**⚠️ Sector stock lists are load-bearing for scoring.** `sector-rotation.ts` computes **breadth** — 15% of the composite (`COMPOSITE.BASE_WEIGHTS.breadth`) — as the % of a sector's `stocks` trading above their 50d SMA. It reads `sectorDef.stocks` directly with **no quality gating**: every listed symbol votes, including SCAN_EXCLUSIONS members and names that fail `QUALITY_GATES`. Consequences when editing a `stocks` array:
- Breadth is a *percentage*, so list size doesn't dilute it — but **composition shifts it**. Cutting weak names inflates breadth and the composite (survivorship bias); cutting strong names deflates it.
- Tier 1 breadth needs **>= `SCORING_SIGNALS.BREADTH_MIN_CONSTITUENTS` (5) stocks with a resolvable quote + SMA50**. Below that it falls back to PreRun data (Tier 2). If Tier 2 also falls short, a basket that **lists stocks** reports `breadthPct: null` and `computeComposite()` reweights the remaining 5 components (dataQuality drops to 85). The ETF sigmoid proxy (Tier 3) is reserved for genuinely **stock-less** baskets — cross-asset ETFs and the money-flow theme ETFs — because it is derived from the ETF's own price vs SMA20 and would otherwise restate momentum (25% of composite) as breadth (15%).
- Removing a symbol from its **canonical** sector also changes `getSectorForSymbol()`, which buckets the PreRun universe — the ticker falls to "Other".

**Canonical sector is pinned, not positional.** `PRIMARY_SECTOR` in `sector-universe.ts` maps every symbol listed in 2+ baskets to its canonical sector id. `_symbolToSector` honors pins first and falls back to first-wins only for uncontested symbols. This drives the `sector` column on every scanner row, the PreRun/STRAT universe buckets, and the Tier-2 breadth pool. **Any new symbol added to a second basket must be pinned** — `findUnpinnedContested()` returns unpinned overlaps and `sector-universe.test.ts` fails the build if the list is non-empty. 103 symbols currently pinned.

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

## Open Items
- **Preset-resume may be redundant** with ~470 ticker universe fitting in single pass.
- **NDX100 next rebalance:** September 2026 — update `src/data/index-tiers.ts`.
- **ADDITIONAL_MEMBERS:** Review quarterly. Last cleanup 2026-07-11.
