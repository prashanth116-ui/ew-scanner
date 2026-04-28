export default function ConfluenceLoading() {
  return (
    <div className="animate-pulse space-y-6 px-4 sm:px-6 py-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar skeleton */}
        <div className="w-full lg:w-72 shrink-0 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
              <div className="h-4 w-24 rounded bg-[#262626] mb-3" />
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-[#262626]" />
                <div className="h-3 w-3/4 rounded bg-[#262626]" />
              </div>
            </div>
          ))}
        </div>

        {/* Main content skeleton */}
        <div className="flex-1 space-y-4">
          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
                <div className="h-3 w-16 rounded bg-[#262626] mb-2" />
                <div className="h-6 w-10 rounded bg-[#262626]" />
              </div>
            ))}
          </div>

          {/* Sort pills */}
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-7 w-20 rounded-md bg-[#1a1a1a]" />
            ))}
          </div>

          {/* Result rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3"
            >
              <div className="flex items-center gap-4">
                <div className="h-4 w-12 rounded bg-[#262626]" />
                <div className="h-4 w-32 rounded bg-[#262626]" />
                <div className="ml-auto h-4 w-16 rounded bg-[#262626]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
