/**
 * Catalyst calendar: static macro events + dynamic earnings from Finnhub.
 * SERVER-ONLY: Used by scan orchestrator and cron.
 */

import "server-only";

import { fetchEarningsCalendar } from "@/lib/earnings-calendar";
import type { CatalystCalendarEvent, CatalystEventType } from "./types";

// ── Static Macro Events (update quarterly) ──

interface MacroEvent {
  date: string; // YYYY-MM-DD
  type: CatalystEventType;
  label: string;
}

const MACRO_EVENTS: MacroEvent[] = [
  // FOMC 2026
  { date: "2026-06-17", type: "fomc", label: "FOMC Meeting" },
  { date: "2026-07-29", type: "fomc", label: "FOMC Meeting" },
  { date: "2026-09-16", type: "fomc", label: "FOMC Meeting" },
  { date: "2026-11-04", type: "fomc", label: "FOMC Meeting" },
  { date: "2026-12-16", type: "fomc", label: "FOMC Meeting" },

  // OPEX 2026
  { date: "2026-06-20", type: "opex", label: "June OPEX" },
  { date: "2026-07-18", type: "opex", label: "July OPEX" },
  { date: "2026-08-22", type: "opex", label: "August OPEX" },
  { date: "2026-09-19", type: "opex", label: "September OPEX" },
  { date: "2026-10-17", type: "opex", label: "October OPEX" },
  { date: "2026-11-21", type: "opex", label: "November OPEX" },
  { date: "2026-12-19", type: "opex", label: "December OPEX" },

  // Russell Rebalance
  { date: "2026-06-26", type: "russell", label: "Russell Rebalance" },

  // S&P Rebalance (quarterly)
  { date: "2026-06-19", type: "sp_rebalance", label: "S&P Rebalance" },
  { date: "2026-09-18", type: "sp_rebalance", label: "S&P Rebalance" },
  { date: "2026-12-18", type: "sp_rebalance", label: "S&P Rebalance" },

  // CPI
  { date: "2026-06-10", type: "cpi", label: "CPI Report" },
  { date: "2026-07-15", type: "cpi", label: "CPI Report" },
  { date: "2026-08-12", type: "cpi", label: "CPI Report" },
  { date: "2026-09-10", type: "cpi", label: "CPI Report" },
  { date: "2026-10-14", type: "cpi", label: "CPI Report" },
  { date: "2026-11-10", type: "cpi", label: "CPI Report" },
  { date: "2026-12-10", type: "cpi", label: "CPI Report" },

  // Jobs Report (first Friday of month)
  { date: "2026-06-05", type: "jobs", label: "Jobs Report" },
  { date: "2026-07-02", type: "jobs", label: "Jobs Report" },
  { date: "2026-08-07", type: "jobs", label: "Jobs Report" },
  { date: "2026-09-04", type: "jobs", label: "Jobs Report" },
  { date: "2026-10-02", type: "jobs", label: "Jobs Report" },
  { date: "2026-11-06", type: "jobs", label: "Jobs Report" },
  { date: "2026-12-04", type: "jobs", label: "Jobs Report" },
];

function daysBetween(dateStr: string, now: Date): number {
  const target = new Date(dateStr + "T00:00:00Z");
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

/**
 * Get upcoming catalyst events, merging static macro events
 * with dynamic earnings from Finnhub.
 */
export async function getUpcomingCatalysts(
  symbols?: string[],
  limit = 20
): Promise<CatalystCalendarEvent[]> {
  const now = new Date();
  const events: CatalystCalendarEvent[] = [];

  // Add macro events that are in the future (or today)
  for (const event of MACRO_EVENTS) {
    const days = daysBetween(event.date, now);
    if (days >= 0 && days <= 60) {
      events.push({
        date: event.date,
        type: event.type,
        label: event.label,
        daysAway: days,
      });
    }
  }

  // Add earnings from Finnhub (next 45 days)
  const from = now.toISOString().slice(0, 10);
  const to = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const earnings = await fetchEarningsCalendar(from, to);
  if (earnings) {
    // Filter to only universe symbols if provided
    const symbolSet = symbols ? new Set(symbols.map((s) => s.toUpperCase())) : null;
    for (const e of earnings) {
      if (symbolSet && !symbolSet.has(e.symbol.toUpperCase())) continue;
      const days = daysBetween(e.date, now);
      if (days >= 0) {
        events.push({
          date: e.date,
          type: "earnings",
          label: `${e.symbol} Earnings${e.hour === "bmo" ? " (BMO)" : e.hour === "amc" ? " (AMC)" : ""}`,
          symbol: e.symbol,
          daysAway: days,
        });
      }
    }
  }

  // Sort by date, then by type priority
  const typePriority: Record<CatalystEventType, number> = {
    earnings: 0,
    fomc: 1,
    cpi: 2,
    jobs: 3,
    opex: 4,
    russell: 5,
    sp_rebalance: 6,
  };

  events.sort((a, b) => {
    const d = a.daysAway - b.daysAway;
    if (d !== 0) return d;
    return (typePriority[a.type] ?? 9) - (typePriority[b.type] ?? 9);
  });

  return events.slice(0, limit);
}

/**
 * Get days to the nearest catalyst for a specific symbol.
 * Checks both symbol-specific earnings and upcoming macro events.
 */
export async function getDaysToCatalyst(symbol: string): Promise<{
  days: number;
  label: string;
} | null> {
  const events = await getUpcomingCatalysts([symbol], 50);

  // Find the nearest event: prefer symbol-specific earnings, then any macro event
  const earningsEvent = events.find(
    (e) => e.type === "earnings" && e.symbol?.toUpperCase() === symbol.toUpperCase()
  );
  const macroEvent = events.find((e) => e.type !== "earnings");

  if (earningsEvent && macroEvent) {
    // Return whichever is closer
    if (earningsEvent.daysAway <= macroEvent.daysAway) {
      return { days: earningsEvent.daysAway, label: earningsEvent.label };
    }
    return { days: macroEvent.daysAway, label: macroEvent.label };
  }

  if (earningsEvent) {
    return { days: earningsEvent.daysAway, label: earningsEvent.label };
  }

  if (macroEvent) {
    return { days: macroEvent.daysAway, label: macroEvent.label };
  }

  return null;
}
