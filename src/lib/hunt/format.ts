/**
 * Render the hunt report for Telegram.
 *
 * The message has to be readable at 6am without a decoder ring, which means the numbers
 * carry a legend and the notable ones carry a computed reading. It also has to stay
 * short: a report that explains every number is noise, and noise is skimmed. Hints are
 * capped at two per row for that reason.
 *
 * Isomorphic (no server-only) so it can be unit-tested without a database.
 */

import type { HuntReport, HuntName } from "./hunt-report";

/** Per-section caps. The report is a shortlist; past this it becomes a table to skim. */
const CAP = { coiled: 10, ready: 10, loaded: 10 } as const;
/** More than two readings on one row stops being a hint and becomes an essay. */
const MAX_HINTS = 2;

const star = (n: HuntName) => (n.isFocus ? "★" : "");

function catTag(n: HuntName): string {
  if (!n.catalyst) return "";
  const d = n.catalyst.daysUntil;
  return `  ⚡${d === 0 ? "TODAY" : `${d}d`}`;
}

/** "R70 se44 d51" — can it move · are sellers done · are buyers in. */
function nums(n: HuntName): string {
  const parts: string[] = [];
  if (n.runner != null) parts.push(`R${n.runner}`);
  if (n.se != null) parts.push(`se${n.se}`);
  if (n.demand != null) parts.push(`d${n.demand}`);
  return parts.join(" ");
}

const hintTag = (n: HuntName) =>
  n.hints.length ? `  <i>← ${n.hints.slice(0, MAX_HINTS).join(", ")}</i>` : "";

function section(
  title: string, action: string, rows: HuntName[], cap: number, line: (n: HuntName) => string,
): string[] {
  if (rows.length === 0) return [];
  const out = [`<b>◆ ${title} (${rows.length})</b>`, `<i>${action}</i>`];
  for (const n of rows.slice(0, cap)) out.push(line(n));
  if (rows.length > cap) out.push(`... +${rows.length - cap} more`);
  out.push("");
  return out;
}

export function formatHuntReport(r: HuntReport, dateLabel: string): string {
  const lines: string[] = [
    `<b>\u{1F3AF} HUNT</b> — ${dateLabel}`,
    "<i>R=room to move · se=sellers done · d=buyers in · ★=your list · ⚡=catalyst</i>",
    "",
  ];

  lines.push(...section(
    "COILED", "BUY ZONE — setup complete, break has not printed. Rank by R.",
    r.coiled, CAP.coiled,
    (n) => `${star(n)}<b>${n.ticker}</b> ${nums(n)}${catTag(n)}${hintTag(n)}\n   ${n.label}${n.cross ? ` · ${n.cross}` : ""}`,
  ));

  lines.push(...section(
    "READY / TRIGGERED", "Structure flipped. Prefer READY over TRIGGERED, and high d over high R.",
    r.ready, CAP.ready,
    (n) => `${star(n)}<b>${n.ticker}</b> ${n.alertState} ${n.score ?? ""} ${nums(n)}${catTag(n)}${hintTag(n)}\n   ${n.label}`,
  ));

  lines.push(...section(
    "LOADED", "DO NOT BUY. Room but no buyers — these are names to research, not enter.",
    r.loaded, CAP.loaded,
    (n) => `${star(n)}<b>${n.ticker}</b> ${nums(n)}${catTag(n) || "  — no known date"}`,
  ));

  if (r.research.length > 0) {
    lines.push("<b>\u{1F50E} HOMEWORK</b>");
    lines.push("<i>Loaded, on your list, no date known. Find one, then tag it at /catalysts —</i>");
    lines.push("<i>this is the only step the scanners cannot do for you.</i>");
    lines.push(r.research.map((n) => n.ticker).join(", "));
    lines.push("");
  }

  if (r.coiled.length === 0 && r.ready.length === 0 && r.loaded.length === 0) {
    lines.push("Nothing set up tonight. That is a valid answer, not a failure — forcing");
    lines.push("a trade on an empty screen is how the edge gets given back.");
    return lines.join("\n").trimEnd();
  }

  // The card goes at the FOOTER, not the header. While reading the rows you need the
  // symbols; having finished them you need the decision. Repeating it every night is the
  // point — this is read at 6am on a phone, and anything you have to remember is
  // something you will not.
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("<b>COILED</b> → buy zone");
  lines.push("<b>READY</b> → only if <b>d</b> is high");
  lines.push("<b>LOADED</b> → research, never buy");
  lines.push("");
  lines.push("<b>R</b> how far it can go");
  lines.push("<b>se</b> sellers done · <b>d</b> buyers in");
  lines.push("<b>High R + high d = good</b>");
  lines.push("<b>High R + low d = trap</b>");
  return lines.join("\n").trimEnd();
}
