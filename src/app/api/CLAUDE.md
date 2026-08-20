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
