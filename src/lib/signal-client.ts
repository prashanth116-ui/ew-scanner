/**
 * Client-side utilities for recording signals and fetching hit rates.
 * Calls /api/signals for persistence. Gracefully handles failures.
 */

export interface ClientSignal {
  scanner: "ew" | "squeeze" | "confluence" | "prerun" | "strat";
  ticker: string;
  signal_date: string; // YYYY-MM-DD
  price_at_signal: number;
  mode?: string;
  signal_strength?: string;
  score?: number;
  target1?: number;
  target2?: number;
  target3?: number;
  invalidation?: number;
}

export interface HitRateEntry {
  scanner: string;
  mode: string | null;
  signal_strength: string | null;
  period_days: number;
  total_signals: number;
  hit_count: number;
  hit_rate: number;
  avg_return_pct: number;
  avg_max_drawdown_pct: number;
}

/**
 * Record scan signals to Supabase via API.
 * Fire-and-forget: never blocks the scan flow.
 */
export async function recordSignals(signals: ClientSignal[]): Promise<void> {
  if (signals.length === 0) return;
  try {
    await fetch("/api/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signals }),
    });
  } catch {
    // Non-critical — localStorage continues as backup
  }
}

/**
 * Fetch pre-computed hit rates for a scanner mode.
 * Returns empty array if unavailable.
 */
export async function fetchClientHitRates(
  scanner: string,
  mode?: string,
  strength?: string
): Promise<HitRateEntry[]> {
  try {
    const params = new URLSearchParams({ scanner });
    if (mode) params.set("mode", mode);
    if (strength) params.set("strength", strength);

    const res = await fetch(`/api/signals?${params.toString()}`);
    if (!res.ok) return [];

    const data = await res.json();
    return data.rates ?? [];
  } catch {
    return [];
  }
}
