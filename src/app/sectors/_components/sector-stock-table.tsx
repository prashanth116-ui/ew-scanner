"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, FileDown, Zap } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { type StockPhase, phaseBadge, PHASE_RANK } from "@/lib/phase-utils";
import { usePersistedFilter, clearPersistedFilters } from "@/lib/hooks/use-filter-persistence";
import type { StockInSector, SmaFilter, VolFilter, VerdictFilter, RsAccelFilter, PhaseFilter } from "./types";
import { VERDICT_RANK } from "./constants";
import { getStockPhase, getEntryQuality, rsColor, rsAccelColor } from "./helpers";

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
                    {s.inActiveRotation && s.rotationPerfPct != null && (
                      <span className={`ml-1 inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${
                        s.rotationPerfPct >= 0
                          ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                          : "bg-red-500/15 text-red-400 border-red-500/30"
                      }`} title="Active rotation performance since start">
                        ROT {s.rotationPerfPct >= 0 ? "+" : ""}{s.rotationPerfPct.toFixed(1)}%
                      </span>
                    )}
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
                  {s.inActiveRotation && s.rotationPerfPct != null && (
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${
                      s.rotationPerfPct >= 0
                        ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                        : "bg-red-500/15 text-red-400 border-red-500/30"
                    }`}>ROT {s.rotationPerfPct >= 0 ? "+" : ""}{s.rotationPerfPct.toFixed(1)}%</span>
                  )}
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
