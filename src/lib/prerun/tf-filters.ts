import type { EmaTimeframe, MultiTFM2Result } from "./types";
import { ALL_EMA_TIMEFRAMES } from "./types";

export type TFFilterValue = "any" | "0" | "1" | "2" | "lte1" | "gte1";

export const TF_FILTER_OPTIONS: { value: TFFilterValue; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "0", label: "=0" },
  { value: "1", label: "=1" },
  { value: "2", label: "=2" },
  { value: "lte1", label: "≤1" },
  { value: "gte1", label: "≥1" },
];

export const INIT_TF_FILTERS: Record<EmaTimeframe, TFFilterValue> = {
  "15m": "any", "1h": "any", "4h": "any", "12h": "any", "1d": "any", "1wk": "any", "1mo": "any",
};

export interface TFFilterPreset {
  id: string;
  label: string;
  description: string;
  filters: Record<EmaTimeframe, TFFilterValue>;
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
];

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

/** Check if a row passes all active timeframe filters */
export function rowPassesTFFilters(
  row: MultiTFM2Result,
  filters: Record<EmaTimeframe, TFFilterValue>,
): boolean {
  return ALL_EMA_TIMEFRAMES.every((tf) => {
    const filter = filters[tf];
    if (filter === "any") return true;
    const tfr = row.timeframes[tf];
    return matchesTFFilter(tfr?.scoreM2 ?? null, filter);
  });
}
