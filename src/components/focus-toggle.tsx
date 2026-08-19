"use client";

import { Star } from "lucide-react";

/**
 * Narrow a list to the names you actually trade.
 *
 * Deliberately a toggle rather than a default. The scanners exist to notice a name
 * ENTERING the focus list, and defaulting every screen to focus-only would close that
 * loop — you would stop seeing the thing you built the wide universe to catch.
 *
 * Hidden entirely when nothing on the current screen is a focus name, so it never reads
 * as a filter that is silently returning zero.
 */
export function FocusToggle({
  count,
  active,
  onToggle,
}: {
  /** How many rows on this screen are focus names. */
  count: number;
  active: boolean;
  onToggle: () => void;
}) {
  if (count === 0) return null;
  return (
    <button
      onClick={onToggle}
      title={
        active
          ? "Showing only your focus names — click to show all"
          : `Narrow to the ${count} focus name${count === 1 ? "" : "s"} on this screen`
      }
      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-colors ${
        active
          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
          : "bg-[#1a1a1a] text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] border-[#2a2a2a]"
      }`}
    >
      <Star className="h-3 w-3" />
      Focus ({count})
    </button>
  );
}
