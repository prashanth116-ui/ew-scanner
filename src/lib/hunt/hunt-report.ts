/**
 * The hunt report — the three questions that lead to a position, in order.
 *
 * The nightly summary answers "what did the scanners agree on tonight". That is a
 * confluence view, and confluence is backward-looking by construction: it counts how many
 * engines have already fired. This answers the different question you actually act on —
 * where in the sequence is each name, and what is the next thing I should do about it?
 *
 *   1. COILED       — setup complete, break not printed. Where you want to be buying.
 *   2. READY        — trigger within reach, or a break that lacked participation.
 *   3. LOADED       — room to run, no trigger yet. A research queue, not an entry.
 *
 * TRIGGERED is reported but deliberately ranked last within step 2: it means the move
 * already happened. It is here so you can see what left without you, not as a signal.
 *
 * SERVER-ONLY.
 */

import "server-only";

import { loadInflectionDaily, loadTransitionDaily } from "@/lib/supabase/persistence";
import { loadCatalystMap, type CatalystTagWithCountdown } from "@/lib/supabase/catalyst-tags";
import { isLoadedSpring, springRank } from "@/lib/prerun/loaded-spring";
import { isFocusTicker } from "@/data/focus-list";

export interface HuntName {
  ticker: string;
  isFocus: boolean;
  runner: number | null;
  se: number | null;
  demand: number | null;
  score: number | null;
  /** Inflection stage, or Transition state, depending on the section. */
  label: string;
  /** Transition alert state where relevant. */
  alertState?: string;
  /** Cross-reference: what the OTHER engine says about the same name. */
  cross?: string;
  catalyst: CatalystTagWithCountdown | null;
  /** Short directive annotations — what this row's numbers imply, computed rather than
   *  left for the reader to derive at 6am. Kept to at most two per row: an alert that
   *  needs a decoder ring is not finished, but one that explains every number is noise. */
  hints: string[];
}

export interface HuntReport {
  scanDate: string;
  coiled: HuntName[];
  ready: HuntName[];
  loaded: HuntName[];
  /** Loaded springs with no known catalyst — the actual homework. */
  research: HuntName[];
}

/**
 * Thresholds for the directive hints. These annotate, they never filter — a hint is a
 * reading of numbers already on the row, so it can never hide a name from you.
 */
const HINT = {
  /** Below this, structure flipped without buyers behind it — the classic failed break. */
  THIN_DEMAND: 30,
  /** A catalyst this close means an entry now is held through the event. */
  EVENT_WINDOW: 10,
  /** Runner at or above this is the reason to look at a name at all. */
  BIG_RUNNER: 70,
} as const;

/** Focus names first, then by the section's own ranking. */
function focusFirst<T extends { isFocus: boolean }>(rows: T[]): T[] {
  return [...rows.filter((r) => r.isFocus), ...rows.filter((r) => !r.isFocus)];
}

export async function buildHuntReport(scanDate: string): Promise<HuntReport> {
  const [inflection, transition, catalysts] = await Promise.all([
    loadInflectionDaily(scanDate),
    loadTransitionDaily(scanDate),
    loadCatalystMap({ withinDays: 30, pastDays: 0 }),
  ]);

  const trByTicker = new Map(transition.map((r) => [r.ticker, r]));
  const infByTicker = new Map(inflection.map((r) => [r.ticker, r]));
  const cat = (t: string) => catalysts.get(t) ?? null;

  // ── 1. COILED — from either engine. The definition is identical on both, but a name
  // can qualify on one and not the other when only one has enough history.
  const coiledTickers = new Set<string>([
    ...inflection.filter((r) => r.is_coiled === true).map((r) => r.ticker),
    ...transition.filter((r) => r.is_coiled === true).map((r) => r.ticker),
  ]);
  const coiled: HuntName[] = [...coiledTickers].map((ticker) => {
    const i = infByTicker.get(ticker);
    const t = trByTicker.get(ticker);
    return {
      ticker,
      isFocus: isFocusTicker(ticker),
      runner: i?.runner_score ?? t?.runner_score ?? null,
      se: i?.se_score ?? t?.se_score ?? null,
      demand: i?.demand_score ?? t?.demand_score ?? null,
      score: i?.overall_score ?? t?.overall_score ?? null,
      label: i?.stage ?? t?.state ?? "",
      cross: t ? `${t.state} / ${t.alert_state}` : undefined,
      catalyst: cat(ticker),
      hints: [],
    };
  }).sort((a, b) => (b.runner ?? 0) - (a.runner ?? 0));

  // ── 2. READY / TRIGGERED, restricted to focus names.
  //
  // Unrestricted this returned 95 of 202 transition rows — too broad to be a hunt
  // section, and a header reading "(95)" claims far more than it delivers. READY is a
  // much weaker condition than COILED or LOADED, so it needs the focus list to carry the
  // selectivity the state itself does not.
  //
  // COILED and LOADED are deliberately NOT restricted: both are rare enough to stay
  // readable, and a non-focus name showing up there is a candidate for the list. A
  // non-focus name at READY is not — you were never going to trade it.
  //
  // Coiled names are excluded because they are already in step 1.
  const ready: HuntName[] = transition
    .filter((r) =>
      (r.alert_state === "READY" || r.alert_state === "TRIGGERED") &&
      r.structure_available !== false &&
      isFocusTicker(r.ticker) &&
      !coiledTickers.has(r.ticker))
    .map((r) => ({
      ticker: r.ticker,
      isFocus: isFocusTicker(r.ticker),
      runner: r.runner_score ?? null,
      se: r.se_score ?? null,
      demand: r.demand_score ?? null,
      score: r.overall_score,
      label: r.state,
      alertState: r.alert_state,
      catalyst: cat(r.ticker),
      hints: [],
    }))
    // READY before TRIGGERED at equal quality: READY is a trigger still ahead of you.
    .sort((a, b) =>
      (a.alertState === b.alertState ? 0 : a.alertState === "READY" ? -1 : 1) ||
      (b.runner ?? 0) - (a.runner ?? 0));

  // ── 3. LOADED — room, no trigger. Never overlaps COILED by construction (its demand
  // bar IS the coiled bar), but filter anyway so a future threshold change cannot
  // silently double-report a name.
  const loaded: HuntName[] = inflection
    .filter((r) => !coiledTickers.has(r.ticker) && isLoadedSpring({
      runnerScore: r.runner_score,
      seScore: r.se_score,
      demandScore: r.demand_score,
      extensionRisk: r.extension_risk,
      isCoiled: r.is_coiled,
    }))
    .map((r) => ({
      ticker: r.ticker,
      isFocus: isFocusTicker(r.ticker),
      runner: r.runner_score ?? null,
      se: r.se_score ?? null,
      demand: r.demand_score ?? null,
      score: r.overall_score,
      label: r.stage,
      catalyst: cat(r.ticker),
      hints: [],
    }))
    .sort((a, b) => springRank({ runnerScore: b.runner, seScore: b.se }) -
                    springRank({ runnerScore: a.runner, seScore: a.se }));

  // Cross-section reads have to happen here, once every section exists.
  const loadedTickers = new Set(loaded.map((n) => n.ticker));

  for (const n of coiled) {
    // Coiled AND its trigger already within reach is the tightest timing in the message.
    if (n.cross?.includes("READY") || n.cross?.includes("TRIGGERED")) n.hints.push("trigger in reach");
    if ((n.runner ?? 0) >= HINT.BIG_RUNNER) n.hints.push("big runner");
  }

  for (const n of ready) {
    // The trap this report exists to name: structure flipped, runner large, nobody
    // buying. Seductive on the headline numbers and exactly where a breakout fails.
    if ((n.demand ?? 100) < HINT.THIN_DEMAND) {
      n.hints.push(loadedTickers.has(n.ticker) ? "loaded but no buyers — size small" : "demand thin");
    }
    if (n.alertState === "TRIGGERED") n.hints.push("already moved");
    if (n.catalyst && n.catalyst.daysUntil <= HINT.EVENT_WINDOW) n.hints.push("holds through event");
  }

  return {
    scanDate,
    coiled: focusFirst(coiled),
    ready: focusFirst(ready),
    loaded: focusFirst(loaded),
    // The homework: loaded, on your list, and nobody has found the date yet.
    research: loaded.filter((n) => n.isFocus && !n.catalyst),
  };
}
