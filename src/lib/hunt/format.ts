/**
 * Render the hunt report for Telegram.
 *
 * Isomorphic (no server-only) so it can be unit-tested without a database.
 */

import type { HuntReport, HuntName } from "./hunt-report";

/** Per-section caps. The report is a shortlist; past this it becomes a table to skim. */
const CAP = { coiled: 12, ready: 12, loaded: 12 } as const;

const star = (n: HuntName) => (n.isFocus ? "★" : "");

function catTag(n: HuntName): string {
  if (!n.catalyst) return "";
  const d = n.catalyst.daysUntil;
  const when = d === 0 ? "TODAY" : d === 1 ? "1d" : `${d}d`;
  return `  ⚡${when}`;
}

/** "R70 se44 dem51" — the three numbers that decide whether to act, in that order. */
function nums(n: HuntName): string {
  const parts: string[] = [];
  if (n.runner != null) parts.push(`R${n.runner}`);
  if (n.se != null) parts.push(`se${n.se}`);
  if (n.demand != null) parts.push(`d${n.demand}`);
  return parts.join(" ");
}

function section(title: string, note: string, rows: HuntName[], cap: number, line: (n: HuntName) => string): string[] {
  if (rows.length === 0) return [];
  const out = [`<b>◆ ${title} (${rows.length})</b>`, `<i>${note}</i>`];
  for (const n of rows.slice(0, cap)) out.push(line(n));
  if (rows.length > cap) out.push(`... +${rows.length - cap} more`);
  out.push("");
  return out;
}

export function formatHuntReport(r: HuntReport, dateLabel: string): string {
  const lines: string[] = [`<b>\u{1F3AF} HUNT</b> — ${dateLabel}`, ""];

  lines.push(...section(
    "COILED", "setup complete, break not printed — where you want to be buying",
    r.coiled, CAP.coiled,
    (n) => `${star(n)}<b>${n.ticker}</b> ${nums(n)}${catTag(n)}\n   ${n.label}${n.cross ? ` · ${n.cross}` : ""}`,
  ));

  lines.push(...section(
    "READY / TRIGGERED", "structure flipped — READY listed first, the trigger is still ahead",
    r.ready, CAP.ready,
    (n) => `${star(n)}<b>${n.ticker}</b> ${n.alertState} ${n.score ?? ""} ${nums(n)}${catTag(n)}\n   ${n.label}`,
  ));

  lines.push(...section(
    "LOADED", "room to run, no trigger yet — a research queue, NOT an entry",
    r.loaded, CAP.loaded,
    (n) => `${star(n)}<b>${n.ticker}</b> ${nums(n)}${catTag(n) || "  — no known catalyst"}`,
  ));

  if (r.research.length > 0) {
    lines.push("<b>\u{1F50E} HOMEWORK</b>");
    lines.push("<i>on your list, loaded, and no date known — go find one</i>");
    lines.push(r.research.map((n) => n.ticker).join(", "));
    lines.push("");
  }

  if (r.coiled.length === 0 && r.ready.length === 0 && r.loaded.length === 0) {
    lines.push("Nothing set up tonight. That is a valid answer, not a failure — forcing");
    lines.push("a trade on an empty screen is how the edge gets given back.");
  }

  return lines.join("\n").trimEnd();
}
