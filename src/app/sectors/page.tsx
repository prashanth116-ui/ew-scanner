"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Loader2, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Clock, FileDown, Search, X, ExternalLink, Bell, BellOff, Zap } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { usePersistedFilter, clearPersistedFilters } from "@/lib/use-filter-persistence";
import Link from "next/link";
import type {
  SectorRotationResult,
  SectorRotationScore,
  RRGQuadrant,
  EnrichedStock,
  ConvictionLevel,
} from "@/lib/sector-rotation/types";
import type { PreRunResult } from "@/lib/prerun/types";
import type { RotationTrackerResult } from "@/lib/sector-rotation/rotation-types";
import {
  loadSectorRotation,
  saveSectorRotation,
} from "@/lib/sector-rotation/storage";
import {
  saveSnapshot,
  loadHistory,
  getSnapshot,
} from "@/lib/sector-rotation/history";
import type { DailySnapshot, SectorSnapshot } from "@/lib/sector-rotation/history";
import { loadScanResultsWithDate } from "@/lib/prerun/storage";
import { SECTOR_UNIVERSE } from "@/data/sector-universe";
import { ScannerCTA } from "@/components/scanner-cta";
import { compositeColor, compositeTextColor } from "@/lib/color-utils";
import { useDebounce } from "@/lib/use-debounce";
import { exportSectorsToExcel } from "@/lib/sector-rotation/export";

// ── Collapsible Panel ──

const COLLAPSED_KEY = "ew-sectors-collapsed-v1";

function useCollapsedPanels(): [Set<string>, (id: string) => void] {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return [collapsed, toggle];
}

function CollapsiblePanel({
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

function quadrantColor(q: RRGQuadrant): string {
  switch (q) {
    case "LEADING": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "WEAKENING": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "LAGGING": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "IMPROVING": return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
  }
}

function quadrantDotColor(q: RRGQuadrant): string {
  switch (q) {
    case "LEADING": return "#4ade80";
    case "WEAKENING": return "#fbbf24";
    case "LAGGING": return "#f87171";
    case "IMPROVING": return "#22d3ee";
  }
}

// ── Data freshness helpers ──

function timeAgo(isoDate: string): { text: string; stale: boolean; veryStale: boolean } {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let text: string;
  if (mins < 1) text = "just now";
  else if (mins < 60) text = `${mins}m ago`;
  else if (hours < 24) text = `${hours}h ago`;
  else text = `${days}d ago`;

  return { text, stale: hours >= 6, veryStale: hours >= 24 };
}

function DataAgeBadge({ calculatedAt }: { calculatedAt: string }) {
  const [age, setAge] = useState(() => timeAgo(calculatedAt));

  useEffect(() => {
    setAge(timeAgo(calculatedAt));
    const interval = setInterval(() => setAge(timeAgo(calculatedAt)), 60_000);
    return () => clearInterval(interval);
  }, [calculatedAt]);

  if (age.veryStale) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
        <AlertTriangle className="h-3 w-3" />
        {age.text} — data is stale
      </span>
    );
  }
  if (age.stale) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
        <Clock className="h-3 w-3" />
        {age.text}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[#888]">
      <Clock className="h-3 w-3" />
      {age.text}
    </span>
  );
}

// ── Trading action helpers ──

type TradingAction = "TRADE" | "BUILD" | "WATCH" | "TRIM" | "AVOID";

function getTradingAction(s: SectorRotationScore): TradingAction {
  if (s.quadrant === "LEADING" && s.compositeScore >= 60 && s.acceleration > 0) return "TRADE";
  if (s.quadrant === "IMPROVING" && s.acceleration > 0) return "BUILD";
  if (s.quadrant === "LEADING" && s.compositeScore >= 60) return "TRADE";
  if (s.quadrant === "LEADING") return "WATCH";
  if (s.quadrant === "WEAKENING") return "TRIM";
  if (s.quadrant === "IMPROVING") return "WATCH";
  if (s.quadrant === "LAGGING" && s.acceleration > 0 && s.compositeScore >= 40) return "WATCH";
  return "AVOID";
}

function actionBadge(action: TradingAction): { label: string; className: string } {
  switch (action) {
    case "TRADE": return { label: "TRADE", className: "bg-green-500/15 text-green-400 border-green-500/30" };
    case "BUILD": return { label: "BUILD", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
    case "WATCH": return { label: "WATCH", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    case "TRIM": return { label: "TRIM", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" };
    case "AVOID": return { label: "AVOID", className: "bg-red-500/15 text-red-400 border-red-500/30" };
  }
}

// ── Stock ranking helpers ──

interface StockInSector {
  ticker: string;
  companyName: string;
  rs20d: number | null;
  rsAccel: number | null;
  sectorRS: number | null; // relative strength accel vs sector ETF (from rotation tracker)
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
}

// ── Phase-based stock grouping ──

type StockPhase = "basing" | "turnaround" | "trending" | "exhausting" | "neutral";

function getStockPhase(s: StockInSector): StockPhase {
  const rsAccel = s.rsAccel ?? 0;
  const rs20d = s.rs20d ?? 0;

  // Phase 4 first — deeply negative accel overrides everything
  if (rsAccel < -2) return "exhausting";
  // Phase 2 — turnaround (existing logic)
  if (s.aboveSma50 === false && rs20d > 0 && rsAccel > 0 && (s.volumeVsAvg ?? 0) >= 1.2) return "turnaround";
  // Phase 1 — basing (below 50MA, accel turning positive but RS still negative)
  if (s.aboveSma50 === false && rsAccel > 0 && rs20d <= 0) return "basing";
  // Phase 3 — trending (above 50MA with positive momentum)
  if (s.aboveSma50 === true && rsAccel > 0) return "trending";
  // Everything else
  return "neutral";
}

function phaseBadge(phase: StockPhase): { label: string; className: string; description: string } {
  switch (phase) {
    case "basing": return { label: "P1 Basing", className: "bg-purple-500/15 text-purple-400 border-purple-500/30", description: "Below 50MA, momentum turning — watch for confirmation" };
    case "turnaround": return { label: "P2 Turnaround", className: "bg-amber-500/15 text-amber-400 border-amber-500/30", description: "Below 50MA, RS positive + volume — entry zone" };
    case "trending": return { label: "P3 Trending", className: "bg-green-500/15 text-green-400 border-green-500/30", description: "Above 50MA, accelerating — hold or add on dips" };
    case "exhausting": return { label: "P4 Exhausting", className: "bg-red-500/15 text-red-400 border-red-500/30", description: "Momentum fading (Trend Accel < -2) — take profit" };
    case "neutral": return { label: "Neutral", className: "bg-[#333]/50 text-[#666] border-[#333]", description: "Mixed or insufficient signals" };
  }
}

const PHASE_RANK: Record<StockPhase, number> = { basing: 0, turnaround: 1, trending: 2, exhausting: 3, neutral: 4 };

function getEntryQuality(s: StockInSector): number {
  let quality = 0;
  if ((s.rsAccel ?? 0) > 1) quality++;
  if ((s.volumeVsAvg ?? 0) >= 1.5) quality++;
  if (s.rsImproving && s.volumeConsistency >= 3) quality++;
  return quality;
}

function rsColor(rs: number | null): string {
  if (rs === null) return "text-[#666]";
  if (rs > 5) return "text-green-400";
  if (rs > 0) return "text-green-400/70";
  if (rs > -5) return "text-red-400/70";
  return "text-red-400";
}

function rsAccelColor(val: number | null): string {
  if (val === null) return "text-[#666]";
  if (val > 2) return "text-green-400";
  if (val > 0) return "text-green-400/70";
  if (val > -2) return "text-red-400/70";
  return "text-red-400";
}

// ── ETF Return Sparkline (#5) ──

function EtfSparkline({ returns }: { returns: number[] | undefined }) {
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

// ── Sector Stock Table (Enhanced #2: RS Accel, #8: export, #14: mobile) ──

type StockSortKey = "ticker" | "rs20d" | "rsAccel" | "sectorRS" | "finalScore" | "volumeVsAvg" | "aboveSma50" | "verdict" | "phase" | "earnings";
type SmaFilter = "all" | "above" | "below";
type VolFilter = "all" | "above" | "below";
type VerdictFilter = "all" | "priority" | "keep" | "watch";
type RsAccelFilter = "all" | "positive" | "negative";
type PhaseFilter = "all" | "basing" | "turnaround" | "trending" | "exhausting";

const VERDICT_RANK: Record<string, number> = { "PRIORITY BUY": 0, KEEP: 1, WATCH: 2, DISCARD: 3, "": 4 };

function SectorStockTable({ stocks, sectorName, hasRotationData = false }: { stocks: StockInSector[]; sectorName?: string; hasRotationData?: boolean }) {
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

  // #8: Export to CSV
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

  // Phase counts for summary bar
  const phaseCounts = useMemo(() => {
    const counts: Record<StockPhase, number> = { basing: 0, turnaround: 0, trending: 0, exhausting: 0, neutral: 0 };
    for (const s of stocks) counts[getStockPhase(s)]++;
    return counts;
  }, [stocks]);

  return (
    <div>
      {/* Phase summary bar */}
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

      {/* Filter bar */}
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
          Sector RS
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
          Quality
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
        {/* #8: Copy + Export */}
        <div className="flex items-center gap-1 ml-auto">
          <CopyButton tickers={sorted.map((s) => s.ticker)} className="flex items-center gap-1 text-[#666] hover:text-white transition-colors" />
          <button onClick={exportCsv} className="flex items-center gap-1 text-[#666] hover:text-white transition-colors" title="Export to CSV">
            <FileDown className="h-3 w-3" />
          </button>
          <span className="text-[#555] ml-1">
            {filtered.length === stocks.length ? `${stocks.length} stocks` : `${filtered.length} of ${stocks.length}`}
          </span>
        </div>
      </div>

      {/* #14: Desktop table + mobile cards */}
      {/* Desktop table */}
      <div className="overflow-x-auto hidden sm:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#666] border-b border-[#2a2a2a]">
              <th className="text-left py-1.5 pr-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("ticker")}>Ticker{sortArrow("ticker")}</th>
              <th className="text-left py-1.5 pr-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("phase")}>Phase{sortArrow("phase")}</th>
              <th className="text-left py-1.5 pr-2 font-medium hidden md:table-cell">Company</th>
              <th className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("rs20d")}>RS 20d{sortArrow("rs20d")}</th>
              <th className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("rsAccel")} title="Short-term trend vs long-term trend (% from 50MA minus % from 200MA). Positive = accelerating uptrend.">Trend Accel{sortArrow("rsAccel")}</th>
              <th className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("sectorRS")} title="Sector RS: relative strength acceleration vs sector ETF. (stock 5d - ETF 5d) - (stock 20d - ETF 20d). Positive = catching up vs sector recently.">Sector RS{sortArrow("sectorRS")}</th>
              <th className="text-center py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("aboveSma50")}>&gt;50MA{sortArrow("aboveSma50")}</th>
              <th className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("volumeVsAvg")}>Vol vs Avg{sortArrow("volumeVsAvg")}</th>
              <th className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("finalScore")}>Score{sortArrow("finalScore")}</th>
              <th className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("earnings")}>Earnings{sortArrow("earnings")}</th>
              <th className="text-left py-1.5 pl-2 font-medium cursor-pointer hover:text-[#a0a0a0]" onClick={() => handleSort("verdict")}>Verdict{sortArrow("verdict")}</th>
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
                    <a href={`https://finance.yahoo.com/quote/${encodeURIComponent(s.ticker)}/`} target="_blank" rel="noopener noreferrer" className="font-medium text-white hover:text-[#5ba3e6] transition-colors">{s.ticker}</a>
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
                      <span className="inline-block h-2 w-2 rounded-full bg-green-400" title="Above 50d SMA" />
                    ) : s.aboveSma50 === false ? (
                      <span className="inline-block h-2 w-2 rounded-full bg-red-400" title="Below 50d SMA" />
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

      {/* #14: Mobile card layout */}
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

function FilterRecipes() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="mb-3 flex w-full items-center gap-2 text-lg font-semibold text-white text-left"
      >
        {open ? <ChevronUp className="h-5 w-5 text-[#5ba3e6]" /> : <ChevronDown className="h-5 w-5 text-[#5ba3e6]" />}
        Filter Recipes
        <span className="text-xs font-normal text-[#666]">Using all 3 RS metrics together</span>
      </button>
      {open && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-5 space-y-5">
          {/* 3 Metrics Reference */}
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

          {/* Recipes */}
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

          {/* SNOW Pattern */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <h3 className="text-sm font-semibold text-amber-400 mb-2">The SNOW Pattern: Catch-Up Catalyst</h3>
            <p className="text-xs text-[#a0a0a0] leading-relaxed">
              Before earnings, SNOW had Trend Accel <span className="text-green-400 font-mono">+27.98</span> (powerful own momentum) but Sector RS <span className="text-red-400 font-mono">&minus;11.3</span> (lagging sector ETF recently).
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

// ── #4: Regime Banner ──

function RegimeBanner({ regime }: { regime: SectorRotationResult["regime"] }) {
  if (!regime) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-4">
        <div className="flex items-center gap-2 text-sm text-[#666]">
          <AlertTriangle className="h-4 w-4 text-[#555]" />
          Macro regime data unavailable &mdash; VIX, yield, and DXY signals are not loading
        </div>
      </div>
    );
  }
  const regimeColor = regime.regime === "RISK_ON" ? "text-green-400" : regime.regime === "RISK_OFF" ? "text-red-400" : regime.regime === "INFLATIONARY" ? "text-amber-400" : "text-[#888]";
  const borderColor = regime.regime === "RISK_ON" ? "border-green-500/30" : regime.regime === "RISK_OFF" ? "border-red-500/30" : regime.regime === "INFLATIONARY" ? "border-amber-500/30" : "border-[#333]";

  return (
    <div className={`rounded-lg border ${borderColor} bg-[#1a1a1a] p-4`}>
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

// ── #3: Pre-Rotation Watchlist ──

function PreRotationWatchlist({ sectors }: { sectors: SectorRotationScore[] }) {
  const candidates = sectors.filter(
    (s) => s.quadrant === "LAGGING" && s.acceleration > 0 && s.cmf20 > 0
  );
  // Also include LAGGING with acceleration inflection (even if CMF not yet positive)
  const nearCandidates = sectors.filter(
    (s) => s.quadrant === "LAGGING" && s.acceleration > 0 && s.cmf20 <= 0 && !candidates.includes(s)
  );
  if (candidates.length === 0 && nearCandidates.length === 0) return null;

  return (
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
      <h2 className="mb-2 text-base font-semibold text-white flex items-center gap-2">
        <Zap className="h-4 w-4 text-purple-400" />
        Rotation Watchlist
      </h2>
      <p className="text-xs text-[#888] mb-3">LAGGING sectors with positive acceleration — textbook LAGGING-to-IMPROVING rotation entries</p>
      <div className="space-y-2">
        {candidates.map((s) => (
          <div key={s.sector} className="flex items-center justify-between rounded-lg border border-purple-500/20 bg-[#1a1a1a] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
              <span className="font-medium text-white">{s.sector}</span>
              <span className="text-xs text-[#666]">{s.etf}</span>
              <Link href={`/rotation?sector=${encodeURIComponent(s.sector)}`} className="text-[10px] text-purple-400 hover:text-purple-300">
                <ExternalLink className="h-3 w-3 inline" />
              </Link>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-400">Accel: +{s.acceleration.toFixed(2)}</span>
              <span className="text-green-400/70">CMF: +{s.cmf20.toFixed(3)}</span>
              <span className="text-[#888]">{s.compositeScore}/100</span>
            </div>
          </div>
        ))}
        {nearCandidates.map((s) => (
          <div key={s.sector} className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#555]" />
              <span className="font-medium text-[#a0a0a0]">{s.sector}</span>
              <span className="text-xs text-[#666]">{s.etf}</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-400/70">Accel: +{s.acceleration.toFixed(2)}</span>
              <span className="text-red-400/70">CMF: {s.cmf20.toFixed(3)}</span>
              <span className="text-[#555]">Waiting for flow</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── #9: Sector Correlation Matrix ──

function CorrelationMatrix({ correlationMatrix, sectors, collapsed, onToggle }: { correlationMatrix?: Record<string, number>; sectors: SectorRotationScore[]; collapsed?: boolean; onToggle?: (id: string) => void }) {
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

// ── #12: Breadth Thrust Indicator ──

function BreadthThrustBanner({ sectors }: { sectors: SectorRotationScore[] }) {
  // Check if any sector has breadth moving from <30% to >70%
  // Since we only have current breadth, check for sectors with very high breadth (>70%) that were likely low recently
  // The acceleration inflection + breadthPct > 70 is a proxy
  const thrustCandidates = sectors.filter(
    (s) => s.breadthPct !== null && s.breadthPct >= 70 && s.accelerationInflection
  );
  if (thrustCandidates.length === 0) return null;

  return (
    <div className="rounded-xl border border-green-500/40 bg-green-500/5 p-4">
      <h2 className="mb-2 text-sm font-semibold text-green-400 flex items-center gap-2">
        <Zap className="h-4 w-4" />
        Breadth Thrust Signal
      </h2>
      <p className="text-xs text-[#888] mb-2">Sectors with breadth &gt;70% and momentum inflection — historically one of the strongest bullish signals</p>
      <div className="flex flex-wrap gap-2">
        {thrustCandidates.map((s) => (
          <div key={s.sector} className="rounded-lg border border-green-500/20 bg-[#1a1a1a] px-3 py-1.5">
            <span className="font-medium text-white">{s.sector}</span>
            <span className="ml-2 text-xs text-green-400">{s.breadthPct}% breadth</span>
            <span className="ml-2 text-xs text-green-400/70">+accel</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── #11: Sector Comparison Mode ──

function SectorComparison({ sectors }: { sectors: SectorRotationScore[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-1.5 text-xs text-[#888] hover:text-white hover:border-[#444] transition-colors">
        Compare Sectors
      </button>
    );
  }

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
    { label: "RS-Momentum", key: "rsMomentum", format: (s) => s.rsMomentum.toFixed(4) },
  ];

  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-white">Compare Sectors</h2>
        <button onClick={() => { setOpen(false); setSelected([]); }} className="text-[#666] hover:text-white"><X className="h-4 w-4" /></button>
      </div>
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

// ── #10: Alert Configuration ──

interface SectorAlert {
  id: string;
  sectorEtf: string;
  condition: "enters_quadrant" | "acceleration_positive" | "cmf_positive";
  value?: string;
  enabled: boolean;
}

const ALERT_STORAGE_KEY = "ew-sector-alerts-v1";

function loadAlerts(): SectorAlert[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(ALERT_STORAGE_KEY) ?? "[]");
  } catch { return []; }
}

function saveAlerts(alerts: SectorAlert[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(alerts));
}

function AlertPanel({ sectors, data }: { sectors: SectorRotationScore[]; data: SectorRotationResult }) {
  const [alerts, setAlerts] = useState<SectorAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [triggeredAlerts, setTriggeredAlerts] = useState<string[]>([]);

  useEffect(() => { setAlerts(loadAlerts()); }, []);

  // Check alerts against current data
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
    const newAlert: SectorAlert = { id: Date.now().toString(), sectorEtf: etf, condition, value, enabled: true };
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
      {/* Triggered alerts banner */}
      {triggeredAlerts.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-amber-400">
            <Bell className="h-3.5 w-3.5" />
            <span className="font-medium">Alerts triggered:</span>
            {triggeredAlerts.map((t, i) => <span key={i} className="text-[#ccc]">{t}</span>)}
          </div>
        </div>
      )}

      {/* Alert config button */}
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white">
        <Bell className="h-4 w-4" />
        <span className="hidden sm:inline">Alerts{alerts.length > 0 ? ` (${alerts.length})` : ""}</span>
      </button>

      {/* Alert config panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div className="mx-4 w-full max-w-md rounded-xl border border-[#2a2a2a] bg-[#111] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Sector Alerts</h3>
              <button onClick={() => setOpen(false)} className="text-[#666] hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            {/* Existing alerts */}
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
                        <button onClick={() => toggleAlert(a.id)} className="text-[#666] hover:text-white">
                          {a.enabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                        </button>
                        <button onClick={() => removeAlert(a.id)} className="text-[#666] hover:text-red-400"><X className="h-3 w-3" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Add new alert */}
            <div className="border-t border-[#2a2a2a] pt-3">
              <p className="text-xs text-[#888] mb-2">Add alert</p>
              <div className="space-y-2">
                {sectors.slice(0, 6).map((s) => (
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

// ── #6: Global Stock Search ──

function StockSearch({ allStocks }: { allStocks: StockInSector[] }) {
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
          <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="text-[#666] hover:text-white">
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

// ── RRG SVG Chart ──

function RRGChart({ sectors }: { sectors: SectorRotationScore[] }) {
  const W = 500;
  const H = 400;
  const PAD = 50;

  const allRatios: number[] = [];
  const allMoms: number[] = [];
  for (const s of sectors) {
    allRatios.push(s.rsRatio);
    allMoms.push(s.rsMomentum);
    for (const pt of s.rrgTrail ?? []) {
      allRatios.push(pt.rsRatio);
      allMoms.push(pt.rsMomentum);
    }
  }
  const rMin = Math.min(99, ...allRatios) - 0.5;
  const rMax = Math.max(101, ...allRatios) + 0.5;
  const mMin = Math.min(-0.1, ...allMoms) - 0.02;
  const mMax = Math.max(0.1, ...allMoms) + 0.02;

  const scaleX = (v: number) => PAD + ((v - rMin) / (rMax - rMin)) * (W - 2 * PAD);
  const scaleY = (v: number) => H - PAD - ((v - mMin) / (mMax - mMin)) * (H - 2 * PAD);

  const cx = scaleX(100);
  const cy = scaleY(0);

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
    </svg>
  );
}

// ── Sector Detail Accordion (enhanced with #7 cross-linking, #5 sparkline) ──

function SectorDetail({ sector, stocks, prevSnapshot, etfReturns, hasRotationData = false }: { sector: SectorRotationScore; stocks: StockInSector[]; prevSnapshot?: SectorSnapshot | null; etfReturns?: number[]; hasRotationData?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border rounded-lg ${sector.stealthAccumulation ? "border-cyan-500/40" : "border-[#2a2a2a]"}`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#1a1a1a] transition-colors rounded-lg">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg">{sector.trendArrow}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-white truncate">{sector.sector}</span>
              <span className="text-xs text-[#666]">{sector.etf}</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${quadrantColor(sector.quadrant)}`}>{sector.quadrant}</span>
              {(() => { const action = getTradingAction(sector); const badge = actionBadge(action); return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>; })()}
              {sector.stealthAccumulation && <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-400">STEALTH</span>}
              {(sector.dataQuality ?? 100) < 100 && <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400" title={`Scoring factors: momentum, acceleration, Mansfield RS, CMF (always available), breadth, smart money. ${sector.dataQualityBreakdown ? `Missing: ${[!sector.dataQualityBreakdown.breadth && "breadth", !sector.dataQualityBreakdown.smartMoney && "smart money"].filter(Boolean).join(", ")}. ` : ""}Weights are redistributed across available factors.`}>{sector.dataQuality ?? 100}% data</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* #5: Sparkline */}
          <EtfSparkline returns={etfReturns} />
          {/* #7: Link to rotation tracker */}
          <Link href={`/rotation?sector=${encodeURIComponent(sector.sector)}`} onClick={(e) => e.stopPropagation()} className="text-[#555] hover:text-[#5ba3e6]" title="View in Rotation Tracker">
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <span className="text-xs text-[#666]">{stocks.length} stocks</span>
          <span className={`text-lg font-bold ${compositeTextColor(sector.compositeScore)}`}>
            {sector.compositeScore}
            {prevSnapshot && (() => {
              const delta = sector.compositeScore - prevSnapshot.compositeScore;
              if (delta === 0) return null;
              return <span className={`ml-1 text-xs font-semibold ${delta > 0 ? "text-green-400" : "text-red-400"}`}>({delta > 0 ? "+" : ""}{delta})</span>;
            })()}
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-[#666]" /> : <ChevronDown className="h-4 w-4 text-[#666]" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-[#2a2a2a] px-4 py-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[#888]">Momentum Composite</span><span className="text-white">{sector.momentumComposite} <span className="text-[#666]">({sector.momentumPercentile}th %ile)</span></span></div>
            <div className="flex justify-between"><span className="text-[#888]">Acceleration</span><span className={sector.acceleration > 0 ? "text-green-400" : sector.acceleration < 0 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.acceleration > 0 ? "+" : ""}{sector.acceleration}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Mansfield RS</span><span className={sector.mansfieldRS > 0 ? "text-green-400" : sector.mansfieldRS < 0 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.mansfieldRS > 0 ? "+" : ""}{sector.mansfieldRS}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">CMF (20d)</span><span className={sector.cmf20 > 0 ? "text-green-400" : sector.cmf20 < 0 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.cmf20 > 0 ? "+" : ""}{sector.cmf20}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">OBV Trend</span><span className={sector.obvTrend === 1 ? "text-green-400" : sector.obvTrend === -1 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.obvTrend === 1 ? "Accumulation" : sector.obvTrend === -1 ? "Distribution" : "Flat"}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Breadth (% &gt; 50d SMA)</span><span className="text-white">{sector.breadthPct !== null ? `${sector.breadthPct}%` : "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Unusual Volume</span><span className={sector.unusualVolume ? "text-amber-400" : "text-[#a0a0a0]"}>{sector.unusualVolume ? "Yes" : "No"}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Insider Buys</span><span className={sector.aggregateInsiderBuys > 0 ? "text-green-400" : "text-[#a0a0a0]"}>{sector.aggregateInsiderBuys}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Avg P/C Ratio</span><span className="text-white">{sector.aggregatePCR !== null ? sector.aggregatePCR : "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Earnings Beat %</span><span className="text-white">{sector.earningsBeatPct}%</span></div>
            <div className="flex justify-between"><span className="text-[#888]">Smart Money Score</span><span className={sector.dataQualityBreakdown?.smartMoney === false ? "text-[#555]" : compositeTextColor(sector.smartMoneyScore)}>{sector.dataQualityBreakdown?.smartMoney === false ? "No data" : `${sector.smartMoneyScore}/100`}</span></div>
            <div className="flex justify-between"><span className="text-[#888]">RS-Ratio / Momentum</span><span className="text-white">{sector.rsRatio} / {sector.rsMomentum}</span></div>
          </div>
          {stocks.length > 0 && (
            <div className="border-t border-[#2a2a2a] pt-3">
              <SectorStockTable stocks={stocks} sectorName={sector.sector} hasRotationData={hasRotationData} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

// ── Top Picks by Sector ──

function TopPicksBySector({ stocks, sectors }: { stocks: EnrichedStock[]; sectors: SectorRotationScore[] }) {
  const topPicks = useMemo(() => {
    const map: Record<string, EnrichedStock[]> = {};
    for (const s of stocks) {
      if (!map[s.sectorEtf]) map[s.sectorEtf] = [];
      map[s.sectorEtf].push(s);
    }
    const convOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, WATCH: 2 };
    for (const etf of Object.keys(map)) {
      map[etf].sort((a, b) => (convOrder[a.conviction] ?? 3) - (convOrder[b.conviction] ?? 3) || (b.rsAccel ?? -999) - (a.rsAccel ?? -999));
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
    return (
      <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
        <h2 className="mb-3 text-base font-semibold text-white">Top Picks by Sector</h2>
        <p className="text-sm text-[#666]">No stock picks available</p>
      </div>
    );
  }

  // Sort sectors by composite score (highest first)
  const sortedEtfs = Object.keys(topPicks).sort((a, b) => {
    const sa = sectors.find((s) => s.etf === a);
    const sb = sectors.find((s) => s.etf === b);
    return (sb?.compositeScore ?? 0) - (sa?.compositeScore ?? 0);
  });

  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
      <h2 className="mb-3 text-base font-semibold text-white">Top Picks by Sector</h2>
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
    </div>
  );
}

// ── Stock Picks Panel ──

const CONVICTION_STYLE: Record<ConvictionLevel, { bg: string; border: string; text: string }> = {
  HIGH: { bg: "bg-green-500/10", border: "border-green-500/40", text: "text-green-400" },
  MEDIUM: { bg: "bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-400" },
  WATCH: { bg: "bg-[#1a1a1a]", border: "border-[#333]", text: "text-[#888]" },
};

const CATEGORY_STYLE: Record<string, string> = {
  LEADER: "text-green-400",
  CATCH_UP: "text-blue-400",
  TURNAROUND: "text-cyan-400",
  AVOID: "text-red-400",
};

type PicksSortKey = "conviction" | "symbol" | "sector" | "category" | "phase" | "rsAccel" | "volRatio" | "price" | "pctFrom50ma";

function StockPicksPanel({ stocks, collapsed, onToggle }: { stocks: EnrichedStock[]; collapsed?: boolean; onToggle?: (id: string) => void }) {
  const [filter, setFilter] = useState<ConvictionLevel | "ALL">("ALL");
  const [sectorFilter, setSectorFilter] = useState<string>("ALL");
  const [showCount, setShowCount] = useState(25);
  const [sortKey, setSortKey] = useState<PicksSortKey>("conviction");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sectors = useMemo(() => {
    const s = new Set(stocks.map((st) => st.sector));
    return ["ALL", ...Array.from(s).sort()];
  }, [stocks]);

  const filtered = useMemo(() => {
    let list = stocks;
    if (filter !== "ALL") list = list.filter((s) => s.conviction === filter);
    if (sectorFilter !== "ALL") list = list.filter((s) => s.sector === sectorFilter);

    const convOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, WATCH: 2 };
    const catOrder: Record<string, number> = { LEADER: 0, CATCH_UP: 1, TURNAROUND: 2, AVOID: 3 };
    const phaseOrder: Record<string, number> = { P1_BASING: 0, P2_TURNAROUND: 1, P3_TRENDING: 2, P4_EXHAUSTING: 3 };

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "conviction": cmp = (convOrder[a.conviction] ?? 3) - (convOrder[b.conviction] ?? 3); break;
        case "symbol": cmp = a.symbol.localeCompare(b.symbol); break;
        case "sector": cmp = a.sector.localeCompare(b.sector); break;
        case "category": cmp = (catOrder[a.category] ?? 4) - (catOrder[b.category] ?? 4); break;
        case "phase": cmp = (phaseOrder[a.phase] ?? 4) - (phaseOrder[b.phase] ?? 4); break;
        case "rsAccel": cmp = (a.rsAccel ?? -999) - (b.rsAccel ?? -999); break;
        case "volRatio": cmp = a.volRatio - b.volRatio; break;
        case "price": cmp = a.price - b.price; break;
        case "pctFrom50ma": cmp = (a.pctFrom50ma ?? -999) - (b.pctFrom50ma ?? -999); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return sorted;
  }, [stocks, filter, sectorFilter, sortKey, sortDir]);

  const visible = filtered.slice(0, showCount);
  const highCount = stocks.filter((s) => s.conviction === "HIGH").length;
  const medCount = stocks.filter((s) => s.conviction === "MEDIUM").length;

  const handleSort = (key: PicksSortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortArrow = ({ col }: { col: PicksSortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "desc" ? <ChevronDown className="inline h-3 w-3" /> : <ChevronUp className="inline h-3 w-3" />;
  };

  const badge = (
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-green-500/10 border border-green-500/30 px-2 py-0.5 text-[10px] text-green-400">{highCount} HIGH</span>
      <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-400">{medCount} MED</span>
      <span className="text-[10px] text-[#555]">{stocks.length} total</span>
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2">
      <select value={filter} onChange={(e) => setFilter(e.target.value as ConvictionLevel | "ALL")} className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-white">
        <option value="ALL">All Conviction</option>
        <option value="HIGH">HIGH only</option>
        <option value="MEDIUM">MEDIUM only</option>
        <option value="WATCH">WATCH only</option>
      </select>
      <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-white">
        {sectors.map((s) => <option key={s} value={s}>{s === "ALL" ? "All Sectors" : s}</option>)}
      </select>
    </div>
  );

  return (
    <CollapsiblePanel id="stock-picks" title="Stock Picks" collapsed={collapsed ?? false} onToggle={onToggle ?? (() => {})} badge={badge} actions={actions}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#2a2a2a] text-left text-[#666]">
              <th className="pb-2 pr-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("conviction")}>Conv. <SortArrow col="conviction" /></th>
              <th className="pb-2 pr-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("symbol")}>Symbol <SortArrow col="symbol" /></th>
              <th className="pb-2 pr-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("sector")}>Sector <SortArrow col="sector" /></th>
              <th className="pb-2 pr-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("category")}>Category <SortArrow col="category" /></th>
              <th className="pb-2 pr-3 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("phase")}>Phase <SortArrow col="phase" /></th>
              <th className="pb-2 pr-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => handleSort("rsAccel")}>RS Accel <SortArrow col="rsAccel" /></th>
              <th className="pb-2 pr-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => handleSort("volRatio")}>Vol Ratio <SortArrow col="volRatio" /></th>
              <th className="pb-2 pr-3 font-medium text-right cursor-pointer hover:text-white" onClick={() => handleSort("price")}>Price <SortArrow col="price" /></th>
              <th className="pb-2 font-medium text-right cursor-pointer hover:text-white" onClick={() => handleSort("pctFrom50ma")}>% from 50MA <SortArrow col="pctFrom50ma" /></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const cs = CONVICTION_STYLE[s.conviction];
              return (
                <tr key={s.symbol} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]">
                  <td className="py-1.5 pr-3">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${cs.bg} ${cs.border} ${cs.text}`}>
                      {s.conviction}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className="font-medium text-white">{s.symbol}</span>
                    <span className="ml-1.5 text-[#666]" title={s.shortName}>{s.shortName.length > 18 ? s.shortName.slice(0, 16) + "\u2026" : s.shortName}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-[#888]">{s.sector}</td>
                  <td className={`py-1.5 pr-3 font-medium ${CATEGORY_STYLE[s.category] ?? "text-[#888]"}`}>{s.category}</td>
                  <td className="py-1.5 pr-3 text-[#888]">{s.phase.replace("P1_", "").replace("P2_", "").replace("P3_", "").replace("P4_", "")}</td>
                  <td className="py-1.5 pr-3 text-right">
                    <span className={s.rsAccel != null && s.rsAccel >= 3 ? "text-green-400 font-semibold" : s.rsAccel != null && s.rsAccel >= 0.5 ? "text-green-400/70" : s.rsAccel != null && s.rsAccel < -0.5 ? "text-red-400" : "text-[#888]"}>
                      {s.rsAccel != null ? s.rsAccel.toFixed(1) : "—"}
                    </span>
                    <span className="ml-1 text-[10px] text-[#555]">{s.rsAccelDesc}</span>
                  </td>
                  <td className={`py-1.5 pr-3 text-right ${s.volRatio >= 1.2 ? "text-cyan-400" : "text-[#888]"}`}>
                    {s.volRatio.toFixed(1)}x
                  </td>
                  <td className="py-1.5 pr-3 text-right text-white">${s.price.toFixed(2)}</td>
                  <td className={`py-1.5 text-right ${s.pctFrom50ma != null && s.pctFrom50ma > 0 ? "text-green-400" : s.pctFrom50ma != null && s.pctFrom50ma < 0 ? "text-red-400" : "text-[#888]"}`}>
                    {s.pctFrom50ma != null ? `${s.pctFrom50ma > 0 ? "+" : ""}${s.pctFrom50ma.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > showCount && (
        <button
          onClick={() => setShowCount((c) => c + 25)}
          className="mt-2 w-full rounded border border-[#333] bg-[#1a1a1a] py-1.5 text-xs text-[#888] hover:text-white"
        >
          Show more ({filtered.length - showCount} remaining)
        </button>
      )}
    </CollapsiblePanel>
  );
}

const LOADING_PHASES = ["Fetching ETF data", "Fetching stock quotes", "Computing sector scores", "Building correlation matrix"] as const;

type SortMode = "score" | "action" | "quadrant" | "acceleration" | "name";

const ACTION_RANK: Record<TradingAction, number> = { TRADE: 0, BUILD: 1, WATCH: 2, TRIM: 3, AVOID: 4 };
const QUADRANT_RANK: Record<RRGQuadrant, number> = { LEADING: 0, IMPROVING: 1, WEAKENING: 2, LAGGING: 3 };

export default function SectorRotationPage() {
  const [data, setData] = useState<SectorRotationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<PreRunResult[]>([]);
  const [scanResultsDate, setScanResultsDate] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [compareDate, setCompareDate] = useState<string | null>(null);
  const [history, setHistory] = useState<DailySnapshot[]>([]);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [rotationSectorRS, setRotationSectorRS] = useState<Map<string, { rsAccel: number; rsImproving: boolean; rsDelta: number; volConsistency: number }>>(new Map());
  const [collapsedPanels, togglePanel] = useCollapsedPanels();

  // Fetch rotation tracker data for Sector RS column (non-blocking)
  useEffect(() => {
    fetch("/api/rotation-tracker").then(res => res.ok ? res.json() : null).then((result: RotationTrackerResult | null) => {
      if (!result) return;
      const map = new Map<string, { rsAccel: number; rsImproving: boolean; rsDelta: number; volConsistency: number }>();
      for (const rotation of result.activeRotations) {
        for (const s of rotation.stocks) {
          map.set(s.symbol, { rsAccel: s.rsAcceleration, rsImproving: s.rsImproving, rsDelta: s.rsDelta, volConsistency: s.volumeConsistency });
        }
      }
      setRotationSectorRS(map);
    }).catch(() => { /* non-critical */ });
  }, []);

  useEffect(() => { if (data) setHistory(loadHistory()); }, [data]);

  const comparisonMap = useMemo(() => {
    if (!compareDate) return null;
    const snap = getSnapshot(compareDate);
    if (!snap) return null;
    const map = new Map<string, SectorSnapshot>();
    for (const s of snap.sectors) map.set(s.sector, s);
    return map;
  }, [compareDate]);

  const comparisonSummary = useMemo(() => {
    if (!comparisonMap || !data) return null;
    let improved = 0, declined = 0, unchanged = 0;
    for (const s of data.sectors) {
      const prev = comparisonMap.get(s.sector);
      if (!prev) { unchanged++; continue; }
      const delta = s.compositeScore - prev.compositeScore;
      if (delta > 2) improved++;
      else if (delta < -2) declined++;
      else unchanged++;
    }
    return { improved, declined, unchanged };
  }, [comparisonMap, data]);

  useEffect(() => {
    const { results, date } = loadScanResultsWithDate();
    setScanResults(results);
    setScanResultsDate(date);
  }, []);

  // Build stock list per sector with RS Accel (#2)
  const stocksBySector = useMemo(() => {
    const scanByTicker = new Map<string, (typeof scanResults)[number]>();
    for (const r of scanResults) scanByTicker.set(r.data.ticker, r);

    const quotes = data?.stockQuotes ?? {};
    const map = new Map<string, StockInSector[]>();
    for (const sectorDef of SECTOR_UNIVERSE) {
      const stocks: StockInSector[] = sectorDef.stocks.map((stock) => {
        const preRun = scanByTicker.get(stock.symbol);
        const quote = quotes[stock.symbol];
        const rs20d = preRun?.data.relativeStrength20d ?? quote?.pctFromSma50 ?? null;
        const aboveSma50 = quote?.sma50 != null && quote.sma50 > 0 ? quote.price > quote.sma50 : null;
        const volumeVsAvg = quote?.avgVolume10d != null && quote.avgVolume10d > 0
          ? Math.round((quote.volume / quote.avgVolume10d) * 100) / 100
          : null;
        const rsAccel = quote?.rsAccel ?? null;
        const rotationData = rotationSectorRS.get(stock.symbol);
        return {
          ticker: stock.symbol,
          companyName: stock.name,
          rs20d,
          rsAccel,
          sectorRS: rotationData?.rsAccel ?? null,
          pctFromAth: preRun?.data.pctFromAth ?? null,
          finalScore: preRun?.scores.finalScore ?? 0,
          verdict: preRun?.verdict ?? "",
          price: quote?.price ?? null,
          aboveSma50,
          volumeVsAvg,
          sectorName: sectorDef.displayName,
          daysToEarnings: preRun?.data.daysToEarnings ?? null,
          nextEarningsDate: preRun?.data.nextEarningsDate ?? null,
          rsImproving: rotationData?.rsImproving ?? false,
          rsDelta: rotationData?.rsDelta ?? 0,
          volumeConsistency: rotationData?.volConsistency ?? 0,
        };
      });
      map.set(sectorDef.displayName, stocks);
    }
    return map;
  }, [scanResults, data, rotationSectorRS]);

  // #6: Flat list of all stocks for search
  const allStocks = useMemo(() => {
    const list: StockInSector[] = [];
    for (const stocks of stocksBySector.values()) list.push(...stocks);
    return list;
  }, [stocksBySector]);

  const sortedSectors = useMemo(() => {
    if (!data) return [];
    const sectors = [...data.sectors];
    switch (sortMode) {
      case "score": return sectors.sort((a, b) => b.compositeScore - a.compositeScore);
      case "action": return sectors.sort((a, b) => { const diff = ACTION_RANK[getTradingAction(a)] - ACTION_RANK[getTradingAction(b)]; return diff !== 0 ? diff : b.compositeScore - a.compositeScore; });
      case "quadrant": return sectors.sort((a, b) => { const diff = QUADRANT_RANK[a.quadrant] - QUADRANT_RANK[b.quadrant]; return diff !== 0 ? diff : b.compositeScore - a.compositeScore; });
      case "acceleration": return sectors.sort((a, b) => b.acceleration - a.acceleration);
      case "name": return sectors.sort((a, b) => a.sector.localeCompare(b.sector));
      default: return sectors;
    }
  }, [data, sortMode]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (skipCache = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    if (!skipCache) {
      const cached = loadSectorRotation();
      if (cached) { setData(cached); setLoading(false); return; }
    }
    try {
      const res = await fetch("/api/sector-rotation", { signal: controller.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const result = (await res.json()) as SectorRotationResult;
      setData(result);
      saveSectorRotation(result);
      saveSnapshot(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); return () => { abortRef.current?.abort(); }; }, [fetchData]);
  useEffect(() => { const interval = setInterval(() => fetchData(true), 10 * 60 * 1000); return () => clearInterval(interval); }, [fetchData]);

  const handleExport = useCallback(() => { if (data) exportSectorsToExcel(data); }, [data]);

  const watchlistTickers = useMemo(() => data?.topStocksToWatch.flatMap((g) => g.stocks.map((s) => s.ticker)) ?? [], [data]);

  const [loadingTimeout, setLoadingTimeout] = useState(false);
  useEffect(() => {
    if (!loading || data) { setLoadingTimeout(false); return; }
    const timer = setTimeout(() => setLoadingTimeout(true), 90_000);
    return () => clearTimeout(timer);
  }, [loading, data]);

  // Loading phase cycling
  useEffect(() => {
    if (!loading || data) { setLoadingPhase(0); return; }
    const timer = setInterval(() => setLoadingPhase((p) => (p + 1) % LOADING_PHASES.length), 8000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, data]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5ba3e6]" />
        <p className="mt-4 text-[#888]">{LOADING_PHASES[loadingPhase]}...</p>
        <p className="mt-1 text-xs text-[#555]">13 ETFs + ~1,378 stock quotes</p>
        <div className="mt-2 flex justify-center gap-1.5">
          {LOADING_PHASES.map((_, i) => (
            <div key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i <= loadingPhase ? "bg-[#5ba3e6]" : "bg-[#333]"}`} />
          ))}
        </div>
        {loadingTimeout && (
          <div className="mt-6">
            <p className="text-xs text-amber-400">This is taking longer than expected.</p>
            <button onClick={() => { setLoadingTimeout(false); fetchData(true); }} className="mt-2 rounded-lg bg-[#5ba3e6] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a8fd4]">Retry</button>
          </div>
        )}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 text-center">
        <p className="text-red-400">Error: {error}</p>
        <button onClick={() => fetchData(true)} className="mt-4 rounded-lg bg-[#5ba3e6] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a8fd4]">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Sector Rotation</h1>
            {/* #7: Cross-page link */}
            <Link href="/rotation" className="rounded-md border border-[#333] px-2 py-1 text-[11px] text-[#888] hover:text-white hover:border-[#444] transition-colors">
              Rotation Tracker <ExternalLink className="h-3 w-3 inline ml-0.5" />
            </Link>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <DataAgeBadge calculatedAt={data.calculatedAt} />
            <span className="text-xs text-[#555]">{new Date(data.calculatedAt).toLocaleString()}</span>
            {data.stockQuotes && <span className="text-xs text-[#555]">{Object.keys(data.stockQuotes).length} quotes{data.quotesAsOf ? ` as of ${new Date(data.quotesAsOf).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* #6: Global search */}
          <StockSearch allStocks={allStocks} />
          {/* #10: Alerts */}
          <AlertPanel sectors={data.sectors} data={data} />
          <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white">
            <FileDown className="h-4 w-4" /><span className="hidden sm:inline">Export</span>
          </button>
          <CopyButton tickers={watchlistTickers} className="flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white" />
          <button onClick={() => fetchData(true)} disabled={loading} className="flex items-center gap-2 rounded-lg border border-[#333] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* #4: Regime Banner */}
      <RegimeBanner regime={data.regime} />

      {/* Panel 1: Rotation Status Banner */}
      <div className={`rounded-xl border p-4 ${data.rotationActive ? "border-green-500/30 bg-green-500/5" : "border-[#2a2a2a] bg-[#141414]"}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${data.rotationActive ? "bg-green-500 animate-pulse" : "bg-[#555]"}`} />
            <div>
              <div className="font-semibold text-white">{data.rotationActive ? "Rotation Active" : "No Clear Rotation"}</div>
              <div className="text-sm text-[#a0a0a0]">{data.rotationSummary}</div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-[#666]">Dispersion</div>
              <div className={`text-lg font-bold ${data.dispersionIndex > 4 ? "text-green-400" : data.dispersionIndex > 2 ? "text-amber-400" : "text-[#a0a0a0]"}`}>{data.dispersionIndex}</div>
              <div className="text-xs text-[#555]">{data.dispersionIndex > 4 ? "High" : data.dispersionIndex > 2 ? "Moderate" : "Low"}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#666]">Sector Spread</div>
              <div className={`text-lg font-bold ${(data.sectorSpread ?? 0) > 8 ? "text-green-400" : (data.sectorSpread ?? 0) > 4 ? "text-amber-400" : "text-[#a0a0a0]"}`}>{data.sectorSpread ?? 0}%</div>
              <div className="text-xs text-[#555]">{(data.sectorSpread ?? 0) > 8 ? "Wide" : (data.sectorSpread ?? 0) > 4 ? "Moderate" : "Narrow"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* #12: Breadth Thrust */}
      <BreadthThrustBanner sectors={data.sectors} />

      {/* #3: Pre-Rotation Watchlist */}
      <PreRotationWatchlist sectors={data.sectors} />

      {/* Panel 2: Sector Heatmap Grid (enhanced with #5 sparklines) */}
      <div>
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Sector Scores</h2>
            <div className="flex items-center gap-1 overflow-x-auto">
              <span className="text-xs text-[#555] shrink-0 mr-1">Sort:</span>
              {([["score", "Score"], ["action", "Action"], ["quadrant", "Quadrant"], ["acceleration", "Accel"], ["name", "Name"]] as [SortMode, string][]).map(([mode, label]) => (
                <button key={mode} onClick={() => setSortMode(mode)} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${sortMode === mode ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border border-[#5ba3e6]/30" : "text-[#666] hover:text-[#a0a0a0] border border-transparent"}`}>{label}</button>
              ))}
            </div>
          </div>
          {history.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto">
              <span className="text-xs text-[#555] shrink-0 mr-1">Compare:</span>
              <button onClick={() => setCompareDate(null)} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${compareDate === null ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border border-[#5ba3e6]/30" : "text-[#666] hover:text-[#a0a0a0] border border-transparent"}`}>None</button>
              {history.map((snap) => {
                const d = new Date(snap.date + "T12:00:00");
                const daysAgo = Math.round((Date.now() - d.getTime()) / 86_400_000);
                let label: string;
                if (daysAgo <= 1) label = "Yesterday";
                else if (daysAgo <= 8) label = "1w ago";
                else if (daysAgo <= 15) label = "2w ago";
                else if (daysAgo <= 22) label = "3w ago";
                else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return (
                  <button key={snap.date} onClick={() => setCompareDate(snap.date)} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${compareDate === snap.date ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "text-[#666] hover:text-[#a0a0a0] border border-transparent"}`} title={snap.date}>{label}</button>
                );
              })}
            </div>
          )}
          {compareDate && comparisonSummary && (
            <div className="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-1.5 text-xs text-[#a0a0a0]">
              <span className="text-purple-400 font-medium">Comparing to {new Date(compareDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              <span>&mdash;</span>
              <span className="text-green-400">{comparisonSummary.improved} improved</span>
              <span className="text-red-400">{comparisonSummary.declined} declined</span>
              <span className="text-[#666]">{comparisonSummary.unchanged} unchanged</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {sortedSectors.map((s) => (
            <div key={s.sector} className={`rounded-lg border p-3 transition-colors ${s.stealthAccumulation ? "border-cyan-500/40 bg-cyan-500/5" : "border-[#2a2a2a] bg-[#141414]"}`}>
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-white" title={s.sector}>{s.sector}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[#666]">{s.etf}</span>
                    {/* #5: Sparkline in heatmap card */}
                    <EtfSparkline returns={data.etfReturns20d?.[s.etf]} />
                  </div>
                </div>
                <span className="text-lg shrink-0">{s.trendArrow}</span>
              </div>
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className={compositeTextColor(s.compositeScore)}>{s.compositeScore}</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${quadrantColor(s.quadrant)}`}>{s.quadrant}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-[#2a2a2a]">
                  <div className={`h-1.5 rounded-full ${compositeColor(s.compositeScore)}`} style={{ width: `${s.compositeScore}%` }} />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-[#888]">
                  <span>RS {s.rsRatio.toFixed(1)}</span>
                  <span>CMF {s.cmf20 >= 0 ? "+" : ""}{s.cmf20.toFixed(3)}</span>
                  <span>Breadth {s.breadthPct != null ? `${s.breadthPct.toFixed(0)}%` : "N/A"}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  {(() => { const action = getTradingAction(s); const badge = actionBadge(action); return <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>; })()}
                  {(s.dataQuality ?? 100) < 100 && <span className="text-[10px] text-amber-400/70" title={`Scoring factors: momentum, acceleration, Mansfield RS, CMF (always available), breadth, smart money. ${s.dataQualityBreakdown ? `Missing: ${[!s.dataQualityBreakdown.breadth && "breadth", !s.dataQualityBreakdown.smartMoney && "smart money"].filter(Boolean).join(", ")}. ` : ""}Weights are redistributed across available factors.`}>{s.dataQuality ?? 100}% data</span>}
                </div>
                {(() => {
                  const prev = comparisonMap?.get(s.sector);
                  if (!prev) return null;
                  const delta = s.compositeScore - prev.compositeScore;
                  const quadChanged = s.quadrant !== prev.quadrant;
                  const curAction = getTradingAction(s);
                  const prevAction = getTradingAction({ ...s, compositeScore: prev.compositeScore, acceleration: prev.acceleration, quadrant: prev.quadrant } as SectorRotationScore);
                  const actionChanged = curAction !== prevAction;
                  if (delta === 0 && !quadChanged && !actionChanged) return null;
                  return (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {delta !== 0 && <span className={`text-[10px] font-semibold ${delta > 0 ? "text-green-400" : "text-red-400"}`}>{delta > 0 ? "+" : ""}{delta}</span>}
                      {quadChanged && <span className="rounded-full bg-[#1a1a1a] border border-[#333] px-1.5 py-0.5 text-[9px] text-[#888]">was {prev.quadrant}</span>}
                      {actionChanged && <span className="rounded-full bg-[#1a1a1a] border border-[#333] px-1.5 py-0.5 text-[9px] text-[#888]">was {prevAction}</span>}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Panel 3: RRG + Panel 4: Leading Indicators / Smart Money */}
      <CollapsiblePanel id="rrg-indicators" title="RRG & Leading Indicators" collapsed={collapsedPanels.has("rrg-indicators")} onToggle={togglePanel}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[#888]">Relative Rotation Graph</h3>
            <div className="flex justify-center"><RRGChart sectors={data.sectors} /></div>
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-[#888]">Leading Indicators</h3>
              {(() => {
                const withSignals = data.sectors.filter((s) => s.stealthAccumulation || s.flowPriceDivergence || s.breadthDivergence || s.accelerationInflection);
                if (withSignals.length === 0) return <p className="text-sm text-[#666]">No leading indicators detected</p>;
                return (
                  <div className="space-y-2">
                    {withSignals.map((s) => {
                      const signals: string[] = [];
                      if (s.flowPriceDivergence) signals.push("Flow/price divergence");
                      if (s.breadthDivergence) signals.push("Breadth divergence");
                      if (s.accelerationInflection) signals.push("Momentum inflection");
                      return (
                        <div key={s.sector} className="flex items-start gap-2 text-sm">
                          <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${s.stealthAccumulation ? "bg-cyan-400" : "bg-amber-400"}`} />
                          <div>
                            <span className="font-medium text-white">{s.sector}</span>
                            {s.stealthAccumulation && <span className="ml-2 text-xs text-cyan-400">(Stealth)</span>}
                            <div className="text-xs text-[#888]">{signals.join(", ")}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            <TopPicksBySector stocks={data.enrichedStocks?.passed ?? []} sectors={data.sectors} />
          </div>
        </div>
      </CollapsiblePanel>

      {/* #11: Sector Comparison */}
      <SectorComparison sectors={data.sectors} />

      {/* #9: Correlation Matrix */}
      <CorrelationMatrix correlationMatrix={data.correlationMatrix} sectors={data.sectors} collapsed={collapsedPanels.has("correlation")} onToggle={togglePanel} />

      {/* Stock Picks — conviction-scored stocks from enrichment pipeline */}
      {data.enrichedStocks && data.enrichedStocks.passed.length > 0 && (
        <StockPicksPanel stocks={data.enrichedStocks.passed} collapsed={collapsedPanels.has("stock-picks")} onToggle={togglePanel} />
      )}

      {/* Panel 5: Sector Detail Cards */}
      <CollapsiblePanel
        id="sector-details"
        title="Sector Details"
        collapsed={collapsedPanels.has("sector-details")}
        onToggle={togglePanel}
        badge={<span className="text-[10px] text-[#555]" title="Data quality % shows how many of the 6 scoring factors (momentum, acceleration, Mansfield RS, CMF, breadth, smart money) have real data. Missing factors have their weights redistributed.">% = missing data</span>}
        actions={
          <div className="flex items-center gap-2">
            {scanResultsDate && (() => {
              const ageMs = Date.now() - new Date(scanResultsDate).getTime();
              const ageHours = ageMs / (1000 * 60 * 60);
              if (ageHours > 24) return (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  PreRun scan data is {Math.floor(ageHours / 24)}d old
                </span>
              );
              return null;
            })()}
            {scanResults.length === 0 && <span className="text-xs text-[#555]">Run a Pre-Run scan to see stock-level data</span>}
          </div>
        }
      >
        <div className="space-y-2">
          {sortedSectors.map((s) => (
            <SectorDetail key={s.sector} sector={s} stocks={stocksBySector.get(s.sector) ?? []} prevSnapshot={comparisonMap?.get(s.sector)} etfReturns={data.etfReturns20d?.[s.etf]} hasRotationData={rotationSectorRS.size > 0} />
          ))}
        </div>
      </CollapsiblePanel>

      {/* Panel 6: Cross-Sector Pairs */}
      <CollapsiblePanel id="cross-pairs" title="Cross-Sector Pairs" collapsed={collapsedPanels.has("cross-pairs")} onToggle={togglePanel}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-4">
            <div className="text-xs font-medium text-[#888] mb-1">XLY / XLP (Risk Appetite)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">{data.crossSectorPairs.xlyXlp.ratio}</span>
              <span className={`text-sm ${data.crossSectorPairs.xlyXlp.trend.includes("Rising") ? "text-green-400" : data.crossSectorPairs.xlyXlp.trend.includes("Falling") ? "text-red-400" : "text-[#888]"}`}>{data.crossSectorPairs.xlyXlp.trend}</span>
            </div>
            <p className="mt-1 text-xs text-[#666]">Rising = cyclical rotation (risk-on). Falling = defensive rotation (risk-off).</p>
          </div>
          <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-4">
            <div className="text-xs font-medium text-[#888] mb-1">XLK / XLU (Growth vs Defense)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">{data.crossSectorPairs.xlkXlu.ratio}</span>
              <span className={`text-sm ${data.crossSectorPairs.xlkXlu.trend.includes("Rising") ? "text-green-400" : data.crossSectorPairs.xlkXlu.trend.includes("Falling") ? "text-red-400" : "text-[#888]"}`}>{data.crossSectorPairs.xlkXlu.trend}</span>
            </div>
            <p className="mt-1 text-xs text-[#666]">Rising = growth favored. Falling = defensive/utilities favored.</p>
          </div>
        </div>
      </CollapsiblePanel>
      <FilterRecipes />
      <ScannerCTA />
    </div>
  );
}
