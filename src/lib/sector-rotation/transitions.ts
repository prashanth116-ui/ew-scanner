/**
 * Sector rotation quadrant transition detection + Telegram alert formatting.
 * Used by the /api/sector-rotation/alert cron route.
 */

import "server-only";

import type { SectorRotationResult, RRGQuadrant } from "./types";
import type { DailySnapshot, SectorSnapshot } from "./history";

export interface QuadrantTransition {
  sector: string;
  etf: string;
  from: RRGQuadrant;
  to: RRGQuadrant;
  compositeScore: number;
  acceleration: number;
  stealthAccumulation: boolean;
}

type TransitionCategory =
  | "rotation_starting"   // LAGGING -> IMPROVING
  | "breakout_confirmed"  // IMPROVING -> LEADING
  | "momentum_fading"     // LEADING -> WEAKENING
  | "rotation_out"        // WEAKENING -> LAGGING
  | "other";

const CATEGORY_ORDER: TransitionCategory[] = [
  "rotation_starting",
  "breakout_confirmed",
  "momentum_fading",
  "rotation_out",
  "other",
];

const CATEGORY_LABELS: Record<TransitionCategory, { emoji: string; title: string }> = {
  rotation_starting:  { emoji: "\uD83D\uDD04", title: "Rotation Starting" },
  breakout_confirmed: { emoji: "\uD83D\uDE80", title: "Breakout Confirmed" },
  momentum_fading:    { emoji: "\u26A0\uFE0F", title: "Momentum Fading" },
  rotation_out:       { emoji: "\uD83D\uDCC9", title: "Rotation Out" },
  other:              { emoji: "\u2194\uFE0F", title: "Quadrant Change" },
};

function classifyTransition(from: RRGQuadrant, to: RRGQuadrant): TransitionCategory {
  if (from === "LAGGING" && to === "IMPROVING") return "rotation_starting";
  if (from === "IMPROVING" && to === "LEADING") return "breakout_confirmed";
  if (from === "LEADING" && to === "WEAKENING") return "momentum_fading";
  if (from === "WEAKENING" && to === "LAGGING") return "rotation_out";
  return "other";
}

/**
 * Compare current sector rotation data vs previous daily snapshot.
 * Returns transitions where a sector changed RRG quadrant.
 */
export function detectTransitions(
  current: SectorRotationResult,
  previous: DailySnapshot | null
): QuadrantTransition[] {
  if (!previous) return [];

  const prevMap = new Map<string, SectorSnapshot>();
  for (const s of previous.sectors) {
    prevMap.set(s.sector, s);
  }

  const transitions: QuadrantTransition[] = [];
  for (const sector of current.sectors) {
    const prev = prevMap.get(sector.sector);
    if (!prev) continue;
    if (sector.quadrant !== prev.quadrant) {
      transitions.push({
        sector: sector.sector,
        etf: sector.etf,
        from: prev.quadrant,
        to: sector.quadrant,
        compositeScore: sector.compositeScore,
        acceleration: sector.acceleration,
        stealthAccumulation: sector.stealthAccumulation,
      });
    }
  }

  return transitions;
}

/**
 * Format a Telegram HTML message for sector rotation transitions.
 * Groups transitions by category (most actionable first).
 */
export function formatRotationAlert(
  transitions: QuadrantTransition[],
  topStocks: SectorRotationResult["topStocksToWatch"],
  calculatedAt: string
): string {
  const date = new Date(calculatedAt).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push("<b>Sector Rotation Alert</b>");
  lines.push(date);
  lines.push("");

  // Group transitions by category
  const grouped = new Map<TransitionCategory, QuadrantTransition[]>();
  for (const t of transitions) {
    const cat = classifyTransition(t.from, t.to);
    const arr = grouped.get(cat) ?? [];
    arr.push(t);
    grouped.set(cat, arr);
  }

  // Output in priority order
  for (const cat of CATEGORY_ORDER) {
    const group = grouped.get(cat);
    if (!group || group.length === 0) continue;

    const { emoji, title } = CATEGORY_LABELS[cat];
    lines.push(`${emoji} <b>${title}</b>`);

    for (const t of group) {
      lines.push(
        `${t.sector} (${t.etf}): ${t.from} \u2192 ${t.to}`
      );
      const parts: string[] = [`Score: ${t.compositeScore}`];
      const accelSign = t.acceleration >= 0 ? "+" : "";
      parts.push(`Accel: ${accelSign}${Math.round(t.acceleration)}`);
      if (t.stealthAccumulation) parts.push("Stealth: YES");
      lines.push(`  ${parts.join(" | ")}`);

      // Add top stocks for "rotation starting" and "breakout confirmed" sectors
      if (cat === "rotation_starting" || cat === "breakout_confirmed") {
        const sectorStocks = topStocks.find((s) => s.sector === t.sector);
        if (sectorStocks && sectorStocks.stocks.length > 0) {
          const tickers = sectorStocks.stocks.map((s) => s.ticker).join(", ");
          lines.push(`  Top stocks: ${tickers}`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
