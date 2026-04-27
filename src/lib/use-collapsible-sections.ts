"use client";

import { useState, useCallback } from "react";

/**
 * Shared hook for collapsible sidebar sections.
 * Used by all scanner pages that have a sidebar with toggleable sections.
 */
export function useCollapsibleSections(initialCollapsed?: string[]) {
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(initialCollapsed)
  );

  const toggleSection = useCallback((key: string) => {
    setCollapsed((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      return s;
    });
  }, []);

  const isCollapsed = useCallback(
    (key: string) => collapsed.has(key),
    [collapsed]
  );

  return { collapsed, toggleSection, isCollapsed };
}
