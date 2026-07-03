"use client";

import type { MarketState } from "@/lib/tradingCopilot/types";
import { TrendingUp, TrendingDown, ArrowLeftRight, RefreshCw, Pause } from "lucide-react";

const CONFIG: Record<MarketState, { icon: typeof TrendingUp; color: string; label: string }> = {
  trending_bullish: { icon: TrendingUp,      color: "text-green-400",   label: "Trending Bullish" },
  trending_bearish: { icon: TrendingDown,    color: "text-red-400",     label: "Trending Bearish" },
  range:            { icon: ArrowLeftRight,  color: "text-yellow-400",  label: "Range Bound" },
  transition:       { icon: RefreshCw,       color: "text-blue-400",    label: "Transition" },
  wait:             { icon: Pause,           color: "text-neutral-400", label: "Wait" },
};

interface MarketStateCardProps {
  state: MarketState;
}

export function MarketStateCard({ state }: MarketStateCardProps) {
  const c = CONFIG[state];
  const Icon = c.icon;

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
        Market State
      </h3>
      <div className="flex items-center gap-3">
        <Icon className={`h-5 w-5 ${c.color}`} />
        <span className={`text-sm font-semibold ${c.color}`}>{c.label}</span>
      </div>
    </div>
  );
}
