"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PullbackWatchStock, ExtensionTier } from "@/lib/sector-rotation/types";
import { usePersistedFilter, clearPersistedFilters } from "@/lib/hooks/use-filter-persistence";
import type { PullbackSortKey } from "./types";
import { TIER_ORDER, TIER_STYLE } from "./constants";
import { CollapsiblePanel } from "./shared";

export function PullbackWatchPanel({ stocks, collapsed, onToggle }: { stocks: PullbackWatchStock[]; collapsed?: boolean; onToggle?: (id: string) => void }) {
  const [sectorFilter, setSectorFilter] = usePersistedFilter<string>("ew-filter:pullback:sector", "ALL");
  const [tierFilter, setTierFilter] = usePersistedFilter<ExtensionTier | "ALL">("ew-filter:pullback:tier", "ALL");
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
          <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value as ExtensionTier | "ALL")} className={selectClass}>
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
