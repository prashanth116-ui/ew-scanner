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

**Rotation breadth:** Tracks qualified vs total stocks per rotation. Displayed as `📊 N/M stocks qualify (Broad/Moderate/Narrow — context)`.

**Historical stats:** Pattern stats enriched onto rotation changes. Shows `📈 Avg +X.X% over Nd (N prior rotations)`.

**Resilience:** `calculateRotationTracker()` wrapped in try/catch — if it fails, Message 1 (quadrant transitions) still fires.

**11 PM confluence** (`/api/sector-rotation/confluence`, 03:02 UTC): 1 Telegram message — rotation × scanner confluence using fresh scanner data. Runs AFTER all nightly scanners finish (~02:50 UTC), ensuring tonight's scanner data (reflecting today's close) instead of ~20-hour-old stale data from the previous night.

**Message format:** Focus tier (EARLY/MATURING) shows full stock detail with scanner hits; Monitor tier (LATE/EXHAUSTING) shows compact ticker lists. NEW detection via KV-persisted previous tickers (skipped on cold start). Cap: 5 stocks per rotation, deduped. Footer: watchlist grouped by ETF. Returns `null` if no scanner-hit stocks found.

**State persistence:** 3-tier — module cache → Vercel KV → env var. Separate KV keys for rotation state (`sector-rotation:previous`) and confluence tickers (`sector-rotation:confluence-tickers`).


### Nightly Summary Cron
2 Telegram messages at 11 PM ET. **Message 1 (Confluence):** Cross-scanner tiers (5/5 → 1/5), RS accel sorting, new/dropped, watchlist. **Message 2 (Scanner Detail):** Per-scanner breakdowns.

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

**Confluence rules:** 5 scanners counted (Setup, Inflect, Trans, Inst, Rot). QFE/VCP/Setup4h excluded. INF WATCH badge-only, INF AVOID excluded entirely. `finalScore > 0` required for persistence. 4h-ONLY section: tickers on 4h but NOT daily Setup.

**Correlated pair discount:** Inflect + Trans on the same ticker counts as **1.5**, not 2 (`CORRELATED_PAIR_DISCOUNT`). Transition's seller-exhaustion component reads the same four inputs as Inflection's, and its volume profile overlaps Inflection's buyer emergence on three more — so a hit from both is not two independent confirmations. Same mechanism as the existing 0.5 weight for INF WATCH; tier is `Math.floor(independentCount)`.

**Transition structure gate:** rows with `structure_available === false` (chart too short for ChoCH/BOS) are skipped entirely — no ChoCH/BOS evidence stands behind the state.
