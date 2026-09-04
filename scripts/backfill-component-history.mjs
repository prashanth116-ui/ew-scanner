/**
 * One-time backfill of component_history from the existing scan tables.
 *
 * The crons archive going forward, but inflection_daily and transition_daily already hold
 * ~90 days of scans. Those rows are on a purge clock; copying them across now is the only
 * chance to keep them. Re-runnable — the table's (scan_date, engine, ticker) unique key
 * turns a second run into an update rather than a duplicate.
 *
 * Requires migration 033 to have been applied.
 *
 *   node scripts/backfill-component-history.mjs
 *   node scripts/backfill-component-history.mjs --dry
 */

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");
const PAGE = 1000;

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ENGINES = [
  {
    engine: "inflection",
    table: "inflection_daily",
    compression: "vc_score",
    label: "stage",
    read: "trade_read",
    structure: null,
  },
  {
    engine: "transition",
    table: "transition_daily",
    compression: "compression_score",
    label: "state",
    read: "alert_state",
    structure: "structure_score",
  },
];

/** PostgREST caps a select at 1000 rows regardless of .limit(), so every full-table read
 *  here has to page or it silently keeps only the newest slice. */
async function readAll(table) {
  const out = [];
  for (let page = 0; page < 200; page++) {
    const from = page * PAGE;
    const { data, error } = await sb
      .from(table)
      .select("*")
      .order("scan_date", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

let grandTotal = 0;

for (const cfg of ENGINES) {
  const rows = await readAll(cfg.table);
  const dates = [...new Set(rows.map((r) => r.scan_date))].sort();
  console.log(
    `${cfg.table}: ${rows.length} rows across ${dates.length} dates ` +
      `(${dates[0]} → ${dates[dates.length - 1]})`,
  );

  const records = rows.map((r) => ({
    scan_date: r.scan_date,
    engine: cfg.engine,
    ticker: r.ticker,
    sector: r.sector ?? null,
    price: r.price ?? 0,
    se_score: r.se_score ?? 0,
    demand_score: r.demand_score ?? 0,
    compression_score: r[cfg.compression] ?? 0,
    runner_score: r.runner_score ?? 0,
    rs_score: r.rs_score ?? 0,
    overall_score: r.overall_score ?? 0,
    structure_score: cfg.structure ? (r[cfg.structure] ?? 0) : null,
    label: r[cfg.label] ?? "",
    read_label: r[cfg.read] ?? "",
    is_coiled: r.is_coiled === true,
    is_primary: r.is_primary === true,
    is_stronger: r.is_stronger === true,
    extension_risk: r.extension_risk === true,
    scanner_version: r.scanner_version ?? null,
  }));

  if (DRY) {
    console.log(`  [dry] would write ${records.length} rows. Sample:`);
    console.log("  " + JSON.stringify(records[0]));
    continue;
  }

  let written = 0;
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    const { error } = await sb
      .from("component_history")
      .upsert(chunk, { onConflict: "scan_date,engine,ticker" });
    if (error) {
      console.error(`  chunk at ${i} failed: ${error.message}`);
      continue;
    }
    written += chunk.length;
    process.stdout.write(`\r  written ${written}/${records.length}`);
  }
  console.log(`\r  written ${written}/${records.length}`);
  grandTotal += written;
}

if (!DRY) {
  const { count } = await sb
    .from("component_history")
    .select("*", { count: "exact", head: true });
  console.log(`\nbackfill wrote ${grandTotal}; component_history now holds ${count} rows`);
}
