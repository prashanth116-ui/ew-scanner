# EW-Scanner Project Instructions

## Overview
Next.js 16 market analysis platform deployed on Vercel with Supabase backend. Features multiple stock scanners (Elliott Wave, Confluence, Catalyst, Squeeze, PreRun), sector rotation tracking with 31 ETFs, pre-market trading bias engine, crypto rotation, and automated nightly cron jobs with Telegram alerts.

## Key Commands
```bash
npx tsc --noEmit          # TypeScript check (run before every commit)
npm run dev               # Local dev server
npm run test              # Vitest tests
npm run build             # Production build
```

## Architecture

### Stack
- **Framework:** Next.js 16.2.3 + React 19 + TypeScript
- **Database:** Supabase (PostgreSQL) via `@supabase/supabase-js`
- **Hosting:** Vercel (serverless functions, 300s maxDuration)
- **Alerts:** Telegram bot integration (`src/lib/ew-wave/telegram.ts`)
- **Payments:** Stripe subscriptions
- **Path alias:** `@/*` maps to `./src/*`

### Directory Layout
| Directory | Purpose |
|-----------|---------|
| `src/app/` | Next.js App Router pages + API routes |
| `src/lib/` | Shared logic — scanners, scoring, persistence |
| `src/lib/ew-wave/` | Elliott Wave scanner — types, scoring, wave counting, fibonacci, momentum, volume, alerts, telegram |
| `src/lib/squeeze/` | Squeeze scanner — scoring, data fetching, FTD, options, storage, watchlists |
| `src/lib/earnings/` | Earnings — calendar fetching, data utils, export |
| `src/lib/wave-scanner/` | Wave scanner (phase 2) — wave detection, scanner modes, watchlists, saved scans |
| `src/lib/hooks/` | React hooks — collapsible sections, debounce, filter persistence, sidebar state |
| `src/lib/prerun/` | PreRun scanner — scoring, data fetching, presets |
| `src/lib/sector-rotation/` | Sector rotation — scoring, regime, config, rotation tracking, stock enrichment |
| `src/lib/premarket/` | Pre-market — futures fetching, trading bias, scoring |
| `src/lib/crypto-rotation/` | Crypto rotation — scoring, regime, token enrichment |
| `src/lib/catalyst/` | Catalyst scanner — data, calendar, scoring |
| `src/lib/supabase/` | Supabase client + persistence functions |
| `src/data/` | Universe definitions (ticker lists, index tiers) |
| `src/components/` | React components |
| `supabase/migrations/` | SQL migration files (001-020) |

### Database Tables (Key)
| Table | Cron | Purpose |
|-------|------|---------|
| `prerun_daily` | `/api/prerun/cron/preset` | 5-preset daily scan (SNDK, Early Mover, Pullback, Leading, Stealth). Early+ deprecated (merged into Stealth). |
| `prerun_4h_daily` | `/api/prerun/cron/preset-4h` | 4h-candle variant of prerun_daily (same presets, barMultiplier=6) |
| `inflection_daily` | `/api/inflection/cron/daily` | Inflection point daily scan |
| `vcp_daily` | `/api/vcp/cron/daily` | VCP pattern daily scan |
| `institutional_daily` | `/api/institutional/cron/daily` | Institutional flow daily scan |
| `transition_daily` | `/api/transition/cron/daily` | Market structure transition daily scan |
| `scanner_signals` | various | Cross-scanner signal persistence |
| `sector_snapshots` | `/api/sector-rotation/alert` | Sector rotation quadrants |
| `trading_bias_daily` | `/api/daily-briefing/cron` | Daily trading bias predictions + next-day futures outcome backfill (90-day retention) |

### Cron Schedule (16 jobs)
| UTC | ET | Days | Route | Notes |
|-----|-----|------|-------|-------|
| 00:00 | 8:00 PM | Tue-Sat | `/api/discovery/cron` | Trending ticker discovery (CoinGecko + Yahoo) |
| 22:00 | 6:00 PM | Mon-Fri | `/api/sector-rotation/alert` | Sector quadrant transition + rotation tracker change alerts |
| 01:15 | 9:15 PM | Tue-Sat | `/api/catalyst/cron` | AI catalyst/spike detection |
| 01:45 | 9:45 PM | Tue-Sat | `/api/inflection/cron/daily` | Inflection scan |
| 01:55 | 9:55 PM | Tue-Sat | `/api/transition/cron/daily` | Transition scan (market structure) |
| 02:00 | 10:00 PM | Tue-Sat | `/api/prerun/cron/preset` | Preset scan (~605 tickers, single pass) |
| 02:06 | 10:06 PM | Tue-Sat | `/api/prerun/cron/preset-resume` | Preset resume (if needed for stragglers) |
| 02:12 | 10:12 PM | Tue-Sat | `/api/prerun/cron/preset-4h` | 4h-candle preset scan (same universe) |
| 02:15 | 10:15 PM | Tue-Sat | `/api/vcp/cron/daily` | VCP scan |
| 02:30 | 10:30 PM | Tue-Sat | `/api/institutional/cron/daily` | Institutional scan |
| 02:45 | 10:45 PM | Tue-Sat | `/api/qfe/cron/backfill` | QFE forward return backfill |
| 02:50 | 10:50 PM | Tue-Sat | `/api/prerunner/cron/daily` | Rotation leaders/turnarounds radar |
| 03:00 | 11:00 PM | Tue-Sat | `/api/nightly-summary/cron` | Consolidated nightly scan summary |
| 03:02 | 11:02 PM | Tue-Sat | `/api/sector-rotation/confluence` | Rotation × Scanner confluence (fresh scanner data) |
| 13:00 | 9:00 AM | Mon-Fri | `/api/daily-briefing/cron` | Pre-trade 4-level briefing + direction + bias logging + outcome backfill |
| 06:00 Sun | 2:00 AM Sun | Sunday | `/api/sector-rotation/institutional-refresh` | Weekly institutional data refresh |

### Universal Quality Gate
All cron scanners and the sector rotation stock enrichment share a universal quality gate that filters low-quality stocks before scoring. Applied after data fetch but before any scoring logic runs.

**Scanner gate** (`passesUniverseQualityGates()` in `src/lib/prerun/scoring.ts`):
| Check | Threshold | Field |
|-------|-----------|-------|
| Price | >= $10 | `currentPrice` |
| Price | <= $1000 (except Semiconductors) | `currentPrice` |
| Market cap | >= $10B (exempt: ADDITIONAL_MEMBERS) | `marketCap` |
| Dollar volume | >= $150M/day | `vcpAvgDollarVolume` (50d avg) |
| Data quality | >= 40% | `dataQuality` (% of API calls that succeeded) |
| Max ATR% 60d | >= 1.5% | `maxAtrPct60d` (max ATR(14)/close over ~60 trading days) |

**Persistent non-scorer gate** (applied BEFORE `fetchPreRunData` in cron routes):
Loads all distinct tickers from 7 scanner tables (`loadAllScoredTickers()` in `persistence.ts`). If a ticker has never appeared in any scanner result during the 14-day retention window, it is skipped entirely (no API call). Safety: only activates when `scoredTickers.size > 50` (prevents empty-DB edge case from filtering everything). Applied in 5 cron routes: PreRun preset, PreRun 4h, Inflection, Transition, VCP.

**Sector rotation gate** (`applyQualityGates()` in `src/lib/sector-rotation/stock-enrichment.ts`):
Thresholds via `QUALITY_GATES` in `config.ts`: `MIN_PRICE: 15`, `MAX_PRICE: 1000 (except Semiconductors)`, `MIN_MARKET_CAP: 10B`, `MIN_DOLLAR_VOLUME: 200M`, `MIN_AVG_VOLUME: 1.0M`, `MIN_INSTITUTIONAL_PCT: 5` (low: ADRs report artificially low institutional % via Yahoo), `MAX_VOLUME_SPIKE: 10` (breakout-day volume allowed), `MAX_ETF_DEVIATION: 60` (sector leaders can diverge from ETF). Plus existing gates (extension, trend). Additional gates: `APPLY_SCAN_EXCLUSIONS: true` rejects the 145 SCAN_EXCLUSIONS tickers before any other gate check; `REJECT_NULL_MARKET_CAP: true` fails stocks with null market cap (aligns with PreRun treating null as 0). SCAN_EXCLUSIONS also applied upstream in `sector-rotation.ts` (pre-filters batch quote list) and `rotation-tracker.ts` (filters stock symbols before chart fetches).

**Rotation tracker gate** (`fetchStockPerformance()` in `src/lib/sector-rotation/rotation-tracker.ts`):
Lightweight pre-filter before fetching 6mo charts: `price >= MIN_PRICE ($10)`, `dollarVol >= MIN_DOLLAR_VOLUME ($200M)`. Plus SCAN_EXCLUSIONS filtering when collecting stock symbols. Saves chart API calls for low-quality stocks.

**Applied in 6 cron routes:** PreRun preset, PreRun 4h, Inflection, Transition, VCP, Institutional. NOT applied to single-ticker API routes (explicit user lookups) or PreRunner (uses `computePreRunnerRadar()`).

### Preset Cron Details
- **Universe:** SP500 + NDX100 + ADDITIONAL_MEMBERS minus SCAN_EXCLUSIONS (~470 unique tickers). Built via `buildScanUniverse()` in `index-tiers.ts`.
- **SCAN_EXCLUSIONS (145 tickers):** Structurally boring stocks excluded from scanning — ultra-low ATR%, secular decline, or utility-like behavior. Defined in `src/data/index-tiers.ts`. Sectors: Industrials (21: ROL, RSG, WM, CHRW, SWK, MMM, TXT, AOS, ALLE, PNR, NDSN, DOV, EXPD, ITW, OTIS, ROK, SNA, UPS, WAB, XYL, JBHT); Financials (19: BEN, IVZ, GL, CINF, AIZ, L, NTRS, PFG, STT, KEY, RF, AFL, AIG, ALL, MET, PRU, TFC, USB, CBOE); Consumer Disc (11: F, GM, GPC, HAS, RL, MAS, TGT, LVS, APTV, NKE, PHM); Health Care (13: JNJ, PFE, BAX, VTRS, HSIC, CVS, DVA, BDX, CAH, DGX, HUM, MDT, SOLV); Consumer Staples (18: ADM, BF.B, CAG, CHD, CL, CLX, GIS, HRL, KHC, KMB, MKC, MO, SJM, TAP, TSN, KVUE, SYY, BG); Utilities (22: AEE, AEP, ATO, AWK, CMS, CNP, D, DTE, DUK, ED, EIX, ES, ETR, EVRG, FE, LNT, NI, PEG, PNW, PPL, SO, WEC); Real Estate (20: ARE, AVB, BXP, CPT, DOC, EQR, ESS, EXR, FRT, HST, INVH, KIM, MAA, O, PSA, REG, UDR, VICI, VTR, WY); Materials (6: AMCR, AVY, IFF, IP, LYB, BALL); Energy (3: APA, HAL, KMI); Comms (5: FOXA, NWS, NWSA, T, VZ); Technology (7: HPE, HPQ, NTAP, AKAM, GEN, JKHY, QRVO). Review quarterly.
- **SP400 dropped:** Removed from all scan universes. Notable SP400 stocks rescued to ADDITIONAL_MEMBERS.
- **NDX100 updated:** Reflects May 18, 2026 LITE/CSGP swap + June 22, 2026 quarterly rebalance (added ALAB, ALNY, CRWV, NBIS, RKLB, TER; removed CHTR, CTSH, VRSK, ZS) + July 7, 2026 SPCX addition
- **SP500 updated:** Reflects March 23, 2026 additions (LITE, SATS) and June 2026 additions (MRVL, FLEX)
- **Universal quality gate:** Filters ~100+ stocks before scoring (price < $10, mcap < $10B, dollarVol < $150M, dataQuality < 40%, maxAtrPct60d < 1.5%)
- **Non-scorer gate:** Skips tickers never seen in any scanner table (saves API calls). Loaded once at cron start via `loadAllScoredTickers()`.
- **Vercel limit:** 300s maxDuration, 240s time guard for Telegram
- **Single-pass system:** ~470 tickers typically fits in one pass. Resume pass available if needed.
- **4h scanner:** May still need 2 passes (larger Yahoo 2y:1h chart responses slow each ticker)
- **Batch settings:** BATCH_SIZE=15, BATCH_DELAY=500ms, PERSIST_INTERVAL=50
- **Params:** `?clear=true` (delete today's data before scan), `?resume=true` (skip existing tickers)
- **Telegram:** Always sends summary using full DB data (not in-memory partial)
- **Noise guards:** `finalScore > 0` required for persistence, Leading preset uses `finalScore` not `totalScore`

### ADDITIONAL_MEMBERS (100 curated tickers)
Non-index stocks added to the scan universe for momentum/breakout relevance. Defined in `src/data/index-tiers.ts`. Tier 2 for `getTickerTier()`. **Exempt from mcap quality gate** in `passesUniverseQualityGates()` — hand-curated stocks skip the $10B mcap check (other gates still apply). Last updated 2026-08-08.

| Category | Tickers |
|----------|---------|
| Tech / Software / Cloud | TSM, SNOW, NET, MDB, HUBS, IOT, CYBR, MNDY, PSTG, TWLO, OKTA, NTNX, GTLB, S, ESTC, TOST, ZS, TTAN |
| Consumer / E-commerce | SHOP, SPOT, RBLX, DKNG, ONON, CAVA, CPNG, SE, CHWY |
| Fintech / Payments / Crypto | NU, XYZ, SOFI, AFRM, CRCL |
| Social / Media | PINS, SNAP, RDDT, ZG, ROKU, ZM |
| Healthcare / Biotech / AI Medicine | NVO, NTRA, HALO, INSM, BMRN, VKTX, SRPT, TEM |
| Industrials / Defense / Aerospace | HEI, BAH, ASTS |
| Energy / Materials | CCJ, SCCO, ENPH, AA |
| Large ADRs | SAP, GSK, BHP, RIO, BABA, JD, LI, BIDU |
| Recent IPOs / High Momentum | MDLN, VIK, QNT, IONQ |
| Notable ex-SP400 | MANH, DUOL, RBRK, MDGL, WING, CROX, DKS, ETSY, MOD, POWL, IESC, FND, NBIX, UTHR, CYTK, LNTH, ITCI, THC, SFM, GLOB, CART |
| Other | MTCH |
| High Momentum / Speculative | SHAK, UPST, MARA, CLSK, PLNT, QS, RH, LCID, LMND, WOLF, LUNR, SEDG, PLUG |

### Preset Qualification Criteria
| Preset | Key Criteria |
|--------|-------------|
| SNDK | pctFromAth >= 40 *(stale 2-6d)*, shortFloat >= 15 *(stale 14-35d FINRA)*, finalScore >= 18, scoreF >= 1 *(fresh EOD)* |
| Early Mover | pctFromAth >= 25 *(stale 2-6d)*, finalScore >= 14 (daily) / >= 16 (4h), M2+L+F all >= 1 *(fresh EOD)* |
| Pullback | pctFromAth <= 40 *(stale 2-6d)*, finalScore >= 17 (daily) / >= 18 (4h), F >= 1 + L >= 1 *(both fresh EOD)* — M2 intentionally excluded (late signal) |
| Leading | finalScore >= 18 (daily) / >= 20 (4h), M >= 1, J >= 1, F >= 1 *(fresh EOD)*, quadrant LEADING or IMPROVING *(stale up to 24h)* — UI toggle for score 20+ filter |
| Stealth | finalScore >= 14 (daily) / >= 15 (4h), M2 >= 1, OBV divergent or VP bullish *(all fresh EOD)* |
| Early+ | **Deprecated** — merged into Stealth (was 100% redundant). DB flag kept for schema compat. |

### Scoring Engines
| Engine | Function | Scale | Used By |
|--------|----------|-------|---------|
| Standard PreRun | `autoScorePreRun()` | 0-40 raw, 3 gates | Setup daily + 4h, QFE input |
| Inflection | `scoreInflection()` | 6 components, weighted 0-100 | Inflection daily |
| VCP | `scoreVCP()` | 5 components, max 100 | VCP daily |
| Institutional | `scoreInstitutionalAcceleration()` | 4 weighted components, max 100 | Institutional daily |
| PreRunner | `scoreLeader()` / `scoreTurnaround()` | 6 weighted components + bonuses, 0-100 | Rotation leaders/turnarounds |
| QFE | `computeQFE()` | 4 components, weighted 0-100 | QFE rating (derived from PreRun) |
| Catalyst | `scoreCatalyst()` | 17 factors, normalized 0-100 | Catalyst spikes |
| Transition | `scoreTransitionWithOHLC()` | 8 components, weighted 0-100 | Transition daily |
| Squeeze | `calculateSqueezeScore()` | 7 components, max 100 | Squeeze setups |

All scoring functions are in `src/lib/prerun/` and use `fetchPreRunData()` from `src/lib/prerun/data.ts`.

### Scanner Architecture & Value Map

9 scanning engines, unified via nightly confluence. 5 count for confluence, 4 are badge-only. All scanners share a universal quality gate (`passesUniverseQualityGates()`) that filters stocks before scoring: price >= $10, price <= $1000 (except Semiconductors), mcap >= $10B (exempt: ADDITIONAL_MEMBERS), dollarVol >= $150M/day, dataQuality >= 40%, maxAtrPct60d >= 1.5%.

**Confluence scanners (5):**

| Scanner | Label | Detects | Gates | Output | Key Files |
|---------|-------|---------|-------|--------|-----------|
| PreRun Setup | `Setup` | Base breakouts from deep pullbacks (20%+ from ATH) | G1: pctFromAth >= 20% (10% for 4h), G2: no existential risk, G3: price > 92% SMA20 | 18 criteria A-Q+M2 (max 40), verdicts PRIORITY/KEEP/WATCH/DISCARD, 5 presets (Early+ deprecated) | `scoring.ts`, `data.ts` |
| Inflection | `Inflect` | Accumulation cycle stage transitions (seller exhaustion → expansion) | Price >= $5, dollarVol >= $10M, mcap >= $500M | 6 components (SE/VC/BE/RS/LA/IP) weighted 0-100, stages + trade read (AVOID/WATCH/STARTER/ADD_ON) | `inflection-scoring.ts` |
| Transition | `Trans` | Market structure transitions (accumulation → markup) | Price >= $5, dollarVol >= $10M, mcap >= $500M | 8 components weighted 0-100, 11-state model, alert states (TRIGGERED/READY/ARMED/WATCH) | `transition-scoring.ts`, `market-structure.ts` |
| Institutional | `Inst` | Large-cap institutional runners with momentum | Price >= $20, mcap >= $20B, dollarVol >= $100M, vol >= 1.5M | 4 weighted components (inst 35%/exec 25%/risk 25%/disc 15%), 12 classifications | `institutional-scoring.ts` |
| PreRunner | `Rot` | Sector rotation leaders + turnaround candidates | Min score >= 55 | LEADERs (6 components: RS/sector/volume/conviction/momentum/regime) + TURNAROUNDs (6 components: RS/lifecycle/volume/sector/momentum/regime), blended sector scoring, RS-aware conviction. No hard conviction gate — composite score (MIN_SCORE 55) handles filtering instead of double-gating on conviction level. | `src/lib/prerunner/scoring.ts` |

**Badge-only (not counted for confluence):**

| Scanner | Label | Detects | Why Badge-Only |
|---------|-------|---------|----------------|
| QFE | `QFE` | Quality-Factor-Entry rating (A+ → D) + Buy/Wait/Avoid actions | 100% derived from PreRun data, no new information |
| PreRun 4h | `Setup4h` | Same as Setup but on 4h candles (barMultiplier=6, Gate1=10%) | Same scoring methodology as Setup, different timeframe |
| Inflection WATCH | `INF_WATCH` | Inflection WATCH trade reads | Low conviction signal |
| VCP | `VCP` | Volatility contraction patterns before breakouts | Significant overlap with Setup criteria N (range coil) + L (higher lows) |

**Other scanners (not in nightly confluence):**

| Scanner | Detects | Key Scoring | Notes |
|---------|---------|-------------|-------|
| Catalyst | Near-term event-driven spikes (earnings, analyst, peer sympathy) | 17 factors normalized 0-100, verdicts PRE_SPIKE/WATCH/MONITOR/AVOID | Separate Telegram section, different timeframe from all others |
| Squeeze | Short squeeze setups (high SI, low float, FTD, volume surge) | 7 components max 100, tiers HIGH/MEDIUM/LOW | Niche — only for squeeze traders |

**Redundancy & overlap assessment:**

| Scanner | Unique Value | Overlaps With |
|---------|-------------|---------------|
| Setup (Daily) | Core engine, backbone of system | Foundation for QFE |
| Setup (4h) | Earlier momentum detection | Daily Setup (complementary) |
| Inflection | Classifies WHERE in accumulation cycle (stage) vs HOW STRONG (score) | Shares some inputs with Setup (OBV, VP, HL, EMA) but answers a different question |
| VCP | Tight contraction + entry/stop/targets + strict SMA gates | Partially covered by Setup criteria N (range coil) + L (higher lows) |
| Institutional | Mega-cap focus ($20B+), 12 classifications, AVOID detection, entry triggers | Partially covered by Setup criteria F (volume) + M (EMA) + J (RS) |
| Rot | Only scanner tying stocks to macro rotation signals | Unique pipeline — upstream from sector rotation engine |
| QFE | Rating wrapper — no new data | 100% derived from PreRun, candidate for removal |
| Catalyst | Only scanner for short-term catalysts | Unique timeframe and inputs |
| Squeeze | Pure squeeze mechanics (SI%, FTD, float, DTC) | No overlap, niche use case |
| Transition | Market structure state machine (ChoCH, BOS, swing pivots) | Complements Inflection — structural confirmation (pivots) vs statistical (component scores) |

### Transition Scanner
Detects market structure transitions from accumulation into early markup using swing pivot analysis, Change of Character (ChoCH), and Break of Structure (BOS). Counted for confluence (structural complement to Inflection's statistical approach).

**11-state model** (ordered from bearish to bullish):

| # | State | Description |
|---|-------|-------------|
| 0 | MARKDOWN | Active downtrend, lower highs + lower lows |
| 1 | SELLING_EXHAUSTION | Down-volume declining, RSI recovering, candle bodies shrinking |
| 2 | ACCUMULATION | Range-bound, OBV divergence, volume drying up |
| 3 | DEMAND_INCREASING | Up-volume expanding, higher lows forming |
| 4 | BULLISH_CHOCH | Price closes above most recent swing high (change of character) |
| 5 | HIGHER_LOW_FORMATION | Higher low confirmed after ChoCH |
| 6 | BULLISH_BOS | Price closes above preceding swing high (break of structure) |
| 7 | COMPRESSION | Range tightening before expansion |
| 8 | EARLY_EXPANSION | Breakout with volume confirmation |
| 9 | SUSTAINED_MARKUP | Trending higher with healthy pullbacks |
| 10 | EXTENDED | Overextended — caution |

**5 alert states:** WATCH (states 1-3), ARMED (state 4+ with trigger level), READY (within 2 ATR of trigger), TRIGGERED (crosses trigger with volume), INVALIDATED (breaks below invalidation)

**8 scoring components** (weighted, 0-100 scale):

| Component | Weight | Measures |
|-----------|--------|----------|
| Seller Exhaustion (SE) | 10% | Down-volume decline, RSI recovery |
| Accumulation Quality (Acc) | 15% | OBV divergence, volume dry-up |
| ChoCH Confirmation (ChCH) | 15% | Close above swing high |
| BOS Confirmation (BOS) | 10% | Break above preceding swing high |
| Compression Quality (Cmp) | 10% | Range tightening |
| Higher Low Quality (HL) | 10% | Higher low formation strength |
| RS Trajectory (RS) | 10% | Relative strength trend |
| Volume Profile (VP) | 20% | Volume confirmation quality |

**Market structure detection:** Uses N-bar pivots (default 3-bar) to identify swing highs/lows. ChoCH requires downtrend context (lower highs) then close above most recent swing high. BOS requires higher low confirmed then close above preceding swing high.

**Key files:**

| File | Purpose |
|------|---------|
| `src/lib/prerun/market-structure.ts` | Swing detection, ChoCH/BOS detection, trigger/invalidation levels |
| `src/lib/prerun/transition-scoring.ts` | 8-component scoring, state classification, alert state logic |
| `src/lib/prerun/types.ts` | `TransitionState`, `TransitionAlertState`, `TransitionScores`, `TransitionResult` types |
| `src/app/api/transition/cron/daily/route.ts` | Cron route (01:55 UTC, BATCH_SIZE=15, BATCH_DELAY=500ms) |
| `src/app/api/transition/daily/route.ts` | Read API (?date=, ?dates=true) |
| `src/app/prerun/transition-daily/page.tsx` | UI page with Top Picks banner, state distribution, INF cross-reference |
| `supabase/migrations/019_transition_daily.sql` | DB table with 8 component scores, state, alert_state, trigger/invalidation |

**Cron details:**
- Uses same universe as other scanners (~470 tickers)
- Fetches 3mo daily chart separately via `fetchYahooChart()` for OHLC data
- Calls `scoreTransitionWithOHLC()` with raw highs/lows/closes + 3-bar pivot
- Skips MARKDOWN state and gate failures before persisting
- BATCH_SIZE=15, BATCH_DELAY=500ms, PERSIST_INTERVAL=50
- Supports `?clear=true` to wipe today's records before scanning (prevents stale data from previous runs)

**UI features:**
- Top Picks banner: top 10 TRIGGERED + READY cards with click-to-scroll
- State distribution bar: clickable state filter pills with counts
- INF cross-reference badge: fetches inflection data in parallel, shows INF badge on overlapping tickers with hover tooltip showing inflection trade read + score

### Sector Rotation System
Real-time sector rotation analysis scoring 31 ETFs across 4 categories via Yahoo Finance v8 chart API.

**ETF Universe (31 total):**
| Category | Count | Examples |
|----------|-------|---------|
| GICS Sectors | 14 | XLK, XLF, XLE, XLV, XLI, XLY, XLP, XLU, XLB, XLRE, XLC, SMH, IGV, XBI |
| Sub-Sectors | 8 | KRE, XHB, XRT, IYT, ITA, ARKX, UFO, AIQ |
| Cross-Asset | 5 | GLD, TLT, HYG, EEM, UUP |
| Leadership Baskets | 4 | MAGS, QQQ, IWM, ARKK |

**Scoring pipeline:** For each ETF: fetch 1y daily OHLCV → compute RS vs SPY → RRG quadrant (LEADING/IMPROVING/WEAKENING/LAGGING) → composite score (0-100) → acceleration, momentum, stealth detection → regime alignment. Acceleration uses fixed-range normalization (clamped to `COMPOSITE.ACCEL_NORM_FLOOR` / `ACCEL_NORM_CEILING`, default [-10, 10]) instead of min-max, preventing inflation during broad deterioration. Momentum composite weights are graduated (`SCORING_SIGNALS.MOMENTUM_WEIGHTS`: 63d=0.35, 126d=0.25, 189d=0.25, 252d=0.15). Stock enrichment applies universal quality gates (price >= $15, mcap >= $10B, dollarVol >= $200M, avgVol >= 1.0M, institutional >= 5%) plus sector-specific gates (volume spike, extension, trend, correlation), SCAN_EXCLUSIONS filtering, and null market cap rejection. Remaining null gate bypasses (institutional/ret20d) are tracked via `dataWarnings` on `EnrichedStock`.

**Centralized Config:** All thresholds live in `src/lib/sector-rotation/config.ts`. Sections: REGIME, COMPOSITE, ROTATION, QUALITY_GATES, CONVICTION, LEADERSHIP, RISK_FLAGS, POSTURE, SMART_MONEY, TOP_STOCK_WEIGHTS, CLASSIFICATION, SCORING_SIGNALS, ROTATION_LIFECYCLE, ROTATION_CONVICTION, SUB_SECTOR, CRYPTO_QUALITY_GATES, EXTENSION_TIERS, PRERUNNER, CRYPTO_WEIGHTS, PREMARKET_SCORING, POLICY_PULSE. **Never hardcode thresholds** — always add to config.ts and import.

**Key files:**
| File | Purpose |
|------|---------|
| `src/lib/sector-rotation/config.ts` | All thresholds and scoring breakpoints |
| `src/lib/sector-rotation/sector-rotation.ts` | Main scoring engine — `calculateSectorRotation()` |
| `src/lib/sector-rotation/stock-enrichment.ts` | Stock quality gates, classification (LEADER/CATCH_UP/TURNAROUND/AVOID), phase (P1-P4), conviction scoring, null-data warnings |
| `src/lib/sector-rotation/rotation-tracker.ts` | Active rotation detection — inflection-point detector + slow-burn detector, quadrant guard, rolling volume trend, config-driven SMA periods/batch sizes/cap, stock quality gates (price, dollarVol, SCAN_EXCLUSIONS) |
| `src/lib/sector-rotation/rotation-helpers.ts` | Lifecycle stage (health override for long-duration rotations, soft exhaustion zone), conviction level (trailing 5-day window signal trend), action signals, regime alignment. `REGIME_SECTOR_DISPLAY_MAP` maps all GICS parents to sub-sector display names (e.g., Technology → Semiconductors, Software & Cloud, AI & Robotics). Cross-asset/leadership sectors intentionally unmapped (return "neutral"). `signalHistory` typed as optional to match `?? []` usage. All lifecycle constants imported from config (no local duplicates). |
| `src/lib/sector-rotation/regime.ts` | Macro regime classification (RISK_ON/OFF/INFLATIONARY/MIXED) with adaptive VIX bounds. All regimes have favored/avoid sectors (MIXED favors Health Care, Financials). |
| `src/lib/sector-rotation/brief.ts` | Market posture (AGGRESSIVE/SELECTIVE/DEFENSIVE/CASH), sector tiers, risk flags. `computeMarketPosture()` and `computeRiskFlags()` accept optional pre-computed `LeadershipHealth` to avoid duplicate computation. SELECTIVE posture reasoning handles 3 cases: rotations-only, sectors-only, and both qualifying. |
| `src/lib/sector-rotation/leadership-health.ts` | Leadership Health Score (0-100) from MAGS/QQQ/IWM/ARKK |
| `src/lib/sector-rotation/math.ts` | Momentum scoring, RS ratios (Mansfield with `isFinite` guard), RRG trail (lookback margin 20), CMF, OBV slope |
| `src/lib/sector-rotation/types.ts` | Core types: `SectorRotationScore`, `EnrichedStock`, `SectorRotationResult` |
| `src/lib/sector-rotation/rotation-types.ts` | Rotation tracker types: `RotationEvent` (signalHistory optional), `ActiveRotationDetail` |
| `src/lib/sector-rotation/sub-sector-constants.ts` | Sub-sector → parent GICS mapping, divergence threshold |
| `src/data/sector-universe.ts` | ETF definitions, category assignments, constituent stocks |

**UI Pages:**
| Route | File | Purpose |
|-------|------|---------|
| `/sectors` | `src/app/sectors/page.tsx` | Dashboard: RRG chart (tooltip 155px), sector cards (stable sort by conviction → rsAccel → ticker, correct verdict strings KEEP/PRIORITY, WATCH subcase why text). Tabbed asset panel (Leadership / Sub-Sectors / Cross-Asset in single `TabbedAssetPanel`). Summary strip: improving / stable / declining counts + dispersion/spread interpretation labels + rotation summary tooltip. Section "3. Reference — Analysis Tools". `DEFAULT_COLLAPSED`: `["asset-panels", "correlation", "cross-pairs", "sector-comparison", "sector-history"]`. Rotation status folded into Summary Strip (no separate panel). All sort modes have alphabetical tiebreakers. Rotation tracker polls with visibilitychange listener. |
| `/sectors/brief` | `src/app/sectors/brief/page.tsx` | Daily Brief: posture (position 1), trading bias with embedded pulse data (`PulseCompactRow` — futures/VIX/DXY/sub-sector pills inside `TradingBiasCard`), leadership health (computed once, shared with posture + riskFlags), simplified sector tiers (ETF-level only, no stock columns, "See stocks →" link to picks), risk flags. No standalone Pre-Market Pulse or Sub-Sector Divergences panels (removed — pulse merged into bias card, divergences redundant with tier table badges). Stale snapshot guard: ignores previous snapshots older than 3 days. All date comparisons use ET timezone (not UTC). |
| `/sectors/picks` | `src/app/sectors/picks/page.tsx` | Stock picks (9 filters incl. AVOID category, null-safe SMA50) + Rotation Signals panel (early detection timing, L/T badges, cross-section filtering via `onSectorClick`) + INF/TRANS cross-reference badges. Cross-filter: clicking sector in Entry Signals sets `crossFilterSector` on StockPicksPanel with "Showing: {sector}" badge. Scan refresh UI (progress bar, cancel) in StockPicksPanel via `scanActions` prop. No separate Top Picks by Sector, PreRunner Radar, or Sector Details panels (consolidated). Dashboard link at bottom. |
| `/sectors/crypto` | `src/app/sectors/crypto/page.tsx` | Crypto rotation dashboard |
| `/rotation` | `src/app/rotation/page.tsx` | Active rotation tracker with stock performance tables. Collapsible panels: Recently Ended, 12-Month Timeline, Pattern Statistics (collapsed by default via `useCollapsedPanels`). Compact regime pill (inline, not full `RegimeBanner`). "Stock Picks →" cross-link in header. Phase classification (`getRotationStockPhase`): turnaround uses `isTurnaroundCandidate` flag, below-50MA uses `trendAccel` (meaningful there), above-50MA uses `rsAcceleration` (stock vs sector ETF) instead of `trendAccel` (pctFrom50 - pctFrom200 is naturally negative for uptrends). Sparkline uses average-per-bin downsampling (50 max points). Exit warnings require non-overlapping 3-day windows (min 6 history entries for short path, 10 for full 5v5). StrategySummaryBar uses `sortOrder`-based stock classification (not label strings). Historical projection shows "—" when avg return is 0%. |

**API Routes:**
| Route | Purpose |
|-------|---------|
| `/api/sector-rotation` | Main data endpoint — returns all 31 ETF scores, leadership baskets, regime |
| `/api/sector-rotation/alert` | Sector quadrant transitions + rotation tracker change alerts (2 Telegram messages) |
| `/api/premarket` | Pre-market futures, internals, trading bias, sector checklist |

### Sector Rotation Alert Cron
The `/api/sector-rotation/alert` cron (22:00 UTC weekdays) sends up to 2 Telegram messages to `TELEGRAM_CHAT_ID_SECTOR`:

**Message 1 — Quadrant Transitions:** Detects when sectors change RRG quadrant (e.g., LAGGING → IMPROVING). Uses `detectTransitions()` comparing current vs previous `SectorRotationResult`. Grouped by category: Rotation Starting, Breakout Confirmed, Momentum Fading, Rotation Out.

**Message 2 — Rotation Tracker Changes:** Detects changes in the rotation tracker's active rotations. Uses `calculateRotationTracker()` + `detectRotationChanges()` comparing current vs previous `RotationSnapshot[]`. Compressed format: Focus tier shows scanner-confirmed stocks as single lines + non-confirmed as compact ticker lists; Monitor tier shows tickers only. Scanner badges on stocks use last night's scanner data (supplementary context — lifecycle changes are the primary signal).

**Message 3 — Rotation × Scanner Confluence:** Moved to `/api/sector-rotation/confluence` cron at 03:02 UTC (11:02 PM ET) to use fresh scanner data. See "Rotation × Scanner Confluence Cron" section below.

**Change types detected (Message 2):**

| Type | Condition | Actionability |
|------|-----------|---------------|
| `new_rotation` | sectorId in current but not in previous | High — position early |
| `rotation_ended` | sectorId in previous but not in current | Medium — exit/reduce |
| `lifecycle_upgrade` | Lifecycle stage improved (e.g., EARLY → MATURING) | Medium — add on confirmation |
| `lifecycle_warning` | Lifecycle stage worsened (e.g., MATURING → LATE) | High — tighten stops |

**Lifecycle ordering:** EARLY (0) → MATURING (1) → LATE (2) → EXHAUSTING (3). Current < previous = upgrade, current > previous = warning.

**State persistence:** `PreviousState` includes optional `rotations?: RotationSnapshot[]` field (backward-compatible). Persisted via 3-tier system: module cache → Vercel KV → env var (`sector-rotation:previous` KV key). `confluenceTickers` field vestigial in this route — confluence state managed by the confluence cron via separate `sector-rotation:confluence-tickers` KV key. Each `RotationSnapshot` stores `sectorId`, `sectorName`, `etf`, `lifecycle`, `conviction`, `daysActive`, `startDate`.

**Stock selection pipeline (per-rotation top 15):** For each active rotation, stocks are filtered then classified into 4 categories. Categories are mutually exclusive (earlier category takes priority). Per-category cap of 8, combined cap of 15 per rotation.

| Category | Emoji | Filter | Sort | Notes |
|----------|-------|--------|------|-------|
| Turnaround | 🔄 | `isTurnaroundCandidate && volumeConsistency >= 2` | rsDelta DESC | Below SMA50, curated flag, sustained volume |
| Inflection | 🎯 | `!turnaround && rsDelta > 0 && volumeConsistency >= 1 && rsAcceleration > 0` | rsDelta DESC | RS accelerating with some volume |
| Leading | ⭐ | `!turnaround && !inflection && aboveSma50 && rsAcceleration > 0 && volumeConsistency >= 1` | rsDelta DESC | Above SMA50, positive RS |
| Momentum | ⚡ | `!any_above && aboveSma50 && performancePct > 0` | performancePct DESC | Riding sector wave, not individually outperforming ETF |

**Pre-filters:** `dailyChangePct < 8%` (no chasing) + AVOID-classified stocks excluded. Upstream rotation tracker gates (price >= $15, dollarVol >= $200M, SCAN_EXCLUSIONS) applied before stocks reach alert route.

**Cross-scanner confluence:** Loads PreRun (`PRIORITY`/`KEEP`), Inflection (`STARTER`/`ADD_ON`), Transition (`TRIGGERED`/`READY`), Institutional (`SHORTLIST`/`WATCHLIST`) data for current date. Multi-system confirmed stocks shown with scanner badges in Telegram messages (Message 2 Focus tier + Message 3).

**Rotation breadth:** Tracks qualified (pass filters) vs total stocks per rotation. Displayed as `📊 N/M stocks qualify (Broad/Moderate/Narrow — context)`.

**Historical stats:** Pattern stats from `rotationResult.patternStats` enriched onto rotation changes. Shows `📈 Avg +X.X% over Nd (N prior rotations)`.

**Resilience:** `calculateRotationTracker()` is wrapped in try/catch — if it fails, quadrant transition alerts still fire. Rotation tracker errors logged via `logError("sector-rotation/alert:rotation-tracker")`. If rotation tracker fails, no Message 2 but Message 1 still fires.

**Key files:**

| File | Purpose |
|------|---------|
| `src/app/api/sector-rotation/alert/route.ts` | Cron route — calls `calculateSectorRotation()` + `calculateRotationTracker()`, stock selection pipeline, 2 Telegram messages (quadrant transitions + rotation changes) |
| `src/app/api/sector-rotation/confluence/route.ts` | Confluence cron — runs at 03:02 UTC with fresh scanner data, sends Message 3 (rotation × scanner confluence) |
| `src/lib/sector-rotation/transitions.ts` | `detectRotationChanges()`, `formatRotationChanges()`, `formatRotationConfluence()`, `RotationSnapshot`, `RotationChange`, `RotationTopStock` types |
| `src/lib/sector-rotation/confluence.ts` | Shared helpers: `buildScannerHitMap()`, `buildEnrichedMap()`, `buildStockMap()`, `buildCurrentRotations()`, `computeConfluenceTickers()` |

### Rotation × Scanner Confluence Cron
The `/api/sector-rotation/confluence` cron (03:02 UTC / 11:02 PM ET, Tue-Sat) sends 1 Telegram message to `TELEGRAM_CHAT_ID_SECTOR`. Runs AFTER all nightly scanners finish (~02:50 UTC), ensuring fresh scanner data from tonight's run instead of ~20-hour-old stale data from the previous night.

**Why separated from the 6 PM alert:** The sector alert at 22:00 UTC (6 PM ET) fires before tonight's scanners run (02:00-02:50 UTC). At 6 PM, the only scanner data available is from last night's run, reflecting yesterday's market close. Moving confluence to 03:02 UTC means it uses tonight's scanner data, reflecting today's market close.

**Message — Rotation × Scanner Confluence:** Scans ALL active rotations for stocks with scanner hits, regardless of whether the rotation itself changed. Catches stocks that get scanner confirmation (e.g., Trans:TRIGGERED) within existing rotations that didn't fire the 6 PM rotation change alert.

**Message format:**
- **Focus tier** (EARLY/MATURING): Full detail — single-line per stock with scanner hits, performance, volume. Multi-scanner stocks get star. Only HIGH/MEDIUM conviction shown (WATCH dropped as noise).
- **Monitor tier** (LATE/EXHAUSTING): Compact — sector header + ticker list only.
- **NEW detection:** Stocks not in previous run's confluence get tagged. Uses `confluenceTickers` persisted in separate KV key (`sector-rotation:confluence-tickers`). Skipped on cold start (no false positives).
- **Footer:** Count + scanner names + copyable watchlist grouped by ETF (e.g., `IGV: PLTR, CRWD, NET`).
- **Cap:** 5 stocks per rotation, deduped across rotations.
- Returns `null` if no scanner-hit stocks found (no message sent).

**Data flow:**
1. `calculateSectorRotation()` — live sector data + enriched stocks
2. `calculateRotationTracker()` — live active rotations + stock performance
3. Load fresh scanner tables (PreRun, Inflection, Transition, Institutional) for today's UTC date
4. Build stockMap using shared helpers from `confluence.ts`
5. Load previous confluence tickers from KV for NEW detection
6. `formatRotationConfluence()` → send to SECTOR channel
7. Persist current confluence tickers to KV

**Shared helpers** (`src/lib/sector-rotation/confluence.ts`): `buildScannerHitMap()`, `buildEnrichedMap()`, `buildStockMap()`, `buildCurrentRotations()`, `computeConfluenceTickers()` — used by both the 6 PM alert (for Message 2 scanner badges) and this 11 PM confluence cron (for Message 3).

### Pre-Market Trading Bias Engine
Computes structured trading bias from equity futures, VIX, and market internals.

**Inputs:** ES=F, NQ=F, YM=F, RTY=F (4 equity futures), VIX level, sector breadth, adaptive VIX bounds.

**Classification logic (`classifyBias`):**
1. **Magnitude gate:** If average absolute change < 0.08%, return Neutral (tiny moves are noise)
2. **Unanimous:** All 4 up → Strong Bull, all 4 down → Strong Bear
3. **Magnitude-weighted majority:** Sum positive and negative contributions; one side must outweigh the other by 1.5x to claim majority (prevents 3 barely-positive futures from overriding 1 strongly-negative)
4. **Count-based override:** If 3+ of 4 futures agree on direction (using the `sign()` 0.1% threshold), classify as Lean Bull/Bear regardless of magnitude weighting. Prevents one large outlier from dragging classification to Neutral.
5. **Even split:** Use average change as tiebreaker (±0.15% threshold)
6. **Fallback:** biasScore from checklist scoring

**Direction threshold (`sign()`):** Futures with absolute changePct < 0.1% are classified as "flat" (not "up" or "down"). This affects the unanimous check, count-based override, and alignment reasons.

**Asset-to-avoid logic (`pickBestWorst`):** Uses median-deviation — the futures contract whose changePct deviates most from the group median is flagged as avoid (minimum 0.15pp deviation required). Previous approach used `sign()` direction uniqueness, which caused artifacts like ES +0.06% ("flat") being flagged instead of NQ -0.70% (the real outlier). **Conflict guard:** If `assetToAvoid` matches `bestToTrade.symbol`, `assetToAvoid` is cleared — you can't recommend trading and avoiding the same contract (the outlier IS the directional trade in bearish scenarios).

**Best-to-trade logic:** When bias is Neutral/Flat, no trade is recommended (`bestToTrade: null`). When bullish, picks the futures with highest changePct for long. When bearish, picks the most negative for short.

**Alignment reasons:** The `buildReasons()` function annotates which futures are below the 0.1% sign threshold, e.g., "2 of 4 equity futures aligned bullish (ES below threshold)".

**Outputs:** `TradingBias` object with bias, confidence (0-100), preferredDirection (Long/Short/Flat), leading/weakest asset, bestToTrade/assetToAvoid, dayType, VIX interpretation, playbook text, reasons array.

**9 AM Snapshot display (`/sectors/brief`):** The brief page shows both the persisted 9 AM prediction (frozen from `trading_bias_daily`) and the live bias (refreshed every 2 min from `/api/premarket`). The snapshot header shows the 9 AM bias, confidence, direction, and equity futures values. When the live bias diverges from the snapshot, a divergence badge appears:

| Divergence | Condition | Styling |
|------------|-----------|---------|
| Reversed | Opposite sides of neutral (e.g., Lean Bull → Lean Bear) | Red |
| Faded | Strong directional call → Neutral (e.g., Strong Bull → Neutral) | Amber |
| Shifted | Same-side shift of 2+ levels | Amber |
| Adjusted | Minor 1-level same-direction shift | Muted gray |

Snapshot futures are filtered to equity only (ES/NQ/YM/RTY) — CL and GC are not bias inputs and are excluded from the display.

**Backtesting persistence:** The daily briefing cron (`/api/daily-briefing/cron`) persists each day's prediction to `trading_bias_daily` and backfills the previous day's actual futures open-to-close returns. Flow:
1. **Step A (backfill):** Find most recent row with null `outcome_updated_at`. Fetch 5d daily chart for ES=F/NQ=F/YM=F/RTY=F via `fetchYahooChart()`. Match candle by date, compute open-to-close return %. Evaluate `bias_correct` (Long → avg return > 0, Short → avg return < 0, Flat → null). Compute `best_trade_return_pct` (negated if direction was "short").
2. **Step B (log):** After computing today's trading bias, upsert prediction row (bias, confidence, direction, posture, regime, futures snapshot, bestToTrade, assetToAvoid, etc.). Purge rows older than 90 days.

**Key files:**
| File | Purpose |
|------|---------|
| `src/lib/premarket/trading-bias.ts` | Bias classification, confidence, playbook generation. All numeric thresholds externalized to `PREMARKET_SCORING` in config.ts (sign threshold, magnitude gate, majority ratio, tiebreaker, VIX direction, avoid deviation). |
| `src/lib/premarket/fetch.ts` | Yahoo Finance data fetching for futures + internals (2-min cache) |
| `src/lib/premarket/scoring.ts` | Checklist-based bias score (-10 to +10) |
| `src/lib/premarket/types.ts` | `TradingBias`, `TradingBiasSnapshot`, `FuturesSnapshot`, `PremarketData` types |
| `src/app/api/premarket/route.ts` | API route — aggregates futures, sector data, regime, posture |
| `src/app/api/trading-bias/daily/route.ts` | Read API for persisted 9 AM snapshot (?date=YYYY-MM-DD, defaults to most recent) |
| `supabase/migrations/020_trading_bias_daily.sql` | DB table for bias predictions + outcome backfill |

### Crypto Rotation
Mirrors the equity sector rotation system for crypto assets. Uses adapted quality gates (lower market cap, dollar volume, wider extension thresholds) and reuses equity classification/conviction logic. Crypto quality gates reject null market cap tokens (aligned with equity `REJECT_NULL_MARKET_CAP: true`). `MAX_EXTENSION_PCT: 200` (wider than equity — crypto volatility warrants higher ceiling).

**Key files:**
| File | Purpose |
|------|---------|
| `src/lib/crypto-rotation/crypto-rotation.ts` | Main crypto scoring engine |
| `src/lib/crypto-rotation/token-enrichment.ts` | Crypto quality gates + enrichment (thresholds from `CRYPTO_QUALITY_GATES` in config) |
| `src/lib/crypto-rotation/crypto-regime.ts` | Crypto-specific regime classification |
| `src/lib/crypto-rotation/brief.ts` | Crypto daily brief computation |

## Key Files

### Cron Routes
| File | Purpose |
|------|---------|
| `src/app/api/prerun/cron/preset/route.ts` | Preset daily cron (main scan) |
| `src/app/api/prerun/cron/preset-resume/route.ts` | Preset resume pass |
| `src/app/api/prerun/cron/preset-4h/route.ts` | 4h-candle preset cron (barMultiplier=6) |
| `src/app/api/inflection/cron/daily/route.ts` | Inflection daily cron |
| `src/app/api/vcp/cron/daily/route.ts` | VCP daily cron |
| `src/app/api/institutional/cron/daily/route.ts` | Institutional daily cron |
| `src/app/api/transition/cron/daily/route.ts` | Transition daily cron |
| `src/app/api/nightly-summary/cron/route.ts` | Consolidated nightly scan summary (2 Telegram messages) |
| `src/app/api/sector-rotation/confluence/route.ts` | Rotation × Scanner confluence (fresh scanner data, 1 Telegram message) |
| `src/app/api/daily-briefing/cron/route.ts` | Daily briefing + trading bias logging + outcome backfill |

### Read API Routes
| File | Purpose |
|------|---------|
| `src/app/api/prerun/daily/route.ts` | Read preset daily data (?date=, ?preset=, ?dates=true, ?scanner=4h) |
| `src/app/api/inflection/daily/route.ts` | Read inflection daily data |
| `src/app/api/vcp/daily/route.ts` | Read VCP daily data |
| `src/app/api/institutional/daily/route.ts` | Read institutional daily data |
| `src/app/api/transition/daily/route.ts` | Read transition daily data |
| `src/app/api/sector-rotation/route.ts` | Sector rotation scores (31 ETFs, leadership baskets, regime) |
| `src/app/api/premarket/route.ts` | Pre-market futures, internals, trading bias, sector checklist |
| `src/app/api/trading-bias/daily/route.ts` | Read persisted 9 AM trading bias snapshot (?date=YYYY-MM-DD, defaults to most recent) |
| `src/app/api/backtest/funnel/route.ts` | Funnel backtest — composite scoring across 5 scanners with forward returns |

### UI Pages
| File | Route |
|------|-------|
| `src/app/prerun/preset-daily/page.tsx` | `/prerun/preset-daily` — 5 preset tabs (Early+ deprecated) + Daily/4h scanner toggle |
| `src/app/prerun/inflection-daily/page.tsx` | `/prerun/inflection-daily` |
| `src/app/prerun/vcp-daily/page.tsx` | `/prerun/vcp-daily` |
| `src/app/prerun/institutional-daily/page.tsx` | `/prerun/institutional-daily` |
| `src/app/prerun/transition-daily/page.tsx` | `/prerun/transition-daily` — Transition scanner (market structure) |
| `src/app/sectors/page.tsx` | `/sectors` — Sector rotation dashboard (RRG chart, cards, baskets) |
| `src/app/sectors/brief/page.tsx` | `/sectors/brief` — Daily brief (posture, bias, health, tiers) |
| `src/app/sectors/picks/page.tsx` | `/sectors/picks` — Enriched stock picks + INF cross-reference |
| `src/app/sectors/crypto/page.tsx` | `/sectors/crypto` — Crypto rotation dashboard |
| `src/app/rotation/page.tsx` | `/rotation` — Active rotation tracker |
| `src/app/prerun/backtest/page.tsx` | `/prerun/backtest` — Funnel backtest with composite scores and forward returns |

### Persistence & Data
| File | Purpose |
|------|---------|
| `src/lib/supabase/persistence.ts` | All DB read/write functions (upsert, load, purge, clear) |
| `src/lib/supabase/server.ts` | `createAdminClient()` for server-side DB access |
| `src/data/index-tiers.ts` | SP500_MEMBERS, NDX100_MEMBERS, SP400_MEMBERS, ADDITIONAL_MEMBERS sets + `getTickerTier()` |
| `src/data/prerun-universe.ts` | `getSectorForTicker()` mapping |

### Shared Utilities
| File | Purpose |
|------|---------|
| `src/lib/daily-format.ts` | `fmtNum()` — safe number formatter for daily pages |
| `src/components/table-error-boundary.tsx` | React error boundary for data tables |
| `src/components/nav.tsx` | Navigation with prerun sub-nav links |
| `src/lib/ew-wave/telegram.ts` | `sendTelegramMessage()` for Telegram bot alerts |
| `src/lib/sector-rotation/confluence.ts` | Shared helpers for scanner-rotation confluence (stockMap, scannerHitMap, enrichedMap builders) |

## Patterns & Conventions

### Centralized Config Pattern
All scoring thresholds for the sector rotation system live in `src/lib/sector-rotation/config.ts`. **Never hardcode numeric thresholds** in scoring logic — add them to config.ts and import.

**Key config sections and notable constants:**

| Section | Notable Constants |
|---------|-------------------|
| `COMPOSITE` | `ACCEL_NORM_FLOOR: -10`, `ACCEL_NORM_CEILING: 10` (fixed-range acceleration normalization), `ACTIONABLE_THRESHOLD`, `ACTIONABLE_HYSTERESIS`, `WATCH_THRESHOLD` |
| `SCORING_SIGNALS` | `MOMENTUM_WEIGHTS: { roc63: 0.35, roc126: 0.25, roc189: 0.25, roc252: 0.15 }`, `SIGMOID_EXPONENT: 0.4` |
| `ROTATION` | `RS_SMA_SHORT: 10`, `RS_SMA_LONG: 30`, `MIN_ALIGNED_BARS: 50`, `TRACKER_BATCH_SIZE: 15`, `TRACKER_BATCH_DELAY: 200`, `VOLUME_SURGE: 1.5`, `SIGNAL_START: 2`, `SIGNAL_END_DAYS: 3`, `EARLY_TIMING_DAYS: 7`, `DELAYED_TIMING_DAYS: 15`, `MATURE_TIMING_DAYS: 30` (DELAYED→MATURE boundary), `MIN_AVG_SIGNAL_COUNT: 1.0`, `VOLUME_TREND_LOOKBACK: 5` (rolling window for volume), `VOLUME_TREND_MIN_DAYS: 2` (min spike days in window), `VOLUME_SMA_PERIOD: 20`, `PRICE_SMA_PERIOD: 50`, `SLOW_BURN_MIN_DAYS: 10` (persistent-strength detection), `QUADRANT_GUARD_DAYS: 5` (suppress RS when RRG disagrees), `MAX_ACTIVE_ROTATIONS: 15`, `HEALTH_CMF_AMBER: -0.05` (CMF amber/red boundary for UI badges), `HEALTH_ACCEL_AMBER: -0.3` (accel amber/red boundary for UI badges) |
| `ROTATION_LIFECYCLE` | `EXHAUSTING_DAYS: 30` (health override: stays LATE if accel > 0, CMF > 0, IMPROVING/LEADING), `EXHAUSTING_SOFT_DAYS: 25` (health-confirmed soft zone), `EARLY_MAX_DAYS`, `MATURING_MAX_DAYS` |
| `REGIME` | `DXY_TREND_THRESHOLD: 1` (absolute point change, not percentage), `MISSING_DATA_PENALTY: 10` (confidence penalty per missing TNX/DXY source — disables INFLATIONARY detection) |
| `CLASSIFICATION` | `P4_RS_ACCEL`, `P4_SECTOR_ACCEL` (both must be negative — AND logic), `P3_MIN_VOL_RATIO` |

| `QUALITY_GATES` | `REJECT_NULL_MARKET_CAP: true` (null mcap = fail), `APPLY_SCAN_EXCLUSIONS: true` (145-ticker exclusion filter for enrichment + rotation tracker), `MIN_MARKET_CAP: 10B`, `MIN_DOLLAR_VOLUME: 200M`, `MIN_AVG_VOLUME: 1.0M`, `MAX_VOLUME_SPIKE: 10` (was 5 — allows breakout-day volume), `MAX_ETF_DEVIATION: 60` (was 30 — lets sector leaders diverge from ETF) |
| `CRYPTO_REGIME_THRESHOLDS` | `BTC_VOL_LOW: 60`, `BTC_VOL_HIGH: 80`, `DOMINANCE_DELTA_RISING: 2`, `MARKET_TREND_THRESHOLD: 3`, `CONFIDENCE_VOL_STRONG: 50`, `CONFIDENCE_VOL_EXTREME: 90`, `ALT_SEASON_DISPERSION: 8` |
| `CRYPTO_BRIEF` | `BTC_VOL_SPIKE: 80`, `AGGRESSIVE_DISPERSION: 5`, `ACTIONABLE_COMPOSITE: 55`, `PANIC_DISPERSION: 10`, `BIAS_DISPERSION_HIGH: 6`, `BIAS_DISPERSION_LOW: 2`, `LOW_CONFIDENCE_THRESHOLD: 50`, `BTC_RETURN_THRESHOLD: 5`, `SECTOR_BALANCE_THRESHOLD: 2` |
| `COMPARISON` | `CHANGE_THRESHOLD: 2` (sector score delta for improved/declined classification) |
| `PRERUNNER` | Leader weights: `RS: 30`, `SECTOR: 25`, `VOLUME: 15`, `CONVICTION: 15`, `MOMENTUM: 10`, `REGIME: 5` (sum=100). Turnaround weights: `RS: 35`, `LIFECYCLE: 20`, `VOLUME: 15`, `SECTOR: 15`, `MOMENTUM: 10`, `REGIME: 5` (sum=100). Normalization: `RS_ACCEL_MAX: 6`, `VOL_RATIO_MAX: 2.0`, `VOL_RATIO_FLOOR: 0.5`, `MOMENTUM_RANGE: [-10, +10]`. Score mappings: `QUADRANT_SCORES` (LEADING=25, IMPROVING=20, WEAKENING=8, LAGGING=0), `LIFECYCLE_SCORES` (EARLY=20, MATURING=15, LATE=5, EXHAUSTING=0), `CONVICTION_SCORES` (HIGH=1.0, MEDIUM=0.7, WATCH=0.3). Bonuses: `RS_IMPROVING_BONUS: 5`, `OUTPERFORMANCE_BONUS_CAP: 5` (leaders only, scaled by `OUTPERFORMANCE_SCALE: 10`). Blending: `SECTOR_COMPOSITE_BLEND: 0.5` (50% quadrant + 50% continuous composite). Turnaround conviction: `TURNAROUND_CONVICTION_RS_BLEND: 0.4`, breakpoints at `0.7` (HIGH) / `0.4` (MEDIUM). |

| `CONVICTION` | Signal weights: `sectorQuadrant: 1.5`, `sectorComposite: 1.5`, `stockCategory: 1.0`, `rsAccel: 1.0`, `sectorStealth: 1.0`, `volumeRatio: 0.5`. Thresholds: `STRONG_RS_ACCEL: 3.0`, `HIGH_VOL_RATIO: 1.2`, `HIGH_COMPOSITE: 70`, `STEALTH_VOL_FLOOR: 0.8`. Phase: `PHASE_P4_PENALTY: 1.5`. Tiers: `WEIGHTED_HIGH: 4.0`, `WEIGHTED_MEDIUM: 2.5`. |

| `PREMARKET_SCORING` | `SIGN_THRESHOLD: 0.1` (flat futures cutoff), `VIX_DIRECTION_PCT: 3` (VIX move threshold), `EQUITY_DIRECTION_THRESHOLD: 0.1`, `SUSPICIOUS_RALLY_THRESHOLD: 0.3`, `MAGNITUDE_GATE: 0.08` (tiny-move neutral gate), `MAJORITY_RATIO: 1.5` (bull/bear weight majority), `TIEBREAKER_THRESHOLD: 0.15` (even-split tiebreaker), `AVOID_MIN_DEVIATION: 0.15` (median-deviation floor for asset-to-avoid) |

| `RISK_FLAGS` | `SIGNAL_DECLINE_THRESHOLD: 0.5` (avg signal count drop to flag declining rotation signals), `NARROW_LEADERSHIP: 50`, `NARROW_LEADERSHIP_BUFFER: 3`, `DETERIORATING_LEADERSHIP: 35`, `MISSING_DATA_PENALTY` in REGIME (was hardcoded 5, now 10 via config) |

Other sections: LEADERSHIP, POSTURE, SMART_MONEY, TOP_STOCK_WEIGHTS, ROTATION_CONVICTION, SUB_SECTOR, CRYPTO_QUALITY_GATES, EXTENSION_TIERS.

### Stock Enrichment Phase Classification
Stocks passing quality gates are classified into phases in `stock-enrichment.ts`:

| Phase | Criteria | Notes |
|-------|----------|-------|
| P2_TURNAROUND | pctFrom50ma in [-5%, 3%] AND rsAccel > 0.5 AND volRatio >= 1.2 | Checked first (most specific) — near 50MA crossover with acceleration + volume |
| P1_BASING | Below 50MA AND rsAccel > 0 | Early recovery, positive acceleration below key MA |
| P3_TRENDING | Above 50MA AND pctFrom50ma > 3% AND rsAccel >= 0 AND volRatio >= 0.7 | Strong trend with volume confirmation |
| P4_EXHAUSTING | Above 50MA AND rsAccel < `P4_RS_ACCEL` (-2.0) AND sectorAccel < `P4_SECTOR_ACCEL` (-3) | Requires BOTH deeply negative — single negative metric doesn't trigger |

**Fallback logic (above 50MA):** If no explicit phase matches: `rsAccel < P4_RS_ACCEL AND sectorAccel < P4_SECTOR_ACCEL` → P4_EXHAUSTING, `rsAccel >= 0 + volRatio >= 0.7` → P3_TRENDING, else → P2_TURNAROUND (not P1 — can't be "basing" above 50MA). Fallback P4 requires the same dual-metric gate as the explicit check — rsAccel alone (pctFrom50 - pctFrom200) is naturally deeply negative for established uptrends, so single-metric P4 misclassifies healthy trending stocks.

**Fallback logic (below 50MA):** Always P1_BASING.

**trendAccel metric limitation:** The `rsAccel` metric used in enrichment phase classification (`pctFromSma50 - pctFromSma200`) is naturally deeply negative for established uptrending stocks. A stock at +14% from SMA50 and +24% from SMA200 yields `rsAccel = -10`, even though the stock is healthy. This metric IS meaningful below SMA50 (positive = recovering faster towards 50MA than 200MA) but unreliable for above-SMA50 phase classification without a second confirmation signal. The dual-metric P4 gate (requiring BOTH rsAccel AND sector acceleration deeply negative) prevents misclassification. Other pages use sector-relative metrics instead — see "Cross-Page Phase Classification" below.

### Stock Enrichment Conviction Scoring
`scoreConviction()` in `stock-enrichment.ts` computes conviction from 6 weighted signals plus a phase penalty.

**Signals (structural > tactical):**

| Signal | Weight | Condition | Type |
|--------|--------|-----------|------|
| sectorQuadrant | 1.5 | IMPROVING or LEADING | Structural |
| sectorComposite | 1.5 | >= 70 | Structural |
| stockCategory | 1.0 | TURNAROUND or LEADER | Structural |
| rsAccel | 1.0 | >= 3.0 | Tactical |
| sectorStealth | 1.0 | stealth + (volRatio >= `STEALTH_VOL_FLOOR` (0.8) or TURNAROUND/LEADER) | Structural |
| volumeRatio | 0.5 | >= 1.2 | Tactical |

**Phase penalty:** P4_EXHAUSTING stocks get `-PHASE_P4_PENALTY` (1.5) subtracted from weighted score. Prevents exhausting stocks from achieving HIGH conviction even with strong sector signals.

**Conviction tiers:** HIGH >= 4.0, MEDIUM >= 2.5, WATCH < 2.5. All thresholds in `CONVICTION` config.

**Category classification:** LEADER (above 50MA + outperforms sector + vol >= 1.0x), CATCH_UP (above 50MA fallback), TURNAROUND (below 50MA + rsAccel > 0.5 + vol >= 1.0x, or rsAccel > 1.0 alone), AVOID (below 50MA, no turnaround signal). AVOID never survives quality gates (Gate 5 uses identical conditions).

Null-data tracking: `marketCap` null is now rejected (when `REJECT_NULL_MARKET_CAP` is true in config, aligns with PreRun treating null as 0). When `institutionalPct` or `ret20d` are null, the corresponding quality gates are bypassed (defensible — don't reject on missing data) but tracked via `dataWarnings: string[]` on `EnrichedStock`.

### Trading Action Logic
`getTradingAction()` in `src/app/sectors/_components/helpers.ts` maps sector quadrant + composite + acceleration to actions:

| Priority | Condition | Action |
|----------|-----------|--------|
| 1 | IMPROVING + accel > 0 | BUILD |
| 2 | LEADING + composite >= threshold + accel > 0 | TRADE |
| 3 | LEADING + composite >= threshold + accel <= 0 | WATCH (decelerating leaders — monitor, don't add) |
| 4 | LEADING (below threshold) | WATCH |
| 5 | WEAKENING | TRIM |
| 6 | IMPROVING (accel <= 0) | WATCH |
| 7 | LAGGING + accel > 0 + composite >= watch threshold | WATCH |
| 8 | Default | AVOID |

### Regime Sector Alignment
`isRegimeAligned()` in `rotation-helpers.ts` maps sector display names to their GICS parent via `REGIME_SECTOR_DISPLAY_MAP`. The regime's `favoredSectors`/`avoidSectors` use GICS parent names (e.g., "Technology"), so sub-sectors must be mapped to inherit alignment.

**Sub-sector mappings:**

| GICS Parent | Mapped Sub-Sectors |
|---|---|
| Technology | Semiconductors, Software & Cloud, AI & Robotics |
| Health Care | Biotech |
| Consumer Discretionary | Homebuilders, Retail |
| Financials | Regional Banks |
| Industrials | Transports, Aerospace & Defense, Space & Defense Innovation |

**Intentionally unmapped:** Cross-asset (Gold, Treasuries 20Y+, High Yield Corp, Emerging Markets, US Dollar) and leadership baskets (Magnificent 7, Nasdaq 100, Russell 2000, ARK Innovation) always return "neutral" — regime opinions are equity-sector focused.

### Rotation Signals Panel (`/sectors/picks`)
The Rotation Signals panel on the picks page shows sector rotations at inflection points with timing labels. Replaces the previous "Entry Signals" panel which applied 4 confirmation gates (action=ENTER/ADD, CMF > 0, accel > 0, quality stocks) that delayed signals 10-15 days.

**Component:** `RotationEntrySignals` in `src/app/sectors/_components/entry-signals.tsx`. Panel id remains `entry-signals` for localStorage compat.

**Noise filters (replace old 4-gate system):**

| Filter | Logic | Replaces |
|--------|-------|----------|
| EXIT filter | `action === "EXIT"` excluded | `action === ENTER or ADD` gate |
| Blip filter | `daysActive < MIN_ROTATION_DAYS (5)` excluded | *(new)* |
| Sustained filter | `isSignalSustained()`: trailing 20-day window avg signalCount >= `MIN_AVG_SIGNAL_COUNT` (1.0) | *(new)* |
| *(removed)* | CMF shown as colored badge, not a gate | `cmf20 > 0` gate |
| *(removed)* | Accel shown as colored badge, not a gate | `acceleration > 0` gate |
| *(removed)* | "No quality stocks yet" shown if empty | `hasQualityStock` gate |

**Timing classification (`classifyTiming`):**

| Timing | Condition | Color |
|--------|-----------|-------|
| EARLY | Days 1-`EARLY_TIMING_DAYS` (7), or days 8-`EARLY_TIMING_DAYS+3` (10) without health confirmation (CMF > 0 AND accel > 0) | Green |
| CONFIRMED | Days 8-15 with any health confirmation | Cyan |
| DELAYED | Days 16-`MATURE_TIMING_DAYS` (30) | Amber |
| MATURE | Days `MATURE_TIMING_DAYS`+ (aligns with lifecycle LATE/EXHAUSTING boundary) | Purple |

**Sort order:** EARLY first → CONFIRMED → DELAYED → MATURE. Within tier: conviction score descending.

**Card rendering:** Each card shows timing badge with day count, action badge (ENTER/ADD/HOLD), health indicator badges (CMF: green/amber/red using `HEALTH_CMF_AMBER`, Accel: green/amber/red using `HEALTH_ACCEL_AMBER`, trailing 20-day avg signal count with color, conviction level with EXIT=red/LOW=amber/MODERATE=cyan/HIGH=green), top picks or "No quality stocks yet" placeholder. Sector name is clickable when `onSectorClick` prop provided (cross-section filtering). Top stocks show `L` (green) and `T` (cyan) compact badges for LEADER/TURNAROUND categories (merged from PreRunner Radar).

**Top stocks filter:** Quality stocks require (HIGH or MEDIUM conviction) AND (LEADER or TURNAROUND, or CATCH_UP with HIGH conviction). Sorted by conviction tier then RS acceleration. Top 3 shown per rotation.

**Panel badge:** Shows signal count + leader/turnaround counts (e.g., "3 signals" + "2L + 1T").

**Cross-section filtering:** `onSectorClick?: (sectorName: string) => void` prop. Clicking a sector card sets `crossFilterSector` state in picks page, which filters StockPicksPanel to that sector with a "Showing: {sector}" badge.

**Cross-link:** "Full lifecycle analysis →" link to `/rotation` below panel header.

**Grouped display:** Cards grouped by timing tier with section headers (`── Early Signals (N) ──`).

**Empty state:** Shows counts for emerging (< 5 days), exiting (EXIT action), and unsustained rotations.

**Config constants (ROTATION section):** `EARLY_TIMING_DAYS: 7`, `DELAYED_TIMING_DAYS: 15`, `MATURE_TIMING_DAYS: 30`, `MIN_AVG_SIGNAL_COUNT: 1.0`, `HEALTH_CMF_AMBER: -0.05`, `HEALTH_ACCEL_AMBER: -0.3`.

### Stock Picks Panel (`/sectors/picks`)
Two stock display components in `src/app/sectors/_components/stock-picks-panel.tsx`:

**`TopPicksBySector`:** Top 3 stocks per sector, sorted by conviction then RS acceleration. Requires at least 1 HIGH or MEDIUM conviction stock per sector (WATCH-only sectors filtered as noise). Price displayed with 2 decimal places. Component still exists but is **no longer rendered on the picks page** (was its own CollapsiblePanel, removed during UX consolidation).

**`StockPicksPanel`:** Full filterable/sortable table with 9 filter dimensions (all persisted via localStorage):

| Filter | Options | Notes |
|--------|---------|-------|
| Conviction | ALL / HIGH / MEDIUM / WATCH | Stock-level conviction (not rotation conviction) |
| Sector | ALL / per-sector | Dynamic from data |
| Category | ALL / LEADER / CATCH_UP / TURNAROUND / AVOID | AVOID added for filtering stocks to avoid |
| Phase | ALL / P1-P4 | Stock enrichment phase |
| Quadrant | ALL / Leading+Improving / individual | Sector quadrant filter |
| RS Accel | all / positive / strong (>=3) | RS acceleration filter |
| Volume | all / above avg (>=1.0x) / high (>=1.5x) | Volume ratio filter |
| 50MA | all / above / below | Null-safe: "below" excludes stocks with null SMA50 (unknown position ≠ below) |

**Additional props:**
- `scanActions?: React.ReactNode` — scan refresh UI (progress bar, cancel button) rendered in panel header actions area
- `crossFilterSector?: string | null` — when set (from Entry Signals click), overrides internal sector filter and shows "Showing: {sector}" badge with clear button
- `onClearCrossFilter?: () => void` — clears the cross-filter

**Special buttons:** "Top Picks" preset (HIGH + LEADER + Leading/Improving + strong RS + P3), "Reset" clears all filters.

**Grouping:** Stocks grouped by sector ETF, each collapsible. Default: all expanded.

### Dashboard Sector Cards (`/sectors`)
Each sector card shows composite score ring, quadrant badge, trading action, CMF/RS/breadth stats, why text, top 3 stock pills, and an expandable stock table.

**Card conviction scoring** (`getConvictionScore()` in `sector-card.tsx`): Simplified additive scoring (0-11 scale) for stock pills on sector cards. Different from the 6-weighted-signal `scoreConviction()` in `stock-enrichment.ts` used by the picks page. Uses `sectorRS` (stock vs sector ETF from rotation tracker) when available for the RS acceleration signal, falling back to `rsAccel` (pctFrom50 - pctFrom200). The fallback is necessary for stocks not in active rotations.

| Signal | Points | Notes |
|--------|--------|-------|
| sectorRS (or rsAccel) > 1 | 3 | Strong RS acceleration (prefers rotation tracker metric) |
| sectorRS (or rsAccel) > 0 | 1 | Positive RS acceleration |
| aboveSma50 | 2 | Above 50-day SMA |
| volumeVsAvg >= 1.5 | 2 | High volume |
| volumeVsAvg >= 1.2 | 1 | Above-average volume |
| rsImproving | 1 | RS direction improving |
| verdict KEEP or PRIORITY | 2 | PreRun verdict match |

Conviction labels: HIGH >= 7, MED >= 4, LOW < 4.

**Dashboard stock phase** (`getStockPhase()` in `helpers.ts`): Simplified phase classification for dashboard display. Below-50MA stocks use `rsAccel` (pctFrom50 - pctFrom200) which is meaningful there (positive = recovering faster towards 50MA). Above-50MA stocks prefer `sectorRS` (stock vs sector ETF from rotation tracker) — `rsAccel` is naturally deeply negative for established uptrends and misclassifies healthy trends as "exhausting". Falls back to `rs20d` when no rotation data available.

| Phase | Condition | Notes |
|-------|-----------|-------|
| turnaround | Below 50MA + RS20d > 0 + rsAccel > 0 + vol >= 1.2x | Below 50MA with positive signals |
| basing | Below 50MA (all other cases) | Default for below-50MA stocks |
| exhausting | Above 50MA + sectorRS < -2 + !rsImproving (or rs20d < -5 fallback) | Requires sector-relative underperformance |
| trending | Above 50MA + sectorRS > 0 (or rs20d > 0 fallback) | Outperforming sector ETF |
| neutral | Everything else | Default for above-50MA with mixed signals |

**Why text** (`getWhyText()`): Maps trading action + quadrant + acceleration to descriptive text. Covers all WATCH subcases: LEADING-decelerating, LEADING-below-threshold, IMPROVING-stalled, LAGGING-early-signals.

**Sort stability**: All sort modes in `_use-sector-data.ts` include alphabetical tiebreaker (`a.sector.localeCompare(b.sector)`) to prevent card flicker on re-render.

### Cross-Page Phase Classification
Three pages classify stocks into phases using different metrics. This is an intentional design tradeoff — each page uses the best available metric for its context. The `rsAccel` metric (`pctFromSma50 - pctFromSma200`) is naturally deeply negative for established uptrends and must NOT be used as a single-metric gate for above-SMA50 stocks.

| Page | Function | Above-50MA Metric | Exhausting Gate | Notes |
|------|----------|-------------------|-----------------|-------|
| `/sectors` dashboard | `getStockPhase()` in `helpers.ts` | `sectorRS` (stock vs sector ETF from rotation tracker), fallback `rs20d` | `sectorRS < -2 && !rsImproving` or `rs20d < -5` | Quick-glance view, single-metric gate acceptable |
| `/sectors/picks` enrichment | `classifyPhase()` in `stock-enrichment.ts` | `rsAccel` (pctFrom50 - pctFrom200) | `rsAccel < -2.0 AND sectorAccel < -3` (dual gate) | Authoritative classification, requires both metrics deeply negative |
| `/rotation` tracker | `getRotationStockPhase()` in `page.tsx` | `rsAcceleration` (stock vs sector ETF, 5d vs 20d) | `rsAcceleration < -2 && !rsImproving` | Sector-relative metric, avoids trendAccel pitfall |

**Known cross-page differences (by design):**
- A stock with `sectorRS = -3` but healthy sector acceleration (`sectorAccel > -3`) shows "exhausting" on dashboard but NOT P4_EXHAUSTING in enrichment (dual gate fails). Dashboard is a quick-glance signal; enrichment is the rigorous classification.
- Dashboard card conviction (`getConvictionScore`, 0-11 additive, `sectorRS > 1` = +3 pts) differs from enrichment conviction (`scoreConviction`, 6 weighted signals, `rsAccel >= 3.0` threshold). These are intentionally different scoring systems for different contexts — documented in respective sections above.
- When both `sectorRS` and `rs20d` are null (stock not in rotation, no prerun data), dashboard defaults to "neutral". This is correct behavior for insufficient data.
- Below-50MA stocks use `rsAccel` (pctFrom50 - pctFrom200) consistently across all pages — the metric IS meaningful in this context (positive = recovering faster towards 50MA).

### INF Cross-Reference Badge (`/sectors/picks`)
The picks page fetches inflection scanner data (`/api/inflection/daily`) in parallel and displays sky-blue `INF` badges on stocks that also appear in today's inflection results. Same pattern as the transition-daily page.

**Data flow:** `picks/page.tsx` fetches inflection + transition data once on mount → builds `Map<string, { trade_read, score }>` and `Map<string, { alert_state, state, score }>` keyed by ticker → passes `inflectionMap` and `transitionMap` props to 2 components.

**Badge locations (picks page):**

| Component | File | Placement |
|-----------|------|-----------|
| `RotationEntrySignals` → `SignalCard` | `entry-signals.tsx` | After stock symbol link, before conviction badge |
| `StockPicksPanel` | `stock-picks-panel.tsx` | After ROT badge, before company name |

Note: `TopPicksBySector` still supports INF/TRANS badges but is no longer rendered on the picks page.

**Badge styling:** `border-sky-500/30 bg-sky-500/10 text-sky-400 text-[8px] font-bold` (consistent with transition-daily). Tooltip: `Inflection: {trade_read} ({score})`.

**Resilience:** Fetch uses `.catch(() => {})` — if inflection API fails, no badges shown, no errors.

### Market Posture (`/sectors/brief`)
`computeMarketPosture()` in `brief.ts` classifies overall market posture:

| Posture | Condition | Notes |
|---------|-----------|-------|
| CASH | RISK_OFF + no non-EXIT conviction + extreme/rising VIX | Capital preservation |
| DEFENSIVE | RISK_OFF with no conviction, OR VIX rising + majority weak | Defensive sectors |
| AGGRESSIVE | RISK_ON + ≥2 HIGH/MODERATE rotations + dispersion > 5 | Capped to SELECTIVE if narrow leadership |
| SELECTIVE | RISK_ON/MIXED/INFLATIONARY + rotations or ≥3 leading/improving | Default for mixed conditions |

INFLATIONARY regime now explicitly routes to SELECTIVE (was falling through to generic default). Accepts optional `precomputedLeadershipHealth` parameter to avoid recomputing leadership health (brief page passes it from shared `useMemo`).

**Posture persistence** (`savePosture`/`loadPreviousPosture`): Uses ET timezone (`toLocaleDateString("en-CA", { timeZone: "America/New_York" })`) for date keys. Ensures posture change detection works correctly after 8 PM ET (when UTC date rolls over but market day hasn't changed).

**Previous snapshot timezone**: The brief page's `previousSnapshot` lookup also uses ET dates to find the correct "yesterday" snapshot.

### Persistence Functions (per table)
Each daily table has 5 standard functions in `persistence.ts`:
1. `upsert*()` — batch upsert with onConflict `"scan_date,ticker"`
2. `purgeOld*()` — DELETE where scan_date older than N days
3. `load*()` — SELECT * for a date, ordered by primary score DESC
4. `load*Dates()` — SELECT DISTINCT scan_date
5. `load*Multi()` — lightweight multi-date query for streak/delta computation

### Audit Standard
When asked for a "deep dive audit", "full audit", or similar, always check ALL of the following dimensions:

| # | Dimension | What to Check |
|---|-----------|---------------|
| 1 | **Functional correctness** | Logic bugs, wrong outputs, data flow errors, filter/gate misalignment, stale data, boundary conditions |
| 2 | **Code quality/resilience** | Retry limits, background tab guards, test coverage gaps, error boundaries, architectural debt, localStorage hygiene, type safety |
| 3 | **Content flow** | Is the right data reaching the right components? Values lost/misrepresented between API → state → render? Missing fields, null propagation |
| 4 | **User flow** | Does the user journey make sense? Can they accomplish goals efficiently? Are actions discoverable? |
| 5 | **Task flow** | Are multi-step tasks (scan → filter → pick → trade) connected properly end-to-end? |
| 6 | **Screen flow** | Do transitions between pages/views maintain context and state? Is information carried forward correctly? |
| 7 | **Navigation flow** | Are links/routes logical? Can users find what they need? Dead links, missing breadcrumbs? |
| 8 | **State flow** | Is state managed correctly across components? Stale state, race conditions, hydration mismatches? |
| 9 | **UX consistency** | Sort stability, default states, empty states, loading states, error states displayed to user |
| 10 | **Data accuracy** | Are displayed values correct against source data? Rounding errors, stale cache, timezone-shifted dates, wrong field mapped to UI label, units mismatch |
| 11 | **Edge cases** | Empty arrays, null/undefined handling, first-time user (no data), division by zero, timezone issues |

### Daily Page Pattern
All daily pages share: client component, date tabs, sortable table, filters, streak badges, score delta, dropped section, sector pills, CSV export, copy watchlist. Import `fmtNum` from `@/lib/daily-format` and wrap tables in `TableErrorBoundary`.

### Cron Route Pattern
All cron routes: CRON_SECRET auth via Bearer token, batched scanning with time guard, incremental persist, purge old data, full DB read for final counts. Individual scanner crons do NOT send Telegram — all alerts are consolidated via the nightly summary cron.

### Nightly Summary Cron
Sends 2 Telegram messages at 11 PM ET after all scanners finish:
- **Message 1 (Confluence):** Cross-scanner tiers (5/5 → 1/5), RS acceleration sorting, sector tags, new/dropped, copyable watchlist
- **Message 2 (Scanner Detail):** Per-scanner breakdowns with sub-scores and classifications

**Scanner label mapping (Telegram → internal):**
| Telegram Label | Scanner | What It Does |
|---------------|---------|-------------|
| `Setup` | PreRun | 5-preset pattern/setup scanner (LD, ST, SNDK, EM, PB). E+ deprecated, merged into ST. |
| `Inflect` | Inflection | Inflection point detection (STARTER, ADD_ON, WATCH) |
| `Trans` | Transition | Market structure transitions (TRIGGERED + READY by score) |
| `Inst` | Institutional | Institutional flow quality (SL, WL, SPEC) |
| `Rot` | PreRunner | Rotation leaders/turnarounds radar |
| `QFE` | QFE | Quality-Factor-Entry rating (A+ → C) — badge only, not counted for confluence |
| `VCP` | VCP | Volatility contraction patterns (FOCUS, WATCH, EARLY) — badge only, not counted for confluence |
| `Setup4h` | PreRun 4h | 4h-candle variant of PreRun (barMultiplier=6) — badge only, not counted for confluence |

**Confluence rules:**
- 5 independent scanners counted: Setup, Inflect, Trans, Inst, Rot
- QFE excluded (derived from PreRun data)
- VCP excluded (significant overlap with Setup criteria N + L)
- Setup4h excluded (same scoring methodology as Setup, different timeframe)
- INF WATCH excluded from confluence count (badge only)
- INF AVOID excluded entirely (negative signal)
- Setup entries with score 0 excluded (noise)
- `resultToRecord()` guards: `finalScore > 0` required for persistence (prevents gate-failed stocks from being saved)
- 4h-ONLY section in Message 1: tickers on 4h scanner but NOT daily Setup (early detections)

**Key file:** `src/app/api/nightly-summary/cron/route.ts`

### Funnel Backtest (Composite Scoring)
Cross-scanner stock picker that replaces sequential AND gates with a composite scoring system. Each scanner contributes points proportionally — a stock doesn't need every scanner to flag it, just enough total conviction across whichever scanners do.

**API:** `GET /api/backtest/funnel?days=14` — loads persisted scanner data for N days, computes composite scores, fetches Yahoo charts for forward returns.

**Composite Score Formula (0-100 max):**

| Component | Max Pts | Source | Base Points |
|-----------|---------|--------|-------------|
| PreRun (A) | 25 | `prerun_daily` | final_score tiers (3-12) + preset bonus (best: EM/ST=5, PB=4, LD/SNDK=3) + structural bonus (OBV+VP+HL+PRIORITY, cap 4) |
| Inflection (B) | 25 | `inflection_daily` | trade_read (STARTER=10, ADD_ON=8, WATCH=3, AVOID=-5) + stage bonus (INF=4, EA/SE=3, EXP=2) + score bonus (>=60=4, >=45=2, >=35=1) + quality (is_primary+2, is_stronger+2) |
| Transition (C) | 20 | `transition_daily` | alert_state (TRIGGERED=8, READY=6, ARMED=3, WATCH=1) + score bonus (>=60=4, >=45=2, >=35=1) + state bonus (EARLY_EXP/MARKUP=3, BOS/COMP=2, CHOCH/HL=1) |
| Institutional (D) | 15 | `institutional_daily` | tier (SHORTLIST=7, WATCHLIST=4, SPEC=2) + score bonus (>=60=3, >=45=2) + entry quality (HIGH=3, MOD=1) |
| PreRunner (E) | 10 | `prerunner_daily` | type (LEADER=4, TURNAROUND=3) + RS bonus (improving+accel=3, improving=1) + conviction (HIGH=2, MED=1) |
| Confluence (F) | 5 | weighted count | >=4=5, >=3=3, >=2.5=2, >=2=1 |

**Pipeline:**
1. Build weighted confluence per ticker (same rules as nightly summary)
2. Pool: weighted confluence >= 2.0
3. Score each ticker across 6 components (A-F)
4. Filter: compositeScore >= 25
5. Sort: compositeScore DESC, RS acceleration tiebreaker
6. Cap: top 15 per day

**Forward returns:** Fetches 6mo Yahoo daily charts, computes 1d/3d/5d returns + MFE/MAE from signal date close.

**Diagnostics per day:** poolSize, qualifiedCount, pickedCount, avgCompositeScore, scannerCoverage (how many pool tickers each scanner contributed to).

**Key files:**

| File | Purpose |
|------|---------|
| `src/app/api/backtest/funnel/route.ts` | API route — composite scoring, chart fetching, forward returns |
| `src/app/prerun/backtest/page.tsx` | UI — summary cards, score distribution bar, per-day table with expandable picks, score breakdown pills |

## Open Items / Known Gaps
- **Transition scanner promoted to confluence:** Structural complement to Inflection (pivots/ChoCH/BOS vs statistical components). VCP demoted to badge-only (significant overlap with Setup criteria N + L). NON_CONFLUENCE set: QFE, VCP, Setup4h.
- **VCP + Institutional crons untested:** Built but not manually triggered yet — universe is ~470, likely fits in one pass.
- **Preset-resume may be redundant:** With SP400 dropped and universe at ~470, the preset cron likely completes in a single pass. The resume cron at 02:06 is still scheduled as a safety net but may not be needed. Monitor scan completion counts.
- **NDX100 rebalance maintenance:** NDX100_MEMBERS updated for June 22, 2026 rebalance + July 7, 2026 SPCX addition. Next rebalance is September 2026 — update `src/data/index-tiers.ts` when announced. No automated rebalance cron (index changes are infrequent, ADDITIONAL_MEMBERS requires human judgment).
- **ADDITIONAL_MEMBERS maintenance:** The 86 curated tickers in ADDITIONAL_MEMBERS need periodic review. Stocks may delist, change tickers, or fall below quality gate thresholds permanently. Review quarterly alongside NDX100 rebalance. Last cleanup 2026-07-11: removed CELH/ELF/LEGN (mcap), DDOC (invalid ticker), SPCX (promoted to NDX100); fixed SQ→XYZ; added TTAN, IONQ.

## Environment Variables
Key env vars (set in Vercel + `.env.local`):
- `CRON_SECRET` — Bearer token for cron auth
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — Telegram alerts (default channel)
- `TELEGRAM_CHAT_ID_NIGHTLY` — Nightly summary channel (falls back to `TELEGRAM_CHAT_ID`)
- `TELEGRAM_CHAT_ID_BRIEFING` — Daily briefing channel (falls back to `TELEGRAM_CHAT_ID`)
- `TELEGRAM_CHAT_ID_SECTOR` — Sector rotation + policy pulse channel (falls back to `TELEGRAM_CHAT_ID`)
- `TELEGRAM_CHAT_ID_REALTIME` — Real-time alerts: targets, watchlist, squeeze, EW (falls back to `TELEGRAM_CHAT_ID`)
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — DB access
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — Payments
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Client-side DB

## Manual Cron Triggers
```powershell
# Preset scan (normal)
$headers = @{ Authorization = "Bearer RITVIK" }
Invoke-RestMethod -Uri "https://ew-scanner.vercel.app/api/prerun/cron/preset" -Headers $headers -TimeoutSec 350

# Preset scan with clear + resume (full re-scan)
Invoke-RestMethod -Uri "https://ew-scanner.vercel.app/api/prerun/cron/preset?clear=true" -Headers $headers -TimeoutSec 350
Invoke-RestMethod -Uri "https://ew-scanner.vercel.app/api/prerun/cron/preset?resume=true" -Headers $headers -TimeoutSec 350
```
