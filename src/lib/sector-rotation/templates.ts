/**
 * Historical rotation templates.
 * When a sector enters a new quadrant, queries past similar entries
 * to estimate average duration.
 * SERVER-ONLY: Reads from Supabase sector_snapshots.
 */

import "server-only";

import { fetchQuadrantEntries, fetchSectorHistory } from "@/lib/supabase/query";

export interface RotationTemplate {
  quadrant: string;
  avgWeeksInQuadrant: number;
  entries: number;
  recentExamples: Array<{
    date: string;
    weeksStayed: number;
  }>;
}

/**
 * Find historical rotation templates for a sector entering a quadrant.
 * Looks at past instances of the same sector in the same quadrant.
 */
export async function findRotationTemplates(
  sector: string,
  quadrant: string
): Promise<RotationTemplate | null> {
  const history = await fetchSectorHistory(sector, 52); // 1 year of weekly data
  if (history.length < 4) return null;

  // Find stretches where sector was in this quadrant
  const stretches: { start: string; weeks: number }[] = [];
  let currentStart: string | null = null;
  let currentWeeks = 0;

  // History is newest-first, reverse for chronological
  const chronological = [...history].reverse();

  for (let i = 0; i < chronological.length; i++) {
    const entry = chronological[i];
    if (entry.quadrant === quadrant) {
      if (!currentStart) currentStart = entry.snapshot_date;
      currentWeeks++;
    } else {
      if (currentStart && currentWeeks > 0) {
        stretches.push({ start: currentStart, weeks: currentWeeks });
      }
      currentStart = null;
      currentWeeks = 0;
    }
  }
  // Close last stretch
  if (currentStart && currentWeeks > 0) {
    stretches.push({ start: currentStart, weeks: currentWeeks });
  }

  if (stretches.length === 0) return null;

  const avgWeeks = stretches.reduce((sum, s) => sum + s.weeks, 0) / stretches.length;

  return {
    quadrant,
    avgWeeksInQuadrant: Math.round(avgWeeks * 10) / 10,
    entries: stretches.length,
    recentExamples: stretches.slice(-3).map((s) => ({
      date: s.start,
      weeksStayed: s.weeks,
    })),
  };
}
