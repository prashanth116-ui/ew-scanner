/**
 * Sector rotation quadrant transition detection + Telegram alert formatting.
 * Used by the /api/sector-rotation/alert cron route.
 */

import "server-only";

import type { SectorRotationResult, RRGQuadrant } from "./types";
import type { RotationTurn } from "./rotation-turn";
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
  /**
   * How many tracked stocks are currently TRADEABLE CANDIDATES — not breadth.
   *
   * `total` is what the rotation tracker fetched for this sector (price >= $10, dollar
   * volume >= $200M, resolvable chart), and `candidates` is that set minus names gapping
   * >= 8% and minus enrichment category AVOID.
   *
   * This was called `breadth` and it is not one. Breadth rises when a sector strengthens;
   * this FALLS, because a stock ripping 8%+ is excluded as untradeable. On 2026-08-19
   * MRNA's +177% actively reduced the biotech figure while biotech breadth was 82% and
   * rising. Real breadth is `SectorRotationScore.breadthPct` — % of members above their
   * own 50d SMA — which is what feeds the composite and what /sectors displays.
   */
  candidates?: { tradeable: number; tracked: number };
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

      // Tradeable candidates (non-ended only). Deliberately NOT described as breadth or
      // participation — the count drops when a stock gaps, so those words would invert
      // the meaning. It answers "how many can I act on", not "how broad is this move".
      if (c.candidates && c.type !== "rotation_ended") {
        const pct = c.candidates.tracked > 0
          ? Math.round((c.candidates.tradeable / c.candidates.tracked) * 100)
          : 0;
        const label = pct >= 50
          ? "most of the sector is actionable"
          : pct >= 25
            ? "selective \u2014 several excluded as gapping or AVOID"
            : "thin \u2014 few names currently actionable";
        lines.push(`    \uD83C\uDFAF ${c.candidates.tradeable}/${c.candidates.tracked} tradeable (${label})`);
      }

      // Historical pattern stats
      if (c.historicalCount && c.historicalCount > 0 && c.historicalAvgReturn !== undefined) {
        const sign = c.historicalAvgReturn >= 0 ? "+" : "";
        lines.push(`    \uD83D\uDCC8 Avg ${sign}${c.historicalAvgReturn.toFixed(1)}% over ${c.historicalAvgDuration}d (${c.historicalCount} prior rotations)`);
      }

      // Show top stocks for Focus and Monitor tiers
      if (tier !== "exit" && c.topStocks && c.topStocks.length > 0) {
        if (tier === "focus") {
          // Scanner-confirmed stocks first (single line each)
          const confirmed = c.topStocks.filter((s) => s.scannerHits && s.scannerHits.length > 0);
          for (const s of confirmed) {
            const perf = s.performancePct >= 0 ? `+${s.performancePct.toFixed(1)}%` : `${s.performancePct.toFixed(1)}%`;
            const scanners = s.scannerHits!.map((h) => `${h.scanner}:${h.detail}`).join(" + ");
            const conv = s.enrichedConviction && s.enrichedConviction !== "WATCH"
              ? ` | ${s.enrichedConviction}` : "";
            const vol = s.volumeConsistency >= 3 ? " \uD83D\uDD25" : "";
            const star = (s.scannerHits?.length ?? 0) >= 2 ? "\u2B50 " : "";
            lines.push(`    ${star}<b>${s.symbol}</b> ${perf}${vol} \u00B7 ${scanners}${conv}`);
          }
          // Remaining stocks as compact category lists
          const fmtTicker = (s: RotationTopStock) => {
            const vol = s.volumeConsistency >= 3 ? "\uD83D\uDD25" : "";
            return `${s.symbol}${vol}`;
          };
          const nonConfirmed = c.topStocks.filter((s) => !s.scannerHits || s.scannerHits.length === 0);
          const turnarounds = nonConfirmed.filter((s) => s.category === "turnaround");
          const others = nonConfirmed.filter((s) => s.category !== "turnaround");
          if (turnarounds.length > 0) {
            lines.push(`    \uD83D\uDD04 Turnaround: ${turnarounds.map(fmtTicker).join(", ")}`);
          }
          if (others.length > 0) {
            lines.push(`    \u26A1 ${others.map(fmtTicker).join(", ")}`);
          }
        } else {
          // Monitor: just ticker list
          lines.push(`    ${c.topStocks.map((s) => s.symbol).join(", ")}`);
        }
      }
    }
    tierIndex++;
  }

  return lines.join("\n").trim();
}

// ── Rotation × Scanner Confluence ──

type ConfluenceTier = "focus" | "monitor";

const CONFLUENCE_TIER_LABELS: Record<ConfluenceTier, { emoji: string; title: string; subtitle: string }> = {
  focus:   { emoji: "\uD83C\uDFAF", title: "Focus", subtitle: "Early/Maturing Rotations" },
  monitor: { emoji: "\uD83D\uDC41", title: "Monitor", subtitle: "Late/Exhausting" },
};

const CONFLUENCE_TIER_ORDER: ConfluenceTier[] = ["focus", "monitor"];

const CONFLUENCE_CONVICTION_ORDER: Record<string, number> = { HIGH: 0, MODERATE: 1, LOW: 2, WATCH: 3, EXIT: 4 };

const MAX_STOCKS_PER_ROTATION = 5;

interface ConfluenceEntry {
  rotation: RotationSnapshot;
  stocks: RotationTopStock[];
}

/**
 * Format a Telegram message showing stocks with scanner hits across ALL active rotations.
 * Catches stocks that get scanner confirmation within existing rotations that didn't
 * change today (no new_rotation / lifecycle change).
 *
 * Returns null if no scanner-confirmed stocks found (no message sent).
 */
/**
 * "Day N" on a confluence line counts from `RotationEvent.startDate`, which is where
 * `signalCount` first reached 2 — and that clock is not the RS clock. On 2026-09-22 SMH
 * read Day 1 from a 09-21 start while its RS line had turned on 09-17, four sessions
 * earlier; XLE read Day 45 while its RS had turned that very session. The signal clock
 * runs late or early depending on when a 10d/30d SMA cross happens to fire, so neither
 * number alone says how old a rotation is.
 *
 * `startDate` is deliberately NOT changed to the turn date: ENTRY_SCREEN measures breadth,
 * CMF and acceleration on the start bar, and its thresholds were fitted over 78 rotations
 * using signal-count start bars. Moving the bar voids that calibration. So both clocks are
 * shown instead, each labelled, and the reader decides.
 */
function turnAnnotation(etf: string, turns?: Map<string, RotationTurn>): string {
  const t = turns?.get(etf);
  const date = t?.turnDate ?? t?.formingDate;
  if (!date) return "";
  const age = t?.turnDate ? t.barsSinceTurn : t?.barsSinceForming;
  const label = t?.turnDate ? "RS turned" : "RS forming since";
  return age == null ? ` · ${label} ${date}` : ` · ${label} ${date} (${age}d)`;
}

export function formatRotationConfluence(
  currentRotations: RotationSnapshot[],
  stockMap: Map<string, RotationTopStock[]>,
  calculatedAt: string,
  previousTickers?: string[],
  /** Dated RS turns by ETF. Absent is fine — the annotation simply does not render. */
  turnsByEtf?: Map<string, RotationTurn>,
): string | null {
  const prevSet = new Set(previousTickers ?? []);
  // Build entries: rotations with scanner-hit stocks
  const entries: ConfluenceEntry[] = [];
  for (const rot of currentRotations) {
    const stocks = stockMap.get(rot.sectorId);
    if (!stocks) continue;
    const withHits = stocks
      .filter((s) => s.scannerHits && s.scannerHits.length > 0)
      .sort((a, b) => {
        // Multi-scanner stocks first, then by rsDelta descending
        const aMulti = (a.scannerHits?.length ?? 0) >= 2 ? 1 : 0;
        const bMulti = (b.scannerHits?.length ?? 0) >= 2 ? 1 : 0;
        if (bMulti !== aMulti) return bMulti - aMulti;
        return b.rsDelta - a.rsDelta;
      })
      .slice(0, MAX_STOCKS_PER_ROTATION);
    if (withHits.length > 0) {
      entries.push({ rotation: rot, stocks: withHits });
    }
  }

  if (entries.length === 0) return null;

  // Group into tiers
  const tierGroups = new Map<ConfluenceTier, ConfluenceEntry[]>();
  for (const entry of entries) {
    const tier: ConfluenceTier =
      entry.rotation.lifecycle === "EARLY" || entry.rotation.lifecycle === "MATURING"
        ? "focus"
        : "monitor";
    const arr = tierGroups.get(tier) ?? [];
    arr.push(entry);
    tierGroups.set(tier, arr);
  }

  // Sort within each tier: lifecycle (EARLY first) then conviction
  for (const [, group] of tierGroups) {
    group.sort((a, b) => {
      const lifeDiff = (LIFECYCLE_ORDER[a.rotation.lifecycle] ?? 9) - (LIFECYCLE_ORDER[b.rotation.lifecycle] ?? 9);
      if (lifeDiff !== 0) return lifeDiff;
      return (CONFLUENCE_CONVICTION_ORDER[a.rotation.conviction] ?? 9) - (CONFLUENCE_CONVICTION_ORDER[b.rotation.conviction] ?? 9);
    });
  }

  // Format message
  const date = new Date(calculatedAt).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push("\u26A1 <b>Rotation \u00D7 Scanner Confluence</b>");
  lines.push(date);

  let tierIndex = 0;
  for (const tier of CONFLUENCE_TIER_ORDER) {
    const group = tierGroups.get(tier);
    if (!group || group.length === 0) continue;

    const { emoji, title, subtitle } = CONFLUENCE_TIER_LABELS[tier];
    if (tierIndex > 0) lines.push("\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    lines.push("");
    lines.push(`${emoji} <b>${title}</b> \u2014 ${subtitle}`);

    for (const entry of group) {
      const { rotation: rot, stocks } = entry;
      lines.push("");

      if (tier === "focus") {
        // Full detail for actionable rotations
        lines.push(`  <b>${rot.sectorName}</b> (${rot.etf}) \u2014 Day ${rot.daysActive} | ${rot.lifecycle} | ${rot.conviction}${turnAnnotation(rot.etf, turnsByEtf)}`);
        for (const s of stocks) {
          const perf = s.performancePct >= 0 ? `+${s.performancePct.toFixed(1)}%` : `${s.performancePct.toFixed(1)}%`;
          const isMulti = (s.scannerHits?.length ?? 0) >= 2;
          const vol = s.volumeConsistency >= 3 ? " \uD83D\uDD25" : "";
          const star = isMulti ? "\u2B50 " : "";
          const isNew = prevSet.size > 0 && !prevSet.has(s.symbol) ? " \uD83C\uDD95" : "";
          const scanners = s.scannerHits!.map((h) => `${h.scanner}:${h.detail}`).join(" + ");
          // Only show HIGH / MEDIUM conviction (WATCH is noise)
          const conv = s.enrichedConviction && s.enrichedConviction !== "WATCH"
            ? ` | ${s.enrichedConviction}` : "";
          lines.push(`    ${star}<b>${s.symbol}</b> ${perf}${vol}${isNew} \u00B7 ${scanners}${conv}`);
        }
      } else {
        // Compact for late/exhausting — just sector header + ticker list
        lines.push(`  <b>${rot.sectorName}</b> (${rot.etf}) \u00B7 Day ${rot.daysActive} | ${rot.lifecycle}${turnAnnotation(rot.etf, turnsByEtf)}`);
        const monitorTickers = stocks.map((s) => {
          const isNew = prevSet.size > 0 && !prevSet.has(s.symbol) ? " \uD83C\uDD95" : "";
          return `${s.symbol}${isNew}`;
        });
        lines.push(`    ${monitorTickers.join(", ")}`);
      }
    }
    tierIndex++;
  }

  // Copyable watchlist grouped by sector
  const totalStocks = new Set(entries.flatMap((e) => e.stocks.map((s) => s.symbol))).size;
  const scannerNames = [...new Set(entries.flatMap((e) =>
    e.stocks.flatMap((s) => (s.scannerHits ?? []).map((h) => h.scanner))
  ))].sort();
  lines.push("");
  lines.push(`\uD83D\uDCCA ${totalStocks} stocks across ${entries.length} rotations (${scannerNames.join(", ")})`);
  for (const entry of entries) {
    const tickers = entry.stocks.map((s) => s.symbol).join(", ");
    lines.push(`<code>${entry.rotation.etf}: ${tickers}</code>`);
  }

  return lines.join("\n").trim();
}

// ── RS turn alert (focus-scoped) ──

/** Sessions a forming/turned event stays alert-worthy. 0 = it happened on this close. */
const TURN_ALERT_MAX_AGE = 0;
/** Focus members named per sector. Enough to act on, short enough to read on a phone. */
const MAX_TURN_MEMBERS = 6;

/**
 * One focus-list name inside a turning basket, measured by distance above its own 50d SMA.
 *
 * NOT `rsAccel`. That metric is `pctFrom50 - pctFrom200`, which the root CLAUDE.md flags
 * as "naturally deeply negative for healthy uptrends" — sorting it descending ranks the
 * most broken names first. The first live send did exactly that, listing INTU at +19.6
 * above names actually trending, because INTU was far enough below its 200d to score well
 * on a spread that rewards damage. Distance above the 50d has no such inversion.
 */
export interface TurnMember {
  symbol: string;
  /** % above (positive) or below (negative) its own 50d SMA. Null = not measurable. */
  pctFromSma50: number | null;
}

export interface TurnSectorInput {
  sector: string;
  etf: string;
  quadrant: RRGQuadrant;
  /** Mansfield RS vs SPY. Drives the standing-leadership footer, not the alert itself. */
  mansfieldRS?: number;
  rotationTurn?: RotationTurn | null;
  /** Focus-list members of THIS basket. Empty is legitimate (sub-sector baskets). */
  focusMembers?: TurnMember[];
}

/**
 * Focus-list members of each basket, with their current trend state.
 *
 * Reads `SectorRotationResult.stockQuotes`, which the rotation pipeline already builds —
 * no extra fetch. A symbol missing from quotes yields nulls rather than being dropped:
 * "we could not measure this name" and "this name is weak" must not render the same.
 */
export function buildTurnMembers(
  universe: { etf: string; stocks: { symbol: string }[] }[],
  focusList: Set<string>,
  stockQuotes: Record<string, { pctFromSma50: number | null }>,
): Map<string, TurnMember[]> {
  const out = new Map<string, TurnMember[]>();
  for (const basket of universe) {
    const members: TurnMember[] = [];
    for (const st of basket.stocks) {
      if (!focusList.has(st.symbol)) continue;
      members.push({ symbol: st.symbol, pctFromSma50: stockQuotes[st.symbol]?.pctFromSma50 ?? null });
    }
    // Strongest first, and unmeasurable names last rather than sorted as if they were the
    // weakest — a name we could not read is not a name that failed.
    members.sort((a, b) => (b.pctFromSma50 ?? -Infinity) - (a.pctFromSma50 ?? -Infinity));
    out.set(basket.etf, members);
  }
  return out;
}

/** Named members, strongest first, each with its distance from its own 50d SMA. */
function renderMembers(members: TurnMember[] | undefined): string[] {
  if (!members || members.length === 0) return [];
  const measured = members.filter((m) => m.pctFromSma50 !== null);
  const above = measured.filter((m) => (m.pctFromSma50 as number) > 0).length;
  const named = members.slice(0, MAX_TURN_MEMBERS).map((m) => {
    if (m.pctFromSma50 === null) return `?${m.symbol}`;
    const tick = m.pctFromSma50 > 0 ? "✓" : "·";
    return `${tick}${m.symbol} ${m.pctFromSma50 >= 0 ? "+" : ""}${m.pctFromSma50.toFixed(1)}%`;
  });
  const more = members.length > MAX_TURN_MEMBERS ? ` +${members.length - MAX_TURN_MEMBERS} more` : "";
  const headline = measured.length > 0
    ? `Your names — ${above}/${measured.length} above their 50d, furthest above first:`
    : `Your names — trend state unavailable tonight:`;
  return [`     ${headline}`, `     ${named.join("  ")}${more}`];
}

/**
 * Tonight's new RS turns, scoped to the baskets holding names you actually trade.
 *
 * WHY THIS IS SEPARATE FROM THE QUADRANT TRANSITION ALERT
 *
 * The 6 PM alert fires on RRG quadrant changes, and the quadrant runs 3-5 sessions behind
 * the RS line by construction. SMH is the case that prompted this: the quadrant alert
 * would have fired on 2026-09-21, by which point entering returned 0.00% against SPY.
 * Entering on the 09-16 forming print returned +6.67% and on the 09-17 reclaim +4.89%.
 *
 * LEAD IS THE HEADLINE, AND IT IS NOT UNIFORM
 *
 * The first cut of this message listed every turn identically, and the first live send
 * went out on IGV and XLC — both `quadrantAlreadyAligned`, meaning the quadrant never
 * left the bullish bucket and the 6 PM alert already covered them. Those carry NO lead;
 * they are dip-and-recover re-entries inside an existing uptrend. Presenting them the
 * same way as an SMH-style turn that beats the quadrant by four sessions is the one
 * mistake that makes the whole section untrustworthy, so lead is now the sort key, it is
 * stated in words on every line, and no-lead turns are demoted below a divider.
 *
 * TWO STAGES:
 *   TURNED  — the RS line closed back above its fast SMA today. A completed event.
 *   FORMING — still BELOW that average but risen two sessions with the gap closing.
 *             Measured over 37 ETFs and 3 years this carries NO forward edge over a
 *             random session and under half are followed by a reclaim within five
 *             sessions. Where to look tomorrow, not what to buy tonight.
 *
 * Only events dated to THIS session are listed (`TURN_ALERT_MAX_AGE`) — a forming run can
 * persist for a week, and re-sending the same names nightly is how a useful alert becomes
 * one you stop reading.
 *
 * Returns null when nothing new fired, so the caller can skip the send entirely.
 */
export function formatRotationTurns(
  sectors: TurnSectorInput[],
  focusEtfs: Set<string>,
  calculatedAt: string,
): string | null {
  const scoped = sectors.filter((s) => focusEtfs.has(s.etf) && s.rotationTurn);

  const turned = scoped.filter(
    (s) =>
      s.rotationTurn!.direction === "UP" &&
      s.rotationTurn!.turnDate != null &&
      s.rotationTurn!.barsSinceTurn != null &&
      s.rotationTurn!.barsSinceTurn <= TURN_ALERT_MAX_AGE,
  );
  const formingNew = scoped.filter(
    (s) =>
      s.rotationTurn!.stage === "TURN_FORMING" &&
      s.rotationTurn!.barsSinceForming != null &&
      s.rotationTurn!.barsSinceForming <= TURN_ALERT_MAX_AGE,
  );
  const formingStanding = scoped.filter((s) => s.rotationTurn!.stage === "TURN_FORMING").length;

  if (turned.length === 0 && formingNew.length === 0) return null;

  const hasLead = (s: TurnSectorInput) => !s.rotationTurn!.quadrantAlreadyAligned;
  const withLead = turned.filter(hasLead);
  const noLead = turned.filter((s) => !hasLead(s));

  const date = new Date(calculatedAt).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push("↻ <b>RS Turns</b> — focus sectors");
  lines.push(date);

  /**
   * Detail budget scales with lead, because attention should.
   *
   * A lead-bearing turn is the only thing here you cannot get from the 6 PM alert, so it
   * earns the RS distance, the failure count and the member list. A re-entry earns one
   * line: the section header already says it has no lead, and repeating "the sector never
   * left it · already covered by the 6 PM alert" under every entry spent six lines each
   * restating the heading. The count of members above their 50d is the only part of that
   * block worth keeping, and their tickers are in the confluence body below anyway.
   */
  const detailLines = (s: TurnSectorInput): string[] => {
    const t = s.rotationTurn!;
    const out: string[] = [];
    const dist = `${t.distanceFromFastPct >= 0 ? "+" : ""}${t.distanceFromFastPct.toFixed(1)}%`;
    const rel = t.stage === "TURN_FORMING" ? "below" : "above";
    const bits = [`RS ${dist} ${rel} 20d`, `low ${t.rsLowDate ?? "?"}`];
    if (t.priorFailedAttempts > 0) bits.push(`${t.priorFailedAttempts} prior reclaims failed`);
    out.push(`     ${bits.join(" · ")}`);
    out.push(...renderMembers(s.focusMembers));
    return out;
  };

  /** One line, count only — enough to know whether your names are participating. */
  const compactLine = (s: TurnSectorInput): string => {
    const t = s.rotationTurn!;
    const measured = (s.focusMembers ?? []).filter((m) => m.pctFromSma50 !== null);
    const above = measured.filter((m) => (m.pctFromSma50 as number) > 0).length;
    const names = measured.length > 0 ? ` · ${above}/${measured.length} names above their 50d` : "";
    return `  <b>${s.sector}</b> (${s.etf}) — reclaimed ${t.turnDate}${names}`;
  };

  if (withLead.length > 0) {
    lines.push("");
    lines.push("★ <b>TURNED TONIGHT — ahead of the quadrant</b>");
    for (const s of withLead) {
      const t = s.rotationTurn!;
      lines.push("");
      lines.push(`  <b>${s.sector}</b> (${s.etf}) — reclaimed ${t.turnDate}, quadrant still ${s.quadrant}`);
      lines.push(...detailLines(s));
    }
  }

  if (formingNew.length > 0) {
    lines.push("");
    lines.push("~ <b>FORMING — rising into its 20d, no reclaim yet</b>");
    for (const s of formingNew) {
      lines.push("");
      lines.push(`  <b>${s.sector}</b> (${s.etf}) — rising since ${s.rotationTurn!.formingDate}`);
      lines.push(...detailLines(s));
    }
    lines.push("");
    lines.push("  <i>Watchlist — no measured edge until the reclaim.</i>");
  }

  if (noLead.length > 0) {
    lines.push("");
    // The divider separates re-entries from the sections above. On a night when every
    // turn is a re-entry there is nothing above it, and a rule with nothing on one side
    // reads like a rendering fault.
    if (withLead.length > 0 || formingNew.length > 0) lines.push("────────────────────");
    lines.push("↺ <b>RE-ENTRIES</b> — quadrant never left the bucket, already in the 6 PM alert");
    for (const s of noLead) lines.push(compactLine(s));
  }

  if (formingStanding > formingNew.length) {
    const rest = formingStanding - formingNew.length;
    lines.push("");
    lines.push(
      `<i>${rest} other basket${rest === 1 ? "" : "s"} still forming from earlier sessions — not repeated here.</i>`,
    );
  }

  // Standing leadership, always, even though it is not "news".
  //
  // Everything above is a list of CHANGES dated to tonight, and a change list reads as a
  // strength ranking unless something says otherwise. On 2026-09-21 the only fires were
  // IGV and XLC — both no-lead re-entries sitting 6th and 9th of 12 on relative strength,
  // both NEGATIVE against SPY over five sessions — while SMH, which turned on 09-17 and
  // led the board at +8.4%, was absent because its turn was no longer new. Read without
  // this footer the message says money rotated out of semis into software, which is the
  // opposite of what happened.
  const ranked = scoped
    .filter((s) => typeof s.mansfieldRS === "number")
    .sort((a, b) => (b.mansfieldRS as number) - (a.mansfieldRS as number));
  if (ranked.length >= 3) {
    const top = ranked.slice(0, 3).map((s) => {
      const v = s.mansfieldRS as number;
      return `${s.etf} ${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
    });
    lines.push("");
    lines.push("────────────────────");
    lines.push(`<b>Standing leaders</b> (RS vs SPY): ${top.join(" · ")}`);
    lines.push(
      "<i>Above is what changed tonight, not where the money is.</i>",
    );
  }

  return lines.join("\n").trim();
}
