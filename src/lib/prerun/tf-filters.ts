import type { EmaTimeframe, MultiTFM2Result } from "./types";
import { ALL_EMA_TIMEFRAMES } from "./types";

export type TFFilterValue = "any" | "0" | "1" | "2" | "lte1" | "gte1";
export type TrendFilterValue = "any" | "strong" | "moderate" | "weak" | "bearish" | "gte_moderate" | "gte_weak";
export type BoolFilterValue = "any" | "yes" | "no";
export type VolFilterValue = "any" | "gt1.5" | "gt2" | "gt3";

export const TF_FILTER_OPTIONS: { value: TFFilterValue; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "0", label: "=0" },
  { value: "1", label: "=1" },
  { value: "2", label: "=2" },
  { value: "lte1", label: "\u22641" },
  { value: "gte1", label: "\u22651" },
];

export const TREND_FILTER_OPTIONS: { value: TrendFilterValue; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "strong", label: "Strong" },
  { value: "moderate", label: "Mod" },
  { value: "weak", label: "Weak" },
  { value: "bearish", label: "Bear" },
  { value: "gte_moderate", label: "\u2265Mod" },
  { value: "gte_weak", label: "\u2265Weak" },
];

export const VOL_FILTER_OPTIONS: { value: VolFilterValue; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "gt1.5", label: ">1.5x" },
  { value: "gt2", label: ">2x" },
  { value: "gt3", label: ">3x" },
];

export const INIT_TF_FILTERS: Record<EmaTimeframe, TFFilterValue> = {
  "15m": "any", "1h": "any", "4h": "any", "12h": "any", "1d": "any", "1wk": "any", "1mo": "any",
};

export const INIT_TREND_FILTERS: Record<EmaTimeframe, TrendFilterValue> = {
  "15m": "any", "1h": "any", "4h": "any", "12h": "any", "1d": "any", "1wk": "any", "1mo": "any",
};

export const INIT_BOOL_FILTERS: Record<EmaTimeframe, BoolFilterValue> = {
  "15m": "any", "1h": "any", "4h": "any", "12h": "any", "1d": "any", "1wk": "any", "1mo": "any",
};

export const INIT_VOL_FILTERS: Record<EmaTimeframe, VolFilterValue> = {
  "15m": "any", "1h": "any", "4h": "any", "12h": "any", "1d": "any", "1wk": "any", "1mo": "any",
};

export interface LeadingFilters {
  vol?: Record<EmaTimeframe, VolFilterValue>;
  conv?: Record<EmaTimeframe, BoolFilterValue>;
  squeeze?: Record<EmaTimeframe, BoolFilterValue>;
}

export interface TFFilterPreset {
  id: string;
  label: string;
  description: string;
  filters: Record<EmaTimeframe, TFFilterValue>;
  trendFilters?: Record<EmaTimeframe, TrendFilterValue>;
  leadingFilters?: LeadingFilters;
}

export const TF_FILTER_PRESETS: TFFilterPreset[] = [
  {
    id: "early_mover",
    label: "Early Mover",
    description: "15m momentum firing, daily only partially turning, weekly/monthly haven't caught up",
    filters: {
      "15m": "2", "1h": "any", "4h": "any", "12h": "any", "1d": "1", "1wk": "lte1", "1mo": "lte1",
    },
  },
  {
    id: "confirmed",
    label: "Confirmed",
    description: "15m + 1h both showing momentum, weekly/monthly still lagging",
    filters: {
      "15m": "2", "1h": "gte1", "4h": "any", "12h": "any", "1d": "any", "1wk": "lte1", "1mo": "lte1",
    },
  },
  {
    id: "stealth",
    label: "Stealth",
    description: "15m momentum firing, weekly + monthly still at zero",
    filters: {
      "15m": "2", "1h": "any", "4h": "any", "12h": "any", "1d": "any", "1wk": "0", "1mo": "0",
    },
  },
  {
    id: "cascade",
    label: "Cascade",
    description: "Fresh crosses on 15m + 1h (rare \u2014 both must cross within hours), weekly/monthly lagging",
    filters: {
      "15m": "2", "1h": "2", "4h": "any", "12h": "any", "1d": "any", "1wk": "lte1", "1mo": "lte1",
    },
  },
  {
    id: "pre_cross",
    label: "Pre-Cross",
    description: "15m converging + vol >1.5x, not yet crossed \u2014 setup forming before EMA cross (scan-time sensitive)",
    filters: {
      "15m": "lte1", "1h": "any", "4h": "any", "12h": "any", "1d": "any", "1wk": "any", "1mo": "any",
    },
    leadingFilters: {
      conv: { "15m": "yes", "1h": "any", "4h": "any", "12h": "any", "1d": "any", "1wk": "any", "1mo": "any" },
      vol: { "15m": "gt1.5", "1h": "any", "4h": "any", "12h": "any", "1d": "any", "1wk": "any", "1mo": "any" },
    },
  },
  {
    id: "coiled",
    label: "Coiled",
    description: "1h squeezed + converging \u2014 energy building before breakout",
    filters: {
      "15m": "any", "1h": "any", "4h": "any", "12h": "any", "1d": "any", "1wk": "any", "1mo": "any",
    },
    leadingFilters: {
      squeeze: { "15m": "any", "1h": "yes", "4h": "any", "12h": "any", "1d": "any", "1wk": "any", "1mo": "any" },
      conv: { "15m": "any", "1h": "yes", "4h": "any", "12h": "any", "1d": "any", "1wk": "any", "1mo": "any" },
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

export function matchesBoolFilter(value: boolean | null | undefined, filter: BoolFilterValue): boolean {
  if (filter === "any") return true;
  if (value == null) return false;
  return filter === "yes" ? value === true : value === false;
}

export function matchesVolFilter(ratio: number | null | undefined, filter: VolFilterValue): boolean {
  if (filter === "any") return true;
  if (ratio == null) return false;
  switch (filter) {
    case "gt1.5": return ratio > 1.5;
    case "gt2": return ratio > 2;
    case "gt3": return ratio > 3;
  }
}

/** Check if a row passes all active timeframe filters (score + trend + leading) */
export function rowPassesTFFilters(
  row: MultiTFM2Result,
  filters: Record<EmaTimeframe, TFFilterValue>,
  trendFilters?: Record<EmaTimeframe, TrendFilterValue>,
  leadingFilters?: LeadingFilters,
): boolean {
  return ALL_EMA_TIMEFRAMES.every((tf) => {
    const scoreFilter = filters[tf];
    const trendFilter = trendFilters?.[tf] ?? "any";
    const volFilter = leadingFilters?.vol?.[tf] ?? "any";
    const convFilter = leadingFilters?.conv?.[tf] ?? "any";
    const squeezeFilter = leadingFilters?.squeeze?.[tf] ?? "any";

    if (scoreFilter === "any" && trendFilter === "any" &&
        volFilter === "any" && convFilter === "any" && squeezeFilter === "any") return true;

    const tfr = row.timeframes[tf];
    if (scoreFilter !== "any" && !matchesTFFilter(tfr?.scoreM2 ?? null, scoreFilter)) return false;
    if (trendFilter !== "any" && !matchesTrendFilter(tfr?.trendStrength ?? null, trendFilter)) return false;
    if (volFilter !== "any" && !matchesVolFilter(tfr?.volumeRatio ?? null, volFilter)) return false;
    if (convFilter !== "any" && !matchesBoolFilter(tfr?.converging ?? null, convFilter)) return false;
    if (squeezeFilter !== "any" && !matchesBoolFilter(tfr?.squeezed ?? null, squeezeFilter)) return false;
    return true;
  });
}
