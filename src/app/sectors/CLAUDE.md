# Sectors Pages (`/sectors`, `/sectors/brief`, `/sectors/picks`)

UI conventions and component behavior for the sector-rotation pages. Loaded when working under `src/app/sectors/`.

### Dashboard Sector Cards
Each card: composite score ring, quadrant badge, trading action, CMF/RS/breadth stats, why text, top 3 stock pills, expandable stock table. `DEFAULT_COLLAPSED`: `["asset-panels", "correlation", "cross-pairs", "sector-comparison", "sector-history"]`. Sort stability via alphabetical tiebreakers.

**Trading action logic** (`getTradingAction()` in `helpers.ts`):

| Priority | Condition | Action |
|----------|-----------|--------|
| 1 | IMPROVING + accel > 0 | BUILD |
| 2 | LEADING + composite >= threshold + accel > 0 | TRADE |
| 3 | LEADING + composite >= threshold + accel <= 0 | WATCH |
| 4 | LEADING (below threshold) | WATCH |
| 5 | WEAKENING | TRIM |
| 6 | IMPROVING (accel <= 0) | WATCH |
| 7 | LAGGING + accel > 0 + composite >= watch threshold | WATCH |
| 8 | Default | AVOID |

**Why text** (`getWhyText()`): Maps trading action + quadrant + acceleration to descriptive text. Covers all WATCH subcases: LEADING-decelerating, LEADING-below-threshold, IMPROVING-stalled, LAGGING-early-signals.

**Card conviction scoring** (`getConvictionScore()` in `sector-card.tsx`, 0-11 additive):

| Signal | Points |
|--------|--------|
| sectorRS (or rsAccel) > 1 | 3 |
| sectorRS (or rsAccel) > 0 | 1 |
| aboveSma50 | 2 |
| volumeVsAvg >= 1.5 | 2 |
| volumeVsAvg >= 1.2 | 1 |
| rsImproving | 1 |
| verdict KEEP or PRIORITY | 2 |

Labels: HIGH >= 7, MED >= 4, LOW < 4. Prefers `sectorRS` (rotation tracker), falls back to `rsAccel`.

**Dashboard stock phase** (`getStockPhase()` in `helpers.ts`):

| Phase | Condition |
|-------|-----------|
| turnaround | Below 50MA + RS20d > 0 + rsAccel > 0 + vol >= 1.2x |
| basing | Below 50MA (all other) |
| exhausting | Above 50MA + sectorRS < -2 + !rsImproving (or rs20d < -5 fallback) |
| trending | Above 50MA + sectorRS > 0 (or rs20d > 0 fallback) |
| neutral | Everything else |

### Rotation Signals Panel (`/sectors/picks`)
`RotationEntrySignals` in `entry-signals.tsx`. Panel id `entry-signals` for localStorage compat.

**Noise filters:** EXIT excluded, blip filter, sustained filter (`isSignalSustained()`: trailing 20-day avg signalCount >= 1.0).

**The blip filter measures the LONGER of two clocks and is waived by a confirmed RS turn.** `daysActive` counts from the signal-count start bar, whose RS input is a 10d-vs-30d SMA cross and can be badly late: SMH on 2026-09-22 read Day 1 against an RS line that reclaimed its 20d on 09-17 and began rising 09-16. Filtering on the raw count rejected the youngest, strongest, highest-conviction rotation on the board for being young when only the detector was late. `rotationAgeSessions()` takes the longer clock; `turnCorroboratesRotation()` waives the threshold when the turn has cleared its slow SMA, since even the corrected age (3-4 sessions) misses a threshold of 5. **Requires CONFIRMED, never a bare TURN_DETECTED** — a plain reclaim carries no measured edge and admitting it reopens the filter to the noise it exists to remove. `MIN_ROTATION_DAYS` itself is unchanged.

**Filtered rotations are shown, not silently dropped.** The emerging/exiting/unsustained counts used to render only when `entries.length === 0`, so on a normal night a day-1 rotation vanished without trace. Ones under the age threshold now render in a muted dashed strip above the signal groups, labelled "Too young to qualify", carrying the RS turn badge and an explicit "not signals" caveat.

**Timing classification:**
| Timing | Condition | Color |
|--------|-----------|-------|
| EARLY | Days 1-7, or 8-10 without health confirmation | Green |
| CONFIRMED | Days 8-15 with CMF > 0 or accel > 0 | Cyan |
| DELAYED | Days 16-30 | Amber |
| MATURE | Days 30+ | Purple |

Sort: EARLY → CONFIRMED → DELAYED → MATURE, within tier by conviction DESC. Top stocks: (HIGH/MEDIUM conviction) AND (LEADER/TURNAROUND, or CATCH_UP with HIGH). Top 3 per rotation with L/T badges. Cross-section filtering via `onSectorClick` prop → `crossFilterSector` state. Grouped by timing tier with section headers.

**Panel badge:** Shows signal count + leader/turnaround counts (e.g., "3 signals" + "2L + 1T").

**Empty state:** Shows counts for emerging (< 5 days), exiting (EXIT action), and unsustained rotations.

### Stock Picks Panel
`StockPicksPanel` in `stock-picks-panel.tsx`. 9 filter dimensions all persisted via localStorage:

| Filter | Options |
|--------|---------|
| Conviction | ALL / HIGH / MEDIUM / WATCH |
| Sector | ALL / per-sector (dynamic) |
| Category | ALL / LEADER / CATCH_UP / TURNAROUND / AVOID |
| Phase | ALL / P1-P4 |
| Quadrant | ALL / Leading+Improving / individual |
| RS Accel | all / positive / strong (>=3) |
| Volume | all / above avg (>=1.0x) / high (>=1.5x) |
| 50MA | all / above / below (null-safe: "below" excludes null SMA50) |

"Top Picks" preset: HIGH + LEADER + Leading/Improving + strong RS + P3. Cross-filter from Entry Signals via `crossFilterSector` prop. INF/TRANS cross-reference badges. Scan refresh UI via `scanActions` prop.

Note: `TopPicksBySector` component still exists but is **no longer rendered** on the picks page (removed during UX consolidation).

### INF Cross-Reference Badge (`/sectors/picks`)
Picks page fetches inflection + transition scanner data in parallel on mount → builds `Map<string, { trade_read, score }>` and `Map<string, { alert_state, state, score }>` keyed by ticker → passes `inflectionMap` and `transitionMap` props to components.

**Badge locations:** `RotationEntrySignals` (after stock symbol, before conviction badge) and `StockPicksPanel` (after ROT badge, before company name).

**Badge styling:** `border-sky-500/30 bg-sky-500/10 text-sky-400 text-[8px] font-bold`. Tooltip: `Inflection: {trade_read} ({score})`.

**Resilience:** Fetch uses `.catch(() => {})` — if API fails, no badges shown, no errors.

### Market Posture (`/sectors/brief`)
CASH (RISK_OFF + no conviction + extreme VIX), DEFENSIVE (RISK_OFF), AGGRESSIVE (RISK_ON + ≥2 rotations + dispersion > 5, capped to SELECTIVE if narrow leadership), SELECTIVE (default mixed). INFLATIONARY explicitly routes to SELECTIVE. Uses ET timezone for date keys (`toLocaleDateString("en-CA", { timeZone: "America/New_York" })`).

**Brief page specifics:** Posture (position 1), trading bias with embedded pulse data (`PulseCompactRow`), leadership health (computed once, shared with posture + riskFlags), sector tiers (ETF-level only, "See stocks →" link to picks), risk flags. Stale snapshot guard: ignores previous snapshots older than 3 days. All date comparisons use ET timezone.
