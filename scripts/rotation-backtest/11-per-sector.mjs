/**
 * Stage 11 — does the turn signal work everywhere, or only in a few baskets?
 *
 * Stages 5-10 pooled every basket together. That hides the failure mode that matters most
 * for a live board: a rule that looks fine at +19pp overall but is carried entirely by
 * semis and software, and is worthless or negative in the other fourteen sectors. Stage 9
 * already hinted at it — the CMF result split hard between odd and even baskets — so the
 * per-basket view is overdue.
 *
 * Reports, per basket:
 *   turns          - how often the signal even fires there
 *   matured        - share that reach a full gate+screen TRADE within 10 sessions
 *   q3 lift        - how much "3+ qualifying names at the turn" raises that, the one
 *                    construct that survived every split in stage 9
 *   fwd20          - ETF return vs SPY over the 20 sessions after the turn
 *
 * A signal worth trusting should show a positive q3 lift in most baskets, not a huge lift
 * in two and noise in the rest.
 */
import { readFileSync } from "node:fs";
import { bars, mean, median, sma, smaSeries, atrPct, topFractionCut, DATA } from "./lib.mjs";

const HOLD = 20;
const MATURE_WINDOW = 10;
const MIN_DOLLAR_VOL = 50e6;
const MIN_PRICE = 5;
const WARMUP = 60;
const FAST = 20;

const { defs, exclusions } = JSON.parse(readFileSync(DATA("universe.json"), "utf8"));
const EX = new Set(exclusions);
const spy = bars("SPY");
const spyIdx = new Map(spy.t.map((t, i) => [t, i]));

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
    if (Number.isFinite(a) && Number.isFinite(r20)) rows.push({ breakout: mb.c[mi] > priorHigh, atr: a, ret20: r20 });
  }
  if (counted < 5) return null;
  const cut = topFractionCut(rows.map((x) => x.ret20), 0.5);
  const qualifying = cut == null ? 0 : rows.filter((x) => x.breakout && x.ret20 >= cut && x.atr >= 3).length;
  const breadth = (above / counted) * 100;
  return { qualifying, trade: breadth >= 60 && cmf > 0 && accel > 0 && qualifying >= 3 };
}

const byBasket = new Map();

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
  const rows = [];

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
    const fa = aligned[a + HOLD];
    rows.push({
      qualifying: st.qualifying,
      matured,
      fwd: ((b.c[fa.i] / b.c[bi]) - (spy.c[fa.si] / spy.c[aligned[a].si])) * 100,
    });
  }
  if (rows.length >= 10) byBasket.set(def.etf, { name: def.displayName, rows });
}

const rate = (a) => (a.length ? (a.filter(Boolean).length / a.length) * 100 : NaN);
const f = (v) => (v == null || Number.isNaN(v) ? "  n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`);

const out = [];
for (const [etf, { name, rows }] of byBasket) {
  const base = rate(rows.map((r) => r.matured));
  const q3 = rows.filter((r) => r.qualifying >= 3);
  const q3Rate = q3.length >= 5 ? rate(q3.map((r) => r.matured)) : null;
  out.push({
    etf, name,
    turns: rows.length,
    base,
    q3n: q3.length,
    q3Rate,
    lift: q3Rate == null ? null : q3Rate - base,
    fwd: mean(rows.map((r) => r.fwd)),
    fwdQ3: q3.length >= 5 ? mean(q3.map((r) => r.fwd)) : null,
  });
}
out.sort((a, b) => (b.lift ?? -999) - (a.lift ?? -999));

console.log("Per-basket performance of the turn signal");
console.log("");
console.log("etf    sector                       turns  matured   q3 n  q3 matured   lift    fwd20   fwd20|q3");
for (const r of out) {
  console.log(
    `${r.etf.padEnd(6)} ${r.name.slice(0, 27).padEnd(28)} ${String(r.turns).padStart(5)}` +
    `   ${r.base.toFixed(0).padStart(3)}%` +
    `   ${String(r.q3n).padStart(4)}` +
    `   ${r.q3Rate == null ? "  --" : r.q3Rate.toFixed(0).padStart(4) + "%"}` +
    `     ${r.lift == null ? "  --" : (r.lift >= 0 ? "+" : "") + r.lift.toFixed(0).padStart(3) + "pp"}` +
    `   ${f(r.fwd)}%   ${r.fwdQ3 == null ? "  n/a" : f(r.fwdQ3) + "%"}`,
  );
}

const withLift = out.filter((r) => r.lift != null);
const positive = withLift.filter((r) => r.lift > 0).length;
console.log("");
console.log(`baskets with a measurable q3 lift: ${withLift.length} of ${out.length}`);
console.log(`  positive lift: ${positive}/${withLift.length}   median lift ${f(median(withLift.map((r) => r.lift)))}pp`);
console.log(`turns per basket: median ${median(out.map((r) => r.turns))}  (range ${Math.min(...out.map((r) => r.turns))}-${Math.max(...out.map((r) => r.turns))})`);
console.log(`maturation rate:  median ${f(median(out.map((r) => r.base)))}%  (range ${Math.min(...out.map((r) => r.base)).toFixed(0)}-${Math.max(...out.map((r) => r.base)).toFixed(0)}%)`);
