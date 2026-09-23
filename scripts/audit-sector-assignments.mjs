/**
 * Check every symbol in SECTOR_UNIVERSE against the sector Yahoo actually reports for it.
 *
 * Sector membership is load-bearing twice over. Breadth is 15% of a basket's composite and
 * is computed from that basket's `stocks` array, so a misfiled name votes in the wrong
 * breadth. And `getSectorForSymbol()` stamps the `sector` column on every scanner row,
 * which drives the PreRun/STRAT universe buckets, the Tier-2 breadth pool and the rotation
 * x scanner confluence. A name in the wrong basket is wrong in both places at once.
 *
 *   node scripts/audit-sector-assignments.mjs            # report
 *   node scripts/audit-sector-assignments.mjs --json     # raw rows
 *   node scripts/audit-sector-assignments.mjs --all      # include matches
 *
 * Yahoo's taxonomy is COARSER than ours: it has eleven sectors where we have fourteen GICS
 * baskets plus sixteen sub-sectors. So the comparison is made at the GICS-parent level
 * using the same mapping the regime alignment uses, and a sub-sector is judged by its
 * parent. "Semiconductors" vs Yahoo "Technology" is a match, not a mismatch.
 *
 * A mismatch here is a QUESTION, not a defect. Yahoo files by revenue mix and we file by
 * what drives the price: nuclear utilities sit in our Energy-parent Nuclear basket because
 * they trade on the AI-power theme, and bitcoin miners sit under Financials. Those are
 * deliberate and listed in EXPECTED below. Everything else is worth a look.
 *
 * Reads Yahoo directly rather than importing the app's fetch layer, so it runs standalone
 * with no env vars or Supabase client — same as measure-focus-candidates.mjs.
 */

import fs from "node:fs";

const JSON_OUT = process.argv.includes("--json");
const SHOW_ALL = process.argv.includes("--all");
/** Parse and self-check without touching the network. The parser is the fragile part —
 *  it reads a TS literal with a regex — so it is checkable in isolation. */
const PARSE_ONLY = process.argv.includes("--parse-only");

// ── Our taxonomy -> GICS parent ───────────────────────────────────────────────────────
// Mirrors REGIME_SECTOR_DISPLAY_MAP in src/lib/sector-rotation/rotation-helpers.ts, keyed
// by sector id rather than displayName. Keep the two in sync.
const GICS_PARENT = {
  technology: "Technology",
  semiconductors: "Technology",
  "software-cloud": "Technology",
  "artificial-intelligence": "Technology",
  memory: "Technology",
  "lithography-photonics": "Technology",
  cybersecurity: "Technology",
  robotics: "Technology",
  quantum: "Technology",
  "health-care": "Health Care",
  biotech: "Health Care",
  "consumer-discretionary": "Consumer Discretionary",
  homebuilders: "Consumer Discretionary",
  retail: "Consumer Discretionary",
  "consumer-staples": "Consumer Staples",
  "communication-services": "Communication Services",
  financials: "Financials",
  "regional-banks": "Financials",
  "hpc-miners": "Financials",
  industrials: "Industrials",
  transports: "Industrials",
  "aerospace-defense": "Industrials",
  "space-defense-innovation": "Industrials",
  space: "Industrials",
  energy: "Energy",
  nuclear: "Energy",
  materials: "Materials",
  utilities: "Utilities",
  "real-estate": "Real Estate",
  "data-centers": "Real Estate",
};

/** Yahoo's sector strings -> our GICS parent names. */
const YAHOO_TO_GICS = {
  Technology: "Technology",
  Healthcare: "Health Care",
  "Financial Services": "Financials",
  "Consumer Cyclical": "Consumer Discretionary",
  "Consumer Defensive": "Consumer Staples",
  "Communication Services": "Communication Services",
  Industrials: "Industrials",
  Energy: "Energy",
  "Basic Materials": "Materials",
  Utilities: "Utilities",
  "Real Estate": "Real Estate",
};

/**
 * Deliberate divergences from Yahoo, by basket. We file by what drives the price; Yahoo
 * files by revenue mix. Listing them here keeps the report about genuine surprises.
 */
const EXPECTED = {
  nuclear: {
    yahoo: ["Utilities", "Energy", "Industrials"],
    why: "Nuclear/AI-power theme trades on the datacenter buildout, not on the utility tape",
  },
  "hpc-miners": {
    yahoo: ["Financial Services", "Technology"],
    why: "Miners trade as levered compute/crypto, filed with Financials by convention here",
  },
  "data-centers": {
    yahoo: ["Real Estate", "Technology", "Industrials", "Utilities"],
    why: "Datacenter buildout spans REITs, power and equipment",
  },
  "artificial-intelligence": {
    yahoo: ["Technology", "Communication Services", "Industrials", "Utilities", "Consumer Cyclical", "Financial Services"],
    why: "AI is a cross-sector theme basket by construction",
  },
  "space-defense-innovation": {
    yahoo: ["Industrials", "Technology"],
    why: "Space names straddle aerospace and hardware",
  },
  space: { yahoo: ["Industrials", "Technology"], why: "Same as space-defense-innovation" },
  robotics: { yahoo: ["Technology", "Industrials", "Healthcare"], why: "Automation spans factory and surgical" },
  quantum: { yahoo: ["Technology", "Industrials"], why: "Quantum hardware straddles both" },
  "lithography-photonics": { yahoo: ["Technology", "Industrials"], why: "Optics vendors file as Industrials" },
  memory: { yahoo: ["Technology"], why: "" },
  cybersecurity: { yahoo: ["Technology"], why: "" },
};

/**
 * Whole-industry divergences where GICS and Yahoo genuinely disagree and GICS is the one
 * our GICS baskets follow. These are not judgement calls about individual names — they are
 * two taxonomies, and flagging them every run buries the handful of real questions.
 *
 * Matched on our GICS parent plus Yahoo's industry string.
 */
const EXPECTED_INDUSTRY = [
  {
    ourParent: "Materials",
    industry: /^Packaging & Containers$/,
    why: "GICS files Containers & Packaging under Materials; Yahoo/Morningstar file it under Consumer Cyclical. XLB follows GICS.",
  },
  {
    ourParent: "Financials",
    industry: /^(Software - Infrastructure|Information Technology Services|Specialty Business Services|Credit Services)$/,
    why: "The March 2023 GICS restructure moved payment processors out of Information Technology into Financials. Yahoo did not follow.",
  },
];

function industryIsExpected(ourParent, industry) {
  if (!industry) return null;
  return EXPECTED_INDUSTRY.find((r) => r.ourParent === ourParent && r.industry.test(industry)) ?? null;
}

// ── Read our assignments out of the TS source ─────────────────────────────────────────

function readUniverse() {
  const src = fs.readFileSync("src/data/sector-universe.ts", "utf8");

  // Slice the array into per-basket blocks at each `id:` and parse each block on its own.
  // A single regex spanning id -> stocks silently runs past a basket whose fields sit in a
  // different order, absorbing the NEXT basket's stocks: the first attempt at this read 18
  // baskets instead of 39 and credited AIQ's 57 names to space-defense-innovation.
  const start = src.indexOf("export const SECTOR_UNIVERSE");
  const end = src.indexOf("export const PRIMARY_SECTOR");
  const body = src.slice(start, end === -1 ? undefined : end);

  const idRe = /^\s{4}id:\s*"([^"]+)",\s*$/gm;
  const marks = [...body.matchAll(idRe)].map((m) => ({ id: m[1], at: m.index }));

  const baskets = [];
  for (let i = 0; i < marks.length; i++) {
    const block = body.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : body.length);
    const field = (name) => block.match(new RegExp(`${name}:\\s*"([^"]*)"`))?.[1] ?? null;
    const stocks = [...block.matchAll(/symbol:\s*"([^"]+)",\s*name:\s*"([^"]*)"/g)].map((s) => ({
      symbol: s[1],
      name: s[2],
    }));
    baskets.push({
      id: marks[i].id,
      displayName: field("displayName") ?? marks[i].id,
      etf: field("etf"),
      category: field("category"),
      stocks,
    });
  }

  const pinSrc = src.slice(src.indexOf("export const PRIMARY_SECTOR"));
  const pins = {};
  for (const p of pinSrc.matchAll(/"([A-Z.\-]+)":\s*"([a-z\-]+)"/g)) pins[p[1]] = p[2];

  return { baskets, pins };
}

/** Reproduces the _symbolToSector build in sector-universe.ts: pins win, else first-wins. */
function resolveCanonical(baskets, pins) {
  const canonical = new Map();
  const listedIn = new Map();
  for (const b of baskets) {
    for (const st of b.stocks) {
      if (!listedIn.has(st.symbol)) listedIn.set(st.symbol, []);
      listedIn.get(st.symbol).push(b.id);
      const pinned = pins[st.symbol];
      if (pinned !== undefined) {
        if (pinned === b.id) canonical.set(st.symbol, b);
      } else if (!canonical.has(st.symbol)) {
        canonical.set(st.symbol, b);
      }
    }
  }
  return { canonical, listedIn };
}

// ── Yahoo ─────────────────────────────────────────────────────────────────────────────

function toYahooSymbol(s) {
  return s.replace(/\./g, "-");
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/**
 * quoteSummary requires a cookie + crumb pair; without one it answers every request with
 * {"error":{"code":"Unauthorized","description":"Invalid Crumb"}} and a 200, which reads
 * as "no data for this symbol" rather than as a failure. The first run of this script
 * reported all 594 symbols as NO_DATA for exactly that reason.
 *
 * Same handshake as getYahooCrumb() in src/lib/squeeze/fetch.ts — duplicated rather than
 * imported because that module is TypeScript and this script runs standalone on node.
 */
let auth = null;

async function getCrumb(force = false) {
  if (auth && !force) return auth;
  const cookieRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  const cookie = (cookieRes.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0].trim())
    .join("; ");
  if (!cookie) throw new Error("could not obtain a Yahoo cookie");

  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumbRes.ok || !crumb || crumb.includes("error")) {
    throw new Error(`could not obtain a Yahoo crumb (HTTP ${crumbRes.status})`);
  }
  auth = { crumb, cookie };
  return auth;
}

async function getJson(path) {
  const a = await getCrumb();
  const url = `${path}${path.includes("?") ? "&" : "?"}crumb=${encodeURIComponent(a.crumb)}`;
  let res = await fetch(url, { headers: { "User-Agent": UA, Cookie: a.cookie } });
  if (res.status === 401) {
    const retry = await getCrumb(true);
    res = await fetch(`${path}${path.includes("?") ? "&" : "?"}crumb=${encodeURIComponent(retry.crumb)}`, {
      headers: { "User-Agent": UA, Cookie: retry.cookie },
    });
  }
  return res.json();
}

/**
 * Sector and industry per symbol, from quoteSummary's assetProfile.
 *
 * One request per symbol: assetProfile has no batch form, and the screener endpoint that
 * does take a symbol list does not return the profile fields. ~600 requests at a small
 * delay, so budget a few minutes.
 */
async function fetchProfiles(symbols) {
  const out = new Map();
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    try {
      const j = await getJson(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${toYahooSymbol(sym)}?modules=assetProfile,price`,
      );
      const r = j?.quoteSummary?.result?.[0];
      if (!r) {
        out.set(sym, { error: j?.quoteSummary?.error?.description ?? "no result" });
      } else {
        out.set(sym, {
          sector: r.assetProfile?.sector ?? null,
          industry: r.assetProfile?.industry ?? null,
          longName: r.price?.longName ?? r.price?.shortName ?? null,
        });
      }
    } catch (e) {
      out.set(sym, { error: String(e.message ?? e) });
    }
    await new Promise((r) => setTimeout(r, 120));
    if ((i + 1) % 25 === 0 || i + 1 === symbols.length) {
      process.stderr.write(`  fetched ${i + 1}/${symbols.length}\r`);
    }
  }
  process.stderr.write("\n");
  return out;
}

// ── Report ────────────────────────────────────────────────────────────────────────────

function main() {
  const { baskets, pins } = readUniverse();
  const { canonical, listedIn } = resolveCanonical(baskets, pins);
  const symbols = [...listedIn.keys()].sort();

  /**
   * Self-check against the counts recorded in CLAUDE.md. The parser reads a TypeScript
   * literal with a regex, which is the part most likely to rot: a first attempt spanning
   * `id` to `stocks` in one match silently ran past basket boundaries, reading 18 baskets
   * instead of 39 and crediting AIQ's 57 names to space-defense-innovation. Every number
   * below is independently documented, so a mismatch means the parse is wrong — not that
   * the universe changed.
   */
  const contested = [...listedIn.entries()].filter(([, v]) => v.length >= 2).map(([k]) => k);
  const unpinnedContested = contested.filter((s) => !pins[s]);
  const orphanPins = Object.keys(pins).filter((s) => !(listedIn.get(s) ?? []).includes(pins[s]));
  const checks = [
    ["baskets", baskets.length, 39],
    ["distinct symbols", symbols.length, 567],
    ["symbols in 2+ baskets", contested.length, 102],
    ["baskets with an etf", baskets.filter((b) => b.etf).length, 39],
    ["baskets with a category", baskets.filter((b) => b.category).length, 39],
    // Invariants rather than counts, so these do not rot as the universe grows.
    // findUnpinnedContested() and sector-universe.test.ts enforce the first at build time.
    ["contested yet unpinned", unpinnedContested.length, 0],
    ["pins naming a basket that does not list the symbol", orphanPins.length, 0],
  ];
  let bad = 0;
  for (const [label, got, want] of checks) {
    const ok = got === want;
    if (!ok) bad++;
    console.error(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(24)} ${got}${ok ? "" : `  (expected ${want})`}`);
  }
  if (bad) {
    console.error(
      `\n${bad} self-check(s) failed. Either the parser is broken or CLAUDE.md's counts are\n` +
        `stale — resolve which before trusting anything below.\n`,
    );
  }
  if (PARSE_ONLY) {
    console.error(`\nBaskets:`);
    for (const b of baskets) {
      console.error(`  ${String(b.etf ?? "?").padEnd(6)} ${b.id.padEnd(28)} ${b.category ?? "?"}  ${b.stocks.length} stocks`);
    }
    process.exit(bad ? 1 : 0);
  }

  console.error(`\nFetching Yahoo profiles for ${symbols.length} symbols (a few minutes)...`);

  fetchProfiles(symbols).then((profiles) => {
    const rows = [];
    for (const sym of symbols) {
      const b = canonical.get(sym);
      const p = profiles.get(sym) ?? { error: "not fetched" };
      const ourParent = b ? GICS_PARENT[b.id] ?? null : null;
      const theirParent = p.sector ? YAHOO_TO_GICS[p.sector] ?? null : null;

      let verdict;
      if (p.error || !p.sector) verdict = "NO_DATA";
      else if (!b) verdict = "UNRESOLVED";
      else if (ourParent === null) verdict = "NO_PARENT"; // cross-asset / leadership basket
      else if (ourParent === theirParent) verdict = "MATCH";
      else {
        const exp = EXPECTED[b.id];
        const ind = industryIsExpected(ourParent, p.industry);
        verdict = (exp && exp.yahoo.includes(p.sector)) || ind ? "EXPECTED" : "MISMATCH";
      }

      rows.push({
        symbol: sym,
        canonicalId: b?.id ?? null,
        canonicalSector: b?.displayName ?? "Other",
        etf: b?.etf ?? null,
        ourParent,
        yahooSector: p.sector ?? null,
        yahooIndustry: p.industry ?? null,
        theirParent,
        listedIn: listedIn.get(sym),
        pinned: pins[sym] ?? null,
        ourName: baskets.find((x) => x.id === b?.id)?.stocks.find((s) => s.symbol === sym)?.name ?? null,
        yahooName: p.longName ?? null,
        verdict,
        error: p.error ?? null,
      });
    }

    if (JSON_OUT) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }

    const by = (v) => rows.filter((r) => r.verdict === v);
    const mismatches = by("MISMATCH");
    const noData = by("NO_DATA");
    const unresolved = by("UNRESOLVED");

    console.log(`\n${"=".repeat(96)}`);
    console.log("SECTOR ASSIGNMENT AUDIT — our canonical basket vs Yahoo's reported sector");
    console.log("=".repeat(96));
    console.log(
      `${rows.length} symbols · ${by("MATCH").length} match · ${by("EXPECTED").length} expected divergence · ` +
        `${mismatches.length} MISMATCH · ${noData.length} no data · ${unresolved.length} unresolved · ` +
        `${by("NO_PARENT").length} non-equity basket`,
    );

    if (mismatches.length) {
      console.log(`\n── MISMATCHES (${mismatches.length}) ${"─".repeat(60)}`);
      console.log(
        `${"SYM".padEnd(7)}${"OUR BASKET".padEnd(26)}${"OUR PARENT".padEnd(24)}${"YAHOO".padEnd(24)}INDUSTRY`,
      );
      const sorted = [...mismatches].sort(
        (a, b) => (a.ourParent ?? "").localeCompare(b.ourParent ?? "") || a.symbol.localeCompare(b.symbol),
      );
      for (const r of sorted) {
        console.log(
          `${r.symbol.padEnd(7)}${r.canonicalSector.padEnd(26)}${(r.ourParent ?? "?").padEnd(24)}` +
            `${(r.yahooSector ?? "?").padEnd(24)}${r.yahooIndustry ?? ""}`,
        );
      }

      console.log(`\n── mismatches grouped by our basket ${"─".repeat(52)}`);
      const grouped = new Map();
      for (const r of mismatches) {
        if (!grouped.has(r.canonicalId)) grouped.set(r.canonicalId, []);
        grouped.get(r.canonicalId).push(r);
      }
      for (const [id, list] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)) {
        const basket = baskets.find((x) => x.id === id);
        console.log(
          `  ${(basket?.displayName ?? id).padEnd(28)} ${String(list.length).padStart(3)} of ${String(basket?.stocks.length ?? 0).padStart(3)} listed   ` +
            list.map((r) => r.symbol).join(" "),
        );
      }
    }

    if (noData.length) {
      console.log(`\n── NO YAHOO DATA (${noData.length}) — delisted, renamed, or a bad ticker ${"─".repeat(20)}`);
      for (const r of noData) {
        console.log(`  ${r.symbol.padEnd(8)} ${r.canonicalSector.padEnd(26)} ${r.error ?? "no sector field"}`);
      }
    }

    if (unresolved.length) {
      console.log(`\n── UNRESOLVED CANONICAL (${unresolved.length}) — listed but no basket owns them ${"─".repeat(12)}`);
      for (const r of unresolved) console.log(`  ${r.symbol.padEnd(8)} listed in: ${r.listedIn.join(", ")}`);
    }

    const renamed = rows.filter(
      (r) => r.yahooName && r.ourName && !nameRoughlyMatches(r.ourName, r.yahooName),
    );
    if (renamed.length) {
      console.log(`\n── NAME DRIFT (${renamed.length}) — our label vs Yahoo's, check for a ticker reuse ${"─".repeat(8)}`);
      for (const r of renamed.slice(0, 40)) {
        console.log(`  ${r.symbol.padEnd(8)} ours: ${String(r.ourName).padEnd(30)} yahoo: ${r.yahooName}`);
      }
      if (renamed.length > 40) console.log(`  ... and ${renamed.length - 40} more (--json for all)`);
    }

    if (SHOW_ALL) {
      console.log(`\n── ALL ROWS ${"─".repeat(76)}`);
      for (const r of rows) {
        console.log(
          `${r.verdict.padEnd(11)}${r.symbol.padEnd(7)}${r.canonicalSector.padEnd(26)}${(r.yahooSector ?? "?").padEnd(24)}${r.yahooIndustry ?? ""}`,
        );
      }
    }

    console.log(
      `\nA mismatch is a question, not a defect — Yahoo files by revenue mix, we file by what\n` +
        `drives the price. Deliberate divergences live in EXPECTED at the top of this script.\n` +
        `Before moving any name, read the "Sector stock lists are load-bearing" section of\n` +
        `CLAUDE.md: composition shifts breadth, which is 15% of a basket's composite.\n`,
    );
  });
}

/** Loose comparison — "Alphabet" vs "Alphabet Inc." must not read as drift. */
function nameRoughlyMatches(ours, theirs) {
  const norm = (s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\b(inc|corp|corporation|company|co|ltd|plc|holdings?|group|the|class [abc]|sa|nv|ag)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const a = norm(ours);
  const b = norm(theirs);
  if (!a || !b) return true;
  return a === b || a.startsWith(b) || b.startsWith(a) || b.includes(a) || a.includes(b);
}

main();
