/** Shared phase classification utilities used by sectors and rotation pages. */

export type StockPhase = "basing" | "turnaround" | "trending" | "exhausting" | "neutral";

export function phaseBadge(phase: StockPhase): { label: string; className: string; description: string } {
  switch (phase) {
    case "basing": return { label: "P1 Basing", className: "bg-purple-500/15 text-purple-400 border-purple-500/30", description: "Below 50MA, momentum turning — watch for confirmation" };
    case "turnaround": return { label: "P2 Turnaround", className: "bg-amber-500/15 text-amber-400 border-amber-500/30", description: "Below 50MA, RS positive + volume — entry zone" };
    case "trending": return { label: "P3 Trending", className: "bg-green-500/15 text-green-400 border-green-500/30", description: "Above 50MA, accelerating — hold or add on dips" };
    case "exhausting": return { label: "P4 Exhausting", className: "bg-red-500/15 text-red-400 border-red-500/30", description: "Momentum fading (Trend Accel < -2) — take profit" };
    case "neutral": return { label: "Neutral", className: "bg-[#333]/50 text-[#666] border-[#333]", description: "Mixed or insufficient signals" };
  }
}

export const PHASE_RANK: Record<StockPhase, number> = { basing: 0, turnaround: 1, trending: 2, exhausting: 3, neutral: 4 };
