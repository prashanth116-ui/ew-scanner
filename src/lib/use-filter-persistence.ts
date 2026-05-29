"use client";

import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Generic hook — wraps useState with localStorage backing.
 * Supports primitive types, arrays, and Sets (serialized as arrays).
 */
export function usePersistedFilter<T>(
  key: string,
  defaultValue: T
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      const parsed = JSON.parse(raw);
      // Restore Set from array
      if (defaultValue instanceof Set) {
        return new Set(parsed) as unknown as T;
      }
      return parsed as T;
    } catch {
      return defaultValue;
    }
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      const resolved = typeof v === "function" ? (v as (prev: T) => T)(valueRef.current) : v;
      setValue(resolved);
      // Debounce localStorage writes (300ms)
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        try {
          const serialized = resolved instanceof Set ? JSON.stringify([...resolved]) : JSON.stringify(resolved);
          localStorage.setItem(key, serialized);
        } catch {
          // Quota exceeded — skip
        }
      }, 300);
    },
    [key]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return [value, set];
}

/**
 * Clear all persisted filters for a page prefix.
 * Call with e.g. "ew-filter:squeeze" to clear all squeeze filters.
 */
export function clearPersistedFilters(prefix: string): void {
  if (typeof window === "undefined") return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) toRemove.push(k);
  }
  for (const k of toRemove) localStorage.removeItem(k);
}
