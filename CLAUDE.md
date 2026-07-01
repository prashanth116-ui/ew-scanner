# EW-Scanner Project Instructions

## Overview
Next.js 16 market analysis platform deployed on Vercel with Supabase backend. Features multiple stock scanners (Elliott Wave, Confluence, Catalyst, Squeeze, PreRun), sector rotation tracking, and automated nightly cron jobs with Telegram alerts.

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
- **Alerts:** Telegram bot integration (`src/lib/ew-telegram.ts`)
- **Payments:** Stripe subscriptions
- **Path alias:** `@/*` maps to `./src/*`

### Directory Layout
| Directory | Purpose |
|-----------|---------|
| `src/app/` | Next.js App Router pages + API routes |
| `src/lib/` | Shared logic — scanners, scoring, persistence |
| `src/data/` | Universe definitions (ticker lists, index tiers) |
| `src/components/` | React components |
| `supabase/migrations/` | SQL migration files (001-012) |

### Database Tables (Key)
| Table | Cron | Purpose |
|-------|------|---------|
| `prerun_daily` | `/api/prerun/cron/preset` | 6-preset daily scan (SNDK, Early Mover, Pullback, Leading, Stealth, Early+) |
| `inflection_daily` | `/api/inflection/cron/daily` | Inflection point daily scan |
| `vcp_daily` | `/api/vcp/cron/daily` | VCP pattern daily scan |
| `institutional_daily` | `/api/institutional/cron/daily` | Institutional flow daily scan |
| `scanner_signals` | various | Cross-scanner signal persistence |
| `sector_snapshots` | `/api/sector-rotation/alert` | Sector rotation quadrants |

### Nightly Cron Schedule (UTC, Tue-Sat = Mon-Fri ET)
| UTC | ET | Route | Notes |
|-----|-----|-------|-------|
| 01:45 | 9:45 PM | `/api/inflection/cron/daily` | Inflection scan |
| 02:00 | 10:00 PM | `/api/prerun/cron/preset` | Preset scan pass 1 (~708 tickers) |
| 02:06 | 10:06 PM | `/api/prerun/cron/preset-resume` | Preset scan pass 2 (remaining tickers) |
| 02:15 | 10:15 PM | `/api/vcp/cron/daily` | VCP scan |
| 02:30 | 10:30 PM | `/api/institutional/cron/daily` | Institutional scan |

### Preset Cron Details
- **Universe:** SP500 + NDX100 + SP400 (~869 unique tickers)
- **Vercel limit:** 300s maxDuration, 240s time guard for Telegram
- **Two-pass system:** Pass 1 scans from beginning, pass 2 uses `?resume=true` to skip already-persisted tickers
- **Batch settings:** BATCH_SIZE=15, BATCH_DELAY=500ms, PERSIST_INTERVAL=50
- **Params:** `?clear=true` (delete today's data before scan), `?resume=true` (skip existing tickers)
- **Telegram:** Always sends summary using full DB data (not in-memory partial)

### Preset Qualification Criteria
| Preset | Key Criteria |
|--------|-------------|
| SNDK | pctFromAth >= 40, shortFloat >= 15, finalScore >= 18 |
| Early Mover | pctFromAth >= 25, finalScore >= 14, M2+L+F all >= 1 |
| Pullback | pctFromAth <= 40, finalScore >= 15, 2/3 of (M2, F, L) >= 1 |
| Leading | totalScore >= 15, M >= 1, J >= 1, quadrant LEADING/IMPROVING |
| Stealth | finalScore >= 11, M2 >= 1, OBV divergent or VP bullish |
| Early+ | finalScore >= 10, M2 >= 1, N >= 1, OBV divergent or VP bullish |

### Scoring Engines
| Engine | Function | Used By |
|--------|----------|---------|
| Standard PreRun | `autoScorePreRun()` | SNDK, Early Mover, Pullback, Leading, Stealth, Early+ |
| VCP | `scoreVCP()` | VCP daily |
| Institutional | `scoreInstitutionalAcceleration()` | Institutional daily |
| Inflection | `scoreInflection()` | Inflection daily |

All scoring functions are in `src/lib/prerun/` and use `fetchPreRunData()` from `src/lib/prerun/data.ts`.

## Key Files

### Cron Routes
| File | Purpose |
|------|---------|
| `src/app/api/prerun/cron/preset/route.ts` | Preset daily cron (main scan) |
| `src/app/api/prerun/cron/preset-resume/route.ts` | Preset resume pass |
| `src/app/api/inflection/cron/daily/route.ts` | Inflection daily cron |
| `src/app/api/vcp/cron/daily/route.ts` | VCP daily cron |
| `src/app/api/institutional/cron/daily/route.ts` | Institutional daily cron |

### Read API Routes
| File | Purpose |
|------|---------|
| `src/app/api/prerun/daily/route.ts` | Read preset daily data (?date=, ?preset=, ?dates=true) |
| `src/app/api/inflection/daily/route.ts` | Read inflection daily data |
| `src/app/api/vcp/daily/route.ts` | Read VCP daily data |
| `src/app/api/institutional/daily/route.ts` | Read institutional daily data |

### UI Pages
| File | Route |
|------|-------|
| `src/app/prerun/preset-daily/page.tsx` | `/prerun/preset-daily` — 6 preset tabs |
| `src/app/prerun/inflection-daily/page.tsx` | `/prerun/inflection-daily` |
| `src/app/prerun/vcp-daily/page.tsx` | `/prerun/vcp-daily` |
| `src/app/prerun/institutional-daily/page.tsx` | `/prerun/institutional-daily` |

### Persistence & Data
| File | Purpose |
|------|---------|
| `src/lib/supabase/persistence.ts` | All DB read/write functions (upsert, load, purge, clear) |
| `src/lib/supabase/server.ts` | `createAdminClient()` for server-side DB access |
| `src/data/index-tiers.ts` | SP500_MEMBERS, NDX100_MEMBERS, SP400_MEMBERS arrays |
| `src/data/prerun-universe.ts` | `getSectorForTicker()` mapping |

### Shared Utilities
| File | Purpose |
|------|---------|
| `src/lib/daily-format.ts` | `fmtNum()` — safe number formatter for daily pages |
| `src/components/table-error-boundary.tsx` | React error boundary for data tables |
| `src/components/nav.tsx` | Navigation with prerun sub-nav links |
| `src/lib/ew-telegram.ts` | `sendTelegramMessage()` for Telegram bot alerts |

## Patterns & Conventions

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
All cron routes: CRON_SECRET auth via Bearer token, batched scanning with time guard, incremental persist, purge old data, Telegram summary, full DB read for final counts.

## Open Items / Known Gaps
- **OSCR not in universe:** Not in SP500/NDX100/SP400, so excluded from all scans. Would need manual addition to `index-tiers.ts` or a custom watchlist.
- **VCP + Institutional crons untested:** Built but not manually triggered yet — may need the same resume treatment if they time out (universe is ~509, likely fits in one pass).
- **Partial scan on single pass:** The preset cron covers ~708/869 tickers in one pass. The resume cron at 02:06 handles the rest. If the universe grows, may need a third pass or further batch tuning.

## Environment Variables
Key env vars (set in Vercel + `.env.local`):
- `CRON_SECRET` — Bearer token for cron auth
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — Telegram alerts
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
