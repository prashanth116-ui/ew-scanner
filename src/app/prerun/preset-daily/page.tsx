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
  Layers,
} from "lucide-react";
import Link from "next/link";
import { fmtNum } from "@/lib/daily-format";
import { formatDatePill, streakColor, scoreBarColor, formatMktCap } from "@/lib/daily-page-utils";
import { TableErrorBoundary } from "@/components/table-error-boundary";

// ── Types ──

interface PreRunDailyRow {
  scan_date: string;
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  market_cap: number | null;
  pct_from_ath: number | null;
  short_float: number | null;
  final_score: number;
  total_score: number;
  score_a: number;
  score_b: number;
  score_c: number;
  score_d: number;
  score_e: number;
  score_f: number;
  score_g: number;
  score_h: number;
  score_i: number;
  score_j: number;
  score_k: number;
  score_l: number;
  score_m: number;
  score_m2: number;
  score_n: number;
  score_o: number;
  score_p: number;
  score_q: number;
  sector_modifier: number;
  sector_quadrant_modifier: number;
  gate1: boolean;
  gate2: boolean;
  gate3: boolean;
  verdict: string;
  obv_divergent: boolean;
  vp_divergence_bullish: boolean;
  higher_lows_count: number | null;
  rrg_quadrant: string | null;
  is_sndk: boolean;
  is_early_mover: boolean;
  is_pullback: boolean;
  is_leading: boolean;
  is_stealth: boolean;
  is_early_plus: boolean;
}

interface DroppedTicker {
  ticker: string;
  prev_score: number;
}

type Preset = "sndk" | "early_mover" | "pullback" | "leading" | "stealth" | "early_plus";
type SortField = "final_score" | "ticker" | "price" | "sector" | "streak" | "delta" | "pct_from_ath" | "short_float" | "verdict";

const PRESET_LABELS: Record<Preset, string> = {
  sndk: "SNDK",
  early_mover: "Early Mover",
  pullback: "Pullback",
  leading: "Leading",
  stealth: "Stealth",
  early_plus: "Early+",
};

const PRESET_DESCRIPTIONS: Record<Preset, string> = {
  sndk: "40%+ from ATH, 15%+ SI, score 18+",
  early_mover: "25%+ from ATH, EMA timing + higher lows + volume",
  pullback: "Up to 40% pullback, 2/3 confirmation (EMA timing + higher lows + volume)",
  leading: "Leading/Improving sectors, score 15+, EMA + relative strength",
  stealth: "OBV/VP divergence + EMA timing",
  early_plus: "Pre-breakout: volume divergence + range coil",
};

// ── Helpers ──

function verdictBadge(v: string): { label: string; color: string } {
  switch (v) {
    case "PRIORITY": return { label: "Priority", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "KEEP": return { label: "Keep", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
    case "WATCH": return { label: "Watch", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    default: return { label: v, color: "text-[#666] bg-[#1a1a1a] border-[#2a2a2a]" };
  }
}

function scoreColor(score: number): string {
  if (score >= 25) return "text-emerald-400";
  if (score >= 18) return "text-cyan-400";
  if (score >= 14) return "text-amber-400";
  return "text-red-400";
}

// scoreBarColor, formatDatePill, streakColor, formatMktCap imported from daily-page-utils

// ── CSV Export ──

function exportCSV(results: PreRunDailyRow[], date: string, preset: string, streaks: Record<string, number>, deltas: Record<string, number>) {
  const headers = [
    "Ticker", "Company", "Sector", "Price", "Score", "Delta", "Streak",
    "% from ATH", "Short Float", "Verdict",
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "M2", "N", "O", "P", "Q",
    "Sector Mod", "Quadrant Mod", "OBV Div", "VP Div", "Higher Lows", "RRG Quadrant",
  ];
  const rows = results.map((r) => [
    r.ticker,
    `"${(r.company_name ?? "").replace(/"/g, '""')}"`,
    r.sector ?? "",
    r.price,
    r.final_score,
    deltas[r.ticker] ?? "",
    streaks[r.ticker] ?? 1,
    r.pct_from_ath ?? "",
    r.short_float ?? "",
    r.verdict,
    r.score_a, r.score_b, r.score_c, r.score_d, r.score_e, r.score_f, r.score_g, r.score_h,
    r.score_i, r.score_j, r.score_k, r.score_l, r.score_m, r.score_m2, r.score_n, r.score_o, r.score_p, r.score_q,
    r.sector_modifier, r.sector_quadrant_modifier,
    r.obv_divergent, r.vp_divergence_bullish, r.higher_lows_count ?? "", r.rrg_quadrant ?? "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prerun-${preset}-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Expanded Row ──

function ExpandedScores({ row }: { row: PreRunDailyRow }) {
  const criteria = [
    { key: "A", label: "Dead Money Base", score: row.score_a, max: 2 },
    { key: "B", label: "Short Interest", score: row.score_b, max: 3 },
    { key: "C", label: "Narrative Catalyst", score: row.score_c, max: 3 },
    { key: "D", label: "Earnings Inflection", score: row.score_d, max: 3 },
    { key: "E", label: "Inst. Under-ownership", score: row.score_e, max: 2 },
    { key: "F", label: "Volume Accum.", score: row.score_f, max: 3 },
    { key: "G", label: "Index Inclusion", score: row.score_g, max: 2 },
    { key: "H", label: "Insider Buying", score: row.score_h, max: 2 },
    { key: "I", label: "Options Flow", score: row.score_i, max: 2 },
    { key: "J", label: "Relative Strength", score: row.score_j, max: 2 },
    { key: "K", label: "Breakout Proximity", score: row.score_k, max: 2 },
    { key: "L", label: "Higher Lows", score: row.score_l, max: 2 },
    { key: "M", label: "EMA Reclaim", score: row.score_m, max: 2 },
    { key: "M2", label: "EMA Timing", score: row.score_m2, max: 2 },
    { key: "N", label: "Range Coil", score: row.score_n, max: 2 },
    { key: "O", label: "Failed Breakdown", score: row.score_o, max: 2 },
    { key: "P", label: "Analyst Revisions", score: row.score_p, max: 2 },
    { key: "Q", label: "Squeeze Probability", score: row.score_q, max: 2 },
  ];

  return (
    <tr>
      <td colSpan={11} className="px-3 py-3 bg-[#111]">
        <div className="space-y-3">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1.5">Criteria Scores</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {criteria.map((c) => (
                <div key={c.key} className="flex items-center gap-1.5 rounded border border-[#2a2a2a] bg-[#0f0f0f] px-2 py-1">
                  <span className="text-[9px] text-[#555] w-5 shrink-0">{c.key}</span>
                  <div className="w-8 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${scoreBarColor(c.score, c.max)}`} style={{ width: `${(c.score / c.max) * 100}%` }} />
                  </div>
                  <span className={`text-[9px] font-bold tabular-nums ${c.score > 0 ? "text-white" : "text-[#333]"}`}>
                    {c.score}/{c.max}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-[10px]">
            <div>
              <span className="text-[#555]">Gates:</span>{" "}
              <span className={row.gate1 ? "text-emerald-400" : "text-red-400"}>G1</span>{" "}
              <span className={row.gate2 ? "text-emerald-400" : "text-red-400"}>G2</span>{" "}
              <span className={row.gate3 ? "text-emerald-400" : "text-red-400"}>G3</span>
            </div>
            <div>
              <span className="text-[#555]">Modifiers:</span>{" "}
              <span className="text-[#a0a0a0]">Sector {row.sector_modifier > 0 ? "+" : ""}{row.sector_modifier}</span>{" "}
              <span className="text-[#a0a0a0]">Quadrant {row.sector_quadrant_modifier > 0 ? "+" : ""}{row.sector_quadrant_modifier}</span>
            </div>
            {row.obv_divergent && <span className="text-purple-400">OBV Divergent</span>}
            {row.vp_divergence_bullish && <span className="text-purple-400">VP Divergence</span>}
            {row.higher_lows_count !== null && row.higher_lows_count > 0 && (
              <span className="text-cyan-400">{row.higher_lows_count} Higher Lows</span>
            )}
            {row.rrg_quadrant && <span className="text-[#a0a0a0]">RRG: {row.rrg_quadrant}</span>}
            {row.market_cap && <span className="text-[#a0a0a0]">Mkt Cap: {formatMktCap(row.market_cap)}</span>}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Sort Header ──

function SortHeader({
  field, label, currentSort, sortAsc, onSort, className,
}: {
  field: SortField; label: string; currentSort: SortField; sortAsc: boolean; onSort: (f: SortField) => void; className?: string;
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
        {active && <span className="text-[8px]">{sortAsc ? "\u25B2" : "\u25BC"}</span>}
      </span>
    </th>
  );
}

// ── Main Page ──

export default function PreRunPresetDailyPage() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>("sndk");
  const [results, setResults] = useState<PreRunDailyRow[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [dropped, setDropped] = useState<DroppedTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [tickerSearch, setTickerSearch] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [sortField, setSortField] = useState<SortField>("final_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [showDropped, setShowDropped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [allResults, setAllResults] = useState<PreRunDailyRow[]>([]);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/prerun/daily?dates=true");
        const json = await res.json();
        const d = json.dates ?? [];
        setDates(d);
        if (d.length > 0) setSelectedDate(d[0]);
      } catch {
        // No data yet
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Fetch all results (unfiltered) for overlap computation
  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    async function loadAll() {
      try {
        const res = await fetch(`/api/prerun/daily?date=${selectedDate}`);
        const json = await res.json();
        if (!cancelled) setAllResults(json.results ?? []);
      } catch {
        if (!cancelled) setAllResults([]);
      }
    }
    loadAll();
    return () => { cancelled = true; };
  }, [selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;

    async function load() {
      setLoadingResults(true);
      try {
        const res = await fetch(`/api/prerun/daily?date=${selectedDate}&preset=${preset}`);
        const json = await res.json();
        if (!cancelled) {
          setResults(json.results ?? []);
          setStreaks(json.streaks ?? {});
          setDeltas(json.deltas ?? {});
          setDropped(json.dropped ?? []);
          setExpandedTicker(null);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setStreaks({});
          setDeltas({});
          setDropped([]);
        }
      } finally {
        if (!cancelled) setLoadingResults(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedDate, preset]);

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

  const handleCopyWatchlist = useCallback(() => {
    const tickers = results.map((r) => r.ticker).join(", ");
    navigator.clipboard.writeText(tickers);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [results]);

  const filtered = useMemo(() => {
    let rows = results;
    if (minScore > 0) rows = rows.filter((r) => r.final_score >= minScore);
    if (tickerSearch.trim()) {
      const q = tickerSearch.trim().toUpperCase();
      rows = rows.filter(
        (r) => r.ticker.includes(q) || (r.company_name ?? "").toUpperCase().includes(q) || (r.sector ?? "").toUpperCase().includes(q)
      );
    }

    return [...rows].sort((a, b) => {
      let cmp: number;
      if (sortField === "ticker") cmp = a.ticker.localeCompare(b.ticker);
      else if (sortField === "sector") cmp = (a.sector ?? "").localeCompare(b.sector ?? "");
      else if (sortField === "price") cmp = Number(b.price) - Number(a.price);
      else if (sortField === "streak") cmp = (streaks[b.ticker] ?? 1) - (streaks[a.ticker] ?? 1);
      else if (sortField === "delta") cmp = (deltas[b.ticker] ?? 0) - (deltas[a.ticker] ?? 0);
      else if (sortField === "pct_from_ath") cmp = (b.pct_from_ath ?? 0) - (a.pct_from_ath ?? 0);
      else if (sortField === "short_float") cmp = (b.short_float ?? 0) - (a.short_float ?? 0);
      else if (sortField === "verdict") cmp = a.verdict.localeCompare(b.verdict);
      else cmp = b.final_score - a.final_score;
      return sortAsc ? -cmp : cmp;
    });
  }, [results, minScore, tickerSearch, sortField, sortAsc, streaks, deltas]);

  const newTodayCount = Object.values(streaks).filter((s) => s === 1).length;

  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of results) {
      const s = r.sector || "Other";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [results]);

  const overlapTickers = useMemo(() => {
    const PRESET_KEYS: { key: keyof PreRunDailyRow; label: string }[] = [
      { key: "is_sndk", label: "SNDK" },
      { key: "is_early_mover", label: "Early Mover" },
      { key: "is_pullback", label: "Pullback" },
      { key: "is_leading", label: "Leading" },
      { key: "is_stealth", label: "Stealth" },
      { key: "is_early_plus", label: "Early+" },
    ];
    return allResults
      .map((r) => {
        const matched = PRESET_KEYS.filter((p) => r[p.key] === true);
        return { ticker: r.ticker, score: r.final_score, presets: matched.map((p) => p.label), count: matched.length };
      })
      .filter((r) => r.count >= 3)
      .sort((a, b) => b.count - a.count || b.score - a.score);
  }, [allResults]);

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
        <h1 className="text-2xl font-bold text-white mb-4">PreRun Daily Watchlist</h1>
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center">
          <p className="text-[#a0a0a0] mb-2">No scan data available yet.</p>
          <p className="text-[#666] text-sm">
            The daily preset scan runs at 10:00 PM ET Mon-Fri. Results will appear here after the first run.
          </p>
        </div>
        <div className="mt-4">
          <Link href="/prerun" className="text-sm text-[#666] hover:text-white transition-colors">&larr; Back to Pre-Run Scanner</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">PreRun Daily Watchlist</h1>
          <p className="text-xs text-[#666] mt-1">S&P 500 + Nasdaq-100 + S&P 400 | 14-day rolling history</p>
        </div>
        <Link href="/prerun" className="text-sm text-[#666] hover:text-white transition-colors">&larr; Pre-Run Scanner</Link>
      </div>

      {/* Preset tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              p === preset
                ? "bg-white text-black"
                : "bg-[#1a1a1a] text-[#a0a0a0] hover:bg-[#2a2a2a] hover:text-white border border-[#2a2a2a]"
            }`}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      <p className="text-[10px] text-[#555] mb-4">{PRESET_DESCRIPTIONS[preset]}</p>

      {/* Multi-Preset Overlap */}
      {overlapTickers.length > 0 && (
        <div className="mb-4 rounded-lg border border-purple-500/20 bg-purple-500/[0.03] p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Layers className="h-3.5 w-3.5 text-purple-400" />
            <p className="text-[10px] uppercase tracking-wider text-purple-400/80 font-semibold">
              Multi-Preset Overlap ({overlapTickers.length})
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {overlapTickers.map((t) => (
              <div key={t.ticker} className="inline-flex items-center gap-1.5 rounded border border-purple-500/20 bg-purple-500/10 px-2.5 py-1">
                <span className="text-xs font-bold text-white">{t.ticker}</span>
                <span className={`text-[10px] font-bold tabular-nums ${scoreColor(t.score)}`}>{t.score}</span>
                <span className="text-[9px] text-purple-300/60">{t.presets.join(" · ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Summary */}
      <div className="flex items-center gap-3 flex-wrap mb-4 text-xs">
        <span className="text-[#a0a0a0]"><strong className="text-white">{results.length}</strong> stocks</span>
        {newTodayCount > 0 && (
          <>
            <span className="text-[#333]">|</span>
            <span className="text-green-400"><Sparkles className="h-3 w-3 inline mr-0.5" /><strong>{newTodayCount}</strong> new</span>
          </>
        )}
        {dropped.length > 0 && (
          <>
            <span className="text-[#333]">|</span>
            <button onClick={() => setShowDropped(!showDropped)} className="text-red-400 hover:text-red-300 transition-colors">
              <TrendingDown className="h-3 w-3 inline mr-0.5" /><strong>{dropped.length}</strong> dropped
            </button>
          </>
        )}
        {filtered.length !== results.length && (
          <>
            <span className="text-[#333]">|</span>
            <span className="text-[#a0a0a0]">Showing <strong className="text-white">{filtered.length}</strong></span>
          </>
        )}
      </div>

      {/* Dropped */}
      {showDropped && dropped.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/[0.03] p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider text-red-400/60 font-semibold">Dropped from previous day ({dropped.length})</p>
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

      {/* Sector pills */}
      {sectorCounts.length > 0 && !loadingResults && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          <span className="text-[10px] text-[#555] mr-1">Sectors:</span>
          {sectorCounts.slice(0, 8).map(([sector, count]) => (
            <button key={sector} onClick={() => setTickerSearch(sector)} className="rounded border border-[#2a2a2a] bg-[#141414] px-2 py-0.5 text-[10px] text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors">
              {sector} <strong className="text-white">{count}</strong>
            </button>
          ))}
          {sectorCounts.length > 8 && <span className="text-[10px] text-[#555]">+{sectorCounts.length - 8} more</span>}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#555]" />
          <input type="text" value={tickerSearch} onChange={(e) => setTickerSearch(e.target.value)} placeholder="Ticker / sector..."
            className="w-40 rounded border border-[#333] bg-[#1a1a1a] pl-7 pr-2 py-1 text-xs text-white placeholder-[#555] focus:border-[#555] focus:outline-none" />
        </div>
        <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}
          className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#a0a0a0] focus:outline-none">
          <option value={0}>All Scores</option>
          <option value={14}>14+</option>
          <option value={18}>18+</option>
          <option value={22}>22+</option>
          <option value={26}>26+</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleCopyWatchlist}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#1a1a1a] text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] border border-[#2a2a2a] transition-colors">
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={() => exportCSV(filtered, selectedDate ?? "", preset, streaks, deltas)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#1a1a1a] text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] border border-[#2a2a2a] transition-colors">
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
      </div>

      {loadingResults && <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#666]" /></div>}

      {!loadingResults && filtered.length === 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center"><p className="text-[#a0a0a0]">No results match the current filters.</p></div>
      )}

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
                  <SortHeader field="final_score" label="Score" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="delta" label="+/-" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="streak" label="Days" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="pct_from_ath" label="% ATH" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="short_float" label="SI%" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="verdict" label="Verdict" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const streak = streaks[row.ticker] ?? 1;
                  const delta = deltas[row.ticker];
                  const isNew = streak === 1;
                  const isExpanded = expandedTicker === row.ticker;
                  const vBadge = verdictBadge(row.verdict);

                  return (
                    <Fragment key={row.ticker}>
                      <tr onClick={() => setExpandedTicker(isExpanded ? null : row.ticker)}
                        className={`border-b border-[#1a1a1a] cursor-pointer transition-colors ${isExpanded ? "bg-[#161616]" : "hover:bg-[#141414]"} ${isNew ? "bg-green-500/[0.03]" : ""}`}>
                        <td className="px-2 py-2 text-[#444]">{isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</td>
                        <td className="px-2 py-2 font-bold text-white whitespace-nowrap">{row.ticker}</td>
                        <td className="px-2 py-2 text-[#a0a0a0] max-w-[140px] truncate">{row.company_name}</td>
                        <td className="px-2 py-2 text-[#777] max-w-[100px] truncate text-[10px]">{row.sector || "-"}</td>
                        <td className="px-2 py-2 text-white tabular-nums whitespace-nowrap">${fmtNum(row.price, 2)}</td>
                        <td className="px-2 py-2"><span className={`text-[11px] font-bold tabular-nums ${scoreColor(row.final_score ?? 0)}`}>{row.final_score ?? 0}</span></td>
                        <td className="px-2 py-2 tabular-nums whitespace-nowrap">
                          {delta !== undefined ? (
                            <span className={`text-[10px] font-medium ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-[#555]"}`}>{delta > 0 ? "+" : ""}{delta}</span>
                          ) : <span className="text-[10px] text-[#333]">-</span>}
                        </td>
                        <td className="px-2 py-2">
                          <span className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[9px] font-bold tabular-nums min-w-[24px] ${streakColor(streak)}`}>{streak}d</span>
                        </td>
                        <td className="px-2 py-2 text-[#a0a0a0] tabular-nums text-[10px]">{row.pct_from_ath != null ? `${fmtNum(row.pct_from_ath, 0)}%` : "-"}</td>
                        <td className="px-2 py-2 text-[#a0a0a0] tabular-nums text-[10px]">{row.short_float != null ? `${fmtNum(row.short_float, 1)}%` : "-"}</td>
                        <td className="px-2 py-2">
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide whitespace-nowrap ${vBadge.color}`}>{vBadge.label}</span>
                          {isNew && <span className="ml-1 inline-flex items-center rounded border border-green-500/30 bg-green-500/10 px-1 py-0.5 text-[8px] font-bold text-green-400">NEW</span>}
                        </td>
                      </tr>
                      {isExpanded && <ExpandedScores row={row} />}
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
        Scan runs at 10:00 PM ET Mon-Fri | Universe: S&P 500 + Nasdaq-100 + S&P 400 (~740 tickers) | 14-day retention
      </div>
    </div>
  );
}
