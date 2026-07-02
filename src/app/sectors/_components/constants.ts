import type { RRGQuadrant, ConvictionLevel, ExtensionTier } from "@/lib/sector-rotation/types";
import type { TradingAction, SortMode } from "./types";
import { COMPOSITE } from "@/lib/sector-rotation/config";

export const COLLAPSED_KEY = "ew-sectors-collapsed-v1";
/** Actionable tier threshold — sourced from centralized config. */
export const COMPOSITE_TRADE_THRESHOLD = COMPOSITE.ACTIONABLE_THRESHOLD;
export const COMPOSITE_WATCH_THRESHOLD = COMPOSITE.WATCH_THRESHOLD;
export const ALERT_STORAGE_KEY = "ew-sector-alerts-v1";
export const LOADING_PHASES = ["Fetching ETF data", "Fetching stock quotes", "Computing sector scores", "Building correlation matrix"] as const;
export const LOADING_TIMEOUT_MS = 90_000;
export const LOADING_PHASE_INTERVAL_MS = 8_000;
export const SORT_MODE_OPTIONS: [SortMode, string][] = [
  ["score", "Score"], ["action", "Action"], ["quadrant", "Quadrant"], ["acceleration", "Accel"], ["name", "Name"],
];
export const ACTION_RANK: Record<TradingAction, number> = { TRADE: 0, BUILD: 1, WATCH: 2, TRIM: 3, AVOID: 4 };
export const QUADRANT_RANK: Record<RRGQuadrant, number> = { LEADING: 0, IMPROVING: 1, WEAKENING: 2, LAGGING: 3 };
export const CONVICTION_STYLE: Record<ConvictionLevel, { bg: string; border: string; text: string }> = {
  HIGH: { bg: "bg-green-500/10", border: "border-green-500/40", text: "text-green-400" },
  MEDIUM: { bg: "bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-400" },
  WATCH: { bg: "bg-[#1a1a1a]", border: "border-[#333]", text: "text-[#888]" },
};
export const CATEGORY_STYLE: Record<string, string> = {
  LEADER: "text-green-400",
  CATCH_UP: "text-blue-400",
  TURNAROUND: "text-cyan-400",
  AVOID: "text-red-400",
};
export const CONV_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, WATCH: 2 };
export const CAT_ORDER: Record<string, number> = { LEADER: 0, CATCH_UP: 1, TURNAROUND: 2, AVOID: 3 };
export const PHASE_ORDER: Record<string, number> = { P1_BASING: 0, P2_TURNAROUND: 1, P3_TRENDING: 2, P4_EXHAUSTING: 3 };
export const TIER_ORDER: Record<ExtensionTier, number> = { MODERATE_EXTENSION: 0, HIGH_EXTENSION: 1, EXTREME_EXTENSION: 2 };
export const TIER_STYLE: Record<ExtensionTier, { bg: string; border: string; text: string; label: string }> = {
  MODERATE_EXTENSION: { bg: "bg-green-500/10", border: "border-green-500/40", text: "text-green-400", label: "Moderate Extension" },
  HIGH_EXTENSION: { bg: "bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-400", label: "High Extension" },
  EXTREME_EXTENSION: { bg: "bg-[#1a1a1a]", border: "border-[#333]", text: "text-[#555]", label: "Extreme Extension" },
};
export const VERDICT_RANK: Record<string, number> = { "PRIORITY BUY": 0, KEEP: 1, WATCH: 2, DISCARD: 3, "": 4 };
