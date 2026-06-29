"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { CryptoRotationResult } from "@/lib/crypto-rotation/types";
import {
  computeCryptoLeadingIndicators,
  type CryptoLeadingIndicator,
} from "@/lib/crypto-rotation/leading-indicators";

const SIGNAL_STYLE: Record<
  CryptoLeadingIndicator["signal"],
  { icon: typeof TrendingUp; color: string; bg: string; border: string }
> = {
  bullish: {
    icon: TrendingUp,
    color: "text-green-400",
    bg: "bg-green-500/5",
    border: "border-green-500/20",
  },
  bearish: {
    icon: TrendingDown,
    color: "text-red-400",
    bg: "bg-red-500/5",
    border: "border-red-500/20",
  },
  neutral: {
    icon: Minus,
    color: "text-[#888]",
    bg: "bg-[#141414]",
    border: "border-[#2a2a2a]",
  },
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high: "bg-green-500/10 border-green-500/30 text-green-400",
  medium: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  low: "bg-[#222] border-[#333] text-[#888]",
};

export function LeadingIndicatorsPanel({
  data,
}: {
  data: CryptoRotationResult;
}) {
  const indicators = useMemo(
    () => computeCryptoLeadingIndicators(data),
    [data]
  );

  if (indicators.length === 0) {
    return (
      <p className="text-sm text-[#666]">
        No leading indicators triggered. Crypto sectors are in a neutral
        configuration.
      </p>
    );
  }

  // Count by signal type
  const bullish = indicators.filter((i) => i.signal === "bullish").length;
  const bearish = indicators.filter((i) => i.signal === "bearish").length;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-3 text-xs">
        {bullish > 0 && (
          <span className="flex items-center gap-1 text-green-400">
            <TrendingUp className="h-3 w-3" />
            {bullish} bullish
          </span>
        )}
        {bearish > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            <TrendingDown className="h-3 w-3" />
            {bearish} bearish
          </span>
        )}
      </div>

      {/* Indicator grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {indicators.map((ind) => {
          const style = SIGNAL_STYLE[ind.signal];
          const Icon = style.icon;
          const confStyle = CONFIDENCE_STYLE[ind.confidence];

          return (
            <div
              key={ind.name}
              className={`rounded-lg border p-3 ${style.border} ${style.bg}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${style.color}`} />
                  <span className={`text-sm font-medium ${style.color}`}>
                    {ind.name}
                  </span>
                </div>
                <span
                  className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] ${confStyle}`}
                >
                  {ind.confidence}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-[#999]">{ind.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
