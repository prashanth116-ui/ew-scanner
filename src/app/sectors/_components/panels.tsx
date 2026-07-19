"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { SectorRotationScore, RRGQuadrant } from "@/lib/sector-rotation/types";
import { compositeColor, compositeTextColor } from "@/lib/color-utils";
import { subSectorCardContext } from "@/lib/sector-rotation/sub-sector-constants";
import { CollapsiblePanel } from "./shared";
import { quadrantColor } from "./helpers";

// ── Correlation Matrix ──

export function CorrelationMatrix({ correlationMatrix, sectors, collapsed, onToggle }: { correlationMatrix?: Record<string, number>; sectors: SectorRotationScore[]; collapsed?: boolean; onToggle?: (id: string) => void }) {
  if (!correlationMatrix || Object.keys(correlationMatrix).length === 0) return null;
  const matrix = correlationMatrix;
  const etfs = sectors.map((s) => s.etf);

  function getCorr(a: string, b: string): number | null {
    if (a === b) return 1;
    return matrix[`${a}:${b}`] ?? matrix[`${b}:${a}`] ?? null;
  }

  function corrColor(c: number | null): string {
    if (c === null) return "bg-[#1a1a1a]";
    if (c >= 0.8) return "bg-green-500/40";
    if (c >= 0.5) return "bg-green-500/20";
    if (c >= 0.2) return "bg-green-500/10";
    if (c >= -0.2) return "bg-[#1a1a1a]";
    if (c >= -0.5) return "bg-red-500/10";
    if (c >= -0.8) return "bg-red-500/20";
    return "bg-red-500/40";
  }

  return (
    <CollapsiblePanel id="correlation" title="Sector Correlation (20d Returns)" collapsed={collapsed ?? false} onToggle={onToggle ?? (() => {})}>
      <div className="overflow-x-auto">
        <table className="text-[9px]">
          <thead>
            <tr>
              <th className="px-1 py-1" />
              {etfs.map((e) => <th key={e} className="px-1 py-1 text-[#888] font-normal text-center" style={{ writingMode: "vertical-rl" }}>{e}</th>)}
            </tr>
          </thead>
          <tbody>
            {etfs.map((row) => (
              <tr key={row}>
                <td className="px-1 py-0.5 text-[#888] font-medium whitespace-nowrap">{row}</td>
                {etfs.map((col) => {
                  const c = getCorr(row, col);
                  return (
                    <td key={col} className={`px-1 py-0.5 text-center ${corrColor(c)}`} title={`${row} vs ${col}: ${c?.toFixed(2) ?? "N/A"}`}>
                      <span className={c !== null && Math.abs(c) >= 0.8 ? "font-semibold text-white" : "text-[#888]"}>
                        {c !== null ? c.toFixed(1) : ""}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-[#555]">High correlation ({"\u2265"}0.8) = sectors move together. Low/negative = diversification opportunity.</p>
    </CollapsiblePanel>
  );
}

// ── Sector Comparison ──

const COMPARE_ALWAYS_INCLUDE = ["SMH", "XLK", "IGV"];
const COMPARE_MAX = 8;

type MetricCategory = "leading" | "current" | "lagging";

interface MetricDef {
  label: string;
  key: string;
  category: MetricCategory;
  format: (s: SectorRotationScore) => string;
  color?: (s: SectorRotationScore) => string;
  isBool?: boolean;
  boolValue?: (s: SectorRotationScore) => boolean;
}

const METRIC_GROUPS: MetricDef[] = [
  // ── Leading Indicators ──
  { label: "Stealth Accum", key: "stealthAccumulation", category: "leading", isBool: true, boolValue: (s) => s.stealthAccumulation, format: (s) => s.stealthAccumulation ? "Yes" : "No" },
  { label: "Flow-Price Div", key: "flowPriceDivergence", category: "leading", isBool: true, boolValue: (s) => s.flowPriceDivergence, format: (s) => s.flowPriceDivergence ? "Yes" : "No" },
  { label: "Breadth Div", key: "breadthDivergence", category: "leading", isBool: true, boolValue: (s) => s.breadthDivergence, format: (s) => s.breadthDivergence ? "Yes" : "No" },
  { label: "Accel Inflection", key: "accelerationInflection", category: "leading", isBool: true, boolValue: (s) => s.accelerationInflection, format: (s) => s.accelerationInflection ? "Yes" : "No" },
  { label: "Acceleration", key: "acceleration", category: "leading", format: (s) => `${s.acceleration > 0 ? "+" : ""}${s.acceleration.toFixed(2)}`, color: (s) => s.acceleration > 0 ? "text-green-400" : "text-red-400" },
  { label: "RS-Momentum", key: "rsMomentum", category: "leading", format: (s) => s.rsMomentum.toFixed(2) },
  // ── Current Indicators ──
  { label: "Composite", key: "compositeScore", category: "current", format: (s) => `${s.compositeScore}`, color: (s) => compositeTextColor(s.compositeScore) },
  { label: "Quadrant", key: "quadrant", category: "current", format: (s) => s.quadrant },
  { label: "Mansfield RS", key: "mansfieldRS", category: "current", format: (s) => `${s.mansfieldRS > 0 ? "+" : ""}${s.mansfieldRS.toFixed(2)}`, color: (s) => s.mansfieldRS > 0 ? "text-green-400" : "text-red-400" },
  { label: "CMF (20d)", key: "cmf20", category: "current", format: (s) => `${s.cmf20 > 0 ? "+" : ""}${s.cmf20.toFixed(3)}`, color: (s) => s.cmf20 > 0 ? "text-green-400" : "text-red-400" },
  { label: "Breadth %", key: "breadthPct", category: "current", format: (s) => s.breadthPct !== null ? `${s.breadthPct}%` : "N/A" },
  { label: "OBV Trend", key: "obvTrend", category: "current", format: (s) => s.obvTrend === 1 ? "Accum" : s.obvTrend === -1 ? "Distrib" : "Flat", color: (s) => s.obvTrend === 1 ? "text-green-400" : s.obvTrend === -1 ? "text-red-400" : "text-[#888]" },
  { label: "RS-Ratio", key: "rsRatio", category: "current", format: (s) => s.rsRatio.toFixed(2) },
  { label: "Momentum", key: "momentumComposite", category: "current", format: (s) => `${s.momentumComposite.toFixed(1)}` },
  // ── Lagging Indicators ──
  { label: "Rotation Velocity", key: "rotationVelocity", category: "lagging", format: (s) => s.rotationVelocity.toFixed(2) },
  { label: "Smart Money", key: "smartMoneyScore", category: "lagging", format: (s) => `${s.smartMoneyScore}`, color: (s) => compositeTextColor(s.smartMoneyScore) },
  { label: "Trend", key: "trend", category: "lagging", format: (s) => s.trendArrow, color: (s) => s.trend === "UP" ? "text-green-400" : s.trend === "DOWN" ? "text-red-400" : "text-[#888]" },
];

const DIVERGENCE_KEYS = new Set(["stealthAccumulation", "flowPriceDivergence", "breadthDivergence", "accelerationInflection"]);
const ALL_QUADRANTS: RRGQuadrant[] = ["LEADING", "IMPROVING", "WEAKENING", "LAGGING"];
const ALL_CATEGORIES: MetricCategory[] = ["leading", "current", "lagging"];
const CATEGORY_LABELS: Record<MetricCategory, string> = { leading: "Leading", current: "Current", lagging: "Lagging" };

const QUADRANT_PILL_COLORS: Record<RRGQuadrant, { active: string; text: string }> = {
  LEADING: { active: "bg-green-500/20 text-green-400 border-green-500/30", text: "text-green-400" },
  IMPROVING: { active: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", text: "text-cyan-400" },
  WEAKENING: { active: "bg-amber-500/20 text-amber-400 border-amber-500/30", text: "text-amber-400" },
  LAGGING: { active: "bg-red-500/20 text-red-400 border-red-500/30", text: "text-red-400" },
};

export function SectorComparison({ sectors }: { sectors: SectorRotationScore[] }) {
  const defaults = useMemo(() => {
    const fromQuadrant = sectors
      .filter((s) => s.quadrant === "LEADING" || s.quadrant === "IMPROVING")
      .map((s) => s.etf);
    const combined = new Set([...fromQuadrant, ...COMPARE_ALWAYS_INCLUDE.filter((etf) => sectors.some((s) => s.etf === etf))]);
    return [...combined].slice(0, COMPARE_MAX);
  }, [sectors]);

  const [selected, setSelected] = useState<string[]>([]);
  const [quadrantFilter, setQuadrantFilter] = useState<Set<RRGQuadrant>>(() => new Set(ALL_QUADRANTS));
  const [categoryFilter, setCategoryFilter] = useState<Set<MetricCategory>>(() => new Set(ALL_CATEGORIES));
  const [divergenceOnly, setDivergenceOnly] = useState(false);

  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current && defaults.length > 0) {
      initialized.current = true;
      setSelected(defaults);
    }
  }, [defaults]);

  const toggleSector = (etf: string) => {
    setSelected((prev) => prev.includes(etf) ? prev.filter((s) => s !== etf) : prev.length < COMPARE_MAX ? [...prev, etf] : prev);
  };

  const toggleQuadrant = (q: RRGQuadrant) => {
    setQuadrantFilter((prev) => {
      const next = new Set(prev);
      if (next.has(q)) { if (next.size > 1) next.delete(q); } else next.add(q);
      return next;
    });
  };

  const toggleCategory = (c: MetricCategory) => {
    if (divergenceOnly) return;
    setCategoryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) { if (next.size > 1) next.delete(c); } else next.add(c);
      return next;
    });
  };

  const toggleDivergence = () => {
    setDivergenceOnly((prev) => {
      if (!prev) setCategoryFilter(new Set(ALL_CATEGORIES));
      return !prev;
    });
  };

  // Sort sectors by composite score descending (strongest left)
  const compared = sectors
    .filter((s) => selected.includes(s.etf) && quadrantFilter.has(s.quadrant))
    .sort((a, b) => b.compositeScore - a.compositeScore);

  // Filter metrics by category or divergence-only mode
  const visibleMetrics = divergenceOnly
    ? METRIC_GROUPS.filter((m) => DIVERGENCE_KEYS.has(m.key))
    : METRIC_GROUPS.filter((m) => categoryFilter.has(m.category));

  // Group visible metrics by category for section headers
  const metricRows: { type: "header"; label: string; category: MetricCategory }[] | { type: "metric"; metric: MetricDef }[] = [];
  let lastCat: MetricCategory | null = null;
  for (const m of visibleMetrics) {
    if (m.category !== lastCat && !divergenceOnly) {
      (metricRows as { type: string; label?: string; category?: MetricCategory; metric?: MetricDef }[]).push({ type: "header", label: CATEGORY_LABELS[m.category], category: m.category });
      lastCat = m.category;
    }
    (metricRows as { type: string; metric?: MetricDef }[]).push({ type: "metric", metric: m });
  }

  return (
    <div>
      {/* Sector selection pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {sectors.map((s) => (
          <button type="button" key={s.etf} onClick={() => toggleSector(s.etf)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
              selected.includes(s.etf) ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border-[#5ba3e6]/30" : "text-[#666] hover:text-[#a0a0a0] border-transparent"
            }`}>{s.etf}</button>
        ))}
        <span className="text-[10px] text-[#555] self-center ml-2">Select up to {COMPARE_MAX}</span>
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-[11px]">
        {/* Quadrant filter */}
        <div className="flex items-center gap-1">
          <span className="text-[#555] mr-1">Quadrant:</span>
          {ALL_QUADRANTS.map((q) => (
            <button type="button" key={q} onClick={() => toggleQuadrant(q)}
              className={`rounded-full px-2 py-0.5 font-medium border transition-colors ${
                quadrantFilter.has(q) ? QUADRANT_PILL_COLORS[q].active : "text-[#666] hover:text-[#a0a0a0] border-transparent"
              }`}>{q}</button>
          ))}
        </div>
        {/* Category filter */}
        <div className="flex items-center gap-1">
          <span className="text-[#555] mr-1">Metrics:</span>
          {ALL_CATEGORIES.map((c) => (
            <button type="button" key={c} onClick={() => toggleCategory(c)}
              className={`rounded-full px-2 py-0.5 font-medium border transition-colors ${
                divergenceOnly ? "text-[#444] border-transparent cursor-not-allowed" :
                categoryFilter.has(c) ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border-[#5ba3e6]/30" : "text-[#666] hover:text-[#a0a0a0] border-transparent"
              }`}>{CATEGORY_LABELS[c]}</button>
          ))}
        </div>
        {/* Divergence-only toggle */}
        <button type="button" onClick={toggleDivergence}
          className={`rounded-full px-2.5 py-0.5 font-medium border transition-colors ${
            divergenceOnly ? "bg-purple-500/20 text-purple-400 border-purple-500/30" : "text-[#666] hover:text-[#a0a0a0] border-transparent"
          }`}>Divergences Only</button>
      </div>

      {compared.length < 2 && (
        <p className="text-xs text-[#555] py-4 text-center">
          Select 2 or more sectors above to compare scores side-by-side.
        </p>
      )}
      {compared.length >= 2 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2a2a2a]">
                <th className="text-left py-1.5 pr-4 text-[#666]">Metric</th>
                {compared.map((s) => <th key={s.etf} className="text-center py-1.5 px-3 text-white font-semibold">{s.etf}<div className="text-[10px] text-[#666] font-normal">{s.sector}</div></th>)}
              </tr>
            </thead>
            <tbody>
              {metricRows.map((row) => {
                const r = row as { type: string; label?: string; category?: MetricCategory; metric?: MetricDef };
                if (r.type === "header") {
                  return (
                    <tr key={`hdr-${r.category}`} className="border-b border-[#1a1a1a]">
                      <td colSpan={compared.length + 1} className="py-1.5 text-[10px] text-[#555] font-semibold tracking-wider uppercase">── {r.label} ──</td>
                    </tr>
                  );
                }
                const m = r.metric!;
                return (
                  <tr key={m.key} className="border-b border-[#1a1a1a]">
                    <td className="py-1.5 pr-4 text-[#888]">{m.label}</td>
                    {compared.map((s) => (
                      <td key={s.etf} className="py-1.5 px-3 text-center">
                        {m.isBool ? (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            m.boolValue!(s) ? "bg-green-500/20 text-green-400" : "bg-[#1a1a1a] text-[#555]"
                          }`}>{m.format(s)}</span>
                        ) : (
                          <span className={m.color ? m.color(s) : "text-white"}>{m.format(s)}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sub-Sector Leading Indicators Panel ──

export function SubSectorPanel({ scores, collapsed, onToggle }: { scores: SectorRotationScore[]; collapsed?: boolean; onToggle?: (id: string) => void }) {
  if (scores.length === 0) return null;

  return (
    <CollapsiblePanel id="sub-sectors" title="Leading Indicators (Sub-Sectors)" collapsed={collapsed ?? false} onToggle={onToggle ?? (() => {})}>
      <p className="text-[10px] text-[#555] mb-3 px-1">SMH (semis), IGV (software), KRE (credit cycle), XHB (housing), XRT (consumer), IYT (transport), ITA (aerospace &amp; defense), ARKX (space innovation), UFO (space), AIQ (AI &amp; robotics) — early signals before GICS sectors move.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 px-1">
        {scores.map((s) => (
          <div key={s.etf} className="rounded-lg border border-[#2a2a2a] bg-[#111] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-white text-sm">{s.etf}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${quadrantColor(s.quadrant)}`}>
                {s.quadrant}
              </span>
            </div>
            <p className="text-[10px] text-[#888] mb-2">{s.sector}</p>
            {subSectorCardContext(s.etf) && (
              <p className="text-[10px] text-[#888] mt-1">{subSectorCardContext(s.etf)}</p>
            )}
            <div className="grid grid-cols-2 gap-y-1 text-[11px]">
              <span className="text-[#666]">Score</span>
              <span className="text-right text-white font-mono">{s.compositeScore}</span>
              <span className="text-[#666]">Momentum</span>
              <span className="text-right text-white font-mono">{s.momentumPercentile}%</span>
              <span className="text-[#666]">Accel</span>
              <span className={`text-right font-mono ${s.acceleration > 0 ? "text-green-400" : s.acceleration < 0 ? "text-red-400" : "text-[#888]"}`}>
                {s.acceleration > 0 ? "+" : ""}{s.acceleration.toFixed(2)}
              </span>
              <span className="text-[#666]">RS</span>
              <span className="text-right text-white font-mono">{s.mansfieldRS.toFixed(2)}</span>
            </div>
            {s.stealthAccumulation && (
              <div className="mt-2 rounded border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-400">
                Stealth Accumulation
              </div>
            )}
          </div>
        ))}
      </div>
    </CollapsiblePanel>
  );
}

// ── Leadership Baskets Panel ──

export function LeadershipBasketsPanel({ scores, collapsed, onToggle }: { scores: SectorRotationScore[]; collapsed?: boolean; onToggle?: (id: string) => void }) {
  if (scores.length === 0) return null;

  return (
    <CollapsiblePanel id="leadership-baskets" title="Leadership Baskets" collapsed={collapsed ?? false} onToggle={onToggle ?? (() => {})}>
      <p className="text-[10px] text-[#555] mb-3 px-1">MAGS, QQQ, IWM, ARKK — institutional leadership breadth and risk appetite.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 px-1">
        {scores.map((s) => (
          <div key={s.etf} className="rounded-lg border border-[#2a2a2a] bg-[#111] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-white text-sm">{s.etf}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${quadrantColor(s.quadrant)}`}>
                {s.quadrant}
              </span>
            </div>
            <p className="text-[10px] text-[#888] mb-2">{s.sector}</p>
            <div className="grid grid-cols-2 gap-y-1 text-[11px]">
              <span className="text-[#666]">Score</span>
              <span className="text-right text-white font-mono">{s.compositeScore}</span>
              <span className="text-[#666]">Momentum</span>
              <span className="text-right text-white font-mono">{s.momentumPercentile}%</span>
              <span className="text-[#666]">Accel</span>
              <span className={`text-right font-mono ${s.acceleration > 0 ? "text-green-400" : s.acceleration < 0 ? "text-red-400" : "text-[#888]"}`}>
                {s.acceleration > 0 ? "+" : ""}{s.acceleration.toFixed(2)}
              </span>
              <span className="text-[#666]">RS</span>
              <span className="text-right text-white font-mono">{s.mansfieldRS.toFixed(2)}</span>
            </div>
            {s.stealthAccumulation && (
              <div className="mt-2 rounded border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-400">
                Stealth Accumulation
              </div>
            )}
          </div>
        ))}
      </div>
    </CollapsiblePanel>
  );
}

// ── Cross-Asset Money Flow Panel ──

export function CrossAssetPanel({ scores, collapsed, onToggle }: { scores: SectorRotationScore[]; collapsed?: boolean; onToggle?: (id: string) => void }) {
  if (scores.length === 0) return null;

  return (
    <CollapsiblePanel id="cross-asset" title="Cross-Asset Money Flow" collapsed={collapsed ?? false} onToggle={onToggle ?? (() => {})}>
      <p className="text-[10px] text-[#555] mb-3 px-1">GLD, TLT, HYG, EEM, UUP — detect money leaving/entering equities entirely.</p>
      <div className="overflow-x-auto px-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#2a2a2a] text-left text-[#666]">
              <th className="pb-2 pr-4 font-medium">ETF</th>
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium text-right">Score</th>
              <th className="pb-2 pr-4 font-medium">Quadrant</th>
              <th className="pb-2 pr-4 font-medium text-right">Momentum</th>
              <th className="pb-2 pr-4 font-medium text-right">Accel</th>
              <th className="pb-2 pr-4 font-medium text-right">RS vs SPY</th>
              <th className="pb-2 font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => (
              <tr key={s.etf} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]/50">
                <td className="py-2 pr-4 font-mono font-semibold text-[#5ba3e6]">{s.etf}</td>
                <td className="py-2 pr-4 text-[#a0a0a0]">{s.sector}</td>
                <td className="py-2 pr-4 text-right font-mono text-white">{s.compositeScore}</td>
                <td className="py-2 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${quadrantColor(s.quadrant)}`}>
                    {s.quadrant}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right font-mono text-white">{s.momentumPercentile}%</td>
                <td className={`py-2 pr-4 text-right font-mono ${s.acceleration > 0 ? "text-green-400" : s.acceleration < 0 ? "text-red-400" : "text-[#888]"}`}>
                  {s.acceleration > 0 ? "+" : ""}{s.acceleration.toFixed(2)}
                </td>
                <td className={`py-2 pr-4 text-right font-mono ${s.mansfieldRS > 0 ? "text-green-400" : s.mansfieldRS < 0 ? "text-red-400" : "text-[#888]"}`}>
                  {s.mansfieldRS > 0 ? "+" : ""}{s.mansfieldRS.toFixed(2)}
                </td>
                <td className="py-2 text-lg">{s.trendArrow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsiblePanel>
  );
}
