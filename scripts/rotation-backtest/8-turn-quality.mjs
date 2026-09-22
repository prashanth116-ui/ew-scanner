/**
 * Stage 8 — at the moment a turn fires, what tells you it will mature into something
 * tradeable?
 *
 * WHY THIS IS THE RIGHT QUESTION AND THE EARLIER ONES WERE NOT
 *
 * Stage 5 asked "enter at the turn or the start" and the turn lost at stock level.
 * Stage 6 asked "what confirms in the days after" and found almost nothing.
 * Stage 7 asked "is the screen too strict" and found the gate, not the screen, is the
 * binding constraint.
 *
 * None of those asked the question that actually matters if you keep the gate: given a
 * turn TODAY, what predicts that this one becomes a tradeable rotation, rather than one of
 * the four in five that dies? That is a triage question, not an entry question. Getting it
 * right does not mean entering earlier — it means knowing which turns to prepare for and
 * which to ignore, so that when the screen finally fires you are already positioned to act.
 *
 * TWO OUTCOMES, AND THE SECOND IS THE POINT
 *
 *   fwd20      - ETF return vs SPY over the next 20 sessions. Direct but noisy.
 *   matured    - did the full shipped rule (gate + screen + 3 qualifying names) fire on
 *                ANY bar within the next 10 sessions? This is "did the thing I am waiting
 *                for actually arrive", and it is the outcome a triage signal should predict.
 *
 * PREDICTORS, all measured ON the turn bar, none of them forward-looking:
 *   cmf, cmfSlope        - money flow and its direction, never tested before this
 *   breadth, breadthSlope
 *   rsVs50               - is the RS line turning from above or below its own 50d
 *   priorFails           - failed reclaims in the prior 60 bars; shown in the UI, never measured
 *   drawdown             - how far the ETF sits below its 60-bar high
 *   volRatio             - turn-bar volume against the 20d average
 *   accel                - 20d ROC minus the 20d ROC twenty bars earlier
 */
import { readFileSync } from "node:fs";
import { bars, mean, median, sma, smaSeries, atrPct, topFractionCut, wilson, DATA } from "./lib.mjs";

const HOLD = 20;
const MATURE_WINDOW = 10;
const MIN_DOLLAR_VOL = 50e6;
const MIN_PRICE = 5;
const WARMUP = 60;
const FAST = 20;
const MIN_QUALIFYING = 3;

const { defs, exclusions } = JSON.parse(readFileSync(DATA("universe.json"), "utf8"));
const EX = new Set(exclusions);
const spy = bars("SPY");
if (!spy) throw new Error("SPY bars missing");
const spyIdx = new Map(spy.t.map((t, i) => [t, i]));

/** Gate + qualifying count on one date — the full shipped rule. */
function shippedRule(b, bi, members, date) {
  const c = b.c;
  if (bi < WARMUP || bi >= c.length) return null;
  const accel = (c[bi] / c[bi - 20] - 1) * 100 - ((c[bi - 20] / c[bi - 40] - 1) * 100);
  let mfv = 0, vol = 0;
  for (let k = bi - 19; k <= bi; k++) {
    const rng = b.h[k] - b.l[k];
    mfv += rng > 0 ? (((c[k] - b.l[k]) - (b.h[k] - c[k])) / rng) * b.v[k] : 0;
    vol += b.v[k];
  }
  const cmf = vol ? mfv / vol : 0;

  let above = 0, counted = 0;
  const scorable = [];
  for (const { mb } of members) {
    const mi = mb.idxByDate.get(date);
    if (mi === undefined || mi < WARMUP) continue;
    const s50 = sma(mb.c, mi, 50);
    if (!s50) continue;
    if (mean(mb.v.slice(mi - 19, mi + 1)) * mb.c[mi] < MIN_DOLLAR_VOL || mb.c[mi] < MIN_PRICE) continue;
    counted++;
    if (mb.c[mi] > s50) above++;
    const priorHigh = Math.max(...mb.h.slice(mi - 20, mi));
    const a = atrPct(mb, mi);
    const r20 = (mb.c[mi] / mb.c[mi - 20] - 1) * 100;
    if (Number.isFinite(a) && Number.isFinite(r20)) scorable.push({ breakout: mb.c[mi] > priorHigh, atr: a, ret20: r20 });
  }
  if (counted < 5) return null;
  const breadth = (above / counted) * 100;
  const cut = topFractionCut(scorable.map((x) => x.ret20), 0.5);
  const qualifying = cut == null ? 0 : scorable.filter((x) => x.breakout && x.ret20 >= cut && x.atr >= 3).length;
  const gate = breadth >= 60 && cmf > 0 && accel > 0;
  return { breadth, cmf, accel, qualifying, trade: gate && qualifying >= MIN_QUALIFYING };
}

const events = [];

for (const def of defs) {
  if (!def.etf || def.stocks.length < 8) continue;
  const b = bars(def.etf);
  if (!b) continue;
  const aligned = [];
  for (let i = 0; i < b.t.length; i++) {
    const si = spyIdx.get(b.t[i]);
    if (si !== undefined && spy.c[si] > 0 && b.c[i] > 0) aligned.push({ i, si });
  }
  if (aligned.length < 220) continue;
  const members = def.stocks.filter((s) => !EX.has(s)).map((s) => ({ s, mb: bars(s) })).filter((x) => x.mb);
  if (members.length < 8) continue;

  const rs = aligned.map((x) => b.c[x.i] / spy.c[x.si]);
  const rs20 = smaSeries(rs, FAST);
  const rs50 = smaSeries(rs, 50);

  for (let a = WARMUP + 50; a < aligned.length; a++) {
    if (rs20[a] == null || rs20[a - 1] == null) continue;
    if (!(rs[a] > rs20[a] && rs[a - 1] <= rs20[a - 1])) continue;
    if (a + MATURE_WINDOW + HOLD >= aligned.length) continue;

    const bi = aligned[a].i;
    const state = shippedRule(b, bi, members, b.d[bi]);
    if (!state) continue;

    // cmf five bars earlier, for slope.
    const prev = shippedRule(b, aligned[a - 5].i, members, b.d[aligned[a - 5].i]);
    if (!prev) continue;

    let priorFails = 0;
    for (let k = Math.max(1, a - 60); k < a; k++) {
      if (rs20[k] != null && rs20[k - 1] != null && rs[k] > rs20[k] && rs[k - 1] <= rs20[k - 1]) priorFails++;
    }
    const win60 = aligned.slice(Math.max(0, a - 60), a + 1).map((x) => b.c[x.i]);
    const drawdown = ((b.c[bi] / Math.max(...win60)) - 1) * 100;
    const v20 = mean(b.v.slice(Math.max(0, bi - 19), bi + 1));
    const volRatio = v20 > 0 ? b.v[bi] / v20 : 1;

    // Did the shipped rule fire on any bar in the next MATURE_WINDOW sessions?
    let matured = false;
    for (let n = 1; n <= MATURE_WINDOW; n++) {
      const st = shippedRule(b, aligned[a + n].i, members, b.d[aligned[a + n].i]);
      if (st?.trade) { matured = true; break; }
    }

    const fwdA = aligned[a + HOLD];
    events.push({
      etf: def.etf, date: b.d[bi],
      cmf: state.cmf,
      cmfSlope: state.cmf - prev.cmf,
      breadth: state.breadth,
      breadthSlope: state.breadth - prev.breadth,
      rsVs50: rs50[a] != null ? (rs[a] / rs50[a] - 1) * 100 : null,
      priorFails,
      drawdown,
      volRatio,
      accel: state.accel,
      qualifying: state.qualifying,
      matured,
      fwd: ((b.c[fwdA.i] / b.c[bi]) - (spy.c[fwdA.si] / spy.c[aligned[a].si])) * 100,
    });
  }
}

// ── Report ──────────────────────────────────────────────────────────────────────────────

const pos = (a) => (a.length ? (a.filter((x) => x > 0).length / a.length) * 100 : NaN);
const rate = (a) => (a.length ? (a.filter(Boolean).length / a.length) * 100 : NaN);
const f = (v) => (v == null || Number.isNaN(v) ? " n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`);

const baseMature = rate(events.map((e) => e.matured));
console.log(`turn events: ${events.length} across ${new Set(events.map((e) => e.etf)).size} baskets`);
console.log(`BASE RATE — a turn matures into a full TRADE within ${MATURE_WINDOW} sessions: ${baseMature.toFixed(1)}%`);
console.log(`BASE RATE — ETF beats SPY over the next ${HOLD}: ${pos(events.map((e) => e.fwd)).toFixed(1)}%   mean ${f(mean(events.map((e) => e.fwd)))}%`);
console.log("");
console.log("Does the predictor raise the chance the turn MATURES into a tradeable rotation?");
console.log("  predicate                              n     matured   lift     fwd20 win   fwd20 mean");

function test(label, pred) {
  const yes = events.filter(pred);
  const no = events.filter((e) => !pred(e));
  if (yes.length < 20) { console.log(`  ${label.padEnd(38)} ${String(yes.length).padStart(4)}   (too few)`); return; }
  const m = rate(yes.map((e) => e.matured));
  const [lo, hi] = wilson(yes.filter((e) => e.matured).length, yes.length);
  const fw = yes.map((e) => e.fwd);
  console.log(
    `  ${label.padEnd(38)} ${String(yes.length).padStart(4)}   ${m.toFixed(0).padStart(3)}% [${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}]` +
    `  ${(m - rate(no.map((e) => e.matured)) >= 0 ? "+" : "")}${(m - rate(no.map((e) => e.matured))).toFixed(0).padStart(3)}pp` +
    `    ${pos(fw).toFixed(0).padStart(3)}%       ${f(mean(fw))}%`,
  );
}

test("CMF > 0", (e) => e.cmf > 0);
test("CMF > 0.05", (e) => e.cmf > 0.05);
test("CMF rising (5-bar)", (e) => e.cmfSlope > 0);
test("CMF > 0 AND rising", (e) => e.cmf > 0 && e.cmfSlope > 0);
test("breadth >= 50%", (e) => e.breadth >= 50);
test("breadth >= 60%", (e) => e.breadth >= 60);
test("breadth rising (5-bar)", (e) => e.breadthSlope > 0);
test("RS already above its own 50d", (e) => e.rsVs50 != null && e.rsVs50 > 0);
test("RS below its 50d (deep turn)", (e) => e.rsVs50 != null && e.rsVs50 <= 0);
test("no failed reclaim in prior 60d", (e) => e.priorFails === 0);
test("1-2 prior failed reclaims", (e) => e.priorFails >= 1 && e.priorFails <= 2);
test("3+ prior failed reclaims (choppy)", (e) => e.priorFails >= 3);
test("ETF within 3% of its 60d high", (e) => e.drawdown > -3);
test("ETF 3-10% below its 60d high", (e) => e.drawdown <= -3 && e.drawdown > -10);
test("ETF >10% below its 60d high", (e) => e.drawdown <= -10);
test("turn bar volume >= 1.2x avg", (e) => e.volRatio >= 1.2);
test("acceleration > 0", (e) => e.accel > 0);
test("already 1-2 qualifying names", (e) => e.qualifying >= 1 && e.qualifying <= 2);
test("already 3+ qualifying names", (e) => e.qualifying >= 3);
console.log("");
console.log("Best combinations");
test("CMF>0 AND breadth>=50", (e) => e.cmf > 0 && e.breadth >= 50);
test("CMF>0 AND accel>0", (e) => e.cmf > 0 && e.accel > 0);
test("CMF>0 AND accel>0 AND breadth>=50", (e) => e.cmf > 0 && e.accel > 0 && e.breadth >= 50);
test("CMF>0 AND qualifying>=1", (e) => e.cmf > 0 && e.qualifying >= 1);
test("gate-ish: breadth>=60 AND cmf>0 AND accel>0", (e) => e.breadth >= 60 && e.cmf > 0 && e.accel > 0);
