/**
 * Regenerate the FOCUS_LIST block in src/data/focus-list.ts.
 *
 * The focus predicate's two most discriminating gates — ATR% and average dollar volume —
 * are not persisted on any scanner row (`atr_pct` exists only on `vcp_daily`, dollar
 * volume nowhere). Rather than add a column to six tables for two slow-moving structural
 * properties, they are measured here and checked in, on the same quarterly cadence as
 * SCAN_EXCLUSIONS and ADDITIONAL_MEMBERS.
 *
 *   node scripts/measure-focus-candidates.mjs            # print the block
 *   node scripts/measure-focus-candidates.mjs --json     # dump raw measurements
 *
 * Paste the printed block into FOCUS_LIST and update the "measured" date in its
 * docblock. Diff the ticker list before committing: a name dropping out because it went
 * quiet is the system working, a whole sector vanishing is a fetch failure.
 *
 * Reads Yahoo directly rather than importing the app's fetch layer, so it runs standalone
 * with no env vars or Supabase client.
 */

import fs from "node:fs";
import https from "node:https";

// ── Screen ────────────────────────────────────────────────────────────────────────────
// Keep in sync with FOCUS_CRITERIA in src/data/focus-list.ts.
const MIN_ATR_PCT = 3.0;
const MIN_DOLLAR_VOL_M = 300;
const MIN_PRICE = 15;

/** Baskets to draw from, and how many names each may contribute. */
const CAPS = {
  semiconductors: 13,
  "software-cloud": 13,
  technology: 11,
  "artificial-intelligence": 8,
  "aerospace-defense": 8,
  "health-care": 11,
  financials: 8,
  "consumer-discretionary": 8,
};

/** Baskets folded into another for focus purposes — one theme, one cap. */
const MERGE = {
  "space-defense-innovation": "aerospace-defense",
  space: "aerospace-defense",
  biotech: "health-care",
};

const LABEL = {
  semiconductors: "Semiconductors",
  "software-cloud": "Software & Cloud",
  technology: "Technology / AI infrastructure",
  "artificial-intelligence": "AI & power",
  "aerospace-defense": "Aerospace, defense & space",
  "health-care": "Health care & biotech",
  financials: "Financials",
  "consumer-discretionary": "Consumer discretionary",
};

const ORDER = Object.keys(CAPS);

// ── Candidate extraction ──────────────────────────────────────────────────────────────

function readCandidates() {
  const src = fs.readFileSync("src/data/sector-universe.ts", "utf8");
  const want = new Set([...ORDER, ...Object.keys(MERGE)]);
  const re = /id:\s*"([^"]+)",[\s\S]*?stocks:\s*\[([\s\S]*?)\n {4}\],/g;
  const all = new Map();
  let m;
  while ((m = re.exec(src))) {
    if (!want.has(m[1])) continue;
    for (const s of m[2].matchAll(/symbol:\s*"([^"]+)",\s*name:\s*"([^"]+)"/g)) {
      if (!all.has(s[1])) all.set(s[1], { name: s[2], sectors: [] });
      all.get(s[1]).sectors.push(m[1]);
    }
  }

  // Focus is a subset of what gets scanned — you cannot get an alert on a name the crons
  // never look at, so anything outside the scan universe is dropped here.
  const t = fs.readFileSync("src/data/index-tiers.ts", "utf8");
  const grab = (name) => {
    const i = t.indexOf(name);
    const a = t.indexOf("[", i);
    return [...t.slice(a, t.indexOf("]", a)).matchAll(/"([A-Z.\-]+)"/g)].map((x) => x[1]);
  };
  const excluded = new Set([...grab("SCAN_EXCLUSIONS"), ...grab("SCAN_SKIP")]);
  const scan = new Set(
    [...grab("SP500_MEMBERS"), ...grab("NDX100_MEMBERS"), ...grab("ADDITIONAL_MEMBERS")]
      .filter((x) => !excluded.has(x))
  );

  // Canonical sector, so a name listed in several baskets counts once where it belongs.
  const pinSrc = src.slice(src.indexOf("PRIMARY_SECTOR"));
  const pins = {};
  for (const m2 of pinSrc.matchAll(/"([A-Z.\-]+)":\s*"([a-z\-]+)"/g)) pins[m2[1]] = m2[2];

  return [...all.entries()]
    .filter(([sym]) => scan.has(sym))
    .map(([sym, v]) => {
      let sec = pins[sym] && v.sectors.includes(pins[sym]) ? pins[sym] : null;
      if (!sec) sec = [...ORDER, ...Object.keys(MERGE)].find((o) => v.sectors.includes(o));
      return { sym, ...v, sec: MERGE[sec] ?? sec };
    })
    .filter((c) => ORDER.includes(c.sec));
}

// ── Measurement ───────────────────────────────────────────────────────────────────────

/** Yahoo only accepts the dashed form; index lists use the dotted one. */
const toYahoo = (s) => s.replace(".", "-");

function fetchChart(sym) {
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${toYahoo(sym)}?range=1y&interval=1d`;
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => {
        try { resolve(JSON.parse(d)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(15_000, () => { req.destroy(); resolve(null); });
  });
}

function measure(json) {
  const r = json?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!q) return null;
  const { high: H, low: L, close: C, volume: V } = q;
  const idx = [];
  for (let i = 0; i < (C?.length ?? 0); i++) {
    if (C[i] != null && H[i] != null && L[i] != null) idx.push(i);
  }
  // 30 bars, not a year. A higher bar silently drops recent listings, which are exactly
  // the high-ATR names worth trading — SPCX cleared the screen on every measure but had
  // only 46 bars and vanished from the first run without a word. ATR(14) plus 20-day
  // dollar volume needs 21 bars; 30 leaves margin without excluding a new listing.
  if (idx.length < 30) return null;

  const price = C[idx[idx.length - 1]];

  // Wilder true range over the last 14 bars.
  const tr = [];
  for (let k = 1; k < idx.length; k++) {
    const i = idx[k], p = idx[k - 1];
    tr.push(Math.max(H[i] - L[i], Math.abs(H[i] - C[p]), Math.abs(L[i] - C[p])));
  }
  const t14 = tr.slice(-14);
  const atrPct = price > 0 ? (t14.reduce((a, b) => a + b, 0) / t14.length / price) * 100 : null;

  const last20 = idx.slice(-20);
  const dollarVolM =
    last20.reduce((a, i) => a + (C[i] || 0) * (V[i] || 0), 0) / last20.length / 1e6;

  return { price, atrPct, dollarVolM };
}

// ── Main ──────────────────────────────────────────────────────────────────────────────

const CONCURRENCY = 12;
const BATCH_PAUSE_MS = 250;

const candidates = readCandidates();
process.stderr.write(`${candidates.length} candidates across ${ORDER.length} baskets\n`);

const measured = [];
for (let i = 0; i < candidates.length; i += CONCURRENCY) {
  const batch = candidates.slice(i, i + CONCURRENCY);
  const res = await Promise.all(
    batch.map((c) => fetchChart(c.sym).then((j) => ({ ...c, ...(measure(j) ?? { fail: true }) })))
  );
  measured.push(...res);
  process.stderr.write(`\r${Math.min(i + CONCURRENCY, candidates.length)}/${candidates.length}`);
  if (i + CONCURRENCY < candidates.length) {
    await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
  }
}
process.stderr.write("\n");

// Report unmeasurable names loudly. A name that drops out for lack of history looks
// identical to one that failed the screen, and the difference matters: the first is a
// gap in the data, the second is a judgment. Check these by hand before trusting a run.
const failed = measured.filter((m) => m.fail);
if (failed.length) {
  process.stderr.write(`UNMEASURED (${failed.length}) - too little history or delisted, check by hand: ${failed.map((f) => f.sym).join(", ")}\n`);
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(measured.filter((m) => !m.fail), null, 1));
  process.exit(0);
}

const passing = measured.filter(
  (m) => !m.fail && m.atrPct >= MIN_ATR_PCT && m.dollarVolM >= MIN_DOLLAR_VOL_M && m.price >= MIN_PRICE
);
process.stderr.write(`${passing.length} clear the structural screen\n\n`);

const fmtVol = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}B` : `${Math.round(v)}M`);
let total = 0;
const out = [];

for (const sec of ORDER) {
  const rows = passing
    .filter((p) => p.sec === sec)
    // Tradeability: movement x executability. No momentum term — a focus list that reads
    // recent performance has to be rebuilt every time the regime turns, and would drop
    // exactly the names that are basing before they run.
    .sort((a, b) => b.atrPct * Math.log10(b.dollarVolM) - a.atrPct * Math.log10(a.dollarVolM))
    .slice(0, CAPS[sec]);
  if (!rows.length) continue;
  total += rows.length;
  out.push(`  // ${LABEL[sec]}`);
  for (const r of rows) {
    out.push(
      `  ${`"${r.sym}",`.padEnd(10)}// ${r.atrPct.toFixed(1).padStart(4)}% ATR  ` +
      `${fmtVol(r.dollarVolM).padStart(6)}/d  ${r.name}`
    );
  }
  out.push("");
}

console.log(out.join("\n").trimEnd());
process.stderr.write(`\n${total} tickers — paste into FOCUS_LIST and update its measured date\n`);
