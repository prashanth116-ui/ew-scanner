export default function SectorsLoading() {
  return (
    <div className="animate-pulse space-y-6 mx-auto max-w-7xl px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded bg-[#1a1a1a]" />
        <div className="h-9 w-24 rounded-md bg-[#1a1a1a]" />
      </div>

      {/* Status banner */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-[#262626]" />
          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-[#262626]" />
            <div className="h-3 w-64 rounded bg-[#262626]" />
          </div>
        </div>
      </div>

      {/* RRG Chart placeholder */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
        <div className="h-5 w-32 rounded bg-[#262626] mb-4" />
        <div className="h-80 rounded bg-[#1a1a1a]" />
      </div>

      {/* Sector cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-5 w-28 rounded bg-[#262626]" />
              <div className="h-6 w-10 rounded bg-[#262626]" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-[#262626]" />
              <div className="h-3 w-2/3 rounded bg-[#262626]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
