"use client";

export function ProgressBar({
  current,
  total,
  label,
  color = "bg-[#185FA5]",
}: {
  current: number;
  total: number;
  label?: string;
  color?: string;
}) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-[#a0a0a0]">
        <span>{label ?? `${current}/${total}`}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#1a1a1a]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
