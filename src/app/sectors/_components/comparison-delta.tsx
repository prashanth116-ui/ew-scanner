"use client";

import type { SectorRotationScore } from "@/lib/sector-rotation/types";
import type { SectorSnapshot } from "@/lib/sector-rotation/history";
import { getTradingAction, actionBadge } from "./helpers";

export function TradingActionBadge({ sector }: { sector: Pick<SectorRotationScore, "quadrant" | "compositeScore" | "acceleration"> }) {
  const badge = actionBadge(getTradingAction(sector));
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>;
}

export function ComparisonDelta({ sector, comparisonMap }: { sector: SectorRotationScore; comparisonMap: Map<string, SectorSnapshot> | null }) {
  const prev = comparisonMap?.get(sector.sector);
  if (!prev) return null;
  const delta = sector.compositeScore - prev.compositeScore;
  const quadChanged = sector.quadrant !== prev.quadrant;
  const curAction = getTradingAction(sector);
  const prevAction = getTradingAction({ ...sector, compositeScore: prev.compositeScore, acceleration: prev.acceleration, quadrant: prev.quadrant });
  const actionChanged = curAction !== prevAction;
  if (delta === 0 && !quadChanged && !actionChanged) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {delta !== 0 && <span className={`text-[10px] font-semibold ${delta > 0 ? "text-green-400" : "text-red-400"}`}>{delta > 0 ? "+" : ""}{delta}</span>}
      {quadChanged && <span className="rounded-full bg-[#1a1a1a] border border-[#333] px-1.5 py-0.5 text-[9px] text-[#888]">was {prev.quadrant}</span>}
      {actionChanged && <span className="rounded-full bg-[#1a1a1a] border border-[#333] px-1.5 py-0.5 text-[9px] text-[#888]">was {prevAction}</span>}
    </div>
  );
}
