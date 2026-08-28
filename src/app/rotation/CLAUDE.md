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
