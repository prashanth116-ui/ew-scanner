export default function CryptoRotationLoading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-64 animate-pulse rounded bg-[#1a1a1a]" />
        <div className="flex gap-2">
          <div className="h-8 w-24 animate-pulse rounded bg-[#1a1a1a]" />
          <div className="h-8 w-24 animate-pulse rounded bg-[#1a1a1a]" />
        </div>
      </div>
      {/* Regime banner skeleton */}
      <div className="mb-4 h-16 animate-pulse rounded-lg bg-[#1a1a1a]" />
      {/* Heatmap grid skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-[#1a1a1a]" />
        ))}
      </div>
    </div>
  );
}
