"use client";

import { useEffect, useState } from "react";

/**
 * Returns the current timestamp and updates it on a configurable interval.
 * Using this hook avoids calling impure Date.now() directly during render
 * or inside memo callbacks.
 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
