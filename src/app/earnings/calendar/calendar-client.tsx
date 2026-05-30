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
  Bookmark,
  Crosshair,
  SlidersHorizontal,
} from "lucide-react";
import { tierColor, verdictColor } from "@/lib/color-utils";
import type { ConfluenceScanResult, ConfluenceResult } from "@/lib/confluence/types";
import type { SectorRotationResult } from "@/lib/sector-rotation/types";
import type { RotationTrackerResult } from "@/lib/sector-rotation/rotation-types";
import { getAllWatchlistTickers, getTickerWatchlistSources, enrichScanResults, type MomentumQuality } from "@/lib/earnings-utils";

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
  scanResults,
  watchlistTickers,
}: {
  anchor: Date;
  grouped: Map<string, CalendarEntry[]>;
  search: string;
  scanResults: Map<string, ConfluenceResult>;
  watchlistTickers: Set<string> | null;
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
              className={`flex items-center justify-between px-4 py-3.5 border-b ${
                today
                  ? "border-[#5ba3e6]/40 bg-[#5ba3e6]/5"
                  : "border-[#2a2a2a]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#777]">
                  {WEEKDAY_NAMES[i]}
                </span>
                <span
                  className={`text-lg font-bold ${
                    today ? "text-[#5ba3e6]" : "text-white"
                  }`}
                >
                  {d.getDate()}
                </span>
                {today && (
                  <span className="rounded-full bg-[#5ba3e6] px-2 py-0.5 text-[10px] font-bold text-white leading-none">
                    TODAY
                  </span>
                )}
              </div>
              <span className="text-xs text-[#555] font-medium">
                {entries.length > 0 ? `${entries.length} reports` : ""}
              </span>
            </div>

            {/* Scrollable entries */}
            <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[calc(100vh-280px)]">
              {entries.length === 0 && (
                <div className="flex items-center justify-center py-12 text-[#2a2a2a]">
                  <Calendar className="h-6 w-6" />
                </div>
              )}

              {bmo.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                    <Sun className="h-2.5 w-2.5 text-amber-400/60" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400/60">
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
                      scanResult={scanResults.get(e.symbol)}
                      watchlistSources={watchlistTickers?.has(e.symbol) ? getTickerWatchlistSources(e.symbol) : undefined}
                    />
                  ))}
                </div>
              )}

              {amc.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                    <Moon className="h-2.5 w-2.5 text-indigo-400/60" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400/60">
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
                      scanResult={scanResults.get(e.symbol)}
                      watchlistSources={watchlistTickers?.has(e.symbol) ? getTickerWatchlistSources(e.symbol) : undefined}
                    />
                  ))}
                </div>
              )}

              {other.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                    <Clock className="h-2.5 w-2.5 text-[#555]" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#555]">
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
                      scanResult={scanResults.get(e.symbol)}
                      watchlistSources={watchlistTickers?.has(e.symbol) ? getTickerWatchlistSources(e.symbol) : undefined}
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

function QuadrantBadge({ quadrant }: { quadrant: string }) {
  const color = quadrant === "LEADING"
    ? "bg-green-500/10 border-green-500/20 text-green-400"
    : quadrant === "IMPROVING"
      ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
      : quadrant === "WEAKENING"
        ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
        : "bg-red-500/10 border-red-500/20 text-red-400";
  return (
    <span className={`rounded border px-1 py-0.5 text-[9px] font-medium ${color}`}>
      {quadrant.slice(0, 4)}
    </span>
  );
}

function SignalBadge({ signal }: { signal: string }) {
  const color = signal === "strong"
    ? "bg-green-500/10 border-green-500/20 text-green-400"
    : signal === "moderate"
      ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
      : signal === "weak"
        ? "bg-[#2a2a2a] border-[#333] text-[#a0a0a0]"
        : "bg-[#1a1a1a] border-[#222] text-[#555]";
  return (
    <span className={`rounded border px-1 py-0.5 text-[9px] font-medium uppercase ${color}`}>
      {signal}
    </span>
  );
}

function TickerRow({
  entry,
  highlighted,
  dimmed,
  scanResult,
  watchlistSources,
}: {
  entry: CalendarEntry;
  highlighted: boolean;
  dimmed: boolean;
  scanResult?: ConfluenceResult;
  watchlistSources?: string[];
}) {
  return (
    <Link
      href={`/earnings?ticker=${entry.symbol}`}
      className={`group flex items-center gap-2 px-4 py-2 transition-colors hover:bg-[#1a1a1a] ${
        highlighted ? "bg-[#5ba3e6]/10" : ""
      } ${dimmed ? "opacity-25" : ""}`}
    >
      <span className="font-mono text-sm font-bold text-[#5ba3e6] group-hover:underline shrink-0">
        {entry.symbol}
      </span>
      {/* Watchlist source tags */}
      {watchlistSources && watchlistSources.length > 0 && (
        <div className="flex gap-1 shrink-0">
          {watchlistSources.map((src) => (
            <span key={src} className="rounded bg-[#2a2a2a] px-1 py-0.5 text-[9px] text-[#777]">
              {src}
            </span>
          ))}
        </div>
      )}
      {/* Scanner badges (compact) */}
      {scanResult && (
        <div className="flex gap-1 shrink-0">
          {scanResult.ewResult?.wavePosition && (
            <span className="rounded bg-[#2a2a2a] px-1 py-0.5 text-[9px] text-[#a0a0a0]" title={`EW: ${scanResult.ewResult.wavePosition}`}>
              {scanResult.ewResult.wavePosition}
            </span>
          )}
          {scanResult.squeezeResult && (
            <span className={`rounded border px-1 py-0.5 text-[9px] ${tierColor(scanResult.squeezeResult.tier)}`} title={`Squeeze: ${scanResult.squeezeResult.squeezeScore.toFixed(0)}`}>
              SQ
            </span>
          )}
          {scanResult.prerunResult && (
            <span className={`rounded border px-1 py-0.5 text-[9px] ${verdictColor(scanResult.prerunResult.verdict)}`} title={`Pre-Run: ${scanResult.prerunResult.verdict}`}>
              PR
            </span>
          )}
          {scanResult.sectorResult && (
            <QuadrantBadge quadrant={scanResult.sectorResult.quadrant} />
          )}
        </div>
      )}
      <span className="ml-auto text-xs text-[#555] shrink-0">
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
  scanResults,
}: {
  anchor: Date;
  grouped: Map<string, CalendarEntry[]>;
  search: string;
  onSelectDay: (dateStr: string | null) => void;
  selectedDay: string | null;
  scanResults: Map<string, ConfluenceResult>;
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
            className={`bg-[#1a1a1a] py-3 text-center text-sm font-semibold ${
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
            return <div key={`blank-${i}`} className="bg-[#0a0a0a] min-h-[130px]" />;
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
              className={`relative min-h-[130px] p-2.5 text-left transition-colors ${
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
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
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
                  <span className="text-xs font-medium text-[#555]">
                    {entries.length}
                  </span>
                )}
              </div>

              {/* Density bar */}
              {entries.length > 0 && (
                <div className="mt-1.5 h-1.5 rounded-full bg-[#1a1a1a]">
                  <div
                    className="h-1.5 rounded-full bg-[#5ba3e6] transition-all"
                    style={{
                      width: `${Math.max(density * 100, 8)}%`,
                      opacity: 0.3 + density * 0.7,
                    }}
                  />
                </div>
              )}

              {/* BMO/AMC breakdown */}
              {entries.length > 0 && (
                <div className="mt-2 flex gap-2.5">
                  {bmoCount > 0 && (
                    <span className="text-[11px] text-amber-400/70">
                      {bmoCount} BMO
                    </span>
                  )}
                  {amcCount > 0 && (
                    <span className="text-[11px] text-indigo-400/70">
                      {amcCount} AMC
                    </span>
                  )}
                </div>
              )}

              {/* Ticker previews */}
              {entries.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                  {entries.slice(0, 4).map((e) => {
                    const isScanned = scanResults.has(e.symbol);
                    return (
                      <span
                        key={e.symbol}
                        className={`font-mono text-[11px] ${
                          hasSearch && e.symbol.includes(searchUpper)
                            ? "text-[#5ba3e6] font-bold"
                            : isScanned
                              ? "text-[#5ba3e6]/70"
                              : "text-[#666]"
                        }`}
                      >
                        {e.symbol}
                      </span>
                    );
                  })}
                  {entries.length > 4 && (
                    <span className="text-[11px] text-[#444]">
                      +{entries.length - 4}
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

type SortKey = "ticker" | "time" | "eps" | "revenue" | "quarter" | "sector" | "quadrant" | "signal";
type SortDir = "asc" | "desc";

const HOUR_ORDER: Record<string, number> = { bmo: 0, dmh: 1, amc: 2 };
const QUADRANT_ORDER: Record<string, number> = { LEADING: 0, IMPROVING: 1, WEAKENING: 2, LAGGING: 3 };
const SIGNAL_ORDER: Record<string, number> = { strong: 0, moderate: 1, weak: 2, none: 3 };

function DayDetail({
  dateStr,
  entries,
  onClose,
  scanResults,
}: {
  dateStr: string;
  entries: CalendarEntry[];
  onClose: () => void;
  scanResults: Map<string, ConfluenceResult>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterSector, setFilterSector] = useState<string>("all");
  const [filterQuadrant, setFilterQuadrant] = useState<string>("all");
  const [filterSignal, setFilterSignal] = useState<string>("all");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" ? "asc" : "desc");
    }
  };

  // Collect unique sectors/quadrants/signals for filter dropdowns
  const filterOptions = useMemo(() => {
    const sectors = new Set<string>();
    const quadrants = new Set<string>();
    const signals = new Set<string>();
    for (const e of entries) {
      const sr = scanResults.get(e.symbol);
      if (sr?.sector) sectors.add(sr.sector);
      if (sr?.sectorResult?.quadrant) quadrants.add(sr.sectorResult.quadrant);
      if (sr?.signal) signals.add(sr.signal);
    }
    return {
      sectors: [...sectors].sort(),
      quadrants: ["LEADING", "IMPROVING", "WEAKENING", "LAGGING"].filter((q) => quadrants.has(q)),
      signals: ["strong", "moderate", "weak", "none"].filter((s) => signals.has(s)),
    };
  }, [entries, scanResults]);

  const hasFilters = filterSector !== "all" || filterQuadrant !== "all" || filterSignal !== "all";
  const hasScanData = scanResults.size > 0;

  const filtered = useMemo(() => {
    let result = entries;
    if (filterSector !== "all") {
      result = result.filter((e) => scanResults.get(e.symbol)?.sector === filterSector);
    }
    if (filterQuadrant !== "all") {
      result = result.filter((e) => scanResults.get(e.symbol)?.sectorResult?.quadrant === filterQuadrant);
    }
    if (filterSignal !== "all") {
      result = result.filter((e) => scanResults.get(e.symbol)?.signal === filterSignal);
    }
    return result;
  }, [entries, filterSector, filterQuadrant, filterSignal, scanResults]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      switch (sortKey) {
        case "ticker":
          return dir * a.symbol.localeCompare(b.symbol);
        case "time":
          return dir * ((HOUR_ORDER[a.hour] ?? 3) - (HOUR_ORDER[b.hour] ?? 3));
        case "eps":
          return dir * ((a.epsEstimate ?? -Infinity) - (b.epsEstimate ?? -Infinity));
        case "revenue":
          return dir * ((a.revenueEstimate ?? -Infinity) - (b.revenueEstimate ?? -Infinity));
        case "quarter":
          return dir * ((a.quarter ?? 0) - (b.quarter ?? 0));
        case "sector": {
          const sA = scanResults.get(a.symbol)?.sector ?? "zzz";
          const sB = scanResults.get(b.symbol)?.sector ?? "zzz";
          return dir * sA.localeCompare(sB);
        }
        case "quadrant": {
          const qA = QUADRANT_ORDER[scanResults.get(a.symbol)?.sectorResult?.quadrant ?? ""] ?? 9;
          const qB = QUADRANT_ORDER[scanResults.get(b.symbol)?.sectorResult?.quadrant ?? ""] ?? 9;
          return dir * (qA - qB);
        }
        case "signal": {
          const sigA = SIGNAL_ORDER[scanResults.get(a.symbol)?.signal ?? ""] ?? 9;
          const sigB = SIGNAL_ORDER[scanResults.get(b.symbol)?.signal ?? ""] ?? 9;
          return dir * (sigA - sigB);
        }
        default:
          return 0;
      }
    });
    return copy;
  }, [filtered, sortKey, sortDir, scanResults]);

  const d = new Date(dateStr + "T12:00:00");
  const label = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const today = isToday(dateStr);

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ChevronRight className="h-3 w-3 text-[#333] rotate-90" />;
    return sortDir === "asc"
      ? <ChevronLeft className="h-3 w-3 text-[#5ba3e6] rotate-90" />
      : <ChevronRight className="h-3 w-3 text-[#5ba3e6] rotate-90" />;
  };

  const thClass = (key: SortKey, base: string) =>
    `${base} cursor-pointer select-none hover:text-[#5ba3e6] transition-colors ${sortKey === key ? "text-[#5ba3e6]" : "text-white"}`;

  const selectClass = "rounded-md border border-[#2a2a2a] bg-[#141414] px-2 py-1 text-xs text-white focus:border-[#5ba3e6] focus:outline-none appearance-none cursor-pointer";

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
            {hasFilters ? `${filtered.length} of ${entries.length}` : entries.length} report{(hasFilters ? filtered.length : entries.length) !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-[#555] hover:bg-[#2a2a2a] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filters */}
      {hasScanData && (
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#2a2a2a] px-4 py-2.5">
          <SlidersHorizontal className="h-3.5 w-3.5 text-[#555]" />
          <select
            value={filterSector}
            onChange={(e) => setFilterSector(e.target.value)}
            className={`${selectClass} ${filterSector !== "all" ? "border-[#5ba3e6]/40 text-[#5ba3e6]" : ""}`}
          >
            <option value="all">All Sectors</option>
            {filterOptions.sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filterQuadrant}
            onChange={(e) => setFilterQuadrant(e.target.value)}
            className={`${selectClass} ${filterQuadrant !== "all" ? "border-[#5ba3e6]/40 text-[#5ba3e6]" : ""}`}
          >
            <option value="all">All Quadrants</option>
            {filterOptions.quadrants.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
          <select
            value={filterSignal}
            onChange={(e) => setFilterSignal(e.target.value)}
            className={`${selectClass} ${filterSignal !== "all" ? "border-[#5ba3e6]/40 text-[#5ba3e6]" : ""}`}
          >
            <option value="all">All Signals</option>
            {filterOptions.signals.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={() => { setFilterSector("all"); setFilterQuadrant("all"); setFilterSignal("all"); }}
              className="text-xs text-[#555] hover:text-[#a0a0a0]"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a2a2a] bg-[#141414]">
              <th
                className={thClass("ticker", "px-3 py-2 text-left font-semibold")}
                onClick={() => handleSort("ticker")}
              >
                <span className="inline-flex items-center gap-1">Ticker {sortIcon("ticker")}</span>
              </th>
              <th
                className={thClass("time", "px-3 py-2 text-center font-semibold")}
                onClick={() => handleSort("time")}
              >
                <span className="inline-flex items-center justify-center gap-1">Time {sortIcon("time")}</span>
              </th>
              <th
                className={thClass("eps", "px-3 py-2 text-right font-semibold")}
                onClick={() => handleSort("eps")}
              >
                <span className="inline-flex items-center justify-end gap-1">EPS Est. {sortIcon("eps")}</span>
              </th>
              <th
                className={thClass("revenue", "hidden px-3 py-2 text-right font-semibold sm:table-cell")}
                onClick={() => handleSort("revenue")}
              >
                <span className="inline-flex items-center justify-end gap-1">Rev. Est. {sortIcon("revenue")}</span>
              </th>
              <th
                className={thClass("quarter", "hidden px-3 py-2 text-center font-semibold sm:table-cell")}
                onClick={() => handleSort("quarter")}
              >
                <span className="inline-flex items-center justify-center gap-1">Qtr {sortIcon("quarter")}</span>
              </th>
              <th
                className={thClass("sector", "hidden px-3 py-2 text-left font-semibold lg:table-cell")}
                onClick={() => handleSort("sector")}
              >
                <span className="inline-flex items-center gap-1">Sector {sortIcon("sector")}</span>
              </th>
              <th
                className={thClass("quadrant", "hidden px-3 py-2 text-center font-semibold lg:table-cell")}
                onClick={() => handleSort("quadrant")}
              >
                <span className="inline-flex items-center justify-center gap-1">Quadrant {sortIcon("quadrant")}</span>
              </th>
              <th
                className={thClass("signal", "hidden px-3 py-2 text-center font-semibold lg:table-cell")}
                onClick={() => handleSort("signal")}
              >
                <span className="inline-flex items-center justify-center gap-1">Signal {sortIcon("signal")}</span>
              </th>
              <th className="hidden px-3 py-2 text-center font-semibold text-white sm:table-cell">
                Scanners
              </th>
              <th className="px-3 py-2 text-center font-semibold text-white">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {sorted.map((e, i) => {
              const sr = scanResults.get(e.symbol);
              return (
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
                  <td className="hidden px-3 py-2 text-left text-xs text-[#a0a0a0] lg:table-cell">
                    {sr?.sector ?? "\u2014"}
                  </td>
                  <td className="hidden px-3 py-2 text-center lg:table-cell">
                    {sr?.sectorResult ? (
                      <QuadrantBadge quadrant={sr.sectorResult.quadrant} />
                    ) : (
                      <span className="text-[10px] text-[#333]">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 text-center lg:table-cell">
                    {sr ? (
                      <SignalBadge signal={sr.signal} />
                    ) : (
                      <span className="text-[10px] text-[#333]">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 text-center sm:table-cell">
                    {sr ? (
                      <div className="flex items-center justify-center gap-1">
                        {sr.ewResult?.wavePosition && (
                          <span className="rounded bg-[#2a2a2a] px-1 py-0.5 text-[9px] text-[#a0a0a0]">
                            {sr.ewResult.wavePosition}
                          </span>
                        )}
                        {sr.squeezeResult && (
                          <span className={`rounded border px-1 py-0.5 text-[9px] ${tierColor(sr.squeezeResult.tier)}`}>
                            SQ:{sr.squeezeResult.tier}
                          </span>
                        )}
                        {sr.prerunResult && (
                          <span className={`rounded border px-1 py-0.5 text-[9px] ${verdictColor(sr.prerunResult.verdict)}`}>
                            {sr.prerunResult.verdict}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-[#333]">{"\u2014"}</span>
                    )}
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
              );
            })}
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
  const [watchlistFilter, setWatchlistFilter] = useState(false);
  const [watchlistTickers, setWatchlistTickers] = useState<Set<string> | null>(null);
  const [scanResults, setScanResults] = useState<Map<string, ConfluenceResult>>(new Map());
  const [scanLoading, setScanLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState("");

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

  // Load watchlist tickers when toggle is activated
  const handleWatchlistToggle = useCallback(() => {
    setWatchlistFilter((prev) => {
      if (!prev) {
        setWatchlistTickers(getAllWatchlistTickers());
      }
      return !prev;
    });
  }, []);

  // Scan ALL visible tickers via confluence + sector + rotation APIs (batched)
  const handleScanEarnings = useCallback(async () => {
    const allTickers = [...new Set(entries.map((e) => e.symbol))];
    if (allTickers.length === 0) return;
    setScanLoading(true);
    setScanProgress(`0/${allTickers.length}`);
    try {
      // Fetch sector + rotation once (shared across all batches)
      const [sectorSettled, rotSettled] = await Promise.allSettled([
        fetch("/api/sector-rotation")
          .then((res) => (res.ok ? res.json() as Promise<SectorRotationResult> : null)),
        fetch("/api/rotation-tracker")
          .then((res) => (res.ok ? res.json() as Promise<RotationTrackerResult> : null)),
      ]);

      const sectorScores = sectorSettled.status === "fulfilled" && sectorSettled.value
        ? sectorSettled.value.sectors
        : [];

      const rotStockMap = new Map<string, MomentumQuality>();
      if (rotSettled.status === "fulfilled" && rotSettled.value) {
        for (const rotation of rotSettled.value.activeRotations) {
          for (const s of rotation.stocks) {
            rotStockMap.set(s.symbol, {
              rsAcceleration: s.rsAcceleration,
              rsImproving: s.rsImproving,
              rsDelta: s.rsDelta,
              volumeConsistency: s.volumeConsistency,
            });
          }
        }
      }

      // Batch tickers into groups of 25, scan in parallel batches of 2
      const BATCH_SIZE = 25;
      const PARALLEL_BATCHES = 2;
      const allRawResults: ConfluenceScanResult[] = [];
      let scanned = 0;

      for (let i = 0; i < allTickers.length; i += BATCH_SIZE * PARALLEL_BATCHES) {
        const batchGroup: string[][] = [];
        for (let j = 0; j < PARALLEL_BATCHES; j++) {
          const start = i + j * BATCH_SIZE;
          const batch = allTickers.slice(start, start + BATCH_SIZE);
          if (batch.length > 0) batchGroup.push(batch);
        }

        const batchResults = await Promise.allSettled(
          batchGroup.map((batch) =>
            fetch("/api/confluence/scan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tickers: batch }),
            }).then((res) => (res.ok ? res.json() : null))
          )
        );

        for (const settled of batchResults) {
          if (settled.status === "fulfilled" && settled.value?.results) {
            allRawResults.push(...settled.value.results);
          }
        }

        scanned = Math.min(i + BATCH_SIZE * PARALLEL_BATCHES, allTickers.length);
        setScanProgress(`${scanned}/${allTickers.length}`);
      }

      const enriched = enrichScanResults(allRawResults, sectorScores, rotStockMap);
      const map = new Map<string, ConfluenceResult>();
      for (const r of enriched) {
        map.set(r.ticker, r);
      }
      setScanResults(map);
    } catch {
      // silently fail
    } finally {
      setScanLoading(false);
      setScanProgress("");
    }
  }, [entries]);

  // Filter entries
  const filtered = useMemo(() => {
    let result = entries;
    if (hourFilter !== "all") {
      result = result.filter((e) => e.hour === hourFilter);
    }
    if (watchlistFilter && watchlistTickers) {
      result = result.filter((e) => watchlistTickers.has(e.symbol));
    }
    return result;
  }, [entries, hourFilter, watchlistFilter, watchlistTickers]);

  // Group filtered entries by date with smart sorting
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of filtered) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    // Sort entries within each day: scanner score desc -> watchlist membership -> alpha
    for (const [date, list] of map) {
      list.sort((a, b) => {
        // Scanner score (higher first)
        const scoreA = scanResults.get(a.symbol)?.squeezeResult?.squeezeScore ?? -1;
        const scoreB = scanResults.get(b.symbol)?.squeezeResult?.squeezeScore ?? -1;
        if (scoreA !== scoreB) return scoreB - scoreA;
        // Watchlist membership
        const wlA = watchlistTickers?.has(a.symbol) ? 1 : 0;
        const wlB = watchlistTickers?.has(b.symbol) ? 1 : 0;
        if (wlA !== wlB) return wlB - wlA;
        // Alphabetical fallback
        return a.symbol.localeCompare(b.symbol);
      });
      map.set(date, list);
    }
    return map;
  }, [filtered, scanResults, watchlistTickers]);

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

        {/* Watchlist filter */}
        <button
          onClick={handleWatchlistToggle}
          className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            watchlistFilter
              ? "border-[#5ba3e6]/40 bg-[#5ba3e6]/10 text-[#5ba3e6]"
              : "border-[#2a2a2a] text-[#a0a0a0] hover:text-white hover:bg-[#1a1a1a]"
          }`}
        >
          <Bookmark className="h-3 w-3" />
          My Watchlists
        </button>

        {/* Scan earnings */}
        <button
          onClick={handleScanEarnings}
          disabled={scanLoading || entries.length === 0}
          className="flex items-center gap-1 rounded-md border border-[#2a2a2a] px-2.5 py-1.5 text-xs font-semibold text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white disabled:opacity-50 transition-colors"
        >
          {scanLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Crosshair className="h-3 w-3" />
          )}
          {scanLoading ? `Scanning${scanProgress ? ` ${scanProgress}` : "..."}` : "Scan Earnings"}
        </button>
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
            <WeekView anchor={anchor} grouped={grouped} search={search} scanResults={scanResults} watchlistTickers={watchlistFilter ? watchlistTickers : null} />
          )}

          {view === "month" && (
            <div className="space-y-4">
              <MonthView
                anchor={anchor}
                grouped={grouped}
                search={search}
                onSelectDay={setSelectedDay}
                selectedDay={selectedDay}
                scanResults={scanResults}
              />

              {/* Day detail panel */}
              {selectedDay && selectedEntries.length > 0 && (
                <DayDetail
                  dateStr={selectedDay}
                  entries={selectedEntries}
                  onClose={() => setSelectedDay(null)}
                  scanResults={scanResults}
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
