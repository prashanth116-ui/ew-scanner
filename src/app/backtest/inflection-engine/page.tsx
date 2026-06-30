"use client";

import { useState, useMemo } from "react";
import {
  Loader2,
  ArrowUpDown,
  FileDown,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Shield,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import type { BacktestSignal } from "@/app/api/backtest/inflection/route";

type SortKey = "date" | "score" | "return1d" | "return3d" | "return5d" | "return10d" | "maxFav" | "maxAdv";

interface BacktestSummary {
  totalSignals: number;
  avgReturn1d: number;
  avgReturn3d: number;
  avgReturn5d: number;
  winRate1d: number;
  winRate3d: number;
  winRate5d: number;
  hitRatePlus3: number;
  hitRatePlus5: number;
  hitRatePlus8: number;
  hitRatePlus10: number;
  hitRateMinus3: number;
  hitRateMinus5: number;
  primarySignals: number;
  strongerSignals: number;
}

function fmtPct(v: number | null, decimals = 2): string {
  if (v === null) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

function pctColor(v: number | null): string {
  if (v === null) return "text-[#666]";
  if (v >= 5) return "text-emerald-400";
  if (v > 0) return "text-green-400";
  if (v > -3) return "text-amber-400";
  return "text-red-400";
}

function stageBadgeColor(stage: string): string {
  switch (stage) {
    case "EXPANSION": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    case "EARLY_ACCUMULATION": return "text-cyan-400 bg-cyan-500/10 border-cyan-500/30";
    case "INFLECTION": return "text-purple-400 bg-purple-500/10 border-purple-500/30";
    case "SELLER_EXHAUSTION": return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    default: return "text-red-400 bg-red-500/10 border-red-500/30";
  }
}

function getDefaultDates(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function InflectionBacktestPage() {
  const defaults = getDefaultDates(30);

  // Controls
  const [tickers, setTickers] = useState("TSLA");
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [minScore, setMinScore] = useState(40);
  const [rangeDays, setRangeDays] = useState(30);

  // State
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [signals, setSignals] = useState<BacktestSignal[]>([]);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleRangeChange = (days: number) => {
    setRangeDays(days);
    const dates = getDefaultDates(days);
    setStartDate(dates.start);
    setEndDate(dates.end);
  };

  const runBacktest = async () => {
    setRunning(true);
    setError(null);
    setSignals([]);
    setSummary(null);
    setProgress("Running backtest...");

    const tickerList = tickers
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0)
      .slice(0, 50);

    if (tickerList.length === 0) {
      setError("Enter at least one ticker");
      setRunning(false);
      return;
    }

    try {
      const res = await fetch("/api/backtest/inflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickers: tickerList,
          startDate,
          endDate,
          minScore,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? `Request failed: ${res.status}`);
        setRunning(false);
        return;
      }

      const json = await res.json();
      setSignals(json.signals ?? []);
      setSummary(json.summary ?? null);
      setProgress("");
    } catch (err) {
      setError(`Backtest failed: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  const sorted = useMemo(() => {
    const arr = [...signals];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "score": cmp = a.overallScore - b.overallScore; break;
        case "return1d": cmp = (a.forward.return1d ?? -999) - (b.forward.return1d ?? -999); break;
        case "return3d": cmp = (a.forward.return3d ?? -999) - (b.forward.return3d ?? -999); break;
        case "return5d": cmp = (a.forward.return5d ?? -999) - (b.forward.return5d ?? -999); break;
        case "return10d": cmp = (a.forward.return10d ?? -999) - (b.forward.return10d ?? -999); break;
        case "maxFav": cmp = (a.forward.maxFavorable5d ?? 0) - (b.forward.maxFavorable5d ?? 0); break;
        case "maxAdv": cmp = (a.forward.maxAdverse5d ?? 0) - (b.forward.maxAdverse5d ?? 0); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [signals, sortKey, sortDir]);

  const best20 = useMemo(() =>
    [...signals].sort((a, b) => (b.forward.return5d ?? -999) - (a.forward.return5d ?? -999)).slice(0, 20),
    [signals]
  );

  const worst20 = useMemo(() =>
    [...signals].sort((a, b) => (a.forward.maxAdverse5d ?? 0) - (b.forward.maxAdverse5d ?? 0)).slice(0, 20),
    [signals]
  );

  const exportCSV = () => {
    if (signals.length === 0) return;
    const headers = [
      "Ticker", "Date", "Price", "Overall", "SE", "VC", "BE", "RS", "LA", "IP",
      "Stage", "Trade Read", "Primary", "Stronger", "Ext Risk",
      "1d Ret", "2d Ret", "3d Ret", "5d Ret", "10d Ret",
      "Max Fav 5d", "Max Adv 5d",
      "+3%", "+5%", "+8%", "+10%", "-3%", "-5%", "-8%",
    ];
    const rows = signals.map((s) => [
      s.ticker, s.date, s.price.toFixed(2), s.overallScore,
      s.sellerExhaustion, s.volatilityCompression, s.buyerEmergence,
      s.relativeStrength, s.liquidityAuction, s.institutionalParticipation,
      s.stage, s.tradeRead, s.isPrimarySignal, s.isStrongerSignal, s.extensionRisk,
      s.forward.return1d?.toFixed(2) ?? "", s.forward.return2d?.toFixed(2) ?? "",
      s.forward.return3d?.toFixed(2) ?? "", s.forward.return5d?.toFixed(2) ?? "",
      s.forward.return10d?.toFixed(2) ?? "",
      s.forward.maxFavorable5d?.toFixed(2) ?? "", s.forward.maxAdverse5d?.toFixed(2) ?? "",
      s.forward.hitPlus3, s.forward.hitPlus5, s.forward.hitPlus8, s.forward.hitPlus10,
      s.forward.hitMinus3, s.forward.hitMinus5, s.forward.hitMinus8,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inflection-backtest-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Inflection Engine Backtest</h1>
          <p className="text-sm text-[#a0a0a0] mt-1">
            Validate inflection signals with forward return analysis
          </p>
        </div>
        <Link
          href="/prerun"
          className="text-xs text-[#a0a0a0] hover:text-white transition-colors"
        >
          Back to Scanner
        </Link>
      </div>

      {/* Controls */}
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs text-[#a0a0a0] mb-1">Tickers (comma-separated, max 50)</label>
            <input
              type="text"
              value={tickers}
              onChange={(e) => setTickers(e.target.value)}
              className="w-full rounded border border-[#333] bg-[#0f0f0f] px-3 py-1.5 text-sm text-white"
              placeholder="TSLA, AAPL, NVDA..."
            />
          </div>
          <div>
            <label className="block text-xs text-[#a0a0a0] mb-1">Range</label>
            <div className="flex gap-1">
              {[30, 90, 180].map((d) => (
                <button
                  key={d}
                  onClick={() => handleRangeChange(d)}
                  className={`flex-1 rounded px-2 py-1.5 text-xs transition-colors ${
                    rangeDays === d
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                      : "bg-[#0f0f0f] text-[#a0a0a0] border border-[#333] hover:text-white"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#a0a0a0] mb-1">Min Score</label>
            <select
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full rounded border border-[#333] bg-[#0f0f0f] px-3 py-1.5 text-sm text-[#a0a0a0]"
            >
              <option value={0}>Any</option>
              <option value={30}>30+</option>
              <option value={40}>40+</option>
              <option value={50}>50+</option>
              <option value={60}>60+</option>
              <option value={70}>70+</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={runBacktest}
              disabled={running}
              className="w-full flex items-center justify-center gap-2 rounded bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
              {running ? "Running..." : "Run Backtest"}
            </button>
          </div>
        </div>
        {progress && <p className="text-xs text-[#a0a0a0] mt-2">{progress}</p>}
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Signals</p>
              <p className="text-lg font-bold text-white">{summary.totalSignals}</p>
            </div>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Win Rate 1d</p>
              <p className={`text-lg font-bold ${summary.winRate1d >= 55 ? "text-emerald-400" : summary.winRate1d >= 50 ? "text-white" : "text-red-400"}`}>
                {summary.winRate1d.toFixed(0)}%
              </p>
            </div>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Win Rate 3d</p>
              <p className={`text-lg font-bold ${summary.winRate3d >= 55 ? "text-emerald-400" : summary.winRate3d >= 50 ? "text-white" : "text-red-400"}`}>
                {summary.winRate3d.toFixed(0)}%
              </p>
            </div>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Win Rate 5d</p>
              <p className={`text-lg font-bold ${summary.winRate5d >= 55 ? "text-emerald-400" : summary.winRate5d >= 50 ? "text-white" : "text-red-400"}`}>
                {summary.winRate5d.toFixed(0)}%
              </p>
            </div>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Avg 5d Ret</p>
              <p className={`text-lg font-bold ${pctColor(summary.avgReturn5d)}`}>
                {fmtPct(summary.avgReturn5d)}
              </p>
            </div>
            <div className="rounded-lg border border-purple-500/20 bg-[#141414] px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-purple-400/60 mb-1">Primary</p>
              <p className="text-lg font-bold text-purple-400">{summary.primarySignals}</p>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-[#141414] px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-emerald-400/60 mb-1">Stronger</p>
              <p className="text-lg font-bold text-emerald-400">{summary.strongerSignals}</p>
            </div>
          </div>

          {/* Hit rates */}
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {([
              { label: "+3%", count: summary.hitRatePlus3, color: "text-green-400" },
              { label: "+5%", count: summary.hitRatePlus5, color: "text-emerald-400" },
              { label: "+8%", count: summary.hitRatePlus8, color: "text-emerald-400" },
              { label: "+10%", count: summary.hitRatePlus10, color: "text-emerald-400" },
              { label: "-3%", count: summary.hitRateMinus3, color: "text-amber-400" },
              { label: "-5%", count: summary.hitRateMinus5, color: "text-red-400" },
            ] as { label: string; count: number; color: string }[]).map((h) => (
              <div key={h.label} className="rounded border border-[#2a2a2a] bg-[#141414] px-2 py-2 text-center">
                <p className="text-[9px] text-[#666]">{h.label} hit</p>
                <p className={`text-sm font-bold ${h.color}`}>
                  {summary.totalSignals > 0 ? `${((h.count / summary.totalSignals) * 100).toFixed(0)}%` : "-"}
                </p>
                <p className="text-[9px] text-[#555]">{h.count}/{summary.totalSignals}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signals Table */}
      {sorted.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">All Signals ({sorted.length})</h2>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1 rounded border border-[#2a2a2a] px-3 py-1 text-xs text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
            >
              <FileDown className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#141414] text-[#a0a0a0]">
                  {([
                    { key: "date" as SortKey, label: "Date" },
                    { key: null, label: "Ticker" },
                    { key: null, label: "Price" },
                    { key: "score" as SortKey, label: "Score" },
                    { key: null, label: "Stage" },
                    { key: null, label: "Signal" },
                    { key: "return1d" as SortKey, label: "1d" },
                    { key: "return3d" as SortKey, label: "3d" },
                    { key: "return5d" as SortKey, label: "5d" },
                    { key: "return10d" as SortKey, label: "10d" },
                    { key: "maxFav" as SortKey, label: "MFE 5d" },
                    { key: "maxAdv" as SortKey, label: "MAE 5d" },
                  ] as { key: SortKey | null; label: string }[]).map((col) => (
                    <th
                      key={col.label}
                      className={`px-2 py-2 text-left font-medium ${col.key ? "cursor-pointer hover:text-white" : ""}`}
                      onClick={() => col.key && toggleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {col.label}
                        {col.key && sortKey === col.key && <ArrowUpDown className="h-2.5 w-2.5" />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f1f1f]">
                {sorted.map((s, i) => (
                  <tr key={`${s.ticker}-${s.date}-${i}`} className="bg-[#1a1a1a] hover:bg-[#222]">
                    <td className="px-2 py-1.5 text-[#a0a0a0]">{s.date}</td>
                    <td className="px-2 py-1.5 font-medium text-white">{s.ticker}</td>
                    <td className="px-2 py-1.5 text-white">${s.price.toFixed(2)}</td>
                    <td className="px-2 py-1.5 font-medium text-white">{s.overallScore}</td>
                    <td className="px-2 py-1.5">
                      <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${stageBadgeColor(s.stage)}`}>
                        {s.stage.replace("_", " ").slice(0, 12)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        {s.isPrimarySignal && <span title="Primary Signal"><Zap className="h-3 w-3 text-purple-400" /></span>}
                        {s.isStrongerSignal && <span title="Stronger Signal"><Shield className="h-3 w-3 text-emerald-400" /></span>}
                        {s.extensionRisk && <span title="Extension Risk"><AlertTriangle className="h-3 w-3 text-orange-400" /></span>}
                      </div>
                    </td>
                    <td className={`px-2 py-1.5 font-medium ${pctColor(s.forward.return1d)}`}>{fmtPct(s.forward.return1d)}</td>
                    <td className={`px-2 py-1.5 font-medium ${pctColor(s.forward.return3d)}`}>{fmtPct(s.forward.return3d)}</td>
                    <td className={`px-2 py-1.5 font-medium ${pctColor(s.forward.return5d)}`}>{fmtPct(s.forward.return5d)}</td>
                    <td className={`px-2 py-1.5 font-medium ${pctColor(s.forward.return10d)}`}>{fmtPct(s.forward.return10d)}</td>
                    <td className="px-2 py-1.5">
                      <span className="text-emerald-400">{fmtPct(s.forward.maxFavorable5d)}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="text-red-400">{fmtPct(s.forward.maxAdverse5d)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Best Signals */}
      {best20.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            Best Signals (Top 20 by 5d Return)
          </h2>
          <div className="overflow-x-auto rounded-lg border border-emerald-500/20">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#141414] text-[#a0a0a0]">
                  <th className="px-2 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Ticker</th>
                  <th className="px-2 py-2 text-left">Score</th>
                  <th className="px-2 py-2 text-left">Stage</th>
                  <th className="px-2 py-2 text-left">5d Ret</th>
                  <th className="px-2 py-2 text-left">10d Ret</th>
                  <th className="px-2 py-2 text-left">MFE 5d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f1f1f]">
                {best20.map((s, i) => (
                  <tr key={`best-${s.ticker}-${s.date}-${i}`} className="bg-[#1a1a1a]">
                    <td className="px-2 py-1.5 text-[#a0a0a0]">{s.date}</td>
                    <td className="px-2 py-1.5 font-medium text-white">{s.ticker}</td>
                    <td className="px-2 py-1.5 text-white">{s.overallScore}</td>
                    <td className="px-2 py-1.5">
                      <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${stageBadgeColor(s.stage)}`}>
                        {s.stage.replace("_", " ").slice(0, 12)}
                      </span>
                    </td>
                    <td className={`px-2 py-1.5 font-bold ${pctColor(s.forward.return5d)}`}>{fmtPct(s.forward.return5d)}</td>
                    <td className={`px-2 py-1.5 ${pctColor(s.forward.return10d)}`}>{fmtPct(s.forward.return10d)}</td>
                    <td className="px-2 py-1.5 text-emerald-400">{fmtPct(s.forward.maxFavorable5d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Failed Signals */}
      {worst20.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-400" />
            Worst Signals (Bottom 20 by Max Adverse)
          </h2>
          <div className="overflow-x-auto rounded-lg border border-red-500/20">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#141414] text-[#a0a0a0]">
                  <th className="px-2 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Ticker</th>
                  <th className="px-2 py-2 text-left">Score</th>
                  <th className="px-2 py-2 text-left">Stage</th>
                  <th className="px-2 py-2 text-left">5d Ret</th>
                  <th className="px-2 py-2 text-left">MAE 5d</th>
                  <th className="px-2 py-2 text-left">MFE 5d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f1f1f]">
                {worst20.map((s, i) => (
                  <tr key={`worst-${s.ticker}-${s.date}-${i}`} className="bg-[#1a1a1a]">
                    <td className="px-2 py-1.5 text-[#a0a0a0]">{s.date}</td>
                    <td className="px-2 py-1.5 font-medium text-white">{s.ticker}</td>
                    <td className="px-2 py-1.5 text-white">{s.overallScore}</td>
                    <td className="px-2 py-1.5">
                      <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${stageBadgeColor(s.stage)}`}>
                        {s.stage.replace("_", " ").slice(0, 12)}
                      </span>
                    </td>
                    <td className={`px-2 py-1.5 ${pctColor(s.forward.return5d)}`}>{fmtPct(s.forward.return5d)}</td>
                    <td className="px-2 py-1.5 font-bold text-red-400">{fmtPct(s.forward.maxAdverse5d)}</td>
                    <td className="px-2 py-1.5 text-emerald-400">{fmtPct(s.forward.maxFavorable5d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!running && signals.length === 0 && !error && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-12 text-center">
          <Target className="mx-auto h-12 w-12 text-[#333]" />
          <h2 className="mt-4 text-lg font-semibold text-white">Inflection Engine Backtest</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#a0a0a0]">
            Enter tickers and a date range to backtest inflection engine signals. Calculates forward returns
            at 1d, 3d, 5d, and 10d horizons with max favorable/adverse excursion analysis.
          </p>
        </div>
      )}
    </div>
  );
}
