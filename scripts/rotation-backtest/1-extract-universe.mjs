/**
 * Stage 1 — read the sector baskets out of the app's own source of truth.
 *
 * Parsed rather than imported because sector-universe.ts pulls in the TS module
 * graph and this pipeline is deliberately build-free. The file format is very
 * regular, and stage 3 fails loudly if the parse comes back empty.
 *
 * Output: data/universe.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { DATA } from "./lib.mjs";

const SRC = new URL("../../src/", import.meta.url);
// Strip CR so the line-anchored patterns below work on a CRLF checkout.
const read = (rel) => readFileSync(new URL(rel, SRC), "utf8").split(String.fromCharCode(13)).join("");

const src = read("data/sector-universe.ts");

const starts = [];
const idRe = /\n {2}\{\n\s+id: "([^"]+)",/g;
let m;
while ((m = idRe.exec(src))) starts.push({ id: m[1], at: m.index });

const defs = starts.map((s, i) => {
  const chunk = src.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : src.length);
  const stocksBlock = /stocks: \[([\s\S]*?)\n {4}\]/.exec(chunk)?.[1] ?? "";
  return {
    id: s.id,
    displayName: /displayName: "([^"]+)"/.exec(chunk)?.[1] ?? s.id,
    etf: /etf: "([^"]+)"/.exec(chunk)?.[1] ?? null,
    category: /category: "([^"]+)"/.exec(chunk)?.[1] ?? null,
    stocks: [...stocksBlock.matchAll(/symbol: "([^"]+)"/g)].map((x) => x[1]),
  };
});

// The rotation tracker filters SCAN_EXCLUSIONS out of its stock collection, so
// the backtest has to as well or it screens names the app would never show.
const idx = read("data/index-tiers.ts");
const exBlock = /SCAN_EXCLUSIONS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(idx);
const exclusions = exBlock ? [...exBlock[1].matchAll(/"([A-Z.\-]+)"/g)].map((x) => x[1]) : [];

if (!defs.length) throw new Error("parsed 0 sector definitions — sector-universe.ts format changed");
if (!exclusions.length) throw new Error("parsed 0 SCAN_EXCLUSIONS — index-tiers.ts format changed");

mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
writeFileSync(DATA("universe.json"), JSON.stringify({ defs, exclusions }, null, 1));

const withStocks = defs.filter((d) => d.stocks.length >= 8);
console.log(`sectors: ${defs.length} (${withStocks.length} with >= 8 members)  exclusions: ${exclusions.length}`);
console.log(`unique symbols: ${new Set(defs.flatMap((d) => d.stocks)).size}`);
