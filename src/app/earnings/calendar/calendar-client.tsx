"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sun,
  Moon,
  Clock,
  ExternalLink,
} from "lucide-react";

// ── Types ──

interface CalendarEntry {
  date: string;
  symbol: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  hour: string;
  quarter: number | null;
  year: number | null;
}

interface CalendarResponse {
  from: string;
  to: string;
  count: number;
  entries: CalendarEntry[];
  error?: string;
  hint?: string;
}

type ViewMode = "week" | "month";

// ── Date helpers ──

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function getWeekRange(anchor: Date): { from: string; to: string } {
  const mon = getMonday(anchor);
  const fri = addDays(mon, 4);
  return { from: toISO(mon), to: toISO(fri) };
}

function getMonthRange(anchor: Date): { from: string; to: string } {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { from: toISO(first), to: toISO(last) };
}

function formatWeekLabel(anchor: Date): string {
  const { from, to } = getWeekRange(anchor);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const f = new Date(from + "T12:00:00");
  const t = new Date(to + "T12:00:00");
  return `${f.toLocaleDateString("en-US", opts)} \u2013 ${t.toLocaleDateString("en-US", opts)}, ${t.getFullYear()}`;
}

function formatMonthLabel(anchor: Date): string {
  return anchor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isToday(dateStr: string): boolean {
  return dateStr === toISO(new Date());
}

// ── Formatters ──

function formatLargeNumber(val: number | null): string {
  if (val == null) return "\u2014";
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toLocaleString()}`;
}

function formatEps(val: number | null): string {
  if (val == null) return "\u2014";
  return val >= 0 ? `$${val.toFixed(2)}` : `-$${Math.abs(val).toFixed(2)}`;
}

// ── Components ──

function HourBadge({ hour }: { hour: string }) {
  if (hour === "bmo")
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400"
        title="Before Market Open"
      >
        <Sun className="h-2.5 w-2.5" /> BMO
      </span>
    );
  if (hour === "amc")
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-400"
        title="After Market Close"
      >
        <Moon className="h-2.5 w-2.5" /> AMC
      </span>
    );
  if (hour === "dmh")
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-[#2a2a2a] px-1.5 py-0.5 text-[10px] text-[#a0a0a0]"
        title="During Market Hours"
      >
        <Clock className="h-2.5 w-2.5" /> DMH
      </span>
    );
  return null;
}

function DaySection({
  dateStr,
  entries,
}: {
  dateStr: string;
  entries: CalendarEntry[];
}) {
  const today = isToday(dateStr);
  return (
    <div>
      <div
        className={`mb-2 flex items-center gap-2 ${today ? "text-[#5ba3e6]" : "text-[#a0a0a0]"}`}
      >
        <Calendar className="h-4 w-4" />
        <h3 className="text-sm font-bold">
          {formatDayHeader(dateStr)}
          {today && (
            <span className="ml-2 rounded-full bg-[#5ba3e6]/10 border border-[#5ba3e6]/20 px-2 py-0.5 text-[10px] text-[#5ba3e6]">
              Today
            </span>
          )}
        </h3>
        <span className="text-xs text-[#555]">{entries.length} reports</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a]">
              <th className="px-3 py-2 text-left font-semibold text-white">
                Ticker
              </th>
              <th className="px-3 py-2 text-center font-semibold text-white">
                Time
              </th>
              <th className="px-3 py-2 text-right font-semibold text-white">
                EPS Est.
              </th>
              <th className="hidden px-3 py-2 text-right font-semibold text-white sm:table-cell">
                Rev. Est.
              </th>
              <th className="hidden px-3 py-2 text-center font-semibold text-white sm:table-cell">
                Qtr
              </th>
              <th className="px-3 py-2 text-center font-semibold text-white">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {entries.map((e, i) => (
              <tr key={i} className="bg-[#141414] hover:bg-[#1a1a1a]">
                <td className="px-3 py-2">
                  <span className="font-mono text-xs font-bold text-[#5ba3e6]">
                    {e.symbol}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <HourBadge hour={e.hour} />
                </td>
                <td className="px-3 py-2 text-right text-[#a0a0a0]">
                  {formatEps(e.epsEstimate)}
                </td>
                <td className="hidden px-3 py-2 text-right text-[#a0a0a0] sm:table-cell">
                  {formatLargeNumber(e.revenueEstimate)}
                </td>
                <td className="hidden px-3 py-2 text-center text-[#777] sm:table-cell">
                  {e.quarter != null ? `Q${e.quarter}` : "\u2014"}
                </td>
                <td className="px-3 py-2 text-center">
                  <Link
                    href={`/earnings?ticker=${e.symbol}`}
                    className="inline-flex items-center gap-1 text-xs text-[#5ba3e6] hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main ──

export function CalendarClient() {
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const range = view === "week" ? getWeekRange(anchor) : getMonthRange(anchor);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/earnings/calendar?from=${range.from}&to=${range.to}`
      );
      const body: CalendarResponse = await res.json();
      if (!res.ok) {
        throw new Error(
          body.hint
            ? `${body.error} — ${body.hint}`
            : body.error || "Failed to load calendar"
        );
      }
      setEntries(body.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [view, anchor]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const navigate = (dir: -1 | 1) => {
    setAnchor((prev) =>
      view === "week"
        ? addDays(prev, dir * 7)
        : new Date(prev.getFullYear(), prev.getMonth() + dir, 1)
    );
  };

  const goToday = () => setAnchor(new Date());

  // Group entries by date
  const grouped = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    const list = grouped.get(e.date) ?? [];
    list.push(e);
    grouped.set(e.date, list);
  }
  const sortedDates = [...grouped.keys()].sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="text-center">
        <div className="mx-auto flex items-center justify-center gap-3 mb-4">
          <Calendar className="h-8 w-8 text-[#5ba3e6]" />
          <h1 className="text-3xl font-bold text-white">Earnings Calendar</h1>
        </div>
        <p className="mx-auto max-w-xl text-sm text-[#a0a0a0]">
          Upcoming earnings reports across all stocks. Powered by Finnhub.
        </p>
      </section>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* View toggle */}
        <div className="flex rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-0.5">
          <button
            onClick={() => setView("week")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              view === "week"
                ? "bg-[#185FA5] text-white"
                : "text-[#a0a0a0] hover:text-white"
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setView("month")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              view === "month"
                ? "bg-[#185FA5] text-white"
                : "text-[#a0a0a0] hover:text-white"
            }`}
          >
            Month
          </button>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="rounded-md border border-[#2a2a2a] p-1.5 text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
            aria-label={`Previous ${view}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[200px] text-center text-sm font-semibold text-white">
            {view === "week"
              ? formatWeekLabel(anchor)
              : formatMonthLabel(anchor)}
          </span>
          <button
            onClick={() => navigate(1)}
            className="rounded-md border border-[#2a2a2a] p-1.5 text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
            aria-label={`Next ${view}`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={goToday}
          className="rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs font-semibold text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
        >
          Today
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#5ba3e6]" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-auto max-w-lg rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {!loading && !error && entries.length > 0 && (
        <div className="space-y-6">
          <div className="text-center text-xs text-[#555]">
            {entries.length} earnings report{entries.length !== 1 ? "s" : ""}{" "}
            across {sortedDates.length} day{sortedDates.length !== 1 ? "s" : ""}
          </div>
          {sortedDates.map((date) => (
            <DaySection
              key={date}
              dateStr={date}
              entries={grouped.get(date)!}
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && entries.length === 0 && (
        <div className="py-16 text-center">
          <Calendar className="mx-auto mb-4 h-12 w-12 text-[#2a2a2a]" />
          <p className="text-sm text-[#555]">
            No earnings reports found for this period
          </p>
        </div>
      )}
    </div>
  );
}
