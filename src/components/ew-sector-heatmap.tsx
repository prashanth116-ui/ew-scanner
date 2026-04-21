"use client";

import type { EnhancedScoredCandidate } from "@/lib/ew-types";

interface SectorHeatmapProps {
  candidates: EnhancedScoredCandidate[];
}

interface SectorSummary {
  sector: string;
  count: number;
  avgScore: number;
}

function getHeatColor(avgScore: number): string {
  if (avgScore >= 0.7) return "border-green-500/50 bg-green-500/10";
  if (avgScore >= 0.5) return "border-yellow-500/50 bg-yellow-500/10";
  return "border-red-500/50 bg-red-500/10";
}

function getTextColor(avgScore: number): string {
  if (avgScore >= 0.7) return "text-green-400";
  if (avgScore >= 0.5) return "text-yellow-400";
  return "text-red-400";
}

export function EWSectorHeatmap({ candidates }: SectorHeatmapProps) {
  const sectorMap = new Map<string, { scores: number[]; count: number }>();

  for (const c of candidates) {
    const sector = c.sector ?? "Other";
    const entry = sectorMap.get(sector) ?? { scores: [], count: 0 };
    entry.scores.push(c.enhancedNormalized);
    entry.count++;
    sectorMap.set(sector, entry);
  }

  const sectors: SectorSummary[] = Array.from(sectorMap.entries())
    .map(([sector, { scores, count }]) => ({
      sector,
      count,
      avgScore: scores.reduce((s, v) => s + v, 0) / scores.length,
    }))
    .sort((a, b) => b.count - a.count);

  if (sectors.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {sectors.map((s) => (
        <div
          key={s.sector}
          className={`rounded-lg border p-2.5 text-center ${getHeatColor(s.avgScore)}`}
        >
          <p className="truncate text-xs font-medium text-[#e6e6e6]">
            {s.sector}
          </p>
          <p className={`text-lg font-bold ${getTextColor(s.avgScore)}`}>
            {s.count}
          </p>
          <p className="text-[10px] text-[#888]">
            avg {Math.round(s.avgScore * 100)}%
          </p>
        </div>
      ))}
    </div>
  );
}
