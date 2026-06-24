"use client";

import { useState, useMemo, Fragment } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type {
  SectorRotationScore,
  RRGQuadrant,
  EnrichedStock,
  ConvictionLevel,
  StockCategory,
  StockPhase as RotationStockPhase,
} from "@/lib/sector-rotation/types";
import { usePersistedFilter, clearPersistedFilters } from "@/lib/use-filter-persistence";
import type { PicksSortKey } from "./types";
import { CONVICTION_STYLE, CATEGORY_STYLE, CONV_ORDER, CAT_ORDER, PHASE_ORDER } from "./constants";
import { quadrantColor } from "./helpers";
import { CollapsiblePanel } from "./shared";

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

export function StockPicksPanel({ stocks, collapsed, onToggle, rotationPerfMap }: { stocks: EnrichedStock[]; collapsed?: boolean; onToggle?: (id: string) => void; rotationPerfMap?: Map<string, number> }) {
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
                          {(() => {
                            const rotPerf = rotationPerfMap?.get(s.symbol);
                            return rotPerf != null ? (
                              <span className={`ml-1 inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${
                                rotPerf >= 0
                                  ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                                  : "bg-red-500/15 text-red-400 border-red-500/30"
                              }`} title="Active rotation performance since start">
                                ROT {rotPerf >= 0 ? "+" : ""}{rotPerf.toFixed(1)}%
                              </span>
                            ) : null;
                          })()}
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
