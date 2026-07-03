"use client";

import type { ScoreBreakdownItem, ScoreTier } from "@/lib/tradingCopilot/types";

function getScoreColor(score: number): string {
  if (score >= 7) return "#22c55e";
  if (score >= 4) return "#eab308";
  return "#ef4444";
}

function getTierColor(tier: ScoreTier): string {
  switch (tier) {
    case "A+": case "A": return "text-green-400";
    case "B": return "text-yellow-400";
    case "C": return "text-orange-400";
    case "D": case "F": return "text-red-400";
  }
}

interface SetupScoreCardProps {
  score: number;
  tier: ScoreTier;
  breakdown: ScoreBreakdownItem[];
}

export function SetupScoreCard({ score, tier, breakdown }: SetupScoreCardProps) {
  const color = getScoreColor(score);
  const pct = (score / 10) * 100;

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
        Setup Score
      </h3>

      {/* Score bar */}
      <div className="mb-2 flex items-center gap-3">
        <div className="flex-1 h-3 bg-[#0f0f0f] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-lg font-bold text-white">{score}</span>
        <span className="text-sm text-[#666]">/10</span>
        <span className={`text-sm font-bold ${getTierColor(tier)}`}>{tier}</span>
      </div>

      {/* Breakdown */}
      <div className="mt-3 space-y-1">
        {breakdown.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-xs">
            <span className={item.active ? (item.points > 0 ? "text-[#ccc]" : "text-red-400") : "text-[#555]"}>
              {item.label}
            </span>
            <span className={
              !item.active ? "text-[#444]" :
              item.points > 0 ? "text-green-400" :
              item.points < 0 ? "text-red-400" :
              "text-[#666]"
            }>
              {item.active ? (item.points > 0 ? `+${item.points}` : `${item.points}`) : "--"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
