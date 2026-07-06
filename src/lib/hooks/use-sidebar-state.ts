"use client";

import { useState, useCallback } from "react";

/**
 * Persist sidebar open/closed state to localStorage.
 */
export function useSidebarState(key: string, defaultOpen = true): [boolean, (v: boolean) => void] {
  const storageKey = `sidebar:${key}`;

  const [open, setOpenRaw] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) return saved === "1";
    } catch {
      // ignore
    }
    return defaultOpen;
  });

  const setOpen = useCallback(
    (v: boolean) => {
      setOpenRaw(v);
      try {
        localStorage.setItem(storageKey, v ? "1" : "0");
      } catch {
        // ignore
      }
    },
    [storageKey]
  );

  return [open, setOpen];
}
