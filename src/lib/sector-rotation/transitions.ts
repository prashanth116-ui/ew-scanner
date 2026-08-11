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

export type StockPickCategory = "turnaround" | "inflection" | "leading" | "momentum";

export interface ScannerHit {
  scanner: string;   // "Setup", "Inflect", "Trans"
  detail: string;    // e.g. "PRIORITY", "STARTER", "TRIGGERED"
}

export interface RotationTopStock {
  symbol: string;
  performancePct: number;
  rsAcceleration: number;
  rsDelta: number;
  trendAccel: number | null;
  dailyChangePct: number;
  aboveSma50: boolean;
  volumeVsAvg: number;
  volumeConsistency: number;
  isTurnaroundCandidate: boolean;
  category: StockPickCategory;
  // Cross-system signals
  scannerHits?: ScannerHit[];
  enrichedConviction?: string;   // "HIGH" | "MEDIUM" | "WATCH"
  enrichedCategory?: string;     // "LEADER" | "CATCH_UP" | "TURNAROUND" | "AVOID"
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
  topStocks?: RotationTopStock[];
  // Rotation breadth: how many stocks qualify vs total in sector
  breadth?: { qualified: number; total: number };
  // Historical pattern stats for this sector
  historicalAvgReturn?: number;
  historicalAvgDuration?: number;
  historicalCount?: number;
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
 * Optional stockMap attaches top stocks to each change for the alert.
 */
export function detectRotationChanges(
  current: RotationSnapshot[] | undefined,
  previous: RotationSnapshot[] | undefined,
  stockMap?: Map<string, RotationTopStock[]>
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
    const stocks = stockMap?.get(id);
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
        topStocks: stocks,
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
        topStocks: stocks,
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

const CHANGE_TYPE_TAGS: Record<RotationChange["type"], string> = {
  new_rotation:       "NEW",
  lifecycle_upgrade:  "UPGRADED",
  lifecycle_warning:  "WARNING",
  rotation_ended:     "ENDED",
};

const QUADRANT_EMOJI: Record<string, string> = {
  LEADING: "\uD83D\uDFE2",    // green circle
  IMPROVING: "\uD83D\uDFE1",  // yellow circle
  WEAKENING: "\uD83D\uDFE0",  // orange circle
  LAGGING: "\uD83D\uDD34",    // red circle
};

type ActionTier = "focus" | "monitor" | "exit";

const TIER_LABELS: Record<ActionTier, { emoji: string; title: string }> = {
  focus:   { emoji: "\uD83C\uDFAF", title: "Focus" },        // dart
  monitor: { emoji: "\uD83D\uDC41", title: "Monitor" },      // eye
  exit:    { emoji: "\u26D4",        title: "Ignore / Exit" }, // no entry
};

const TIER_ORDER: ActionTier[] = ["focus", "monitor", "exit"];

const FAVORABLE_QUADRANTS = new Set(["LEADING", "IMPROVING"]);
const STRONG_CONVICTION = new Set(["HIGH", "MODERATE"]);

/**
 * Classify a rotation change into an actionability tier.
 *
 * FOCUS: early/maturing + strong conviction + favorable quadrant
 * EXIT:  exhausting, EXIT conviction, ended, or late + weak signals
 * MONITOR: everything else (mixed signals)
 */
function classifyActionTier(c: RotationChange): ActionTier {
  // Ended rotations are always exit
  if (c.type === "rotation_ended") return "exit";

  // EXIT conviction or EXHAUSTING lifecycle → exit
  if (c.conviction === "EXIT" || c.lifecycle === "EXHAUSTING") return "exit";

  // LATE + weak conviction → exit
  if (c.lifecycle === "LATE" && !STRONG_CONVICTION.has(c.conviction)) return "exit";

  // Early/Maturing + strong conviction + favorable quadrant → focus
  if (
    (c.lifecycle === "EARLY" || c.lifecycle === "MATURING") &&
    STRONG_CONVICTION.has(c.conviction) &&
    FAVORABLE_QUADRANTS.has(c.quadrant)
  ) {
    return "focus";
  }

  // Everything else → monitor
  return "monitor";
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z"); // noon UTC to avoid timezone shift
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Format rotation tracker changes as a Telegram HTML message.
 * Groups by actionability tier (Focus → Monitor → Ignore/Exit).
 * Each entry tagged with change type (NEW, UPGRADED, WARNING, ENDED).
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

  // Classify each change into a tier
  const tierGroups = new Map<ActionTier, RotationChange[]>();
  for (const c of changes) {
    const tier = classifyActionTier(c);
    const arr = tierGroups.get(tier) ?? [];
    arr.push(c);
    tierGroups.set(tier, arr);
  }

  // Sort within each tier: lifecycle (EARLY first) then conviction (HIGH first)
  const CONVICTION_ORDER: Record<string, number> = { HIGH: 0, MODERATE: 1, LOW: 2, EXIT: 3 };
  for (const [, group] of tierGroups) {
    group.sort((a, b) => {
      const lifeDiff = (LIFECYCLE_ORDER[a.lifecycle] ?? 9) - (LIFECYCLE_ORDER[b.lifecycle] ?? 9);
      if (lifeDiff !== 0) return lifeDiff;
      return (CONVICTION_ORDER[a.conviction] ?? 9) - (CONVICTION_ORDER[b.conviction] ?? 9);
    });
  }

  const lines: string[] = [];
  lines.push("\uD83D\uDD14 <b>Rotation Tracker Alert</b>");
  lines.push(date);

  let tierIndex = 0;
  for (const tier of TIER_ORDER) {
    const group = tierGroups.get(tier);
    if (!group || group.length === 0) continue;

    const { emoji, title } = TIER_LABELS[tier];
    if (tierIndex > 0) lines.push("\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    lines.push("");
    lines.push(`${emoji} <b>${title}</b>`);

    for (const c of group) {
      const tag = CHANGE_TYPE_TAGS[c.type];
      lines.push("");

      if (c.type === "rotation_ended") {
        lines.push(`  <b>${c.sectorName}</b> (${c.etf}) \u2014 ${tag}`);
        lines.push(`    Ended after ${c.daysActive} days`);
        lines.push(`    Started ${formatShortDate(c.startDate)} \u2022 Was ${c.lifecycle}`);
      } else if (c.type === "lifecycle_upgrade" || c.type === "lifecycle_warning") {
        lines.push(`  <b>${c.sectorName}</b> (${c.etf}) \u2014 ${tag}`);
        lines.push(`    ${c.previousLifecycle} \u2192 ${c.lifecycle}`);
        lines.push(`    ${qTag(c.quadrant)} \u2022 Day ${c.daysActive} \u2022 ${c.conviction}`);
      } else {
        lines.push(`  <b>${c.sectorName}</b> (${c.etf}) \u2014 ${tag}`);
        lines.push(`    Started ${formatShortDate(c.startDate)} \u2022 Day ${c.daysActive}`);
        lines.push(`    ${qTag(c.quadrant)} \u2022 ${c.lifecycle} \u2022 ${c.conviction}`);
      }

      // Rotation breadth (non-ended only)
      if (c.breadth && c.type !== "rotation_ended") {
        const pct = c.breadth.total > 0
          ? Math.round((c.breadth.qualified / c.breadth.total) * 100)
          : 0;
        const breadthLabel = pct >= 50
          ? "Broad \u2014 wide participation, strong rotation"
          : pct >= 25
            ? "Moderate \u2014 selective participation"
            : "Narrow \u2014 few stocks participating";
        lines.push(`    \uD83D\uDCCA ${c.breadth.qualified}/${c.breadth.total} stocks qualify (${breadthLabel})`);
      }

      // Historical pattern stats
      if (c.historicalCount && c.historicalCount > 0 && c.historicalAvgReturn !== undefined) {
        const sign = c.historicalAvgReturn >= 0 ? "+" : "";
        lines.push(`    \uD83D\uDCC8 Avg ${sign}${c.historicalAvgReturn.toFixed(1)}% over ${c.historicalAvgDuration}d (${c.historicalCount} prior rotations)`);
      }

      // Show top stocks for Focus and Monitor tiers, grouped by category
      if (tier !== "exit" && c.topStocks && c.topStocks.length > 0) {
        // Multi-system confirmations first (highlighted)
        const confirmed = c.topStocks.filter((s) => s.scannerHits && s.scannerHits.length > 0);
        if (confirmed.length > 0) {
          lines.push("");
          lines.push(`    \u2B50 <b>Multi-System Confirmed</b>`);
          for (const s of confirmed) {
            const perf = s.performancePct >= 0 ? `+${s.performancePct.toFixed(1)}%` : `${s.performancePct.toFixed(1)}%`;
            const scanners = s.scannerHits!.map((h) => `${h.scanner}:${h.detail}`).join(" + ");
            const conv = s.enrichedConviction ? ` | ${s.enrichedConviction}` : "";
            const vol = s.volumeConsistency >= 3 ? " \uD83D\uDD25" : "";
            const chase = Math.abs(s.dailyChangePct) >= 5 ? " \u26A0\uFE0F+5%today" : "";
            lines.push(`    <b>${s.symbol}</b> ${perf}${vol}${chase}`);
            lines.push(`      ${scanners}${conv}`);
          }
        }

        // Then remaining stocks by category
        const fmt = (s: RotationTopStock) => {
          const perf = s.performancePct >= 0 ? `+${s.performancePct.toFixed(1)}%` : `${s.performancePct.toFixed(1)}%`;
          const vol = s.volumeConsistency >= 3 ? "\uD83D\uDD25" : "";
          const chase = Math.abs(s.dailyChangePct) >= 5 ? "\u26A0\uFE0F" : "";
          return `${s.symbol} ${perf}${vol}${chase}`.trim();
        };
        const nonConfirmed = c.topStocks.filter((s) => !s.scannerHits || s.scannerHits.length === 0);
        const turnarounds = nonConfirmed.filter((s) => s.category === "turnaround");
        const inflections = nonConfirmed.filter((s) => s.category === "inflection");
        const leaders = nonConfirmed.filter((s) => s.category === "leading");
        if (turnarounds.length > 0) {
          lines.push(`    \uD83D\uDD04 Turnaround: ${turnarounds.map(fmt).join(", ")}`);
        }
        if (inflections.length > 0) {
          lines.push(`    \u21A9\uFE0F Inflection: ${inflections.map(fmt).join(", ")}`);
        }
        if (leaders.length > 0) {
          lines.push(`    \u2705 Leading: ${leaders.map(fmt).join(", ")}`);
        }
        const momentum = nonConfirmed.filter((s) => s.category === "momentum");
        if (momentum.length > 0) {
          lines.push(`    \u26A1 Momentum: ${momentum.map(fmt).join(", ")}`);
        }
      }
    }
    tierIndex++;
  }

  return lines.join("\n").trim();
}
