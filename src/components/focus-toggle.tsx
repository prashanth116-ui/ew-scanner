"use client";

import { Star, Zap } from "lucide-react";

/**
 * A count-and-narrow chip, shared by every screen filter of this shape.
 *
 * Hidden entirely when the count is zero, so it never reads as a filter silently
 * returning nothing — on VCP the focus overlap is genuinely 0-1 names, and a visible
 * "Focus (0)" would look broken rather than informative.
 */
function ChipToggle({
  count, active, onToggle, label, title, icon, activeClass,
}: {
  count: number;
  active: boolean;
  onToggle: () => void;
  label: string;
  title: string;
  icon: React.ReactNode;
  activeClass: string;
}) {
  if (count === 0) return null;
  return (
    <button
      onClick={onToggle}
      title={title}
      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-colors ${
        active ? activeClass : "bg-[#1a1a1a] text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] border-[#2a2a2a]"
      }`}
    >
      {icon}
      {label} ({count})
    </button>
  );
}

/**
 * Narrow a list to the names you actually trade.
 *
 * A toggle rather than a default: the scanners exist to notice a name ENTERING the focus
 * list, and defaulting every screen to focus-only would close that loop.
 */
export function FocusToggle({
  count, active, onToggle,
}: { count: number; active: boolean; onToggle: () => void }) {
  return (
    <ChipToggle
      count={count}
      active={active}
      onToggle={onToggle}
      label="Focus"
      icon={<Star className="h-3 w-3" />}
      activeClass="bg-amber-500/20 text-amber-300 border-amber-500/40"
      title={
        active
          ? "Showing only your focus names — click to show all"
          : `Narrow to the ${count} focus name${count === 1 ? "" : "s"} on this screen`
      }
    />
  );
}

/**
 * Narrow to names with maximum stored energy and no trigger yet.
 *
 * Not an entry signal — low demand is the defining feature, so most of these will stay
 * where they are. It answers the one question a price engine cannot: given that it will
 * never see a readout date, which names are worth going and finding the date for?
 */
export function SpringToggle({
  count, active, onToggle,
}: { count: number; active: boolean; onToggle: () => void }) {
  return (
    <ChipToggle
      count={count}
      active={active}
      onToggle={onToggle}
      label="Loaded"
      icon={<Zap className="h-3 w-3" />}
      activeClass="bg-violet-500/20 text-violet-300 border-violet-500/40"
      title={
        active
          ? "Showing only loaded springs — click to show all"
          : `${count} name${count === 1 ? "" : "s"} with room to run and no trigger yet — a research queue, not an entry signal`
      }
    />
  );
}
