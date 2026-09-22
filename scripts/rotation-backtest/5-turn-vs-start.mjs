/**
 * Stage 5 — does entering at the RS TURN beat entering at the rotation START?
 *
 * THE QUESTION
 *
 * `RotationEvent.startDate` is the first bar where the signal-count composite reaches 2,
 * and its RS input is a 10d-vs-30d SMA cross — a slow construct. The RS turn (a reclaim of
 * the 20d SMA of the ETF/SPY ratio) fires earlier. SMH on 2026-09-22 is the motivating
 * case: turn 09-17, tracker start 09-21, and entering the ETF on the turn returned +4.89%
 * against SPY by 09-21 versus 0.00% from the start bar.
 *
 * One case is an anecdote. This measures the same comparison across every rotation in the
 * cached history, at the STOCK level, with the shipped ENTRY_SCREEN applied at both bars —
 * which is the only thing that can justify moving `startDate` onto the turn, or letting
 * the turn drive the timing tiers. Both are currently blocked on this result.
 *
 * WHAT IS HELD CONSTANT
 *
 * Everything except the entry bar. Same rotations, same members, same gate thresholds,
 * same stock screen, same 20-day hold. The gate and the screen are re-measured at each
 * entry bar, because that is what actually happens if you act earlier — you act on worse
 * information, and the screen has to be allowed to say no.
 *
 * WHAT THIS CANNOT SETTLE
 *
 * The cached bars run to 2026-08-27, so the SMH September rotation that prompted all of
 * this is OUT of sample — which is the right way round, but it does mean the motivating
 * case is not in the numbers. And the rotation count is small: stage 4 found 78 rotations
 * and only 8 cleared the shipped screen, so any subset here is thinner still. Read the
 * paired comparison, not the headline.
 *
 * Output: stdout only. Nothing is written, because nothing downstream should consume this
 * until the result is acted on deliberately.
 */
import { readFileSync } from "node:fs";
import { bars, mean, median, sma, smaSeries, atrPct, topFractionCut, wilson, DATA } from "./lib.mjs";

const HOLD = 20;
const MIN_DOLLAR_VOL = 50e6;
const MIN_PRICE = 5;
const MIN_DURATION = 10;
const WARMUP = 60;

// ENTRY_SCREEN in src/lib/sector-rotation/config.ts. Kept in step by hand, same as
// topFractionCut in lib.mjs — if these drift the backtest stops describing the rule.
const MIN_BREADTH_PCT = 60;
const MIN_CMF = 0;
const MIN_ACCEL = 0;
const RET20_TOP_FRACTION = 0.5;
const MIN_ATR_PCT = 3.0;
const MIN_QUALIFYING = 3;

// Rotation turn, mirroring ROTATION_TURN in config.ts.
const FAST_SMA = 20;
const SLOW_SMA = 50;

const { defs, exclusions } = JSON.parse(readFileSync(DATA("universe.json"), "utf8"));
const EX = new Set(exclusions);
const spy = bars("SPY");
if (!spy) throw new Error("SPY bars missing — run 2-fetch-bars.mjs first");
const spyIdx = new Map(spy.t.map((t, i) => [t, i]));

/** Rotation events, identical to stage 3 so the two stages describe the same rotations. */
function detect(etf) {
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
    sig.push({ ai: i, n: (rs10[i] > rs30[i] ? 1 : 0) + (spikes >= 2 ? 1 : 0) + (c[i] > c50[i] ? 1 : 0) });
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

  return { b, aligned, sig, events, rs, rs20: smaSeries(rs, FAST_SMA), rs50: smaSeries(rs, SLOW_SMA) };
}

/**
 * The RS turn active at aligned index `ai`, or null.
 *
 * Mirrors computeRotationTurn: the reclaim bar must be the START of an unbroken run above
 * the fast SMA that is still intact at `ai`. A reclaim that failed and re-fired is dated
 * from the LATEST unbroken reclaim, which is the same rule the shipped module applies.
 */
function turnAt(d, ai) {
  const { rs, rs20, rs50 } = d;
  if (rs20[ai] == null || !(rs[ai] > rs20[ai])) return null;
  let r = ai;
  while (r - 1 >= 0 && rs20[r - 1] != null && rs[r - 1] > rs20[r - 1]) r--;
  if (rs20[r] == null) return null;
  // Confirmation: first bar at or after the reclaim that also cleared the slow SMA.
  let conf = null;
  for (let k = r; k <= ai; k++) {
    if (rs50[k] != null && rs[k] > rs50[k]) { conf = k; break; }
  }
  return { reclaimAi: r, confirmedAi: conf };
}

/** Gate + stock screen at one ETF bar. Returns null when the bar is unusable. */
function screenAt(b, bi, members, date) {
  if (bi < WARMUP + 55 || bi + HOLD >= b.c.length) return null;
  const c = b.c;
  const accel = (c[bi] / c[bi - 20] - 1) * 100 - ((c[bi - 20] / c[bi - 40] - 1) * 100);
  let mfv = 0, vol = 0;
  for (let k = bi - 19; k <= bi; k++) {
    const rng = b.h[k] - b.l[k];
    mfv += rng > 0 ? (((c[k] - b.l[k]) - (b.h[k] - c[k])) / rng) * b.v[k] : 0;
    vol += b.v[k];
  }
  const cmf = vol ? mfv / vol : 0;

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
    names.push({
      symbol: s,
      ret20: (entry / mb.c[mi - 20] - 1) * 100,
      atrPct: atrPct(mb, mi),
      breakout20: entry > priorHigh,
      fwd: (mb.c[mi + HOLD] / entry - 1) * 100,
    });
  }
  if (counted < 5 || names.length < 8) return null;

  const breadth = (above / counted) * 100;
  const gate = breadth >= MIN_BREADTH_PCT && cmf > MIN_CMF && accel > MIN_ACCEL;

  const scorable = names.filter((n) => Number.isFinite(n.ret20) && Number.isFinite(n.atrPct));
  const cut = topFractionCut(scorable.map((n) => n.ret20), RET20_TOP_FRACTION);
  const picks = cut == null ? [] : scorable.filter((n) => n.breakout20 && n.ret20 >= cut && n.atrPct >= MIN_ATR_PCT);

  return {
    date, breadth, cmf, accel, gate,
    qualifying: picks.length,
    trade: gate && picks.length >= MIN_QUALIFYING,
    picks,
    etfFwd: (c[bi + HOLD] / c[bi] - 1) * 100,
  };
}

// ── Build the paired sample ─────────────────────────────────────────────────────────────

const pairs = [];
let rotations = 0, noEarlierTurn = 0, unusableTurnBar = 0;

for (const def of defs) {
  if (!def.etf || def.stocks.length < 8) continue;
  const d = detect(def.etf);
  if (!d) continue;
  const { b, aligned, sig, events } = d;
  const members = def.stocks.filter((s) => !EX.has(s)).map((s) => ({ s, mb: bars(s) })).filter((x) => x.mb);

  for (const ev of events) {
    if (ev.e - ev.s + 1 < MIN_DURATION) continue;
    const startAi = sig[ev.s].ai;
    const startBi = aligned[startAi].i;
    if (startBi < WARMUP + 55 || startBi + HOLD >= b.c.length) continue;
    rotations++;

    const t = turnAt(d, startAi);
    if (!t || t.reclaimAi >= startAi) { noEarlierTurn++; continue; }

    const turnBi = aligned[t.reclaimAi].i;
    const atStart = screenAt(b, startBi, members, b.d[startBi]);
    const atTurn = screenAt(b, turnBi, members, b.d[turnBi]);
    if (!atStart || !atTurn) { unusableTurnBar++; continue; }

    pairs.push({
      etf: def.etf, sector: def.displayName,
      leadSessions: startAi - t.reclaimAi,
      confirmedBeforeStart: t.confirmedAi != null && t.confirmedAi < startAi,
      atStart, atTurn,
    });
  }
}

// ── Report ──────────────────────────────────────────────────────────────────────────────

const f = (v, dp = 2) => (v == null || Number.isNaN(v) ? "  n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`);
const winRate = (a) => (a.length ? (a.filter((x) => x > 0).length / a.length) * 100 : NaN);

console.log(`rotations examined:            ${rotations}`);
console.log(`  no active RS turn at start:  ${noEarlierTurn}`);
console.log(`  turn bar unusable:           ${unusableTurnBar}`);
console.log(`  PAIRED (turn precedes start):${pairs.length}`);
if (!pairs.length) { console.log("nothing to compare"); process.exit(0); }

const leads = pairs.map((p) => p.leadSessions);
console.log(`lead time, sessions:           median ${median(leads)}  mean ${mean(leads).toFixed(1)}  max ${Math.max(...leads)}`);
console.log("");

function summarise(label, sel, pick) {
  const rows = pairs.filter(sel);
  if (!rows.length) { console.log(`${label.padEnd(34)} (none)`); return; }
  const fwd = rows.flatMap((p) => pick(p).picks.map((n) => n.fwd));
  const etf = rows.map((p) => pick(p).etfFwd);
  const traded = rows.filter((p) => pick(p).trade).length;
  const [lo, hi] = wilson(fwd.filter((x) => x > 0).length, fwd.length);
  console.log(
    `${label.padEnd(34)} rot ${String(rows.length).padStart(3)}  TRADE ${String(traded).padStart(3)}` +
    `  names ${String(fwd.length).padStart(4)}  win ${winRate(fwd).toFixed(0).padStart(3)}%` +
    ` [${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}]  mean ${f(mean(fwd))}%  median ${f(median(fwd))}%` +
    `  ETF ${f(mean(etf))}%`,
  );
}

console.log("ALL PAIRED ROTATIONS — screen re-measured at each entry bar");
summarise("  enter at START", () => true, (p) => p.atStart);
summarise("  enter at TURN", () => true, (p) => p.atTurn);
console.log("");

console.log("WHERE THE SHIPPED SCREEN SAYS TRADE AT THAT BAR");
summarise("  START bar verdict TRADE", (p) => p.atStart.trade, (p) => p.atStart);
summarise("  TURN bar verdict TRADE", (p) => p.atTurn.trade, (p) => p.atTurn);
console.log("");

console.log("PAIRED — rotations where BOTH bars say TRADE (like for like)");
const both = (p) => p.atStart.trade && p.atTurn.trade;
summarise("  same rotations, START entry", both, (p) => p.atStart);
summarise("  same rotations, TURN entry", both, (p) => p.atTurn);
const bothRows = pairs.filter(both);
if (bothRows.length) {
  const deltas = bothRows.map((p) => mean(p.atTurn.picks.map((n) => n.fwd)) - mean(p.atStart.picks.map((n) => n.fwd)));
  const better = deltas.filter((x) => x > 0).length;
  console.log(`  per-rotation delta (turn - start): median ${f(median(deltas))}%  mean ${f(mean(deltas))}%  turn better in ${better}/${deltas.length}`);
}
console.log("");

console.log("GATE BEHAVIOUR — does acting earlier mean acting on worse information?");
const gateStart = pairs.filter((p) => p.atStart.gate).length;
const gateTurn = pairs.filter((p) => p.atTurn.gate).length;
console.log(`  gate passes at START: ${gateStart}/${pairs.length}      at TURN: ${gateTurn}/${pairs.length}`);
console.log(`  mean breadth  START: ${mean(pairs.map((p) => p.atStart.breadth)).toFixed(1)}%   TURN: ${mean(pairs.map((p) => p.atTurn.breadth)).toFixed(1)}%`);
console.log(`  mean qualifying START: ${mean(pairs.map((p) => p.atStart.qualifying)).toFixed(1)}    TURN: ${mean(pairs.map((p) => p.atTurn.qualifying)).toFixed(1)}`);
console.log("");

console.log("TURN CONFIRMED BEFORE THE START BAR (the waiver used by the picks panel)");
summarise("  confirmed, START entry", (p) => p.confirmedBeforeStart, (p) => p.atStart);
summarise("  confirmed, TURN entry", (p) => p.confirmedBeforeStart, (p) => p.atTurn);
