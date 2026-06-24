"use client";

import { AlertTriangle } from "lucide-react";
import type { SectorRotationResult } from "@/lib/sector-rotation/types";

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
