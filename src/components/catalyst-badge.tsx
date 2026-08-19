"use client";

import { Zap } from "lucide-react";
import { countdownLabel } from "@/lib/catalyst-date";

export interface CatalystInfo {
  event_date: string;
  event_type: string;
  note?: string | null;
  daysUntil: number;
}

/**
 * Colour encodes urgency, not sentiment. A catalyst is neither bullish nor bearish —
 * it is a date on which the position stops being about the chart. Red at <= 2 days is a
 * sizing warning, not a sell signal.
 */
function tone(days: number): string {
  if (days < 0) return "bg-[#1a1a1a] text-[#707070] border-[#2a2a2a]";
  if (days <= 2) return "bg-red-500/20 text-red-300 border-red-500/40";
  if (days <= 7) return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  return "bg-sky-500/15 text-sky-300 border-sky-500/30";
}

export function CatalystBadge({ catalyst, compact = false }: { catalyst: CatalystInfo; compact?: boolean }) {
  const { event_type, note, daysUntil: d, event_date } = catalyst;
  const title = [`${event_type} — ${event_date} (${countdownLabel(d)})`, note].filter(Boolean).join("\n");
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${tone(d)}`}
    >
      <Zap className="h-2.5 w-2.5" />
      {compact ? countdownLabel(d) : `${event_type} ${countdownLabel(d)}`}
    </span>
  );
}
