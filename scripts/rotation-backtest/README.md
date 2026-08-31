# Rotation entry-screen backtest

Reproduces the study behind `ENTRY_SCREEN` in `src/lib/sector-rotation/config.ts` and
`evaluateEntryScreen()` in `src/lib/sector-rotation/entry-screen.ts`.

```bash
node 1-extract-universe.mjs   # parse sector baskets out of src/data/
node 2-fetch-bars.mjs         # cache ~630 daily series from Yahoo (a few minutes)
node 3-build-events.mjs       # re-derive rotation events + point-in-time features
node 4-evaluate.mjs           # score the shipped rule
node 4-evaluate.mjs --variants  # ...and the alternatives that were rejected
```

Everything under `data/` is generated and gitignored. Stage 2 skips symbols it already
has, so re-runs are cheap; delete `data/bars/` to force a refresh.

## Why events are re-derived rather than read from the API

`/api/rotation-tracker` reaches back about a year, and the daily tables purge at 14
days, so neither can supply enough events. Stage 3 mirrors `detectRotationEvents()`
in `rotation-tracker.ts` against the full cached history. The one piece not
replicated is the RRG quadrant guard, which only suppresses the RS signal on the most
recent bars.

**If stage 4 and `entry-screen.ts` ever disagree, stage 4 is the one that is wrong.**
`topFractionCut()` is duplicated in `lib.mjs` specifically so the inclusive-boundary
behaviour stays identical; keep them in step.

## What the study found

78 rotations, 18 sector ETFs, 2,226 stock-events, Mar 2025 – Jul 2026, 20 trading-day hold.

| Rule | Rotations | Names | Positive | Rotation wins | Mean | Non-tech |
|---|---|---|---|---|---|---|
| baseline: every member | 78 | 2226 | 68.7% | 68/78 | +6.3% | 65.3% |
| gate only | 24 | 755 | 65.8% | 20/24 | +5.8% | 62.7% |
| screen + veto, **no gate** | 20 | 133 | 85.7% | 19/20 | +15.8% | 82.9% |
| gate + screen, **no veto** | 19 | 73 | 82.2% | 14/19 | +13.6% | 67.9% |
| **shipped rule** | 8 | 57 | **89.5%** | 8/8 | +17.0% | 83.3% |

Read the ablation rows carefully, because they are not what you would guess:

- **The gate alone is worthless** — 65.8%, *below* the 68.7% baseline. It only earns
  anything in combination.
- **The veto does most of the work.** Removing it drops non-tech from 83.3% to 67.9%.
  Rotations where 1 name qualified ran 57% positive, 2 names 30%, 3+ names 87%. The
  count of members able to post a breakout with above-median strength *is* a breadth
  reading.
- **The gate costs a lot for its last 3.8pp.** Screen+veto alone fires on 20 rotations
  at 85.7% and 19/20; adding the gate cuts that to 8 rotations for 89.5% and 8/8.
  Whether that trade is worth it is a live question, not a settled one.

Sample caveats that matter more than the headline: 8 rotations is small (rotation-level
95% CI is 68–100%), roughly 15 configurations were tried before landing here, only 8 of
78 rotations had a negative 20-day ETF return, and ~27 delisted or acquired symbols
could not be fetched.

## Rejected — do not re-propose without new evidence

- **ATR as a basket rank instead of an absolute floor.** A rank forces the same
  fraction on every sector — 40% of IGV and 40% of XLU — when IGV carries ~46 members
  clearing 3% ATR and XLU carries ~4. The rank version scored 63% on non-tech names
  against a 65% non-tech baseline: a software rule in disguise.
- **A ceiling on post-catalyst spikes.** Dropping names whose 20d return exceeds K×
  the basket median. The premise was that a name already up 200% has made its move.
  It is wrong: a 3× ceiling removes 31 names that ran **83.9% positive at +16.1%**,
  against +11.8% for the names kept. Bucketed by multiple, 3–5× is the *best* bucket
  (+24.0%) and 1.5–2× the worst (+4.6%).
- **ICT constructs.** SSL raid, displacement, FVG, MSS, OTE, premium/discount and BSL
  distance were all tested against forward returns. None discriminated; displacement
  and FVG *present* were worse than absent, and the ladder score's lowest quintile had
  the highest win rate.
- **Lagging trend features.** 120d/60d return, % from 200MA, % from 52-week high,
  trend acceleration, overhead supply, pocket pivots, compression, OBV slope — all
  flipped sign between the train and test halves.
- **Stops.** Close-based stops at 6/8/12/15% every reduced returns (−2.2pp at 6%) and
  barely improved the worst case. These are 3%+ ATR names held through a catalyst.
- **Waiting for confirmation.** Entering at T+2 costs 1.5pp, T+5 costs 2.8pp, T+10
  costs 3.5pp against entering on the start bar.

## Relative strength, and one thing that is not a signal

Within one basket on one date, subtracting an index return is the same constant for
every member, so **RS-vs-SPY ranks identically to raw return** — `ret20`, `rs20_spy`
and `rs20_etf` produced identical ICs to three decimals. That is why the app measures
stock RS against the *sector ETF* instead.

RS *acceleration* (5d vs 20d vs the sector) scored a consistently **negative** IC of
−0.095, stable across train and test: names already bursting against their own sector
underperformed over the next 20 days.
