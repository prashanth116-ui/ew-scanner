"use client";

import { useState, useEffect } from "react";
import { getCacheAge } from "@/lib/scan-cache";

interface StalenessLabelProps {
  cacheKey: string;
  ttlMs: number;
  onRefresh?: () => void;
}

function formatAge(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

export function StalenessLabel({ cacheKey, ttlMs, onRefresh }: StalenessLabelProps) {
  const [ageMs, setAgeMs] = useState<number | null>(() => getCacheAge(cacheKey));

  useEffect(() => {
    setAgeMs(getCacheAge(cacheKey));
    const interval = setInterval(() => {
      setAgeMs(getCacheAge(cacheKey));
    }, 30_000);
    return () => clearInterval(interval);
  }, [cacheKey]);

  if (ageMs === null) return null;

  const stale = ageMs > ttlMs;
  const nearStale = ageMs > ttlMs * 0.8;

  const color = stale
    ? "text-red-400"
    : nearStale
      ? "text-amber-400"
      : "text-[#666]";

  const label = stale ? "Stale" : `Cached ${formatAge(ageMs)}`;

  const Tag = onRefresh ? "button" : "span";

  return (
    <Tag
      className={`text-[10px] ${color} ${onRefresh ? "hover:underline cursor-pointer" : ""}`}
      onClick={onRefresh}
      title={onRefresh ? "Click to refresh" : undefined}
    >
      {label}
    </Tag>
  );
}
