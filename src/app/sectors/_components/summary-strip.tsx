"use client";

import type { SectorRotationResult, SectorRotationScore } from "@/lib/sector-rotation/types";
import { getTradingAction } from "./helpers";
import { InfoTip } from "./info-tip";

export function SummaryStrip({ data, sectors }: { data: SectorRotationResult; sectors: SectorRotationScore[] }) {
  const improving = sectors.filter((s) => s.acceleration > 0).length;
  const declining = sectors.filter((s) => s.acceleration < 0).length;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-2 overflow-x-auto">
      {/* Regime */}
      {data.regime && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-[#555] uppercase tracking-wider">Regime</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            data.regime.regime === "RISK_ON" ? "bg-green-500/15 text-green-400" :
            data.regime.regime === "RISK_OFF" ? "bg-red-500/15 text-red-400" :
            data.regime.regime === "INFLATIONARY" ? "bg-amber-500/15 text-amber-400" :
            "bg-[#2a2a2a] text-[#888]"
          }`}>{data.regime.regime.replace("_", " ")}</span>
        </div>
      )}
      <div className="h-4 w-px bg-[#2a2a2a] shrink-0" />
      {/* Rotation */}
      <div className="flex items-center gap-2 shrink-0">
        <div className={`h-2.5 w-2.5 rounded-full ${data.rotationActive ? "bg-green-500 animate-pulse" : "bg-[#555]"}`} />
        <span className="text-[11px] text-[#a0a0a0]">{data.rotationActive ? "Rotation Active" : "No Rotation"}</span>
      </div>
      <div className="h-4 w-px bg-[#2a2a2a] shrink-0" />
      {/* Dispersion */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="flex items-center gap-0.5 text-[10px] text-[#555]">Disp <InfoTip text="How spread out sector scores are \u2014 higher means more rotation opportunity" /></span>
        <span className={`text-sm font-bold font-mono ${
          data.dispersionIndex > 4 ? "text-green-400" : data.dispersionIndex > 2 ? "text-amber-400" : "text-[#888]"
        }`}>{data.dispersionIndex.toFixed(1)}</span>
      </div>
      <div className="h-4 w-px bg-[#2a2a2a] shrink-0" />
      {/* Spread */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="flex items-center gap-0.5 text-[10px] text-[#555]">Spread <InfoTip text="Gap between best and worst sector scores \u2014 wider spread means clearer winners and losers" /></span>
        <span className={`text-sm font-bold font-mono ${
          (data.sectorSpread ?? 0) > 8 ? "text-green-400" : (data.sectorSpread ?? 0) > 4 ? "text-amber-400" : "text-[#888]"
        }`}>{(data.sectorSpread ?? 0).toFixed(1)}%</span>
      </div>
      <div className="h-4 w-px bg-[#2a2a2a] shrink-0" />
      {/* Improving / declining */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-green-400 text-[11px] font-medium">{improving} improving</span>
        <span className="text-[#555]">/</span>
        <span className="text-red-400 text-[11px] font-medium">{declining} declining</span>
      </div>
    </div>
  );
}
