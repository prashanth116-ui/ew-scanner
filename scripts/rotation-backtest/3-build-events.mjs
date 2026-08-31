/**
 * Stage 3 — re-derive rotation events over the whole cached history and attach,
 * for every member, the point-in-time screen inputs plus the forward outcome.
 *
 * The detection here mirrors detectRotationEvents() in
 * src/lib/sector-rotation/rotation-tracker.ts: RS golden cross (SMA10 vs SMA30 of
 * the ETF/SPY ratio), a volume-trend flag (2 of the last 5 sessions above 1.5x the
 * 20d average) and close above the 50d SMA; a rotation starts on the first bar
 * with 2+ signals after 5 quiet ones and ends after 3 consecutive quiet bars.
 *
 * Why re-derive rather than read /api/rotation-tracker: the live endpoint only
 * reaches back about a year and the daily tables purge at 14 days, so the API can
 * never supply enough events. The quadrant guard is the one piece not replicated
 * (it needs RRG state); it only suppresses the RS signal on the most recent bars.
 *
 * Output: data/events.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { bars, mean, sma, smaSeries, atrPct, DATA } from "./lib.mjs";

const HOLD = 20;          // trading days held, matches ENTRY_SCREEN.HOLD_DAYS
const MIN_DOLLAR_VOL = 50e6;
const MIN_PRICE = 5;
const MIN_DURATION = 10;  // shorter bursts are blips, not rotations
const WARMUP = 60;        // enough for SMA50 + a 20-bar lookback

const { defs, exclusions } = JSON.parse(readFileSync(DATA("universe.json"), "utf8"));
const EX = new Set(exclusions);
const spy = bars("SPY");
if (!spy) throw new Error("SPY bars missing — run 2-fetch-bars.mjs first");
const spyIdx = new Map(spy.t.map((t, i) => [t, i]));

function detectEvents(etf) {
  const b = bars(etf);
  if (!b) return null;
  const aligned = [];
  for (let i = 0; i < b.t.length; i++) {
    const si = spyIdx.get(b.t[i]);
    if (si !== undefined && spy.c[si] > 0 && b.c[i] > 0) aligned.push({ i, si });
  }
  if (aligned.length < 120) return null;

  const c = aligned.map((x) => b.c[x.i]);
  const v = aligned.map((x) => b.v[x.i]);
  const rs = aligned.map((x) => b.c[x.i] / spy.c[x.si]);
  const rs10 = smaSeries(rs, 10), rs30 = smaSeries(rs, 30);
  const v20 = smaSeries(v, 20), c50 = smaSeries(c, 50);

  const sig = [];
  for (let i = 0; i < aligned.length; i++) {
    if (rs10[i] == null || rs30[i] == null || v20[i] == null || c50[i] == null) continue;
    let spikes = 0;
    for (let k = i; k > i - 5 && k >= 0; k--) if (v20[k] && v[k] > 1.5 * v20[k]) spikes++;
    sig.push({
      ai: i,
      n: (rs10[i] > rs30[i] ? 1 : 0) + (spikes >= 2 ? 1 : 0) + (c[i] > c50[i] ? 1 : 0),
    });
  }

  const events = [];
  let start = null, quiet = 0;
  for (let i = 5; i < sig.length; i++) {
    const strong = sig[i].n >= 2;
    if (start === null) {
      if (strong && sig.slice(i - 5, i).every((d) => d.n < 2)) { start = i; quiet = 0; }
    } else if (!strong) {
      if (++quiet >= 3) { events.push({ s: start, e: i - 2 }); start = null; quiet = 0; }
    } else quiet = 0;
  }
  if (start !== null) events.push({ s: start, e: sig.length - 1 });
  return { b, aligned, sig, events };
}

const out = [];
for (const def of defs) {
  if (!def.etf || def.stocks.length < 8) continue;
  const d = detectEvents(def.etf);
  if (!d) continue;
  const { b, aligned, sig, events } = d;
  const members = def.stocks.filter((s) => !EX.has(s)).map((s) => ({ s, mb: bars(s) })).filter((x) => x.mb);

  for (const ev of events) {
    if (ev.e - ev.s + 1 < MIN_DURATION) continue;
    const bi = aligned[sig[ev.s].ai].i;                 // ETF bar index at the start
    if (bi < WARMUP + 55 || bi + HOLD >= b.c.length) continue;
    const date = b.d[bi];
    const c = b.c;

    // Gate inputs on the START bar, matching entry-screen.ts.
    const accel = (c[bi] / c[bi - 20] - 1) * 100 - ((c[bi - 20] / c[bi - 40] - 1) * 100);
    let mfv = 0, vol = 0;
    for (let k = bi - 19; k <= bi; k++) {
      const rng = b.h[k] - b.l[k];
      mfv += rng > 0 ? (((c[k] - b.l[k]) - (b.h[k] - c[k])) / rng) * b.v[k] : 0;
      vol += b.v[k];
    }

    const names = [];
    let above = 0, counted = 0;
    for (const { s, mb } of members) {
      const mi = mb.idxByDate.get(date);
      if (mi === undefined || mi < WARMUP || mi + HOLD >= mb.c.length) continue;
      const s50 = sma(mb.c, mi, 50);
      if (!s50) continue;
      const dollarVol = mean(mb.v.slice(mi - 19, mi + 1)) * mb.c[mi];
      if (dollarVol < MIN_DOLLAR_VOL || mb.c[mi] < MIN_PRICE) continue;

      counted++;
      if (mb.c[mi] > s50) above++;
      const priorHigh = Math.max(...mb.h.slice(mi - 20, mi));
      const entry = mb.c[mi];
      let mfe = 0, mae = 0;
      for (let k = mi + 1; k <= mi + HOLD; k++) {
        mfe = Math.max(mfe, (mb.h[k] / entry - 1) * 100);
        mae = Math.min(mae, (mb.l[k] / entry - 1) * 100);
      }
      names.push({
        symbol: s,
        ret20: (entry / mb.c[mi - 20] - 1) * 100,
        atrPct: atrPct(mb, mi),
        breakout20: entry > priorHigh ? 1 : 0,
        aboveSma50: entry > s50 ? 1 : 0,
        fwd: (mb.c[mi + HOLD] / entry - 1) * 100,
        mfe, mae,
      });
    }
    if (counted < 5 || names.length < 8) continue;

    out.push({
      etf: def.etf, sector: def.displayName, date,
      durationDays: ev.e - ev.s + 1,
      etfFwd: (b.c[bi + HOLD] / b.c[bi] - 1) * 100,
      breadth: (above / counted) * 100,
      cmf: vol ? mfv / vol : 0,
      accel,
      names,
    });
  }
}

writeFileSync(DATA("events.json"), JSON.stringify(out));
const dates = out.map((x) => x.date).sort();
console.log(`rotations: ${out.length} across ${new Set(out.map((x) => x.etf)).size} ETFs`);
console.log(`span: ${dates[0]} -> ${dates[dates.length - 1]}`);
console.log(`stock-events: ${out.reduce((s, x) => s + x.names.length, 0)}`);
console.log(`ETF delivered >= +3% over ${HOLD}d: ${out.filter((x) => x.etfFwd >= 3).length} / ${out.length}`);
console.log(`ETF negative: ${out.filter((x) => x.etfFwd < 0).length}  <- the downside sample, and it is thin`);
