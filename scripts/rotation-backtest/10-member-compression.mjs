/**
 * Stage 10 — is member COMPRESSION a leading indicator where the aggregates were lagging?
 *
 * WHY THE EARLIER PREDICTORS FAILED, MECHANICALLY
 *
 * CMF, RS-vs-50d, breadth level and volume are all SECTOR AGGREGATES. Maturation is
 * defined by MEMBER behaviour — three names clearing a breakout screen. An aggregate is a
 * lagging average of the very members whose behaviour you are trying to predict, so it
 * cannot lead them. The only predictor that survived stage 9 was the qualifying count,
 * which works because it is the same member-level variable, autocorrelated with itself.
 *
 * CMF fails for a second, sharper reason: CMF(20) at a turn bar is measuring the preceding
 * twenty sessions, and by the definition of a turn those were mostly decline. It reads the
 * fall, not the recovery.
 *
 * THE UNTESTED IDEA
 *
 * A leading member-level construct is not "how many have broken out" but "how many are
 * COILED to". A name whose range is contracting and whose volume is drying up is primed;
 * one that has already expanded is not. That is the VCP idea, and the Inflection and
 * Transition engines already score compression, so the concept is native here — it has
 * simply never been applied to the members of a turning sector.
 *
 * Crucially this is measured BEFORE any breakout, so unlike proximity-to-the-20-day-high
 * (stage 9, monotonically worse as it loosened) it is not a diluted version of the answer.
 *
 * Validation splits are built in from the start this time, not bolted on after a headline
 * was picked — stage 8's mistake.
 */
import { readFileSync } from "node:fs";
import { bars, mean, sma, smaSeries, atrPct, topFractionCut, wilson, DATA } from "./lib.mjs";

const HOLD = 20;
const MATURE_WINDOW = 10;
const MIN_DOLLAR_VOL = 50e6;
const MIN_PRICE = 5;
const WARMUP = 80;
const FAST = 20;

const { defs, exclusions } = JSON.parse(readFileSync(DATA("universe.json"), "utf8"));
const EX = new Set(exclusions);
const spy = bars("SPY");
const spyIdx = new Map(spy.t.map((t, i) => [t, i]));

/** Range of the last n bars as a % of price — the raw compression input. */
function rangePct(mb, i, n) {
  if (i - n + 1 < 0) return null;
  let hi = -Infinity, lo = Infinity;
  for (let k = i - n + 1; k <= i; k++) { hi = Math.max(hi, mb.h[k]); lo = Math.min(lo, mb.l[k]); }
  return mb.c[i] > 0 ? ((hi - lo) / mb.c[i]) * 100 : null;
}

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

  let above = 0, counted = 0, coiled = 0, dryUp = 0, coiledAndDry = 0;
  const rows = [];
  for (const { mb } of members) {
    const mi = mb.idxByDate.get(date);
    if (mi === undefined || mi < WARMUP) continue;
    const s50 = sma(mb.c, mi, 50);
    if (!s50) continue;
    if (mean(mb.v.slice(mi - 19, mi + 1)) * mb.c[mi] < MIN_DOLLAR_VOL || mb.c[mi] < MIN_PRICE) continue;
    counted++;
    if (mb.c[mi] > s50) above++;

    // Compression: the 10-bar range against the 60-bar range. Low = coiled.
    const r10 = rangePct(mb, mi, 10), r60 = rangePct(mb, mi, 60);
    const ratio = r10 != null && r60 != null && r60 > 0 ? r10 / r60 : null;
    const isCoiled = ratio != null && ratio < 0.35;
    if (isCoiled) coiled++;

    // Volume dry-up: last 5 sessions against the trailing 20.
    const v5 = mean(mb.v.slice(mi - 4, mi + 1));
    const v20 = mean(mb.v.slice(mi - 19, mi + 1));
    const isDry = v20 > 0 && v5 / v20 < 0.85;
    if (isDry) dryUp++;
    if (isCoiled && isDry) coiledAndDry++;

    const priorHigh = Math.max(...mb.h.slice(mi - 20, mi));
    const a = atrPct(mb, mi);
    const r20 = (mb.c[mi] / mb.c[mi - 20] - 1) * 100;
    if (Number.isFinite(a) && Number.isFinite(r20)) rows.push({ breakout: mb.c[mi] > priorHigh, atr: a, ret20: r20 });
  }
  if (counted < 5) return null;
  const cut = topFractionCut(rows.map((x) => x.ret20), 0.5);
  const qualifying = cut == null ? 0 : rows.filter((x) => x.breakout && x.ret20 >= cut && x.atr >= 3).length;
  const breadth = (above / counted) * 100;
  return {
    breadth, cmf, accel, qualifying,
    coiledPct: (coiled / counted) * 100,
    dryPct: (dryUp / counted) * 100,
    coiledDryPct: (coiledAndDry / counted) * 100,
    trade: breadth >= 60 && cmf > 0 && accel > 0 && qualifying >= 3,
  };
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
  if (aligned.length < 240) continue;
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
const odd = new Set(etfs.filter((_, i) => i % 2 === 1));
const SPLITS = [
  ["ALL", () => true],
  ["1st half", (e) => e.date < midDate],
  ["2nd half", (e) => e.date >= midDate],
  ["even baskets", (e) => !odd.has(e.etf)],
  ["odd baskets", (e) => odd.has(e.etf)],
];

console.log(`events ${events.length}  baskets ${etfs.length}  base maturation ${rate(events.map((e) => e.matured)).toFixed(1)}%`);
console.log(`median coiled% ${mean(events.map((e) => e.coiledPct)).toFixed(1)}   median dry% ${mean(events.map((e) => e.dryPct)).toFixed(1)}`);
console.log("");
console.log("predicate                          ALL          1st half     2nd half     even         odd");

function row(label, pred) {
  const cells = SPLITS.map(([, sel]) => {
    const pool = events.filter(sel);
    const yes = pool.filter(pred);
    if (yes.length < 15) return `n${String(yes.length).padStart(3)}  --   `;
    const m = rate(yes.map((e) => e.matured));
    const base = rate(pool.map((e) => e.matured));
    return `n${String(yes.length).padStart(3)} ${(m - base >= 0 ? "+" : "")}${(m - base).toFixed(0).padStart(3)}pp`;
  });
  console.log(`  ${label.padEnd(32)} ${cells.join(" ")}`);
}

console.log("— leading: members coiled before any breakout —");
row("coiled >= 20% of members", (e) => e.coiledPct >= 20);
row("coiled >= 30% of members", (e) => e.coiledPct >= 30);
row("volume drying in >= 30%", (e) => e.dryPct >= 30);
row("coiled AND dry >= 10%", (e) => e.coiledDryPct >= 10);
row("coiled >= 20% AND cmf > 0", (e) => e.coiledPct >= 20 && e.cmf > 0);
console.log("");
console.log("— the survivor from stage 9, for comparison —");
row("qualifying >= 3", (e) => e.qualifying >= 3);
row("qualifying >= 1", (e) => e.qualifying >= 1);
console.log("");
console.log("— combined —");
row("qualifying >= 1 AND coiled >= 20%", (e) => e.qualifying >= 1 && e.coiledPct >= 20);
row("qualifying >= 3 AND coiled >= 20%", (e) => e.qualifying >= 3 && e.coiledPct >= 20);
