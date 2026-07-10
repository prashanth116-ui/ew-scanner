"use client";

import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import {
  Loader2,
  Calendar,
  Download,
  Filter,
  Search,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Zap,
  Shield,
  TrendingDown,
  Copy,
  Check,
  Target,
} from "lucide-react";
import Link from "next/link";
import { TableErrorBoundary } from "@/components/table-error-boundary";
import { fmtNum } from "@/lib/daily-format";
import { formatDatePill, streakColor } from "@/lib/daily-page-utils";

// ── Types ──

interface InflectionDailyRow {
  scan_date: string;
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  overall_score: number;
  se_score: number;
  vc_score: number;
  be_score: number;
  rs_score: number;
  la_score: number;
  ip_score: number;
  stage: string;
  trade_read: string;
  extension_risk: boolean;
  is_primary: boolean;
  is_stronger: boolean;
  bullish_evidence: string[];
  caution_evidence: string[];
  invalidation: number | null;
}

interface DroppedTicker {
  ticker: string;
  prev_score: number;
}

type TradeReadFilter = "ALL" | "STARTER_POSITION_CANDIDATE" | "ADD_ON_CONFIRMATION" | "WATCH";
type StageFilter = "ALL" | "INFLECTION" | "EARLY_ACCUMULATION" | "EXPANSION" | "SELLER_EXHAUSTION";
type SortField = "overall_score" | "se_score" | "vc_score" | "be_score" | "rs_score" | "la_score" | "ip_score" | "stage" | "ticker" | "price" | "trade_read" | "sector" | "streak" | "delta";

// ── Helpers ──

function stageBadge(stage: string): { label: string; color: string } {
  switch (stage) {
    case "EXPANSION":
      return { label: "Expansion", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "EARLY_ACCUMULATION":
      return { label: "Early Accum.", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
    case "INFLECTION":
      return { label: "Inflection", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" };
    case "SELLER_EXHAUSTION":
      return { label: "Seller Exhaust.", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    default:
      return { label: stage, color: "text-red-400 bg-red-500/10 border-red-500/30" };
  }
}

function tradeReadBadge(tr: string): { label: string; color: string } {
  switch (tr) {
    case "ADD_ON_CONFIRMATION":
      return { label: "Add On", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "STARTER_POSITION_CANDIDATE":
      return { label: "Starter", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
    case "WATCH":
      return { label: "Watch", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    default:
      return { label: tr, color: "text-red-400 bg-red-500/10 border-red-500/30" };
  }
}

function tradeReadLabel(tr: TradeReadFilter): string {
  switch (tr) {
    case "ALL": return "All";
    case "STARTER_POSITION_CANDIDATE": return "Starter";
    case "ADD_ON_CONFIRMATION": return "Add On";
    case "WATCH": return "Watch";
  }
}

function stageLabel(s: StageFilter): string {
  switch (s) {
    case "ALL": return "All Stages";
    case "INFLECTION": return "Inflection";
    case "EARLY_ACCUMULATION": return "Early Accum.";
    case "EXPANSION": return "Expansion";
    case "SELLER_EXHAUSTION": return "Seller Exhaust.";
  }
}

function quadrantBadge(quadrant: string): { label: string; color: string } | null {
  switch (quadrant) {
    case "LEADING":
      return { label: "LD", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "IMPROVING":
      return { label: "IM", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
    case "WEAKENING":
      return { label: "WK", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    case "LAGGING":
      return { label: "LG", color: "text-red-400 bg-red-500/10 border-red-500/30" };
    default:
      return null;
  }
}

function instBadgeColor(classification: string): string {
  const green = ["STRONG_LEADER", "ACCUMULATION_SETUP", "BREAKOUT_SETUP", "MOMENTUM_LEADER", "WATCHLIST_LEADER"];
  const red = ["AVOID", "DISTRIBUTION", "BREAKDOWN"];
  if (green.some((g) => classification.includes(g))) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (red.some((r) => classification.includes(r))) return "text-red-400 bg-red-500/10 border-red-500/30";
  return "text-amber-400 bg-amber-500/10 border-amber-500/30";
}

function instClassLabel(classification: string): string {
  return classification.replace(/_/g, " ").split(" ").map((w) => w[0]).join("").slice(0, 3);
}

function scoreBarColor(score: number): string {
  if (score >= 55) return "bg-emerald-500";
  if (score >= 40) return "bg-cyan-500";
  if (score >= 25) return "bg-amber-500";
  return "bg-red-500";
}

function scoreTextColor(score: number): string {
  if (score >= 55) return "text-emerald-400";
  if (score >= 40) return "text-cyan-400";
  if (score >= 25) return "text-amber-400";
  return "text-red-400";
}

const STAGE_ORDER: Record<string, number> = {
  EXPANSION: 0,
  EARLY_ACCUMULATION: 1,
  INFLECTION: 2,
  SELLER_EXHAUSTION: 3,
  DISTRIBUTION: 4,
};

const TRADE_READ_ORDER: Record<string, number> = {
  STARTER_POSITION_CANDIDATE: 0,
  ADD_ON_CONFIRMATION: 1,
  WATCH: 2,
  AVOID: 3,
};

// formatDatePill, streakColor imported from daily-page-utils

// ── Inline Score Bar ──

function MiniScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1.5 bg-[#0f0f0f] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${scoreBarColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-[10px] font-medium tabular-nums ${scoreTextColor(score)}`}>{score}</span>
    </div>
  );
}

// ── CSV Export ──

function exportCSV(results: InflectionDailyRow[], date: string, streaks: Record<string, number>, deltas: Record<string, number>) {
  const headers = [
    "Ticker", "Company", "Sector", "Price", "Score", "Delta", "Streak",
    "SE", "VC", "BE", "RS", "LA", "IP",
    "Stage", "Trade Read", "Extension Risk", "Primary Signal", "Stronger Signal",
    "Invalidation", "Bullish Evidence", "Caution Evidence",
  ];
  const rows = results.map((r) => [
    r.ticker,
    `"${(r.company_name ?? "").replace(/"/g, '""')}"`,
    r.sector ?? "",
    r.price,
    r.overall_score,
    deltas[r.ticker] ?? "",
    streaks[r.ticker] ?? 1,
    r.se_score,
    r.vc_score,
    r.be_score,
    r.rs_score,
    r.la_score,
    r.ip_score,
    r.stage,
    r.trade_read,
    r.extension_risk,
    r.is_primary,
    r.is_stronger,
    r.invalidation ?? "",
    `"${(r.bullish_evidence ?? []).join("; ").replace(/"/g, '""')}"`,
    `"${(r.caution_evidence ?? []).join("; ").replace(/"/g, '""')}"`,
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inflection-daily-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Expanded Row Detail ──

function ExpandedEvidence({ row }: { row: InflectionDailyRow }) {
  const bullish = row.bullish_evidence ?? [];
  const caution = row.caution_evidence ?? [];

  return (
    <tr>
      <td colSpan={17} className="px-3 py-3 bg-[#111]">
        <div className="flex flex-wrap gap-4">
          {bullish.length > 0 && (
            <div className="flex-1 min-w-[200px]">
              <p className="text-[9px] uppercase tracking-wider text-emerald-500/60 mb-1.5">Bullish Evidence</p>
              <div className="flex flex-wrap gap-1">
                {bullish.map((ev, i) => (
                  <span key={i} className="rounded px-1.5 py-0.5 text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {ev}
                  </span>
                ))}
              </div>
            </div>
          )}
          {caution.length > 0 && (
            <div className="flex-1 min-w-[200px]">
              <p className="text-[9px] uppercase tracking-wider text-amber-500/60 mb-1.5">Caution</p>
              <div className="flex flex-wrap gap-1">
                {caution.map((ev, i) => (
                  <span key={i} className="rounded px-1.5 py-0.5 text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {ev}
                  </span>
                ))}
              </div>
            </div>
          )}
          {bullish.length === 0 && caution.length === 0 && (
            <p className="text-[10px] text-[#555]">No evidence details available.</p>
          )}
          {row.invalidation !== null && (
            <div className="shrink-0">
              <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1">Invalidation</p>
              <p className="text-xs font-medium text-white">${fmtNum(row.invalidation, 2)}</p>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Sortable Column Header ──

function SortHeader({
  field,
  label,
  currentSort,
  sortAsc,
  onSort,
  className,
}: {
  field: SortField;
  label: string;
  currentSort: SortField;
  sortAsc: boolean;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const active = currentSort === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors whitespace-nowrap ${
        active ? "text-white" : "text-[#666] hover:text-[#a0a0a0]"
      } ${className ?? ""}`}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active && (
          <span className="text-[8px]">{sortAsc ? "\u25B2" : "\u25BC"}</span>
        )}
      </span>
    </th>
  );
}

// ── Main Page ──

export default function InflectionDailyPage() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [results, setResults] = useState<InflectionDailyRow[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [dropped, setDropped] = useState<DroppedTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [tradeReadFilter, setTradeReadFilter] = useState<TradeReadFilter>("ALL");
  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");
  const [minScore, setMinScore] = useState(0);
  const [tickerSearch, setTickerSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("overall_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [showDropped, setShowDropped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [transitionTickers, setTransitionTickers] = useState<Map<string, { state: string; alert_state: string; score: number }>>(new Map());
  const [sectorQuadrants, setSectorQuadrants] = useState<Map<string, string>>(new Map());
  const [instTickers, setInstTickers] = useState<Map<string, { classification: string; score: number }>>(new Map());
  const [highConvictionOnly, setHighConvictionOnly] = useState(false);

  // Load available dates on mount
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/inflection/daily?dates=true");
        const json = await res.json();
        const d = json.dates ?? [];
        setDates(d);
        if (d.length > 0) {
          setSelectedDate(d[0]);
        }
      } catch {
        // No data yet
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Load results + cross-scanner enrichment when date changes
  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;

    async function load() {
      setLoadingResults(true);
      try {
        const [infRes, transRes, sectorRes, instRes] = await Promise.all([
          fetch(`/api/inflection/daily?date=${selectedDate}`),
          fetch(`/api/transition/daily?date=${selectedDate}`).catch(() => null),
          fetch("/api/sector-rotation").catch(() => null),
          fetch(`/api/institutional/daily?date=${selectedDate}`).catch(() => null),
        ]);
        const json = await infRes.json();
        if (!cancelled) {
          setResults(json.results ?? []);
          setStreaks(json.streaks ?? {});
          setDeltas(json.deltas ?? {});
          setDropped(json.dropped ?? []);
          setExpandedTicker(null);
        }
        // Build transition ticker map
        if (transRes && transRes.ok) {
          const transJson = await transRes.json();
          const map = new Map<string, { state: string; alert_state: string; score: number }>();
          for (const r of transJson.results ?? []) {
            map.set(r.ticker, { state: r.state, alert_state: r.alert_state, score: r.overall_score });
          }
          if (!cancelled) setTransitionTickers(map);
        } else {
          if (!cancelled) setTransitionTickers(new Map());
        }
        // Build sector quadrant map
        if (sectorRes && sectorRes.ok) {
          const sectorJson = await sectorRes.json();
          const map = new Map<string, string>();
          for (const s of [...(sectorJson.sectors ?? []), ...(sectorJson.subSectorScores ?? [])]) {
            map.set(s.sector, s.quadrant);
          }
          if (!cancelled) setSectorQuadrants(map);
        } else {
          if (!cancelled) setSectorQuadrants(new Map());
        }
        // Build institutional ticker map
        if (instRes && instRes.ok) {
          const instJson = await instRes.json();
          const map = new Map<string, { classification: string; score: number }>();
          for (const r of instJson.results ?? []) {
            map.set(r.ticker, { classification: r.classification, score: r.composite_score });
          }
          if (!cancelled) setInstTickers(map);
        } else {
          if (!cancelled) setInstTickers(new Map());
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setStreaks({});
          setDeltas({});
          setDropped([]);
          setTransitionTickers(new Map());
          setSectorQuadrants(new Map());
          setInstTickers(new Map());
        }
      } finally {
        if (!cancelled) setLoadingResults(false);
      }
    }
    load();
    return () => { cancelled = true; };
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

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(results.map((r) => r.ticker).join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [results]);

  // High conviction tickers: on BOTH scanners with favorable conditions
  const highConvictionTickers = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) {
      if (r.trade_read !== "STARTER_POSITION_CANDIDATE" && r.trade_read !== "ADD_ON_CONFIRMATION") continue;
      const trans = transitionTickers.get(r.ticker);
      if (!trans) continue;
      if (trans.alert_state !== "ARMED" && trans.alert_state !== "READY" && trans.alert_state !== "TRIGGERED") continue;
      // Sector quadrant check (optional: if available, require IMPROVING or LEADING)
      const q = sectorQuadrants.get(r.sector ?? "");
      if (q && q !== "IMPROVING" && q !== "LEADING") continue;
      set.add(r.ticker);
    }
    return set;
  }, [results, transitionTickers, sectorQuadrants]);

  // Filter and sort results
  const filtered = useMemo(() => {
    let rows = results;

    if (highConvictionOnly) {
      rows = rows.filter((r) => highConvictionTickers.has(r.ticker));
    }
    if (tradeReadFilter !== "ALL") {
      rows = rows.filter((r) => r.trade_read === tradeReadFilter);
    }
    if (stageFilter !== "ALL") {
      rows = rows.filter((r) => r.stage === stageFilter);
    }
    if (minScore > 0) {
      rows = rows.filter((r) => r.overall_score >= minScore);
    }
    if (tickerSearch.trim()) {
      const q = tickerSearch.trim().toUpperCase();
      rows = rows.filter(
        (r) => r.ticker.includes(q) || (r.company_name ?? "").toUpperCase().includes(q) || (r.sector ?? "").toUpperCase().includes(q)
      );
    }

    const sorted = [...rows].sort((a, b) => {
      let cmp: number;
      if (sortField === "stage") {
        cmp = (STAGE_ORDER[a.stage] ?? 99) - (STAGE_ORDER[b.stage] ?? 99);
      } else if (sortField === "trade_read") {
        cmp = (TRADE_READ_ORDER[a.trade_read] ?? 99) - (TRADE_READ_ORDER[b.trade_read] ?? 99);
      } else if (sortField === "ticker") {
        cmp = a.ticker.localeCompare(b.ticker);
      } else if (sortField === "sector") {
        cmp = (a.sector ?? "").localeCompare(b.sector ?? "");
      } else if (sortField === "price") {
        cmp = Number(b.price) - Number(a.price);
      } else if (sortField === "streak") {
        cmp = (streaks[b.ticker] ?? 1) - (streaks[a.ticker] ?? 1);
      } else if (sortField === "delta") {
        cmp = (deltas[b.ticker] ?? 0) - (deltas[a.ticker] ?? 0);
      } else {
        cmp = (b[sortField] ?? 0) - (a[sortField] ?? 0);
      }
      return sortAsc ? -cmp : cmp;
    });

    return sorted;
  }, [results, highConvictionOnly, highConvictionTickers, tradeReadFilter, stageFilter, minScore, tickerSearch, sortField, sortAsc, streaks, deltas]);

  // Summary counts
  const starterCount = results.filter((r) => r.trade_read === "STARTER_POSITION_CANDIDATE").length;
  const addOnCount = results.filter((r) => r.trade_read === "ADD_ON_CONFIRMATION").length;
  const watchCount = results.filter((r) => r.trade_read === "WATCH").length;
  const newTodayCount = Object.values(streaks).filter((s) => s === 1).length;

  // Sector summary for results
  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of results) {
      const s = r.sector || "Other";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [results]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#666]" />
      </div>
    );
  }

  if (dates.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-white mb-4">Inflection Daily Results</h1>
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center">
          <p className="text-[#a0a0a0] mb-2">No scan data available yet.</p>
          <p className="text-[#666] text-sm">
            The daily inflection scan runs at 9:45 PM ET Mon-Fri. Results will appear here after the first run.
          </p>
        </div>
        <div className="mt-4">
          <Link href="/prerun" className="text-sm text-[#666] hover:text-white transition-colors">
            &larr; Back to Pre-Run Scanner
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Inflection Daily Results</h1>
          <p className="text-xs text-[#666] mt-1">
            S&P 500 + Nasdaq-100 | 14-day rolling history
          </p>
        </div>
        <Link href="/prerun" className="text-sm text-[#666] hover:text-white transition-colors">
          &larr; Pre-Run Scanner
        </Link>
      </div>

      {/* Date tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
        <Calendar className="h-4 w-4 text-[#555] shrink-0" />
        {dates.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDate(d)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              d === selectedDate
                ? "bg-white text-black"
                : "bg-[#1a1a1a] text-[#a0a0a0] hover:bg-[#2a2a2a] hover:text-white border border-[#2a2a2a]"
            }`}
          >
            {formatDatePill(d)}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap mb-4 text-xs">
        <span className="text-[#a0a0a0]">
          <strong className="text-white">{results.length}</strong> stocks
        </span>
        <span className="text-[#333]">|</span>
        <span className="text-cyan-400">
          <strong>{starterCount}</strong> Starter
        </span>
        <span className="text-emerald-400">
          <strong>{addOnCount}</strong> Add On
        </span>
        <span className="text-amber-400">
          <strong>{watchCount}</strong> Watch
        </span>
        {newTodayCount > 0 && (
          <>
            <span className="text-[#333]">|</span>
            <span className="text-green-400">
              <Sparkles className="h-3 w-3 inline mr-0.5" />
              <strong>{newTodayCount}</strong> new
            </span>
          </>
        )}
        {dropped.length > 0 && (
          <>
            <span className="text-[#333]">|</span>
            <button
              onClick={() => setShowDropped(!showDropped)}
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              <TrendingDown className="h-3 w-3 inline mr-0.5" />
              <strong>{dropped.length}</strong> dropped
            </button>
          </>
        )}
        {filtered.length !== results.length && (
          <>
            <span className="text-[#333]">|</span>
            <span className="text-[#a0a0a0]">
              Showing <strong className="text-white">{filtered.length}</strong>
            </span>
          </>
        )}
      </div>

      {/* Dropped today section */}
      {showDropped && dropped.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/[0.03] p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider text-red-400/60 font-semibold">
              Dropped from previous day ({dropped.length})
            </p>
            <button onClick={() => setShowDropped(false)} className="text-[10px] text-[#666] hover:text-white">
              Hide
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {dropped.map((d) => (
              <span
                key={d.ticker}
                className="inline-flex items-center gap-1 rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400"
              >
                {d.ticker}
                <span className="text-red-500/50">{d.prev_score}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sector summary pills */}
      {sectorCounts.length > 0 && !loadingResults && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          <span className="text-[10px] text-[#555] mr-1">Sectors:</span>
          {sectorCounts.slice(0, 8).map(([sector, count]) => (
            <button
              key={sector}
              onClick={() => setTickerSearch(sector)}
              className="rounded border border-[#2a2a2a] bg-[#141414] px-2 py-0.5 text-[10px] text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
            >
              {sector} <strong className="text-white">{count}</strong>
            </button>
          ))}
          {sectorCounts.length > 8 && (
            <span className="text-[10px] text-[#555]">+{sectorCounts.length - 8} more</span>
          )}
        </div>
      )}

      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        {/* Ticker search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#555]" />
          <input
            type="text"
            value={tickerSearch}
            onChange={(e) => setTickerSearch(e.target.value)}
            placeholder="Ticker / sector..."
            className="w-40 rounded border border-[#333] bg-[#1a1a1a] pl-7 pr-2 py-1 text-xs text-white placeholder-[#555] focus:border-[#555] focus:outline-none"
          />
        </div>

        {/* Min score */}
        <select
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value))}
          className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#a0a0a0] focus:outline-none"
        >
          <option value={0}>All Scores</option>
          <option value={30}>30+</option>
          <option value={40}>40+</option>
          <option value={50}>50+</option>
          <option value={60}>60+</option>
        </select>

        <span className="text-[#333]">|</span>

        {/* Trade Read filter */}
        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-[#555]" />
          {(["ALL", "STARTER_POSITION_CANDIDATE", "ADD_ON_CONFIRMATION", "WATCH"] as TradeReadFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setTradeReadFilter(f)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                tradeReadFilter === f
                  ? "bg-white/10 text-white border border-white/20"
                  : "text-[#666] hover:text-white"
              }`}
            >
              {tradeReadLabel(f)}
            </button>
          ))}
        </div>

        <span className="text-[#333]">|</span>

        {/* Stage filter */}
        {(["ALL", "INFLECTION", "EARLY_ACCUMULATION", "EXPANSION", "SELLER_EXHAUSTION"] as StageFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setStageFilter(f)}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              stageFilter === f
                ? "bg-white/10 text-white border border-white/20"
                : "text-[#666] hover:text-white"
            }`}
          >
            {stageLabel(f)}
          </button>
        ))}

        {/* High Conviction toggle + Copy + CSV export */}
        <div className="ml-auto flex items-center gap-2">
          {highConvictionTickers.size > 0 && (
            <button
              onClick={() => setHighConvictionOnly((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-colors ${
                highConvictionOnly
                  ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                  : "bg-[#1a1a1a] text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] border-[#2a2a2a]"
              }`}
            >
              <Target className="h-3 w-3" />
              High Conviction ({highConvictionTickers.size})
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#1a1a1a] text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] border border-[#2a2a2a] transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => exportCSV(filtered, selectedDate ?? "", streaks, deltas)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#1a1a1a] text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] border border-[#2a2a2a] transition-colors"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loadingResults && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#666]" />
        </div>
      )}

      {/* Empty state */}
      {!loadingResults && filtered.length === 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center">
          <p className="text-[#a0a0a0]">No results match the current filters.</p>
        </div>
      )}

      {/* Table */}
      {!loadingResults && filtered.length > 0 && (
        <TableErrorBoundary>
        <div className="rounded-lg border border-[#2a2a2a] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#111] border-b border-[#2a2a2a] sticky top-0 z-10">
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#666] w-8"></th>
                  <SortHeader field="ticker" label="Ticker" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#666]">Company</th>
                  <SortHeader field="sector" label="Sector" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="price" label="Price" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="overall_score" label="Score" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="delta" label="+/-" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="streak" label="Days" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="se_score" label="SE" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="vc_score" label="VC" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="be_score" label="BE" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="rs_score" label="RS" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="la_score" label="LA" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="ip_score" label="IP" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="stage" label="Stage" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="trade_read" label="Read" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#666]">Flags</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const streak = streaks[row.ticker] ?? 1;
                  const delta = deltas[row.ticker];
                  const isNew = streak === 1;
                  const isExpanded = expandedTicker === row.ticker;
                  const sBadge = stageBadge(row.stage);
                  const trBadge = tradeReadBadge(row.trade_read);

                  return (
                    <Fragment key={row.ticker}>
                      <tr
                        onClick={() => setExpandedTicker(isExpanded ? null : row.ticker)}
                        className={`border-b border-[#1a1a1a] cursor-pointer transition-colors ${
                          isExpanded ? "bg-[#161616]" : "hover:bg-[#141414]"
                        } ${isNew ? "bg-green-500/[0.03]" : ""}`}
                      >
                        {/* Expand indicator */}
                        <td className="px-2 py-2 text-[#444]">
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </td>

                        {/* Ticker */}
                        <td className="px-2 py-2 font-bold text-white whitespace-nowrap">
                          {row.ticker}
                        </td>

                        {/* Company */}
                        <td className="px-2 py-2 text-[#a0a0a0] max-w-[140px] truncate">
                          {row.company_name}
                        </td>

                        {/* Sector */}
                        <td className="px-2 py-2 text-[10px] whitespace-nowrap">
                          <span className="text-[#777]">{row.sector || "-"}</span>
                          {(() => {
                            const qb = quadrantBadge(sectorQuadrants.get(row.sector ?? "") ?? "");
                            return qb ? (
                              <span className={`ml-1 inline-flex items-center rounded border px-1 py-0 text-[7px] font-bold ${qb.color}`}>
                                {qb.label}
                              </span>
                            ) : null;
                          })()}
                        </td>

                        {/* Price */}
                        <td className="px-2 py-2 text-white tabular-nums whitespace-nowrap">
                          ${fmtNum(row.price, 2)}
                        </td>

                        {/* Overall Score */}
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-2 bg-[#0f0f0f] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${scoreBarColor(row.overall_score)}`}
                                style={{ width: `${row.overall_score}%` }}
                              />
                            </div>
                            <span className={`text-[11px] font-bold tabular-nums ${scoreTextColor(row.overall_score)}`}>
                              {row.overall_score}
                            </span>
                          </div>
                        </td>

                        {/* Delta */}
                        <td className="px-2 py-2 tabular-nums whitespace-nowrap">
                          {delta !== undefined ? (
                            <span className={`text-[10px] font-medium ${
                              delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-[#555]"
                            }`}>
                              {delta > 0 ? "+" : ""}{delta}
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#333]">-</span>
                          )}
                        </td>

                        {/* Streak */}
                        <td className="px-2 py-2">
                          <span className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[9px] font-bold tabular-nums min-w-[24px] ${streakColor(streak)}`}>
                            {streak}d
                          </span>
                        </td>

                        {/* Sub-scores */}
                        <td className="px-2 py-2"><MiniScoreBar score={row.se_score} /></td>
                        <td className="px-2 py-2"><MiniScoreBar score={row.vc_score} /></td>
                        <td className="px-2 py-2"><MiniScoreBar score={row.be_score} /></td>
                        <td className="px-2 py-2"><MiniScoreBar score={row.rs_score} /></td>
                        <td className="px-2 py-2"><MiniScoreBar score={row.la_score} /></td>
                        <td className="px-2 py-2"><MiniScoreBar score={row.ip_score} /></td>

                        {/* Stage */}
                        <td className="px-2 py-2">
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide whitespace-nowrap ${sBadge.color}`}>
                            {sBadge.label}
                          </span>
                        </td>

                        {/* Trade Read */}
                        <td className="px-2 py-2">
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide whitespace-nowrap ${trBadge.color}`}>
                            {trBadge.label}
                          </span>
                        </td>

                        {/* Flags */}
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            {row.is_primary && (
                              <span title="Primary Signal" className="inline-flex items-center rounded border border-purple-500/30 bg-purple-500/10 px-1 py-0.5 text-[8px] font-semibold text-purple-400">
                                <Zap className="h-2.5 w-2.5" />
                              </span>
                            )}
                            {row.is_stronger && (
                              <span title="Stronger Signal" className="inline-flex items-center rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5 text-[8px] font-semibold text-emerald-400">
                                <Shield className="h-2.5 w-2.5" />
                              </span>
                            )}
                            {isNew && (
                              <span title="New Today" className="inline-flex items-center rounded border border-green-500/30 bg-green-500/10 px-1 py-0.5 text-[8px] font-bold text-green-400">
                                NEW
                              </span>
                            )}
                            {row.extension_risk && (
                              <span title="Extension Risk" className="inline-flex items-center rounded border border-orange-500/30 bg-orange-500/10 px-1 py-0.5 text-[8px] font-semibold text-orange-400">
                                EXT
                              </span>
                            )}
                            {transitionTickers.has(row.ticker) && (
                              <Link
                                href="/prerun/transition-daily"
                                title={`Also on Transition: ${transitionTickers.get(row.ticker)!.state} / ${transitionTickers.get(row.ticker)!.alert_state} (${transitionTickers.get(row.ticker)!.score})`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center rounded border border-violet-500/30 bg-violet-500/10 px-1 py-0.5 text-[8px] font-bold text-violet-400 hover:bg-violet-500/20 transition-colors"
                              >
                                TRANS
                              </Link>
                            )}
                            {instTickers.has(row.ticker) && (
                              <Link
                                href="/prerun/institutional-daily"
                                title={`Institutional: ${instTickers.get(row.ticker)!.classification} (${instTickers.get(row.ticker)!.score})`}
                                onClick={(e) => e.stopPropagation()}
                                className={`inline-flex items-center rounded border px-1 py-0.5 text-[8px] font-bold hover:opacity-80 transition-colors ${instBadgeColor(instTickers.get(row.ticker)!.classification)}`}
                              >
                                INST
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded evidence */}
                      {isExpanded && <ExpandedEvidence row={row} />}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </TableErrorBoundary>
      )}

      {/* Footer */}
      <div className="mt-6 text-center text-[10px] text-[#444]">
        Scan runs at 9:45 PM ET Mon-Fri | Universe: S&P 500 + Nasdaq-100 (~560 tickers) | 14-day retention
      </div>
    </div>
  );
}
