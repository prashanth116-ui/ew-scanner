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

## Stage 5 — entering at the RS turn instead of the rotation start

```bash
node 5-turn-vs-start.mjs
```

Answers the question that was blocking two changes: should `RotationEvent.startDate` move
onto the RS turn date, and should the turn drive the timing tiers? **Measured, and the
answer is no.** Same rotations, same members, same gate and screen, same 20-day hold —
only the entry bar differs.

87 rotations examined, 64 where an RS turn precedes the tracker start. Lead time is real:
**median 5 sessions**, mean 4.9, max 12.

| Entry bar | Rotations | TRADE | Names | Win | Mean | ETF fwd |
|---|---|---|---|---|---|---|
| START | 64 | 7 | 141 | **77%** | **+13.39%** | +4.71% |
| TURN | 64 | 4 | 95 | 68% | +12.04% | **+6.59%** |

**The ETF captures more from the turn; the stocks capture less.** The sector return improves
(+6.59% vs +4.71%) exactly as you would expect from entering five sessions earlier — and the
member stocks get *worse*, 68% vs 77% and −1.35pp of mean return.

The reason is in the gate:

| | START | TURN |
|---|---|---|
| Gate passes | 22/64 | **7/64** |
| Mean breadth | 62.8% | **49.7%** |
| Mean qualifying names | 2.2 | 1.5 |

At the turn bar the members have not confirmed. Breadth averages 49.7%, below the 60% gate,
and fewer names can post a breakout with above-median strength. This is the SMH 2026-09-16
member reading (31% above their 50d, zero breakouts, median member 3.79% behind SPY)
generalised across the sample.

**So the turn is early for the sector and too early for its members.** It is a notification
device — know sooner, prepare, pick names, set levels — not an entry device. The entry
screen is doing real work by rejecting the turn bar, and when it *does* pass there (4
rotations, +19.69%) the result is fine, which is the point: let the screen decide rather
than forcing the earlier entry.

This is consistent with what the picks panel does with `turnCorroboratesRotation()` — a
confirmed turn lets a young rotation be **shown**, while the entry screen still verdicts on
the start bar. Showing earlier is supported; entering earlier is not.

Caveats that matter: only **2** rotations have both bars saying TRADE, so the like-for-like
paired comparison is nearly empty and the headline rows force entry regardless of verdict,
which is not how you would trade. The cached bars end 2026-08-27, so the SMH September
rotation that prompted this is out of sample.

## Stage 6 — what to watch after a turn fires

```bash
node 6-confirmation-window.mjs
```

A turn fires on day 0. You do not have to commit that day. What, measured on days +1 to
+5, separates the turns that keep working from the ones that roll over? 460 reclaim events
across 18 baskets; the outcome is the ETF's relative return over the 20 sessions
**following the observation bar**, because that is the decision you actually face.

**Waiting alone does nothing.** Committing on day 0 is 47% / −0.05%; +1 through +5 are all
47–48% and flat. There is no free lunch in patience.

**Most of the intuitive metrics are worthless or backwards** (day +3):

| Watching | n | Win | Edge vs fails |
|---|---|---|---|
| RS held above its 20d throughout | 236 | 48% | **−0pp** |
| ETF already ahead of SPY since day 0 | 232 | 47% | **−3pp** |
| breadth level >= 60% | 188 | 46% | **−4pp** |
| RS extended >= 1% over its 20d | 180 | 48% | −0pp |
| breadth rising >= 5pp | 174 | 54% | +9pp |
| **qualifying count >= 3** | 65 | 55% | +8pp |
| **qualifying >= 3 AND rising** | 50 | **58%** | **+11pp** |

Three findings worth keeping:

- **The RS line holding above its 20d is not predictive.** It feels like confirmation and
  it is not. Neither is the ETF already outperforming — that one is mildly *counter*
  productive at −3pp, the ones that already ran do worse next.
- **Breadth LEVEL is inverted again** (−4pp at a 60% cut), consistent with the same hint
  in the TURN_FORMING work. High breadth means the members have already moved.
- **The only construct that shows up positive is the ENTRY_SCREEN qualifying count** —
  members clearing breakout + top-half basket strength + ATR. That is the same veto the
  stage-4 study identified from a completely different angle, which is the strongest thing
  about it.

⚠️ **It is not statistically significant here.** `qualifying >= 3 AND rising` is n=50 with a
Wilson interval of 44–71%, which includes chance. Read it as *consistent with* the stage-4
veto, not as independent confirmation of it.

**Why the means are so small** (+0.77% against stage 4's +17%): different populations. A
20d-SMA reclaim happens 460 times in two years across 18 baskets — it is noise-dominated.
The tracker's rotation event is far more selective, and the entry screen on top of that is
where the edge actually lives. **A turn is not a rotation**, and this is the clearest
statement of that in the repo.

## Stage 7 — are the three screen criteria too conservative?

```bash
node 7-screen-ablation.mjs
```

Breakout-above-the-20-day-high and top-half-20-day-return are both backward-looking, so the
fair charge is that the screen fires late. Ablated against `events.json`: same bar, same
rotations, same hold, only the admission rule changes.

**Top-half return is almost pure redundancy.** Of the names that broke out, **92% were
already top-half**. Dropping the criterion admits 28 extra names out of 2,226 (1.3%) and
fires on the *same 8 rotations*: 86% / +16.2% against the shipped 89% / +17.0%. It is
decoration, not a filter. Harmless to keep, but it is not what makes the screen selective.

**The breakout is the quality engine and the lateness is the point.**

| Admission rule | Fires | Names | Win | Mean |
|---|---|---|---|---|
| shipped: breakout + top-half + ATR>=3 | 8/78 | 57 | **89%** | **+17.0%** |
| drop top-half | 8/78 | 59 | 86% | +16.2% |
| drop breakout | 20/78 | 184 | 74% | +11.3% |
| breakout only | 16/78 | 157 | 74% | +8.2% |
| ATR >= 2 | 15/78 | 121 | 80% | +10.6% |
| ATR >= 4 | 3/78 | 27 | 89% | +19.7% |
| *buy every member (baseline)* | — | 2226 | 69% | +6.3% |

Removing the breakout costs 15pp of win rate. ATR is a tradeability floor, not a timing
filter — loosening it to 2 costs 9pp and 6.4pp of mean.

**The real conservatism is the GATE, not the screen.**

| | Fires | Names | Win | Mean | Rotations profitable |
|---|---|---|---|---|---|
| shipped rule **with** gate | 8/78 | 57 | 89% | +17.0% | 8/8 |
| shipped rule **without** gate | **20/78** | 133 | 86% | +15.8% | 19/20 |

Dropping the gate gives **2.5x the opportunities for 3pp of win rate and 1.2pp of mean**.
That is the change to make if the complaint is "this fires too rarely" — and it is the same
trade the ablation section above already flagged as unsettled.

**The veto is monotonic**, which is the cleanest result here: MIN_QUALIFYING 1/2/3/4/5 runs
82% / 85% / 89% / 94% / 93% and +13.6% / +15.1% / +17.0% / +18.9% / +19.6%. Even the
loosest setting beats the 69% baseline comfortably.

⚠️ **None of this makes anything fire earlier in TIME.** Every variant is measured on the
same bar; looser rules fire on more *rotations*, not sooner within one. Earliness was
tested directly in stage 5 and lost. And n=8 against n=20 is a thin basis for either
choice — the README's own multiple-comparison caveat applies with full force.

## Stage 8 — triaging a turn at the moment it fires

```bash
node 8-turn-quality.mjs
```

The question the earlier stages never asked. Given a turn TODAY, what predicts that *this*
one matures into a tradeable rotation rather than dying? Not an entry question — a triage
question. 401 turn events, 18 baskets.

**The base rate is the headline: only 16.5% of turns produce a full gate+screen+3-names
TRADE within 10 sessions.** Five in six die. That, not conservatism, is why the screen
appears to fire late — it is waiting for the one in six.

| Measured at the turn bar | n | Matures | Lift | fwd20 mean |
|---|---|---|---|---|
| **already 3+ qualifying names** | 63 | **37%** | **+24pp** | +0.45% |
| **CMF > 0 AND >= 1 qualifying name** | 131 | **31%** | **+22pp** | **+1.02%** |
| breadth>=60 AND cmf>0 AND accel>0 | 62 | 32% | +19pp | +0.16% |
| CMF > 0 AND accel > 0 | 120 | 25% | +12pp | +0.85% |
| CMF > 0 | 258 | 21% | +11pp | +0.39% |
| acceleration > 0 | 161 | 23% | +11pp | +0.69% |
| breadth >= 60% | 167 | 23% | +11pp | +0.06% |

**CMF is the best broad filter** — the largest sample with a real lift, and it had never
been tested as a turn-bar predictor despite sitting in the gate.

**What does NOT work, and one of these is on screen today:**

| | Lift |
|---|---|
| RS already above its own 50d | **+0pp** |
| RS below its 50d (deep turn) | −0pp |
| 1-2 prior failed reclaims | **−2pp** |
| 3+ prior failed reclaims | +4pp |
| turn-bar volume >= 1.2x average | −0pp |

⚠️ **`priorFailedAttempts` does not predict anything.** It is rendered prominently on the
turn badge and in the alert ("4 prior reclaims failed") and the direction is, if anything,
mildly the wrong way round. Keep it as texture if you like it, but it is not evidence.

**Drawdown is non-monotonic**, which is worth knowing: within 3% of the 60-day high is
+8pp, **3-10% below is −13pp**, more than 10% below is +10pp. Turns near the highs or from
genuinely washed-out levels work; the middle is a dead zone.

**So the practical triage:** at a turn, check CMF > 0 and whether at least one member
already qualifies. Both true roughly doubles your odds, 16.5% to 31%, with the best forward
return in the table. Neither true and it is probably noise.

⚠️ It doubles a low number. Two in three still fail. Nothing here makes a turn reliably
actionable — it makes it *triageable*, which is a different and smaller claim. Sample sizes
on the combinations run 62-131 with intervals of 8-13pp.

## Stage 9 — validating stage 8, and testing a looser breakout

```bash
node 9-validate-triage.mjs
```

Stage 8 tested ~24 predicates and reported the best, so its headline had to be checked on
data it was not chosen on. Two splits: by time (first half vs second, boundary 2025-11-06)
and by basket (odd vs even ETFs). Note the base maturation rate itself fell from 21% to 12%
across the time split, so the second half is a harder regime for everything.

**The stage-8 headline FAILS.** `CMF > 0 AND >= 1 qualifying name` ran +22pp in the first
half and **+4pp in the second**; +23pp on even baskets and **+6pp on odd**. Concentrated in
half the data twice over — the signature of an overfit pick. **Do not build on it.**

**`CMF > 0` alone is real but small.** +4pp overall, and positive in all four splits
(+4 / +2 / +7 / +2). Directionally trustworthy, magnitude barely worth acting on.

**What survives everywhere: the qualifying count itself.**

| `>= 3 qualifying names at the turn` | n | Matured | Lift |
|---|---|---|---|
| all | 63 | 37% | +20pp |
| first half | 28 | 50% | +29pp |
| **second half** | 35 | **26%** | **+13pp** |
| even baskets | 37 | 41% | +21pp |
| odd baskets | 26 | 31% | +17pp |

Substantial and positive in every split. This is the one finding of stages 6-9 that is
safe to rely on — and it is the same construct stage 4 validated independently.

**Loosening the breakout makes it monotonically WORSE.** Counting members within X% of
their 20-day high rather than strictly above it:

| X | n | Lift (all) | Lift (2nd half) |
|---|---|---|---|
| 0% (shipped) | 63 | **+20pp** | **+13pp** |
| 1% | 91 | +19pp | +12pp |
| 2% | 132 | +14pp | +7pp |
| 3% | 161 | +14pp | +8pp |
| 5% | 216 | +11pp | +6pp |

The strict breakout is the best predictor and every relaxation degrades it. **The charge
that the criteria are "too late" is measured and rejected** — earlier is not better here,
it is just noisier, which is the same conclusion stage 5 reached from the entry side.

The one defensible loosening is **X=1%**, which holds +19pp on 44% more events (91 vs 63)
and validates in all four splits. Useful as a *triage counter*, never as the TRADE verdict.

## Stage 10 — member compression, and why nothing leads

```bash
node 10-member-compression.mjs
```

The aggregates failed for a mechanical reason worth stating: CMF, RS-vs-50d, breadth level
and volume are all **sector aggregates**, and maturation is defined by **member** behaviour.
An aggregate is a lagging average of the very constituents you are trying to predict. CMF
fails twice over — CMF(20) at a turn bar measures the preceding twenty sessions, which by
the definition of a turn were mostly decline.

So this tested the obvious member-level, genuinely forward-looking candidate: not how many
have broken out, but how many are **coiled to**. Range contraction (10-bar range under 35%
of the 60-bar range) and volume dry-up, measured before any breakout.

| Predicate | ALL | 1st half | 2nd half | even | odd |
|---|---|---|---|---|---|
| coiled >= 20% of members | +1pp | +3pp | −0pp | +2pp | +1pp |
| coiled >= 30% | +2pp | +4pp | +0pp | +5pp | −0pp |
| volume drying in >= 30% | +3pp | +5pp | +2pp | +7pp | +0pp |
| coiled >= 20% AND CMF > 0 | +5pp | +7pp | **+0pp** | +10pp | **+2pp** |
| **qualifying >= 3** | **+19pp** | **+24pp** | **+15pp** | **+20pp** | **+17pp** |

**Compression does not discriminate, because it is ubiquitous** — the median turn already
has **41% of its members coiled**. Coiling says a move is *possible*, which is true of
roughly half the market at any moment; it does not say one is *coming*. Adding it to the
qualifying count changes nothing (+19pp either way, on a smaller sample).

### The conclusion after five studies

Tested as leading indicators and failed, or failed validation: CMF, CMF slope, RS position
vs the 50d, breadth level, breadth velocity, turn-bar volume, drawdown depth, prior failed
reclaims, proximity to the 20-day high, range compression, volume dry-up.

Survived every split: **the count of members already breaking out.**

That is not a gap in the design. It is the finding. The earliest reliable evidence that a
rotation is real *is* members breaking out — there is no earlier evidence in the price
series, because a breakout is close to unpredictable in advance and the only information
about "will three members break out in the next ten days" is "how many are breaking out
now". **The lag cannot be engineered away.** What can be done is separate the two jobs:
the turn buys preparation time (three sessions on SMH, worth +6.67% against SPY versus
0.00% from the quadrant), and the count supplies the trigger.

The one genuinely leading source left is information price cannot contain — a dated
catalyst. `catalyst_tags` already exists for exactly that.

## Stage 11 — the signal is NOT universal across sectors

```bash
node 11-per-sector.mjs
```

Stages 5-10 pooled every basket. That hid the thing that matters most for a live board.
Maturation rate — the share of turns reaching a full gate+screen TRADE — **ranges from 39%
to 0%**:

| Works | Marginal | Dead |
|---|---|---|
| AIQ 39%, SMH 38%, XLY 32%, IGV 30%, XLI 27%, XLF 22%, XLK 20% | XLV 17%, IYT 16%, XBI 14%, ITA 11% | **XLC 5%, XLU 5%, XLB 5%, XLE 4%, XRT 4%, XLP 0%, XLRE 0%** |

**In seven of eighteen baskets a turn has essentially never produced a tradeable rotation.**
XLP, XLRE, XLE, XLU and ITA recorded **zero** turns with 3+ qualifying names in two years,
across 17-24 turn events each. The alert fires and nothing ever comes of it.

The cause is `MIN_ATR_PCT = 3.0` doing exactly what the entry-screen section says it does —
"MIN_QUALIFYING removes the low-vol baskets rather than letting them contribute their two
most erratic names". Staples, utilities, REITs, materials, energy and retail simply do not
hold enough 3%-ATR names. That is correct behaviour for the screen and it makes the turn
alert noise in those sectors.

**The q3 lift generalises weakly.** Measurable in only 6 of 18 baskets (the rest lack
enough events), positive in 4:

| | lift |
|---|---|
| IGV | +20pp |
| XLI | +13pp |
| XLY | +11pp |
| AIQ | +8pp |
| SMH | **−4pp** |
| XLK | **−6pp** |

Median +9.2pp. The pooled +19pp of stage 9 was carried by the baskets with enough events —
and notably the two most obvious tech baskets are the negative ones, on n=6 and n=7.

**So scope the alert by where the signal works, not only by where you trade.** The current
focus scoping (12 baskets, >= 4 focus names) includes XLC, ITA, XBI and XLV, which between
them produced 7 q3 events in two years. The baskets that earn an alert are **SMH, AIQ, IGV,
XLY, XLI, XLK, XLF** — everything above 20% maturation.

## Stage 12 — the shipped ladder across all 37 baskets

Run via the shipped `computeRotationTurn` rather than a reimplementation, over 5 years of
ETF bars. Two corrections came out of it.

### The quadrant does NOT reliably lag by 3-5 sessions

**Median lag across 1,979 episodes is 0 sessions.** Mean 2.6. The claim repeated throughout
this work — and written into `rotation-turn.ts` — was generalised from the SMH September
case, where the lag was 2. In the typical turn the quadrant is *already* bullish, because
most turns are dip-and-recover inside an existing trend rather than a genuine re-entry to
the bucket. That is exactly the `quadrantAlreadyAligned` case, and it is the **majority**,
not the exception. The lead is real when the sector actually left the bucket and absent
otherwise.

### The ladder does not order

| stage | n | win | mean |
|---|---|---|---|
| TURNED | 2213 | 46% | −0.04% |
| CONFIRMED | 1818 | 48% | +0.14% |
| QUADRANT | 1979 | 47% | +0.24% |

Indistinguishable. Waiting for slow-SMA confirmation or quadrant agreement buys nothing
measurable at ETF level, which is consistent with stage 6 finding that waiting alone does
nothing.

⚠️ **The FORMING row from that run was discarded as biased and must not be quoted.** It
showed 59% / +1.55%, which is wrong: forming bars were only collected for episodes that went
on to reclaim, so every observation was conditioned on the outcome. The unbiased measure —
every forming fire regardless of what followed — is the one in `rotation-turn.ts`: −0.04%
over 20 days. Lookahead is easy to reintroduce when walking backwards from an event.

### Per basket, the turn's own forward return is mostly weak

Forward 20d vs SPY entering at the turn ranges +3.19% (WGMI) to −2.72% (TLT), positive in
roughly 17 of 37. Best: WGMI +3.19, QTUM +1.89, SMH +1.54, UFO +1.48, XBI +1.11.
Worst: TLT −2.72, XLP −1.70, XLRE −1.23, XHB −1.23, UUP −1.21.

**This does not align with `TURN_WEAK_BASKETS`, and that is correct.** That list is built on
*maturation* — whether the member screen ever fires — because the members are what gets
traded and the ETF never is. By ETF return XBI (+1.11%) and ITA (+0.87%) are suppressed
while XLY (−0.88%) and XLI (−0.40%) are not, which would be a defect if the basket itself
were ever the position. It is not. **Resolved: do not rebuild the list on ETF return.**

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
