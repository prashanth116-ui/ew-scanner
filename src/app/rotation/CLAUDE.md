# Rotation Page (`/rotation`)

Loaded when working under `src/app/rotation/`.

Active rotation tracker with stock performance tables. Collapsible panels: Recently Ended, 12-Month Timeline, Pattern Statistics (collapsed by default). Compact regime pill (inline). Phase classification (`getRotationStockPhase`): turnaround uses `isTurnaroundCandidate`, below-50MA uses `trendAccel`, above-50MA uses `rsAcceleration` (stock vs sector ETF) instead of `trendAccel`. Sparkline: average-per-bin downsampling (50 max points). Exit warnings: non-overlapping 3-day windows (min 6 history entries for short path, 10 for full 5v5).

## Active Rotations: two views, one row model

Cards and the sortable comparison table both render `RotationRow[]` from `buildRotationRows()`. Derive any new per-rotation judgement there, not inside a view - the two views showing different verdicts for the same rotation is the failure this prevents. Toggle persists in `localStorage` under `ew-rotation-view-v1`.

Breadth comes from `/api/sector-rotation` and must be looked up against **all four** score groups (`sectors` + `subSectorScores` + `crossAssetScores` + `leadershipBasketScores`), held in `allSectorScores`. An active rotation is frequently a sub-sector - AIQ, ITA, KRE - and none of those appear in `sectors`, so a GICS-only map silently renders the card with no Breadth chip rather than failing. `heatmapSectors` stays GICS-only because it feeds the heatmap strip.

## Action signal: momentum gate + WAIT

`computeActionSignal()` takes an optional 4th `health` argument and blocks both capital-committing actions when `acceleration <= 0`: ENTER downgrades to WAIT, ADD ON PULLBACK downgrades to HOLD (you already own it; the read is "stop adding", not "get out"). Conviction cannot catch this alone - a decelerating rotation reaches the MODERATE floor of 3 on quadrant and flow by itself (+2 improving, +1 inflow, +1 signals, -1 acceleration).

`WAIT` exists because the old fallback labelled every unresolved rotation "HOLD - TIGHTEN STOPS", which tells you to manage a position you have no reason to hold in a rotation five days old. WAIT is used for EARLY only; MATURING and later still fall back to HOLD. Pass `getHealth(event)` at every call site - omitting it restores the pre-gate behaviour silently.

## Conviction reason

`ConvictionResult` carries `positives` / `negatives` alongside `reason`. Factors are ranked by points contributed, not by evaluation order: the quadrant slot is pushed first unconditionally, so the old `factors[0]` "top factor" was positional. Negatives render behind `against:`, never joined after a `+` - the previous string produced cards reading "MODERATE conviction: leading quadrant + negative acceleration, strong inflow", where a factor that cost a point scanned as support.

## Volume surge is calibrated, not broken

`signals.volumeSurge` fires on 2 of the last 5 sessions above 1.5x the 20d average volume (`ROTATION.VOLUME_TREND_*`). Measured over 2y across 20 sector ETFs it is on 11.3% of ETF-days and is the decisive second vote on 3.1% - which is why it reads as false on nearly every card. That is the conjunction, not the multiplier: single days above 1.5x occur on 10.6% of ETF-days. Loosening to 2-in-10 doubles the on-rate to 24.7% but *reduces* detected rotation starts (167 vs 174), because a more persistent volume signal stops the "prior 5 days all weak" precondition from ever being met. Leave it alone; changing it recalibrates every historical event.

## Entry screen (`entry-screen.ts`)

Two decisions then a veto. Gate the rotation on breadth >= 60% / CMF(20) > 0 / 20d acceleration > 0; screen members on close above the prior 20-day high + 20d return in the top half of the basket + ATR% >= 3.0; then **skip the rotation entirely if fewer than 3 names qualify**. Thresholds live in `ENTRY_SCREEN` in `config.ts`. Hold is 20 trading days.

**The veto is the load-bearing part, and the qualifying count is the UI.** Over 78 rotations across 18 sector ETFs (Mar 2025 - Jul 2026): 1 qualifying name ran 57% positive, 2 ran 30%, 3+ ran 87%. The number of members able to post a breakout with above-median strength *is* a breadth reading. At these settings the screen fires on 8 of 78 rotations, 57 names, 89.5% positive, 8 of 8 rotations profitable, mean +17.0%.

**`MIN_ATR_PCT` is absolute, not a basket rank, and that is deliberate.** A rank forces the same fraction on every sector - 40% of IGV and 40% of XLU - when IGV carries ~46 members clearing 3% ATR and XLU carries ~4. The absolute floor lets the position count scale with the sector's real opportunity set (IGV 2026-07-28 yields 20 names; a top-50% ATR rank yields 4), and `MIN_QUALIFYING` removes the low-vol baskets rather than letting them contribute their two most erratic names. An earlier rank-based version scored 63% on non-tech names against a 65% non-tech baseline - it was a software rule in disguise.

**Everything that decides the verdict is as-of the rotation start bar, never today.** `atrPctAtStart` / `ret20AtStart` / `breakout20AtStart` / `aboveSma50AtStart` are computed in `fetchStockPerformance()` on the bar matching `startDate`, and `cmfAtStart` / `accelAtStart` in `buildEvent()` from the same bar. That is where the study validated them; re-running the screen against today's bars is a different, untested signal. None of it costs extra API calls - the 6mo stock charts and the aligned ETF series are already fetched.

**Two gates, one verdict.** `EntryScreenResult.gate` is the start-bar reading and is the only thing that can change the verdict. `EntryScreenResult.live` re-reads the same three inputs on the latest bar and is a health signal only; `liveGateDrift()` reports `faded` (passed at entry, fails now) or `recovered` (failed at entry, passes now). The UI renders the live row dimmed under a "now" label. A `recovered` rotation is explicitly **not** a validated entry - the study only ever tested entering on the start bar.

**Gate acceleration is not `health.acceleration`.** The gate uses 20d ROC minus 20d ROC twenty bars earlier; `calcAcceleration()` differences the ROC over 5 bars. The 20-bar version is what the `> 0` threshold was calibrated against, and both gate readings use it so they stay comparable.

**Breadth for both gates comes from the rotation's own member rows**, not `SectorRotationScore.breadthPct`, so the denominator matches the set the screen runs on. It also means the screen no longer depends on `/api/sector-rotation` at all, and sub-sector baskets that report a null sector-level breadth are still screenable. Below 5 members with a resolvable SMA50 the reading is null and the verdict is `NO_DATA` - a percentage over three names is noise, not breadth.

**`topFractionCut()` has an inclusive boundary on purpose.** Index `floor(n * keepTop)` is itself returned and callers compare with `>=`, so six names at keepTop 0.5 admit four, not three. This reproduces the calibration cut-off; `entry-screen.test.ts` asserts it so a later "off-by-one fix" cannot silently recalibrate the rule.

A missing gate input is never a pass - sub-sector and cross-asset baskets legitimately report null breadth, and those rotations return `NO_DATA`.

## Relative strength: two levels, two denominators

- **Stock RS (`rsVsSector20`, the `RS/Sec` column)** is 20d return minus the **sector ETF's** over the same window. Deliberately not vs SPY: inside one basket on one date, subtracting an index return is the same constant for every member, so RS-vs-SPY ranks *identically* to the raw return column and adds nothing. Confirmed in the study - `ret20`, `rs20_spy` and `rs20_etf` produced identical ICs to three decimals.
- **Sector RS** on the card is `mansfieldRS` - % deviation of the sector/SPY ratio from its own 200d average, zero-centred, so it measures out-performance rather than direction.

⚠️ The older `SecRS` column is RS **acceleration** (5d vs 20d), a different thing. It scored a consistently **negative** IC in the entry study (-0.095, stable train to test): names already bursting against their own sector underperformed over the next 20 days. Its tooltip says so. Read a high value as caution, not confirmation.
