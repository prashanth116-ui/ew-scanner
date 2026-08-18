"use client";

import { useMemo } from "react";
import { SlidersHorizontal, X } from "lucide-react";

/**
 * Threshold dropdowns for scanner component scores.
 *
 * Thresholds are expressed as PERCENTILES OF THE CURRENTLY LOADED ROWS, not as fixed
 * numbers. A raw cutoff like "SE >= 45" means nothing without knowing the distribution, and
 * the distributions shift whenever the scoring changes — which they have, repeatedly. "Top
 * 25%" stays meaningful across recalibrations, and the resolved value is shown in the option
 * label so the absolute number is still visible.
 *
 * Shared by the Transition and Inflection daily pages so the two behave identically.
 */

export interface ComponentField {
  /** Row property holding the 0-100 component score. */
  key: string;
  /** Column header shown on the table, e.g. "SE". */
  label: string;
  /** What the component measures, shown on hover. */
  title: string;
}

/** Active minimum per field. Absent or 0 means no filter. */
export type ComponentFilters = Record<string, number>;

const TIERS = [
  { label: "Top 50%", q: 0.50 },
  { label: "Top 25%", q: 0.75 },
  { label: "Top 10%", q: 0.90 },
] as const;

/** Fixed cutoffs, for when you want a specific number rather than a relative rank.
 *  Percentiles adapt to the day and survive recalibration; fixed values are exact and
 *  comparable across days. Both are useful, so both are offered. */
const FIXED = [30, 35, 40, 45, 50, 55, 60, 65, 70] as const;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[i];
}

export function ComponentFilterBar<T>({
  rows,
  fields,
  value,
  onChange,
}: {
  /** Unfiltered rows for the day — percentiles are computed from these, so the options
   *  do not move as the user narrows the table. */
  rows: T[];
  fields: ComponentField[];
  value: ComponentFilters;
  onChange: (next: ComponentFilters) => void;
}) {
  const options = useMemo(() => {
    const out: Record<string, { label: string; min: number }[]> = {};
    for (const f of fields) {
      const vals = rows
        .map((r) => Number((r as Record<string, unknown>)[f.key]))
        .filter((v) => Number.isFinite(v))
        .sort((a, b) => a - b);
      out[f.key] = TIERS.map((t) => ({
        label: `${t.label} (\u2265${quantile(vals, t.q)})`,
        min: quantile(vals, t.q),
      }));
    }
    return out;
  }, [rows, fields]);

  const activeCount = fields.filter((f) => (value[f.key] ?? 0) > 0).length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <SlidersHorizontal className="h-3 w-3 text-[#555]" />
      {fields.map((f) => {
        const active = (value[f.key] ?? 0) > 0;
        return (
          <label key={f.key} className="flex items-center gap-1" title={f.title}>
            <span className={`text-[10px] font-medium ${active ? "text-white" : "text-[#666]"}`}>
              {f.label}
            </span>
            <select
              aria-label={`${f.title} minimum`}
              value={value[f.key] ?? 0}
              onChange={(e) => onChange({ ...value, [f.key]: Number(e.target.value) })}
              className={`rounded border bg-[#111] px-1.5 py-1 text-[10px] transition-colors focus:outline-none focus:ring-1 focus:ring-white/30 ${
                active
                  ? "border-white/20 text-white"
                  : "border-[#2a2a2a] text-[#666] hover:text-white"
              }`}
            >
              <option value={0}>Any</option>
              <optgroup label="Relative to today">
                {(options[f.key] ?? []).map((o) => (
                  <option key={o.label} value={o.min}>{o.label}</option>
                ))}
              </optgroup>
              <optgroup label="Fixed">
                {FIXED.map((v) => (
                  <option key={v} value={v}>{`≥ ${v}`}</option>
                ))}
              </optgroup>
            </select>
          </label>
        );
      })}
      {activeCount > 0 && (
        <button
          onClick={() => onChange({})}
          title="Remove all component filters and show every row"
          className="flex items-center gap-0.5 rounded border border-amber-500/40 px-1.5 py-1 text-[10px] text-amber-400 transition-colors hover:border-amber-400 hover:text-amber-300"
        >
          <X className="h-2.5 w-2.5" />
          Clear {activeCount} filter{activeCount > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
