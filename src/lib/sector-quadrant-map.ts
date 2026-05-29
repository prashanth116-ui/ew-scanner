/**
 * Shared utility: sector-name → RRG quadrant mapping.
 *
 * Rotation data uses fine-grained sector names (displayName from sector-universe.ts).
 * EW universes use coarse names (e.g. "Technology"). This module provides both
 * fine-grained and coarse-grained lookups.
 */

import { loadSectorRotation } from "@/lib/sector-rotation/storage";
import type { RRGQuadrant } from "@/lib/sector-rotation/types";

// Coarse sector names (EW universes) → fine-grained names (rotation data)
const COARSE_TO_FINE: Record<string, string[]> = {
  Technology: ["Semiconductors", "Software & Cloud"],
  Consumer: ["Consumer Discretionary", "Consumer Staples"],
  Healthcare: ["Health Care", "Biotech"],
  Financials: ["Financials"],
  Energy: ["Energy"],
  Industrials: ["Industrials"],
};

export interface SectorQuadrantMap {
  /** Fine-grained sector → quadrant (direct from rotation data) */
  fine: Record<string, RRGQuadrant>;
  /** Coarse sector → quadrant (best-of sub-sectors) */
  coarse: Record<string, RRGQuadrant>;
  /** All sectors in a given quadrant (fine-grained names) */
  byQuadrant: Record<RRGQuadrant, string[]>;
}

const QUADRANT_PRIORITY: RRGQuadrant[] = ["LEADING", "IMPROVING", "WEAKENING", "LAGGING"];

export function buildSectorQuadrantMap(): SectorQuadrantMap | null {
  const rotation = loadSectorRotation();
  if (!rotation?.sectors?.length) return null;

  const fine: Record<string, RRGQuadrant> = {};
  const byQuadrant: Record<RRGQuadrant, string[]> = {
    LEADING: [],
    IMPROVING: [],
    WEAKENING: [],
    LAGGING: [],
  };

  for (const s of rotation.sectors) {
    fine[s.sector] = s.quadrant;
    byQuadrant[s.quadrant].push(s.sector);
  }

  // Build coarse map: take the best quadrant among sub-sectors
  const coarse: Record<string, RRGQuadrant> = {};
  for (const [coarseName, fineNames] of Object.entries(COARSE_TO_FINE)) {
    const quadrants = fineNames.map((n) => fine[n]).filter(Boolean);
    if (quadrants.length > 0) {
      coarse[coarseName] =
        QUADRANT_PRIORITY.find((q) => quadrants.includes(q)) ?? quadrants[0];
    }
  }

  return { fine, coarse, byQuadrant };
}

export const RRG_QUADRANTS: RRGQuadrant[] = ["LEADING", "IMPROVING", "WEAKENING", "LAGGING"];
