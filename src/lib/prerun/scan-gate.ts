/**
 * Non-scorer gate — skip tickers that have never shown up in any scanner.
 *
 * The gate exists to save API calls on dead weight: a ticker absent from every scanner table
 * for 14 days is probably not worth fetching. As originally written it was circular. A
 * ticker with no history was never scanned, so it never scored, so it never gained history.
 * The lockout was permanent and self-sealing, and it compounded with any OTHER bug that
 * emptied a ticker's history.
 *
 * Both failure modes showed up in the same investigation:
 *
 *   SNDK  added to ADDITIONAL_MEMBERS on 2026-08-15 with no prior history. Skipped by all
 *         seven crons every night while it ran +39.7% in two weeks, with the engines
 *         rating it READY from 08-13.
 *   MU    history was empty because a separate bug (null market cap treated as zero)
 *         rejected it at the quality gate. Fixing that bug was not enough: the non-scorer
 *         gate kept it locked out afterwards, because it had no history to prove it
 *         deserved a scan.
 *
 * So the fix cannot be a list of exemptions — MU was not on the list, and the next victim
 * will not be either. The lockout has to be non-permanent. A ticker with no history is now
 * re-tested on a rotating schedule rather than skipped forever: it gets a scan at least once
 * every PROBATION_CYCLE days, and the moment it scores once it has history and is scanned
 * every day thereafter. Dead weight still costs only one fetch in three; anything real
 * escapes within three days and stays out.
 *
 * SERVER-ONLY.
 */

import "server-only";

import { ADDITIONAL_MEMBERS } from "@/data/index-tiers";

/** A no-history ticker gets one scan every this many days. */
export const PROBATION_CYCLE = 3;

/** Stable hash so a given ticker always lands on the same day of the cycle. */
function tickerSlot(ticker: string): number {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) h = (h * 31 + ticker.charCodeAt(i)) | 0;
  return Math.abs(h) % PROBATION_CYCLE;
}

/** Which day of the cycle today is. */
function todaySlot(today: Date): number {
  const days = Math.floor(today.getTime() / 86_400_000);
  return days % PROBATION_CYCLE;
}

/**
 * Should this ticker be skipped before fetching?
 *
 * @param hasHistory    whether the scored-ticker set is large enough to trust at all
 * @param scoredTickers tickers seen in any scanner table during the retention window
 * @param today         injectable for tests
 */
export function skipAsNonScorer(
  ticker: string,
  hasHistory: boolean,
  scoredTickers: Set<string>,
  today: Date = new Date(),
): boolean {
  if (!hasHistory) return false;                     // set too small to trust
  if (scoredTickers.has(ticker)) return false;       // has history — always scan
  if (ADDITIONAL_MEMBERS.has(ticker)) return false;  // hand-curated — never skip
  return tickerSlot(ticker) !== todaySlot(today);    // no history — scan once per cycle
}
