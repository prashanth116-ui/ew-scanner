"use client";

import type { Decision } from "@/lib/tradingCopilot/types";

const CONFIG: Record<Decision, { bg: string; border: string; text: string; label: string }> = {
  TRADE:   { bg: "bg-green-900/30",  border: "border-green-600/50",  text: "text-green-400",  label: "TRADE" },
  WATCH:   { bg: "bg-yellow-900/30", border: "border-yellow-600/50", text: "text-yellow-400", label: "WATCH" },
  WAIT:    { bg: "bg-neutral-800/50",border: "border-neutral-600/50",text: "text-neutral-400",label: "WAIT" },
  BLOCKED: { bg: "bg-red-900/30",    border: "border-red-600/50",    text: "text-red-400",    label: "BLOCKED" },
};

interface DecisionBannerProps {
  decision: Decision;
  score: number;
  scoreTier: string;
}

export function DecisionBanner({ decision, score, scoreTier }: DecisionBannerProps) {
  const c = CONFIG[decision];

  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} px-6 py-4 flex items-center justify-between`}>
      <div className="flex items-center gap-4">
        <span className={`text-2xl font-bold tracking-wider ${c.text}`}>{c.label}</span>
        <span className="text-sm text-[#a0a0a0]">
          Score: {score}/10 ({scoreTier})
        </span>
      </div>
      <div className={`text-xs uppercase tracking-wider ${c.text}`}>
        {decision === "TRADE" && "Setup qualifies — execute with discipline"}
        {decision === "WATCH" && "Developing — wait for confirmation"}
        {decision === "WAIT" && "No setup — be patient"}
        {decision === "BLOCKED" && "Trading restricted — step away"}
      </div>
    </div>
  );
}
