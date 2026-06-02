export default function StockPicksLoading() {
  return (
    <div className="animate-pulse space-y-6 mx-auto max-w-7xl px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-40 rounded bg-[#1a1a1a]" />
          <div className="mt-2 h-4 w-64 rounded bg-[#1a1a1a]" />
        </div>
        <div className="h-9 w-24 rounded-md bg-[#1a1a1a]" />
      </div>

      {/* Rotation status cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
            <div className="h-3 w-24 rounded bg-[#262626]" />
            <div className="mt-2 h-7 w-16 rounded bg-[#262626]" />
            <div className="mt-2 h-3 w-40 rounded bg-[#262626]" />
          </div>
        ))}
      </div>

      {/* Sector heatmap */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
        <div className="h-5 w-32 rounded bg-[#262626] mb-3" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="h-4 w-20 rounded bg-[#262626]" />
                <div className="h-5 w-16 rounded bg-[#262626]" />
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#1a1a1a]" />
              <div className="mt-2 h-3 w-32 rounded bg-[#262626]" />
            </div>
          ))}
        </div>
      </div>

      {/* RRG chart placeholder */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
        <div className="h-5 w-40 rounded bg-[#262626] mb-3" />
        <div className="mx-auto h-80 max-w-[600px] rounded bg-[#1a1a1a]" />
      </div>

      {/* Stock table placeholder */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
        <div className="h-5 w-32 rounded bg-[#262626] mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-full rounded bg-[#1a1a1a]" />
          ))}
        </div>
      </div>
    </div>
  );
}
