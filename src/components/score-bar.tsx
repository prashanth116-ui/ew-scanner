/**
 * Shared score bar component used across scanner pages.
 * Displays a horizontal progress bar with label, value, and max.
 *
 * Two sizes:
 * - "sm" (default): compact, used in expanded panels / deep dives
 * - "md": standard, used in result detail rows
 */

interface ScoreBarProps {
  label: string;
  value: number;
  max: number;
  /** CSS color string or Tailwind bg class. If starts with "bg-", used as className; otherwise as backgroundColor style. */
  color: string;
  /** Size variant. "sm" = compact (h-1.5), "md" = standard (h-2). Default: "md" */
  size?: "sm" | "md";
}

export function ScoreBar({ label, value, max, color, size = "md" }: ScoreBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const isTailwind = color.startsWith("bg-");

  if (size === "sm") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[#666] w-16 shrink-0 truncate">{label}</span>
        <div className="flex-1 h-1.5 bg-[#0f0f0f] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isTailwind ? color : ""}`}
            style={{ width: `${pct}%`, ...(isTailwind ? {} : { backgroundColor: color }) }}
          />
        </div>
        <span className="text-[10px] text-[#888] w-10 text-right shrink-0">
          {value.toFixed(value % 1 === 0 ? 0 : 1)}/{max}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-[#a0a0a0] shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${isTailwind ? color : ""}`}
          style={{ width: `${pct}%`, ...(isTailwind ? {} : { backgroundColor: color }) }}
        />
      </div>
      <span className="w-8 text-right text-[#ccc]">{value.toFixed(0)}</span>
    </div>
  );
}
