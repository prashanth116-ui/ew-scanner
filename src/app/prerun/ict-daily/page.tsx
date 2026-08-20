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
  Shield,
  Zap,
  AlertTriangle,
  BookOpen,
  LineChart,
} from "lucide-react";
import Link from "next/link";
import { TableErrorBoundary } from "@/components/table-error-boundary";
import { isFocusTicker } from "@/data/focus-list";
import { FocusToggle } from "@/components/focus-toggle";
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
  risk_reward: number | null;
  htf_bias: string | null;
  range_retracement: number | null;
  in_discount: boolean | null;
  in_ote: boolean | null;
  state_bars_ago: number | null;
  is_tradeable: boolean | null;
  prior_invalidation_state: string | null;
  prior_invalidation_bars_ago: number | null;
  prior_invalidation_reason: string | null;
  is_chasing: boolean;
  is_late_entry: boolean;
  state_1h: string | null;
  state_4h: string | null;
  state_1d: string | null;
  state_1wk: string | null;
  score_1h: number | null;
  score_4h: number | null;
  score_1d: number | null;
  score_1wk: number | null;
  state_score: number;
  displacement_quality: number;
  fvg_quality: number;
  retracement_depth: number;
  entry_quality: number | null;
  bsl_quality: number;
  compression_quality: number;
  structure_coherence: number;
  invalidation_distance: number;
  recency_score: number | null;
  bullish_evidence: string[];
  caution_evidence: string[];
}

interface DroppedTicker {
  ticker: string;
  prev_score: number;
}

type SortField =
  | "best_score" | "confluence_score" | "best_state_order" | "ticker"
  | "price" | "sector" | "streak" | "delta" | "distance_to_bsl_pct"
  | "risk_reward" | "state_bars_ago";

// ── Helpers ──

/**
 * Ladder order, weakest first. Mirrors ICT_STATE_ORDER in lib/ict/types.ts —
 * duplicated rather than imported so this page stays free of server-only deps.
 */
const STATE_LADDER = [
  "SSL", "Struct", "Disp", "MSS", "FVG", "Retrace", "HL", "BSL", "Armed", "Trigger", "Ignition",
] as const;

const STATE_COLORS: Record<string, string> = {
  Armed: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  Trigger: "text-green-400 bg-green-500/10 border-green-500/30",
  Ignition: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  BSL: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  HL: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
  Retrace: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  FVG: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  MSS: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  Disp: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  SSL: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  Struct: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
};

function stateColor(state: string): string {
  return STATE_COLORS[state] ?? "text-gray-400 bg-gray-500/10 border-gray-500/30";
}

function tfColor(state: string | null): string {
  if (!state) return "text-gray-600";
  if (state === "Armed" || state === "Trigger" || state === "Ignition") return "text-cyan-400";
  if (state === "BSL" || state === "HL") return "text-blue-400";
  if (state === "FVG" || state === "Retrace") return "text-purple-400";
  return "text-gray-400";
}

function biasBadge(bias: string | null): { label: string; color: string; title: string } {
  switch (bias) {
    case "ALIGNED":
      return {
        label: "HTF ✓",
        color: "text-green-400 bg-green-500/10 border-green-500/30",
        title: "Daily or weekly structure has flipped bullish — the setup runs with higher-timeframe bias",
      };
    case "COUNTER":
      return {
        label: "HTF ✗",
        color: "text-red-400 bg-red-500/10 border-red-500/30",
        title: "No bullish structure on either swing timeframe — this setup runs against higher-timeframe bias",
      };
    default:
      return {
        label: "HTF ~",
        color: "text-[#888] bg-[#2a2a2a]/40 border-[#2a2a2a]",
        title: "Higher timeframe has raided but structure has not flipped yet",
      };
  }
}

/** Sort comparator that always puts nulls last, whichever direction is active. */
function nullsLast(
  a: number | null | undefined,
  b: number | null | undefined,
  asc: boolean,
): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  // Return the value the caller's final asc/desc flip will turn into "last".
  if (aNull) return asc ? 1 : -1;
  if (bNull) return asc ? -1 : 1;
  return a - b;
}

/** Declared at module scope so it is not recreated on every render. */
function SortIcon({ field, active, asc }: { field: SortField; active: SortField; asc: boolean }) {
  if (active !== field) return null;
  return asc ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />;
}

// ── Component ──

export default function ICTDailyPage() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [rows, setRows] = useState<ICTRow[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [dropped, setDropped] = useState<DroppedTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<Set<string>>(new Set());
  const [sectorFilter, setSectorFilter] = useState<string>("ALL");
  const [tradeableOnly, setTradeableOnly] = useState(false);
  const [hideCounterHtf, setHideCounterHtf] = useState(false);
  const [focusOnly, setFocusOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>("best_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [copiedWatchlist, setCopiedWatchlist] = useState(false);
  const [showDropped, setShowDropped] = useState(false);

  // Fetch dates on mount
  useEffect(() => {
    fetch("/api/ict/daily?dates=true")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setDates(d.dates ?? []);
        if (d.dates?.length) setSelectedDate(d.dates[0]);
        setLoadError(null);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load scan dates"))
      .finally(() => setLoading(false));
  }, []);

  // Fetch results when date changes
  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    fetch(`/api/ict/daily?date=${selectedDate}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setRows(d.results ?? []);
        setStreaks(d.streaks ?? {});
        setDeltas(d.deltas ?? {});
        setDropped(d.dropped ?? []);
        setLoadError(null);
      })
      .catch((e) => {
        // A failed load used to render as "0 setups", indistinguishable from a
        // genuinely quiet night.
        setRows([]);
        setLoadError(e instanceof Error ? e.message : "Failed to load results");
      })
      .finally(() => setLoading(false));
  }, [selectedDate]);

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

  const toggleState = useCallback((state: string) => {
    setStateFilter((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  }, []);

  const focusTickers = useMemo(
    () => new Set(rows.filter((r) => isFocusTicker(r.ticker)).map((r) => r.ticker)),
    [rows],
  );

  const sectors = useMemo(
    () => [...new Set(rows.map((r) => r.sector).filter(Boolean))].sort(),
    [rows],
  );

  // Filtered + sorted rows
  const displayRows = useMemo(() => {
    let filtered = rows;
    if (focusOnly) filtered = filtered.filter((r) => focusTickers.has(r.ticker));
    if (tradeableOnly) filtered = filtered.filter((r) => r.is_tradeable === true);
    if (hideCounterHtf) filtered = filtered.filter((r) => r.htf_bias !== "COUNTER");
    if (sectorFilter !== "ALL") filtered = filtered.filter((r) => r.sector === sectorFilter);

    if (searchQuery) {
      const q = searchQuery.toUpperCase();
      filtered = filtered.filter(
        (r) => r.ticker.includes(q) || r.sector.toUpperCase().includes(q) || r.company_name?.toUpperCase().includes(q)
      );
    }

    if (stateFilter.size > 0) {
      filtered = filtered.filter((r) => stateFilter.has(r.best_state));
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
        case "distance_to_bsl_pct":
          cmp = nullsLast(a.distance_to_bsl_pct, b.distance_to_bsl_pct, sortAsc); break;
        case "risk_reward":
          cmp = nullsLast(a.risk_reward, b.risk_reward, sortAsc); break;
        case "state_bars_ago":
          cmp = nullsLast(a.state_bars_ago, b.state_bars_ago, sortAsc); break;
      }
      if (cmp === 0) cmp = a.ticker.localeCompare(b.ticker);
      return sortAsc ? cmp : -cmp;
    });

    return sorted;
  }, [
    rows, focusOnly, focusTickers, tradeableOnly, hideCounterHtf, sectorFilter,
    searchQuery, stateFilter, sortField, sortAsc, streaks, deltas,
  ]);

  /**
   * Top Picks: the rows the page exists to surface. Past the trigger stage,
   * with higher-timeframe bias behind them, fresh, and not already extended.
   */
  const topPicks = useMemo(() => {
    return rows
      .filter(
        (r) =>
          r.is_tradeable === true &&
          r.best_state_order >= 9 &&
          !r.is_chasing &&
          !r.is_late_entry,
      )
      .sort((a, b) => (b.risk_reward ?? 0) - (a.risk_reward ?? 0) || b.best_score - a.best_score)
      .slice(0, 10);
  }, [rows]);

  // State distribution — every state present, in ladder order rather than the
  // five most common. Trigger and Ignition are rare by construction, so a
  // top-5-by-count strip surfaced the noise and hid the signal.
  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.best_state] = (counts[r.best_state] ?? 0) + 1;
    return STATE_LADDER.filter((s) => counts[s] > 0).map((s) => [s, counts[s]] as const);
  }, [rows]);

  const copyWatchlist = useCallback(() => {
    const tickers = displayRows.map((r) => r.ticker).join(",");
    navigator.clipboard.writeText(tickers).then(() => {
      setCopiedWatchlist(true);
      setTimeout(() => setCopiedWatchlist(false), 2000);
    });
  }, [displayRows]);

  const exportCSV = useCallback(() => {
    const header = [
      "Ticker", "Company", "Price", "State", "Age", "TF", "Score", "Confluence",
      "HTF", "BSL", "ProtLow", "R:R", "FVG", "DistBSL%", "RangeRetrace",
      "OTE", "Discount", "Chase", "Late", "Tradeable", "Streak", "Delta", "Sector",
    ].join(",");
    const esc = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
    const csvRows = displayRows.map((r) =>
      [
        r.ticker, esc(r.company_name ?? ""), r.price, r.best_state, r.state_bars_ago ?? "",
        r.best_timeframe, r.best_score, r.confluence_score, r.htf_bias ?? "",
        r.bsl_target ?? "", r.protected_low ?? "", r.risk_reward ?? "",
        r.fvg_upper != null && r.fvg_lower != null ? `${r.fvg_lower}-${r.fvg_upper}` : "",
        r.distance_to_bsl_pct ?? "", r.range_retracement ?? "",
        r.in_ote ? "Y" : "N", r.in_discount ? "Y" : "N",
        r.is_chasing ? "Y" : "N", r.is_late_entry ? "Y" : "N",
        r.is_tradeable ? "Y" : "N",
        streaks[r.ticker] ?? 0, deltas[r.ticker] ?? "",
        esc(r.sector ?? ""),
      ].join(",")
    );
    const blob = new Blob([header + "\n" + csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ict-daily-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayRows, selectedDate, streaks, deltas]);

  const armedCount = rows.filter((r) => r.armed_timeframes?.length > 0).length;
  const tradeableCount = rows.filter((r) => r.is_tradeable === true).length;

  if (loadError && !rows.length) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
        <p className="text-white">Could not load ICT scan data.</p>
        <p className="mt-1 text-sm text-[#888]">{loadError}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-2 text-sm text-[#888] hover:text-white"
        >
          Retry
        </button>
      </div>
    );
  }

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
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ICT Pre-Expansion Scanner</h1>
          <p className="mt-1 text-sm text-[#888]">
            Pure OHLC price action state machine — no lagging indicators.{" "}
            <span className="text-[#666]">Long setups only; there is no bearish mirror.</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/prerun/ict-guide"
            className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-sm text-[#888] hover:text-white"
          >
            <BookOpen className="h-4 w-4" /> Guide
          </Link>
          <Link
            href="/prerun/ict-backtest"
            className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-sm text-[#888] hover:text-white"
          >
            <LineChart className="h-4 w-4" /> Backtest
          </Link>

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

      {/* Top Picks */}
      {topPicks.length > 0 && (
        <div className="mb-4 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.04] px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Zap className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold text-cyan-300">Top Picks</span>
            <span className="text-xs text-[#888]">
              armed or better · higher-timeframe bias aligned · fresh · not extended — ranked by reward-to-risk
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topPicks.map((r) => (
              <button
                key={r.ticker}
                onClick={() => setExpandedTicker(expandedTicker === r.ticker ? null : r.ticker)}
                className="flex items-center gap-1.5 rounded border border-[#2a2a2a] bg-[#141414] px-2 py-1 text-xs hover:border-cyan-500/40"
              >
                <span className="font-medium text-white">{r.ticker}</span>
                <span className={`rounded border px-1 text-[10px] ${stateColor(r.best_state)}`}>{r.best_state}</span>
                {r.risk_reward != null && (
                  <span className="font-mono text-cyan-400">{fmtNum(r.risk_reward, 1)}R</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-2 text-sm">
        <span className="text-[#888]">{rows.length} setups</span>
        <span className="text-[#333]">|</span>
        <span className="text-cyan-400">{armedCount} armed</span>
        <span className="text-[#333]">|</span>
        <span className="text-green-400">{tradeableCount} tradeable</span>
        <span className="text-[#333]">|</span>
        {stateCounts.map(([state, count]) => (
          <button
            key={state}
            onClick={() => toggleState(state)}
            className={`rounded border px-1.5 py-0.5 text-xs font-medium ${stateColor(state)} ${stateFilter.has(state) ? "ring-1 ring-white/30" : ""}`}
          >
            {state} {count}
          </button>
        ))}
        {stateFilter.size > 0 && (
          <button onClick={() => setStateFilter(new Set())} className="text-xs text-[#888] underline hover:text-white">
            clear
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888]" />
          <input
            type="text"
            placeholder="Search ticker, company, sector..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#141414] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-[#666] focus:border-[#5ba3e6]"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-[#888]" />
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-2 py-1.5 text-sm text-white outline-none"
          >
            <option value="ALL">All Sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setTradeableOnly((v) => !v)}
          title="Past MSS, higher-timeframe bias not against it, state reached recently, not chasing"
          className={`rounded-lg border px-3 py-1.5 text-sm ${tradeableOnly ? "border-green-500/40 bg-green-500/10 text-green-300" : "border-[#2a2a2a] bg-[#141414] text-[#888] hover:text-white"}`}
        >
          Tradeable ({tradeableCount})
        </button>

        <button
          onClick={() => setHideCounterHtf((v) => !v)}
          title="Hide setups with no bullish structure on the daily or weekly"
          className={`rounded-lg border px-3 py-1.5 text-sm ${hideCounterHtf ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-[#2a2a2a] bg-[#141414] text-[#888] hover:text-white"}`}
        >
          HTF aligned
        </button>

        <FocusToggle
          count={focusTickers.size}
          active={focusOnly}
          onToggle={() => setFocusOnly((v) => !v)}
        />
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
                    Ticker <SortIcon field="ticker" active={sortField} asc={sortAsc} />
                  </th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("price")}>
                    Price <SortIcon field="price" active={sortField} asc={sortAsc} />
                  </th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("best_state_order")}>
                    State <SortIcon field="best_state_order" active={sortField} asc={sortAsc} />
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2 font-medium"
                    title="Bars since the state was reached — a state persists until it advances or breaks"
                    onClick={() => handleSort("state_bars_ago")}
                  >
                    Age <SortIcon field="state_bars_ago" active={sortField} asc={sortAsc} />
                  </th>
                  <th className="px-3 py-2 font-medium">TF</th>
                  <th className="px-3 py-2 font-medium" title="Higher-timeframe (daily/weekly) structural bias">HTF</th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("best_score")}>
                    Score <SortIcon field="best_score" active={sortField} asc={sortAsc} />
                  </th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("confluence_score")}>
                    Conf <SortIcon field="confluence_score" active={sortField} asc={sortAsc} />
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2 font-medium"
                    title="(BSL target − price) ÷ (price − protected low)"
                    onClick={() => handleSort("risk_reward")}
                  >
                    R:R <SortIcon field="risk_reward" active={sortField} asc={sortAsc} />
                  </th>
                  <th className="px-3 py-2 font-medium">BSL</th>
                  <th className="px-3 py-2 font-medium">Prot Low</th>
                  <th className="px-3 py-2 font-medium">FVG Zone</th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("distance_to_bsl_pct")}>
                    Dist BSL <SortIcon field="distance_to_bsl_pct" active={sortField} asc={sortAsc} />
                  </th>
                  <th className="px-3 py-2 font-medium">Flags</th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("streak")}>
                    Streak <SortIcon field="streak" active={sortField} asc={sortAsc} />
                  </th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => handleSort("delta")}>
                    Delta <SortIcon field="delta" active={sortField} asc={sortAsc} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 && (
                  <tr>
                    <td colSpan={16} className="px-3 py-8 text-center text-sm text-[#666]">
                      No setups match the current filters.
                    </td>
                  </tr>
                )}
                {displayRows.map((r) => {
                  const isExpanded = expandedTicker === r.ticker;
                  const streak = streaks[r.ticker] ?? 0;
                  const delta = deltas[r.ticker];
                  const bias = biasBadge(r.htf_bias);

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
                              title={r.company_name || undefined}
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
                          <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${stateColor(r.best_state)}`}>
                            {r.best_state}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {r.state_bars_ago != null ? (
                            <span className={r.state_bars_ago <= 3 ? "text-green-400" : r.state_bars_ago <= 10 ? "text-[#888]" : "text-amber-400"}>
                              {r.state_bars_ago}b
                            </span>
                          ) : <span className="text-[#333]">—</span>}
                        </td>
                        <td className="px-3 py-2 text-[#888]">{r.best_timeframe}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded border px-1 py-0.5 text-[10px] font-medium ${bias.color}`} title={bias.title}>
                            {bias.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-white">{r.best_score}</td>
                        <td className="px-3 py-2 font-mono text-[#888]">{r.confluence_score}</td>
                        <td className="px-3 py-2 font-mono">
                          {r.risk_reward != null ? (
                            <span className={r.risk_reward >= 3 ? "text-green-400" : r.risk_reward >= 1.5 ? "text-cyan-400" : "text-[#888]"}>
                              {fmtNum(r.risk_reward, 1)}
                            </span>
                          ) : <span className="text-[#333]">—</span>}
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
                            r.distance_to_bsl_pct < 0 ? (
                              <span className="text-emerald-400" title="Draw already cleared">
                                +{fmtNum(Math.abs(r.distance_to_bsl_pct), 1)}%
                              </span>
                            ) : (
                              <span className={r.distance_to_bsl_pct <= 1 ? "text-cyan-400" : r.distance_to_bsl_pct <= 3 ? "text-blue-400" : "text-[#888]"}>
                                {fmtNum(r.distance_to_bsl_pct, 1)}%
                              </span>
                            )
                          ) : <span className="text-[#333]">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {r.in_ote && (
                              <span className="rounded border border-green-500/30 bg-green-500/10 px-1 py-0.5 text-[10px] text-green-400" title="Trading inside the 0.62-0.79 optimal trade entry band">OTE</span>
                            )}
                            {!r.in_ote && r.in_discount && (
                              <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1 py-0.5 text-[10px] text-cyan-400" title="Below equilibrium of the dealing range">Disc</span>
                            )}
                            {r.in_discount === false && (
                              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-400" title="Above equilibrium — premium">Prem</span>
                            )}
                            {r.is_chasing && (
                              <span className="rounded border border-red-500/30 bg-red-500/10 px-1 py-0.5 text-[10px] text-red-400">Chase</span>
                            )}
                            {r.is_late_entry && (
                              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-400">Late</span>
                            )}
                            {r.prior_invalidation_bars_ago != null && r.prior_invalidation_bars_ago <= 10 && (
                              <span
                                className="rounded border border-red-500/30 bg-red-500/10 px-1 py-0.5 text-[10px] text-red-400"
                                title={r.prior_invalidation_reason ?? "A previous setup broke recently"}
                              >
                                Broke {r.prior_invalidation_bars_ago}b
                              </span>
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
                          <td colSpan={16} className="bg-[#0f0f0f] px-4 py-4">
                            <div className="grid gap-4 sm:grid-cols-3">
                              {/* Score components */}
                              <div>
                                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#888]">
                                  Score Components
                                </h4>
                                <div className="space-y-1 text-xs">
                                  {[
                                    { label: "State", val: r.state_score, max: 12 },
                                    { label: "Displacement", val: r.displacement_quality, max: 14 },
                                    { label: "Entry (P/D + OTE)", val: r.entry_quality ?? 0, max: 14 },
                                    { label: "FVG Quality", val: r.fvg_quality, max: 10 },
                                    { label: "BSL Cluster", val: r.bsl_quality, max: 10 },
                                    { label: "Compression", val: r.compression_quality, max: 10 },
                                    { label: "Retrace Depth", val: r.retracement_depth, max: 8 },
                                    { label: "Coherence", val: r.structure_coherence, max: 8 },
                                    { label: "Invalidation", val: r.invalidation_distance, max: 8 },
                                    { label: "Recency", val: r.recency_score ?? 0, max: 6 },
                                  ].map(({ label, val, max }) => (
                                    <div key={label} className="flex items-center justify-between">
                                      <span className="text-[#888]">{label}</span>
                                      <div className="flex items-center gap-2">
                                        <div className="h-1.5 w-16 rounded-full bg-[#2a2a2a]">
                                          <div
                                            className="h-1.5 rounded-full bg-[#5ba3e6]"
                                            style={{ width: `${Math.min(100, (val / max) * 100)}%` }}
                                          />
                                        </div>
                                        <span className="w-9 text-right font-mono text-white">{val}/{max}</span>
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
                                    ["1h", r.state_1h, r.score_1h],
                                    ["4h", r.state_4h, r.score_4h],
                                    ["1d", r.state_1d, r.score_1d],
                                    ["1wk", r.state_1wk, r.score_1wk],
                                  ] as [string, string | null, number | null][]).map(([tf, state, score]) => (
                                    <div key={tf} className="flex items-center justify-between">
                                      <span className="text-[#888]">
                                        {tf}
                                        <span className="ml-1 text-[10px] text-[#555]">
                                          {tf === "1h" || tf === "4h" ? "intraday" : "swing"}
                                        </span>
                                      </span>
                                      <div className="flex items-center gap-2">
                                        {state ? (
                                          <span className={`rounded border px-1 py-0.5 text-[10px] font-medium ${stateColor(state)}`}>
                                            {state}
                                          </span>
                                        ) : (
                                          <span className="text-[#333]">—</span>
                                        )}
                                        <span className={`w-6 text-right font-mono ${tfColor(state)}`}>
                                          {score ?? "—"}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <p className="mt-2 text-[10px] leading-relaxed text-[#555]">
                                  Confluence blends the best of each family once — 1h and 4h are the
                                  same chart at two resolutions.
                                </p>
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
                                      {r.bullish_evidence.slice(0, 6).map((e, i) => (
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
                                      {r.caution_evidence.slice(0, 4).map((e, i) => (
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
                                <span className="text-[#666]">R:R: </span>
                                <span className="font-mono text-white">{r.risk_reward != null ? `${fmtNum(r.risk_reward, 2)}` : "—"}</span>
                              </div>
                              <div>
                                <span className="text-[#666]">FVG: </span>
                                <span className="font-mono text-purple-400">
                                  {r.fvg_lower != null && r.fvg_upper != null ? `$${fmtNum(r.fvg_lower, 2)} - $${fmtNum(r.fvg_upper, 2)}` : "—"}
                                </span>
                              </div>
                              <div>
                                <span className="text-[#666]">Range retrace: </span>
                                <span className="font-mono text-white">
                                  {r.range_retracement != null ? `${fmtNum(r.range_retracement * 100, 0)}%` : "—"}
                                </span>
                              </div>
                              {r.prior_invalidation_state && (
                                <div>
                                  <span className="text-[#666]">Prior break: </span>
                                  <span className="font-mono text-red-400">
                                    {r.prior_invalidation_state} · {r.prior_invalidation_bars_ago}b ago
                                  </span>
                                </div>
                              )}
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
