"use client";

import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import {
  Loader2,
  Calendar,
  Download,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Target,
  Shield,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { TableErrorBoundary } from "@/components/table-error-boundary";
import { fmtNum } from "@/lib/daily-format";
import { formatDatePill, streakColor } from "@/lib/daily-page-utils";

// ── Types ──

interface ICTRow {
  scan_date: string;
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  best_state: string;
  best_state_order: number;
  best_timeframe: string;
  best_score: number;
  confluence_score: number;
  armed_timeframes: string[];
  bsl_target: number | null;
  protected_low: number | null;
  fvg_upper: number | null;
  fvg_lower: number | null;
  distance_to_bsl_pct: number | null;
  is_chasing: boolean;
  is_late_entry: boolean;
  state_4h: string | null;
  state_8h: string | null;
  state_12h: string | null;
  state_1d: string | null;
  state_1wk: string | null;
  score_4h: number | null;
  score_8h: number | null;
  score_12h: number | null;
  score_1d: number | null;
  score_1wk: number | null;
  state_score: number;
  displacement_quality: number;
  fvg_quality: number;
  retracement_depth: number;
  bsl_quality: number;
  compression_quality: number;
  structure_coherence: number;
  invalidation_distance: number;
  bullish_evidence: string[];
  caution_evidence: string[];
}

interface DroppedTicker {
  ticker: string;
  prev_score: number;
}

type StateFilter = "ALL" | "Armed" | "Trigger" | "Ignition" | "BSL" | "HL" | "Retrace" | "FVG" | "MSS" | "Disp" | "SSL";
type SortField =
  | "best_score" | "confluence_score" | "best_state_order" | "ticker"
  | "price" | "sector" | "streak" | "delta" | "distance_to_bsl_pct";

// ── Helpers ──

function ictStateBadge(state: string): { label: string; color: string } {
  switch (state) {
    case "Armed":
      return { label: "Armed", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
    case "Trigger":
      return { label: "Trigger", color: "text-green-400 bg-green-500/10 border-green-500/30" };
    case "Ignition":
      return { label: "Ignition", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "BSL":
      return { label: "BSL", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" };
    case "HL":
      return { label: "HL", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30" };
    case "Retrace":
      return { label: "Retrace", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" };
    case "FVG":
      return { label: "FVG", color: "text-violet-400 bg-violet-500/10 border-violet-500/30" };
    case "MSS":
      return { label: "MSS", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    case "Disp":
      return { label: "Disp", color: "text-orange-400 bg-orange-500/10 border-orange-500/30" };
    case "SSL":
      return { label: "SSL", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" };
    case "Struct":
      return { label: "Struct", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" };
    default:
      return { label: state, color: "text-gray-400 bg-gray-500/10 border-gray-500/30" };
  }
}

function tfBadge(state: string | null, score: number | null): string {
  if (!state) return "text-gray-600";
  if (state === "Armed" || state === "Trigger" || state === "Ignition") return "text-cyan-400";
  if (state === "BSL" || state === "HL") return "text-blue-400";
  if (state === "FVG" || state === "Retrace") return "text-purple-400";
  return "text-gray-400";
}

const stateFilters: StateFilter[] = [
  "ALL", "Armed", "Trigger", "Ignition", "BSL", "HL", "Retrace", "FVG", "MSS", "Disp", "SSL",
];

// ── Component ──

export default function ICTDailyPage() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [rows, setRows] = useState<ICTRow[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [dropped, setDropped] = useState<DroppedTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("ALL");
  const [sortField, setSortField] = useState<SortField>("best_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [copiedWatchlist, setCopiedWatchlist] = useState(false);
  const [showDropped, setShowDropped] = useState(false);

  // Fetch dates on mount
  useEffect(() => {
    fetch("/api/ict/daily?dates=true")
      .then((r) => r.json())
      .then((d) => {
        setDates(d.dates ?? []);
        if (d.dates?.length) setSelectedDate(d.dates[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch results when date changes
  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    fetch(`/api/ict/daily?date=${selectedDate}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.results ?? []);
        setStreaks(d.streaks ?? {});
        setDeltas(d.deltas ?? {});
        setDropped(d.dropped ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedDate]);

  // Sort handler
  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortAsc((a) => !a);
        return field;
      }
      setSortAsc(false);
      return field;
    });
  }, []);

  // Filtered + sorted rows
  const displayRows = useMemo(() => {
    let filtered = rows;

    if (searchQuery) {
      const q = searchQuery.toUpperCase();
      filtered = filtered.filter(
        (r) => r.ticker.includes(q) || r.sector.toUpperCase().includes(q) || r.company_name?.toUpperCase().includes(q)
      );
    }

    if (stateFilter !== "ALL") {
      filtered = filtered.filter((r) => r.best_state === stateFilter);
    }

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "best_score": cmp = a.best_score - b.best_score; break;
        case "confluence_score": cmp = a.confluence_score - b.confluence_score; break;
        case "best_state_order": cmp = a.best_state_order - b.best_state_order; break;
        case "ticker": cmp = a.ticker.localeCompare(b.ticker); break;
        case "price": cmp = a.price - b.price; break;
        case "sector": cmp = a.sector.localeCompare(b.sector); break;
        case "streak": cmp = (streaks[a.ticker] ?? 0) - (streaks[b.ticker] ?? 0); break;
        case "delta": cmp = (deltas[a.ticker] ?? 0) - (deltas[b.ticker] ?? 0); break;
        case "distance_to_bsl_pct": cmp = (a.distance_to_bsl_pct ?? 99) - (b.distance_to_bsl_pct ?? 99); break;
      }
      if (cmp === 0) cmp = a.ticker.localeCompare(b.ticker);
      return sortAsc ? cmp : -cmp;
    });

    return sorted;
  }, [rows, searchQuery, stateFilter, sortField, sortAsc, streaks, deltas]);

  // State distribution
  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.best_state] = (counts[r.best_state] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  // Copy watchlist
  const copyWatchlist = useCallback(() => {
    const tickers = displayRows.map((r) => r.ticker).join(",");
    navigator.clipboard.writeText(tickers).then(() => {
      setCopiedWatchlist(true);
      setTimeout(() => setCopiedWatchlist(false), 2000);
    });
  }, [displayRows]);

  // CSV export
  const exportCSV = useCallback(() => {
    const header = "Ticker,Price,State,TF,Score,Confluence,BSL,ProtLow,FVG,DistBSL%,Chase,Sector";
    const csvRows = displayRows.map((r) =>
      [r.ticker, r.price, r.best_state, r.best_timeframe, r.best_score, r.confluence_score,
       r.bsl_target ?? "", r.protected_low ?? "", r.fvg_upper ? `${r.fvg_lower}-${r.fvg_upper}` : "",
       r.distance_to_bsl_pct ?? "", r.is_chasing ? "Y" : "N", r.sector].join(",")
    );
    const blob = new Blob([header + "\n" + csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ict-daily-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayRows, selectedDate]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortAsc ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />;
  };

  const armedCount = rows.filter((r) => r.armed_timeframes.length > 0).length;

  if (!dates.length && !loading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 text-center text-[#888]">
        No ICT scan data available yet. Run the cron first.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ICT Pre-Expansion Scanner</h1>
          <p className="mt-1 text-sm text-[#888]">
            Pure OHLC price action state machine — no lagging indicators
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date selector */}
          <div className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-1.5">
            <Calendar className="h-4 w-4 text-[#888]" />
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm text-white outline-none"
            >
              {dates.map((d) => (
                <option key={d} value={d}>{formatDatePill(d)}</option>
              ))}
            </select>
          </div>

          <button onClick={copyWatchlist} className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-sm text-[#888] hover:text-white">
            {copiedWatchlist ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            {copiedWatchlist ? "Copied" : "Watchlist"}
          </button>

          <button onClick={exportCSV} className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-sm text-[#888] hover:text-white">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-2 text-sm">
        <span className="text-[#888]">{rows.length} setups</span>
        <span className="text-[#333]">|</span>
        <span className="text-cyan-400">{armedCount} armed</span>
        <span className="text-[#333]">|</span>
        {Object.entries(stateCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([state, count]) => {
            const badge = ictStateBadge(state);
            return (
              <button
                key={state}
                onClick={() => setStateFilter(state === stateFilter ? "ALL" : state as StateFilter)}
                className={`rounded border px-1.5 py-0.5 text-xs font-medium ${badge.color} ${state === stateFilter ? "ring-1 ring-white/20" : ""}`}
              >
                {badge.label} {count}
              </button>
            );
          })}
      </div>

      {/* Search + filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888]" />
          <input
            type="text"
            placeholder="Search ticker, sector..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#141414] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-[#666] focus:border-[#5ba3e6]"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-[#888]" />
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as StateFilter)}
            className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-2 py-1.5 text-sm text-white outline-none"
          >
            {stateFilters.map((f) => (
              <option key={f} value={f}>{f === "ALL" ? "All States" : f}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#5ba3e6]" />
        </div>
      ) : (
        <TableErrorBoundary>
          <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a] bg-[#141414] text-left text-[#888]">
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("ticker")}>
                    Ticker <SortIcon field="ticker" />
                  </th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("price")}>
                    Price <SortIcon field="price" />
                  </th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("best_state_order")}>
                    State <SortIcon field="best_state_order" />
                  </th>
                  <th className="px-3 py-2 font-medium">TF</th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("best_score")}>
                    Score <SortIcon field="best_score" />
                  </th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("confluence_score")}>
                    Conf <SortIcon field="confluence_score" />
                  </th>
                  <th className="px-3 py-2 font-medium">Armed TFs</th>
                  <th className="px-3 py-2 font-medium">BSL</th>
                  <th className="px-3 py-2 font-medium">Prot Low</th>
                  <th className="px-3 py-2 font-medium">FVG Zone</th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("distance_to_bsl_pct")}>
                    Dist BSL <SortIcon field="distance_to_bsl_pct" />
                  </th>
                  <th className="px-3 py-2 font-medium">Flags</th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("streak")}>
                    Streak <SortIcon field="streak" />
                  </th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("delta")}>
                    Delta <SortIcon field="delta" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => {
                  const badge = ictStateBadge(r.best_state);
                  const isExpanded = expandedTicker === r.ticker;
                  const streak = streaks[r.ticker] ?? 0;
                  const delta = deltas[r.ticker];

                  return (
                    <Fragment key={r.ticker}>
                      <tr
                        className={`cursor-pointer border-b border-[#1a1a1a] transition-colors hover:bg-[#1a1a1a] ${isExpanded ? "bg-[#1a1a1a]" : ""}`}
                        onClick={() => setExpandedTicker(isExpanded ? null : r.ticker)}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`https://finance.yahoo.com/quote/${r.ticker}`}
                              target="_blank"
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-white hover:text-[#5ba3e6]"
                            >
                              {r.ticker}
                            </Link>
                            {r.sector && (
                              <span className="rounded border border-[#2a2a2a] px-1 py-0.5 text-[10px] text-[#666]">
                                {r.sector}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-white">${fmtNum(r.price, 2)}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${badge.color}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[#888]">{r.best_timeframe}</td>
                        <td className="px-3 py-2 font-mono text-white">{r.best_score}</td>
                        <td className="px-3 py-2 font-mono text-[#888]">{r.confluence_score}</td>
                        <td className="px-3 py-2">
                          {r.armed_timeframes.length > 0 ? (
                            <span className="text-cyan-400 text-xs">{r.armed_timeframes.join(", ")}</span>
                          ) : (
                            <span className="text-[#333]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-[#888]">
                          {r.bsl_target != null ? `$${fmtNum(r.bsl_target, 2)}` : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-[#888]">
                          {r.protected_low != null ? `$${fmtNum(r.protected_low, 2)}` : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[#888]">
                          {r.fvg_lower != null && r.fvg_upper != null
                            ? `${fmtNum(r.fvg_lower, 2)}-${fmtNum(r.fvg_upper, 2)}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {r.distance_to_bsl_pct != null ? (
                            <span className={r.distance_to_bsl_pct <= 1 ? "text-cyan-400" : r.distance_to_bsl_pct <= 3 ? "text-blue-400" : "text-[#888]"}>
                              {fmtNum(r.distance_to_bsl_pct, 1)}%
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {r.is_chasing && (
                              <span className="rounded border border-red-500/30 bg-red-500/10 px-1 py-0.5 text-[10px] text-red-400">Chase</span>
                            )}
                            {r.is_late_entry && (
                              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-400">Late</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {streak > 0 && (
                            <span className={`font-mono text-xs ${streakColor(streak)}`}>{streak}d</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {delta !== undefined && (
                            <span className={`font-mono text-xs ${delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-[#888]"}`}>
                              {delta > 0 ? "+" : ""}{delta}
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <tr className="border-b border-[#1a1a1a]">
                          <td colSpan={14} className="bg-[#0f0f0f] px-4 py-4">
                            <div className="grid gap-4 sm:grid-cols-3">
                              {/* Score components */}
                              <div>
                                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#888]">
                                  Score Components
                                </h4>
                                <div className="space-y-1 text-xs">
                                  {[
                                    { label: "State", val: r.state_score, max: 30 },
                                    { label: "Displacement", val: r.displacement_quality, max: 15 },
                                    { label: "FVG Quality", val: r.fvg_quality, max: 10 },
                                    { label: "Retrace Depth", val: r.retracement_depth, max: 10 },
                                    { label: "BSL Cluster", val: r.bsl_quality, max: 10 },
                                    { label: "Compression", val: r.compression_quality, max: 10 },
                                    { label: "Coherence", val: r.structure_coherence, max: 10 },
                                    { label: "Invalidation", val: r.invalidation_distance, max: 5 },
                                  ].map(({ label, val, max }) => (
                                    <div key={label} className="flex items-center justify-between">
                                      <span className="text-[#888]">{label}</span>
                                      <div className="flex items-center gap-2">
                                        <div className="h-1.5 w-16 rounded-full bg-[#2a2a2a]">
                                          <div
                                            className="h-1.5 rounded-full bg-[#5ba3e6]"
                                            style={{ width: `${(val / max) * 100}%` }}
                                          />
                                        </div>
                                        <span className="w-8 text-right font-mono text-white">{val}/{max}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Per-TF breakdown */}
                              <div>
                                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#888]">
                                  Timeframe Breakdown
                                </h4>
                                <div className="space-y-1 text-xs">
                                  {([
                                    ["4h", r.state_4h, r.score_4h],
                                    ["8h", r.state_8h, r.score_8h],
                                    ["12h", r.state_12h, r.score_12h],
                                    ["1d", r.state_1d, r.score_1d],
                                    ["1wk", r.state_1wk, r.score_1wk],
                                  ] as [string, string | null, number | null][]).map(([tf, state, score]) => (
                                    <div key={tf} className="flex items-center justify-between">
                                      <span className="text-[#888]">{tf}</span>
                                      <div className="flex items-center gap-2">
                                        {state ? (
                                          <span className={`rounded border px-1 py-0.5 text-[10px] font-medium ${ictStateBadge(state).color}`}>
                                            {state}
                                          </span>
                                        ) : (
                                          <span className="text-[#333]">—</span>
                                        )}
                                        <span className={`w-6 text-right font-mono ${tfBadge(state, score)}`}>
                                          {score ?? "—"}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Evidence */}
                              <div>
                                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#888]">
                                  Evidence
                                </h4>
                                {r.bullish_evidence?.length > 0 && (
                                  <div className="mb-2">
                                    <span className="text-[10px] font-medium uppercase text-green-400">Bullish</span>
                                    <ul className="mt-1 space-y-0.5">
                                      {r.bullish_evidence.slice(0, 5).map((e, i) => (
                                        <li key={i} className="text-xs text-[#888]">
                                          <Zap className="mr-1 inline h-3 w-3 text-green-400" />{e}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {r.caution_evidence?.length > 0 && (
                                  <div>
                                    <span className="text-[10px] font-medium uppercase text-amber-400">Caution</span>
                                    <ul className="mt-1 space-y-0.5">
                                      {r.caution_evidence.slice(0, 3).map((e, i) => (
                                        <li key={i} className="text-xs text-[#888]">
                                          <Shield className="mr-1 inline h-3 w-3 text-amber-400" />{e}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Key levels strip */}
                            <div className="mt-3 flex flex-wrap gap-4 rounded border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-xs">
                              <div>
                                <span className="text-[#666]">BSL Target: </span>
                                <span className="font-mono text-cyan-400">{r.bsl_target != null ? `$${fmtNum(r.bsl_target, 2)}` : "—"}</span>
                              </div>
                              <div>
                                <span className="text-[#666]">Protected Low: </span>
                                <span className="font-mono text-red-400">{r.protected_low != null ? `$${fmtNum(r.protected_low, 2)}` : "—"}</span>
                              </div>
                              <div>
                                <span className="text-[#666]">FVG: </span>
                                <span className="font-mono text-purple-400">
                                  {r.fvg_lower != null && r.fvg_upper != null ? `$${fmtNum(r.fvg_lower, 2)} - $${fmtNum(r.fvg_upper, 2)}` : "—"}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TableErrorBoundary>
      )}

      {/* Dropped section */}
      {dropped.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowDropped(!showDropped)}
            className="flex items-center gap-1.5 text-sm text-[#888] hover:text-white"
          >
            {showDropped ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Dropped ({dropped.length})
          </button>
          {showDropped && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {dropped.map((d) => (
                <span key={d.ticker} className="rounded border border-[#2a2a2a] bg-[#141414] px-2 py-0.5 text-xs text-[#888]">
                  {d.ticker} <span className="text-red-400">({d.prev_score})</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
