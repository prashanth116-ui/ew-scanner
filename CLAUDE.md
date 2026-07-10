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
| `prerun_daily` | `/api/prerun/cron/preset` | 6-preset daily scan (SNDK, Early Mover, Pullback, Leading, Stealth, Early+) |
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
| Price | >= $15 | `currentPrice` |
| Market cap | >= $8B | `marketCap` |
| Dollar volume | >= $100M/day | `vcpAvgDollarVolume` (50d avg) |
| Data quality | >= 40% | `dataQuality` (% of API calls that succeeded) |

**Sector rotation gate** (`applyQualityGates()` in `src/lib/sector-rotation/stock-enrichment.ts`):
Same thresholds via `QUALITY_GATES` in `config.ts`: `MIN_PRICE: 15`, `MIN_MARKET_CAP: 8B`, `MIN_DOLLAR_VOLUME: 100M`. Plus existing gates (volume spike, extension, institutional %, trend, sector correlation).

**Applied in 6 cron routes:** PreRun preset, PreRun 4h, Inflection, Transition, VCP, Institutional. NOT applied to single-ticker API routes (explicit user lookups) or PreRunner (uses `computePreRunnerRadar()`).

### Preset Cron Details
- **Universe:** SP500 + NDX100 + ADDITIONAL_MEMBERS (~605 unique tickers)
- **SP400 dropped:** Removed from all scan universes. Notable SP400 stocks rescued to ADDITIONAL_MEMBERS.
- **Universal quality gate:** Filters ~100+ stocks before scoring (price < $15, mcap < $8B, dollarVol < $100M, dataQuality < 40%)
- **Vercel limit:** 300s maxDuration, 240s time guard for Telegram
- **Single-pass system:** ~605 tickers typically fits in one pass. Resume pass available if needed.
- **4h scanner:** May still need 2 passes (larger Yahoo 2y:1h chart responses slow each ticker)
- **Batch settings:** BATCH_SIZE=15, BATCH_DELAY=500ms, PERSIST_INTERVAL=50
- **Params:** `?clear=true` (delete today's data before scan), `?resume=true` (skip existing tickers)
- **Telegram:** Always sends summary using full DB data (not in-memory partial)
- **Noise guards:** `finalScore > 0` required for persistence, Leading preset uses `finalScore` not `totalScore`

### ADDITIONAL_MEMBERS (81 curated tickers)
Non-index stocks added to the scan universe for momentum/breakout relevance. Defined in `src/data/index-tiers.ts`. Tier 2 for `getTickerTier()`.

| Category | Tickers |
|----------|---------|
| Tech / Software / Cloud | TSM, SNOW, NET, MDB, HUBS, IOT, CYBR, MNDY, PSTG, TWLO, OKTA, NTNX, GTLB, S, ESTC, TOST |
| Consumer / E-commerce | SHOP, SPOT, RBLX, DKNG, ONON, CAVA, CPNG, SE, CHWY, CELH, ELF |
| Fintech / Payments | NU, SQ, SOFI, AFRM |
| Social / Media | PINS, SNAP, RDDT, ZG, ROKU, ZM |
| Healthcare / Biotech | NVO, ALNY, NTRA, HALO, INSM, BMRN, VKTX, LEGN, SRPT |
| Industrials / Defense | HEI, BAH |
| Energy / Materials | CCJ, SCCO, ENPH, AA |
| Large ADRs | SAP, GSK, BHP, RIO, BABA, JD, LI, BIDU |
| Notable ex-SP400 | MANH, DUOL, RBRK, MDGL, WING, CROX, DKS, ETSY, MOD, POWL, IESC, FND, NBIX, UTHR, CYTK, LNTH, ITCI, THC, SFM, GLOB |
| Other | MTCH |

### Preset Qualification Criteria
| Preset | Key Criteria |
|--------|-------------|
| SNDK | pctFromAth >= 40, shortFloat >= 15, finalScore >= 18 |
| Early Mover | pctFromAth >= 25, finalScore >= 14, M2+L+F all >= 1 |
| Pullback | pctFromAth <= 40, finalScore >= 15, 2/3 of (M2, F, L) >= 1 |
| Leading | finalScore >= 15 (daily) / >= 18 (4h), M >= 1, J >= 1, quadrant LEADING/IMPROVING |
| Stealth | finalScore >= 11, M2 >= 1, OBV divergent or VP bullish |
| Early+ | finalScore >= 10, M2 >= 1, N >= 1, OBV divergent or VP bullish |

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

9 scanning engines, unified via nightly confluence. 5 count for confluence, 4 are badge-only. All scanners share a universal quality gate (`passesUniverseQualityGates()`) that filters stocks before scoring: price >= $15, mcap >= $8B, dollarVol >= $100M/day, dataQuality >= 40%.

**Confluence scanners (5):**

| Scanner | Label | Detects | Gates | Output | Key Files |
|---------|-------|---------|-------|--------|-----------|
| PreRun Setup | `Setup` | Base breakouts from deep pullbacks (20%+ from ATH) | G1: pctFromAth >= 20% (10% for 4h), G2: no existential risk, G3: price > 92% SMA20 | 18 criteria A-Q+M2 (max 40), verdicts PRIORITY/KEEP/WATCH/DISCARD, 6 presets | `scoring.ts`, `data.ts` |
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
| `src/app/api/transition/cron/daily/route.ts` | Cron route (01:55 UTC, BATCH_SIZE=10, BATCH_DELAY=1100ms) |
| `src/app/api/transition/daily/route.ts` | Read API (?date=, ?dates=true) |
| `src/app/prerun/transition-daily/page.tsx` | UI page with Top Picks banner, state distribution, INF cross-reference |
| `supabase/migrations/019_transition_daily.sql` | DB table with 8 component scores, state, alert_state, trigger/invalidation |

**Cron details:**
- Uses same universe as other scanners (~605 tickers)
- Fetches 3mo daily chart separately via `fetchYahooChart()` for OHLC data
- Calls `scoreTransitionWithOHLC()` with raw highs/lows/closes + 3-bar pivot
- Skips MARKDOWN state and gate failures before persisting
- BATCH_SIZE=10, BATCH_DELAY=1100ms (slower than preset due to separate chart fetch)

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
| Sub-Sectors | 8 | XHB, XME, KRE, XOP, IBB, HACK, KWEB, TAN |
| Cross-Asset | 5 | TLT, HYG, GLD, UUP, DBA |
| Leadership Baskets | 4 | MAGS, QQQ, IWM, ARKK |

**Scoring pipeline:** For each ETF: fetch 1y daily OHLCV → compute RS vs SPY → RRG quadrant (LEADING/IMPROVING/WEAKENING/LAGGING) → composite score (0-100) → acceleration, momentum, stealth detection → regime alignment. Stock enrichment applies universal quality gates (price >= $15, mcap >= $8B, dollarVol >= $100M) plus sector-specific gates (volume spike, extension, institutional %, trend, correlation).

**Centralized Config:** All thresholds live in `src/lib/sector-rotation/config.ts`. Sections: REGIME, COMPOSITE, ROTATION, QUALITY_GATES, CONVICTION, LEADERSHIP, RISK_FLAGS, POSTURE, SMART_MONEY, TOP_STOCK_WEIGHTS, CLASSIFICATION, SCORING_SIGNALS, ROTATION_LIFECYCLE, ROTATION_CONVICTION, SUB_SECTOR, CRYPTO_QUALITY_GATES, EXTENSION_TIERS. **Never hardcode thresholds** — always add to config.ts and import.

**Key files:**
| File | Purpose |
|------|---------|
| `src/lib/sector-rotation/config.ts` | All thresholds and scoring breakpoints |
| `src/lib/sector-rotation/sector-rotation.ts` | Main scoring engine — `calculateSectorRotation()` |
| `src/lib/sector-rotation/stock-enrichment.ts` | Stock quality gates, classification (LEADER/CATCH_UP/TURNAROUND/AVOID), phase (P1-P4), conviction scoring |
| `src/lib/sector-rotation/rotation-tracker.ts` | Active rotation detection — signal history, lifecycle stages |
| `src/lib/sector-rotation/rotation-helpers.ts` | Lifecycle stage, conviction level, action signals |
| `src/lib/sector-rotation/regime.ts` | Macro regime classification (RISK_ON/OFF/INFLATIONARY/MIXED) with adaptive VIX bounds |
| `src/lib/sector-rotation/brief.ts` | Market posture (AGGRESSIVE/ACTIVE/SELECTIVE/DEFENSIVE), sector tiers, risk flags |
| `src/lib/sector-rotation/leadership-health.ts` | Leadership Health Score (0-100) from MAGS/QQQ/IWM/ARKK |
| `src/lib/sector-rotation/math.ts` | Momentum scoring, RS ratios, CMF, OBV slope |
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

### UI Pages
| File | Route |
|------|-------|
| `src/app/prerun/preset-daily/page.tsx` | `/prerun/preset-daily` — 6 preset tabs + Daily/4h scanner toggle |
| `src/app/prerun/inflection-daily/page.tsx` | `/prerun/inflection-daily` |
| `src/app/prerun/vcp-daily/page.tsx` | `/prerun/vcp-daily` |
| `src/app/prerun/institutional-daily/page.tsx` | `/prerun/institutional-daily` |
| `src/app/prerun/transition-daily/page.tsx` | `/prerun/transition-daily` — Transition scanner (market structure) |
| `src/app/sectors/page.tsx` | `/sectors` — Sector rotation dashboard (RRG chart, cards, baskets) |
| `src/app/sectors/brief/page.tsx` | `/sectors/brief` — Daily brief (posture, bias, health, tiers) |
| `src/app/sectors/picks/page.tsx` | `/sectors/picks` — Enriched stock picks |
| `src/app/sectors/crypto/page.tsx` | `/sectors/crypto` — Crypto rotation dashboard |
| `src/app/rotation/page.tsx` | `/rotation` — Active rotation tracker |

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
All scoring thresholds for the sector rotation system live in `src/lib/sector-rotation/config.ts`. **Never hardcode numeric thresholds** in scoring logic — add them to config.ts and import. The config has 17 exported sections (REGIME, COMPOSITE, ROTATION, QUALITY_GATES, CONVICTION, LEADERSHIP, RISK_FLAGS, POSTURE, SMART_MONEY, TOP_STOCK_WEIGHTS, CLASSIFICATION, SCORING_SIGNALS, ROTATION_LIFECYCLE, ROTATION_CONVICTION, SUB_SECTOR, CRYPTO_QUALITY_GATES, EXTENSION_TIERS).

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
| `Setup` | PreRun | 6-preset pattern/setup scanner (LD, ST, SNDK, EM, PB, E+) |
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

## Open Items / Known Gaps
- **Transition scanner is a trial:** Created to compare against Inflection for detecting accumulation → markup transitions. Badge-only in nightly summary. After several days of parallel output, decide whether to promote to confluence, merge with Inflection, or remove. First scan showed 376/508 qualifying (74% pass rate) — likely too permissive, may need tighter gating.
- **VCP + Institutional crons untested:** Built but not manually triggered yet — universe is ~605, likely fits in one pass.
- **Preset-resume may be redundant:** With SP400 dropped and universe at ~605, the preset cron likely completes in a single pass. The resume cron at 02:06 is still scheduled as a safety net but may not be needed. Monitor scan completion counts.
- **ADDITIONAL_MEMBERS maintenance:** The 81 curated tickers in ADDITIONAL_MEMBERS need periodic review. Stocks may delist, change tickers (e.g., SQ→XYZ for Block), or fall below quality gate thresholds permanently.

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
