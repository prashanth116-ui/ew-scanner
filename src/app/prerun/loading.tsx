export default function PreRunLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded bg-[#1a1a1a]" />
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded-md bg-[#1a1a1a]" />
          <div className="h-9 w-28 rounded-md bg-[#1a1a1a]" />
        </div>
      </div>

      {/* Preset pills */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-[#1a1a1a]" />
        ))}
      </div>

      {/* Grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="h-5 w-20 rounded bg-[#262626]" />
              <div className="h-6 w-10 rounded-full bg-[#262626]" />
            </div>
            <div className="mb-2 h-4 w-full rounded bg-[#262626]" />
            <div className="mb-2 h-4 w-2/3 rounded bg-[#262626]" />
            <div className="mt-4 flex gap-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-5 w-8 rounded bg-[#262626]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
