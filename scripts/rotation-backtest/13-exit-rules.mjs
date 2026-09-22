/**
 * Stage 13 — when should you exit a rotation pick?
 *
 * THE GAP
 *
 * `signal_outcomes` and `/api/cron/targets` handle exits for scanner signals, which carry
 * stored targets and invalidation levels. Rotation entry-screen picks carry neither. The
 * shipped rule tells you what to buy and says nothing about when to leave, and the
 * 20-trading-day hold that every study in this directory uses was a measurement convention
 * chosen for the backtest, never a validated exit.
 *
 * With roughly five of six turns failing and the lifecycle stages (EARLY -> EXHAUSTING)
 * driving alert tone without ever being tested, this is the largest unmeasured area left.
 *
 * WHAT IS COMPARED
 *
 * Entry is held constant: the shipped screen (breakout + top-half + ATR>=3) on the rotation
 * start bar, with MIN_QUALIFYING applied. The gate is relaxed to widen the sample from 57
 * names to a few hundred — stage 7 showed screen-without-gate runs 86% / +15.8%, close
 * enough that exit behaviour should carry over, and exit analysis on 57 names is worthless.
 *
 *   fixed        5 / 10 / 20 / 40 / 60 trading days
 *   hard stop    -5 / -8 / -12% from entry, triggered on an intraday low
 *   ATR stop     1.5x / 2x / 3x the entry ATR below entry
 *   trailing     highest CLOSE since entry, minus 2x / 3x ATR
 *   structure    first close below the 20d SMA / the 50d SMA
 *   sector       first close where the ETF's RS falls back under its own 20d SMA
 *
 * Every rule is capped at 60 bars so they terminate, and every one is evaluated on the same
 * names over the same window.
 *
 * MFE and MAE are reported alongside, because the question behind all of this is how much
 * of the move a rule actually captures — a rule can lift the mean and still leave most of
 * the excursion on the table.
 */
import { readFileSync } from "node:fs";
import { bars, mean, median, sma, smaSeries, atrPct, topFractionCut, wilson, DATA } from "./lib.mjs";

const MAXBARS = 60;
const MIN_DOLLAR_VOL = 50e6;
const MIN_PRICE = 5;
const MIN_DURATION = 10;
const WARMUP = 60;
const MIN_QUALIFYING = 3;

const { defs, exclusions } = JSON.parse(readFileSync(DATA("universe.json"), "utf8"));
const EX = new Set(exclusions);
const spy = bars("SPY");
const spyIdx = new Map(spy.t.map((t, i) => [t, i]));

/** Rotation starts, identical to stage 3. */
function detect(etf) {
  const b = bars(etf);
  if (!b) return null;
  const aligned = [];
  for (let i = 0; i < b.t.length; i++) {
    const si = spyIdx.get(b.t[i]);
    if (si !== undefined && spy.c[si] > 0 && b.c[i] > 0) aligned.push({ i, si });
  }
  if (aligned.length < 150) return null;
  const c = aligned.map((x) => b.c[x.i]);
  const v = aligned.map((x) => b.v[x.i]);
  const rs = aligned.map((x) => b.c[x.i] / spy.c[x.si]);
  const rs10 = smaSeries(rs, 10), rs30 = smaSeries(rs, 30);
  const v20 = smaSeries(v, 20), c50 = smaSeries(c, 50);
  const sig = [];
  for (let i = 0; i < aligned.length; i++) {
    if (rs10[i] == null || rs30[i] == null || v20[i] == null || c50[i] == null) continue;
    let sp = 0;
    for (let k = i; k > i - 5 && k >= 0; k--) if (v20[k] && v[k] > 1.5 * v20[k]) sp++;
    sig.push({ ai: i, n: (rs10[i] > rs30[i] ? 1 : 0) + (sp >= 2 ? 1 : 0) + (c[i] > c50[i] ? 1 : 0) });
  }
  const events = [];
  let start = null, quiet = 0;
  for (let i = 5; i < sig.length; i++) {
    const strong = sig[i].n >= 2;
    if (start === null) {
      if (strong && sig.slice(i - 5, i).every((d) => d.n < 2)) { start = i; quiet = 0; }
    } else if (!strong) {
      if (++quiet >= 3) { events.push({ s: start }); start = null; quiet = 0; }
    } else quiet = 0;
  }
  if (start !== null) events.push({ s: start });
  return { b, aligned, sig, events, rs, rs20: smaSeries(rs, 20) };
}

/** Simulate one exit rule over a member's forward path. Returns % return. */
function simulate(mb, mi, rule, ctx) {
  const entry = mb.c[mi];
  const atr = (ctx.atrPct / 100) * entry;
  let peak = entry;
  for (let n = 1; n <= MAXBARS; n++) {
    const k = mi + n;
    if (k >= mb.c.length) return ((mb.c[mb.c.length - 1] / entry) - 1) * 100;

    // Intraday stops resolve before any close-based rule on the same bar.
    if (rule.hardPct != null) {
      const lvl = entry * (1 + rule.hardPct / 100);
      if (mb.l[k] <= lvl) return rule.hardPct;
    }
    if (rule.atrMult != null) {
      const lvl = entry - rule.atrMult * atr;
      if (mb.l[k] <= lvl) return ((lvl / entry) - 1) * 100;
    }
    if (rule.trailMult != null) {
      const lvl = peak - rule.trailMult * atr;
      if (mb.l[k] <= lvl) return ((lvl / entry) - 1) * 100;
      peak = Math.max(peak, mb.c[k]);
    }
    if (rule.smaExit != null) {
      const s = sma(mb.c, k, rule.smaExit);
      if (s != null && mb.c[k] < s) return ((mb.c[k] / entry) - 1) * 100;
    }
    if (rule.sectorExit && ctx.sectorBroke[n] === true) return ((mb.c[k] / entry) - 1) * 100;
    if (rule.holdBars != null && n >= rule.holdBars) return ((mb.c[k] / entry) - 1) * 100;
  }
  const last = Math.min(mi + MAXBARS, mb.c.length - 1);
  return ((mb.c[last] / entry) - 1) * 100;
}

const RULES = [
  { label: "hold 5d", holdBars: 5 },
  { label: "hold 10d", holdBars: 10 },
  { label: "hold 20d (baseline)", holdBars: 20 },
  { label: "hold 40d", holdBars: 40 },
  { label: "hold 60d", holdBars: 60 },
  { label: "20d hold, -5% stop", holdBars: 20, hardPct: -5 },
  { label: "20d hold, -8% stop", holdBars: 20, hardPct: -8 },
  { label: "20d hold, -12% stop", holdBars: 20, hardPct: -12 },
  { label: "20d hold, 1.5x ATR stop", holdBars: 20, atrMult: 1.5 },
  { label: "20d hold, 2x ATR stop", holdBars: 20, atrMult: 2 },
  { label: "20d hold, 3x ATR stop", holdBars: 20, atrMult: 3 },
  { label: "trail 2x ATR (max 60d)", trailMult: 2 },
  { label: "trail 3x ATR (max 60d)", trailMult: 3 },
  { label: "exit on close < 20d SMA", smaExit: 20 },
  { label: "exit on close < 50d SMA", smaExit: 50 },
  { label: "exit when sector RS breaks", sectorExit: true },
  { label: "trail 3x ATR + sector break", trailMult: 3, sectorExit: true },
];

const results = new Map(RULES.map((r) => [r.label, []]));
const mfes = [], maes = [];
let picks = 0, rotations = 0;

for (const def of defs) {
  if (!def.etf || def.stocks.length < 8) continue;
  const d = detect(def.etf);
  if (!d) continue;
  const { b, aligned, sig, events, rs, rs20 } = d;
  const members = def.stocks.filter((s) => !EX.has(s)).map((s) => ({ s, mb: bars(s) })).filter((x) => x.mb);

  for (const ev of events) {
    const ai = sig[ev.s].ai;
    const bi = aligned[ai].i;
    if (bi < WARMUP + 55 || bi + MAXBARS >= b.c.length) continue;
    const date = b.d[bi];

    // Did the sector's RS break back under its 20d, and on which forward bar?
    const sectorBroke = [];
    for (let n = 0; n <= MAXBARS; n++) {
      const a2 = ai + n;
      sectorBroke[n] = a2 < rs.length && rs20[a2] != null ? rs[a2] < rs20[a2] : false;
    }

    const rows = [];
    for (const { s, mb } of members) {
      const mi = mb.idxByDate.get(date);
      if (mi === undefined || mi < WARMUP || mi + MAXBARS >= mb.c.length) continue;
      if (mean(mb.v.slice(mi - 19, mi + 1)) * mb.c[mi] < MIN_DOLLAR_VOL || mb.c[mi] < MIN_PRICE) continue;
      const a = atrPct(mb, mi);
      const r20 = (mb.c[mi] / mb.c[mi - 20] - 1) * 100;
      const priorHigh = Math.max(...mb.h.slice(mi - 20, mi));
      if (!Number.isFinite(a) || !Number.isFinite(r20)) continue;
      rows.push({ s, mb, mi, atrPct: a, ret20: r20, breakout: mb.c[mi] > priorHigh });
    }
    if (rows.length < 8) continue;
    const cut = topFractionCut(rows.map((x) => x.ret20), 0.5);
    if (cut == null) continue;
    const sel = rows.filter((x) => x.breakout && x.ret20 >= cut && x.atrPct >= 3);
    if (sel.length < MIN_QUALIFYING) continue;
    rotations++;

    for (const p of sel) {
      picks++;
      const entry = p.mb.c[p.mi];
      let mfe = 0, mae = 0;
      for (let n = 1; n <= 20; n++) {
        mfe = Math.max(mfe, (p.mb.h[p.mi + n] / entry - 1) * 100);
        mae = Math.min(mae, (p.mb.l[p.mi + n] / entry - 1) * 100);
      }
      mfes.push(mfe); maes.push(mae);
      for (const rule of RULES) {
        results.get(rule.label).push(simulate(p.mb, p.mi, rule, { atrPct: p.atrPct, sectorBroke }));
      }
    }
  }
}

const pos = (a) => (a.length ? (a.filter((x) => x > 0).length / a.length) * 100 : NaN);
const f = (v) => (Number.isNaN(v) ? "  n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`);

console.log(`rotations ${rotations}   picks ${picks}`);
console.log(`MFE over 20d: median ${f(median(mfes))}%  mean ${f(mean(mfes))}%`);
console.log(`MAE over 20d: median ${f(median(maes))}%  mean ${f(mean(maes))}%   <- how much heat a winner takes`);
console.log("");
console.log("rule                            win      mean     median    worst    %ofMFE");
const baseMfe = mean(mfes);
for (const rule of RULES) {
  const v = results.get(rule.label);
  const [lo, hi] = wilson(v.filter((x) => x > 0).length, v.length);
  console.log(
    `  ${rule.label.padEnd(28)} ${pos(v).toFixed(0).padStart(3)}% [${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}]` +
    ` ${f(mean(v)).padStart(8)}% ${f(median(v)).padStart(8)}% ${f(Math.min(...v)).padStart(8)}%` +
    ` ${((mean(v) / baseMfe) * 100).toFixed(0).padStart(6)}%`,
  );
}
