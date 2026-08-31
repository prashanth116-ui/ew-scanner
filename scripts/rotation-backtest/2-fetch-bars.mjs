/**
 * Stage 2 — cache daily OHLCV for every basket member, every sector ETF and SPY.
 *
 * Writes one file per symbol under data/bars/ and skips anything already there,
 * so a re-run is cheap and an interrupted run resumes. Delete data/bars/ to force
 * a refresh; the pipeline is otherwise fully offline from here on.
 *
 * ~630 symbols, a couple of minutes. Delisted and acquired names 404 — that is a
 * survivorship caveat the README records rather than a failure.
 *
 * Usage: node 2-fetch-bars.mjs [range]      (default 2y)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { DATA, BARS_DIR } from "./lib.mjs";

const RANGE = process.argv[2] ?? "2y";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const CONCURRENCY = 8;

mkdirSync(BARS_DIR, { recursive: true });

const { defs } = JSON.parse(readFileSync(DATA("universe.json"), "utf8"));
const symbols = new Set(["SPY"]);
for (const d of defs) {
  if (d.etf) symbols.add(d.etf);
  for (const s of d.stocks) symbols.add(s);
}
const all = [...symbols];
console.log(`${all.length} symbols, range ${RANGE}`);

// Index lists carry the dotted form (BRK.B); Yahoo only accepts the dashed one.
const toYahoo = (s) => s.replace(/\./g, "-");
const safe = (s) => s.replace(/[^A-Za-z0-9]/g, "_");

async function fetchOne(sym) {
  const f = new URL(`${safe(sym)}.json`, BARS_DIR);
  if (existsSync(f)) return "cached";
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${toYahoo(sym)}?range=${RANGE}&interval=1d`,
      { headers: { "User-Agent": UA } },
    );
    if (!r.ok) return `http ${r.status}`;
    const res = (await r.json())?.chart?.result?.[0];
    if (!res?.timestamp) return "no data";
    const q = res.indicators.quote[0];
    const out = { t: [], o: [], h: [], l: [], c: [], v: [] };
    for (let i = 0; i < res.timestamp.length; i++) {
      if (q.close[i] == null || q.volume[i] == null) continue;
      out.t.push(res.timestamp[i]);
      out.o.push(q.open[i] ?? q.close[i]);
      out.h.push(q.high[i] ?? q.close[i]);
      out.l.push(q.low[i] ?? q.close[i]);
      out.c.push(q.close[i]);
      out.v.push(q.volume[i]);
    }
    writeFileSync(f, JSON.stringify(out));
    return "ok";
  } catch (e) {
    return `err ${e.message}`;
  }
}

const failures = [];
let done = 0;
for (let i = 0; i < all.length; i += CONCURRENCY) {
  const batch = all.slice(i, i + CONCURRENCY);
  const res = await Promise.all(batch.map(fetchOne));
  res.forEach((r, j) => { if (r !== "ok" && r !== "cached") failures.push(`${batch[j]}: ${r}`); });
  done += batch.length;
  if (done % 120 === 0) console.log(`  ${done}/${all.length}`);
  await new Promise((r) => setTimeout(r, 120));
}
console.log(`done. ${failures.length} unavailable (delisted / acquired):`);
console.log("  " + failures.map((f) => f.split(":")[0]).join(" "));
