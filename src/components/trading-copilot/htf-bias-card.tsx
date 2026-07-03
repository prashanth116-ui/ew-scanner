"use client";

import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { HtfAlignmentResult, BiasDirection } from "@/lib/tradingCopilot/types";

function BiasIcon({ bias }: { bias: BiasDirection }) {
  switch (bias) {
    case "bullish": return <ArrowUp className="h-4 w-4 text-green-400" />;
    case "bearish": return <ArrowDown className="h-4 w-4 text-red-400" />;
    default: return <Minus className="h-4 w-4 text-neutral-500" />;
  }
}

function biasColor(bias: BiasDirection): string {
  switch (bias) {
    case "bullish": return "text-green-400";
    case "bearish": return "text-red-400";
    default: return "text-neutral-500";
  }
}

interface HtfBiasCardProps {
  result: HtfAlignmentResult;
}

export function HtfBiasCard({ result }: HtfBiasCardProps) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
          HTF Bias
        </h3>
        <span className={`text-xs font-medium ${result.aligned ? "text-green-400" : "text-yellow-400"}`}>
          {result.score}/4 aligned
        </span>
      </div>

      <div className="space-y-2">
        {result.details.map((d) => (
          <div key={d.timeframe} className="flex items-center justify-between">
            <span className="text-xs text-[#888] w-12">{d.timeframe}</span>
            <div className="flex items-center gap-2">
              <BiasIcon bias={d.bias} />
              <span className={`text-xs font-medium capitalize ${biasColor(d.bias)}`}>
                {d.bias}
              </span>
            </div>
            <span className={`text-[10px] ${d.aligned ? "text-green-600" : "text-[#444]"}`}>
              {d.aligned ? "ALIGNED" : "--"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
