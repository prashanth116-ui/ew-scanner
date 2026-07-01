"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Scanner error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-xl font-semibold text-white">Something went wrong</h2>
      <p className="text-sm text-[#a0a0a0] max-w-md">
        {error.message || "An unexpected error occurred. Try refreshing the page."}
      </p>
      <pre className="mt-2 max-w-2xl text-[10px] text-[#666] text-left whitespace-pre-wrap overflow-auto max-h-40">
        {error.stack}
      </pre>
      <button
        onClick={reset}
        className="rounded-md bg-[#5ba3e6] px-4 py-2 text-sm text-white hover:bg-[#4a8fd0] transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
