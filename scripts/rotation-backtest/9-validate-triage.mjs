/**
 * Stage 9 — validate the stage-8 triage out of sample, and test whether a LOOSER counting
 * rule would fire earlier without losing the signal.
 *
 * WHY THIS EXISTS
 *
 * Stage 8 tested roughly 24 predicates and reported the best one. That is exactly the
 * setup where a spurious result survives, so the headline — CMF > 0 with at least one
 * qualifying name lifting maturation from 16.5% to 31% — has to hold up on data it was not
 * chosen on before anything is built on it.
 *
 * Two splits, because each catches a different failure:
 *   by TIME    - fit on the first half, check the second. Catches a result that is really
 *                a feature of one market regime.
 *   by BASKET  - odd vs even ETFs. Catches a result driven by one or two sectors.
 *
 * THE SECOND QUESTION
 *
 * The screen admits a member only once it has CLOSED above its prior 20-day high. The
 * standing complaint is that this is inherently late. For the TRADE verdict stage 7 showed
 * the lateness is the edge. But the same rule is also used as a COUNTING device for triage,
 * and there is no reason the two must share a threshold. A name 1% below its 20-day high
 * is not yet a breakout, but it might be a better leading indicator of one.
 *
 * So: count members within X% of their 20-day high, for X from 0 to 5, and see which
 * counter best predicts that the turn matures.
 */
import { readFileSync } from "node:fs";
import { bars, mean, sma, smaSeries, atrPct, topFractionCut, wilson, DATA } from "./lib.mjs";

const HOLD = 20;
const MATURE_WINDOW = 10;
const MIN_DOLLAR_VOL = 50e6;
const MIN_PRICE = 5;
const WARMUP = 60;
const FAST = 20;
const PROXIMITY = [0, 1, 2, 3, 5];

const { defs, exclusions } = JSON.parse(readFileSync(DATA("universe.json"), "utf8"));
const EX = new Set(exclusions);
const spy = bars("SPY");
const spyIdx = new Map(spy.t.map((t, i) => [t, i]));

/** Gate, qualifying count, and near-breakout counts at every proximity band. */
function stateAt(b, bi, members, date) {
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
  const rows = [];
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
    if (Number.isFinite(a) && Number.isFinite(r20) && priorHigh > 0) {
      rows.push({ gapPct: (mb.c[mi] / priorHigh - 1) * 100, atr: a, ret20: r20 });
    }
  }
  if (counted < 5) return null;
  const cut = topFractionCut(rows.map((x) => x.ret20), 0.5);
  const near = {};
  for (const p of PROXIMITY) {
    // p = 0 reproduces the shipped rule exactly: strictly above the prior high.
    near[p] = cut == null ? 0 : rows.filter((x) => x.gapPct > -p - 1e-9 && (p === 0 ? x.gapPct > 0 : true) && x.ret20 >= cut && x.atr >= 3).length;
  }
  const breadth = (above / counted) * 100;
  return { breadth, cmf, accel, near, trade: breadth >= 60 && cmf > 0 && accel > 0 && near[0] >= 3 };
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

  for (let a = WARMUP + 50; a < aligned.length; a++) {
    if (rs20[a] == null || rs20[a - 1] == null) continue;
    if (!(rs[a] > rs20[a] && rs[a - 1] <= rs20[a - 1])) continue;
    if (a + MATURE_WINDOW + HOLD >= aligned.length) continue;
    const bi = aligned[a].i;
    const st = stateAt(b, bi, members, b.d[bi]);
    if (!st) continue;
    let matured = false;
    for (let n = 1; n <= MATURE_WINDOW; n++) {
      const s2 = stateAt(b, aligned[a + n].i, members, b.d[aligned[a + n].i]);
      if (s2?.trade) { matured = true; break; }
    }
    events.push({ etf: def.etf, date: b.d[bi], ...st, matured });
  }
}

const rate = (a) => (a.length ? (a.filter(Boolean).length / a.length) * 100 : NaN);
const dates = events.map((e) => e.date).sort();
const midDate = dates[Math.floor(dates.length / 2)];
const etfs = [...new Set(events.map((e) => e.etf))].sort();
const oddEtfs = new Set(etfs.filter((_, i) => i % 2 === 1));

console.log(`events ${events.length}  baskets ${etfs.length}  split date ${midDate}`);
console.log(`base maturation rate: ${rate(events.map((e) => e.matured)).toFixed(1)}%`);
console.log("");

const SPLITS = [
  ["ALL", () => true],
  [`time: before ${midDate}`, (e) => e.date < midDate],
  [`time: from ${midDate}`, (e) => e.date >= midDate],
  ["baskets: even-indexed", (e) => !oddEtfs.has(e.etf)],
  ["baskets: odd-indexed", (e) => oddEtfs.has(e.etf)],
];

function check(label, pred) {
  console.log(`  ${label}`);
  for (const [sname, sel] of SPLITS) {
    const pool = events.filter(sel);
    const yes = pool.filter(pred);
    const no = pool.filter((e) => !pred(e));
    if (yes.length < 15) { console.log(`    ${sname.padEnd(26)} n ${String(yes.length).padStart(3)}  (too few)`); continue; }
    const m = rate(yes.map((e) => e.matured));
    const base = rate(pool.map((e) => e.matured));
    const [lo, hi] = wilson(yes.filter((e) => e.matured).length, yes.length);
    console.log(
      `    ${sname.padEnd(26)} n ${String(yes.length).padStart(3)}  matured ${m.toFixed(0).padStart(3)}% [${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}]` +
      `  base ${base.toFixed(0)}%  lift ${(m - base >= 0 ? "+" : "")}${(m - base).toFixed(0)}pp` +
      `  vs-fails ${(m - rate(no.map((e) => e.matured)) >= 0 ? "+" : "")}${(m - rate(no.map((e) => e.matured))).toFixed(0)}pp`,
    );
  }
  console.log("");
}

console.log("VALIDATION — does the stage-8 headline survive out of sample?");
check("CMF > 0 AND >= 1 qualifying name", (e) => e.cmf > 0 && e.near[0] >= 1);
check("CMF > 0 (the broad filter)", (e) => e.cmf > 0);
check("already 3+ qualifying names", (e) => e.near[0] >= 3);

console.log("LOOSER COUNTING — does relaxing the breakout make a better EARLY signal?");
console.log("  counting members within X% of their 20-day high, needing >= 1");
for (const p of PROXIMITY) {
  const label = p === 0 ? "X=0 (shipped: strictly above)" : `X=${p}% below the high`;
  check(`${label}, CMF>0 AND count>=1`, (e) => e.cmf > 0 && e.near[p] >= 1);
}
console.log("  same, needing >= 3");
for (const p of PROXIMITY) {
  const label = p === 0 ? "X=0 (shipped)" : `X=${p}%`;
  check(`${label}, count>=3`, (e) => e.near[p] >= 3);
}
