/** Leadership Health Score — measures market leadership breadth and risk appetite. */

import type { SectorRotationScore, RRGQuadrant } from "./types";
import { LEADERSHIP } from "./config";

export interface LeadershipHealth {
  score: number;           // 0-100
  label: string;           // "Broad & Healthy" | "Healthy" | "Narrowing" | "Narrow" | "Deteriorating"
  broadening: boolean;     // IWM improving relative to MAGS
  specRiskOn: boolean;     // ARKK in LEADING/IMPROVING
  megaCapDominant: boolean; // MAGS >> IWM spread
  summary: string;         // 1-line interpretation
  bullets: string[];       // 3-5 reason bullets
}

// ── Helpers ──

function findByETF(scores: SectorRotationScore[], etf: string): SectorRotationScore | undefined {
  return scores.find((s) => s.etf === etf);
}

function quadrantPoints(q: RRGQuadrant, max: number): number {
  switch (q) {
    case "LEADING": return max;
    case "IMPROVING": return Math.round(max * 0.67);
    case "WEAKENING": return Math.round(max * 0.33);
    case "LAGGING": return 0;
  }
}

function isStrong(q: RRGQuadrant): boolean {
  return q === "LEADING" || q === "IMPROVING";
}

// ── Main ──

export function computeLeadershipHealth(
  leadershipBaskets: SectorRotationScore[],
  crossAsset: SectorRotationScore[],
  gicsSectors: SectorRotationScore[],
  subSectors?: SectorRotationScore[],
): LeadershipHealth | null {
  if (leadershipBaskets.length < 2) return null;

  const mags = findByETF(leadershipBaskets, "MAGS");
  const qqq = findByETF(leadershipBaskets, "QQQ");
  const iwm = findByETF(leadershipBaskets, "IWM");
  const arkk = findByETF(leadershipBaskets, "ARKK");
  const hyg = findByETF(crossAsset, "HYG");
  // SMH and IGV are sub_sector category — only search subSectors
  const smh = findByETF(subSectors ?? [], "SMH");
  const igv = findByETF(subSectors ?? [], "IGV");

  let score = 0;

  // MAGS quadrant (0-15)
  if (mags) score += quadrantPoints(mags.quadrant, 15);

  // QQQ quadrant (0-15)
  if (qqq) score += quadrantPoints(qqq.quadrant, 15);

  // IWM quadrant (0-15)
  if (iwm) score += quadrantPoints(iwm.quadrant, 15);

  // ARKK quadrant (0-10)
  if (arkk) score += quadrantPoints(arkk.quadrant, 10);

  // Breadth spread (0-15): how close IWM is to MAGS
  if (iwm && mags) {
    const spread = Math.abs(iwm.compositeScore - mags.compositeScore);
    if (spread < 10) score += 15;
    else if (spread < 20) score += 10;
    else if (spread < 30) score += 5;
  }
  // If one is missing, award 0 — don't inflate score for missing data

  // SMH confirming (0-10)
  if (smh && isStrong(smh.quadrant)) score += 10;

  // IGV confirming (0-5)
  if (igv && isStrong(igv.quadrant)) score += 5;

  // HYG credit (0-10)
  if (hyg) score += quadrantPoints(hyg.quadrant, 10);

  // Acceleration consensus (0-5)
  const baskets = [mags, qqq, iwm, arkk].filter(Boolean) as SectorRotationScore[];
  const accelPositive = baskets.filter((b) => b.acceleration > 0).length;
  if (accelPositive >= 3) score += 5;
  else if (accelPositive >= 2) score += 3;

  // Clamp
  score = Math.min(100, Math.max(0, score));

  // Label
  let label: string;
  if (score >= LEADERSHIP.BROAD_HEALTHY) label = "Broad & Healthy";
  else if (score >= LEADERSHIP.HEALTHY) label = "Healthy";
  else if (score >= LEADERSHIP.NARROWING) label = "Narrowing";
  else if (score >= LEADERSHIP.NARROW) label = "Narrow";
  else label = "Deteriorating";

  // Key derivations
  const broadening = !!(iwm && mags && iwm.acceleration > 0 && iwm.compositeScore > mags.compositeScore - LEADERSHIP.BROADENING_GAP);
  const specRiskOn = !!(arkk && isStrong(arkk.quadrant));
  const megaCapDominant = !!(mags && iwm && mags.compositeScore - iwm.compositeScore > LEADERSHIP.MEGA_CAP_SPREAD);

  // Build summary
  let summary: string;
  if (label === "Broad & Healthy") {
    summary = "Leadership is broad — mega-caps, growth, and small-caps all participating.";
  } else if (label === "Healthy") {
    summary = broadening
      ? "Leadership healthy with breadth expanding — small-caps catching up."
      : "Leadership healthy but watch breadth — concentration risk emerging.";
  } else if (label === "Narrowing") {
    summary = megaCapDominant
      ? "Leadership narrowing to mega-caps — small-caps lagging, breadth thinning."
      : "Mixed signals — some leadership areas weakening.";
  } else if (label === "Narrow") {
    summary = "Leadership narrow — rally dependent on few names, breadth deteriorating.";
  } else {
    summary = "Leadership deteriorating — broad weakness across market segments.";
  }

  // Build bullets
  const bullets: string[] = [];

  if (mags) {
    bullets.push(`MAGS ${mags.quadrant} (${mags.compositeScore}) — mega-cap ${isStrong(mags.quadrant) ? "leading" : "fading"}`);
  }
  if (iwm) {
    const iwmStatus = broadening ? "broadening" : megaCapDominant ? "lagging mega-caps" : isStrong(iwm.quadrant) ? "participating" : "weak";
    bullets.push(`IWM ${iwm.quadrant} (${iwm.compositeScore}) — ${iwmStatus}`);
  }
  if (arkk) {
    bullets.push(`ARKK ${arkk.quadrant} (${arkk.compositeScore}) — spec risk ${specRiskOn ? "on" : "off"}`);
  }
  if (hyg) {
    bullets.push(`HYG ${hyg.quadrant} — credit ${isStrong(hyg.quadrant) ? "supportive" : "cautious"}`);
  }
  if (mags && iwm) {
    const gap = mags.compositeScore - iwm.compositeScore;
    if (Math.abs(gap) > 10) {
      bullets.push(`Breadth gap: ${gap > 0 ? "MAGS" : "IWM"} leads by ${Math.abs(gap)} pts`);
    }
  }

  return { score, label, broadening, specRiskOn, megaCapDominant, summary, bullets };
}
