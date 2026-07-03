/**
 * Pre-Runner Radar types.
 * Surfaces turnaround candidates (from rotation tracker) and confirmed leaders
 * (from enrichment pipeline) with extreme RS acceleration in rotating sectors.
 */

import type { RRGQuadrant } from "@/lib/sector-rotation/types";
import type { LifecycleStage } from "@/lib/sector-rotation/rotation-types";

export type PreRunnerType = "TURNAROUND" | "LEADER";

export interface PreRunnerCandidate {
  symbol: string;
  name: string;
  price: number;
  type: PreRunnerType;
  preRunnerScore: number; // 0-100
  rsAcceleration: number;
  rsImproving: boolean;
  rsDelta: number;
  sector: string;
  sectorEtf: string;
  sectorQuadrant: RRGQuadrant;
  sectorComposite: number;
  lifecycle: LifecycleStage | null;
  rotationDaysActive: number | null;
  volumeRatio: number;
  regimeAlignment: "aligned" | "headwind" | "neutral";
  conviction: string;
  performancePct: number | null;
  aboveSma50: boolean;
  volumeConsistency: number | null;
  trendAccel: number | null;
}

export interface PreRunnerResult {
  calculatedAt: string;
  candidates: PreRunnerCandidate[];
  leaderCount: number;
  turnaroundCount: number;
  activeSectors: string[];
  regime: string | null;
}
