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

// ── Types ──

interface VCPDailyRow {
  scan_date: string;
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  total_score: number;
  trend_score: number;
  volume_score: number;
  compression_score: number;
  rel_strength_score: number;
  risk_quality_score: number;
  phase: string;
  pivot_high: number | null;
  atr_pct: number | null;
  dist_from_sma50_pct: number | null;
  dry_volume_days: number | null;
  tight_closes: boolean | null;
  inside_bar_count: number | null;
  entry: number | null;
  stop: number | null;
  target_2r: number | null;
  target_3r: number | null;
  sma10_exit: number | null;
}

interface DroppedTicker {
  ticker: string;
  prev_score: number;
}

type PhaseFilter = "ALL" | "FOCUS_LIST" | "WATCHLIST_CANDIDATE" | "EARLY_SETUP";
type SortField = "total_score" | "trend_score" | "volume_score" | "compression_score" | "rel_strength_score" | "risk_quality_score" | "ticker" | "price" | "phase" | "streak" | "delta" | "atr_pct";

const PHASE_LABELS: Record<PhaseFilter, string> = {
  ALL: "All",
  FOCUS_LIST: "Focus List",
  WATCHLIST_CANDIDATE: "Watchlist",
  EARLY_SETUP: "Early Setup",
};

// ── Helpers ──

function phaseBadge(phase: string): { label: string; color: string } {
  switch (phase) {
    case "FOCUS_LIST": return { label: "Focus List", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "WATCHLIST_CANDIDATE": return { label: "Watchlist", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
    case "EARLY_SETUP": return { label: "Early Setup", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    default: return { label: phase, color: "text-[#666] bg-[#1a1a1a] border-[#2a2a2a]" };
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 65) return "text-cyan-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function formatDatePill(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function streakColor(streak: number): string {
  if (streak >= 5) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (streak >= 3) return "text-cyan-400 bg-cyan-500/10 border-cyan-500/30";
  return "text-[#666] bg-[#1a1a1a] border-[#2a2a2a]";
}

// ── CSV Export ──

function exportCSV(results: VCPDailyRow[], date: string, streaks: Record<string, number>, deltas: Record<string, number>) {
  const headers = [
    "Ticker", "Company", "Sector", "Price", "Total", "Delta", "Streak",
    "Trend", "Volume", "Compression", "RS", "Risk", "Phase",
    "Pivot", "ATR%", "SMA50 Dist%", "Dry Vol Days", "Tight Closes", "Inside Bars",
    "Entry", "Stop", "Target 2R", "Target 3R", "SMA10 Exit",
  ];
  const rows = results.map((r) => [
    r.ticker,
    `"${(r.company_name ?? "").replace(/"/g, '""')}"`,
    r.sector ?? "",
    r.price,
    r.total_score,
    deltas[r.ticker] ?? "",
    streaks[r.ticker] ?? 1,
    r.trend_score, r.volume_score, r.compression_score, r.rel_strength_score, r.risk_quality_score,
    r.phase,
    r.pivot_high ?? "", r.atr_pct ?? "", r.dist_from_sma50_pct ?? "",
    r.dry_volume_days ?? "", r.tight_closes ?? "", r.inside_bar_count ?? "",
    r.entry ?? "", r.stop ?? "", r.target_2r ?? "", r.target_3r ?? "", r.sma10_exit ?? "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vcp-daily-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Expanded Row ──

function ExpandedVCP({ row }: { row: VCPDailyRow }) {
  return (
    <tr>
      <td colSpan={14} className="px-3 py-3 bg-[#111]">
        <div className="flex flex-wrap gap-6">
          {/* Sub-scores */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1.5">Component Scores</p>
            <div className="grid grid-cols-5 gap-2 text-[10px]">
              {[
                { label: "Trend", score: row.trend_score, max: 25 },
                { label: "Volume", score: row.volume_score, max: 20 },
                { label: "Compression", score: row.compression_score, max: 25 },
                { label: "Rel Strength", score: row.rel_strength_score, max: 15 },
                { label: "Risk Quality", score: row.risk_quality_score, max: 15 },
              ].map((c) => (
                <div key={c.label} className="rounded border border-[#2a2a2a] bg-[#0f0f0f] px-2 py-1.5 text-center">
                  <p className="text-[8px] text-[#555] mb-0.5">{c.label}</p>
                  <p className={`font-bold ${c.score / c.max >= 0.7 ? "text-emerald-400" : c.score / c.max >= 0.5 ? "text-cyan-400" : "text-[#777]"}`}>
                    {c.score}/{c.max}
                  </p>
                </div>
              ))}
            </div>
          </div>
          {/* Trade setup */}
          {row.entry !== null && (
            <div>
              <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1.5">Trade Setup</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                <span className="text-[#555]">Entry</span><span className="text-white font-medium">${Number(row.entry).toFixed(2)}</span>
                <span className="text-[#555]">Stop</span><span className="text-red-400 font-medium">${Number(row.stop).toFixed(2)}</span>
                <span className="text-[#555]">Target 2R</span><span className="text-emerald-400 font-medium">${Number(row.target_2r).toFixed(2)}</span>
                <span className="text-[#555]">Target 3R</span><span className="text-emerald-400 font-medium">${Number(row.target_3r).toFixed(2)}</span>
                {row.sma10_exit !== null && (
                  <><span className="text-[#555]">SMA10 Exit</span><span className="text-amber-400 font-medium">${Number(row.sma10_exit).toFixed(2)}</span></>
                )}
              </div>
            </div>
          )}
          {/* Technical details */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1.5">Details</p>
            <div className="flex flex-wrap gap-3 text-[10px]">
              {row.pivot_high !== null && <span className="text-[#a0a0a0]">Pivot: ${Number(row.pivot_high).toFixed(2)}</span>}
              {row.atr_pct !== null && <span className="text-[#a0a0a0]">ATR%: {Number(row.atr_pct).toFixed(2)}%</span>}
              {row.dist_from_sma50_pct !== null && <span className="text-[#a0a0a0]">SMA50 Dist: {Number(row.dist_from_sma50_pct).toFixed(1)}%</span>}
              {row.dry_volume_days !== null && <span className="text-[#a0a0a0]">Dry Vol: {row.dry_volume_days}d</span>}
              {row.tight_closes && <span className="text-cyan-400">Tight Closes</span>}
              {row.inside_bar_count !== null && row.inside_bar_count > 0 && <span className="text-cyan-400">{row.inside_bar_count} Inside Bars</span>}
            </div>
          </div>
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

export default function VCPDailyPage() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [results, setResults] = useState<VCPDailyRow[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [dropped, setDropped] = useState<DroppedTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("ALL");
  const [tickerSearch, setTickerSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("total_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [showDropped, setShowDropped] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/vcp/daily?dates=true");
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
        const res = await fetch(`/api/vcp/daily?date=${selectedDate}`);
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
    if (phaseFilter !== "ALL") rows = rows.filter((r) => r.phase === phaseFilter);
    if (tickerSearch.trim()) {
      const q = tickerSearch.trim().toUpperCase();
      rows = rows.filter((r) => r.ticker.includes(q) || (r.company_name ?? "").toUpperCase().includes(q) || (r.sector ?? "").toUpperCase().includes(q));
    }

    const PHASE_ORDER: Record<string, number> = { FOCUS_LIST: 0, WATCHLIST_CANDIDATE: 1, EARLY_SETUP: 2 };
    return [...rows].sort((a, b) => {
      let cmp: number;
      if (sortField === "ticker") cmp = a.ticker.localeCompare(b.ticker);
      else if (sortField === "phase") cmp = (PHASE_ORDER[a.phase] ?? 9) - (PHASE_ORDER[b.phase] ?? 9);
      else if (sortField === "price") cmp = Number(b.price) - Number(a.price);
      else if (sortField === "streak") cmp = (streaks[b.ticker] ?? 1) - (streaks[a.ticker] ?? 1);
      else if (sortField === "delta") cmp = (deltas[b.ticker] ?? 0) - (deltas[a.ticker] ?? 0);
      else if (sortField === "atr_pct") cmp = (b.atr_pct ?? 0) - (a.atr_pct ?? 0);
      else cmp = (b[sortField as keyof VCPDailyRow] as number ?? 0) - (a[sortField as keyof VCPDailyRow] as number ?? 0);
      return sortAsc ? -cmp : cmp;
    });
  }, [results, phaseFilter, tickerSearch, sortField, sortAsc, streaks, deltas]);

  const newTodayCount = Object.values(streaks).filter((s) => s === 1).length;

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-[#666]" /></div>;

  if (dates.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-white mb-4">VCP Daily Results</h1>
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center">
          <p className="text-[#a0a0a0] mb-2">No scan data available yet.</p>
          <p className="text-[#666] text-sm">The daily VCP scan runs at 10:15 PM ET Mon-Fri.</p>
        </div>
        <div className="mt-4"><Link href="/prerun" className="text-sm text-[#666] hover:text-white transition-colors">&larr; Back to Pre-Run Scanner</Link></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">VCP Daily Results</h1>
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
        <span className="text-emerald-400"><strong>{results.filter((r) => r.phase === "FOCUS_LIST").length}</strong> Focus</span>
        <span className="text-cyan-400"><strong>{results.filter((r) => r.phase === "WATCHLIST_CANDIDATE").length}</strong> Watchlist</span>
        <span className="text-amber-400"><strong>{results.filter((r) => r.phase === "EARLY_SETUP").length}</strong> Early</span>
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
        {(Object.keys(PHASE_LABELS) as PhaseFilter[]).map((f) => (
          <button key={f} onClick={() => setPhaseFilter(f)}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${phaseFilter === f ? "bg-white/10 text-white border border-white/20" : "text-[#666] hover:text-white"}`}>
            {PHASE_LABELS[f]}
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
        <div className="rounded-lg border border-[#2a2a2a] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#111] border-b border-[#2a2a2a] sticky top-0 z-10">
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#666] w-8"></th>
                  <SortHeader field="ticker" label="Ticker" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#666]">Company</th>
                  <SortHeader field="price" label="Price" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="total_score" label="Total" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="delta" label="+/-" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="streak" label="Days" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="trend_score" label="Trend" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="volume_score" label="Vol" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="compression_score" label="Comp" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="rel_strength_score" label="RS" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="risk_quality_score" label="Risk" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="atr_pct" label="ATR%" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="phase" label="Phase" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const streak = streaks[row.ticker] ?? 1;
                  const delta = deltas[row.ticker];
                  const isNew = streak === 1;
                  const isExpanded = expandedTicker === row.ticker;
                  const pb = phaseBadge(row.phase);

                  return (
                    <Fragment key={row.ticker}>
                      <tr onClick={() => setExpandedTicker(isExpanded ? null : row.ticker)}
                        className={`border-b border-[#1a1a1a] cursor-pointer transition-colors ${isExpanded ? "bg-[#161616]" : "hover:bg-[#141414]"} ${isNew ? "bg-green-500/[0.03]" : ""}`}>
                        <td className="px-2 py-2 text-[#444]">{isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</td>
                        <td className="px-2 py-2 font-bold text-white whitespace-nowrap">{row.ticker}</td>
                        <td className="px-2 py-2 text-[#a0a0a0] max-w-[140px] truncate">{row.company_name}</td>
                        <td className="px-2 py-2 text-white tabular-nums whitespace-nowrap">${Number(row.price).toFixed(2)}</td>
                        <td className="px-2 py-2"><span className={`text-[11px] font-bold tabular-nums ${scoreColor(row.total_score)}`}>{row.total_score}</span></td>
                        <td className="px-2 py-2 tabular-nums whitespace-nowrap">
                          {delta !== undefined ? <span className={`text-[10px] font-medium ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-[#555]"}`}>{delta > 0 ? "+" : ""}{delta}</span> : <span className="text-[10px] text-[#333]">-</span>}
                        </td>
                        <td className="px-2 py-2"><span className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[9px] font-bold tabular-nums min-w-[24px] ${streakColor(streak)}`}>{streak}d</span></td>
                        <td className="px-2 py-2 text-[#a0a0a0] tabular-nums text-[10px]">{row.trend_score}</td>
                        <td className="px-2 py-2 text-[#a0a0a0] tabular-nums text-[10px]">{row.volume_score}</td>
                        <td className="px-2 py-2 text-[#a0a0a0] tabular-nums text-[10px]">{row.compression_score}</td>
                        <td className="px-2 py-2 text-[#a0a0a0] tabular-nums text-[10px]">{row.rel_strength_score}</td>
                        <td className="px-2 py-2 text-[#a0a0a0] tabular-nums text-[10px]">{row.risk_quality_score}</td>
                        <td className="px-2 py-2 text-[#a0a0a0] tabular-nums text-[10px]">{row.atr_pct !== null ? `${Number(row.atr_pct).toFixed(1)}%` : "-"}</td>
                        <td className="px-2 py-2">
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide whitespace-nowrap ${pb.color}`}>{pb.label}</span>
                          {isNew && <span className="ml-1 inline-flex items-center rounded border border-green-500/30 bg-green-500/10 px-1 py-0.5 text-[8px] font-bold text-green-400">NEW</span>}
                        </td>
                      </tr>
                      {isExpanded && <ExpandedVCP row={row} />}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 text-center text-[10px] text-[#444]">
        Scan runs at 10:15 PM ET Mon-Fri | Universe: S&P 500 + Nasdaq-100 (~509 tickers) | 14-day retention
      </div>
    </div>
  );
}
