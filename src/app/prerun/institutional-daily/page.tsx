"use client";

import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import {
  Loader2,
  Calendar,
  Download,
  Search,
  Sparkles,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";
import { TableErrorBoundary } from "@/components/table-error-boundary";
import { fmtNum } from "@/lib/daily-format";
import { formatDatePill, streakColor } from "@/lib/daily-page-utils";

// ── Types ──

interface InstitutionalDailyRow {
  scan_date: string;
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  composite_score: number;
  institutional_score: number;
  execution_score: number;
  risk_score: number;
  discipline_score: number;
  classification: string;
  entry_quality: string | null;
  best_trigger: string | null;
  tier: string | null;
  avoid_reason: string | null;
  commentary_summary: string | null;
  rs_accel_spy: number | null;
  rs_accel_qqq: number | null;
  gap_pct: number | null;
  dist_from_ema20_atr: number | null;
}

interface DroppedTicker {
  ticker: string;
  prev_score: number;
}

type TierFilter = "ALL" | "SHORTLIST" | "WATCHLIST" | "SPECULATIVE";
type SortField = "composite_score" | "institutional_score" | "execution_score" | "risk_score" | "discipline_score" | "ticker" | "price" | "classification" | "tier" | "streak" | "delta";

const TIER_LABELS: Record<TierFilter, string> = {
  ALL: "All",
  SHORTLIST: "Shortlist",
  WATCHLIST: "Watchlist",
  SPECULATIVE: "Speculative",
};

// ── Helpers ──

function classificationBadge(c: string): { label: string; color: string } {
  if (c === "CONTINUATION_LEADER") return { label: "Continuation", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
  if (c === "RECOVERY_LEADER") return { label: "Recovery", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
  if (c === "FRESH_ROTATION") return { label: "Fresh Rotation", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" };
  if (c === "INSTITUTIONAL_ACCUMULATION") return { label: "Inst. Accum.", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" };
  if (c === "TIGHT_BASE") return { label: "Tight Base", color: "text-teal-400 bg-teal-500/10 border-teal-500/30" };
  if (c === "CONSTRUCTIVE_SETUP") return { label: "Constructive", color: "text-sky-400 bg-sky-500/10 border-sky-500/30" };
  if (c === "OVERSOLD_REVERSAL") return { label: "Oversold Rev.", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
  if (c === "TOO_EXTENDED") return { label: "Extended", color: "text-orange-400 bg-orange-500/10 border-orange-500/30" };
  if (c === "NEUTRAL_HOLD") return { label: "Neutral", color: "text-[#666] bg-[#1a1a1a] border-[#2a2a2a]" };
  return { label: c.replace(/_/g, " "), color: "text-[#666] bg-[#1a1a1a] border-[#2a2a2a]" };
}

function tierBadge(t: string | null): { label: string; color: string } {
  if (t === "SHORTLIST") return { label: "Shortlist", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
  if (t === "WATCHLIST") return { label: "Watchlist", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
  if (t === "SPECULATIVE") return { label: "Speculative", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
  return { label: "-", color: "text-[#333]" };
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 65) return "text-cyan-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

// formatDatePill, streakColor imported from daily-page-utils

function triggerLabel(t: string | null): string {
  if (!t || t === "none") return "-";
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── CSV Export ──

function exportCSV(results: InstitutionalDailyRow[], date: string, streaks: Record<string, number>, deltas: Record<string, number>) {
  const headers = [
    "Ticker", "Company", "Sector", "Price", "Composite", "Delta", "Streak",
    "Inst", "Exec", "Risk", "Discipline",
    "Classification", "Entry Quality", "Trigger", "Tier",
    "RS Accel SPY", "RS Accel QQQ", "Gap%", "EMA20 Dist ATR",
    "Commentary",
  ];
  const rows = results.map((r) => [
    r.ticker,
    `"${(r.company_name ?? "").replace(/"/g, '""')}"`,
    r.sector ?? "",
    r.price,
    r.composite_score,
    deltas[r.ticker] ?? "",
    streaks[r.ticker] ?? 1,
    r.institutional_score, r.execution_score, r.risk_score, r.discipline_score,
    r.classification, r.entry_quality ?? "", r.best_trigger ?? "", r.tier ?? "",
    r.rs_accel_spy ?? "", r.rs_accel_qqq ?? "", r.gap_pct ?? "", r.dist_from_ema20_atr ?? "",
    `"${(r.commentary_summary ?? "").replace(/"/g, '""')}"`,
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `institutional-daily-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Expanded Row ──

function ExpandedInst({ row }: { row: InstitutionalDailyRow }) {
  return (
    <tr>
      <td colSpan={14} className="px-3 py-3 bg-[#111]">
        <div className="flex flex-wrap gap-6">
          {/* Sub-scores */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1.5">Component Scores</p>
            <div className="grid grid-cols-4 gap-2 text-[10px]">
              {[
                { label: "Institutional", score: row.institutional_score },
                { label: "Execution", score: row.execution_score },
                { label: "Risk (inv)", score: row.risk_score },
                { label: "Discipline", score: row.discipline_score },
              ].map((c) => (
                <div key={c.label} className="rounded border border-[#2a2a2a] bg-[#0f0f0f] px-2 py-1.5 text-center">
                  <p className="text-[8px] text-[#555] mb-0.5">{c.label}</p>
                  <p className={`font-bold ${scoreColor(c.score)}`}>{c.score}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Technical details */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1.5">Details</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              {row.rs_accel_spy !== null && <><span className="text-[#555]">RS Accel vs SPY</span><span className={`font-medium ${Number(row.rs_accel_spy) > 0 ? "text-emerald-400" : "text-red-400"}`}>{Number(row.rs_accel_spy) > 0 ? "+" : ""}{fmtNum(row.rs_accel_spy, 2)}</span></>}
              {row.rs_accel_qqq !== null && <><span className="text-[#555]">RS Accel vs QQQ</span><span className={`font-medium ${Number(row.rs_accel_qqq) > 0 ? "text-emerald-400" : "text-red-400"}`}>{Number(row.rs_accel_qqq) > 0 ? "+" : ""}{fmtNum(row.rs_accel_qqq, 2)}</span></>}
              {row.gap_pct !== null && <><span className="text-[#555]">Gap%</span><span className="text-[#a0a0a0] font-medium">{fmtNum(row.gap_pct, 2)}%</span></>}
              {row.dist_from_ema20_atr !== null && <><span className="text-[#555]">EMA20 Dist (ATR)</span><span className="text-[#a0a0a0] font-medium">{fmtNum(row.dist_from_ema20_atr, 2)}</span></>}
              <span className="text-[#555]">Entry Quality</span><span className={`font-medium ${row.entry_quality === "HIGH" ? "text-emerald-400" : row.entry_quality === "MODERATE" ? "text-amber-400" : "text-red-400"}`}>{row.entry_quality ?? "-"}</span>
              <span className="text-[#555]">Trigger</span><span className="text-[#a0a0a0] font-medium">{triggerLabel(row.best_trigger)}</span>
            </div>
          </div>
          {/* Commentary */}
          {row.commentary_summary && (
            <div className="w-full">
              <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1">Commentary</p>
              <p className="text-[10px] text-[#a0a0a0] leading-relaxed">{row.commentary_summary}</p>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Sort Header ──

function SortHeader({
  field, label, currentSort, sortAsc, onSort,
}: {
  field: SortField; label: string; currentSort: SortField; sortAsc: boolean; onSort: (f: SortField) => void;
}) {
  const active = currentSort === field;
  return (
    <th onClick={() => onSort(field)}
      className={`px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors whitespace-nowrap ${active ? "text-white" : "text-[#666] hover:text-[#a0a0a0]"}`}>
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active && <span className="text-[8px]">{sortAsc ? "\u25B2" : "\u25BC"}</span>}
      </span>
    </th>
  );
}

// ── Main ──

export default function InstitutionalDailyPage() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [results, setResults] = useState<InstitutionalDailyRow[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [dropped, setDropped] = useState<DroppedTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [tierFilter, setTierFilter] = useState<TierFilter>("ALL");
  const [tickerSearch, setTickerSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("composite_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [showDropped, setShowDropped] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/institutional/daily?dates=true");
        const json = await res.json();
        const d = json.dates ?? [];
        setDates(d);
        if (d.length > 0) setSelectedDate(d[0]);
      } catch { /* No data */ } finally { setLoading(false); }
    }
    init();
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    async function load() {
      setLoadingResults(true);
      try {
        const res = await fetch(`/api/institutional/daily?date=${selectedDate}`);
        const json = await res.json();
        if (!cancelled) {
          setResults(json.results ?? []);
          setStreaks(json.streaks ?? {});
          setDeltas(json.deltas ?? {});
          setDropped(json.dropped ?? []);
          setExpandedTicker(null);
        }
      } catch {
        if (!cancelled) { setResults([]); setStreaks({}); setDeltas({}); setDropped([]); }
      } finally { if (!cancelled) setLoadingResults(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedDate]);

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => { if (prev === field) { setSortAsc((a) => !a); return field; } setSortAsc(false); return field; });
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(results.map((r) => r.ticker).join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [results]);

  const filtered = useMemo(() => {
    let rows = results;
    if (tierFilter !== "ALL") rows = rows.filter((r) => r.tier === tierFilter);
    if (tickerSearch.trim()) {
      const q = tickerSearch.trim().toUpperCase();
      rows = rows.filter((r) => r.ticker.includes(q) || (r.company_name ?? "").toUpperCase().includes(q) || (r.sector ?? "").toUpperCase().includes(q));
    }

    const TIER_ORDER: Record<string, number> = { SHORTLIST: 0, WATCHLIST: 1, SPECULATIVE: 2 };
    const CLASS_ORDER: Record<string, number> = {
      CONTINUATION_LEADER: 0, RECOVERY_LEADER: 1, FRESH_ROTATION: 2,
      INSTITUTIONAL_ACCUMULATION: 3, TIGHT_BASE: 4, CONSTRUCTIVE_SETUP: 5,
      OVERSOLD_REVERSAL: 6, NEUTRAL_HOLD: 7, TOO_EXTENDED: 8,
    };

    return [...rows].sort((a, b) => {
      let cmp: number;
      if (sortField === "ticker") cmp = a.ticker.localeCompare(b.ticker);
      else if (sortField === "classification") cmp = (CLASS_ORDER[a.classification] ?? 99) - (CLASS_ORDER[b.classification] ?? 99);
      else if (sortField === "tier") cmp = (TIER_ORDER[a.tier ?? ""] ?? 9) - (TIER_ORDER[b.tier ?? ""] ?? 9);
      else if (sortField === "price") cmp = Number(b.price) - Number(a.price);
      else if (sortField === "streak") cmp = (streaks[b.ticker] ?? 1) - (streaks[a.ticker] ?? 1);
      else if (sortField === "delta") cmp = (deltas[b.ticker] ?? 0) - (deltas[a.ticker] ?? 0);
      else cmp = (b[sortField as keyof InstitutionalDailyRow] as number ?? 0) - (a[sortField as keyof InstitutionalDailyRow] as number ?? 0);
      return sortAsc ? -cmp : cmp;
    });
  }, [results, tierFilter, tickerSearch, sortField, sortAsc, streaks, deltas]);

  const newTodayCount = Object.values(streaks).filter((s) => s === 1).length;

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-[#666]" /></div>;

  if (dates.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-white mb-4">Institutional Daily Results</h1>
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center">
          <p className="text-[#a0a0a0] mb-2">No scan data available yet.</p>
          <p className="text-[#666] text-sm">The daily institutional scan runs at 10:30 PM ET Mon-Fri.</p>
        </div>
        <div className="mt-4"><Link href="/prerun" className="text-sm text-[#666] hover:text-white transition-colors">&larr; Back to Pre-Run Scanner</Link></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Institutional Daily Results</h1>
          <p className="text-xs text-[#666] mt-1">S&P 500 + Nasdaq-100 | 14-day rolling history</p>
        </div>
        <Link href="/prerun" className="text-sm text-[#666] hover:text-white transition-colors">&larr; Pre-Run Scanner</Link>
      </div>

      {/* Date tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
        <Calendar className="h-4 w-4 text-[#555] shrink-0" />
        {dates.map((d) => (
          <button key={d} onClick={() => setSelectedDate(d)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${d === selectedDate ? "bg-white text-black" : "bg-[#1a1a1a] text-[#a0a0a0] hover:bg-[#2a2a2a] hover:text-white border border-[#2a2a2a]"}`}>
            {formatDatePill(d)}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 flex-wrap mb-4 text-xs">
        <span className="text-[#a0a0a0]"><strong className="text-white">{results.length}</strong> stocks</span>
        <span className="text-[#333]">|</span>
        <span className="text-emerald-400"><strong>{results.filter((r) => r.tier === "SHORTLIST").length}</strong> Shortlist</span>
        <span className="text-cyan-400"><strong>{results.filter((r) => r.tier === "WATCHLIST").length}</strong> Watchlist</span>
        <span className="text-amber-400"><strong>{results.filter((r) => r.tier === "SPECULATIVE").length}</strong> Speculative</span>
        {newTodayCount > 0 && (<><span className="text-[#333]">|</span><span className="text-green-400"><Sparkles className="h-3 w-3 inline mr-0.5" /><strong>{newTodayCount}</strong> new</span></>)}
        {dropped.length > 0 && (<><span className="text-[#333]">|</span><button onClick={() => setShowDropped(!showDropped)} className="text-red-400 hover:text-red-300 transition-colors"><TrendingDown className="h-3 w-3 inline mr-0.5" /><strong>{dropped.length}</strong> dropped</button></>)}
      </div>

      {/* Dropped */}
      {showDropped && dropped.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/[0.03] p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider text-red-400/60 font-semibold">Dropped ({dropped.length})</p>
            <button onClick={() => setShowDropped(false)} className="text-[10px] text-[#666] hover:text-white">Hide</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {dropped.map((d) => (
              <span key={d.ticker} className="inline-flex items-center gap-1 rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
                {d.ticker} <span className="text-red-500/50">{d.prev_score}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#555]" />
          <input type="text" value={tickerSearch} onChange={(e) => setTickerSearch(e.target.value)} placeholder="Ticker / sector..."
            className="w-40 rounded border border-[#333] bg-[#1a1a1a] pl-7 pr-2 py-1 text-xs text-white placeholder-[#555] focus:border-[#555] focus:outline-none" />
        </div>
        <span className="text-[#333]">|</span>
        {(Object.keys(TIER_LABELS) as TierFilter[]).map((f) => (
          <button key={f} onClick={() => setTierFilter(f)}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${tierFilter === f ? "bg-white/10 text-white border border-white/20" : "text-[#666] hover:text-white"}`}>
            {TIER_LABELS[f]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleCopy} className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#1a1a1a] text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] border border-[#2a2a2a] transition-colors">
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={() => exportCSV(filtered, selectedDate ?? "", streaks, deltas)} className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#1a1a1a] text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] border border-[#2a2a2a] transition-colors">
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
      </div>

      {loadingResults && <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#666]" /></div>}
      {!loadingResults && filtered.length === 0 && <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center"><p className="text-[#a0a0a0]">No results match the current filters.</p></div>}

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
                  <SortHeader field="price" label="Price" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="composite_score" label="Composite" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="delta" label="+/-" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="streak" label="Days" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="institutional_score" label="Inst" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="execution_score" label="Exec" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="risk_score" label="Risk" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="discipline_score" label="Disc" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="classification" label="Classification" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="tier" label="Tier" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#666]">Trigger</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const streak = streaks[row.ticker] ?? 1;
                  const delta = deltas[row.ticker];
                  const isNew = streak === 1;
                  const isExpanded = expandedTicker === row.ticker;
                  const cb = classificationBadge(row.classification);
                  const tb = tierBadge(row.tier);

                  return (
                    <Fragment key={row.ticker}>
                      <tr onClick={() => setExpandedTicker(isExpanded ? null : row.ticker)}
                        className={`border-b border-[#1a1a1a] cursor-pointer transition-colors ${isExpanded ? "bg-[#161616]" : "hover:bg-[#141414]"} ${isNew ? "bg-green-500/[0.03]" : ""}`}>
                        <td className="px-2 py-2 text-[#444]">{isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</td>
                        <td className="px-2 py-2 font-bold text-white whitespace-nowrap">{row.ticker}</td>
                        <td className="px-2 py-2 text-[#a0a0a0] max-w-[140px] truncate">{row.company_name}</td>
                        <td className="px-2 py-2 text-white tabular-nums whitespace-nowrap">${fmtNum(row.price, 2)}</td>
                        <td className="px-2 py-2"><span className={`text-[11px] font-bold tabular-nums ${scoreColor(row.composite_score)}`}>{row.composite_score}</span></td>
                        <td className="px-2 py-2 tabular-nums whitespace-nowrap">
                          {delta !== undefined ? <span className={`text-[10px] font-medium ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-[#555]"}`}>{delta > 0 ? "+" : ""}{delta}</span> : <span className="text-[10px] text-[#333]">-</span>}
                        </td>
                        <td className="px-2 py-2"><span className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[9px] font-bold tabular-nums min-w-[24px] ${streakColor(streak)}`}>{streak}d</span></td>
                        <td className="px-2 py-2 text-[#a0a0a0] tabular-nums text-[10px]">{row.institutional_score}</td>
                        <td className="px-2 py-2 text-[#a0a0a0] tabular-nums text-[10px]">{row.execution_score}</td>
                        <td className="px-2 py-2 text-[#a0a0a0] tabular-nums text-[10px]">{row.risk_score}</td>
                        <td className="px-2 py-2 text-[#a0a0a0] tabular-nums text-[10px]">{row.discipline_score}</td>
                        <td className="px-2 py-2">
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide whitespace-nowrap ${cb.color}`}>{cb.label}</span>
                          {isNew && <span className="ml-1 inline-flex items-center rounded border border-green-500/30 bg-green-500/10 px-1 py-0.5 text-[8px] font-bold text-green-400">NEW</span>}
                        </td>
                        <td className="px-2 py-2"><span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap ${tb.color}`}>{tb.label}</span></td>
                        <td className="px-2 py-2 text-[10px] text-[#777] whitespace-nowrap">{triggerLabel(row.best_trigger)}</td>
                      </tr>
                      {isExpanded && <ExpandedInst row={row} />}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </TableErrorBoundary>
      )}

      <div className="mt-6 text-center text-[10px] text-[#444]">
        Scan runs at 10:30 PM ET Mon-Fri | Universe: S&P 500 + Nasdaq-100 (~509 tickers) | 14-day retention
      </div>
    </div>
  );
}
