/**
 * Non-scorer gate — skip tickers that have never shown up in any scanner.
 *
 * The gate exists to save API calls on dead weight: a ticker absent from every scanner
 * table for 14 days is unlikely to be worth fetching. But as originally written it was
 * circular. A ticker with no history was never scanned, so it never scored, so it never
 * gained history — a permanent lockout that applied hardest to exactly the names most
 * likely to matter: the ones just added to the universe.
 *
 * SNDK was the case that exposed it. Added to ADDITIONAL_MEMBERS on 2026-08-15 with no
 * prior history, it was skipped by all seven crons every night while it ran 39% in two
 * weeks — and the engines, when re-scored directly, had it READY from 08-13.
 *
 * ADDITIONAL_MEMBERS are hand-curated: someone deliberately added them, which is a stronger
 * signal of relevance than an empty history is of irrelevance. They bypass the gate.
 *
 * SERVER-ONLY.
 */

import "server-only";

import { ADDITIONAL_MEMBERS } from "@/data/index-tiers";

/**
 * Should this ticker be skipped before fetching?
 *
 * @param hasHistory   whether the scored-ticker set is large enough to trust at all
 * @param scoredTickers tickers seen in any scanner table during the retention window
 */
export function skipAsNonScorer(
  ticker: string,
  hasHistory: boolean,
  scoredTickers: Set<string>,
): boolean {
  if (!hasHistory) return false;
  if (ADDITIONAL_MEMBERS.has(ticker)) return false; // hand-curated: never locked out
  return !scoredTickers.has(ticker);
}
