interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const pct = Math.round((current / total) * 100);

  const segments = [
    { label: "Beginner", range: [1, 7], color: "bg-emerald-500" },
    { label: "Intermediate", range: [8, 13], color: "bg-sky-500" },
    { label: "Advanced", range: [14, 20], color: "bg-amber-500" },
    { label: "Institutional", range: [21, 25], color: "bg-purple-500" },
  ];

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-[#a0a0a0]">Learning Progress</span>
        <span className="text-xs text-[#666]">{pct}% complete</span>
      </div>
      <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-[#262626]">
        {segments.map((seg) => {
          const segStart = seg.range[0];
          const segEnd = seg.range[1];
          const segTotal = segEnd - segStart + 1;
          const segWidth = (segTotal / total) * 100;
          const filled = current >= segEnd ? 100 : current >= segStart ? ((current - segStart + 1) / segTotal) * 100 : 0;
          return (
            <div key={seg.label} className="relative" style={{ width: `${segWidth}%` }}>
              <div
                className={`absolute inset-y-0 left-0 ${seg.color} transition-all duration-500`}
                style={{ width: `${filled}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-[#555]">
        {segments.map((seg) => (
          <span key={seg.label}>{seg.label}</span>
        ))}
      </div>
    </div>
  );
}
