"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, Download, Search, TrendingUp, TrendingDown, Minus } from "lucide-react";
import Link from "next/link";
import { TableErrorBoundary } from "@/components/table-error-boundary";
import { formatDatePill, scoreColor, downloadCSV } from "@/lib/daily-page-utils";
import { isFocusTicker } from "@/data/focus-list";

// ── Types ──

interface Cell {
  se: number;
  dmd: number;
  ovr: number;
  label: string;
}

interface TrendRow {
  ticker: string;
  sector: string | null;
  price: number;
  present: number;
  byDate: Record<string, Cell>;
}

type Engine = "inflection" | "transition";
type Metric = "se" | "dmd" | "ovr";
type Scope = "focus" | "all";
type SortField = "ticker" | "latest" | "change" | "present";

const METRICS: { key: Metric; label: string; title: string }[] = [
  {
    key: "se",
    label: "Seller Exhaustion",
    title: "Supply Exhaustion — absorption, structural spring, range asymmetry, down-body contraction, distribution days",
  },
  {
    key: "dmd",
    label: "Buyer Demand",
    title: "Demand Emergence — close location, pocket pivots, RVOL trajectory, OBV divergence, money flow, distance to breakout",
  },
  {
    key: "ovr",
    label: "Overall",
    title: "Weighted composite across all components",
  },
];

/**
 * Component scores run 0-100 but sit far below that in practice — a strong Seller
 * Exhaustion read is around 50, not 80. The default 80/65/50 thresholds would paint the
 * whole matrix red and destroy the contrast this view exists for.
 */
const COMPONENT_THRESHOLDS: [number, number, number] = [50, 35, 20];
const OVERALL_THRESHOLDS: [number, number, number] = [65, 50, 35];

function thresholdsFor(metric: Metric): [number, number, number] {
  return metric === "ovr" ? OVERALL_THRESHOLDS : COMPONENT_THRESHOLDS;
}

/**
 * Change across the window, measured between the first and last days that actually
 * carry a row. Missing days are skipped rather than read as zero — a gap means "not
 * scored", and treating it as a collapse to 0 would invent a move that never happened.
 */
function windowChange(row: TrendRow, dates: string[], metric: Metric): number | null {
  const present = dates.map((d) => row.byDate[d]).filter(Boolean) as Cell[];
  if (present.length < 2) return null;
  return present[present.length - 1][metric] - present[0][metric];
}

function latestValue(row: TrendRow, dates: string[], metric: Metric): number | null {
  for (let i = dates.length - 1; i >= 0; i--) {
    const c = row.byDate[dates[i]];
    if (c) return c[metric];
  }
  return null;
}

// ── Page ──

export default function TrendPage() {
  const [engine, setEngine] = useState<Engine>("inflection");
  const [metric, setMetric] = useState<Metric>("se");
  const [scope, setScope] = useState<Scope>("focus");
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("latest");
  const [sortAsc, setSortAsc] = useState(false);

  const [dates, setDates] = useState<string[]>([]);
  const [rows, setRows] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/trend?engine=${engine}&days=${days}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as { dates: string[]; rows: TrendRow[] };
        if (cancelled) return;
        setDates(d.dates ?? []);
        setRows(d.rows ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [engine, days]);

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    const filtered = rows.filter((r) => {
      if (scope === "focus" && !isFocusTicker(r.ticker)) return false;
      if (q && !r.ticker.includes(q) && !(r.sector ?? "").toUpperCase().includes(q)) return false;
      return true;
    });
    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "ticker":
          return dir * a.ticker.localeCompare(b.ticker);
        case "present":
          return dir * (a.present - b.present);
        case "change": {
          const ca = windowChange(a, dates, metric);
          const cb = windowChange(b, dates, metric);
          if (ca === null && cb === null) return 0;
          if (ca === null) return 1; // nulls last regardless of sort direction
          if (cb === null) return -1;
          return dir * (ca - cb);
        }
        default: {
          const la = latestValue(a, dates, metric);
          const lb = latestValue(b, dates, metric);
          if (la === null && lb === null) return 0;
          if (la === null) return 1;
          if (lb === null) return -1;
          return dir * (la - lb);
        }
      }
    });
  }, [rows, scope, search, sortField, sortAsc, dates, metric]);

  const handleSort = useCallback((f: SortField) => {
    setSortField((prev) => {
      if (prev === f) {
        setSortAsc((a) => !a);
        return prev;
      }
      setSortAsc(false);
      return f;
    });
  }, []);

  const handleExport = useCallback(() => {
    const headers = ["Ticker", "Sector", "Price", "Days", ...dates.map(formatDatePill), "Change"];
    const lines = visible.map((r) =>
      [
        r.ticker,
        r.sector ?? "",
        r.price,
        `${r.present}/${dates.length}`,
        ...dates.map((d) => (r.byDate[d] ? String(r.byDate[d][metric]) : "")),
        windowChange(r, dates, metric) ?? "",
      ].join(",")
    );
    downloadCSV(
      [headers.join(","), ...lines].join("\n"),
      `trend-${engine}-${metric}-${dates[dates.length - 1] ?? "latest"}.csv`
    );
  }, [visible, dates, metric, engine]);

  const activeMetric = METRICS.find((m) => m.key === metric)!;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Component Trend</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#a0a0a0]">
            {activeMetric.label} by day — one row per ticker, one column per scan. A dash
            means the scanner produced no row that day, which is not the same as a low score.
          </p>
        </div>
        <Link
          href="/prerun/inflection-daily"
          className="shrink-0 rounded-md bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#185FA5]/80"
        >
          Daily View
        </Link>
      </div>

      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Toggle
          options={[
            ["inflection", "Inflection"],
            ["transition", "Transition"],
          ]}
          value={engine}
          onChange={(v) => setEngine(v as Engine)}
        />
        <span className="mx-1 h-5 w-px bg-[#2a2a2a]" />
        <Toggle
          options={METRICS.map((m) => [m.key, m.label] as [string, string])}
          value={metric}
          onChange={(v) => setMetric(v as Metric)}
          titles={Object.fromEntries(METRICS.map((m) => [m.key, m.title]))}
        />
        <span className="mx-1 h-5 w-px bg-[#2a2a2a]" />
        <Toggle
          options={[
            ["focus", "Focus"],
            ["all", "All"],
          ]}
          value={scope}
          onChange={(v) => setScope(v as Scope)}
        />
        <Toggle
          options={[
            ["7", "7d"],
            ["14", "14d"],
          ]}
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
        />

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#666]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ticker or sector"
            className="w-48 rounded-md border border-[#2a2a2a] bg-[#111] py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-[#555] focus:border-[#185FA5] focus:outline-none"
          />
        </div>
        <button
          onClick={handleExport}
          disabled={!visible.length}
          className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#111] px-3 py-1.5 text-sm text-[#a0a0a0] hover:text-white disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-16 text-sm text-[#a0a0a0]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading trend…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Could not load trend data: {error}
        </div>
      )}

      {!loading && !error && (
        <TableErrorBoundary>
          <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-[#111] text-[11px] uppercase tracking-wide text-[#888]">
                <tr>
                  <Th onClick={() => handleSort("ticker")} active={sortField === "ticker"} asc={sortAsc} align="left">
                    Ticker
                  </Th>
                  {dates.map((d) => (
                    <th key={d} className="px-3 py-2.5 text-center font-medium tabular-nums">
                      {formatDatePill(d)}
                    </th>
                  ))}
                  <Th onClick={() => handleSort("change")} active={sortField === "change"} asc={sortAsc}>
                    Chg
                  </Th>
                  <Th onClick={() => handleSort("present")} active={sortField === "present"} asc={sortAsc}>
                    Days
                  </Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const chg = windowChange(r, dates, metric);
                  return (
                    <tr key={r.ticker} className="border-t border-[#1e1e1e] hover:bg-[#141414]">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {isFocusTicker(r.ticker) && (
                            <span className="text-amber-400" title="Focus list">
                              ★
                            </span>
                          )}
                          <span className="font-medium text-white">{r.ticker}</span>
                        </div>
                        <div className="text-[10px] text-[#666]">{r.sector ?? "—"}</div>
                      </td>
                      {dates.map((d) => {
                        const c = r.byDate[d];
                        return (
                          <td key={d} className="px-3 py-2 text-center tabular-nums">
                            {c ? (
                              <span
                                className={`font-medium ${scoreColor(c[metric], thresholdsFor(metric))}`}
                                title={c.label}
                              >
                                {c[metric]}
                              </span>
                            ) : (
                              <span className="text-[#3a3a3a]" title="No row — not scored this day">
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center tabular-nums">
                        {chg === null ? (
                          <span className="text-[#3a3a3a]">—</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                              chg > 0 ? "text-emerald-400" : chg < 0 ? "text-red-400" : "text-[#888]"
                            }`}
                          >
                            {chg > 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : chg < 0 ? (
                              <TrendingDown className="h-3 w-3" />
                            ) : (
                              <Minus className="h-3 w-3" />
                            )}
                            {chg > 0 ? `+${chg}` : chg}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`text-xs tabular-nums ${
                            r.present === dates.length ? "text-[#888]" : "text-amber-400/80"
                          }`}
                        >
                          {r.present}/{dates.length}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!visible.length && (
            <p className="py-12 text-center text-sm text-[#666]">
              No tickers match.{scope === "focus" ? " Try switching to All." : ""}
            </p>
          )}

          <p className="mt-3 text-xs text-[#666]">
            {visible.length} tickers · {dates.length} scans
            {dates.length > 0
              ? ` · ${formatDatePill(dates[0])} to ${formatDatePill(dates[dates.length - 1])}`
              : ""}
            {" · "}scan date reflects the prior session&apos;s close
          </p>
        </TableErrorBoundary>
      )}
    </div>
  );
}

// ── Small UI helpers ──

function Toggle({
  options,
  value,
  onChange,
  titles,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  titles?: Record<string, string>;
}) {
  return (
    <div className="flex rounded-md border border-[#2a2a2a] bg-[#111] p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          title={titles?.[key]}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            value === key ? "bg-[#185FA5]/25 text-[#5ba3e6]" : "text-[#888] hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  asc,
  align = "center",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  asc: boolean;
  align?: "left" | "center";
}) {
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none px-3 py-2.5 font-medium hover:text-white ${
        align === "left" ? "text-left" : "text-center"
      } ${active ? "text-[#5ba3e6]" : ""}`}
    >
      {children}
      {active ? (asc ? " ↑" : " ↓") : ""}
    </th>
  );
}
