import type { EmaTimeframe, MultiTFM2Result } from "./types";
import { ALL_EMA_TIMEFRAMES } from "./types";

export type TFFilterValue = "any" | "0" | "1" | "2" | "lte1" | "gte1";
export type TrendFilterValue = "any" | "strong" | "moderate" | "weak" | "bearish" | "gte_moderate" | "gte_weak";

export const TF_FILTER_OPTIONS: { value: TFFilterValue; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "0", label: "=0" },
  { value: "1", label: "=1" },
  { value: "2", label: "=2" },
  { value: "lte1", label: "≤1" },
  { value: "gte1", label: "≥1" },
];

export const TREND_FILTER_OPTIONS: { value: TrendFilterValue; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "strong", label: "Strong" },
  { value: "moderate", label: "Mod" },
  { value: "weak", label: "Weak" },
  { value: "bearish", label: "Bear" },
  { value: "gte_moderate", label: "≥Mod" },
  { value: "gte_weak", label: "≥Weak" },
];

export const INIT_TF_FILTERS: Record<EmaTimeframe, TFFilterValue> = {
  "15m": "any", "1h": "any", "4h": "any", "12h": "any", "1d": "any", "1wk": "any", "1mo": "any",
};

export const INIT_TREND_FILTERS: Record<EmaTimeframe, TrendFilterValue> = {
  "15m": "any", "1h": "any", "4h": "any", "12h": "any", "1d": "any", "1wk": "any", "1mo": "any",
};

export interface TFFilterPreset {
  id: string;
  label: string;
  description: string;
  filters: Record<EmaTimeframe, TFFilterValue>;
  trendFilters?: Record<EmaTimeframe, TrendFilterValue>;
}

export const TF_FILTER_PRESETS: TFFilterPreset[] = [
  {
    id: "early_mover",
    label: "Early Mover",
    description: "15m momentum firing, higher TFs haven't caught up",
    filters: {
      "15m": "2", "1h": "any", "4h": "lte1", "12h": "lte1", "1d": "lte1", "1wk": "lte1", "1mo": "lte1",
    },
  },
  {
    id: "confirmed",
    label: "Confirmed",
    description: "15m + 1h both showing momentum, higher TFs still lagging",
    filters: {
      "15m": "2", "1h": "gte1", "4h": "lte1", "12h": "lte1", "1d": "lte1", "1wk": "lte1", "1mo": "lte1",
    },
  },
  {
    id: "stealth",
    label: "Stealth",
    description: "15m momentum firing, all higher TFs still at zero — earliest possible signal",
    filters: {
      "15m": "2", "1h": "any", "4h": "0", "12h": "0", "1d": "0", "1wk": "0", "1mo": "0",
    },
  },
  {
    id: "cascade",
    label: "Cascade",
    description: "Fresh crosses on both 15m and 1h, higher TFs haven't caught up yet",
    filters: {
      "15m": "2", "1h": "2", "4h": "lte1", "12h": "lte1", "1d": "lte1", "1wk": "lte1", "1mo": "lte1",
    },
  },
];

const TREND_RANK: Record<string, number> = { bearish: 0, weak: 1, moderate: 2, strong: 3 };

export function matchesTFFilter(score: number | undefined | null, filter: TFFilterValue): boolean {
  if (filter === "any") return true;
  if (score == null) return false;
  switch (filter) {
    case "0": return score === 0;
    case "1": return score === 1;
    case "2": return score === 2;
    case "lte1": return score <= 1;
    case "gte1": return score >= 1;
  }
}

export function matchesTrendFilter(trend: string | null | undefined, filter: TrendFilterValue): boolean {
  if (filter === "any") return true;
  if (trend == null) return false;
  const rank = TREND_RANK[trend];
  if (rank === undefined) return false;
  switch (filter) {
    case "strong": return trend === "strong";
    case "moderate": return trend === "moderate";
    case "weak": return trend === "weak";
    case "bearish": return trend === "bearish";
    case "gte_moderate": return rank >= 2;
    case "gte_weak": return rank >= 1;
  }
}

/** Check if a row passes all active timeframe filters (score + trend) */
export function rowPassesTFFilters(
  row: MultiTFM2Result,
  filters: Record<EmaTimeframe, TFFilterValue>,
  trendFilters?: Record<EmaTimeframe, TrendFilterValue>,
): boolean {
  return ALL_EMA_TIMEFRAMES.every((tf) => {
    const scoreFilter = filters[tf];
    const trendFilter = trendFilters?.[tf] ?? "any";
    if (scoreFilter === "any" && trendFilter === "any") return true;
    const tfr = row.timeframes[tf];
    if (scoreFilter !== "any" && !matchesTFFilter(tfr?.scoreM2 ?? null, scoreFilter)) return false;
    if (trendFilter !== "any" && !matchesTrendFilter(tfr?.trendStrength ?? null, trendFilter)) return false;
    return true;
  });
}
