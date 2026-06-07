"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, FileDown, Search, X, ExternalLink, Bell, BellOff, Zap, ArrowUpCircle, Plus, CheckCircle2 } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { type StockPhase, phaseBadge, PHASE_RANK } from "@/lib/phase-utils";
import { usePersistedFilter, clearPersistedFilters } from "@/lib/use-filter-persistence";
import Link from "next/link";
import type {
  SectorRotationResult,
  SectorRotationScore,
  RRGQuadrant,
  EnrichedStock,
  ConvictionLevel,
  StockCategory,
  StockPhase as RotationStockPhase,
  PullbackWatchStock,
  ExtensionTier,
} from "@/lib/sector-rotation/types";

// Backward compat alias
type PullbackTier = ExtensionTier;
import type { RotationTrackerResult, ActiveRotationDetail, RotationPatternStats, LifecycleStage, ConvictionResult } from "@/lib/sector-rotation/rotation-types";
import {
  getHealth,
  computeLifecycleStage,
  computeConviction,
  computeActionSignal,
  isRegimeAligned,
  type ActionSignal,
} from "@/lib/sector-rotation/rotation-helpers";
import type { SectorSnapshot } from "@/lib/sector-rotation/history";
import { compositeColor, compositeTextColor } from "@/lib/color-utils";
import { useDebounce } from "@/lib/use-debounce";

// ── Re-exported types ──

export type TradingAction = "TRADE" | "BUILD" | "WATCH" | "TRIM" | "AVOID";
export type SortMode = "score" | "action" | "quadrant" | "acceleration" | "name";
export type SmaFilter = "all" | "above" | "below";
export type VolFilter = "all" | "above" | "below";
export type VerdictFilter = "all" | "priority" | "keep" | "watch";
export type RsAccelFilter = "all" | "positive" | "negative";
export type PhaseFilter = "all" | "basing" | "turnaround" | "trending" | "exhausting";
export type PicksSortKey = "conviction" | "symbol" | "category" | "phase" | "rsAccel" | "volRatio" | "price" | "pctFrom50ma";
export type PullbackSortKey = "tier" | "symbol" | "sector" | "price" | "pctFrom200ma" | "distanceTo80Pct" | "pctFrom50ma" | "volRatio";

export interface StockInSector {
  ticker: string;
  companyName: string;
  rs20d: number | null;
  rsAccel: number | null;
  sectorRS: number | null;
  pctFromAth: number | null;
  finalScore: number;
  verdict: string;
  price: number | null;
  aboveSma50: boolean | null;
  volumeVsAvg: number | null;
  sectorName: string;
  daysToEarnings: number | null;
  nextEarningsDate: string | null;
  rsImproving: boolean;
  rsDelta: number;
  volumeConsistency: number;
  institutionalPct: number | null;
}

export interface SectorAlert {
  id: string;
  sectorEtf: string;
  condition: "enters_quadrant" | "acceleration_positive" | "cmf_positive";
  value?: string;
  enabled: boolean;
}

// ── Constants ──

export const COLLAPSED_KEY = "ew-sectors-collapsed-v1";
export const COMPOSITE_TRADE_THRESHOLD = 60;
export const COMPOSITE_WATCH_THRESHOLD = 40;
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
export const TIER_ORDER: Record<PullbackTier, number> = { MODERATE_EXTENSION: 0, HIGH_EXTENSION: 1, EXTREME_EXTENSION: 2 };
export const TIER_STYLE: Record<PullbackTier, { bg: string; border: string; text: string; label: string }> = {
  MODERATE_EXTENSION: { bg: "bg-green-500/10", border: "border-green-500/40", text: "text-green-400", label: "Moderate Extension" },
  HIGH_EXTENSION: { bg: "bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-400", label: "High Extension" },
  EXTREME_EXTENSION: { bg: "bg-[#1a1a1a]", border: "border-[#333]", text: "text-[#555]", label: "Extreme Extension" },
};
const VERDICT_RANK: Record<string, number> = { "PRIORITY BUY": 0, KEEP: 1, WATCH: 2, DISCARD: 3, "": 4 };

// ── Collapsible Panel ──

export function useCollapsedPanels(storageKey = COLLAPSED_KEY): [Set<string>, (id: string) => void] {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  return [collapsed, toggle];
}

export function CollapsiblePanel({
  id,
  title,
  collapsed,
  onToggle,
  badge,
  actions,
  children,
  className = "",
}: {
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-[#2a2a2a] bg-[#141414] ${className}`}>
      <button
        onClick={() => onToggle(id)}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronDown className="h-4 w-4 text-[#666]" /> : <ChevronUp className="h-4 w-4 text-[#666]" />}
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {badge}
        </div>
        {actions && <div onClick={(e) => e.stopPropagation()}>{actions}</div>}
      </button>
      {!collapsed && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ── Color helpers ──

export function quadrantColor(q: RRGQuadrant): string {
  switch (q) {
    case "LEADING": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "WEAKENING": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "LAGGING": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "IMPROVING": return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
  }
}

export function quadrantDotColor(q: RRGQuadrant): string {
  switch (q) {
    case "LEADING": return "#4ade80";
    case "WEAKENING": return "#fbbf24";
    case "LAGGING": return "#f87171";
    case "IMPROVING": return "#22d3ee";
  }
}

// ── Trading action helpers ──

export function getTradingAction(s: Pick<SectorRotationScore, "quadrant" | "compositeScore" | "acceleration">): TradingAction {
  if (s.quadrant === "LEADING" && s.compositeScore >= COMPOSITE_TRADE_THRESHOLD && s.acceleration > 0) return "TRADE";
  if (s.quadrant === "IMPROVING" && s.acceleration > 0) return "BUILD";
  if (s.quadrant === "LEADING" && s.compositeScore >= COMPOSITE_TRADE_THRESHOLD) return "TRADE";
  if (s.quadrant === "LEADING") return "WATCH";
  if (s.quadrant === "WEAKENING") return "TRIM";
  if (s.quadrant === "IMPROVING") return "WATCH";
  if (s.quadrant === "LAGGING" && s.acceleration > 0 && s.compositeScore >= COMPOSITE_WATCH_THRESHOLD) return "WATCH";
  return "AVOID";
}

export function actionBadge(action: TradingAction): { label: string; className: string } {
  switch (action) {
    case "TRADE": return { label: "TRADE", className: "bg-green-500/15 text-green-400 border-green-500/30" };
    case "BUILD": return { label: "BUILD", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
    case "WATCH": return { label: "WATCH", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    case "TRIM": return { label: "TRIM", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" };
    case "AVOID": return { label: "AVOID", className: "bg-red-500/15 text-red-400 border-red-500/30" };
  }
}

export function TradingActionBadge({ sector }: { sector: Pick<SectorRotationScore, "quadrant" | "compositeScore" | "acceleration"> }) {
  const badge = actionBadge(getTradingAction(sector));
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>;
}

export function ComparisonDelta({ sector, comparisonMap }: { sector: SectorRotationScore; comparisonMap: Map<string, SectorSnapshot> | null }) {
  const prev = comparisonMap?.get(sector.sector);
  if (!prev) return null;
  const delta = sector.compositeScore - prev.compositeScore;
  const quadChanged = sector.quadrant !== prev.quadrant;
  const curAction = getTradingAction(sector);
  const prevAction = getTradingAction({ ...sector, compositeScore: prev.compositeScore, acceleration: prev.acceleration, quadrant: prev.quadrant });
  const actionChanged = curAction !== prevAction;
  if (delta === 0 && !quadChanged && !actionChanged) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {delta !== 0 && <span className={`text-[10px] font-semibold ${delta > 0 ? "text-green-400" : "text-red-400"}`}>{delta > 0 ? "+" : ""}{delta}</span>}
      {quadChanged && <span className="rounded-full bg-[#1a1a1a] border border-[#333] px-1.5 py-0.5 text-[9px] text-[#888]">was {prev.quadrant}</span>}
      {actionChanged && <span className="rounded-full bg-[#1a1a1a] border border-[#333] px-1.5 py-0.5 text-[9px] text-[#888]">was {prevAction}</span>}
    </div>
  );
}

// ── Stock ranking helpers ──

export function getStockPhase(s: StockInSector): StockPhase {
  const rsAccel = s.rsAccel ?? 0;
  const rs20d = s.rs20d ?? 0;
  if (rsAccel < -2) return "exhausting";
  if (s.aboveSma50 === false && rs20d > 0 && rsAccel > 0 && (s.volumeVsAvg ?? 0) >= 1.2) return "turnaround";
  if (s.aboveSma50 === false && rsAccel > 0 && rs20d <= 0) return "basing";
  if (s.aboveSma50 === true && rsAccel > 0) return "trending";
  return "neutral";
}

export function getEntryQuality(s: StockInSector): number {
  let quality = 0;
  if ((s.rsAccel ?? 0) > 1) quality++;
  if ((s.volumeVsAvg ?? 0) >= 1.5) quality++;
  if (s.rsImproving && s.volumeConsistency >= 3) quality++;
  return quality;
}

export function rsColor(rs: number | null): string {
  if (rs === null) return "text-[#666]";
  if (rs > 5) return "text-green-400";
  if (rs > 0) return "text-green-400/70";
  if (rs > -5) return "text-red-400/70";
  return "text-red-400";
}

export function rsAccelColor(val: number | null): string {
  if (val === null) return "text-[#666]";
  if (val > 2) return "text-green-400";
  if (val > 0) return "text-green-400/70";
  if (val > -2) return "text-red-400/70";
  return "text-red-400";
}

// ── ETF Return Sparkline ──

export function EtfSparkline({ returns }: { returns: number[] | undefined }) {
  if (!returns || returns.length < 3) return null;
  const W = 48;
  const H = 18;
  const pad = 1;
  const min = Math.min(...returns);
  const max = Math.max(...returns);
  const range = max - min || 1;
  const points = returns.map((r, i) => {
    const x = pad + (i / (returns.length - 1)) * (W - 2 * pad);
    const y = H - pad - ((r - min) / range) * (H - 2 * pad);
    return `${x},${y}`;
  }).join(" ");
  const cumReturn = returns.reduce((s, r) => s + r, 0);
  const color = cumReturn >= 0 ? "#4ade80" : "#f87171";
  return (
    <svg width={W} height={H} className="inline-block" aria-label="20d return sparkline">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ── Regime Banner ──

export function RegimeBanner({ regime }: { regime: SectorRotationResult["regime"] }) {
  if (!regime) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#666]">
        <AlertTriangle className="h-4 w-4 text-[#555]" />
        Macro regime data unavailable &mdash; VIX, yield, and DXY signals are not loading
      </div>
    );
  }
  const regimeColor = regime.regime === "RISK_ON" ? "text-green-400" : regime.regime === "RISK_OFF" ? "text-red-400" : regime.regime === "INFLATIONARY" ? "text-amber-400" : "text-[#888]";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <span className="text-xs text-[#888]">Regime</span>
          <div className={`text-sm font-semibold ${regimeColor}`}>{regime.regime.replace("_", " ")}</div>
        </div>
        <div>
          <span className="text-xs text-[#888]">VIX</span>
          <div className={`text-sm font-medium ${regime.vix > 25 ? "text-red-400" : regime.vix < 18 ? "text-green-400" : "text-amber-400"}`}>
            {regime.vix.toFixed(1)}
            <span className="ml-1 text-[10px] text-[#666]">{regime.vixSlope}</span>
          </div>
        </div>
        <div>
          <span className="text-xs text-[#888]">10Y Yield</span>
          <div className="text-sm font-medium text-[#ccc]">{regime.yield10y.toFixed(2)}%</div>
        </div>
        <div>
          <span className="text-xs text-[#888]">USD (DXY)</span>
          <div className="text-sm font-medium text-[#ccc]">
            {regime.dxy.toFixed(1)}
            <span className="ml-1 text-[10px] text-[#666]">{regime.dxyTrend}</span>
          </div>
        </div>
        {regime.favoredSectors.length > 0 && (
          <div>
            <span className="text-xs text-[#888]">Favored</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {regime.favoredSectors.map((s) => (
                <span key={s} className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">{s}</span>
              ))}
            </div>
          </div>
        )}
        {regime.avoidSectors.length > 0 && (
          <div>
            <span className="text-xs text-[#888]">Avoid</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {regime.avoidSectors.map((s) => (
                <span key={s} className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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

export function SectorComparison({ sectors }: { sectors: SectorRotationScore[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSector = (etf: string) => {
    setSelected((prev) => prev.includes(etf) ? prev.filter((s) => s !== etf) : prev.length < 3 ? [...prev, etf] : prev);
  };

  const compared = sectors.filter((s) => selected.includes(s.etf));
  const metrics: { label: string; key: string; format: (s: SectorRotationScore) => string; color?: (s: SectorRotationScore) => string }[] = [
    { label: "Composite", key: "compositeScore", format: (s) => `${s.compositeScore}`, color: (s) => compositeTextColor(s.compositeScore) },
    { label: "Quadrant", key: "quadrant", format: (s) => s.quadrant },
    { label: "Acceleration", key: "acceleration", format: (s) => `${s.acceleration > 0 ? "+" : ""}${s.acceleration.toFixed(2)}`, color: (s) => s.acceleration > 0 ? "text-green-400" : "text-red-400" },
    { label: "Mansfield RS", key: "mansfieldRS", format: (s) => `${s.mansfieldRS > 0 ? "+" : ""}${s.mansfieldRS.toFixed(2)}`, color: (s) => s.mansfieldRS > 0 ? "text-green-400" : "text-red-400" },
    { label: "CMF (20d)", key: "cmf20", format: (s) => `${s.cmf20 > 0 ? "+" : ""}${s.cmf20.toFixed(3)}`, color: (s) => s.cmf20 > 0 ? "text-green-400" : "text-red-400" },
    { label: "Breadth %", key: "breadthPct", format: (s) => s.breadthPct !== null ? `${s.breadthPct}%` : "N/A" },
    { label: "OBV Trend", key: "obvTrend", format: (s) => s.obvTrend === 1 ? "Accum" : s.obvTrend === -1 ? "Distrib" : "Flat" },
    { label: "RS-Ratio", key: "rsRatio", format: (s) => s.rsRatio.toFixed(2) },
    { label: "RS-Momentum", key: "rsMomentum", format: (s) => s.rsMomentum.toFixed(2) },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {sectors.map((s) => (
          <button key={s.etf} onClick={() => toggleSector(s.etf)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
              selected.includes(s.etf) ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border-[#5ba3e6]/30" : "text-[#666] hover:text-[#a0a0a0] border-transparent"
            }`}>{s.etf}</button>
        ))}
        <span className="text-[10px] text-[#555] self-center ml-2">Select up to 3</span>
      </div>
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
              {metrics.map((m) => (
                <tr key={m.key} className="border-b border-[#1a1a1a]">
                  <td className="py-1.5 pr-4 text-[#888]">{m.label}</td>
                  {compared.map((s) => (
                    <td key={s.etf} className={`py-1.5 px-3 text-center ${m.color ? m.color(s) : "text-white"}`}>{m.format(s)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── RRG Chart ──

export function RRGChart({ sectors, subSectorScores = [], crossAssetScores = [] }: { sectors: SectorRotationScore[]; subSectorScores?: SectorRotationScore[]; crossAssetScores?: SectorRotationScore[] }) {
  const W = 500;
  const H = 400;
  const PAD = 50;

  const allScores = [...sectors, ...subSectorScores, ...crossAssetScores];
  const allRatios: number[] = [];
  const allMoms: number[] = [];
  for (const s of allScores) {
    if (isFinite(s.rsRatio)) allRatios.push(s.rsRatio);
    if (isFinite(s.rsMomentum)) allMoms.push(s.rsMomentum);
    for (const pt of s.rrgTrail ?? []) {
      if (isFinite(pt.rsRatio)) allRatios.push(pt.rsRatio);
      if (isFinite(pt.rsMomentum)) allMoms.push(pt.rsMomentum);
    }
  }
  if (allRatios.length === 0) return <div className="text-center py-8 text-sm text-[#555]">No RRG data available</div>;

  const rMin = Math.min(99, ...allRatios) - 0.5;
  const rMax = Math.max(101, ...allRatios) + 0.5;
  const mMin = Math.min(99, ...allMoms) - 0.5;
  const mMax = Math.max(101, ...allMoms) + 0.5;

  const scaleX = (v: number) => PAD + ((v - rMin) / (rMax - rMin)) * (W - 2 * PAD);
  const scaleY = (v: number) => H - PAD - ((v - mMin) / (mMax - mMin)) * (H - 2 * PAD);

  const cx = scaleX(100);
  const cy = scaleY(100);

  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Relative Rotation Graph">
      <rect x={cx} y={PAD} width={W - PAD - cx} height={cy - PAD} fill="rgba(74,222,128,0.05)" />
      <rect x={PAD} y={PAD} width={cx - PAD} height={cy - PAD} fill="rgba(34,211,238,0.05)" />
      <rect x={PAD} y={cy} width={cx - PAD} height={H - PAD - cy} fill="rgba(248,113,113,0.05)" />
      <rect x={cx} y={cy} width={W - PAD - cx} height={H - PAD - cy} fill="rgba(251,191,36,0.05)" />
      <line x1={cx} y1={PAD} x2={cx} y2={H - PAD} stroke="#333" strokeWidth={1} />
      <line x1={PAD} y1={cy} x2={W - PAD} y2={cy} stroke="#333" strokeWidth={1} />
      <text x={W - PAD - 5} y={PAD + 15} textAnchor="end" fill="#4ade80" fontSize={11} opacity={0.5}>LEADING</text>
      <text x={PAD + 5} y={PAD + 15} textAnchor="start" fill="#22d3ee" fontSize={11} opacity={0.5}>IMPROVING</text>
      <text x={PAD + 5} y={H - PAD - 5} textAnchor="start" fill="#f87171" fontSize={11} opacity={0.5}>LAGGING</text>
      <text x={W - PAD - 5} y={H - PAD - 5} textAnchor="end" fill="#fbbf24" fontSize={11} opacity={0.5}>WEAKENING</text>
      <text x={W / 2} y={H - 8} textAnchor="middle" fill="#666" fontSize={10}>RS-Ratio</text>
      <text x={12} y={H / 2} textAnchor="middle" fill="#666" fontSize={10} transform={`rotate(-90,12,${H / 2})`}>RS-Momentum</text>
      {sectors.map((s) => {
        const trail = s.rrgTrail;
        if (!trail || trail.length < 2) return null;
        const color = quadrantDotColor(s.quadrant);
        const points = trail.map((pt) => `${scaleX(pt.rsRatio)},${scaleY(pt.rsMomentum)}`).join(" ");
        const isHov = hovered === s.sector;
        return (
          <g key={`trail-${s.sector}`}>
            <polyline points={points} fill="none" stroke={color} strokeWidth={isHov ? 2 : 1.5} opacity={isHov ? 0.8 : 0.3} strokeLinejoin="round" />
            <circle cx={scaleX(trail[0].rsRatio)} cy={scaleY(trail[0].rsMomentum)} r={2} fill={color} opacity={isHov ? 0.6 : 0.2} />
          </g>
        );
      })}
      {sectors.map((s) => {
        const x = scaleX(s.rsRatio);
        const y = scaleY(s.rsMomentum);
        const color = quadrantDotColor(s.quadrant);
        const isHov = hovered === s.sector;
        return (
          <g key={s.sector} onMouseEnter={() => setHovered(s.sector)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
            <circle cx={x} cy={y} r={isHov ? 7 : 5} fill={color} stroke={isHov ? "#fff" : "none"} strokeWidth={1.5} opacity={isHov ? 1 : 0.85} />
            {isHov ? (
              <>
                <text x={x} y={y - 12} textAnchor="middle" fill={color} fontSize={11} fontWeight="bold">{s.etf}</text>
                <text x={x} y={y + 20} textAnchor="middle" fill="#a0a0a0" fontSize={10}>{s.sector} ({s.compositeScore}/100)</text>
              </>
            ) : (
              <text x={x} y={y - 8} textAnchor="middle" fill={color} fontSize={8} opacity={0.7}>{s.etf}</text>
            )}
          </g>
        );
      })}
      {/* Sub-sector markers (triangles) */}
      {subSectorScores.map((s) => {
        const x = scaleX(s.rsRatio);
        const y = scaleY(s.rsMomentum);
        const color = quadrantDotColor(s.quadrant);
        const isHov = hovered === s.sector;
        const size = isHov ? 8 : 6;
        const tri = `${x},${y - size} ${x - size},${y + size} ${x + size},${y + size}`;
        return (
          <g key={`sub-${s.etf}`} onMouseEnter={() => setHovered(s.sector)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
            <polygon points={tri} fill={color} stroke={isHov ? "#fff" : "none"} strokeWidth={1} opacity={isHov ? 1 : 0.7} />
            {isHov && <text x={x} y={y - size - 4} textAnchor="middle" fill={color} fontSize={10} fontWeight="bold">{s.etf}</text>}
          </g>
        );
      })}
      {/* Cross-asset markers (diamonds) */}
      {crossAssetScores.map((s) => {
        const x = scaleX(s.rsRatio);
        const y = scaleY(s.rsMomentum);
        const color = quadrantDotColor(s.quadrant);
        const isHov = hovered === s.sector;
        const size = isHov ? 7 : 5;
        const diamond = `${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`;
        return (
          <g key={`cross-${s.etf}`} onMouseEnter={() => setHovered(s.sector)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
            <polygon points={diamond} fill={color} stroke={isHov ? "#fff" : "none"} strokeWidth={1} opacity={isHov ? 1 : 0.7} />
            {isHov && <text x={x} y={y - size - 4} textAnchor="middle" fill={color} fontSize={10} fontWeight="bold">{s.etf}</text>}
          </g>
        );
      })}
      {/* Legend */}
      {(subSectorScores.length > 0 || crossAssetScores.length > 0) && (
        <g>
          <circle cx={PAD + 10} cy={H - 18} r={4} fill="#888" />
          <text x={PAD + 20} y={H - 14} fill="#666" fontSize={9}>Sector</text>
          {subSectorScores.length > 0 && (
            <>
              <polygon points={`${PAD + 70},${H - 22} ${PAD + 64},${H - 14} ${PAD + 76},${H - 14}`} fill="#888" />
              <text x={PAD + 82} y={H - 14} fill="#666" fontSize={9}>Sub-sector</text>
            </>
          )}
          {crossAssetScores.length > 0 && (
            <>
              <polygon points={`${PAD + 145},${H - 22} ${PAD + 150},${H - 18} ${PAD + 145},${H - 14} ${PAD + 140},${H - 18}`} fill="#888" />
              <text x={PAD + 156} y={H - 14} fill="#666" fontSize={9}>Cross-asset</text>
            </>
          )}
        </g>
      )}
    </svg>
  );
}

// ── Alert helpers ──

export function loadAlerts(): SectorAlert[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(ALERT_STORAGE_KEY) ?? "[]");
  } catch { return []; }
}

export function saveAlerts(alerts: SectorAlert[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(alerts));
}

// ── Alert Panel ──

export function AlertPanel({ sectors, data }: { sectors: SectorRotationScore[]; data: SectorRotationResult }) {
  const [alerts, setAlerts] = useState<SectorAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [triggeredAlerts, setTriggeredAlerts] = useState<string[]>([]);

  useEffect(() => { setAlerts(loadAlerts()); }, []);

  useEffect(() => {
    const triggered: string[] = [];
    for (const alert of alerts) {
      if (!alert.enabled) continue;
      const sector = sectors.find((s) => s.etf === alert.sectorEtf);
      if (!sector) continue;
      if (alert.condition === "enters_quadrant" && sector.quadrant === alert.value) {
        triggered.push(`${sector.sector} entered ${alert.value}`);
      }
      if (alert.condition === "acceleration_positive" && sector.acceleration > 0) {
        triggered.push(`${sector.sector} acceleration turned positive`);
      }
      if (alert.condition === "cmf_positive" && sector.cmf20 > 0) {
        triggered.push(`${sector.sector} CMF turned positive`);
      }
    }
    setTriggeredAlerts(triggered);
  }, [alerts, sectors]);

  const addAlert = (etf: string, condition: SectorAlert["condition"], value?: string) => {
    const newAlert: SectorAlert = { id: crypto.randomUUID(), sectorEtf: etf, condition, value, enabled: true };
    const updated = [...alerts, newAlert];
    setAlerts(updated);
    saveAlerts(updated);
  };

  const removeAlert = (id: string) => {
    const updated = alerts.filter((a) => a.id !== id);
    setAlerts(updated);
    saveAlerts(updated);
  };

  const toggleAlert = (id: string) => {
    const updated = alerts.map((a) => a.id === id ? { ...a, enabled: !a.enabled } : a);
    setAlerts(updated);
    saveAlerts(updated);
  };

  return (
    <>
      {triggeredAlerts.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-amber-400">
            <Bell className="h-3.5 w-3.5" />
            <span className="font-medium">Alerts triggered:</span>
            {triggeredAlerts.map((t, i) => <span key={`${t}-${i}`} className="text-[#ccc]">{t}</span>)}
          </div>
        </div>
      )}
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white" aria-label="Toggle alerts">
        <Bell className="h-4 w-4" />
        <span className="hidden sm:inline">Alerts{alerts.length > 0 ? ` (${alerts.length})` : ""}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div className="mx-4 w-full max-w-md rounded-xl border border-[#2a2a2a] bg-[#111] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Sector Alerts</h3>
              <button onClick={() => setOpen(false)} className="text-[#666] hover:text-white" aria-label="Close alerts"><X className="h-4 w-4" /></button>
            </div>
            {alerts.length > 0 && (
              <div className="space-y-2 mb-4">
                {alerts.map((a) => {
                  const sector = sectors.find((s) => s.etf === a.sectorEtf);
                  return (
                    <div key={a.id} className="flex items-center justify-between rounded border border-[#2a2a2a] px-3 py-2 text-xs">
                      <span className={a.enabled ? "text-white" : "text-[#555]"}>
                        {sector?.sector ?? a.sectorEtf}: {a.condition === "enters_quadrant" ? `enters ${a.value}` : a.condition === "acceleration_positive" ? "accel turns +" : "CMF turns +"}
                      </span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleAlert(a.id)} className="text-[#666] hover:text-white" aria-label="Toggle alert">
                          {a.enabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                        </button>
                        <button onClick={() => removeAlert(a.id)} className="text-[#666] hover:text-red-400" aria-label="Delete alert"><X className="h-3 w-3" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="border-t border-[#2a2a2a] pt-3">
              <p className="text-xs text-[#888] mb-2">Add alert</p>
              <div className="space-y-2">
                {sectors.slice(0, 14).map((s) => (
                  <div key={s.etf} className="flex items-center gap-2">
                    <span className="text-xs text-white w-16 truncate">{s.etf}</span>
                    <button onClick={() => addAlert(s.etf, "enters_quadrant", "IMPROVING")} className="rounded border border-[#333] px-2 py-0.5 text-[10px] text-[#888] hover:text-cyan-400 hover:border-cyan-500/30">IMPROVING</button>
                    <button onClick={() => addAlert(s.etf, "acceleration_positive")} className="rounded border border-[#333] px-2 py-0.5 text-[10px] text-[#888] hover:text-green-400 hover:border-green-500/30">Accel +</button>
                    <button onClick={() => addAlert(s.etf, "cmf_positive")} className="rounded border border-[#333] px-2 py-0.5 text-[10px] text-[#888] hover:text-green-400 hover:border-green-500/30">CMF +</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Stock Search ──

export function StockSearch({ allStocks }: { allStocks: StockInSector[] }) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 200);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (debouncedQuery.length < 1) return [];
    const q = debouncedQuery.toUpperCase();
    return allStocks
      .filter((s) => s.ticker.includes(q) || s.companyName.toUpperCase().includes(q))
      .slice(0, 10);
  }, [debouncedQuery, allStocks]);

  const showResults = focused && results.length > 0;

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-1.5">
        <Search className="h-4 w-4 text-[#666]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder="Search any stock..."
          className="bg-transparent text-sm text-white placeholder:text-[#555] outline-none w-32 sm:w-48"
        />
        {query && (
          <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="text-[#666] hover:text-white" aria-label="Clear search">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {showResults && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-[#2a2a2a] bg-[#111] py-1 shadow-xl max-h-80 overflow-y-auto">
          {results.map((s) => (
            <a key={s.ticker} href={`https://finance.yahoo.com/quote/${encodeURIComponent(s.ticker)}/`} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2 text-xs hover:bg-[#1a1a1a] transition-colors">
              <div>
                <span className="font-semibold text-white">{s.ticker}</span>
                <span className="ml-2 text-[#666]">{s.companyName}</span>
                <span className="ml-2 rounded-full bg-[#2a2a2a] px-1.5 py-0.5 text-[10px] text-[#888]">{s.sectorName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={rsColor(s.rs20d)}>{s.rs20d !== null ? `${s.rs20d > 0 ? "+" : ""}${s.rs20d.toFixed(1)}%` : ""}</span>
                <span className={rsAccelColor(s.rsAccel)}>{s.rsAccel !== null ? `${s.rsAccel > 0 ? "+" : ""}${s.rsAccel.toFixed(1)}` : ""}</span>
                {s.aboveSma50 === true ? <span className="h-2 w-2 rounded-full bg-green-400" /> : s.aboveSma50 === false ? <span className="h-2 w-2 rounded-full bg-red-400" /> : null}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sector Stock Table ──

type StockSortKey = "ticker" | "rs20d" | "rsAccel" | "sectorRS" | "finalScore" | "volumeVsAvg" | "aboveSma50" | "verdict" | "phase" | "earnings";

export function SectorStockTable({ stocks, sectorName, hasRotationData = false, rotationFetchFailed = false }: { stocks: StockInSector[]; sectorName?: string; hasRotationData?: boolean; rotationFetchFailed?: boolean }) {
  const [sortKey, setSortKey] = usePersistedFilter<StockSortKey>("ew-filter:sectors:sortKey", "rs20d");
  const [sortAsc, setSortAsc] = usePersistedFilter<boolean>("ew-filter:sectors:sortAsc", false);
  const [sma50Filter, setSma50Filter] = usePersistedFilter<SmaFilter>("ew-filter:sectors:sma50Filter", "all");
  const [volFilter, setVolFilter] = usePersistedFilter<VolFilter>("ew-filter:sectors:volFilter", "all");
  const [verdictFilter, setVerdictFilter] = usePersistedFilter<VerdictFilter>("ew-filter:sectors:verdictFilter", "all");
  const [rsAccelFilter, setRsAccelFilter] = usePersistedFilter<RsAccelFilter>("ew-filter:sectors:rsAccelFilter", "all");
  const [sectorRSFilter, setSectorRSFilter] = usePersistedFilter<RsAccelFilter>("ew-filter:sectors:sectorRSFilter", "all");
  const [phaseFilter, setPhaseFilter] = usePersistedFilter<PhaseFilter>("ew-filter:sectors:phaseFilter", "all");
  const [qualityFilter, setQualityFilter] = usePersistedFilter<"all" | "improving" | "high" | "fading">("ew-filter:sectors:qualityFilter", "all");

  const handleSort = (key: StockSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "ticker"); }
  };

  const resetFilters = () => { clearPersistedFilters("ew-filter:sectors"); setSma50Filter("all"); setVolFilter("all"); setVerdictFilter("all"); setRsAccelFilter("all"); setSectorRSFilter("all"); setPhaseFilter("all"); setQualityFilter("all"); };
  const hasFilters = sma50Filter !== "all" || volFilter !== "all" || verdictFilter !== "all" || rsAccelFilter !== "all" || sectorRSFilter !== "all" || phaseFilter !== "all" || qualityFilter !== "all";

  const earlyStrengthActive = phaseFilter === "turnaround";
  const toggleEarlyStrength = () => {
    setPhaseFilter(earlyStrengthActive ? "all" : "turnaround");
  };

  const filtered = useMemo(() => {
    let list = [...stocks];
    if (sma50Filter === "above") list = list.filter((s) => s.aboveSma50 === true);
    else if (sma50Filter === "below") list = list.filter((s) => s.aboveSma50 === false);
    if (volFilter === "above") list = list.filter((s) => s.volumeVsAvg != null && s.volumeVsAvg >= 1.0);
    else if (volFilter === "below") list = list.filter((s) => s.volumeVsAvg != null && s.volumeVsAvg < 1.0);
    if (verdictFilter === "priority") list = list.filter((s) => s.verdict === "PRIORITY BUY");
    else if (verdictFilter === "keep") list = list.filter((s) => s.verdict === "KEEP");
    else if (verdictFilter === "watch") list = list.filter((s) => s.verdict === "WATCH");
    if (rsAccelFilter === "positive") list = list.filter((s) => s.rsAccel != null && s.rsAccel > 0);
    else if (rsAccelFilter === "negative") list = list.filter((s) => s.rsAccel != null && s.rsAccel < 0);
    if (sectorRSFilter === "positive") list = list.filter((s) => s.sectorRS != null && s.sectorRS > 0);
    else if (sectorRSFilter === "negative") list = list.filter((s) => s.sectorRS != null && s.sectorRS < 0);
    if (phaseFilter !== "all") list = list.filter((s) => getStockPhase(s) === phaseFilter);
    if (qualityFilter === "improving") list = list.filter((s) => s.rsImproving);
    else if (qualityFilter === "high") list = list.filter((s) => s.rsImproving && s.volumeConsistency >= 3);
    else if (qualityFilter === "fading") list = list.filter((s) => !s.rsImproving && s.sectorRS != null && s.sectorRS < 0);
    return list;
  }, [stocks, sma50Filter, volFilter, verdictFilter, rsAccelFilter, sectorRSFilter, phaseFilter, qualityFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortAsc ? 1 : -1;
    switch (sortKey) {
      case "ticker": return list.sort((a, b) => dir * a.ticker.localeCompare(b.ticker));
      case "rs20d": return list.sort((a, b) => dir * ((a.rs20d ?? -999) - (b.rs20d ?? -999)));
      case "rsAccel": return list.sort((a, b) => dir * ((a.rsAccel ?? -999) - (b.rsAccel ?? -999)));
      case "sectorRS": return list.sort((a, b) => dir * ((a.sectorRS ?? -999) - (b.sectorRS ?? -999)));
      case "finalScore": return list.sort((a, b) => dir * (a.finalScore - b.finalScore));
      case "volumeVsAvg": return list.sort((a, b) => dir * ((a.volumeVsAvg ?? -1) - (b.volumeVsAvg ?? -1)));
      case "aboveSma50": return list.sort((a, b) => dir * ((a.aboveSma50 === true ? 1 : a.aboveSma50 === false ? 0 : -1) - (b.aboveSma50 === true ? 1 : b.aboveSma50 === false ? 0 : -1)));
      case "verdict": return list.sort((a, b) => dir * ((VERDICT_RANK[a.verdict] ?? 4) - (VERDICT_RANK[b.verdict] ?? 4)));
      case "phase": return list.sort((a, b) => dir * (PHASE_RANK[getStockPhase(a)] - PHASE_RANK[getStockPhase(b)]));
      case "earnings": return list.sort((a, b) => dir * ((a.daysToEarnings ?? 9999) - (b.daysToEarnings ?? 9999)));
      default: return list;
    }
  }, [filtered, sortKey, sortAsc]);

  const sortArrow = (key: StockSortKey) => sortKey === key ? (sortAsc ? " \u25B2" : " \u25BC") : "";
  const ariaSort = (key: StockSortKey): "ascending" | "descending" | "none" =>
    sortKey === key ? (sortAsc ? "ascending" : "descending") : "none";

  const csvEscape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const exportCsv = () => {
    const header = "Ticker,Company,Phase,RS 20d,Trend Accel,Sector RS,RS Delta,RS Improving,Vol Consistency,>50MA,Vol vs Avg,Score,Earnings (days),Earnings Date,Verdict";
    const rows = sorted.map((s) => {
      const phase = phaseBadge(getStockPhase(s)).label;
      return [s.ticker, csvEscape(s.companyName), phase, s.rs20d?.toFixed(1) ?? "", s.rsAccel?.toFixed(2) ?? "", s.sectorRS?.toFixed(2) ?? "", s.rsDelta.toFixed(2), s.rsImproving ? "Y" : "N", String(s.volumeConsistency), s.aboveSma50 === true ? "Y" : s.aboveSma50 === false ? "N" : "", s.volumeVsAvg?.toFixed(2) ?? "", s.finalScore || "", s.daysToEarnings ?? "", s.nextEarningsDate ?? "", s.verdict].join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sectorName ?? "sector"}-stocks.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const phaseCounts = useMemo(() => {
    const counts: Record<StockPhase, number> = { basing: 0, turnaround: 0, trending: 0, exhausting: 0, neutral: 0 };
    for (const s of stocks) counts[getStockPhase(s)]++;
    return counts;
  }, [stocks]);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <button onClick={() => setPhaseFilter(phaseFilter === "basing" ? "all" : "basing")} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${phaseFilter === "basing" ? "bg-purple-500/20 text-purple-400 border-purple-500/40" : "bg-purple-500/5 text-purple-400/70 border-purple-500/20 hover:bg-purple-500/10"}`} title="Phase 1: Below 50MA, momentum turning — watch for confirmation">
          P1: {phaseCounts.basing}
        </button>
        <button onClick={() => setPhaseFilter(phaseFilter === "turnaround" ? "all" : "turnaround")} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${phaseFilter === "turnaround" ? "bg-amber-500/20 text-amber-400 border-amber-500/40" : "bg-amber-500/5 text-amber-400/70 border-amber-500/20 hover:bg-amber-500/10"}`} title="Phase 2: Below 50MA, RS positive + volume — entry zone">
          P2: {phaseCounts.turnaround}
        </button>
        <button onClick={() => setPhaseFilter(phaseFilter === "trending" ? "all" : "trending")} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${phaseFilter === "trending" ? "bg-green-500/20 text-green-400 border-green-500/40" : "bg-green-500/5 text-green-400/70 border-green-500/20 hover:bg-green-500/10"}`} title="Phase 3: Above 50MA, accelerating — hold or add on dips">
          P3: {phaseCounts.trending}
        </button>
        <button onClick={() => setPhaseFilter(phaseFilter === "exhausting" ? "all" : "exhausting")} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${phaseFilter === "exhausting" ? "bg-red-500/20 text-red-400 border-red-500/40" : "bg-red-500/5 text-red-400/70 border-red-500/20 hover:bg-red-500/10"}`} title="Phase 4: Momentum fading (Trend Accel < -2) — take profit">
          P4: {phaseCounts.exhausting}
        </button>
        <span className="text-[10px] text-[#555]" title="Neutral: Mixed or insufficient signals">—: {phaseCounts.neutral}</span>
        <div className="h-3 w-px bg-[#333] mx-1" />
        <button
          onClick={toggleEarlyStrength}
          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
            earlyStrengthActive
              ? "bg-amber-500/20 text-amber-300 border-amber-500/40 ring-1 ring-amber-500/30"
              : "bg-[#1a1a1a] text-[#888] border-[#333] hover:text-[#ccc] hover:border-[#444]"
          }`}
          title="Preset: P2 Turnaround — below 50MA, RS positive, trend accel positive, volume above avg"
        >
          Early Strength
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2 text-xs">
        <label className="flex items-center gap-1 text-[#888]">
          50MA
          <select value={sma50Filter} onChange={(e) => setSma50Filter(e.target.value as SmaFilter)} className="bg-[#1a1a1a] border border-[#333] rounded px-1.5 py-0.5 text-[#a0a0a0] text-xs">
            <option value="all">All</option>
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[#888]">
          Volume
          <select value={volFilter} onChange={(e) => setVolFilter(e.target.value as VolFilter)} className="bg-[#1a1a1a] border border-[#333] rounded px-1.5 py-0.5 text-[#a0a0a0] text-xs">
            <option value="all">All</option>
            <option value="above">Above Avg</option>
            <option value="below">Below Avg</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[#888]" title="Short-term trend vs long-term trend (% from 50MA minus % from 200MA)">
          Trend Accel
          <select value={rsAccelFilter} onChange={(e) => setRsAccelFilter(e.target.value as RsAccelFilter)} className="bg-[#1a1a1a] border border-[#333] rounded px-1.5 py-0.5 text-[#a0a0a0] text-xs">
            <option value="all">All</option>
            <option value="positive">Positive</option>
            <option value="negative">Negative</option>
          </select>
        </label>
        <label className={`flex items-center gap-1 ${hasRotationData ? "text-[#888]" : "text-[#555]"}`} title={hasRotationData ? "Relative strength acceleration vs sector ETF. Positive = catching up vs sector recently." : "Requires active rotation data — loading or unavailable"}>
          Sector RS{rotationFetchFailed && <span className="text-red-400/70 text-[10px]">(unavailable)</span>}
          <select value={sectorRSFilter} onChange={(e) => setSectorRSFilter(e.target.value as RsAccelFilter)} disabled={!hasRotationData} className={`bg-[#1a1a1a] border border-[#333] rounded px-1.5 py-0.5 text-xs ${hasRotationData ? "text-[#a0a0a0]" : "text-[#555] opacity-50 cursor-not-allowed"}`}>
            <option value="all">All</option>
            <option value="positive">Positive</option>
            <option value="negative">Negative</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[#888]">
          Phase
          <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value as PhaseFilter)} className="bg-[#1a1a1a] border border-[#333] rounded px-1.5 py-0.5 text-[#a0a0a0] text-xs">
            <option value="all">All</option>
            <option value="basing">P1 Basing</option>
            <option value="turnaround">P2 Turnaround</option>
            <option value="trending">P3 Trending</option>
            <option value="exhausting">P4 Exhausting</option>
          </select>
        </label>
        <label className={`flex items-center gap-1 ${hasRotationData ? "text-[#888]" : "text-[#555]"}`} title={hasRotationData ? "Filter by rotation quality signals" : "Requires active rotation data — loading or unavailable"}>
          Quality{rotationFetchFailed && <span className="text-red-400/70 text-[10px]">(unavailable)</span>}
          <select value={qualityFilter} onChange={(e) => setQualityFilter(e.target.value as "all" | "improving" | "high" | "fading")} disabled={!hasRotationData} className={`bg-[#1a1a1a] border border-[#333] rounded px-1.5 py-0.5 text-xs ${hasRotationData ? "text-[#a0a0a0]" : "text-[#555] opacity-50 cursor-not-allowed"}`}>
            <option value="all">All</option>
            <option value="improving">RS Improving</option>
            <option value="high">High Quality</option>
            <option value="fading">Fading</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[#888]">
          Verdict
          <select value={verdictFilter} onChange={(e) => setVerdictFilter(e.target.value as VerdictFilter)} className="bg-[#1a1a1a] border border-[#333] rounded px-1.5 py-0.5 text-[#a0a0a0] text-xs">
            <option value="all">All</option>
            <option value="priority">Priority</option>
            <option value="keep">Keep</option>
            <option value="watch">Watch</option>
          </select>
        </label>
        {hasFilters && (
          <button onClick={resetFilters} className="text-[#5ba3e6] hover:text-white transition-colors">Reset</button>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <CopyButton tickers={sorted.map((s) => s.ticker)} className="flex items-center gap-1 text-[#666] hover:text-white transition-colors" />
          <button onClick={exportCsv} className="flex items-center gap-1 text-[#666] hover:text-white transition-colors" title="Export to CSV" aria-label="Export to CSV">
            <FileDown className="h-3 w-3" />
          </button>
          <span className="text-[#555] ml-1">
            {filtered.length === stocks.length ? `${stocks.length} stocks` : `${filtered.length} of ${stocks.length}`}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto hidden sm:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#666] border-b border-[#2a2a2a]">
              <th className="text-left py-1.5 pr-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("ticker")} aria-sort={ariaSort("ticker")}>Ticker{sortArrow("ticker")}</th>
              <th className="text-left py-1.5 pr-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("phase")} aria-sort={ariaSort("phase")}>Phase{sortArrow("phase")}</th>
              <th className="text-left py-1.5 pr-2 font-medium hidden md:table-cell">Company</th>
              <th className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("rs20d")} aria-sort={ariaSort("rs20d")}>RS 20d{sortArrow("rs20d")}</th>
              <th className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("rsAccel")} aria-sort={ariaSort("rsAccel")} title="Short-term trend vs long-term trend (% from 50MA minus % from 200MA). Positive = accelerating uptrend.">Trend Accel{sortArrow("rsAccel")}</th>
              <th className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("sectorRS")} aria-sort={ariaSort("sectorRS")} title="Sector RS: relative strength acceleration vs sector ETF.">Sector RS{sortArrow("sectorRS")}</th>
              <th className="text-center py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("aboveSma50")} aria-sort={ariaSort("aboveSma50")}>&gt;50MA{sortArrow("aboveSma50")}</th>
              <th className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("volumeVsAvg")} aria-sort={ariaSort("volumeVsAvg")}>Vol vs Avg{sortArrow("volumeVsAvg")}</th>
              <th className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("finalScore")} aria-sort={ariaSort("finalScore")}>Score{sortArrow("finalScore")}</th>
              <th className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("earnings")} aria-sort={ariaSort("earnings")}>Earnings{sortArrow("earnings")}</th>
              <th className="text-left py-1.5 pl-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("verdict")} aria-sort={ariaSort("verdict")}>Verdict{sortArrow("verdict")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const phase = getStockPhase(s);
              const badge = phaseBadge(phase);
              const isActionable = phase === "basing" || phase === "turnaround";
              const quality = isActionable ? getEntryQuality(s) : 0;
              return (
                <tr key={s.ticker} className={`border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors ${isActionable ? "border-l-2 border-l-amber-400 bg-amber-500/5" : ""}`}>
                  <td className="py-1.5 pr-2">
                    <a href={`https://finance.yahoo.com/quote/${encodeURIComponent(s.ticker)}/`} target="_blank" rel="noopener noreferrer" className="font-medium text-white hover:text-[#5ba3e6] transition-colors" title={s.institutionalPct != null ? `Inst. ownership: ${s.institutionalPct.toFixed(0)}% (quarterly)` : undefined}>{s.ticker}</a>
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1">
                      <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] whitespace-nowrap ${badge.className}`} title={badge.description}>{badge.label}</span>
                      {isActionable && quality > 0 && (
                        <span className="flex gap-0.5" title={`Entry quality: ${quality}/3`}>
                          {Array.from({ length: quality }, (_, i) => (
                            <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                          ))}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 text-[#555] truncate max-w-[120px] hidden md:table-cell">{s.companyName}</td>
                  <td className={`py-1.5 px-2 text-right ${rsColor(s.rs20d)}`}>
                    {s.rs20d !== null ? `${s.rs20d > 0 ? "+" : ""}${s.rs20d.toFixed(1)}%` : "-"}
                  </td>
                  <td className={`py-1.5 px-2 text-right font-mono ${rsAccelColor(s.rsAccel)}`}>
                    {s.rsAccel !== null ? `${s.rsAccel > 0 ? "+" : ""}${s.rsAccel.toFixed(2)}` : "-"}
                  </td>
                  <td className={`py-1.5 px-2 text-right font-mono ${rsAccelColor(s.sectorRS)}`}>
                    {s.sectorRS !== null ? `${s.sectorRS > 0 ? "+" : ""}${s.sectorRS.toFixed(2)}` : "-"}
                    {s.sectorRS !== null && (
                      <span className={`ml-0.5 ${s.rsImproving ? "text-green-400" : "text-red-400"}`} title={`RS Delta: ${s.rsDelta > 0 ? "+" : ""}${s.rsDelta.toFixed(2)}`}>
                        {s.rsImproving ? "\u25B2" : "\u25BC"}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {s.aboveSma50 === true ? (
                      <span className="inline-block h-2 w-2 rounded-full bg-green-400" title="Above 50d SMA" role="img" aria-label="Above 50d SMA" />
                    ) : s.aboveSma50 === false ? (
                      <span className="inline-block h-2 w-2 rounded-full bg-red-400" title="Below 50d SMA" role="img" aria-label="Below 50d SMA" />
                    ) : (
                      <span className="text-[#444]">-</span>
                    )}
                  </td>
                  <td className={`py-1.5 px-2 text-right ${s.volumeVsAvg !== null && s.volumeVsAvg >= 1.5 ? "text-amber-400" : s.volumeVsAvg !== null && s.volumeVsAvg >= 1.0 ? "text-[#a0a0a0]" : "text-[#555]"}`}>
                    <span className="inline-flex items-center gap-0.5">
                      {s.volumeVsAvg !== null ? `${s.volumeVsAvg.toFixed(2)}x` : "-"}
                      {(phase === "turnaround" || phase === "trending") && s.volumeVsAvg !== null && s.volumeVsAvg >= 1.5 && (
                        <Zap className="h-2.5 w-2.5 text-amber-400" />
                      )}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right text-[#666]">{s.finalScore > 0 ? s.finalScore : "-"}</td>
                  <td className={`py-1.5 px-2 text-right ${s.daysToEarnings === null ? "text-[#444]" : s.daysToEarnings <= 7 ? "text-red-400" : s.daysToEarnings <= 14 ? "text-amber-400" : s.daysToEarnings <= 30 ? "text-[#a0a0a0]" : "text-[#555]"}`} title={s.nextEarningsDate ?? undefined}>
                    {s.daysToEarnings !== null ? `${s.daysToEarnings}d` : "-"}
                  </td>
                  <td className="py-1.5 pl-2">
                    {s.verdict ? (
                      <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
                        s.verdict === "PRIORITY BUY" ? "bg-green-500/15 text-green-400 border-green-500/30" :
                        s.verdict === "KEEP" ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" :
                        s.verdict === "WATCH" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                        "bg-red-500/15 text-red-400 border-red-500/30"
                      }`}>{s.verdict}</span>
                    ) : <span className="text-[#444]">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sm:hidden space-y-2">
        {sorted.map((s) => {
          const phase = getStockPhase(s);
          const badge = phaseBadge(phase);
          const isActionable = phase === "basing" || phase === "turnaround";
          const quality = isActionable ? getEntryQuality(s) : 0;
          return (
            <div key={s.ticker} className={`rounded-lg border p-3 ${isActionable ? "border-l-2 border-l-amber-400 bg-amber-500/5 border-amber-500/20" : "border-[#2a2a2a] bg-[#141414]"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <a href={`https://finance.yahoo.com/quote/${encodeURIComponent(s.ticker)}/`} target="_blank" rel="noopener noreferrer" className="font-semibold text-white hover:text-[#5ba3e6]">{s.ticker}</a>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${badge.className}`}>{badge.label}</span>
                  {isActionable && quality > 0 && (
                    <span className="flex gap-0.5">
                      {Array.from({ length: quality }, (_, i) => (
                        <span key={i} className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                      ))}
                    </span>
                  )}
                  {s.verdict && <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
                    s.verdict === "PRIORITY BUY" ? "bg-green-500/15 text-green-400 border-green-500/30" :
                    s.verdict === "KEEP" ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" :
                    s.verdict === "WATCH" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                    "bg-red-500/15 text-red-400 border-red-500/30"
                  }`}>{s.verdict}</span>}
                </div>
                {s.aboveSma50 === true ? <span className="h-2 w-2 rounded-full bg-green-400" /> : s.aboveSma50 === false ? <span className="h-2 w-2 rounded-full bg-red-400" /> : null}
              </div>
              <div className="mt-1 text-[10px] text-[#555]">{s.companyName}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <div><span className="text-[#666]">RS 20d</span> <span className={rsColor(s.rs20d)}>{s.rs20d !== null ? `${s.rs20d > 0 ? "+" : ""}${s.rs20d.toFixed(1)}%` : "-"}</span></div>
                <div><span className="text-[#666]" title="Trend Accel: % from 50MA minus % from 200MA">TrAccel</span> <span className={rsAccelColor(s.rsAccel)}>{s.rsAccel !== null ? `${s.rsAccel > 0 ? "+" : ""}${s.rsAccel.toFixed(1)}` : "-"}</span></div>
                <div><span className="text-[#666]" title="Sector RS: relative strength vs sector ETF">SectorRS</span> <span className={rsAccelColor(s.sectorRS)}>{s.sectorRS !== null ? `${s.sectorRS > 0 ? "+" : ""}${s.sectorRS.toFixed(1)}` : "-"}{s.sectorRS !== null && <span className={s.rsImproving ? "text-green-400" : "text-red-400"}>{s.rsImproving ? "\u25B2" : "\u25BC"}</span>}</span></div>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <span className="text-[#666]">Vol</span>{" "}
                  <span className="text-[#a0a0a0]">{s.volumeVsAvg?.toFixed(1) ?? "-"}x</span>
                  {(phase === "turnaround" || phase === "trending") && s.volumeVsAvg !== null && s.volumeVsAvg >= 1.5 && (
                    <Zap className="h-2.5 w-2.5 text-amber-400 inline ml-0.5" />
                  )}
                </div>
                <div><span className="text-[#666]">Score</span> <span className="text-[#a0a0a0]">{s.finalScore || "-"}</span></div>
                <div><span className="text-[#666]">Earn</span> <span className={s.daysToEarnings === null ? "text-[#444]" : s.daysToEarnings <= 7 ? "text-red-400" : s.daysToEarnings <= 14 ? "text-amber-400" : s.daysToEarnings <= 30 ? "text-[#a0a0a0]" : "text-[#555]"}>{s.daysToEarnings !== null ? `${s.daysToEarnings}d` : "-"}</span></div>
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length === 0 && (
        <p className="text-center text-xs text-[#555] py-4">No stocks match current filters</p>
      )}
    </div>
  );
}

// ── Filter Recipes ──

export function FilterRecipes() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mb-3 flex w-full items-center gap-2 text-lg font-semibold text-white text-left"
      >
        {open ? <ChevronUp className="h-5 w-5 text-[#5ba3e6]" /> : <ChevronDown className="h-5 w-5 text-[#5ba3e6]" />}
        Filter Recipes
        <span className="text-xs font-normal text-[#666]">Using all 3 RS metrics together</span>
      </button>
      {open && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-5 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">The Three Metrics</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Metric</th>
                    <th className="py-1.5 pr-3 text-left font-medium">What It Measures</th>
                    <th className="py-1.5 text-left font-medium">Green Flag</th>
                  </tr>
                </thead>
                <tbody className="text-[#a0a0a0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-white">RS 20d</td>
                    <td className="py-2 pr-3">20-day relative strength vs the broad market</td>
                    <td className="py-2 text-green-400">Positive = outperforming market</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-white">Trend Accel</td>
                    <td className="py-2 pr-3">Stock&apos;s own trend acceleration (% from 50MA minus % from 200MA)</td>
                    <td className="py-2 text-green-400">Positive = short-term gaining on long-term</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-white">Sector RS</td>
                    <td className="py-2 pr-3">Relative strength acceleration vs sector ETF (5d vs 20d)</td>
                    <td className="py-2 text-green-400">Positive = catching up vs sector</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Recipes</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Goal</th>
                    <th className="py-1.5 text-left font-medium">Filter Combination</th>
                  </tr>
                </thead>
                <tbody className="text-[#a0a0a0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-green-400 whitespace-nowrap">Best entries</td>
                    <td className="py-2">Phase: <span className="text-white">P2 Turnaround</span> + Trend Accel: <span className="text-white">Positive</span> + Sector RS: <span className="text-white">Positive</span> + RS 20d: <span className="text-white">Positive</span></td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-cyan-400 whitespace-nowrap">Momentum leaders</td>
                    <td className="py-2">Phase: <span className="text-white">P3 Trending</span> + RS 20d: <span className="text-white">Positive</span> + Volume: <span className="text-white">Above Avg</span></td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-amber-400 whitespace-nowrap">Catch-up catalyst</td>
                    <td className="py-2">Trend Accel: <span className="text-white">Positive</span> + Sector RS: <span className="text-white">Negative</span> + Earnings: <span className="text-red-400">&le;14d</span> (red/amber)</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-red-400 whitespace-nowrap">Avoid list</td>
                    <td className="py-2">Phase: <span className="text-white">P4 Exhausting</span> + Trend Accel: <span className="text-white">Negative</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-purple-400 whitespace-nowrap">Early watch</td>
                    <td className="py-2">Phase: <span className="text-white">P1 Basing</span> + Sector RS: <span className="text-white">Positive</span> &mdash; add to watchlist, wait for P2 transition</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <h3 className="text-sm font-semibold text-amber-400 mb-2">The SNOW Pattern: Catch-Up Catalyst</h3>
            <p className="text-xs text-[#a0a0a0] leading-relaxed">
              In Feb 2025 earnings, SNOW had Trend Accel <span className="text-green-400 font-mono">+27.98</span> (powerful own momentum) but Sector RS <span className="text-red-400 font-mono">&minus;11.3</span> (lagging sector ETF recently).
              The negative Sector RS looked bearish in isolation, but the strong Trend Accel correctly showed the stock had direction.
              SNOW jumped 75 points after earnings &mdash; the catalyst unlocked the gap between individual strength and sector-relative weakness.
            </p>
            <p className="text-xs text-[#a0a0a0] leading-relaxed mt-2">
              <strong className="text-white">Key rule:</strong> Positive Trend Accel + negative Sector RS = coiled catch-up, not breakdown.
              If Trend Accel is also negative, the stock is genuinely weak &mdash; avoid.
              When the two metrics diverge, <strong className="text-white">trust Trend Accel for direction</strong> and use Sector RS for relative positioning.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sector Detail Accordion ──

export function SectorDetail({ sector, stocks, prevSnapshot, etfReturns, hasRotationData = false, rotationFetchFailed = false }: { sector: SectorRotationScore; stocks: StockInSector[]; prevSnapshot?: SectorSnapshot | null; etfReturns?: number[]; hasRotationData?: boolean; rotationFetchFailed?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border rounded-lg ${sector.stealthAccumulation ? "border-cyan-500/40" : "border-[#2a2a2a]"}`}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#1a1a1a] transition-colors rounded-lg" aria-label="Toggle sector details">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg">{sector.trendArrow}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-white truncate">{sector.sector}</span>
              <span className="text-xs text-[#666]">{sector.etf}</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${quadrantColor(sector.quadrant)}`}>{sector.quadrant}</span>
              <TradingActionBadge sector={sector} />
              {sector.stealthAccumulation && <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-400">STEALTH</span>}
              {(sector.dataQuality ?? 100) < 100 && <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400" title={`Scoring factors: momentum, acceleration, Mansfield RS, CMF (always available), breadth, smart money. ${sector.dataQualityBreakdown ? `Missing: ${[!sector.dataQualityBreakdown.breadth && "breadth", !sector.dataQualityBreakdown.smartMoney && "smart money"].filter(Boolean).join(", ")}. ` : ""}Weights are redistributed across available factors.`}>{sector.dataQuality ?? 100}% data</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <EtfSparkline returns={etfReturns} />
          <Link href={`/rotation?sector=${encodeURIComponent(sector.sector)}`} onClick={(e) => e.stopPropagation()} className="text-[#555] hover:text-[#5ba3e6]" title="View in Rotation Tracker">
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <span className="text-xs text-[#666]">{stocks.length} stocks</span>
          <span className={`text-lg font-bold ${compositeTextColor(sector.compositeScore)}`}>
            {sector.compositeScore}
            {prevSnapshot && prevSnapshot.compositeScore !== sector.compositeScore && (
              <span className={`ml-1 text-xs font-semibold ${sector.compositeScore - prevSnapshot.compositeScore > 0 ? "text-green-400" : "text-red-400"}`}>({sector.compositeScore - prevSnapshot.compositeScore > 0 ? "+" : ""}{sector.compositeScore - prevSnapshot.compositeScore})</span>
            )}
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-[#666]" /> : <ChevronDown className="h-4 w-4 text-[#666]" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-[#2a2a2a] px-4 py-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[#888]">Momentum Composite</span><span className="text-white">{sector.momentumComposite} <span className="text-[#666]">({sector.momentumPercentile}th %ile)</span></span></div>
            <div className="flex justify-between"><span className="text-[#888]">Acceleration</span><span className={sector.acceleration > 0 ? "text-green-400" : sector.acceleration < 0 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.acceleration > 0 ? "+" : ""}{sector.acceleration.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Mansfield RS</span><span className={sector.mansfieldRS > 0 ? "text-green-400" : sector.mansfieldRS < 0 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.mansfieldRS > 0 ? "+" : ""}{sector.mansfieldRS.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">CMF (20d)</span><span className={sector.cmf20 > 0 ? "text-green-400" : sector.cmf20 < 0 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.cmf20 > 0 ? "+" : ""}{sector.cmf20.toFixed(3)}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">OBV Trend</span><span className={sector.obvTrend === 1 ? "text-green-400" : sector.obvTrend === -1 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.obvTrend === 1 ? "Accumulation" : sector.obvTrend === -1 ? "Distribution" : "Flat"}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Breadth (% &gt; 50d SMA)</span><span className="text-white">{sector.breadthPct !== null ? `${sector.breadthPct}%` : "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Unusual Volume</span><span className={sector.unusualVolume ? "text-amber-400" : "text-[#a0a0a0]"}>{sector.unusualVolume ? "Yes" : "No"}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Insider Buys</span><span className={sector.aggregateInsiderBuys > 0 ? "text-green-400" : "text-[#a0a0a0]"}>{sector.aggregateInsiderBuys}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Avg P/C Ratio</span><span className="text-white">{sector.aggregatePCR !== null ? sector.aggregatePCR : "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Earnings Beat %</span><span className="text-white">{sector.earningsBeatPct}%</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Smart Money Score</span><span className={sector.dataQualityBreakdown?.smartMoney === false ? "text-[#555]" : compositeTextColor(sector.smartMoneyScore)}>{sector.dataQualityBreakdown?.smartMoney === false ? "No data" : `${sector.smartMoneyScore}/100`}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">RS-Ratio / Momentum</span><span className="text-white">{sector.rsRatio.toFixed(2)} / {sector.rsMomentum.toFixed(2)}</span></div>
          </div>
          {stocks.length > 0 && (
            <div className="border-t border-[#2a2a2a] pt-3">
              <SectorStockTable stocks={stocks} sectorName={sector.sector} hasRotationData={hasRotationData} rotationFetchFailed={rotationFetchFailed} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Top Picks by Sector ──

export function TopPicksBySector({ stocks, sectors, scanResultsDate }: { stocks: EnrichedStock[]; sectors: SectorRotationScore[]; scanResultsDate: string | null }) {
  const topPicks = useMemo(() => {
    const map: Record<string, EnrichedStock[]> = {};
    for (const s of stocks) {
      if (!map[s.sectorEtf]) map[s.sectorEtf] = [];
      map[s.sectorEtf].push(s);
    }
    for (const etf of Object.keys(map)) {
      map[etf].sort((a, b) => (CONV_ORDER[a.conviction] ?? 3) - (CONV_ORDER[b.conviction] ?? 3) || (b.rsAccel ?? -999) - (a.rsAccel ?? -999));
      map[etf] = map[etf].slice(0, 3);
    }
    return map;
  }, [stocks]);

  const convColor = (c: string) => {
    switch (c) {
      case "HIGH": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "MEDIUM": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      default: return "bg-[#2a2a2a] text-[#a0a0a0] border-[#333]";
    }
  };

  if (Object.keys(topPicks).length === 0) {
    return <p className="text-sm text-[#666]">No stock picks available</p>;
  }

  const sortedEtfs = Object.keys(topPicks).sort((a, b) => {
    const sa = sectors.find((s) => s.etf === a);
    const sb = sectors.find((s) => s.etf === b);
    return (sb?.compositeScore ?? 0) - (sa?.compositeScore ?? 0);
  });

  return (
    <div className="space-y-3">
      {sortedEtfs.map((etf) => {
        const sector = sectors.find((s) => s.etf === etf);
        const picks = topPicks[etf];
        return (
          <div key={etf}>
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-white">{etf}</span>
              <span className="text-xs text-[#888]">{sector?.sector}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {picks.map((s) => (
                <span
                  key={s.symbol}
                  className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium ${convColor(s.conviction)}`}
                  title={`${s.category} · ${s.rsAccelDesc} · Vol ${s.volRatio.toFixed(1)}x`}
                >
                  <a
                    href={`https://finance.yahoo.com/quote/${s.symbol}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {s.symbol}
                  </a>
                  <span className="text-[10px] opacity-70">${s.price.toFixed(0)}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Stock Picks Panel ──

export function StockPicksPanel({ stocks, collapsed, onToggle }: { stocks: EnrichedStock[]; collapsed?: boolean; onToggle?: (id: string) => void }) {
  const [filter, setFilter] = usePersistedFilter<ConvictionLevel | "ALL">("ew-filter:picks:conviction", "ALL");
  const [sectorFilter, setSectorFilter] = usePersistedFilter<string>("ew-filter:picks:sector", "ALL");
  const [categoryFilter, setCategoryFilter] = usePersistedFilter<StockCategory | "ALL">("ew-filter:picks:category", "ALL");
  const [phaseFilter, setPhaseFilter] = usePersistedFilter<RotationStockPhase | "ALL">("ew-filter:picks:phase", "ALL");
  const [quadrantFilter, setQuadrantFilter] = usePersistedFilter<RRGQuadrant | "ALL">("ew-filter:picks:quadrant", "ALL");
  const [rsAccelFilter, setRsAccelFilter] = usePersistedFilter<"all" | "positive" | "strong">("ew-filter:picks:rsAccel", "all");
  const [volFilter, setVolFilter] = usePersistedFilter<"all" | "above" | "high">("ew-filter:picks:vol", "all");
  const [aboveSmaFilter, setAboveSmaFilter] = usePersistedFilter<"all" | "above" | "below">("ew-filter:picks:aboveSma", "all");
  const [sortKey, setSortKey] = useState<PicksSortKey>("conviction");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());

  const sectorNames = useMemo(() => {
    const s = new Set(stocks.map((st) => st.sector));
    return ["ALL", ...Array.from(s).sort()];
  }, [stocks]);

  const filtered = useMemo(() => {
    let list = stocks;
    if (filter !== "ALL") list = list.filter((s) => s.conviction === filter);
    if (sectorFilter !== "ALL") list = list.filter((s) => s.sector === sectorFilter);
    if (categoryFilter !== "ALL") list = list.filter((s) => s.category === categoryFilter);
    if (phaseFilter !== "ALL") list = list.filter((s) => s.phase === phaseFilter);
    if (quadrantFilter !== "ALL") list = list.filter((s) => s.sectorQuadrant === quadrantFilter);
    if (rsAccelFilter === "positive") list = list.filter((s) => s.rsAccel != null && s.rsAccel > 0);
    if (rsAccelFilter === "strong") list = list.filter((s) => s.rsAccel != null && s.rsAccel >= 3);
    if (volFilter === "above") list = list.filter((s) => s.volRatio >= 1.0);
    if (volFilter === "high") list = list.filter((s) => s.volRatio >= 1.5);
    if (aboveSmaFilter === "above") list = list.filter((s) => s.above50ma);
    if (aboveSmaFilter === "below") list = list.filter((s) => !s.above50ma);

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "conviction": cmp = (CONV_ORDER[a.conviction] ?? 3) - (CONV_ORDER[b.conviction] ?? 3); break;
        case "symbol": cmp = a.symbol.localeCompare(b.symbol); break;
        case "category": cmp = (CAT_ORDER[a.category] ?? 4) - (CAT_ORDER[b.category] ?? 4); break;
        case "phase": cmp = (PHASE_ORDER[a.phase] ?? 4) - (PHASE_ORDER[b.phase] ?? 4); break;
        case "rsAccel": cmp = (a.rsAccel ?? -999) - (b.rsAccel ?? -999); break;
        case "volRatio": cmp = a.volRatio - b.volRatio; break;
        case "price": cmp = a.price - b.price; break;
        case "pctFrom50ma": cmp = (a.pctFrom50ma ?? -999) - (b.pctFrom50ma ?? -999); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return sorted;
  }, [stocks, filter, sectorFilter, categoryFilter, phaseFilter, quadrantFilter, rsAccelFilter, volFilter, aboveSmaFilter, sortKey, sortDir]);

  const stocksBySector = useMemo(() => {
    const groups = new Map<string, { etf: string; sector: string; quadrant: RRGQuadrant; stocks: EnrichedStock[] }>();
    for (const s of filtered) {
      const key = s.sectorEtf;
      if (!groups.has(key)) {
        groups.set(key, { etf: s.sectorEtf, sector: s.sector, quadrant: s.sectorQuadrant, stocks: [] });
      }
      const group = groups.get(key);
      if (group) group.stocks.push(s);
    }
    return Array.from(groups.values());
  }, [filtered]);

  const highCount = stocks.filter((s) => s.conviction === "HIGH").length;
  const medCount = stocks.filter((s) => s.conviction === "MEDIUM").length;

  const handleSort = (key: PicksSortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const toggleSector = (etf: string) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(etf)) next.delete(etf); else next.add(etf);
      return next;
    });
  };

  const SortArrow = ({ col }: { col: PicksSortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "desc" ? <ChevronDown className="inline h-3 w-3" /> : <ChevronUp className="inline h-3 w-3" />;
  };

  const picksAriaSort = (col: PicksSortKey): "ascending" | "descending" | "none" =>
    sortKey === col ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  const badge = (
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-green-500/10 border border-green-500/30 px-2 py-0.5 text-[10px] text-green-400">{highCount} HIGH</span>
      <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-400">{medCount} MED</span>
      <span className="text-[10px] text-[#555]">{stocks.length} total</span>
    </div>
  );

  const hasFilters = filter !== "ALL" || sectorFilter !== "ALL" || categoryFilter !== "ALL" ||
    phaseFilter !== "ALL" || quadrantFilter !== "ALL" || rsAccelFilter !== "all" ||
    volFilter !== "all" || aboveSmaFilter !== "all";

  const resetFilters = () => {
    clearPersistedFilters("ew-filter:picks");
    setFilter("ALL"); setSectorFilter("ALL"); setCategoryFilter("ALL");
    setPhaseFilter("ALL"); setQuadrantFilter("ALL");
    setRsAccelFilter("all"); setVolFilter("all"); setAboveSmaFilter("all");
  };

  const COL_COUNT = 8;
  const selectClass = "rounded border border-[#333] bg-[#1a1a1a] px-1.5 py-0.5 text-xs text-[#a0a0a0]";

  return (
    <CollapsiblePanel id="stock-picks" title="Stock Picks" collapsed={collapsed ?? false} onToggle={onToggle ?? (() => {})} badge={badge}>
      <div className="flex flex-wrap items-center gap-2 px-1 pb-3">
        <select value={filter} onChange={(e) => setFilter(e.target.value as ConvictionLevel | "ALL")} className={selectClass}>
          <option value="ALL">All Conviction</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="WATCH">WATCH</option>
        </select>
        <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} className={selectClass}>
          {sectorNames.map((s) => <option key={s} value={s}>{s === "ALL" ? "All Sectors" : s}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as StockCategory | "ALL")} className={selectClass}>
          <option value="ALL">All Category</option>
          <option value="LEADER">LEADER</option>
          <option value="CATCH_UP">CATCH_UP</option>
          <option value="TURNAROUND">TURNAROUND</option>
          <option value="AVOID">AVOID</option>
        </select>
        <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value as RotationStockPhase | "ALL")} className={selectClass}>
          <option value="ALL">All Phase</option>
          <option value="P1_BASING">P1 Basing</option>
          <option value="P2_TURNAROUND">P2 Turnaround</option>
          <option value="P3_TRENDING">P3 Trending</option>
          <option value="P4_EXHAUSTING">P4 Exhausting</option>
        </select>
        <select value={quadrantFilter} onChange={(e) => setQuadrantFilter(e.target.value as RRGQuadrant | "ALL")} className={selectClass}>
          <option value="ALL">All Quadrant</option>
          <option value="LEADING">LEADING</option>
          <option value="IMPROVING">IMPROVING</option>
          <option value="WEAKENING">WEAKENING</option>
          <option value="LAGGING">LAGGING</option>
        </select>
        <select value={rsAccelFilter} onChange={(e) => setRsAccelFilter(e.target.value as "all" | "positive" | "strong")} className={selectClass}>
          <option value="all">All RS Accel</option>
          <option value="positive">Positive (&gt;0)</option>
          <option value="strong">Strong (&ge;3)</option>
        </select>
        <select value={volFilter} onChange={(e) => setVolFilter(e.target.value as "all" | "above" | "high")} className={selectClass}>
          <option value="all">All Volume</option>
          <option value="above">Above Avg (&ge;1.0x)</option>
          <option value="high">High (&ge;1.5x)</option>
        </select>
        <select value={aboveSmaFilter} onChange={(e) => setAboveSmaFilter(e.target.value as "all" | "above" | "below")} className={selectClass}>
          <option value="all">All 50MA</option>
          <option value="above">Above 50MA</option>
          <option value="below">Below 50MA</option>
        </select>
        <span className="text-[10px] text-[#666]">{filtered.length} / {stocks.length}</span>
        {hasFilters && (
          <button onClick={resetFilters} className="rounded border border-[#333] bg-[#1a1a1a] px-1.5 py-0.5 text-[10px] text-[#888] hover:text-white">Reset</button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#2a2a2a] text-left text-[#666]">
              <th className="pb-2 pr-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("conviction")} aria-sort={picksAriaSort("conviction")}>Conv. <SortArrow col="conviction" /></th>
              <th className="pb-2 pr-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("symbol")} aria-sort={picksAriaSort("symbol")}>Symbol <SortArrow col="symbol" /></th>
              <th className="pb-2 pr-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("category")} aria-sort={picksAriaSort("category")}>Category <SortArrow col="category" /></th>
              <th className="pb-2 pr-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("phase")} aria-sort={picksAriaSort("phase")}>Phase <SortArrow col="phase" /></th>
              <th className="pb-2 pr-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => handleSort("rsAccel")} aria-sort={picksAriaSort("rsAccel")}>RS Accel <SortArrow col="rsAccel" /></th>
              <th className="pb-2 pr-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => handleSort("volRatio")} aria-sort={picksAriaSort("volRatio")}>Vol Ratio <SortArrow col="volRatio" /></th>
              <th className="pb-2 pr-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => handleSort("price")} aria-sort={picksAriaSort("price")}>Price <SortArrow col="price" /></th>
              <th className="pb-2 font-medium text-right cursor-pointer hover:text-white" onClick={() => handleSort("pctFrom50ma")} aria-sort={picksAriaSort("pctFrom50ma")}>% from 50MA <SortArrow col="pctFrom50ma" /></th>
            </tr>
          </thead>
          <tbody>
            {stocksBySector.map((group) => {
              const isExpanded = expandedSectors.has(group.etf) || expandedSectors.size === 0;
              return (
                <Fragment key={group.etf}>
                  <tr
                    onClick={() => toggleSector(group.etf)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSector(group.etf); } }}
                    tabIndex={0}
                    className="cursor-pointer border-b border-[#1a1a1a] bg-[#0f0f0f] hover:bg-[#1a1a1a]"
                  >
                    <td colSpan={COL_COUNT} className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-3 w-3 text-[#888]" /> : <ChevronUp className="h-3 w-3 text-[#888] rotate-90" />}
                        <span className="font-mono text-xs font-semibold text-white">{group.etf}</span>
                        <span className="text-xs text-[#888]">{group.sector}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${quadrantColor(group.quadrant)}`}>{group.quadrant}</span>
                        <span className="text-[10px] text-[#666]">{group.stocks.length} stocks</span>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && group.stocks.map((s) => {
                    const cs = CONVICTION_STYLE[s.conviction];
                    return (
                      <tr key={s.symbol} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]/50">
                        <td className="py-1.5 pr-3 pl-2">
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${cs.bg} ${cs.border} ${cs.text}`}>
                            {s.conviction}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">
                          <a href={`https://finance.yahoo.com/quote/${s.symbol}`} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-[#5ba3e6] hover:underline" title={s.institutionalPct != null ? `Inst. ownership: ${s.institutionalPct.toFixed(0)}% (quarterly filing data)` : undefined}>{s.symbol}</a>
                          <span className="ml-1.5 text-[10px] text-[#666]" title={s.shortName}>{s.shortName.length > 18 ? s.shortName.slice(0, 16) + "\u2026" : s.shortName}</span>
                        </td>
                        <td className={`py-1.5 pr-3 font-medium ${CATEGORY_STYLE[s.category] ?? "text-[#888]"}`}>{s.category}</td>
                        <td className="py-1.5 pr-3 text-[#888]">{s.phase.replace("P1_", "").replace("P2_", "").replace("P3_", "").replace("P4_", "")}</td>
                        <td className="py-1.5 pr-3 text-right">
                          <span className={s.rsAccel != null && s.rsAccel >= 3 ? "text-green-400 font-semibold" : s.rsAccel != null && s.rsAccel >= 0.5 ? "text-green-400/70" : s.rsAccel != null && s.rsAccel < -0.5 ? "text-red-400" : "text-[#888]"}>
                            {s.rsAccel != null ? s.rsAccel.toFixed(1) : "\u2014"}
                          </span>
                          <span className="ml-1 text-[10px] text-[#555]">{s.rsAccelDesc}</span>
                        </td>
                        <td className={`py-1.5 pr-3 text-right ${s.volRatio >= 1.2 ? "text-cyan-400" : "text-[#888]"}`}>
                          {s.volRatio.toFixed(1)}x
                        </td>
                        <td className="py-1.5 pr-3 text-right text-white">${s.price.toFixed(2)}</td>
                        <td className={`py-1.5 text-right ${s.pctFrom50ma != null && s.pctFrom50ma > 0 ? "text-green-400" : s.pctFrom50ma != null && s.pctFrom50ma < 0 ? "text-red-400" : "text-[#888]"}`}>
                          {s.pctFrom50ma != null ? `${s.pctFrom50ma > 0 ? "+" : ""}${s.pctFrom50ma.toFixed(1)}%` : "\u2014"}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </CollapsiblePanel>
  );
}

// ── Extended Stocks Watch Panel ──

export function PullbackWatchPanel({ stocks, collapsed, onToggle }: { stocks: PullbackWatchStock[]; collapsed?: boolean; onToggle?: (id: string) => void }) {
  const [sectorFilter, setSectorFilter] = usePersistedFilter<string>("ew-filter:pullback:sector", "ALL");
  const [tierFilter, setTierFilter] = usePersistedFilter<PullbackTier | "ALL">("ew-filter:pullback:tier", "ALL");
  const [sortKey, setSortKey] = useState<PullbackSortKey>("tier");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sectorNames = useMemo(() => {
    const s = new Set(stocks.map((st) => st.sector));
    return ["ALL", ...Array.from(s).sort()];
  }, [stocks]);

  const filtered = useMemo(() => {
    let list = stocks;
    if (sectorFilter !== "ALL") list = list.filter((s) => s.sector === sectorFilter);
    if (tierFilter !== "ALL") list = list.filter((s) => s.tier === tierFilter);

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "tier": cmp = TIER_ORDER[a.tier] - TIER_ORDER[b.tier]; break;
        case "symbol": cmp = a.symbol.localeCompare(b.symbol); break;
        case "sector": cmp = a.sector.localeCompare(b.sector); break;
        case "price": cmp = a.price - b.price; break;
        case "pctFrom200ma": cmp = a.pctFrom200ma - b.pctFrom200ma; break;
        case "distanceTo80Pct": cmp = a.distanceTo80Pct - b.distanceTo80Pct; break;
        case "pctFrom50ma": cmp = a.pctFrom50ma - b.pctFrom50ma; break;
        case "volRatio": cmp = a.volRatio - b.volRatio; break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return sorted;
  }, [stocks, sectorFilter, tierFilter, sortKey, sortDir]);

  const handleSort = (key: PullbackSortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "symbol" || key === "sector" ? "asc" : "asc"); }
  };

  const SortArrow = ({ col }: { col: PullbackSortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "desc" ? <ChevronDown className="inline h-3 w-3" /> : <ChevronUp className="inline h-3 w-3" />;
  };

  const ariaSort = (col: PullbackSortKey): "ascending" | "descending" | "none" =>
    sortKey === col ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  const moderateCount = stocks.filter((s) => s.tier === "MODERATE_EXTENSION").length;
  const highCount = stocks.filter((s) => s.tier === "HIGH_EXTENSION").length;
  const extremeCount = stocks.filter((s) => s.tier === "EXTREME_EXTENSION").length;

  const badge = (
    <div className="flex items-center gap-2">
      {moderateCount > 0 && <span className="rounded-full bg-green-500/10 border border-green-500/30 px-2 py-0.5 text-[10px] text-green-400">{moderateCount} Moderate</span>}
      {highCount > 0 && <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-400">{highCount} High</span>}
      {extremeCount > 0 && <span className="rounded-full bg-[#1a1a1a] border border-[#333] px-2 py-0.5 text-[10px] text-[#555]">{extremeCount} Extreme</span>}
    </div>
  );

  const hasFilters = sectorFilter !== "ALL" || tierFilter !== "ALL";
  const resetFilters = () => {
    clearPersistedFilters("ew-filter:pullback");
    setSectorFilter("ALL");
    setTierFilter("ALL");
  };

  const selectClass = "rounded border border-[#333] bg-[#1a1a1a] px-1.5 py-0.5 text-xs text-[#a0a0a0]";

  return (
    <CollapsiblePanel id="pullback-watch" title="Extended Stocks Watch" collapsed={collapsed ?? false} onToggle={onToggle ?? (() => {})} badge={badge}>
      <div className="px-1 pb-2">
        <p className="text-[10px] text-[#555] mb-2">Strong stocks rejected only for being &gt;80% above 200-SMA. Tracking by extension severity.</p>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} className={selectClass}>
            {sectorNames.map((s) => <option key={s} value={s}>{s === "ALL" ? "All Sectors" : s}</option>)}
          </select>
          <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value as PullbackTier | "ALL")} className={selectClass}>
            <option value="ALL">All Tiers</option>
            <option value="MODERATE_EXTENSION">Moderate Extension</option>
            <option value="HIGH_EXTENSION">High Extension</option>
            <option value="EXTREME_EXTENSION">Extreme Extension</option>
          </select>
          <span className="text-[10px] text-[#666]">{filtered.length} / {stocks.length}</span>
          {hasFilters && (
            <button onClick={resetFilters} className="rounded border border-[#333] bg-[#1a1a1a] px-1.5 py-0.5 text-[10px] text-[#888] hover:text-white">Reset</button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#2a2a2a] text-left text-[#666]">
              <th className="pb-2 pr-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("tier")} aria-sort={ariaSort("tier")}>Tier <SortArrow col="tier" /></th>
              <th className="pb-2 pr-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("symbol")} aria-sort={ariaSort("symbol")}>Ticker <SortArrow col="symbol" /></th>
              <th className="pb-2 pr-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("sector")} aria-sort={ariaSort("sector")}>Sector <SortArrow col="sector" /></th>
              <th className="pb-2 pr-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => handleSort("price")} aria-sort={ariaSort("price")}>Price <SortArrow col="price" /></th>
              <th className="pb-2 pr-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => handleSort("pctFrom200ma")} aria-sort={ariaSort("pctFrom200ma")}>Extension % <SortArrow col="pctFrom200ma" /></th>
              <th className="pb-2 pr-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => handleSort("distanceTo80Pct")} aria-sort={ariaSort("distanceTo80Pct")}>Dist to 80% <SortArrow col="distanceTo80Pct" /></th>
              <th className="pb-2 pr-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => handleSort("pctFrom50ma")} aria-sort={ariaSort("pctFrom50ma")}>% from 50MA <SortArrow col="pctFrom50ma" /></th>
              <th className="pb-2 font-medium text-right cursor-pointer hover:text-white" onClick={() => handleSort("volRatio")} aria-sort={ariaSort("volRatio")}>Vol Ratio <SortArrow col="volRatio" /></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const ts = TIER_STYLE[s.tier];
              return (
                <tr key={s.symbol} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]/50">
                  <td className="py-1.5 pr-3 pl-2">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${ts.bg} ${ts.border} ${ts.text}`}>
                      {ts.label}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <a href={`https://finance.yahoo.com/quote/${s.symbol}`} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-[#5ba3e6] hover:underline">{s.symbol}</a>
                    <span className="ml-1.5 text-[10px] text-[#666]" title={s.shortName}>{s.shortName.length > 18 ? s.shortName.slice(0, 16) + "\u2026" : s.shortName}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-[#888]">{s.sector}</td>
                  <td className="py-1.5 pr-3 text-right text-white">${s.price.toFixed(2)}</td>
                  <td className="py-1.5 pr-3 text-right">
                    <span className={s.pctFrom200ma <= 100 ? "text-green-400" : s.pctFrom200ma <= 150 ? "text-amber-400" : "text-[#555]"}>
                      +{s.pctFrom200ma.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <span className={s.distanceTo80Pct <= 10 ? "text-green-400" : s.distanceTo80Pct <= 30 ? "text-amber-400" : "text-[#555]"}>
                      +{s.distanceTo80Pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className={`py-1.5 pr-3 text-right ${s.pctFrom50ma <= 5 ? "text-green-400" : s.pctFrom50ma <= 15 ? "text-amber-400" : "text-[#555]"}`}>
                    {s.pctFrom50ma >= 0 ? "+" : ""}{s.pctFrom50ma.toFixed(1)}%
                  </td>
                  <td className={`py-1.5 text-right ${s.volRatio >= 1.2 ? "text-cyan-400" : "text-[#888]"}`}>
                    {s.volRatio.toFixed(1)}x
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CollapsiblePanel>
  );
}

// ── Sub-Sector Leading Indicators Panel ──

export function SubSectorPanel({ scores, collapsed, onToggle }: { scores: SectorRotationScore[]; collapsed?: boolean; onToggle?: (id: string) => void }) {
  if (scores.length === 0) return null;

  return (
    <CollapsiblePanel id="sub-sectors" title="Leading Indicators (Sub-Sectors)" collapsed={collapsed ?? false} onToggle={onToggle ?? (() => {})}>
      <p className="text-[10px] text-[#555] mb-3 px-1">KRE (credit cycle), XHB (housing), XRT (consumer), IYT (transport) — early signals before GICS sectors move.</p>
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

// ── Data Staleness Warning ──

export function DataStalenessWarning({ calculatedAt }: { calculatedAt: string }) {
  const ageMinutes = Math.round((Date.now() - new Date(calculatedAt).getTime()) / 60000);
  if (ageMinutes <= 20) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-400">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>Data is {ageMinutes}min old. Refresh for latest signals.</span>
    </div>
  );
}

// ── Rotation Entry Signals Panel ──

interface EntrySignalSector {
  rotation: ActiveRotationDetail;
  signal: ActionSignal;
  lifecycle: LifecycleStage;
  conviction: ConvictionResult;
  regimeAlignment: "aligned" | "headwind" | "neutral";
  health: { acceleration: number; cmf20: number; quadrant: RRGQuadrant };
  patternStats: RotationPatternStats | undefined;
  topStocks: EnrichedStock[];
}

export function RotationEntrySignals({
  rotationData,
  enrichedStocks,
  sectors,
  collapsed,
  onToggle,
}: {
  rotationData: RotationTrackerResult;
  enrichedStocks: EnrichedStock[];
  sectors: SectorRotationScore[];
  collapsed: boolean;
  onToggle: (id: string) => void;
}) {
  const entries = useMemo(() => {
    const results: EntrySignalSector[] = [];
    const regime = rotationData.regime;

    for (const rotation of rotationData.activeRotations) {
      const event = rotation.event;
      const health = getHealth(event);
      const lifecycle = computeLifecycleStage(event);
      const conviction = computeConviction(event);
      const alignment = regime ? isRegimeAligned(event.sectorName, regime) : "neutral";
      const signal = computeActionSignal(lifecycle, conviction, alignment);

      if (signal.action !== "ENTER" && signal.action !== "ADD ON PULLBACK") continue;
      if (health.cmf20 <= 0) continue;
      if (health.acceleration <= 0) continue;

      const sectorStocks = enrichedStocks.filter((s) => s.sectorEtf === event.etf);
      const qualityStocks = sectorStocks.filter(
        (s) => (s.conviction === "HIGH" || s.conviction === "MEDIUM") && (s.category === "LEADER" || s.category === "TURNAROUND")
      );

      const hasQualityStock = sectorStocks.some(
        (s) => (s.conviction === "HIGH" || s.conviction === "MEDIUM") && (s.category === "LEADER" || s.category === "TURNAROUND")
      );
      if (!hasQualityStock) continue;

      const CONVICTION_SORT: Record<string, number> = { HIGH: 0, MEDIUM: 1, WATCH: 2 };
      const topStocks = [...qualityStocks]
        .sort((a, b) => (CONVICTION_SORT[a.conviction] ?? 9) - (CONVICTION_SORT[b.conviction] ?? 9) || (b.rsAccel ?? 0) - (a.rsAccel ?? 0))
        .slice(0, 3);

      const stats = rotationData.patternStats.find((p) => p.etf === event.etf);

      results.push({
        rotation,
        signal,
        lifecycle,
        conviction,
        regimeAlignment: alignment,
        health,
        patternStats: stats,
        topStocks,
      });
    }

    results.sort((a, b) => (a.signal.action === "ENTER" ? 0 : 1) - (b.signal.action === "ENTER" ? 0 : 1));
    return results;
  }, [rotationData, enrichedStocks]);

  const hasEnter = entries.some((e) => e.signal.action === "ENTER");
  const borderColor = entries.length > 0
    ? hasEnter ? "border-green-500/30" : "border-cyan-500/30"
    : "";

  return (
    <CollapsiblePanel
      id="entry-signals"
      title="Entry Signals"
      collapsed={collapsed}
      onToggle={onToggle}
      badge={
        entries.length === 0
          ? <span className="rounded-full border border-[#333] bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-medium text-[#666]">No signals</span>
          : <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${hasEnter ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"}`}>
          {entries.length} {entries.length === 1 ? "signal" : "signals"}
        </span>
      }
      className={borderColor}
    >
      <div className="space-y-3">
        {entries.length === 0 && (
          <div className="space-y-1">
            <p className="text-xs text-[#666]">No active rotations currently pass all entry gates (action signal + CMF + acceleration + stock quality). Check the <a href="/rotation" className="text-[#5ba3e6] hover:underline">Rotation Tracker</a> for current rotation status.</p>
            {rotationData.activeRotations.length > 0 && (
              <div className="text-[11px] text-[#555] space-y-0.5">
                <p>{rotationData.activeRotations.length} active rotation{rotationData.activeRotations.length !== 1 ? "s" : ""} blocked:</p>
                {rotationData.activeRotations.map((r) => {
                  const ev = r.event;
                  const h = getHealth(ev);
                  const lc = computeLifecycleStage(ev);
                  const conv = computeConviction(ev);
                  const regime = rotationData.regime;
                  const alignment = regime ? isRegimeAligned(ev.sectorName, regime) : "neutral";
                  const sig = computeActionSignal(lc, conv, alignment);
                  const blocks: string[] = [];
                  if (sig.action !== "ENTER" && sig.action !== "ADD ON PULLBACK") blocks.push(`action=${sig.action ?? "none"}`);
                  if (h.cmf20 <= 0) blocks.push(`CMF ${h.cmf20.toFixed(3)}`);
                  if (h.acceleration <= 0) blocks.push(`accel ${h.acceleration.toFixed(2)}`);
                  const sectorStocks = enrichedStocks.filter((s) => s.sectorEtf === ev.etf);
                  const hasQuality = sectorStocks.some(
                    (s) => (s.conviction === "HIGH" || s.conviction === "MEDIUM") && (s.category === "LEADER" || s.category === "TURNAROUND")
                  );
                  if (!hasQuality) blocks.push("no quality stocks");
                  return (
                    <p key={ev.etf}><span className="text-[#888]">{ev.sectorName}</span> — {blocks.join(", ")}</p>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {entries.map((entry) => {
          const { rotation, signal, lifecycle, conviction, regimeAlignment, health, patternStats, topStocks } = entry;
          const event = rotation.event;
          const sectorScore = sectors.find((s) => s.sector === event.sectorName);

          return (
            <div
              key={event.etf}
              className={`rounded-lg border ${signal.borderColor} ${signal.bgColor} p-3`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">{event.sectorName}</span>
                <span className="text-xs text-[#666]">{event.etf}</span>
                {sectorScore && (
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${quadrantColor(sectorScore.quadrant)}`}>
                    {sectorScore.quadrant}
                  </span>
                )}
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${signal.borderColor} ${signal.bgColor} ${signal.color}`}>
                  {signal.action === "ENTER" ? <><ArrowUpCircle className="mr-1 inline h-3 w-3" />ENTER</> : <><Plus className="mr-1 inline h-3 w-3" />ADD ON PULLBACK</>}
                </span>
                {regimeAlignment === "aligned" && (
                  <span className="rounded-full border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400">Regime Aligned</span>
                )}
              </div>

              <p className="mb-2 text-xs text-[#a0a0a0]">{signal.description}</p>

              <div className="mb-2 flex flex-wrap gap-3 text-xs">
                <span className="text-[#666]">Stage: <span className="text-white">{lifecycle}</span></span>
                <span className="text-[#666]">Day {event.daysActive}{patternStats ? ` / avg ${Math.round(patternStats.avgDurationDays)}d` : ""}</span>
                <span className="text-[#666]">Accel: <span className={health.acceleration > 0 ? "text-green-400" : "text-red-400"}>{health.acceleration > 0 ? "+" : ""}{health.acceleration.toFixed(2)}</span></span>
                <span className="text-[#666]">CMF: <span className={health.cmf20 > 0 ? "text-green-400" : "text-red-400"}>{health.cmf20 > 0 ? "+" : ""}{health.cmf20.toFixed(2)}</span></span>
                <span className="text-[#666]">Conviction: <span className={conviction.level === "HIGH" ? "text-green-400" : conviction.level === "MODERATE" ? "text-cyan-400" : "text-amber-400"}>{conviction.level}</span> ({conviction.score})</span>
              </div>

              <div className="mb-2 flex flex-wrap gap-2 text-[10px]">
                {[
                  { label: `CMF ${health.cmf20 > 0 ? "+" : ""}${health.cmf20.toFixed(2)}`, strong: health.cmf20 > 0.1 },
                  { label: `Accel ${health.acceleration > 0 ? "+" : ""}${health.acceleration.toFixed(2)}`, strong: health.acceleration > 1 },
                  { label: `${conviction.level} Conviction`, strong: conviction.level === "HIGH" },
                  { label: regimeAlignment === "aligned" ? "Regime Aligned" : "Regime Neutral", strong: regimeAlignment === "aligned" },
                ].map((indicator) => (
                  <span key={indicator.label} className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 ${indicator.strong ? "bg-green-500/10 text-green-400" : "bg-[#2a2a2a] text-[#888]"}`}>
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {indicator.label}
                  </span>
                ))}
              </div>

              {topStocks.length > 0 && (
                <div className="rounded-md border border-[#2a2a2a] bg-[#0d0d0d] p-2">
                  <div className="mb-1 text-[10px] font-medium text-[#666] uppercase tracking-wide">Top Picks</div>
                  <div className="space-y-1">
                    {topStocks.map((stock) => (
                      <div key={stock.symbol} className="flex items-center gap-2 text-xs">
                        <a
                          href={`https://finance.yahoo.com/quote/${stock.symbol}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[#5ba3e6] hover:underline"
                        >
                          {stock.symbol}
                        </a>
                        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${stock.conviction === "HIGH" ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"}`}>
                          {stock.conviction}
                        </span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${stock.category === "LEADER" ? "bg-green-500/10 text-green-400" : "bg-purple-500/10 text-purple-400"}`}>
                          {stock.category === "CATCH_UP" ? "Catch-up" : stock.category === "TURNAROUND" ? "Turnaround" : stock.category.charAt(0) + stock.category.slice(1).toLowerCase()}
                        </span>
                        {stock.rsAccel != null && (
                          <span className={`text-[10px] ${stock.rsAccel > 0 ? "text-green-400" : "text-red-400"}`}>
                            RS {stock.rsAccel > 0 ? "+" : ""}{stock.rsAccel.toFixed(1)}
                          </span>
                        )}
                        {stock.institutionalPct != null && (
                          <span className="text-[10px] text-[#666]">Inst {stock.institutionalPct.toFixed(0)}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CollapsiblePanel>
  );
}
