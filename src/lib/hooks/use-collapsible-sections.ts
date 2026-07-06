"use client";

import { useState, useCallback } from "react";

/**
 * Shared hook for collapsible sidebar sections.
 * Used by all scanner pages that have a sidebar with toggleable sections.
 *
 * When `storageKey` is provided, collapsed state persists to localStorage.
 */
export function useCollapsibleSections(
  initialCollapsed?: string[],
  storageKey?: string
) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`sections:${storageKey}`);
        if (saved) return new Set(JSON.parse(saved) as string[]);
      } catch {
        // ignore
      }
    }
    return new Set(initialCollapsed);
  });

  const persist = useCallback(
    (next: Set<string>) => {
      if (storageKey) {
        try {
          localStorage.setItem(
            `sections:${storageKey}`,
            JSON.stringify([...next])
          );
        } catch {
          // ignore
        }
      }
    },
    [storageKey]
  );

  const toggleSection = useCallback(
    (key: string) => {
      setCollapsed((prev) => {
        const s = new Set(prev);
        if (s.has(key)) s.delete(key);
        else s.add(key);
        persist(s);
        return s;
      });
    },
    [persist]
  );

  const isCollapsed = useCallback(
    (key: string) => collapsed.has(key),
    [collapsed]
  );

  return { collapsed, toggleSection, isCollapsed };
}
