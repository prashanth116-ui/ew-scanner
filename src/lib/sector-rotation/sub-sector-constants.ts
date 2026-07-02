/** Sub-sector → parent GICS mapping, divergence context, and divergence scoring. */

import type { SectorRotationScore, RRGQuadrant } from "./types";

export const SUB_SECTOR_PARENT: Record<string, string> = {
  KRE: "XLF",   // Regional Banks → Financials
  XHB: "XLY",   // Homebuilders → Consumer Discretionary
  IYT: "XLI",   // Transports → Industrials
  XRT: "XLY",   // Retail → Consumer Discretionary
  ITA: "XLI",   // Aerospace & Defense → Industrials
  ARKX: "XLI",  // Space & Defense Innovation → Industrials
  UFO: "XLI",   // Space → Industrials
  AIQ: "XLK",   // AI & Robotics → Technology
};

/** Short-form divergence context for each sub-sector ETF. */
export const SUB_SECTOR_CONTEXT: Record<string, string> = {
  KRE: "credit conditions tightening/loosening before big banks react",
  XHB: "housing and rate-sensitive spending leading/lagging consumer discretionary",
  XRT: "consumer spending accelerating/decelerating before broad retail moves",
  IYT: "freight and transport demand signaling expansion or contraction",
  ITA: "defense/aerospace spending outpacing/trailing broad industrials",
  ARKX: "space and defense tech innovation gaining/losing momentum vs traditional industrials",
  UFO: "space industry (launch, satellite, orbital) leading/lagging broad industrials",
  AIQ: "AI outperforming/underperforming broad tech",
};

/** Long-form context for sub-sector cards (derived from parent + short context). */
export function subSectorCardContext(etf: string): string | null {
  const parent = SUB_SECTOR_PARENT[etf];
  const ctx = SUB_SECTOR_CONTEXT[etf];
  if (!parent || !ctx) return null;
  return `vs ${parent} \u2014 tells you if ${ctx}`;
}

/** Tooltip text for divergence indicator in tier tables. */
export function subSectorDivergenceTooltip(etf: string): string {
  const parent = SUB_SECTOR_PARENT[etf];
  const ctx = SUB_SECTOR_CONTEXT[etf];
  if (!parent || !ctx) return "Sub-sector diverging from parent";
  return `${etf} vs ${parent} divergence \u2014 ${ctx}`;
}

// ── Sub-sector divergence scoring ──

const QUADRANT_RANK: Record<RRGQuadrant, number> = {
  LEADING: 4,
  IMPROVING: 3,
  WEAKENING: 2,
  LAGGING: 1,
};

export interface SubSectorDivergence {
  subEtf: string;
  subName: string;
  parentEtf: string;
  parentName: string;
  scoreDelta: number;       // sub.compositeScore - parent.compositeScore
  quadrantDelta: number;    // rank difference (positive = sub leading)
  subQuadrant: RRGQuadrant;
  parentQuadrant: RRGQuadrant;
  signal: "leading" | "lagging" | "aligned";
  context: string;
}

/**
 * Compute divergence between each sub-sector and its parent GICS sector.
 * Positive scoreDelta = sub-sector outperforming parent = early rotation signal.
 */
export function computeSubSectorDivergences(
  subSectors: SectorRotationScore[],
  gicsSectors: SectorRotationScore[],
): SubSectorDivergence[] {
  const parentMap = new Map<string, SectorRotationScore>();
  for (const s of gicsSectors) parentMap.set(s.etf, s);

  const divergences: SubSectorDivergence[] = [];

  for (const sub of subSectors) {
    const parentEtf = SUB_SECTOR_PARENT[sub.etf];
    if (!parentEtf) continue;
    const parent = parentMap.get(parentEtf);
    if (!parent) continue;

    const scoreDelta = sub.compositeScore - parent.compositeScore;
    const quadrantDelta = QUADRANT_RANK[sub.quadrant] - QUADRANT_RANK[parent.quadrant];

    let signal: "leading" | "lagging" | "aligned";
    if (quadrantDelta > 0 || (quadrantDelta === 0 && scoreDelta > 10)) {
      signal = "leading";
    } else if (quadrantDelta < 0 || (quadrantDelta === 0 && scoreDelta < -10)) {
      signal = "lagging";
    } else {
      signal = "aligned";
    }

    const ctx = SUB_SECTOR_CONTEXT[sub.etf] ?? "";

    divergences.push({
      subEtf: sub.etf,
      subName: sub.sector,
      parentEtf,
      parentName: parent.sector,
      scoreDelta,
      quadrantDelta,
      subQuadrant: sub.quadrant,
      parentQuadrant: parent.quadrant,
      signal,
      context: ctx,
    });
  }

  // Sort by absolute divergence magnitude (strongest signal first)
  divergences.sort((a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta));

  return divergences;
}
