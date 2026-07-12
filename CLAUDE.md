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
| `supabase/migrations/` | SQL migration files (001-019) |

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

### Cron Schedule (15 jobs)
| UTC | ET | Days | Route | Notes |
|-----|-----|------|-------|-------|
| 00:00 | 8:00 PM | Tue-Sat | `/api/discovery/cron` | Trending ticker discovery (CoinGecko + Yahoo) |
| 22:00 | 6:00 PM | Mon-Fri | `/api/sector-rotation/alert` | Sector quadrant transition alerts |
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
| 13:00 | 9:00 AM | Mon-Fri | `/api/daily-briefing/cron` | Pre-trade 4-level briefing + direction |
| 06:00 Sun | 2:00 AM Sun | Sunday | `/api/sector-rotation/institutional-refresh` | Weekly institutional data refresh |

### Universal Quality Gate
All cron scanners and the sector rotation stock enrichment share a universal quality gate that filters low-quality stocks before scoring. Applied after data fetch but before any scoring logic runs.

**Scanner gate** (`passesUniverseQualityGates()` in `src/lib/prerun/scoring.ts`):
| Check | Threshold | Field |
|-------|-----------|-------|
| Price | >= $10 | `currentPrice` |
| Price | <= $1000 (except Semiconductors) | `currentPrice` |
| Market cap | >= $8B | `marketCap` |
| Dollar volume | >= $100M/day | `vcpAvgDollarVolume` (50d avg) |
| Data quality | >= 40% | `dataQuality` (% of API calls that succeeded) |
| Max ATR% 60d | >= 1.2% | `maxAtrPct60d` (max ATR(14)/close over ~60 trading days) |

**Persistent non-scorer gate** (applied BEFORE `fetchPreRunData` in cron routes):
Loads all distinct tickers from 7 scanner tables (`loadAllScoredTickers()` in `persistence.ts`). If a ticker has never appeared in any scanner result during the 14-day retention window, it is skipped entirely (no API call). Safety: only activates when `scoredTickers.size > 50` (prevents empty-DB edge case from filtering everything). Applied in 5 cron routes: PreRun preset, PreRun 4h, Inflection, Transition, VCP.

**Sector rotation gate** (`applyQualityGates()` in `src/lib/sector-rotation/stock-enrichment.ts`):
Thresholds via `QUALITY_GATES` in `config.ts`: `MIN_PRICE: 15`, `MAX_PRICE: 1000 (except Semiconductors)`, `MIN_MARKET_CAP: 15B`, `MIN_DOLLAR_VOLUME: 150M`, `MIN_AVG_VOLUME: 1.5M`. Plus existing gates (volume spike, extension, institutional %, trend, sector correlation). Additional gates: `APPLY_SCAN_EXCLUSIONS: true` rejects the 133 SCAN_EXCLUSIONS tickers before any other gate check; `REJECT_NULL_MARKET_CAP: true` fails stocks with null market cap (aligns with PreRun treating null as 0). SCAN_EXCLUSIONS also applied upstream in `sector-rotation.ts` (pre-filters batch quote list) and `rotation-tracker.ts` (filters stock symbols before chart fetches).

**Rotation tracker gate** (`fetchStockPerformance()` in `src/lib/sector-rotation/rotation-tracker.ts`):
Lightweight pre-filter before fetching 6mo charts: `price >= MIN_PRICE ($10)`, `dollarVol >= MIN_DOLLAR_VOLUME ($100M)`. Plus SCAN_EXCLUSIONS filtering when collecting stock symbols. Saves chart API calls for low-quality stocks.

**Applied in 6 cron routes:** PreRun preset, PreRun 4h, Inflection, Transition, VCP, Institutional. NOT applied to single-ticker API routes (explicit user lookups) or PreRunner (uses `computePreRunnerRadar()`).

### Preset Cron Details
- **Universe:** SP500 + NDX100 + ADDITIONAL_MEMBERS minus SCAN_EXCLUSIONS (~467 unique tickers). Built via `buildScanUniverse()` in `index-tiers.ts`.
- **SCAN_EXCLUSIONS (133 tickers):** Structurally boring stocks excluded from scanning — ultra-low ATR%, secular decline, or utility-like behavior. Defined in `src/data/index-tiers.ts`. Sectors: Industrials (20: ROL, RSG, WM, CHRW, SWK, MMM, TXT, AOS, ALLE, PNR, NDSN, DOV, EXPD, ITW, OTIS, ROK, SNA, UPS, WAB, XYL); Financials (18: BEN, IVZ, GL, CINF, AIZ, L, NTRS, PFG, STT, KEY, RF, AFL, AIG, ALL, MET, PRU, TFC, USB); Consumer Disc (11: F, GM, GPC, HAS, RL, MAS, TGT, LVS, APTV, NKE, PHM); Health Care (12: JNJ, PFE, BAX, VTRS, HSIC, CVS, DVA, BDX, CAH, DGX, HUM, MDT); Consumer Staples (14: ADM, BF.B, CAG, CHD, CL, CLX, GIS, HRL, KHC, KMB, MKC, MO, SJM, TAP); Utilities (22: AEE, AEP, ATO, AWK, CMS, CNP, D, DTE, DUK, ED, EIX, ES, ETR, EVRG, FE, LNT, NI, PEG, PNW, PPL, SO, WEC); Real Estate (20: ARE, AVB, BXP, CPT, DOC, EQR, ESS, EXR, FRT, HST, INVH, KIM, MAA, O, PSA, REG, UDR, VICI, VTR, WY); Materials (5: AMCR, AVY, IFF, IP, LYB); Energy (3: APA, HAL, KMI); Comms (5: FOXA, NWS, NWSA, T, VZ); Technology (3: HPE, HPQ, NTAP). Review quarterly.
- **SP400 dropped:** Removed from all scan universes. Notable SP400 stocks rescued to ADDITIONAL_MEMBERS.
- **NDX100 updated:** Reflects June 22, 2026 quarterly rebalance (added ALAB, ALNY, CRWV, NBIS, RKLB, TER; removed CHTR, CTSH, VRSK, ZS)
- **Universal quality gate:** Filters ~100+ stocks before scoring (price < $10, mcap < $8B, dollarVol < $100M, dataQuality < 40%, maxAtrPct60d < 1.2%)
- **Non-scorer gate:** Skips tickers never seen in any scanner table (saves API calls). Loaded once at cron start via `loadAllScoredTickers()`.
- **Vercel limit:** 300s maxDuration, 240s time guard for Telegram
- **Single-pass system:** ~467 tickers typically fits in one pass. Resume pass available if needed.
- **4h scanner:** May still need 2 passes (larger Yahoo 2y:1h chart responses slow each ticker)
- **Batch settings:** BATCH_SIZE=15, BATCH_DELAY=500ms, PERSIST_INTERVAL=50
- **Params:** `?clear=true` (delete today's data before scan), `?resume=true` (skip existing tickers)
- **Telegram:** Always sends summary using full DB data (not in-memory partial)
- **Noise guards:** `finalScore > 0` required for persistence, Leading preset uses `finalScore` not `totalScore`

### ADDITIONAL_MEMBERS (86 curated tickers)
Non-index stocks added to the scan universe for momentum/breakout relevance. Defined in `src/data/index-tiers.ts`. Tier 2 for `getTickerTier()`. Last updated 2026-07-11.

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

### Preset Qualification Criteria
| Preset | Key Criteria |
|--------|-------------|
| SNDK | pctFromAth >= 40 *(stale 2-6d)*, shortFloat >= 15 *(stale 14-35d FINRA)*, finalScore >= 18, scoreF >= 1 *(fresh EOD)* |
| Early Mover | pctFromAth >= 25 *(stale 2-6d)*, finalScore >= 14 (daily) / >= 16 (4h), M2+L+F all >= 1 *(fresh EOD)* |
| Pullback | pctFromAth <= 40 *(stale 2-6d)*, finalScore >= 17 (daily) / >= 18 (4h), F >= 1 + L >= 1 *(both fresh EOD)* — M2 intentionally excluded (late signal) |
| Leading | finalScore >= 18 (daily) / >= 20 (4h), M >= 1, J >= 1, F >= 1 *(fresh EOD)*, quadrant LEADING only *(stale up to 24h)* |
| Stealth | finalScore >= 14 (daily) / >= 15 (4h), M2 >= 1, OBV divergent or VP bullish *(all fresh EOD)* |
| Early+ | **Deprecated** — merged into Stealth (was 100% redundant). DB flag kept for schema compat. |

### Scoring Engines
| Engine | Function | Scale | Used By |
|--------|----------|-------|---------|
| Standard PreRun | `autoScorePreRun()` | 0-40 raw, 3 gates | Setup daily + 4h, QFE input |
| Inflection | `scoreInflection()` | 6 components, weighted 0-100 | Inflection daily |
| VCP | `scoreVCP()` | 5 components, max 100 | VCP daily |
| Institutional | `scoreInstitutionalAcceleration()` | 4 weighted components, max 100 | Institutional daily |
| PreRunner | `scorePreRunnerCandidates()` | 0-100 per candidate | Rotation leaders/turnarounds |
| QFE | `computeQFE()` | 4 components, weighted 0-100 | QFE rating (derived from PreRun) |
| Catalyst | `scoreCatalyst()` | 17 factors, normalized 0-100 | Catalyst spikes |
| Transition | `scoreTransitionWithOHLC()` | 8 components, weighted 0-100 | Transition daily |
| Squeeze | `calculateSqueezeScore()` | 7 components, max 100 | Squeeze setups |

All scoring functions are in `src/lib/prerun/` and use `fetchPreRunData()` from `src/lib/prerun/data.ts`.

### Scanner Architecture & Value Map

9 scanning engines, unified via nightly confluence. 5 count for confluence, 4 are badge-only. All scanners share a universal quality gate (`passesUniverseQualityGates()`) that filters stocks before scoring: price >= $15, price <= $1000 (except Semiconductors), mcap >= $8B, dollarVol >= $100M/day, dataQuality >= 40%.

**Confluence scanners (5):**

| Scanner | Label | Detects | Gates | Output | Key Files |
|---------|-------|---------|-------|--------|-----------|
| PreRun Setup | `Setup` | Base breakouts from deep pullbacks (20%+ from ATH) | G1: pctFromAth >= 20% (10% for 4h), G2: no existential risk, G3: price > 92% SMA20 | 18 criteria A-Q+M2 (max 40), verdicts PRIORITY/KEEP/WATCH/DISCARD, 5 presets (Early+ deprecated) | `scoring.ts`, `data.ts` |
| Inflection | `Inflect` | Accumulation cycle stage transitions (seller exhaustion → expansion) | Price >= $5, dollarVol >= $10M, mcap >= $500M | 6 components (SE/VC/BE/RS/LA/IP) weighted 0-100, stages + trade read (AVOID/WATCH/STARTER/ADD_ON) | `inflection-scoring.ts` |
| VCP | `VCP` | Volatility contraction patterns before breakouts | Price >= $10, vol >= 500K, dollarVol >= $20M, mcap >= $1B, above SMA50+SMA200 | 5 components (trend/vol/compression/RS/risk) max 100, phases FOCUS/WATCHLIST/EARLY/IGNORE | `vcp-scoring.ts` |
| Institutional | `Inst` | Large-cap institutional runners with momentum | Price >= $20, mcap >= $20B, dollarVol >= $100M, vol >= 1.5M | 4 weighted components (inst 35%/exec 25%/risk 25%/disc 15%), 12 classifications | `institutional-scoring.ts` |
| PreRunner | `Rot` | Sector rotation leaders + turnaround candidates | Min score threshold | LEADERs (from enrichment) + TURNAROUNDs (from rotation tracker), 0-100 score | `src/lib/prerunner/scoring.ts` |

**Badge-only (not counted for confluence):**

| Scanner | Label | Detects | Why Badge-Only |
|---------|-------|---------|----------------|
| QFE | `QFE` | Quality-Factor-Entry rating (A+ → D) + Buy/Wait/Avoid actions | 100% derived from PreRun data, no new information |
| PreRun 4h | `Setup4h` | Same as Setup but on 4h candles (barMultiplier=6, Gate1=10%) | Same scoring methodology as Setup, different timeframe |
| Inflection WATCH | `INF_WATCH` | Inflection WATCH trade reads | Low conviction signal |
| Transition | `Trans` | Market structure transitions (accumulation → markup) | Trial scanner — comparing against Inflection for overlap/quality |

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
| Transition | Market structure state machine (ChoCH, BOS, swing pivots) | Significant overlap with Inflection (both detect accumulation → markup), uses structural confirmation (pivots) vs statistical (component scores) |

### Transition Scanner
Detects market structure transitions from accumulation into early markup using swing pivot analysis, Change of Character (ChoCH), and Break of Structure (BOS). Created as a trial scanner to compare against Inflection — badge-only in nightly summary, not counted for confluence.

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
- Uses same universe as other scanners (~467 tickers)
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

**Scoring pipeline:** For each ETF: fetch 1y daily OHLCV → compute RS vs SPY → RRG quadrant (LEADING/IMPROVING/WEAKENING/LAGGING) → composite score (0-100) → acceleration, momentum, stealth detection → regime alignment. Acceleration uses fixed-range normalization (clamped to `COMPOSITE.ACCEL_NORM_FLOOR` / `ACCEL_NORM_CEILING`, default [-10, 10]) instead of min-max, preventing inflation during broad deterioration. Momentum composite weights are graduated (`SCORING_SIGNALS.MOMENTUM_WEIGHTS`: 63d=0.35, 126d=0.25, 189d=0.25, 252d=0.15). Stock enrichment applies universal quality gates (price >= $15, mcap >= $15B, dollarVol >= $150M, avgVol >= 1.5M) plus sector-specific gates (volume spike, extension, institutional %, trend, correlation), SCAN_EXCLUSIONS filtering, and null market cap rejection. Remaining null gate bypasses (institutional/ret20d) are tracked via `dataWarnings` on `EnrichedStock`.

**Centralized Config:** All thresholds live in `src/lib/sector-rotation/config.ts`. Sections: REGIME, COMPOSITE, ROTATION, QUALITY_GATES, CONVICTION, LEADERSHIP, RISK_FLAGS, POSTURE, SMART_MONEY, TOP_STOCK_WEIGHTS, CLASSIFICATION, SCORING_SIGNALS, ROTATION_LIFECYCLE, ROTATION_CONVICTION, SUB_SECTOR, CRYPTO_QUALITY_GATES, EXTENSION_TIERS, PRERUNNER, CRYPTO_WEIGHTS, PREMARKET_SCORING, POLICY_PULSE. **Never hardcode thresholds** — always add to config.ts and import.

**Key files:**
| File | Purpose |
|------|---------|
| `src/lib/sector-rotation/config.ts` | All thresholds and scoring breakpoints |
| `src/lib/sector-rotation/sector-rotation.ts` | Main scoring engine — `calculateSectorRotation()` |
| `src/lib/sector-rotation/stock-enrichment.ts` | Stock quality gates, classification (LEADER/CATCH_UP/TURNAROUND/AVOID), phase (P1-P4), conviction scoring, null-data warnings |
| `src/lib/sector-rotation/rotation-tracker.ts` | Active rotation detection — signal history, lifecycle stages (config-driven SMA periods, batch sizes), stock quality gates (price, dollarVol, SCAN_EXCLUSIONS) |
| `src/lib/sector-rotation/rotation-helpers.ts` | Lifecycle stage (with soft exhaustion zone at `EXHAUSTING_SOFT_DAYS`), conviction level, action signals |
| `src/lib/sector-rotation/regime.ts` | Macro regime classification (RISK_ON/OFF/INFLATIONARY/MIXED) with adaptive VIX bounds. All regimes have favored/avoid sectors (MIXED favors Health Care, Financials). |
| `src/lib/sector-rotation/brief.ts` | Market posture (AGGRESSIVE/SELECTIVE/DEFENSIVE/CASH), sector tiers, risk flags. `computeMarketPosture()` and `computeRiskFlags()` accept optional pre-computed `LeadershipHealth` to avoid duplicate computation. |
| `src/lib/sector-rotation/leadership-health.ts` | Leadership Health Score (0-100) from MAGS/QQQ/IWM/ARKK |
| `src/lib/sector-rotation/math.ts` | Momentum scoring, RS ratios (Mansfield with `isFinite` guard), RRG trail (lookback margin 20), CMF, OBV slope |
| `src/lib/sector-rotation/types.ts` | Core types: `SectorRotationScore`, `EnrichedStock`, `SectorRotationResult` |
| `src/lib/sector-rotation/rotation-types.ts` | Rotation tracker types: `RotationEvent`, `ActiveRotationDetail` |
| `src/lib/sector-rotation/sub-sector-constants.ts` | Sub-sector → parent GICS mapping, divergence threshold |
| `src/data/sector-universe.ts` | ETF definitions, category assignments, constituent stocks |

**UI Pages:**
| Route | File | Purpose |
|-------|------|---------|
| `/sectors` | `src/app/sectors/page.tsx` | Dashboard: RRG chart, sector cards, leadership baskets, sub-sectors, cross-asset |
| `/sectors/brief` | `src/app/sectors/brief/page.tsx` | Daily Brief: posture, trading bias, leadership health, sector tiers, risk flags |
| `/sectors/picks` | `src/app/sectors/picks/page.tsx` | Stock picks from enriched rotation data |
| `/sectors/crypto` | `src/app/sectors/crypto/page.tsx` | Crypto rotation dashboard |
| `/rotation` | `src/app/rotation/page.tsx` | Active rotation tracker with stock performance tables |

**API Routes:**
| Route | Purpose |
|-------|---------|
| `/api/sector-rotation` | Main data endpoint — returns all 31 ETF scores, leadership baskets, regime |
| `/api/sector-rotation/alert` | Sector snapshot persistence for alerting |
| `/api/premarket` | Pre-market futures, internals, trading bias, sector checklist |

### Pre-Market Trading Bias Engine
Computes structured trading bias from equity futures, VIX, and market internals.

**Inputs:** ES=F, NQ=F, YM=F, RTY=F (4 equity futures), VIX level, TICK/TRIN/ADD internals.

**Classification logic (`classifyBias`):**
1. **Magnitude gate:** If average absolute change < 0.15%, return Neutral (tiny moves are noise)
2. **Unanimous:** All 4 up → Strong Bull, all 4 down → Strong Bear
3. **Majority rules:** If more futures are down than up → Lean Bear (or Strong Bear if avg < -1.0%). Vice versa for bullish. Leadership shortcuts never override majority direction.
4. **Even split:** Use average change as tiebreaker (±0.3% threshold)
5. **Fallback:** biasScore from checklist scoring

**Outputs:** `TradingBias` object with bias, confidence (0-100), preferredDirection (Long/Short/Flat), leading/weakest asset, bestToTrade/assetToAvoid, dayType, VIX interpretation, playbook text, reasons array.

**Key files:**
| File | Purpose |
|------|---------|
| `src/lib/premarket/trading-bias.ts` | Bias classification, confidence, playbook generation |
| `src/lib/premarket/fetch.ts` | Yahoo Finance data fetching for futures + internals (2-min cache) |
| `src/lib/premarket/scoring.ts` | Checklist-based bias score (-10 to +10) |
| `src/lib/premarket/types.ts` | `TradingBias`, `FuturesSnapshot`, `PremarketData` types |
| `src/app/api/premarket/route.ts` | API route — aggregates futures, sector data, regime, posture |

### Crypto Rotation
Mirrors the equity sector rotation system for crypto assets. Uses adapted quality gates (lower market cap, dollar volume, wider extension thresholds) and reuses equity classification/conviction logic.

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
| `src/app/sectors/picks/page.tsx` | `/sectors/picks` — Enriched stock picks |
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

## Patterns & Conventions

### Centralized Config Pattern
All scoring thresholds for the sector rotation system live in `src/lib/sector-rotation/config.ts`. **Never hardcode numeric thresholds** in scoring logic — add them to config.ts and import.

**Key config sections and notable constants:**

| Section | Notable Constants |
|---------|-------------------|
| `COMPOSITE` | `ACCEL_NORM_FLOOR: -10`, `ACCEL_NORM_CEILING: 10` (fixed-range acceleration normalization), `ACTIONABLE_THRESHOLD`, `ACTIONABLE_HYSTERESIS`, `WATCH_THRESHOLD` |
| `SCORING_SIGNALS` | `MOMENTUM_WEIGHTS: { roc63: 0.35, roc126: 0.25, roc189: 0.25, roc252: 0.15 }`, `SIGMOID_EXPONENT: 0.4` |
| `ROTATION` | `RS_SMA_SHORT: 10`, `RS_SMA_LONG: 30`, `MIN_ALIGNED_BARS: 50`, `TRACKER_BATCH_SIZE: 15`, `TRACKER_BATCH_DELAY: 200`, `VOLUME_SURGE`, `SIGNAL_START`, `SIGNAL_END_DAYS` |
| `ROTATION_LIFECYCLE` | `EXHAUSTING_DAYS: 30` (hard cutoff), `EXHAUSTING_SOFT_DAYS: 25` (health-confirmed soft zone), `EARLY_MAX_DAYS`, `MATURING_MAX_DAYS` |
| `REGIME` | `DXY_TREND_THRESHOLD: 1` (absolute point change, not percentage) |
| `CLASSIFICATION` | `P4_RS_ACCEL`, `P4_SECTOR_ACCEL` (both must be negative — AND logic), `P3_MIN_VOL_RATIO` |

| `QUALITY_GATES` | `REJECT_NULL_MARKET_CAP: true` (null mcap = fail), `APPLY_SCAN_EXCLUSIONS: true` (133-ticker exclusion filter for enrichment + rotation tracker) |

Other sections: CONVICTION, LEADERSHIP, RISK_FLAGS, POSTURE, SMART_MONEY, TOP_STOCK_WEIGHTS, ROTATION_CONVICTION, SUB_SECTOR, CRYPTO_QUALITY_GATES, EXTENSION_TIERS.

### Stock Enrichment Phase Classification
Stocks passing quality gates are classified into phases in `stock-enrichment.ts`:

| Phase | Criteria | Notes |
|-------|----------|-------|
| P4_EXHAUSTING | Above 50MA AND both RS accel < `P4_RS_ACCEL` AND sector accel < `P4_SECTOR_ACCEL` | Requires BOTH negative — single negative metric doesn't trigger |
| P3_TRENDING | Above 50MA, positive accel, volRatio >= `P3_MIN_VOL_RATIO` | Strong trend with volume confirmation |
| P2_TURNAROUND | Above 50MA, positive accel, low volume (fallback) OR below 50MA with positive RS accel + volume | Above-50MA low-volume stocks use P2 (not P1 — can't be "basing" above 50MA) |
| P1_BASING | Below 50MA (fallback) | Early recovery, below key moving average |

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

### Persistence Functions (per table)
Each daily table has 5 standard functions in `persistence.ts`:
1. `upsert*()` — batch upsert with onConflict `"scan_date,ticker"`
2. `purgeOld*()` — DELETE where scan_date older than N days
3. `load*()` — SELECT * for a date, ordered by primary score DESC
4. `load*Dates()` — SELECT DISTINCT scan_date
5. `load*Multi()` — lightweight multi-date query for streak/delta computation

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
| `VCP` | VCP | Volatility contraction patterns (FOCUS, WATCH, EARLY) |
| `Inst` | Institutional | Institutional flow quality (SL, WL, SPEC) |
| `Rot` | PreRunner | Rotation leaders/turnarounds radar |
| `QFE` | QFE | Quality-Factor-Entry rating (A+ → C) — badge only, not counted for confluence |
| `Setup4h` | PreRun 4h | 4h-candle variant of PreRun (barMultiplier=6) — badge only, not counted for confluence |
| `Trans` | Transition | Market structure transitions (TRIGGERED + READY by score) — badge only, not counted for confluence |

**Confluence rules:**
- 5 independent scanners counted: Setup, Inflect, VCP, Inst, Rot
- QFE excluded (derived from PreRun data)
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
- **Transition scanner is a trial:** Created to compare against Inflection for detecting accumulation → markup transitions. Badge-only in nightly summary. After gating tuning, pass rate is ~45% (247/546). Produces 27 SE + 2 ACCUM stocks for early detection. After several days of parallel output, decide whether to promote to confluence, merge with Inflection, or remove.
- **VCP + Institutional crons untested:** Built but not manually triggered yet — universe is ~467, likely fits in one pass.
- **Preset-resume may be redundant:** With SP400 dropped and universe at ~467, the preset cron likely completes in a single pass. The resume cron at 02:06 is still scheduled as a safety net but may not be needed. Monitor scan completion counts.
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
