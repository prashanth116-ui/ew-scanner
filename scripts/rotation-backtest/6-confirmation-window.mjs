/**
 * Stage 6 — after a turn fires, what should you watch to tell real from fake-out?
 *
 * THE QUESTION
 *
 * An RS turn fires on day 0. You do not have to commit that day. What, measured on days
 * +1 to +5, separates the turns that keep working from the ones that roll over?
 *
 * This is deliberately NOT the question stage 5 asked. Stage 5 compared two entry BARS and
 * found the turn bar worse at stock level. This asks whether a short confirmation window
 * fixes that — whether waiting two or three sessions and watching the right number turns
 * the turn into something tradeable.
 *
 * It is also not the breadth-velocity test in rotation-turn.ts, which measured velocity
 * BEFORE the signal (correlation 0.016 with forward return, dead). This measures the
 * trajectory AFTER it.
 *
 * DESIGN
 *
 * Events are every fresh reclaim of the 20d SMA of the ETF/SPY ratio across the cached
 * history — not only the ones a tracker rotation happened to pair with, so the sample is
 * far larger than stage 5's 64.
 *
 * The outcome is the ETF's return vs SPY over the 20 sessions FOLLOWING the observation
 * bar, not following day 0. That is the decision you actually face: standing at +N with
 * what you can see, is what comes next worth owning. Measuring from day 0 would credit a
 * decision made at +3 with the move that already happened.
 *
 * Candidate metrics at each observation bar:
 *   held         - RS has closed above its 20d every session since the turn
 *   breadth      - % of members above their own 50d
 *   dBreadth     - change in that since day 0            <- "getting stronger by the day"
 *   qualifying   - members clearing breakout + top-half basket strength + ATR
 *   dQualifying  - change in that since day 0            <- the ENTRY_SCREEN veto, moving
 *   rsExtension  - how far the RS line sits above its 20d
 *   relSoFar     - ETF return vs SPY from day 0 to the observation bar
 */
import { readFileSync } from "node:fs";
import { bars, mean, median, sma, smaSeries, atrPct, topFractionCut, wilson, DATA } from "./lib.mjs";

const HOLD = 20;
const MIN_DOLLAR_VOL = 50e6;
const MIN_PRICE = 5;
const WARMUP = 60;
const FAST = 20;
const OBSERVE = [0, 1, 2, 3, 5];
const RET20_TOP_FRACTION = 0.5;
const MIN_ATR_PCT = 3.0;

const { defs, exclusions } = JSON.parse(readFileSync(DATA("universe.json"), "utf8"));
const EX = new Set(exclusions);
const spy = bars("SPY");
if (!spy) throw new Error("SPY bars missing — run 2-fetch-bars.mjs first");
const spyIdx = new Map(spy.t.map((t, i) => [t, i]));

/** Member breadth and qualifying count on one date. Null when too thin to read. */
function memberState(members, date) {
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
    if (Number.isFinite(a) && Number.isFinite(r20)) {
      scorable.push({ breakout: mb.c[mi] > priorHigh, atr: a, ret20: r20 });
    }
  }
  if (counted < 5) return null;
  const cut = topFractionCut(scorable.map((x) => x.ret20), RET20_TOP_FRACTION);
  const qualifying = cut == null ? 0 : scorable.filter((x) => x.breakout && x.ret20 >= cut && x.atr >= MIN_ATR_PCT).length;
  return { breadth: (above / counted) * 100, qualifying };
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
  if (aligned.length < 200) continue;
  const members = def.stocks.filter((s) => !EX.has(s)).map((s) => ({ s, mb: bars(s) })).filter((x) => x.mb);
  if (members.length < 8) continue;

  const rs = aligned.map((x) => b.c[x.i] / spy.c[x.si]);
  const rs20 = smaSeries(rs, FAST);

  for (let a = WARMUP; a < aligned.length; a++) {
    if (rs20[a] == null || rs20[a - 1] == null) continue;
    // Fresh reclaim: below yesterday, above today.
    if (!(rs[a] > rs20[a] && rs[a - 1] <= rs20[a - 1])) continue;
    const maxObs = Math.max(...OBSERVE);
    if (a + maxObs + HOLD >= aligned.length) continue;

    const day0 = memberState(members, b.d[aligned[a].i]);
    if (!day0) continue;

    const obs = {};
    let ok = true;
    for (const n of OBSERVE) {
      const ai = a + n;
      const date = b.d[aligned[ai].i];
      const st = memberState(members, date);
      if (!st) { ok = false; break; }
      let held = true;
      for (let k = a; k <= ai; k++) if (!(rs[k] > rs20[k])) { held = false; break; }
      const etfNow = b.c[aligned[ai].i], spyNow = spy.c[aligned[ai].si];
      const etf0 = b.c[aligned[a].i], spy0 = spy.c[aligned[a].si];
      const fwdI = aligned[ai + HOLD];
      obs[n] = {
        held,
        breadth: st.breadth,
        dBreadth: st.breadth - day0.breadth,
        qualifying: st.qualifying,
        dQualifying: st.qualifying - day0.qualifying,
        rsExtension: (rs[ai] / rs20[ai] - 1) * 100,
        relSoFar: ((etfNow / etf0) - (spyNow / spy0)) * 100,
        // The outcome: relative return over the 20 sessions AFTER this observation bar.
        fwd: ((b.c[fwdI.i] / etfNow) - (spy.c[fwdI.si] / spyNow)) * 100,
      };
    }
    if (ok) events.push({ etf: def.etf, date: b.d[aligned[a].i], obs });
  }
}

// ── Report ──────────────────────────────────────────────────────────────────────────────

const pos = (a) => (a.length ? (a.filter((x) => x > 0).length / a.length) * 100 : NaN);
const f = (v) => (v == null || Number.isNaN(v) ? " n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`);

console.log(`turn events: ${events.length} across ${new Set(events.map((e) => e.etf)).size} baskets`);
const d0 = events.map((e) => e.obs[0].fwd);
console.log(`BASELINE — commit on day 0: n ${d0.length}  win ${pos(d0).toFixed(0)}%  mean ${f(mean(d0))}%  median ${f(median(d0))}%`);
console.log("");

console.log("WAITING, WITHOUT ANY FILTER — commit on day +N regardless of what you see");
for (const n of OBSERVE) {
  const v = events.map((e) => e.obs[n].fwd);
  console.log(`  +${n}: n ${String(v.length).padStart(4)}  win ${pos(v).toFixed(0).padStart(3)}%  mean ${f(mean(v))}%  median ${f(median(v))}%`);
}
console.log("");

function split(label, n, predicate) {
  const yes = events.filter((e) => predicate(e.obs[n])).map((e) => e.obs[n].fwd);
  const no = events.filter((e) => !predicate(e.obs[n])).map((e) => e.obs[n].fwd);
  const [lo, hi] = wilson(yes.filter((x) => x > 0).length, yes.length);
  const edge = pos(yes) - pos(no);
  console.log(
    `  ${label.padEnd(36)} pass ${String(yes.length).padStart(4)}  win ${pos(yes).toFixed(0).padStart(3)}%` +
    ` [${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}]  mean ${f(mean(yes))}%` +
    `   |  fail ${String(no.length).padStart(4)} win ${pos(no).toFixed(0).padStart(3)}% mean ${f(mean(no))}%` +
    `   |  edge ${edge >= 0 ? "+" : ""}${edge.toFixed(0)}pp`,
  );
}

for (const n of [2, 3]) {
  console.log(`WHAT YOU CAN SEE AT DAY +${n} — does it separate the next 20 sessions?`);
  split("RS held above its 20d throughout", n, (o) => o.held);
  split("breadth rising since day 0", n, (o) => o.dBreadth > 0);
  split("breadth rising >= 5pp", n, (o) => o.dBreadth >= 5);
  split("breadth level >= 60%", n, (o) => o.breadth >= 60);
  split("qualifying count rising", n, (o) => o.dQualifying > 0);
  split("qualifying count >= 3", n, (o) => o.qualifying >= 3);
  split("qualifying >= 3 AND rising", n, (o) => o.qualifying >= 3 && o.dQualifying > 0);
  split("RS extended >= 1% over its 20d", n, (o) => o.rsExtension >= 1);
  split("ETF ahead of SPY since day 0", n, (o) => o.relSoFar > 0);
  split("held AND qualifying >= 3", n, (o) => o.held && o.qualifying >= 3);
  split("held AND breadth rising", n, (o) => o.held && o.dBreadth > 0);
  console.log("");
}
