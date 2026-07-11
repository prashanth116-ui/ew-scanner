import type { SectorRotationScore, RRGQuadrant } from "@/lib/sector-rotation/types";
import type { StockInSector, TradingAction } from "./types";
import { COMPOSITE_TRADE_THRESHOLD, COMPOSITE_WATCH_THRESHOLD } from "./constants";

// ── Color helpers ──

export function quadrantColor(q: RRGQuadrant): string {
  switch (q) {
    case "LEADING": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "WEAKENING": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "LAGGING": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "IMPROVING": return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
  }
}

export function quadrantDotColor(q: RRGQuadrant): string {
  switch (q) {
    case "LEADING": return "#4ade80";
    case "WEAKENING": return "#fbbf24";
    case "LAGGING": return "#f87171";
    case "IMPROVING": return "#22d3ee";
  }
}

// ── Trading action helpers ──

export function getTradingAction(s: Pick<SectorRotationScore, "quadrant" | "compositeScore" | "acceleration">): TradingAction {
  if (s.quadrant === "IMPROVING" && s.acceleration > 0) return "BUILD";
  if (s.quadrant === "LEADING" && s.compositeScore >= COMPOSITE_TRADE_THRESHOLD) {
    // Decelerating leaders: WATCH (monitor, don't add) vs accelerating: TRADE
    return s.acceleration > 0 ? "TRADE" : "WATCH";
  }
  if (s.quadrant === "LEADING") return "WATCH";
  if (s.quadrant === "WEAKENING") return "TRIM";
  if (s.quadrant === "IMPROVING") return "WATCH";
  if (s.quadrant === "LAGGING" && s.acceleration > 0 && s.compositeScore >= COMPOSITE_WATCH_THRESHOLD) return "WATCH";
  return "AVOID";
}

export function actionBadge(action: TradingAction): { label: string; className: string } {
  switch (action) {
    case "TRADE": return { label: "TRADE", className: "bg-green-500/15 text-green-400 border-green-500/30" };
    case "BUILD": return { label: "BUILD", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
    case "WATCH": return { label: "WATCH", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    case "TRIM": return { label: "TRIM", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" };
    case "AVOID": return { label: "AVOID", className: "bg-red-500/15 text-red-400 border-red-500/30" };
  }
}

// ── Stock ranking helpers ──

export function getStockPhase(s: StockInSector): import("@/lib/phase-utils").StockPhase {
  const rsAccel = s.rsAccel ?? 0;
  const rs20d = s.rs20d ?? 0;
  if (rsAccel < -2) return "exhausting";
  if (s.aboveSma50 === false && rs20d > 0 && rsAccel > 0 && (s.volumeVsAvg ?? 0) >= 1.2) return "turnaround";
  if (s.aboveSma50 === false && rsAccel > 0 && rs20d <= 0) return "basing";
  if (s.aboveSma50 === true && rsAccel > 0) return "trending";
  return "neutral";
}

export function getEntryQuality(s: StockInSector): number {
  let quality = 0;
  if ((s.rsAccel ?? 0) > 1) quality++;
  if ((s.volumeVsAvg ?? 0) >= 1.5) quality++;
  if (s.rsImproving && s.volumeConsistency >= 3) quality++;
  return quality;
}

export function actionBorderColor(action: TradingAction): string {
  switch (action) {
    case "TRADE": return "border-l-green-500";
    case "BUILD": return "border-l-cyan-500";
    case "WATCH": return "border-l-amber-500";
    case "TRIM": return "border-l-orange-500";
    case "AVOID": return "border-l-red-500";
  }
}

export function rsColor(rs: number | null): string {
  if (rs === null) return "text-[#666]";
  if (rs > 5) return "text-green-400";
  if (rs > 0) return "text-green-400/70";
  if (rs > -5) return "text-red-400/70";
  return "text-red-400";
}

export function rsAccelColor(val: number | null): string {
  if (val === null) return "text-[#666]";
  if (val > 2) return "text-green-400";
  if (val > 0) return "text-green-400/70";
  if (val > -2) return "text-red-400/70";
  return "text-red-400";
}
