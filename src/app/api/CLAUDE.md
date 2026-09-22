# API Routes — Alert & Summary Cron Behavior

Message formats, stock-selection pipelines, and confluence rules for the Telegram-alert crons. Loaded when working under `src/app/api/`.

### Sector Rotation Alerts
**6 PM alert** (`/api/sector-rotation/alert`, 22:00 UTC weekdays): 2 Telegram messages — (1) quadrant transitions, (2) rotation tracker changes.

**Change types detected (Message 2):**

| Type | Condition | Actionability |
|------|-----------|---------------|
| `new_rotation` | sectorId in current but not in previous | High — position early |
| `rotation_ended` | sectorId in previous but not in current | Medium — exit/reduce |
| `lifecycle_upgrade` | Lifecycle stage improved (e.g., EARLY → MATURING) | Medium — add on confirmation |
| `lifecycle_warning` | Lifecycle stage worsened (e.g., MATURING → LATE) | High — tighten stops |

**Lifecycle ordering:** EARLY (0) → MATURING (1) → LATE (2) → EXHAUSTING (3). Current < previous = upgrade, current > previous = warning.

**Stock selection pipeline** (per-rotation top 15, categories mutually exclusive, earlier takes priority):

| Category | Filter | Sort |
|----------|--------|------|
| Turnaround | `isTurnaroundCandidate && volumeConsistency >= 2` | rsDelta DESC |
| Inflection | `rsDelta > 0 && volumeConsistency >= 1 && rsAcceleration > 0` | rsDelta DESC |
| Leading | `aboveSma50 && rsAcceleration > 0 && volumeConsistency >= 1` | rsDelta DESC |
| Momentum | `aboveSma50 && performancePct > 0` (fallback) | performancePct DESC |

Pre-filters: `dailyChangePct < 8%` + AVOID excluded. Per-category cap 8, combined cap 15.

**Cross-scanner confluence:** Loads PreRun (`PRIORITY`/`KEEP`), Inflection (`STARTER`/`ADD_ON`), Transition (`TRIGGERED`/`READY`), Institutional (`SHORTLIST`/`WATCHLIST`) data for current date. Multi-system confirmed stocks shown with scanner badges in Telegram messages.

**Tradeable candidates (NOT breadth):** `RotationSnapshot.candidates = { tradeable, tracked }`, displayed as `🎯 N/M tradeable`. `tracked` is what the rotation tracker fetched (price >= $10, dollar vol >= $200M, resolvable chart); `tradeable` is that set minus names gapping >= 8% and minus enrichment `AVOID`.

⚠️ This was called **breadth** and printed as "N/M stocks qualify (Broad — wide participation)". It is not breadth and moves the opposite way: the count FALLS when a sector strengthens, because a stock ripping 8%+ is excluded as untradeable. On 2026-08-19 MRNA +177% *reduced* the biotech figure to 8/10 while real biotech breadth was 82% and rising. Real breadth is `SectorRotationScore.breadthPct` (% of members above their own 50d SMA) — it feeds 15% of the composite and is what `/sectors` displays. Guarded by `candidates.test.ts`.

**Historical stats:** Pattern stats enriched onto rotation changes. Shows `📈 Avg +X.X% over Nd (N prior rotations)`.

**Resilience:** `calculateRotationTracker()` wrapped in try/catch — if it fails, Message 1 (quadrant transitions) still fires.

**11 PM confluence** (`/api/sector-rotation/confluence`, 03:02 UTC): 1 Telegram message — rotation × scanner confluence using fresh scanner data. Runs AFTER all nightly scanners finish (~02:50 UTC), ensuring tonight's scanner data (reflecting today's close) instead of ~20-hour-old stale data from the previous night.

**Message format:** Focus tier (EARLY/MATURING) shows full stock detail with scanner hits; Monitor tier (LATE/EXHAUSTING) shows compact ticker lists. NEW detection via KV-persisted previous tickers (skipped on cold start). Cap: 5 stocks per rotation, deduped. Footer: watchlist grouped by ETF. Returns `null` if no scanner-hit stocks found.

**RS Turns header block** (`formatRotationTurns()` in `transitions.ts`): prepended to the confluence message, above a divider. Says WHERE money started moving; the confluence body below says WHICH of your names are in it — splitting them across two notifications means reading one without the other. It leads because it is the earlier signal: the 6 PM quadrant-transition alert fires 3-5 sessions later by construction (SMH would have alerted 2026-09-21, worth 0.00% vs SPY held to that close, against +6.67% from the 09-16 forming print and +4.89% from the 09-17 reclaim).

Two tiers, and the difference is load-bearing: **TURNED** = RS line closed back above its 20d today; **FORMING** = still *below* it but rising two sessions with the gap closing. FORMING has **no measured forward edge** (see the Rotation Turn section in the root CLAUDE.md) and the message says so inline — never reword it into a buy signal. Only UP turns are listed; this alert is about rotation *in*.

**Lead is the sort key and is stated in words.** Turns split into ★ *ahead of the quadrant* and ↺ *RE-ENTRIES — no lead*, the latter below a divider. A `quadrantAlreadyAligned` turn is a dip-and-recover inside a trend the 6 PM alert already covers; the first live send went out on IGV and XLC presented identically to an SMH-grade call, which is the one mistake that makes the section untrustworthy. Every line says why it does or does not lead.

**Member ranking is `pctFromSma50`, never `rsAccel`.** `rsAccel = pctFrom50 − pctFrom200` is "naturally deeply negative for healthy uptrends" (root CLAUDE.md), so sorting it descending ranks the most *damaged* names first — the second live send listed INTU at +19.6 above names actually trending, in a basket where 19 of 23 were above their 50d. `buildTurnMembers()` sorts by distance above the 50d, puts unmeasurable names last, and renders them `?TICK` so "could not read" never renders as "weak". `%` counts use the *measured* denominator only.

⚠️ **Feed it ALL basket categories, not `sectorResult.sectors`.** That array holds only the 14 GICS baskets; sub-sectors, cross-asset and leadership baskets live in `subSectorScores` / `crossAssetScores` / `leadershipBasketScores`. Passing `sectors` alone silently dropped AIQ, ARKX and ITA — a quarter of the focus scope — so they could never fire, and it mis-ranked the standing-leaders footer (showed XBI +7.0, omitted AIQ +8.8). The focus scope filters the combined list anyway, so concatenating every category costs nothing. Guarded by a category-spanning assertion in `rotation-turns-alert.test.ts`.

**Scoped to focus sectors** via `focusSectorEtfs(SECTOR_UNIVERSE)` in `src/data/focus-list.ts` — baskets listing >= `MIN_FOCUS_MEMBERS` (4) focus names, which is 12 of 39. The threshold is not 1: "holds any focus name" qualifies 17 baskets, several on a single member, and a rotation in a basket where you trade one name is not actionable. Uses basket *membership*, not `PRIMARY_SECTOR` ownership — NVDA sits in SMH, XLK and AIQ and a turn in any of the three is a turn in something you hold.

**A standing-leadership footer is mandatory.** Everything above it is a list of CHANGES dated to tonight, and a change list reads as a strength ranking unless something says otherwise. On the 2026-09-21 board the only fires were IGV and XLC — both no-lead re-entries, both *negative* vs SPY over five sessions, sitting 6th and 9th of 12 on relative strength — while SMH led at +8.4% and was absent because its 09-17 turn was no longer new. Read without the footer, the message says money rotated out of semis into software, which is the reverse of what happened. Top 3 focus baskets by `mansfieldRS`, plus the caption. Do not drop it to save lines.

**Only events dated to this session fire** (`TURN_ALERT_MAX_AGE = 0`). A forming run persists for days; re-sending the same names nightly is how an alert stops being read. Standing runs are reported as a count. Sends even when the confluence body is `null` — a night with no scanner-hit rotations is exactly when a forming turn is the only thing worth saying. `confluenceStockCount` still counts the confluence body only.

**State persistence:** 3-tier — module cache → Vercel KV → env var. Separate KV keys for rotation state (`sector-rotation:previous`) and confluence tickers (`sector-rotation:confluence-tickers`).


### Nightly Summary Cron
2 Telegram messages at 11 PM ET. **Message 1 (Confluence):** `★ FOCUS` section, then collapsed tiers, new/dropped, watchlist. **Message 2 (Scanner Detail):** Per-scanner breakdowns.

**Message 1 layout (2026-08-19):** `★ FOCUS` leads and carries the only full two-line blocks — ticker, RS, sector, tier, runner score, scanner labels. Tiers 5/4/3 then collapse to **one line of names each** (`★` = focus, `*` = new); tiers 2/1 stay counts. Caps rose to 20/20/15 since entries are one word. A focus name always appears in full above, so collapsing never hides one.

**FOCUS gate:** `FOCUS_MIN_TIER = 2` — a focus name needs two independent scanners. Ungated it produced 91 names under a cap of 15, so the header claimed far more actionable names than existed. Names below the bar keep their `★` in the collapsed tier lines.

**Catalyst override:** a hand-entered catalyst within `CATALYST_URGENT_DAYS = 5` promotes a focus name past the tier bar and prints a `⚡ <type> in Nd` line under it. The tier measures scanner agreement and the scanners cannot see a readout date, so their agreement is the wrong test for exactly that case. Loaded via `loadCatalystMap()`; a load failure degrades to no badges rather than losing the alert.

**Length guard:** `capForTelegram()` (in `lib/ew-wave/telegram.ts`) trims at a line boundary at 3900 chars. Telegram rejects >4096 outright — the whole message is lost, not truncated — and nothing guarded this before.

**Scanner label mapping (Telegram → internal):**
| Label | Scanner | Notes |
|-------|---------|-------|
| `Setup` | PreRun | 5-preset scanner (LD, ST, SNDK, EM, PB) |
| `Inflect` | Inflection | STARTER, ADD_ON, WATCH |
| `Trans` | Transition | TRIGGERED + READY by score |
| `Inst` | Institutional | SL, WL, SPEC |
| `Rot` | PreRunner | Leaders/turnarounds |
| `QFE` | QFE | Badge only |
| `VCP` | VCP | Badge only |
| `Setup4h` | PreRun 4h | Badge only |
| `ICT` | ICT pre-expansion | Badge only. BSL_BUILT+ (state >= 8) and `htf_bias !== COUNTER` |

**Confluence rules:** 5 scanners counted (Setup, Inflect, Trans, Inst, Rot). QFE/VCP/Setup4h/ICT excluded. ICT rows at `htf_bias === "COUNTER"` are dropped before badging — the engine is bullish-only, so a setup with no bullish structure on either swing timeframe is the read most likely to be wrong, and a badge in the alert reads as confirmation. The label carries reward-to-risk and a `stale` marker past 10 bars. INF WATCH badge-only, INF AVOID excluded entirely. `finalScore > 0` required for persistence. 4h-ONLY section: tickers on 4h but NOT daily Setup.

**Correlated pair discount:** Inflect + Trans on the same ticker counts as **1.5**, not 2 (`CORRELATED_PAIR_DISCOUNT`). Transition's seller-exhaustion component reads the same four inputs as Inflection's, and its volume profile overlaps Inflection's buyer emergence on three more — so a hit from both is not two independent confirmations. Same mechanism as the existing 0.5 weight for INF WATCH; tier is `Math.floor(independentCount)`.

**Transition structure gate:** rows with `structure_available === false` (chart too short for ChoCH/BOS) are skipped entirely — no ChoCH/BOS evidence stands behind the state.
