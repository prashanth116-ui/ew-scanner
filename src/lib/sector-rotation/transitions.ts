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

// ── Rotation Tracker Change Detection ──

export interface RotationSnapshot {
  sectorId: string;
  sectorName: string;
  etf: string;
  lifecycle: string;
  conviction: string;
  quadrant: string;
  daysActive: number;
  startDate: string;
}

export interface RotationChange {
  type: "new_rotation" | "rotation_ended" | "lifecycle_upgrade" | "lifecycle_warning";
  sectorName: string;
  etf: string;
  startDate: string;
  daysActive: number;
  lifecycle: string;
  conviction: string;
  quadrant: string;
  previousLifecycle?: string;
}

const LIFECYCLE_ORDER: Record<string, number> = {
  EARLY: 0,
  MATURING: 1,
  LATE: 2,
  EXHAUSTING: 3,
};

/**
 * Compare current vs previous rotation tracker snapshots.
 * Detects new rotations, ended rotations, and lifecycle stage changes.
 */
export function detectRotationChanges(
  current: RotationSnapshot[] | undefined,
  previous: RotationSnapshot[] | undefined
): RotationChange[] {
  if (!current && !previous) return [];

  const changes: RotationChange[] = [];
  const currentMap = new Map<string, RotationSnapshot>();
  const previousMap = new Map<string, RotationSnapshot>();

  for (const r of current ?? []) currentMap.set(r.sectorId, r);
  for (const r of previous ?? []) previousMap.set(r.sectorId, r);

  // New rotations: in current but not in previous
  for (const [id, cur] of currentMap) {
    const prev = previousMap.get(id);
    if (!prev) {
      changes.push({
        type: "new_rotation",
        sectorName: cur.sectorName,
        etf: cur.etf,
        startDate: cur.startDate,
        daysActive: cur.daysActive,
        lifecycle: cur.lifecycle,
        conviction: cur.conviction,
        quadrant: cur.quadrant,
      });
    } else if (cur.lifecycle !== prev.lifecycle) {
      // Lifecycle changed — classify as upgrade or warning
      const curOrder = LIFECYCLE_ORDER[cur.lifecycle] ?? 0;
      const prevOrder = LIFECYCLE_ORDER[prev.lifecycle] ?? 0;
      changes.push({
        type: curOrder < prevOrder ? "lifecycle_upgrade" : "lifecycle_warning",
        sectorName: cur.sectorName,
        etf: cur.etf,
        startDate: cur.startDate,
        daysActive: cur.daysActive,
        lifecycle: cur.lifecycle,
        conviction: cur.conviction,
        quadrant: cur.quadrant,
        previousLifecycle: prev.lifecycle,
      });
    }
  }

  // Ended rotations: in previous but not in current
  for (const [id, prev] of previousMap) {
    if (!currentMap.has(id)) {
      changes.push({
        type: "rotation_ended",
        sectorName: prev.sectorName,
        etf: prev.etf,
        startDate: prev.startDate,
        daysActive: prev.daysActive,
        lifecycle: prev.lifecycle,
        conviction: prev.conviction,
        quadrant: prev.quadrant,
      });
    }
  }

  return changes;
}

const CHANGE_TYPE_ORDER: RotationChange["type"][] = [
  "new_rotation",
  "lifecycle_upgrade",
  "lifecycle_warning",
  "rotation_ended",
];

const CHANGE_TYPE_LABELS: Record<RotationChange["type"], { emoji: string; title: string }> = {
  new_rotation:       { emoji: "\uD83C\uDD95", title: "New Rotation Started" },
  lifecycle_upgrade:  { emoji: "\u2B06\uFE0F", title: "Lifecycle Upgrade" },
  lifecycle_warning:  { emoji: "\u26A0\uFE0F", title: "Lifecycle Warning" },
  rotation_ended:     { emoji: "\uD83D\uDD1A", title: "Rotation Ended" },
};

const QUADRANT_EMOJI: Record<string, string> = {
  LEADING: "\uD83D\uDFE2",    // green circle
  IMPROVING: "\uD83D\uDFE1",  // yellow circle
  WEAKENING: "\uD83D\uDFE0",  // orange circle
  LAGGING: "\uD83D\uDD34",    // red circle
};

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z"); // noon UTC to avoid timezone shift
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Format rotation tracker changes as a Telegram HTML message.
 * Groups by change type, most actionable first.
 */
export function formatRotationChanges(changes: RotationChange[], calculatedAt: string): string {
  if (changes.length === 0) return "";

  const date = new Date(calculatedAt).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const qTag = (q: string) => `${QUADRANT_EMOJI[q] ?? "\u26AA"} ${q}`;

  const lines: string[] = [];
  lines.push("\uD83D\uDD14 <b>Rotation Tracker Alert</b>");
  lines.push(date);
  lines.push("");

  // Group by type
  const grouped = new Map<RotationChange["type"], RotationChange[]>();
  for (const c of changes) {
    const arr = grouped.get(c.type) ?? [];
    arr.push(c);
    grouped.set(c.type, arr);
  }

  for (const type of CHANGE_TYPE_ORDER) {
    const group = grouped.get(type);
    if (!group || group.length === 0) continue;

    const { emoji, title } = CHANGE_TYPE_LABELS[type];
    lines.push(`${emoji} <b>${title}</b>`);
    lines.push("");

    for (const c of group) {
      if (type === "new_rotation") {
        lines.push(`<b>${c.sectorName}</b> (${c.etf})`);
        lines.push(`  Started ${formatShortDate(c.startDate)} \u2022 Day ${c.daysActive}`);
        lines.push(`  ${qTag(c.quadrant)} \u2022 ${c.lifecycle} \u2022 ${c.conviction}`);
      } else if (type === "lifecycle_upgrade" || type === "lifecycle_warning") {
        lines.push(`<b>${c.sectorName}</b> (${c.etf})`);
        lines.push(`  ${c.previousLifecycle} \u2192 ${c.lifecycle}`);
        lines.push(`  ${qTag(c.quadrant)} \u2022 Day ${c.daysActive} \u2022 ${c.conviction}`);
        lines.push(`  Started ${formatShortDate(c.startDate)}`);
      } else {
        // rotation_ended
        lines.push(`<b>${c.sectorName}</b> (${c.etf})`);
        lines.push(`  Ended after ${c.daysActive} days`);
        lines.push(`  Started ${formatShortDate(c.startDate)} \u2022 Was ${c.lifecycle}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}
