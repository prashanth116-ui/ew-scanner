/**
 * Stage 7 — are the three stock-screen criteria too conservative?
 *
 * The screen admits a name only if it closed above its prior 20-day high, its 20-day
 * return is in the top half of its basket, and its ATR% is at least 3. Criteria 1 and 2
 * are backward-looking by construction: both require the move to have already happened.
 * The fair charge is that this fires late and gives up the early part of the run.
 *
 * Stage 5 already tested "fire earlier" directly — entering at the RS turn instead of the
 * rotation start produced WORSE stock outcomes (68% vs 77% win), because the members had
 * not confirmed yet. So lateness is not obviously costing anything. What has never been
 * tested is whether each criterion is individually earning its keep at the same bar, or
 * whether one is redundant and could be dropped to admit more names for free.
 *
 * This ablates them against data/events.json, which stage 3 already built with the
 * per-name inputs and the forward outcome. Same bar, same rotations, same hold — only the
 * admission rule changes.
 */
import { readFileSync } from "node:fs";
import { mean, median, topFractionCut, wilson, DATA } from "./lib.mjs";

const events = JSON.parse(readFileSync(DATA("events.json"), "utf8"));
const MIN_QUALIFYING = 3;
const KEEP_TOP = 0.5;

const pos = (a) => (a.length ? (a.filter((x) => x > 0).length / a.length) * 100 : NaN);
const f = (v) => (v == null || Number.isNaN(v) ? " n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`);

/** Every stock-event, for the do-nothing baseline. */
const allNames = events.flatMap((e) => e.names.map((n) => n.fwd));
console.log(`rotations ${events.length}   stock-events ${events.reduce((s, e) => s + e.names.length, 0)}`);
console.log(`BASELINE — buy every member: n ${allNames.length}  win ${pos(allNames).toFixed(0)}%  mean ${f(mean(allNames))}%`);
console.log("");

/**
 * How often do breakout20 and top-half-ret20 actually disagree?
 *
 * If a name making a 20-day high is nearly always also in the top half of 20-day returns,
 * the second criterion is decoration and costs names for nothing.
 */
let bothT = 0, breakOnly = 0, retOnly = 0, neither = 0;
for (const e of events) {
  const cut = topFractionCut(e.names.map((n) => n.ret20), KEEP_TOP);
  if (cut == null) continue;
  for (const n of e.names) {
    const b = n.breakout20 === 1, r = n.ret20 >= cut;
    if (b && r) bothT++; else if (b) breakOnly++; else if (r) retOnly++; else neither++;
  }
}
const totalPairs = bothT + breakOnly + retOnly + neither;
console.log("OVERLAP — breakout20 vs top-half 20d return");
console.log(`  both           ${String(bothT).padStart(5)}  (${((bothT / totalPairs) * 100).toFixed(1)}%)`);
console.log(`  breakout only  ${String(breakOnly).padStart(5)}  (${((breakOnly / totalPairs) * 100).toFixed(1)}%)  <- admitted if ret20 dropped`);
console.log(`  top-half only  ${String(retOnly).padStart(5)}  (${((retOnly / totalPairs) * 100).toFixed(1)}%)  <- admitted if breakout dropped`);
console.log(`  neither        ${String(neither).padStart(5)}  (${((neither / totalPairs) * 100).toFixed(1)}%)`);
console.log(`  of names that broke out, ${((bothT / (bothT + breakOnly)) * 100).toFixed(0)}% were also top-half`);
console.log("");

/**
 * Each variant, applied at the same bar with the same gate and veto as the shipped rule,
 * so the only thing changing is which names are admitted.
 */
function variant(label, admits, minQual = MIN_QUALIFYING, useGate = true) {
  let rotations = 0, fired = 0;
  const fwd = [];
  const perRotation = [];
  for (const e of events) {
    rotations++;
    const gateOk = !useGate || (e.breadth >= 60 && e.cmf > 0 && e.accel > 0);
    if (!gateOk) continue;
    const cut = topFractionCut(e.names.map((n) => n.ret20), KEEP_TOP);
    if (cut == null) continue;
    const picks = e.names.filter((n) => admits(n, cut));
    if (picks.length < minQual) continue;
    fired++;
    fwd.push(...picks.map((n) => n.fwd));
    perRotation.push(mean(picks.map((n) => n.fwd)));
  }
  const [lo, hi] = wilson(fwd.filter((x) => x > 0).length, fwd.length);
  const rotWins = perRotation.filter((x) => x > 0).length;
  console.log(
    `  ${label.padEnd(40)} fires ${String(fired).padStart(2)}/${rotations}  names ${String(fwd.length).padStart(4)}` +
    `  win ${pos(fwd).toFixed(0).padStart(3)}% [${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}]` +
    `  mean ${f(mean(fwd))}%  median ${f(median(fwd))}%  rot ${rotWins}/${perRotation.length}`,
  );
}

console.log("ABLATION — gate + veto held constant, admission rule varied");
variant("SHIPPED: breakout + top-half + ATR>=3", (n, c) => n.breakout20 === 1 && n.ret20 >= c && n.atrPct >= 3);
variant("drop top-half (breakout + ATR>=3)", (n) => n.breakout20 === 1 && n.atrPct >= 3);
variant("drop breakout (top-half + ATR>=3)", (n, c) => n.ret20 >= c && n.atrPct >= 3);
variant("drop ATR (breakout + top-half)", (n, c) => n.breakout20 === 1 && n.ret20 >= c);
variant("breakout only", (n) => n.breakout20 === 1);
variant("ATR>=2 instead of 3", (n, c) => n.breakout20 === 1 && n.ret20 >= c && n.atrPct >= 2);
variant("ATR>=4 instead of 3", (n, c) => n.breakout20 === 1 && n.ret20 >= c && n.atrPct >= 4);
variant("top-quartile ret20 instead of half", (n) => n.breakout20 === 1 && n.atrPct >= 3, MIN_QUALIFYING);
console.log("");

console.log("WITHOUT THE GATE — the README already flags it as the expensive part");
variant("SHIPPED rule, no gate", (n, c) => n.breakout20 === 1 && n.ret20 >= c && n.atrPct >= 3, MIN_QUALIFYING, false);
variant("drop top-half, no gate", (n) => n.breakout20 === 1 && n.atrPct >= 3, MIN_QUALIFYING, false);
variant("drop breakout, no gate", (n, c) => n.ret20 >= c && n.atrPct >= 3, MIN_QUALIFYING, false);
console.log("");

console.log("VETO SENSITIVITY — how much of the edge is MIN_QUALIFYING doing?");
for (const q of [1, 2, 3, 4, 5]) {
  variant(`shipped rule, MIN_QUALIFYING=${q}`, (n, c) => n.breakout20 === 1 && n.ret20 >= c && n.atrPct >= 3, q);
}
