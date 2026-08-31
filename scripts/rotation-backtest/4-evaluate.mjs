/**
 * Stage 4 — score the shipped entry screen, and the variants that were rejected.
 *
 * The shipped rule lives in src/lib/sector-rotation/entry-screen.ts with its
 * thresholds in config.ts (ENTRY_SCREEN). This file re-implements it against the
 * historical panel; if the two drift apart, this is the one that is wrong.
 *
 * Usage: node 4-evaluate.mjs [--variants]
 */
import { readFileSync } from "node:fs";
import { mean, median, pct, topFractionCut, wilson, DATA } from "./lib.mjs";

const ROT = JSON.parse(readFileSync(DATA("events.json"), "utf8"));
const TECH = new Set(["IGV", "AIQ", "SMH", "XLK"]);

// Keep in step with ENTRY_SCREEN in src/lib/sector-rotation/config.ts.
const CFG = { MIN_BREADTH_PCT: 60, MIN_CMF: 0, MIN_ACCEL: 0, MIN_ATR_PCT: 3.0, RET20_TOP_FRACTION: 0.5, MIN_QUALIFYING: 3 };

const gate = (r) => r.breadth >= CFG.MIN_BREADTH_PCT && r.cmf > CFG.MIN_CMF && r.accel > CFG.MIN_ACCEL;

function screen(r, cfg = CFG) {
  const cut = topFractionCut(r.names.map((n) => n.ret20), cfg.RET20_TOP_FRACTION);
  if (cut === null) return [];
  return r.names.filter((n) => n.breakout20 === 1 && n.ret20 >= cut && n.atrPct >= cfg.MIN_ATR_PCT);
}

function evaluate(label, { pick = screen, gateFn = gate, minQualifying = CFG.MIN_QUALIFYING } = {}) {
  const fired = [];
  for (const r of ROT) {
    if (!gateFn(r)) continue;
    const p = pick(r);
    if (p.length >= minQualifying) fired.push({ r, p });
  }
  const nm = fired.flatMap((x) => x.p);
  if (!nm.length) { console.log(`${label.padEnd(38)} never fires`); return null; }
  const rotWins = fired.filter((x) => mean(x.p.map((n) => n.fwd)) > 0).length;
  const nonTech = fired.filter((x) => !TECH.has(x.r.etf)).flatMap((x) => x.p);
  console.log(
    `${label.padEnd(38)}${String(fired.length).padStart(4)}${String(nm.length).padStart(6)}` +
    `${pct(nm.map((n) => (n.fwd > 0 ? 1 : 0))).padStart(10)}${(rotWins + "/" + fired.length).padStart(8)}` +
    `${mean(nm.map((n) => n.fwd)).toFixed(1).padStart(7)}%` +
    `${(nonTech.length ? pct(nonTech.map((n) => (n.fwd > 0 ? 1 : 0))) : " n/a").padStart(10)}`,
  );
  return { fired, nm, rotWins };
}

console.log(`${ROT.length} rotations, ${ROT.reduce((s, x) => s + x.names.length, 0)} stock-events\n`);
console.log("rule                                  rots names  positive  rotWin   mean  NON-TECH");
console.log("-".repeat(86));
evaluate("baseline: every member, no screen", { pick: (r) => r.names, gateFn: () => true, minQualifying: 1 });
evaluate("gate only", { pick: (r) => r.names, minQualifying: 1 });
evaluate("screen only, no gate", { gateFn: () => true });
evaluate("no minimum-qualifying veto", { minQualifying: 1 });
const shipped = evaluate("SHIPPED RULE", {});

if (shipped) {
  const { fired, nm, rotWins } = shipped;
  const [lo, hi] = wilson(nm.filter((n) => n.fwd > 0).length, nm.length);
  const [rlo, rhi] = wilson(rotWins, fired.length);
  console.log(`\nSHIPPED RULE detail`);
  console.log(`  name-level    ${pct(nm.map((n) => (n.fwd > 0 ? 1 : 0)))}  95% CI ${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}%`);
  console.log(`  rotation-level ${rotWins}/${fired.length}  95% CI ${(rlo * 100).toFixed(0)}-${(rhi * 100).toFixed(0)}%   <- the honest unit; names inside one rotation are one bet`);
  console.log(`  mean ${mean(nm.map((n) => n.fwd)).toFixed(1)}%   median ${median(nm.map((n) => n.fwd)).toFixed(1)}%   touched +5% ${pct(nm.map((n) => (n.mfe >= 5 ? 1 : 0)))}`);
  const vsEtf = fired.flatMap((x) => x.p.map((n) => (n.fwd > x.r.etfFwd ? 1 : 0)));
  console.log(`  beat its ETF ${pct(vsEtf)}`);
  console.log(`  median drawdown while held ${median(nm.map((n) => n.mae)).toFixed(1)}%`);
  console.log(`\n  date         etf   n  win      avg      ETF`);
  for (const x of [...fired].sort((a, b) => a.r.date.localeCompare(b.r.date))) {
    const w = x.p.filter((n) => n.fwd > 0).length;
    const m = mean(x.p.map((n) => n.fwd));
    console.log(`  ${x.r.date}  ${x.r.etf.padEnd(5)}${String(x.p.length).padStart(3)}${(w + "/" + x.p.length).padStart(7)}${m.toFixed(1).padStart(9)}%${x.r.etfFwd.toFixed(1).padStart(9)}%${m > 0 ? "" : "   <- LOSS"}`);
  }
}

if (!process.argv.includes("--variants")) {
  console.log("\n(pass --variants to re-run the rejected alternatives)");
  process.exit(0);
}

// ── Rejected alternatives, kept so they are not re-proposed from scratch ──
console.log("\n\n=== REJECTED: why the minimum-qualifying veto exists ===");
console.log("Rotations grouped by how many names cleared the screen.");
for (const [lo, hi, lbl] of [[1, 1, "1 name"], [2, 2, "2 names"], [3, 5, "3-5 names"], [6, 99, "6+ names"]]) {
  const sel = ROT.filter(gate).map((r) => ({ r, p: screen(r) })).filter((x) => x.p.length >= lo && x.p.length <= hi);
  const nm = sel.flatMap((x) => x.p);
  if (!nm.length) continue;
  console.log(`  ${lbl.padEnd(10)} ${String(sel.length).padStart(2)} rotations, ${String(nm.length).padStart(3)} names, positive ${pct(nm.map((n) => (n.fwd > 0 ? 1 : 0)))}, mean ${mean(nm.map((n) => n.fwd)).toFixed(1)}%`);
}

console.log("\n=== REJECTED: ATR as a basket rank instead of an absolute floor ===");
console.log("A rank forces the same fraction on every sector, which made the rule tech-only.");
for (const keep of [0.4, 0.5, 0.6]) {
  evaluate(`  ATR top ${keep * 100}% of basket`, {
    pick: (r) => {
      const rc = topFractionCut(r.names.map((n) => n.ret20), CFG.RET20_TOP_FRACTION);
      const ac = topFractionCut(r.names.map((n) => n.atrPct), keep);
      return r.names.filter((n) => n.breakout20 === 1 && n.ret20 >= rc && n.atrPct >= ac);
    },
  });
}

console.log("\n=== REJECTED: a ceiling on post-catalyst spikes ===");
console.log("Dropping names whose 20d return exceeds K x the basket median. The dropped");
console.log("names outperform the kept ones, so the premise was simply wrong.");
for (const K of [5, 4, 3, 2]) {
  evaluate(`  drop ret20 > ${K}x basket median`, {
    pick: (r) => {
      const med = median(r.names.map((n) => n.ret20));
      const lim = med > 1 ? med * K : Infinity;
      return screen(r).filter((n) => n.ret20 <= lim);
    },
  });
}
const dropped = ROT.filter(gate).flatMap((r) => {
  const med = median(r.names.map((n) => n.ret20));
  return med > 1 ? screen(r).filter((n) => n.ret20 > med * 3) : [];
});
if (dropped.length) {
  console.log(`  a 3x ceiling removes ${dropped.length} names: ${pct(dropped.map((n) => (n.fwd > 0 ? 1 : 0)))} positive, mean ${mean(dropped.map((n) => n.fwd)).toFixed(1)}%`);
}
