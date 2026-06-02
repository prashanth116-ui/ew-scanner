"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Clock } from "lucide-react";

export function timeAgo(isoDate: string): {
  text: string;
  stale: boolean;
  veryStale: boolean;
} {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let text: string;
  if (mins < 1) text = "just now";
  else if (mins < 60) text = `${mins}m ago`;
  else if (hours < 24) text = `${hours}h ago`;
  else text = `${days}d ago`;

  return { text, stale: hours >= 6, veryStale: hours >= 24 };
}

export function DataAgeBadge({ calculatedAt }: { calculatedAt: string }) {
  const [age, setAge] = useState(() => timeAgo(calculatedAt));

  useEffect(() => {
    setAge(timeAgo(calculatedAt));
    const interval = setInterval(() => setAge(timeAgo(calculatedAt)), 60_000);
    return () => clearInterval(interval);
  }, [calculatedAt]);

  if (age.veryStale) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
        <AlertTriangle className="h-3 w-3" />
        {age.text} — data is stale
      </span>
    );
  }
  if (age.stale) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
        <Clock className="h-3 w-3" />
        {age.text}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[#888]">
      <Clock className="h-3 w-3" />
      {age.text}
    </span>
  );
}
