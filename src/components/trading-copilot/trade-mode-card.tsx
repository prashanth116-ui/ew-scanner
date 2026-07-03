"use client";

import type { TradeMode } from "@/lib/tradingCopilot/types";

const CONFIG: Record<TradeMode, { color: string; bg: string; label: string }> = {
  long_only:   { color: "text-green-400",   bg: "bg-green-900/30",   label: "Long Only" },
  short_only:  { color: "text-red-400",     bg: "bg-red-900/30",     label: "Short Only" },
  range_trade: { color: "text-yellow-400",  bg: "bg-yellow-900/30",  label: "Range Trade" },
  wait:        { color: "text-neutral-400", bg: "bg-neutral-800/50", label: "Wait" },
  blocked:     { color: "text-red-400",     bg: "bg-red-900/30",     label: "Blocked" },
};

interface TradeModeCardProps {
  mode: TradeMode;
}

export function TradeModeCard({ mode }: TradeModeCardProps) {
  const c = CONFIG[mode];

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
        Trade Mode
      </h3>
      <span className={`inline-block rounded-md px-3 py-1.5 text-sm font-semibold ${c.color} ${c.bg}`}>
        {c.label}
      </span>
    </div>
  );
}
