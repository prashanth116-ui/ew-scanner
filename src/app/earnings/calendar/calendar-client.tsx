"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  Search,
  X,
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
type HourFilter = "all" | "bmo" | "amc";

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

const todayISO = toISO(new Date());

function isToday(dateStr: string): boolean {
  return dateStr === todayISO;
}

// ── Formatters ──

function formatEps(val: number | null): string {
  if (val == null) return "\u2014";
  return val >= 0 ? `$${val.toFixed(2)}` : `-$${Math.abs(val).toFixed(2)}`;
}

function formatLargeNumber(val: number | null): string {
  if (val == null) return "\u2014";
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toLocaleString()}`;
}

// ── Small components ──

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

// ── Week View ──

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function WeekView({
  anchor,
  grouped,
  search,
}: {
  anchor: Date;
  grouped: Map<string, CalendarEntry[]>;
  search: string;
}) {
  const mon = getMonday(anchor);
  const days = Array.from({ length: 5 }, (_, i) => toISO(addDays(mon, i)));
  const searchUpper = search.toUpperCase();

  return (
    <div className="grid grid-cols-5 gap-px rounded-lg border border-[#2a2a2a] bg-[#2a2a2a] overflow-hidden">
      {days.map((dateStr, i) => {
        const entries = grouped.get(dateStr) ?? [];
        const today = isToday(dateStr);
        const d = new Date(dateStr + "T12:00:00");
        const bmo = entries.filter((e) => e.hour === "bmo");
        const amc = entries.filter((e) => e.hour === "amc");
        const other = entries.filter(
          (e) => e.hour !== "bmo" && e.hour !== "amc"
        );

        return (
          <div
            key={dateStr}
            className={`flex flex-col bg-[#0f0f0f] ${today ? "bg-[#111]" : ""}`}
          >
            {/* Day header */}
            <div
              className={`flex items-center justify-between px-3 py-2.5 border-b ${
                today
                  ? "border-[#5ba3e6]/40 bg-[#5ba3e6]/5"
                  : "border-[#2a2a2a]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#777]">
                  {WEEKDAY_NAMES[i]}
                </span>
                <span
                  className={`text-sm font-bold ${
                    today ? "text-[#5ba3e6]" : "text-white"
                  }`}
                >
                  {d.getDate()}
                </span>
                {today && (
                  <span className="rounded-full bg-[#5ba3e6] px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
                    TODAY
                  </span>
                )}
              </div>
              <span className="text-[10px] text-[#555]">
                {entries.length > 0 ? entries.length : ""}
              </span>
            </div>

            {/* Scrollable entries */}
            <div className="flex-1 overflow-y-auto min-h-[120px] max-h-[calc(100vh-320px)]">
              {entries.length === 0 && (
                <div className="flex items-center justify-center py-8 text-[#2a2a2a]">
                  <Calendar className="h-5 w-5" />
                </div>
              )}

              {bmo.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                    <Sun className="h-2.5 w-2.5 text-amber-400/60" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/60">
                      Before Open
                    </span>
                  </div>
                  {bmo.map((e) => (
                    <TickerRow
                      key={e.symbol}
                      entry={e}
                      highlighted={
                        searchUpper !== "" &&
                        e.symbol.includes(searchUpper)
                      }
                      dimmed={
                        searchUpper !== "" &&
                        !e.symbol.includes(searchUpper)
                      }
                    />
                  ))}
                </div>
              )}

              {amc.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                    <Moon className="h-2.5 w-2.5 text-indigo-400/60" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/60">
                      After Close
                    </span>
                  </div>
                  {amc.map((e) => (
                    <TickerRow
                      key={e.symbol}
                      entry={e}
                      highlighted={
                        searchUpper !== "" &&
                        e.symbol.includes(searchUpper)
                      }
                      dimmed={
                        searchUpper !== "" &&
                        !e.symbol.includes(searchUpper)
                      }
                    />
                  ))}
                </div>
              )}

              {other.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                    <Clock className="h-2.5 w-2.5 text-[#555]" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#555]">
                      Other
                    </span>
                  </div>
                  {other.map((e) => (
                    <TickerRow
                      key={e.symbol}
                      entry={e}
                      highlighted={
                        searchUpper !== "" &&
                        e.symbol.includes(searchUpper)
                      }
                      dimmed={
                        searchUpper !== "" &&
                        !e.symbol.includes(searchUpper)
                      }
                    />
                  ))}
                </div>
              )}
              {/* bottom spacing */}
              <div className="h-2" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TickerRow({
  entry,
  highlighted,
  dimmed,
}: {
  entry: CalendarEntry;
  highlighted: boolean;
  dimmed: boolean;
}) {
  return (
    <Link
      href={`/earnings?ticker=${entry.symbol}`}
      className={`group flex items-center justify-between gap-1 px-3 py-1.5 transition-colors hover:bg-[#1a1a1a] ${
        highlighted ? "bg-[#5ba3e6]/10" : ""
      } ${dimmed ? "opacity-25" : ""}`}
    >
      <span className="font-mono text-xs font-bold text-[#5ba3e6] group-hover:underline">
        {entry.symbol}
      </span>
      <span className="text-[10px] text-[#555]">
        {formatEps(entry.epsEstimate)}
      </span>
    </Link>
  );
}

// ── Month View ──

function MonthView({
  anchor,
  grouped,
  search,
  onSelectDay,
  selectedDay,
}: {
  anchor: Date;
  grouped: Map<string, CalendarEntry[]>;
  search: string;
  onSelectDay: (dateStr: string | null) => void;
  selectedDay: string | null;
}) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  // Monday=0 offset
  let startDay = firstOfMonth.getDay() - 1;
  if (startDay < 0) startDay = 6;

  const totalDays = lastOfMonth.getDate();
  const cells: (string | null)[] = [];

  // leading blanks
  for (let i = 0; i < startDay; i++) cells.push(null);
  // actual days
  for (let d = 1; d <= totalDays; d++) {
    const iso = toISO(new Date(year, month, d));
    cells.push(iso);
  }
  // trailing blanks to fill last row
  while (cells.length % 7 !== 0) cells.push(null);

  // Find max count for density scaling
  let maxCount = 0;
  for (const [, entries] of grouped) {
    if (entries.length > maxCount) maxCount = entries.length;
  }

  const searchUpper = search.toUpperCase();

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#2a2a2a] overflow-hidden">
      {/* Day name headers */}
      <div className="grid grid-cols-7 gap-px bg-[#2a2a2a]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className={`bg-[#1a1a1a] py-2 text-center text-xs font-semibold ${
              d === "Sat" || d === "Sun" ? "text-[#444]" : "text-[#777]"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="grid grid-cols-7 gap-px bg-[#2a2a2a]">
        {cells.map((dateStr, i) => {
          if (dateStr == null) {
            return <div key={`blank-${i}`} className="bg-[#0a0a0a] min-h-[90px]" />;
          }

          const entries = grouped.get(dateStr) ?? [];
          const today = isToday(dateStr);
          const d = new Date(dateStr + "T12:00:00");
          const dayNum = d.getDate();
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const isSelected = selectedDay === dateStr;
          const hasSearch = searchUpper !== "";
          const matchesSearch =
            hasSearch && entries.some((e) => e.symbol.includes(searchUpper));
          const density = maxCount > 0 ? entries.length / maxCount : 0;

          const bmoCount = entries.filter((e) => e.hour === "bmo").length;
          const amcCount = entries.filter((e) => e.hour === "amc").length;

          return (
            <button
              key={dateStr}
              onClick={() =>
                onSelectDay(isSelected ? null : dateStr)
              }
              className={`relative min-h-[90px] p-1.5 text-left transition-colors ${
                isWeekend ? "bg-[#0a0a0a]" : "bg-[#0f0f0f]"
              } ${today ? "bg-[#111] ring-1 ring-inset ring-[#5ba3e6]/30" : ""} ${
                isSelected
                  ? "ring-1 ring-inset ring-[#5ba3e6] bg-[#5ba3e6]/5"
                  : ""
              } ${
                hasSearch && matchesSearch && !isSelected
                  ? "ring-1 ring-inset ring-[#5ba3e6]/40"
                  : ""
              } hover:bg-[#141414]`}
            >
              {/* Day number + count */}
              <div className="flex items-start justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    today
                      ? "bg-[#5ba3e6] text-white"
                      : isWeekend
                        ? "text-[#444]"
                        : "text-[#a0a0a0]"
                  }`}
                >
                  {dayNum}
                </span>
                {entries.length > 0 && (
                  <span className="text-[10px] font-medium text-[#555]">
                    {entries.length}
                  </span>
                )}
              </div>

              {/* Density bar */}
              {entries.length > 0 && (
                <div className="mt-1 h-1 rounded-full bg-[#1a1a1a]">
                  <div
                    className="h-1 rounded-full bg-[#5ba3e6] transition-all"
                    style={{
                      width: `${Math.max(density * 100, 8)}%`,
                      opacity: 0.3 + density * 0.7,
                    }}
                  />
                </div>
              )}

              {/* BMO/AMC breakdown */}
              {entries.length > 0 && (
                <div className="mt-1 flex gap-2">
                  {bmoCount > 0 && (
                    <span className="text-[9px] text-amber-400/70">
                      {bmoCount} BMO
                    </span>
                  )}
                  {amcCount > 0 && (
                    <span className="text-[9px] text-indigo-400/70">
                      {amcCount} AMC
                    </span>
                  )}
                </div>
              )}

              {/* Ticker previews */}
              {entries.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5">
                  {entries.slice(0, 3).map((e) => (
                    <span
                      key={e.symbol}
                      className={`font-mono text-[9px] ${
                        hasSearch && e.symbol.includes(searchUpper)
                          ? "text-[#5ba3e6] font-bold"
                          : "text-[#666]"
                      }`}
                    >
                      {e.symbol}
                    </span>
                  ))}
                  {entries.length > 3 && (
                    <span className="text-[9px] text-[#444]">
                      +{entries.length - 3}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Day Detail Panel (for month view click) ──

function DayDetail({
  dateStr,
  entries,
  onClose,
}: {
  dateStr: string;
  entries: CalendarEntry[];
  onClose: () => void;
}) {
  const d = new Date(dateStr + "T12:00:00");
  const label = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const today = isToday(dateStr);

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#5ba3e6]" />
          <h3 className="text-sm font-bold text-white">{label}</h3>
          {today && (
            <span className="rounded-full bg-[#5ba3e6] px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
              TODAY
            </span>
          )}
          <span className="text-xs text-[#555]">
            {entries.length} report{entries.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-[#555] hover:bg-[#2a2a2a] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a2a2a] bg-[#141414]">
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
  const [hourFilter, setHourFilter] = useState<HourFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const range =
      view === "week" ? getWeekRange(anchor) : getMonthRange(anchor);
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

  // Clear selected day when switching views or navigating
  useEffect(() => {
    setSelectedDay(null);
  }, [view, anchor]);

  const navigate = (dir: -1 | 1) => {
    setAnchor((prev) =>
      view === "week"
        ? addDays(prev, dir * 7)
        : new Date(prev.getFullYear(), prev.getMonth() + dir, 1)
    );
  };

  const goToday = () => setAnchor(new Date());

  // Filter entries
  const filtered = useMemo(() => {
    if (hourFilter === "all") return entries;
    return entries.filter((e) => e.hour === hourFilter);
  }, [entries, hourFilter]);

  // Group filtered entries by date
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of filtered) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [filtered]);

  const totalDays = grouped.size;

  // Selected day entries for detail panel
  const selectedEntries = selectedDay ? grouped.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="text-center">
        <div className="mx-auto flex items-center justify-center gap-3 mb-3">
          <Calendar className="h-8 w-8 text-[#5ba3e6]" />
          <h1 className="text-3xl font-bold text-white">Earnings Calendar</h1>
        </div>
        <p className="mx-auto max-w-xl text-sm text-[#a0a0a0]">
          Upcoming earnings reports across all stocks. Powered by Finnhub.
        </p>
      </section>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2.5">
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

        {/* Hour filter */}
        <div className="flex rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-0.5">
          {(
            [
              { key: "all", label: "All", icon: null },
              { key: "bmo", label: "BMO", icon: Sun },
              { key: "amc", label: "AMC", icon: Moon },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setHourFilter(key)}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                hourFilter === key
                  ? key === "bmo"
                    ? "bg-amber-500/20 text-amber-400"
                    : key === "amc"
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "bg-[#185FA5] text-white"
                  : "text-[#a0a0a0] hover:text-white"
              }`}
            >
              {Icon && <Icon className="h-3 w-3" />}
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#555]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticker"
            className="w-[130px] rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-1.5 pl-8 pr-3 text-xs text-white placeholder-[#555] focus:border-[#5ba3e6] focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#555] hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      {!loading && !error && filtered.length > 0 && (
        <div className="text-center text-xs text-[#555]">
          {filtered.length} earnings report{filtered.length !== 1 ? "s" : ""}{" "}
          across {totalDays} day{totalDays !== 1 ? "s" : ""}
          {hourFilter !== "all" && (
            <span className="ml-1">
              ({hourFilter === "bmo" ? "Before Market Open" : "After Market Close"} only)
            </span>
          )}
        </div>
      )}

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

      {/* Calendar views */}
      {!loading && !error && (
        <>
          {view === "week" && (
            <WeekView anchor={anchor} grouped={grouped} search={search} />
          )}

          {view === "month" && (
            <div className="space-y-4">
              <MonthView
                anchor={anchor}
                grouped={grouped}
                search={search}
                onSelectDay={setSelectedDay}
                selectedDay={selectedDay}
              />

              {/* Day detail panel */}
              {selectedDay && selectedEntries.length > 0 && (
                <DayDetail
                  dateStr={selectedDay}
                  entries={selectedEntries}
                  onClose={() => setSelectedDay(null)}
                />
              )}

              {selectedDay && selectedEntries.length === 0 && (
                <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-6 text-center">
                  <p className="text-sm text-[#555]">
                    No earnings reports on this day
                    {hourFilter !== "all" && " (with current filter)"}
                  </p>
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="mt-2 text-xs text-[#5ba3e6] hover:underline"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <Calendar className="mx-auto mb-4 h-12 w-12 text-[#2a2a2a]" />
              <p className="text-sm text-[#555]">
                No earnings reports found for this period
                {hourFilter !== "all" && " with the selected filter"}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
