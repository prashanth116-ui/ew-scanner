"use client";

import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import {
  Loader2,
  Calendar,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";
import { TableErrorBoundary } from "@/components/table-error-boundary";
import { fmtNum } from "@/lib/daily-format";

// ── Types ──

interface QFEDailyRow {
  scan_date: string;
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  market_cap: number | null;
  qfe_score: number;
  quality_score: number;
  leadership_score: number;
  entry_score: number;
  market_env_score: number;
  rating: string;
  action: string;
  risk_level: string;
  extension_level: string;
  rs_5d_spy: number | null;
  rs_10d_spy: number | null;
  rs_20d_spy: number | null;
  rs_50d_spy: number | null;
  rs_5d_qqq: number | null;
  rs_10d_qqq: number | null;
  rs_20d_qqq: number | null;
  rs_50d_qqq: number | null;
  rs_5d_sector: number | null;
  rs_10d_sector: number | null;
  rs_20d_sector: number | null;
  rs_50d_sector: number | null;
  money_flow_persistence: number | null;
  rvol_trajectory: number | null;
  float_rotation: number | null;
  weekly_reversal: boolean;
  dist_from_ema10_atr: number | null;
  dist_from_ema20_atr: number | null;
  commentary: string | null;
  source_presets: string[] | null;
  data_quality: number | null;
}

interface DroppedTicker {
  ticker: string;
  prev_score: number;
  prev_rating: string;
}

interface MarketEnvDetail {
  spyTrendScore: number;
  qqqTrendScore: number;
  sectorBreadthScore: number;
  distributionDayScore: number;
  spyDistFromHighScore: number;
  regime: string;
  spyAboveSma50: boolean;
  spyAboveSma200: boolean;
  spyDistributionDays: number;
  leadingSectors: number;
  improvingSectors: number;
}

type RatingFilter = "ALL" | "A+" | "A" | "B+" | "B" | "C" | "D";
type ActionFilter = "ALL" | "Buy Now" | "Buy Pullback" | "Watchlist" | "Wait" | "Avoid";
type RiskFilter = "ALL" | "Low" | "Moderate" | "High";
type SortField = "qfe_score" | "quality_score" | "leadership_score" | "entry_score" | "ticker" | "price" | "rating" | "action" | "streak" | "delta";

// ── Helpers ──

function ratingBadge(r: string): { label: string; color: string } {
  if (r === "A+") return { label: "A+", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
  if (r === "A") return { label: "A", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
  if (r === "B+") return { label: "B+", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
  if (r === "B") return { label: "B", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
  if (r === "C") return { label: "C", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
  return { label: "D", color: "text-red-400 bg-red-500/10 border-red-500/30" };
}

function actionBadge(a: string): { label: string; color: string } {
  if (a === "Buy Now") return { label: "Buy Now", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
  if (a === "Buy Pullback") return { label: "Buy PB", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
  if (a === "Watchlist") return { label: "Watch", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
  if (a === "Wait") return { label: "Wait", color: "text-[#666] bg-[#1a1a1a] border-[#2a2a2a]" };
  return { label: "Avoid", color: "text-red-400 bg-red-500/10 border-red-500/30" };
}

function riskBadge(r: string): { label: string; color: string } {
  if (r === "Low") return { label: "Low", color: "text-emerald-400" };
  if (r === "High") return { label: "High", color: "text-red-400" };
  return { label: "Mod", color: "text-amber-400" };
}

function extensionBadge(e: string): { label: string; color: string } {
  if (e === "Low") return { label: "Low", color: "text-emerald-400" };
  if (e === "Extended") return { label: "Ext", color: "text-red-400" };
  return { label: "Mod", color: "text-amber-400" };
}

function scoreColor(score: number): string {
  if (score >= 66) return "text-emerald-400";
  if (score >= 53) return "text-cyan-400";
  if (score >= 45) return "text-amber-400";
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

function rsColor(val: number | null): string {
  if (val === null) return "text-[#333]";
  if (val > 3) return "text-emerald-400";
  if (val > 0) return "text-cyan-400";
  if (val > -3) return "text-amber-400";
  return "text-red-400";
}

// ── CSV Export ──

function exportCSV(results: QFEDailyRow[], date: string, streaks: Record<string, number>, deltas: Record<string, number>) {
  const headers = [
    "Ticker", "Company", "Sector", "Price", "QFE Score", "Rating", "Action",
    "Quality", "Leadership", "Entry", "Market Env",
    "Risk", "Extension", "Delta", "Streak",
    "RS 5D SPY", "RS 10D SPY", "RS 20D SPY", "RS 50D SPY",
    "Money Flow", "RVOL Traj", "Weekly Rev",
    "Source Presets", "Commentary",
  ];
  const rows = results.map((r) => [
    r.ticker,
    `"${(r.company_name ?? "").replace(/"/g, '""')}"`,
    r.sector ?? "",
    r.price,
    r.qfe_score, r.rating, r.action,
    r.quality_score, r.leadership_score, r.entry_score, r.market_env_score,
    r.risk_level, r.extension_level,
    deltas[r.ticker] ?? "", streaks[r.ticker] ?? 1,
    fmtNum(r.rs_5d_spy, 2), fmtNum(r.rs_10d_spy, 2), fmtNum(r.rs_20d_spy, 2), fmtNum(r.rs_50d_spy, 2),
    r.money_flow_persistence ?? "", fmtNum(r.rvol_trajectory, 3), r.weekly_reversal ? "Yes" : "",
    `"${(r.source_presets ?? []).join(", ")}"`,
    `"${(r.commentary ?? "").replace(/"/g, '""')}"`,
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `qfe-daily-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Score Bar ──

function ScoreBar({ label, score, max = 100 }: { label: string; score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-16 text-[#555] shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${score >= 66 ? "bg-emerald-500" : score >= 53 ? "bg-cyan-500" : score >= 45 ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`w-6 text-right font-bold ${scoreColor(score)}`}>{score}</span>
    </div>
  );
}

// ── Expanded Row ──

function ExpandedQFE({ row }: { row: QFEDailyRow }) {
  return (
    <tr>
      <td colSpan={16} className="px-3 py-3 bg-[#111]">
        <div className="flex flex-wrap gap-6">
          {/* Engine Scores */}
          <div className="w-52">
            <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1.5">Engine Scores</p>
            <div className="space-y-1">
              <ScoreBar label="Quality" score={row.quality_score} />
              <ScoreBar label="Leadership" score={row.leadership_score} />
              <ScoreBar label="Entry" score={row.entry_score} />
              <ScoreBar label="Market Env" score={row.market_env_score} />
            </div>
          </div>

          {/* Multi-TF RS */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1.5">Multi-TF Relative Strength</p>
            <table className="text-[10px]">
              <thead>
                <tr className="text-[#555]">
                  <th className="pr-3 text-left font-medium">Window</th>
                  <th className="px-2 text-right font-medium">vs SPY</th>
                  <th className="px-2 text-right font-medium">vs QQQ</th>
                  <th className="px-2 text-right font-medium">vs Sector</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "5D", spy: row.rs_5d_spy, qqq: row.rs_5d_qqq, sec: row.rs_5d_sector },
                  { label: "10D", spy: row.rs_10d_spy, qqq: row.rs_10d_qqq, sec: row.rs_10d_sector },
                  { label: "20D", spy: row.rs_20d_spy, qqq: row.rs_20d_qqq, sec: row.rs_20d_sector },
                  { label: "50D", spy: row.rs_50d_spy, qqq: row.rs_50d_qqq, sec: row.rs_50d_sector },
                ].map((tf) => (
                  <tr key={tf.label}>
                    <td className="pr-3 text-[#555]">{tf.label}</td>
                    <td className={`px-2 text-right font-medium ${rsColor(tf.spy)}`}>{tf.spy !== null ? `${Number(tf.spy) > 0 ? "+" : ""}${Number(tf.spy).toFixed(1)}%` : "-"}</td>
                    <td className={`px-2 text-right font-medium ${rsColor(tf.qqq)}`}>{tf.qqq !== null ? `${Number(tf.qqq) > 0 ? "+" : ""}${Number(tf.qqq).toFixed(1)}%` : "-"}</td>
                    <td className={`px-2 text-right font-medium ${rsColor(tf.sec)}`}>{tf.sec !== null ? `${Number(tf.sec) > 0 ? "+" : ""}${Number(tf.sec).toFixed(1)}%` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Key Signals */}
          <div>
            <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1.5">Key Signals</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              <span className="text-[#555]">Money Flow</span>
              <span className={`font-medium ${(row.money_flow_persistence ?? 0) >= 12 ? "text-emerald-400" : (row.money_flow_persistence ?? 0) >= 8 ? "text-cyan-400" : "text-[#a0a0a0]"}`}>{row.money_flow_persistence ?? "-"}/20</span>
              <span className="text-[#555]">RVOL Trajectory</span>
              <span className={`font-medium ${(Number(row.rvol_trajectory) ?? 0) > 0.1 ? "text-emerald-400" : "text-[#a0a0a0]"}`}>{row.rvol_trajectory !== null ? Number(row.rvol_trajectory).toFixed(3) : "-"}</span>
              <span className="text-[#555]">Float Rotation</span>
              <span className="text-[#a0a0a0] font-medium">{row.float_rotation !== null ? `${Number(row.float_rotation).toFixed(2)}x` : "-"}</span>
              <span className="text-[#555]">Weekly Reversal</span>
              <span className={`font-medium ${row.weekly_reversal ? "text-emerald-400" : "text-[#333]"}`}>{row.weekly_reversal ? "Yes" : "-"}</span>
              <span className="text-[#555]">EMA10 Dist (ATR)</span>
              <span className="text-[#a0a0a0] font-medium">{row.dist_from_ema10_atr !== null ? Number(row.dist_from_ema10_atr).toFixed(2) : "-"}</span>
              <span className="text-[#555]">EMA20 Dist (ATR)</span>
              <span className="text-[#a0a0a0] font-medium">{row.dist_from_ema20_atr !== null ? Number(row.dist_from_ema20_atr).toFixed(2) : "-"}</span>
            </div>
          </div>

          {/* Commentary + Source Presets */}
          <div className="w-full">
            {row.commentary && (
              <>
                <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1">Commentary</p>
                <p className="text-[10px] text-[#a0a0a0] leading-relaxed mb-2">{row.commentary}</p>
              </>
            )}
            {row.source_presets && row.source_presets.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-wider text-[#555]">Presets:</span>
                {row.source_presets.map((p) => (
                  <span key={p} className="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-1.5 py-0.5 text-[9px] text-[#a0a0a0]">{p}</span>
                ))}
              </div>
            )}
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

export default function QFEDailyPage() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [results, setResults] = useState<QFEDailyRow[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [dropped, setDropped] = useState<DroppedTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [marketEnvDetail, setMarketEnvDetail] = useState<MarketEnvDetail | null>(null);
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("ALL");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("ALL");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("ALL");
  const [sectorFilter, setSectorFilter] = useState("ALL");
  const [newTodayOnly, setNewTodayOnly] = useState(false);
  const [tickerSearch, setTickerSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("qfe_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [showDropped, setShowDropped] = useState(false);
  const [showMarketEnv, setShowMarketEnv] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/qfe/daily?dates=true");
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
        const res = await fetch(`/api/qfe/daily?date=${selectedDate}`);
        const json = await res.json();
        if (!cancelled) {
          setResults(json.results ?? []);
          setStreaks(json.streaks ?? {});
          setDeltas(json.deltas ?? {});
          setMarketEnvDetail(json.marketEnvDetail ?? null);
          setDropped(json.dropped ?? []);
        }
      } catch { /* Error loading */ } finally {
        if (!cancelled) setLoadingResults(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedDate]);

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) { setSortAsc((a) => !a); return prev; }
      setSortAsc(false);
      return field;
    });
  }, []);

  // Derive unique sectors from results for the sector filter dropdown
  const sectors = useMemo(() => {
    const s = new Set<string>();
    for (const r of results) if (r.sector) s.add(r.sector);
    return [...s].sort();
  }, [results]);

  // Count new-today tickers
  const newTodayCount = useMemo(() => results.filter((r) => deltas[r.ticker] === undefined).length, [results, deltas]);

  // Rating distribution counts
  const ratingDist = useMemo(() => {
    const counts: Record<string, number> = { "A+": 0, A: 0, "B+": 0, B: 0, C: 0, D: 0 };
    for (const r of results) counts[r.rating] = (counts[r.rating] ?? 0) + 1;
    return counts;
  }, [results]);

  const filtered = useMemo(() => {
    let rows = [...results];
    if (ratingFilter !== "ALL") rows = rows.filter((r) => r.rating === ratingFilter);
    if (actionFilter !== "ALL") rows = rows.filter((r) => r.action === actionFilter);
    if (riskFilter !== "ALL") rows = rows.filter((r) => r.risk_level === riskFilter);
    if (sectorFilter !== "ALL") rows = rows.filter((r) => r.sector === sectorFilter);
    if (newTodayOnly) rows = rows.filter((r) => deltas[r.ticker] === undefined);
    if (tickerSearch) {
      const q = tickerSearch.toUpperCase();
      rows = rows.filter((r) =>
        r.ticker.includes(q) ||
        (r.company_name ?? "").toUpperCase().includes(q) ||
        (r.sector ?? "").toUpperCase().includes(q)
      );
    }
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "qfe_score": cmp = a.qfe_score - b.qfe_score; break;
        case "quality_score": cmp = a.quality_score - b.quality_score; break;
        case "leadership_score": cmp = a.leadership_score - b.leadership_score; break;
        case "entry_score": cmp = a.entry_score - b.entry_score; break;
        case "ticker": cmp = a.ticker.localeCompare(b.ticker); break;
        case "price": cmp = a.price - b.price; break;
        case "rating": cmp = a.qfe_score - b.qfe_score; break;
        case "action": cmp = a.qfe_score - b.qfe_score; break;
        case "streak": cmp = (streaks[a.ticker] ?? 0) - (streaks[b.ticker] ?? 0); break;
        case "delta": cmp = (deltas[a.ticker] ?? 0) - (deltas[b.ticker] ?? 0); break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [results, ratingFilter, actionFilter, riskFilter, sectorFilter, newTodayOnly, tickerSearch, sortField, sortAsc, streaks, deltas]);

  const copyWatchlist = useCallback(() => {
    const tickers = filtered.map((r) => r.ticker).join("\n");
    navigator.clipboard.writeText(tickers);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [filtered]);

  // Summary stats
  const buyNowCount = results.filter((r) => r.action === "Buy Now").length;
  const marketEnvScore = results.length > 0 ? results[0].market_env_score : 0;
  const regime = marketEnvScore >= 80 ? "Bullish" : marketEnvScore >= 60 ? "Constructive" : marketEnvScore >= 40 ? "Neutral" : marketEnvScore >= 25 ? "Cautious" : "Defensive";
  const regimeColor = marketEnvScore >= 60 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : marketEnvScore >= 40 ? "text-amber-400 bg-amber-500/10 border-amber-500/30" : "text-red-400 bg-red-500/10 border-red-500/30";

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#5ba3e6]" />
      </div>
    );
  }

  if (dates.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-16 text-center">
        <Calendar className="mx-auto mb-4 h-10 w-10 text-[#333]" />
        <p className="text-lg text-[#666]">No QFE scan data available yet.</p>
        <p className="mt-2 text-sm text-[#444]">Data is generated by the nightly preset cron job.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-white">QFE Decision Engine</h1>
          <p className="text-xs text-[#555]">Quality + Leadership + Entry + Market Environment = Unified Action</p>
        </div>
        <div className="flex items-center gap-2">
          {results.length > 0 && (
            <button
              onClick={() => setShowMarketEnv(!showMarketEnv)}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition-colors hover:brightness-125 ${regimeColor}`}
            >
              {regime} ({marketEnvScore}) {showMarketEnv ? "\u25B2" : "\u25BC"}
            </button>
          )}
        </div>
      </div>

      {/* Market Environment Breakdown */}
      {showMarketEnv && marketEnvDetail && (
        <div className="mb-4 rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] p-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px] sm:grid-cols-5">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-[#555]">SPY Trend</p>
              <p className={`font-bold ${marketEnvDetail.spyTrendScore >= 20 ? "text-emerald-400" : marketEnvDetail.spyTrendScore >= 10 ? "text-amber-400" : "text-red-400"}`}>
                {marketEnvDetail.spyTrendScore}/25
              </p>
              <p className="text-[9px] text-[#444]">
                {marketEnvDetail.spyAboveSma200 && marketEnvDetail.spyAboveSma50 ? "Above SMA50 + SMA200" : marketEnvDetail.spyAboveSma200 ? "Above SMA200 only" : "Below both SMAs"}
              </p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-[#555]">QQQ Trend</p>
              <p className={`font-bold ${marketEnvDetail.qqqTrendScore >= 12 ? "text-emerald-400" : marketEnvDetail.qqqTrendScore >= 8 ? "text-amber-400" : "text-red-400"}`}>
                {marketEnvDetail.qqqTrendScore}/15
              </p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-[#555]">Sector Breadth</p>
              <p className={`font-bold ${marketEnvDetail.sectorBreadthScore >= 20 ? "text-emerald-400" : marketEnvDetail.sectorBreadthScore >= 10 ? "text-amber-400" : "text-red-400"}`}>
                {marketEnvDetail.sectorBreadthScore}/25
              </p>
              <p className="text-[9px] text-[#444]">
                {marketEnvDetail.leadingSectors}L + {marketEnvDetail.improvingSectors}I sectors
              </p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-[#555]">Distribution</p>
              <p className={`font-bold ${marketEnvDetail.distributionDayScore >= 15 ? "text-emerald-400" : marketEnvDetail.distributionDayScore >= 8 ? "text-amber-400" : "text-red-400"}`}>
                {marketEnvDetail.distributionDayScore}/20
              </p>
              <p className="text-[9px] text-[#444]">
                {marketEnvDetail.spyDistributionDays} dist days (25d)
              </p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-[#555]">SPY vs High</p>
              <p className={`font-bold ${marketEnvDetail.spyDistFromHighScore >= 12 ? "text-emerald-400" : marketEnvDetail.spyDistFromHighScore >= 6 ? "text-amber-400" : "text-red-400"}`}>
                {marketEnvDetail.spyDistFromHighScore}/15
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Date Tabs */}
      <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1">
        {dates.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDate(d)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              d === selectedDate
                ? "bg-[#185FA5]/20 text-[#5ba3e6] border border-[#185FA5]/40"
                : "text-[#666] hover:bg-[#1a1a1a] hover:text-white border border-transparent"
            }`}
          >
            {formatDatePill(d)}
          </button>
        ))}
      </div>

      {/* Summary Bar with rating distribution */}
      {!loadingResults && results.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-[11px]">
          <span className="text-[#555]">{results.length} rated</span>
          <span className="text-[#555]">|</span>
          <span className="text-emerald-400">{buyNowCount} Buy Now</span>
          <span className="text-[#555]">|</span>
          {ratingDist["A+"] > 0 && <span className="text-emerald-400 font-medium">{ratingDist["A+"]}A+</span>}
          <span className="text-emerald-400 font-medium">{ratingDist.A}A</span>
          <span className="text-cyan-400 font-medium">{ratingDist["B+"]}B+</span>
          <span className="text-cyan-400 font-medium">{ratingDist.B}B</span>
          <span className="text-amber-400 font-medium">{ratingDist.C}C</span>
          {newTodayCount > 0 && (
            <>
              <span className="text-[#555]">|</span>
              <span className="text-cyan-400">{newTodayCount} new</span>
            </>
          )}
          {dropped.length > 0 && (
            <>
              <span className="text-[#555]">|</span>
              <span className="text-red-400">{dropped.length} dropped</span>
            </>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#555]" />
          <input
            type="text"
            placeholder="Search..."
            value={tickerSearch}
            onChange={(e) => setTickerSearch(e.target.value)}
            className="rounded-md border border-[#2a2a2a] bg-[#0f0f0f] pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#555] focus:border-[#5ba3e6] focus:outline-none w-40"
          />
        </div>

        <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value as RatingFilter)}
          className="rounded-md border border-[#2a2a2a] bg-[#0f0f0f] px-2 py-1.5 text-xs text-[#a0a0a0] focus:border-[#5ba3e6] focus:outline-none">
          <option value="ALL">All Ratings</option>
          {(["A+", "A", "B+", "B", "C", "D"] as const).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value as ActionFilter)}
          className="rounded-md border border-[#2a2a2a] bg-[#0f0f0f] px-2 py-1.5 text-xs text-[#a0a0a0] focus:border-[#5ba3e6] focus:outline-none">
          <option value="ALL">All Actions</option>
          {(["Buy Now", "Buy Pullback", "Watchlist", "Wait", "Avoid"] as const).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>

        <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
          className="rounded-md border border-[#2a2a2a] bg-[#0f0f0f] px-2 py-1.5 text-xs text-[#a0a0a0] focus:border-[#5ba3e6] focus:outline-none">
          <option value="ALL">All Risk</option>
          {(["Low", "Moderate", "High"] as const).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}
          className="rounded-md border border-[#2a2a2a] bg-[#0f0f0f] px-2 py-1.5 text-xs text-[#a0a0a0] focus:border-[#5ba3e6] focus:outline-none">
          <option value="ALL">All Sectors</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <button
          onClick={() => setNewTodayOnly(!newTodayOnly)}
          className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
            newTodayOnly
              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
              : "border-[#2a2a2a] bg-[#0f0f0f] text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
          }`}
        >
          New Today
        </button>

        <div className="flex-1" />

        <button onClick={copyWatchlist} className="flex items-center gap-1 rounded-md border border-[#2a2a2a] bg-[#0f0f0f] px-2.5 py-1.5 text-xs text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white transition-colors">
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button onClick={() => exportCSV(filtered, selectedDate ?? "", streaks, deltas)} className="flex items-center gap-1 rounded-md border border-[#2a2a2a] bg-[#0f0f0f] px-2.5 py-1.5 text-xs text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white transition-colors">
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>

      {/* Table */}
      {loadingResults ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-[#5ba3e6]" />
        </div>
      ) : (
        <TableErrorBoundary>
          <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-[#2a2a2a] bg-[#0a0a0a]">
                  <th className="w-6 px-1 py-2.5" />
                  <SortHeader field="ticker" label="Ticker" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#666]">Sector</th>
                  <SortHeader field="price" label="Price" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="qfe_score" label="QFE" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="rating" label="Rating" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="action" label="Action" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="quality_score" label="Qual" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="leadership_score" label="Lead" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="entry_score" label="Entry" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#666]">Risk</th>
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#666]">Ext</th>
                  <SortHeader field="delta" label="+/-" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="streak" label="Streak" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const rb = ratingBadge(row.rating);
                  const ab = actionBadge(row.action);
                  const risk = riskBadge(row.risk_level);
                  const ext = extensionBadge(row.extension_level);
                  const streak = streaks[row.ticker] ?? 1;
                  const delta = deltas[row.ticker];
                  const expanded = expandedTicker === row.ticker;

                  return (
                    <Fragment key={row.ticker}>
                      <tr
                        onClick={() => setExpandedTicker(expanded ? null : row.ticker)}
                        className={`border-b border-[#1a1a1a] cursor-pointer transition-colors ${expanded ? "bg-[#111]" : "hover:bg-[#0d0d0d]"}`}
                      >
                        <td className="px-1 py-2 text-center text-[#333]">
                          {expanded ? <ChevronUp className="h-3 w-3 inline" /> : <ChevronDown className="h-3 w-3 inline" />}
                        </td>
                        <td className="px-2 py-2">
                          <Link href={`/prerun?ticker=${row.ticker}`} className="font-bold text-white hover:text-[#5ba3e6]" onClick={(e) => e.stopPropagation()}>
                            {row.ticker}
                          </Link>
                          <div className="text-[9px] text-[#444] truncate max-w-[120px]">{row.company_name}</div>
                        </td>
                        <td className="px-2 py-2 text-[#555] text-[10px]">{row.sector || "-"}</td>
                        <td className="px-2 py-2 text-[#a0a0a0] font-medium">${row.price.toFixed(2)}</td>
                        <td className={`px-2 py-2 font-bold text-sm ${scoreColor(row.qfe_score)}`}>{row.qfe_score}</td>
                        <td className="px-2 py-2">
                          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${rb.color}`}>{rb.label}</span>
                        </td>
                        <td className="px-2 py-2">
                          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${ab.color}`}>{ab.label}</span>
                        </td>
                        <td className={`px-2 py-2 font-medium ${scoreColor(row.quality_score)}`}>{row.quality_score}</td>
                        <td className={`px-2 py-2 font-medium ${scoreColor(row.leadership_score)}`}>{row.leadership_score}</td>
                        <td className={`px-2 py-2 font-medium ${scoreColor(row.entry_score)}`}>{row.entry_score}</td>
                        <td className={`px-2 py-2 text-[10px] font-medium ${risk.color}`}>{risk.label}</td>
                        <td className={`px-2 py-2 text-[10px] font-medium ${ext.color}`}>{ext.label}</td>
                        <td className="px-2 py-2">
                          {delta !== undefined ? (
                            <span className={`text-[10px] font-medium ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-[#555]"}`}>
                              {delta > 0 ? "+" : ""}{delta}
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-cyan-400">NEW</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {streak > 1 && (
                            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${streakColor(streak)}`}>{streak}d</span>
                          )}
                        </td>
                      </tr>
                      {expanded && <ExpandedQFE row={row} />}
                    </Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-4 py-8 text-center text-[#555]">No results match filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TableErrorBoundary>
      )}

      {/* Dropped Section */}
      {dropped.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowDropped(!showDropped)}
            className="flex items-center gap-1 text-xs text-red-400/60 hover:text-red-400 transition-colors"
          >
            <TrendingDown className="h-3 w-3" />
            {dropped.length} dropped from yesterday
            {showDropped ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showDropped && (
            <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <div className="flex flex-wrap gap-2">
                {dropped.map((d) => (
                  <span key={d.ticker} className="rounded border border-red-500/20 bg-[#0f0f0f] px-2 py-1 text-[10px]">
                    <span className="text-red-400 font-medium">{d.ticker}</span>
                    <span className="text-[#555] ml-1">{d.prev_score} {d.prev_rating}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
