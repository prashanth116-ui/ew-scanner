/** Sub-sector → parent GICS mapping and divergence context (single source of truth). */

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
