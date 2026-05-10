"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type {
  RotationTrackerResult,
  ActiveRotationDetail,
  RotationEvent,
  RotationPatternStats,
  RotationStockPerformance,
} from "@/lib/sector-rotation/rotation-types";

// ── localStorage cache (4-hour TTL) ──

const CACHE_KEY = "ew-rotation-tracker-v1";
const CACHE_TTL = 4 * 60 * 60 * 1000;

function loadCached(): RotationTrackerResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as RotationTrackerResult;
  } catch {
    return null;
  }
}

function saveCache(data: RotationTrackerResult) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // localStorage full — ignore
  }
}

// ── Data freshness badge ──

function timeAgo(isoDate: string): {
  text: string;
  stale: boolean;
  veryStale: boolean;
} {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let text: string;
  if (mins < 1) text = "just now";
  else if (mins < 60) text = `${mins}m ago`;
  else if (hours < 24) text = `${hours}h ago`;
  else text = `${days}d ago`;

  return { text, stale: hours >= 6, veryStale: hours >= 24 };
}

function DataAgeBadge({ calculatedAt }: { calculatedAt: string }) {
  const [age, setAge] = useState(() => timeAgo(calculatedAt));

  useEffect(() => {
    setAge(timeAgo(calculatedAt));
    const interval = setInterval(() => setAge(timeAgo(calculatedAt)), 60_000);
    return () => clearInterval(interval);
  }, [calculatedAt]);

  if (age.veryStale) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
        <AlertTriangle className="h-3 w-3" />
        {age.text} — data is stale
      </span>
    );
  }
  if (age.stale) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
        <Clock className="h-3 w-3" />
        {age.text}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[#888]">
      <Clock className="h-3 w-3" />
      {age.text}
    </span>
  );
}

// ── Signal dot indicator ──

function SignalDot({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        active
          ? "bg-green-500/15 text-green-400"
          : "bg-[#2a2a2a] text-[#555]"
      }`}
      title={label}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          active ? "bg-green-400" : "bg-[#444]"
        }`}
      />
      {label}
    </span>
  );
}

// ── Performance color ──

function perfColor(pct: number): string {
  if (pct >= 5) return "text-green-400";
  if (pct > 0) return "text-green-400/70";
  if (pct > -5) return "text-red-400/70";
  return "text-red-400";
}

function perfBg(pct: number): string {
  if (pct >= 5) return "bg-green-500/10";
  if (pct > 0) return "bg-green-500/5";
  if (pct > -5) return "bg-red-500/5";
  return "bg-red-500/10";
}

// ── Section 1: Active Rotation Cards ──

function ActiveRotationCards({
  rotations,
  onExpand,
  expandedId,
}: {
  rotations: ActiveRotationDetail[];
  onExpand: (id: string | null) => void;
  expandedId: string | null;
}) {
  if (rotations.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center text-[#888]">
        No active rotations detected
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {rotations.map((r) => {
        const isExpanded = expandedId === r.event.sectorId;
        return (
          <button
            key={r.event.sectorId}
            onClick={() => onExpand(isExpanded ? null : r.event.sectorId)}
            className={`rounded-lg border-l-4 border-green-500 bg-[#1a1a1a] p-4 text-left transition-colors hover:bg-[#222] ${
              isExpanded ? "ring-1 ring-green-500/30" : ""
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white">
                  {r.event.sectorName}
                </h3>
                <span className="text-xs text-[#888]">{r.event.etf}</span>
              </div>
              <span className={`text-lg font-bold ${perfColor(r.event.etfPerformancePct)}`}>
                {r.event.etfPerformancePct > 0 ? "+" : ""}
                {r.event.etfPerformancePct.toFixed(1)}%
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs text-[#888]">
              <span>Started {r.event.startDate}</span>
              <span className="text-[#555]">|</span>
              <span>{r.event.daysActive}d active</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              <SignalDot
                active={r.event.signals.rsGoldenCross}
                label="RS Cross"
              />
              <SignalDot
                active={r.event.signals.volumeSurge}
                label="Vol Surge"
              />
              <SignalDot
                active={r.event.signals.priceAbove50MA}
                label=">50MA"
              />
            </div>

            <div className="mt-2 flex items-center justify-end text-xs text-[#666]">
              {isExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Section 2: Stock Performance Table ──

function StockPerformanceTable({
  detail,
}: {
  detail: ActiveRotationDetail;
}) {
  if (detail.stocks.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-[#888]">
        No stock data available for this rotation
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2a2a2a] text-left text-xs text-[#888]">
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2 text-right">Start Price</th>
            <th className="px-3 py-2 text-right">Current</th>
            <th className="px-3 py-2 text-right">% Change</th>
            <th className="px-3 py-2 text-center">&gt;50MA</th>
            <th className="px-3 py-2 text-right">Vol vs Avg</th>
          </tr>
        </thead>
        <tbody>
          {detail.stocks.map((s) => (
            <tr
              key={s.symbol}
              className={`border-b border-[#1a1a1a] transition-colors hover:bg-[#1a1a1a] ${perfBg(s.performancePct)}`}
            >
              <td className="px-3 py-2 font-mono font-semibold text-white">
                {s.symbol}
              </td>
              <td className="px-3 py-2 text-[#ccc]">{s.name}</td>
              <td className="px-3 py-2 text-right text-[#888]">
                ${s.priceAtRotationStart.toFixed(2)}
              </td>
              <td className="px-3 py-2 text-right text-white">
                ${s.priceNow.toFixed(2)}
              </td>
              <td className={`px-3 py-2 text-right font-semibold ${perfColor(s.performancePct)}`}>
                {s.performancePct > 0 ? "+" : ""}
                {s.performancePct.toFixed(1)}%
              </td>
              <td className="px-3 py-2 text-center">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    s.aboveSma50 ? "bg-green-400" : "bg-red-400"
                  }`}
                />
              </td>
              <td className="px-3 py-2 text-right text-[#888]">
                {s.volumeVsAvg.toFixed(1)}x
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Section 3: Historical Timeline ──

function HistoricalTimeline({ events }: { events: RotationEvent[] }) {
  // Group events by sector
  const sectors = useMemo(() => {
    const map = new Map<string, { etf: string; name: string; events: RotationEvent[] }>();
    for (const e of events) {
      if (!map.has(e.sectorId)) {
        map.set(e.sectorId, { etf: e.etf, name: e.sectorName, events: [] });
      }
      map.get(e.sectorId)!.events.push(e);
    }
    // Sort by sector name
    return Array.from(map.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name)
    );
  }, [events]);

  if (sectors.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center text-[#888]">
        No rotation events to display
      </div>
    );
  }

  // Date range: 12 months ago to today
  const now = new Date();
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const startMs = yearAgo.getTime();
  const endMs = now.getTime();
  const rangeMs = endMs - startMs;

  const W = 900;
  const H = sectors.length * 32 + 60;
  const LEFT = 70;
  const RIGHT = 20;
  const TOP = 30;
  const BAR_H = 16;

  // Month labels
  const months: { label: string; x: number }[] = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(yearAgo);
    d.setMonth(d.getMonth() + m);
    const x =
      LEFT +
      ((d.getTime() - startMs) / rangeMs) * (W - LEFT - RIGHT);
    months.push({
      label: d.toLocaleString("en-US", { month: "short" }),
      x,
    });
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[600px]"
        role="img"
        aria-label="Sector rotation timeline"
      >
        {/* Month grid lines and labels */}
        {months.map((m, i) => (
          <g key={i}>
            <line
              x1={m.x}
              y1={TOP - 5}
              x2={m.x}
              y2={H - 10}
              stroke="#222"
              strokeWidth={1}
            />
            <text
              x={m.x}
              y={TOP - 10}
              textAnchor="middle"
              fill="#666"
              fontSize={10}
            >
              {m.label}
            </text>
          </g>
        ))}

        {/* Sector rows */}
        {sectors.map(([sectorId, { etf, name, events: sectorEvents }], rowIdx) => {
          const y = TOP + rowIdx * 32;

          return (
            <g key={sectorId}>
              {/* Sector label */}
              <text
                x={LEFT - 5}
                y={y + BAR_H / 2 + 4}
                textAnchor="end"
                fill="#aaa"
                fontSize={10}
              >
                {etf}
              </text>

              {/* Row background */}
              <rect
                x={LEFT}
                y={y}
                width={W - LEFT - RIGHT}
                height={BAR_H}
                fill={rowIdx % 2 === 0 ? "#111" : "#151515"}
                rx={2}
              />

              {/* Rotation bars */}
              {sectorEvents.map((evt, evtIdx) => {
                const s = new Date(evt.startDate).getTime();
                const e = evt.endDate
                  ? new Date(evt.endDate).getTime()
                  : endMs;

                const x1 =
                  LEFT +
                  Math.max(0, ((s - startMs) / rangeMs)) *
                    (W - LEFT - RIGHT);
                const x2 =
                  LEFT +
                  Math.min(1, ((e - startMs) / rangeMs)) *
                    (W - LEFT - RIGHT);
                const barW = Math.max(2, x2 - x1);

                const fill =
                  evt.etfPerformancePct >= 0 ? "#22c55e" : "#ef4444";
                const opacity =
                  Math.min(1, 0.3 + Math.abs(evt.etfPerformancePct) * 0.07);

                return (
                  <g key={evtIdx}>
                    <rect
                      x={x1}
                      y={y + 2}
                      width={barW}
                      height={BAR_H - 4}
                      fill={fill}
                      opacity={opacity}
                      rx={2}
                    >
                      <title>
                        {name}: {evt.startDate} - {evt.endDate ?? "Active"} (
                        {evt.etfPerformancePct > 0 ? "+" : ""}
                        {evt.etfPerformancePct.toFixed(1)}%)
                      </title>
                    </rect>
                    {/* Pulsing indicator for active rotations */}
                    {evt.endDate === null && (
                      <circle
                        cx={x2}
                        cy={y + BAR_H / 2}
                        r={3}
                        fill={fill}
                      >
                        <animate
                          attributeName="opacity"
                          values="1;0.3;1"
                          dur="2s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Today marker */}
        <line
          x1={W - RIGHT}
          y1={TOP - 5}
          x2={W - RIGHT}
          y2={H - 10}
          stroke="#5ba3e6"
          strokeWidth={1}
          strokeDasharray="3,3"
          opacity={0.5}
        />
        <text
          x={W - RIGHT}
          y={H}
          textAnchor="middle"
          fill="#5ba3e6"
          fontSize={9}
          opacity={0.7}
        >
          Today
        </text>
      </svg>
    </div>
  );
}

// ── Section 4: Pattern Statistics ──

function PatternStatsTable({
  stats,
}: {
  stats: RotationPatternStats[];
}) {
  if (stats.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center text-[#888]">
        No pattern statistics available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2a2a2a] text-left text-xs text-[#888]">
            <th className="px-3 py-2">Sector</th>
            <th className="px-3 py-2">ETF</th>
            <th className="px-3 py-2 text-right">Rotations (1y)</th>
            <th className="px-3 py-2 text-right">Avg Duration</th>
            <th className="px-3 py-2 text-right">Avg Perf</th>
            <th className="px-3 py-2 text-right">Best</th>
            <th className="px-3 py-2 text-right">Worst</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr
              key={s.sectorId}
              className="border-b border-[#1a1a1a] transition-colors hover:bg-[#1a1a1a]"
            >
              <td className="px-3 py-2 font-medium text-white">
                {s.sectorName}
              </td>
              <td className="px-3 py-2 font-mono text-[#888]">{s.etf}</td>
              <td className="px-3 py-2 text-right text-white">
                {s.totalRotations}
              </td>
              <td className="px-3 py-2 text-right text-[#ccc]">
                {s.avgDurationDays}d
              </td>
              <td
                className={`px-3 py-2 text-right font-semibold ${perfColor(s.avgPerformancePct)}`}
              >
                {s.avgPerformancePct > 0 ? "+" : ""}
                {s.avgPerformancePct.toFixed(1)}%
              </td>
              <td
                className={`px-3 py-2 text-right ${perfColor(s.bestPerformancePct)}`}
              >
                {s.bestPerformancePct > 0 ? "+" : ""}
                {s.bestPerformancePct.toFixed(1)}%
              </td>
              <td
                className={`px-3 py-2 text-right ${perfColor(s.worstPerformancePct)}`}
              >
                {s.worstPerformancePct > 0 ? "+" : ""}
                {s.worstPerformancePct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Recently Ended Rotations ──

function RecentlyEndedList({ events }: { events: RotationEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      {events.map((e, i) => (
        <div
          key={`${e.sectorId}-${i}`}
          className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3"
        >
          <div>
            <span className="font-medium text-white">{e.sectorName}</span>
            <span className="ml-2 text-xs text-[#888]">{e.etf}</span>
            <span className="ml-3 text-xs text-[#666]">
              {e.startDate} — {e.endDate} ({e.daysActive}d)
            </span>
          </div>
          <span className={`font-semibold ${perfColor(e.etfPerformancePct)}`}>
            {e.etfPerformancePct > 0 ? "+" : ""}
            {e.etfPerformancePct.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page Component ──

export default function RotationTrackerPage() {
  const [data, setData] = useState<RotationTrackerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  const fetchData = useCallback(async (skipCache = false) => {
    setLoading(true);
    setError(null);

    // Try localStorage cache first
    if (!skipCache) {
      const cached = loadCached();
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/rotation-tracker");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }
      const result = (await res.json()) as RotationTrackerResult;
      setData(result);
      saveCache(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rotation data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 10 minutes
  useEffect(() => {
    const interval = setInterval(() => fetchData(true), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Find expanded rotation detail
  const expandedDetail = useMemo(() => {
    if (!data || !expandedSector) return null;
    return (
      data.activeRotations.find((r) => r.event.sectorId === expandedSector) ??
      null
    );
  }, [data, expandedSector]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Rotation Tracker</h1>
          <p className="mt-1 text-sm text-[#888]">
            Detect sector rotation inflection points and track stock performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && <DataAgeBadge calculatedAt={data.calculatedAt} />}
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="rounded-md border border-[#333] bg-[#1a1a1a] p-2 text-[#a0a0a0] transition-colors hover:bg-[#222] hover:text-white disabled:opacity-50"
            aria-label="Refresh data"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#5ba3e6]" />
          <span className="ml-3 text-[#888]">
            Analyzing sector rotations...
          </span>
        </div>
      )}

      {/* Content */}
      {data && (
        <div className="space-y-8">
          {/* Section 1: Active Rotations */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
              <TrendingUp className="h-5 w-5 text-green-400" />
              Active Rotations
              {data.activeRotations.length > 0 && (
                <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-400">
                  {data.activeRotations.length}
                </span>
              )}
            </h2>
            <ActiveRotationCards
              rotations={data.activeRotations}
              onExpand={setExpandedSector}
              expandedId={expandedSector}
            />
          </section>

          {/* Section 2: Stock Performance (expanded) */}
          {expandedDetail && (
            <section className="rounded-lg border border-[#2a2a2a] bg-[#111]">
              <div className="border-b border-[#2a2a2a] px-4 py-3">
                <h2 className="font-semibold text-white">
                  {expandedDetail.event.sectorName} — Top Stocks Since Rotation
                  Start ({expandedDetail.event.startDate})
                </h2>
              </div>
              <StockPerformanceTable detail={expandedDetail} />
            </section>
          )}

          {/* Section 2.5: Recently Ended */}
          {data.recentlyEndedRotations.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
                <TrendingDown className="h-5 w-5 text-[#888]" />
                Recently Ended
              </h2>
              <RecentlyEndedList events={data.recentlyEndedRotations} />
            </section>
          )}

          {/* Section 3: Historical Timeline */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              12-Month Timeline
            </h2>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
              <HistoricalTimeline events={data.allEvents} />
              <div className="mt-2 flex items-center justify-center gap-4 text-xs text-[#666]">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-6 rounded bg-green-500/50" />{" "}
                  Positive return
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-6 rounded bg-red-500/50" />{" "}
                  Negative return
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-400" />{" "}
                  Active
                </span>
              </div>
            </div>
          </section>

          {/* Section 4: Pattern Statistics */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              Pattern Statistics
            </h2>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#111]">
              <PatternStatsTable stats={data.patternStats} />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
