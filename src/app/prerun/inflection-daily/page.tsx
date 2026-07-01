"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2,
  Calendar,
  Download,
  Filter,
  ArrowUpDown,
  Zap,
  Shield,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Check,
  X,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

// ── Types ──

interface InflectionDailyRow {
  scan_date: string;
  ticker: string;
  company_name: string;
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

type TradeReadFilter = "ALL" | "STARTER_POSITION_CANDIDATE" | "ADD_ON_CONFIRMATION" | "WATCH";
type StageFilter = "ALL" | "INFLECTION" | "EARLY_ACCUMULATION" | "EXPANSION" | "SELLER_EXHAUSTION";
type SortField = "overall_score" | "se_score" | "vc_score" | "be_score" | "rs_score" | "stage" | "ticker";

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
    case "ALL": return "All";
    case "INFLECTION": return "Inflection";
    case "EARLY_ACCUMULATION": return "Early Accum.";
    case "EXPANSION": return "Expansion";
    case "SELLER_EXHAUSTION": return "Seller Exhaust.";
  }
}

function scoreBarColor(score: number): string {
  if (score >= 55) return "bg-emerald-500";
  if (score >= 40) return "bg-cyan-500";
  if (score >= 25) return "bg-amber-500";
  return "bg-red-500";
}

const STAGE_ORDER: Record<string, number> = {
  EXPANSION: 0,
  EARLY_ACCUMULATION: 1,
  INFLECTION: 2,
  SELLER_EXHAUSTION: 3,
  DISTRIBUTION: 4,
};

function formatDatePill(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── CSV Export ──

function exportCSV(results: InflectionDailyRow[], date: string) {
  const headers = [
    "Ticker", "Company", "Price", "Score", "SE", "VC", "BE", "RS", "LA", "IP",
    "Stage", "Trade Read", "Extension Risk", "Primary Signal", "Stronger Signal",
    "Invalidation", "Bullish Evidence", "Caution Evidence",
  ];
  const rows = results.map((r) => [
    r.ticker,
    `"${(r.company_name ?? "").replace(/"/g, '""')}"`,
    r.price,
    r.overall_score,
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

// ── Result Card ──

function ResultCard({
  row,
  isNew,
  index,
}: {
  row: InflectionDailyRow;
  isNew: boolean;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const sBadge = stageBadge(row.stage);
  const trBadge = tradeReadBadge(row.trade_read);

  const scoreBars = [
    { label: "Seller Exhaust", score: row.se_score, key: "SE" },
    { label: "Vol Compress", score: row.vc_score, key: "VC" },
    { label: "Buyer Emerge", score: row.be_score, key: "BE" },
    { label: "Rel Strength", score: row.rs_score, key: "RS" },
    { label: "Auction", score: row.la_score, key: "LA" },
    { label: "Inst Particip", score: row.ip_score, key: "IP" },
  ];

  return (
    <div
      className="ew-card-in rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 hover:border-[#3a3a3a] transition-colors flex flex-col"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white">{row.ticker}</h3>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sBadge.color}`}>
              {sBadge.label}
            </span>
            <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${trBadge.color}`}>
              {trBadge.label}
            </span>
            {row.is_primary && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-purple-400">
                <Zap className="h-2.5 w-2.5" /> Signal
              </span>
            )}
            {row.is_stronger && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
                <Shield className="h-2.5 w-2.5" /> Strong
              </span>
            )}
            {isNew && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[9px] font-bold text-green-400 uppercase tracking-wider">
                <Sparkles className="h-2.5 w-2.5" /> New
              </span>
            )}
          </div>
          <p className="text-xs text-[#a0a0a0] truncate mt-0.5">{row.company_name}</p>
        </div>
        <p className="text-sm font-medium text-white shrink-0 ml-2">
          ${Number(row.price).toFixed(2)}
        </p>
      </div>

      {/* Overall score bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[#a0a0a0]">Overall</span>
          <span className="font-medium text-white">{row.overall_score}/100</span>
        </div>
        <div className="h-2 bg-[#0f0f0f] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(row.overall_score)}`}
            style={{ width: `${Math.min(100, row.overall_score)}%` }}
          />
        </div>
      </div>

      {/* 6 category score bars */}
      <div className="space-y-1.5 mb-3">
        {scoreBars.map((bar) => (
          <div key={bar.key} className="flex items-center gap-2">
            <span className="text-[9px] text-[#666] w-20 text-right shrink-0">{bar.label}</span>
            <div className="flex-1 h-1.5 bg-[#0f0f0f] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${scoreBarColor(bar.score)}`}
                style={{ width: `${bar.score}%` }}
              />
            </div>
            <span className="text-[9px] text-[#a0a0a0] w-6 shrink-0">{bar.score}</span>
          </div>
        ))}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-3 text-[10px]">
        <div>
          <span className="text-[#555]">Extension Risk</span>
          <p className={row.extension_risk ? "text-orange-400 font-medium" : "text-white"}>
            {row.extension_risk ? "Yes" : "No"}
          </p>
        </div>
        <div>
          <span className="text-[#555]">Invalidation</span>
          <p className="text-white font-medium">
            {row.invalidation !== null ? `$${Number(row.invalidation).toFixed(2)}` : "-"}
          </p>
        </div>
      </div>

      {/* Evidence pills */}
      <div className="space-y-1.5 mb-3">
        {(row.bullish_evidence ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(row.bullish_evidence ?? []).slice(0, expanded ? undefined : 3).map((ev, i) => (
              <span key={i} className="rounded px-1.5 py-0.5 text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {ev}
              </span>
            ))}
            {!expanded && (row.bullish_evidence ?? []).length > 3 && (
              <span className="text-[9px] text-[#666]">+{(row.bullish_evidence ?? []).length - 3} more</span>
            )}
          </div>
        )}
        {(row.caution_evidence ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(row.caution_evidence ?? []).slice(0, expanded ? undefined : 2).map((ev, i) => (
              <span key={i} className="rounded px-1.5 py-0.5 text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {ev}
              </span>
            ))}
            {!expanded && (row.caution_evidence ?? []).length > 2 && (
              <span className="text-[9px] text-[#666]">+{(row.caution_evidence ?? []).length - 2} more</span>
            )}
          </div>
        )}
      </div>

      {/* Expand toggle */}
      <div className="mt-auto pt-2 border-t border-[#1f1f1f]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-[#666] hover:text-white transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Less" : "All evidence"}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function InflectionDailyPage() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [results, setResults] = useState<InflectionDailyRow[]>([]);
  const [prevDayTickers, setPrevDayTickers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [tradeReadFilter, setTradeReadFilter] = useState<TradeReadFilter>("ALL");
  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");
  const [sortField, setSortField] = useState<SortField>("overall_score");
  const [sortAsc, setSortAsc] = useState(false);

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

  // Load results when date changes
  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;

    async function load() {
      setLoadingResults(true);
      try {
        const res = await fetch(`/api/inflection/daily?date=${selectedDate}`);
        const json = await res.json();
        if (!cancelled) {
          setResults(json.results ?? []);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoadingResults(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedDate]);

  // Load previous day's tickers for "new today" badges
  useEffect(() => {
    if (!selectedDate || dates.length < 2) {
      setPrevDayTickers(new Set());
      return;
    }
    const currentIdx = dates.indexOf(selectedDate);
    const prevDate = currentIdx >= 0 && currentIdx < dates.length - 1 ? dates[currentIdx + 1] : null;
    if (!prevDate) {
      setPrevDayTickers(new Set());
      return;
    }

    let cancelled = false;
    async function loadPrev() {
      try {
        const res = await fetch(`/api/inflection/daily?date=${prevDate}`);
        const json = await res.json();
        if (!cancelled) {
          setPrevDayTickers(new Set((json.results ?? []).map((r: InflectionDailyRow) => r.ticker)));
        }
      } catch {
        if (!cancelled) setPrevDayTickers(new Set());
      }
    }
    loadPrev();
    return () => { cancelled = true; };
  }, [selectedDate, dates]);

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

  // Filter and sort results
  const filtered = useMemo(() => {
    let rows = results;

    if (tradeReadFilter !== "ALL") {
      rows = rows.filter((r) => r.trade_read === tradeReadFilter);
    }
    if (stageFilter !== "ALL") {
      rows = rows.filter((r) => r.stage === stageFilter);
    }

    const sorted = [...rows].sort((a, b) => {
      let cmp: number;
      if (sortField === "stage") {
        cmp = (STAGE_ORDER[a.stage] ?? 99) - (STAGE_ORDER[b.stage] ?? 99);
      } else if (sortField === "ticker") {
        cmp = a.ticker.localeCompare(b.ticker);
      } else {
        cmp = (b[sortField] ?? 0) - (a[sortField] ?? 0);
      }
      return sortAsc ? -cmp : cmp;
    });

    return sorted;
  }, [results, tradeReadFilter, stageFilter, sortField, sortAsc]);

  // Summary counts
  const starterCount = results.filter((r) => r.trade_read === "STARTER_POSITION_CANDIDATE").length;
  const addOnCount = results.filter((r) => r.trade_read === "ADD_ON_CONFIRMATION").length;
  const watchCount = results.filter((r) => r.trade_read === "WATCH").length;
  const newTodayCount = results.filter((r) => !prevDayTickers.has(r.ticker)).length;

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
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
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
        {prevDayTickers.size > 0 && newTodayCount > 0 && (
          <>
            <span className="text-[#333]">|</span>
            <span className="text-green-400">
              <Sparkles className="h-3 w-3 inline mr-0.5" />
              <strong>{newTodayCount}</strong> new today
            </span>
          </>
        )}
        <div className="ml-auto">
          <button
            onClick={() => exportCSV(filtered, selectedDate ?? "")}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#1a1a1a] text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] border border-[#2a2a2a] transition-colors"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-5">
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

        <span className="text-[#333]">|</span>

        {/* Sort */}
        <div className="flex items-center gap-1">
          <ArrowUpDown className="h-3 w-3 text-[#555]" />
          {([
            { field: "overall_score" as SortField, label: "Score" },
            { field: "se_score" as SortField, label: "SE" },
            { field: "be_score" as SortField, label: "BE" },
            { field: "rs_score" as SortField, label: "RS" },
            { field: "stage" as SortField, label: "Stage" },
          ]).map(({ field, label }) => (
            <button
              key={field}
              onClick={() => handleSort(field)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                sortField === field
                  ? "bg-white/10 text-white border border-white/20"
                  : "text-[#666] hover:text-white"
              }`}
            >
              {label}
              {sortField === field && (sortAsc ? " \u2191" : " \u2193")}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loadingResults && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#666]" />
        </div>
      )}

      {/* Results grid */}
      {!loadingResults && filtered.length === 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center">
          <p className="text-[#a0a0a0]">No results match the current filters.</p>
        </div>
      )}

      {!loadingResults && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((row, i) => (
            <ResultCard
              key={row.ticker}
              row={row}
              isNew={prevDayTickers.size > 0 && !prevDayTickers.has(row.ticker)}
              index={i}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center text-[10px] text-[#444]">
        Scan runs at 9:45 PM ET Mon-Fri | Universe: S&P 500 + Nasdaq-100 (~560 tickers) | 14-day retention
      </div>
    </div>
  );
}
