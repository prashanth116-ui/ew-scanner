"use client";

import type { PdaLocationResult } from "@/lib/tradingCopilot/types";

interface PdaLocationCardProps {
  result: PdaLocationResult;
  currentPrice: number;
  pdaHigh: number;
  pdaLow: number;
  obLevel: number;
  fvgLevel: number;
}

function ProximityDot({ near }: { near: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${near ? "bg-green-400" : "bg-[#333]"}`} />
  );
}

export function PdaLocationCard({ result, currentPrice, pdaHigh, pdaLow, obLevel, fvgLevel }: PdaLocationCardProps) {
  const levels = [
    { label: "PDA High", value: pdaHigh, near: result.nearPdaHigh },
    { label: "PDA Low", value: pdaLow, near: result.nearPdaLow },
    { label: "Nearest OB", value: obLevel, near: result.nearOB },
    { label: "Nearest FVG", value: fvgLevel, near: result.nearFVG },
  ];

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
        PDA Location
      </h3>

      {currentPrice > 0 && (
        <div className="mb-3 text-sm text-white">
          Price: <span className="font-mono font-bold">{currentPrice.toFixed(2)}</span>
        </div>
      )}

      <div className="space-y-2">
        {levels.map((l) => (
          <div key={l.label} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <ProximityDot near={l.near} />
              <span className="text-[#888]">{l.label}</span>
            </div>
            <span className={`font-mono ${l.near ? "text-white" : "text-[#555]"}`}>
              {l.value > 0 ? l.value.toFixed(2) : "--"}
            </span>
          </div>
        ))}
      </div>

      {result.inNoTradeZone && (
        <div className="mt-3 rounded-md bg-red-900/20 px-3 py-1.5 text-xs text-red-400">
          Price is in mid-range no-trade zone
        </div>
      )}

      {result.proximityPercent > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-[#666] mb-1">
            <span>PDA Proximity</span>
            <span>{result.proximityPercent.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-[#0f0f0f] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-[#5ba3e6] transition-all"
              style={{ width: `${result.proximityPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
