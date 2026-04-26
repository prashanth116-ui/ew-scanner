export default function SqueezeLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-56 rounded bg-[#1a1a1a]" />
        <div className="flex gap-2">
          <div className="h-9 w-20 rounded-md bg-[#1a1a1a]" />
          <div className="h-9 w-20 rounded-md bg-[#1a1a1a]" />
        </div>
      </div>

      {/* Preset pills */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-[#1a1a1a]" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-lg border border-[#2a2a2a]">
        <div className="border-b border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3">
          <div className="flex gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 w-16 rounded bg-[#262626]" />
            ))}
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-8 border-b border-[#2a2a2a] px-4 py-3"
          >
            <div className="h-4 w-14 rounded bg-[#1a1a1a]" />
            <div className="h-4 w-12 rounded bg-[#1a1a1a]" />
            <div className="h-4 w-16 rounded bg-[#1a1a1a]" />
            <div className="h-4 w-12 rounded bg-[#1a1a1a]" />
            <div className="h-4 w-20 rounded bg-[#1a1a1a]" />
            <div className="h-4 w-14 rounded bg-[#1a1a1a]" />
          </div>
        ))}
      </div>
    </div>
  );
}
