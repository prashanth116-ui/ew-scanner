"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, Filter, Target, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import Link from "next/link";
import { fmtNum } from "@/lib/daily-format";

interface BacktestEvent {
  ticker: string;
  scanDate: string;
  state: string;
  timeframe: string;
  score: number;
  confluenceScore: number;
  bslTarget: number | null;
  protectedLow: number | null;
  price: number;
  distanceToBslPct: number | null;
  return1d: number | null;
  return3d: number | null;
  return5d: number | null;
  mfe5d: number | null;
  mae5d: number | null;
  hitBsl: boolean;
}

interface BacktestSummary {
  totalEvents: number;
  avgScore: number;
  avgReturn1d: number | null;
  avgReturn3d: number | null;
  avgReturn5d: number | null;
  winRate1d: number | null;
  winRate3d: number | null;
  winRate5d: number | null;
  avgMfe5d: number | null;
  avgMae5d: number | null;
  bslHitRate: number | null;
}

type TFFilter = "ALL" | "4h" | "8h" | "12h" | "1d" | "1wk";
type StateFilterBT = "ALL" | "Armed" | "Trigger" | "Ignition";

function returnColor(val: number | null): string {
  if (val === null) return "text-[#333]";
  if (val > 1) return "text-green-400";
  if (val > 0) return "text-green-400/70";
  if (val > -1) return "text-red-400/70";
  return "text-red-400";
}

export default function ICTBacktestPage() {
  const [summary, setSummary] = useState<BacktestSummary | null>(null);
  const [events, setEvents] = useState<BacktestEvent[]>([]);
  const [daysScanned, setDaysScanned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);
  const [tfFilter, setTfFilter] = useState<TFFilter>("ALL");
  const [stateFilter, setStateFilter] = useState<StateFilterBT>("ALL");
  const [minScore, setMinScore] = useState(30);

  const fetchData = useCallback((d: number, ms: number) => {
    setLoading(true);
    fetch(`/api/ict/backtest?days=${d}&minScore=${ms}`)
      .then((r) => r.json())
      .then((data) => {
        setSummary(data.summary ?? null);
        setEvents(data.events ?? []);
        setDaysScanned(data.daysScanned ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData(days, minScore);
  }, [days, minScore, fetchData]);

  const filtered = useMemo(() => {
    let result = events;
    if (tfFilter !== "ALL") {
      result = result.filter((e) => e.timeframe === tfFilter);
    }
    if (stateFilter !== "ALL") {
      result = result.filter((e) => e.state === stateFilter);
    }
    return result;
  }, [events, tfFilter, stateFilter]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, BacktestEvent[]> = {};
    for (const e of filtered) {
      if (!groups[e.scanDate]) groups[e.scanDate] = [];
      groups[e.scanDate].push(e);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">ICT Backtest</h1>
        <p className="mt-1 text-sm text-[#888]">
          Historical ARMED/TRIGGER/IGNITION events with forward returns
        </p>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-[#888]">Days:</span>
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded border px-2 py-1 text-xs ${d === days ? "border-[#5ba3e6] text-[#5ba3e6]" : "border-[#2a2a2a] text-[#888] hover:text-white"}`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <Filter className="h-4 w-4 text-[#888]" />
          <select
            value={tfFilter}
            onChange={(e) => setTfFilter(e.target.value as TFFilter)}
            className="rounded border border-[#2a2a2a] bg-[#141414] px-2 py-1 text-xs text-white outline-none"
          >
            <option value="ALL">All TFs</option>
            <option value="4h">4h</option>
            <option value="8h">8h</option>
            <option value="12h">12h</option>
            <option value="1d">1d</option>
            <option value="1wk">1wk</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as StateFilterBT)}
            className="rounded border border-[#2a2a2a] bg-[#141414] px-2 py-1 text-xs text-white outline-none"
          >
            <option value="ALL">All States</option>
            <option value="Armed">Armed</option>
            <option value="Trigger">Trigger</option>
            <option value="Ignition">Ignition</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-[#888]">Min Score:</span>
          <input
            type="number"
            value={minScore}
            onChange={(e) => setMinScore(parseInt(e.target.value) || 0)}
            className="w-14 rounded border border-[#2a2a2a] bg-[#141414] px-2 py-1 text-xs text-white outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#5ba3e6]" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {summary && (
            <div className="mb-6 grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
                <div className="text-xs text-[#888]">Events / Days</div>
                <div className="mt-1 text-xl font-bold text-white">{summary.totalEvents}</div>
                <div className="text-xs text-[#666]">{daysScanned} scan days</div>
              </div>

              <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
                <div className="text-xs text-[#888]">Avg Forward Returns</div>
                <div className="mt-1 flex items-center gap-3 text-sm">
                  <div>
                    <span className="text-[#666]">1d: </span>
                    <span className={returnColor(summary.avgReturn1d)}>
                      {summary.avgReturn1d !== null ? `${summary.avgReturn1d > 0 ? "+" : ""}${fmtNum(summary.avgReturn1d, 2)}%` : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#666]">3d: </span>
                    <span className={returnColor(summary.avgReturn3d)}>
                      {summary.avgReturn3d !== null ? `${summary.avgReturn3d > 0 ? "+" : ""}${fmtNum(summary.avgReturn3d, 2)}%` : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#666]">5d: </span>
                    <span className={returnColor(summary.avgReturn5d)}>
                      {summary.avgReturn5d !== null ? `${summary.avgReturn5d > 0 ? "+" : ""}${fmtNum(summary.avgReturn5d, 2)}%` : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
                <div className="text-xs text-[#888]">Win Rate</div>
                <div className="mt-1 flex items-center gap-3 text-sm">
                  <div>
                    <span className="text-[#666]">1d: </span>
                    <span className="text-white">{summary.winRate1d !== null ? `${fmtNum(summary.winRate1d, 0)}%` : "—"}</span>
                  </div>
                  <div>
                    <span className="text-[#666]">3d: </span>
                    <span className="text-white">{summary.winRate3d !== null ? `${fmtNum(summary.winRate3d, 0)}%` : "—"}</span>
                  </div>
                  <div>
                    <span className="text-[#666]">5d: </span>
                    <span className="text-white">{summary.winRate5d !== null ? `${fmtNum(summary.winRate5d, 0)}%` : "—"}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
                <div className="text-xs text-[#888]">MFE / MAE (5d)</div>
                <div className="mt-1 flex items-center gap-3 text-sm">
                  <div>
                    <TrendingUp className="mr-1 inline h-3 w-3 text-green-400" />
                    <span className="text-green-400">
                      {summary.avgMfe5d !== null ? `+${fmtNum(summary.avgMfe5d, 2)}%` : "—"}
                    </span>
                  </div>
                  <div>
                    <TrendingDown className="mr-1 inline h-3 w-3 text-red-400" />
                    <span className="text-red-400">
                      {summary.avgMae5d !== null ? `${fmtNum(summary.avgMae5d, 2)}%` : "—"}
                    </span>
                  </div>
                </div>
                {summary.bslHitRate !== null && (
                  <div className="mt-1 text-xs">
                    <Target className="mr-1 inline h-3 w-3 text-cyan-400" />
                    <span className="text-[#888]">BSL Hit: </span>
                    <span className="text-cyan-400">{fmtNum(summary.bslHitRate, 0)}%</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Events table grouped by date */}
          {groupedByDate.map(([date, dateEvents]) => (
            <div key={date} className="mb-4">
              <div className="mb-1 text-xs font-medium text-[#888]">
                {date} <span className="text-[#666]">({dateEvents.length} events)</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a2a] bg-[#141414] text-left text-[#888]">
                      <th className="px-3 py-1.5 text-xs font-medium">Ticker</th>
                      <th className="px-3 py-1.5 text-xs font-medium">State</th>
                      <th className="px-3 py-1.5 text-xs font-medium">TF</th>
                      <th className="px-3 py-1.5 text-xs font-medium">Score</th>
                      <th className="px-3 py-1.5 text-xs font-medium">Price</th>
                      <th className="px-3 py-1.5 text-xs font-medium">BSL</th>
                      <th className="px-3 py-1.5 text-xs font-medium">Dist%</th>
                      <th className="px-3 py-1.5 text-xs font-medium">1d</th>
                      <th className="px-3 py-1.5 text-xs font-medium">3d</th>
                      <th className="px-3 py-1.5 text-xs font-medium">5d</th>
                      <th className="px-3 py-1.5 text-xs font-medium">MFE</th>
                      <th className="px-3 py-1.5 text-xs font-medium">MAE</th>
                      <th className="px-3 py-1.5 text-xs font-medium">BSL Hit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dateEvents.map((e, i) => (
                      <tr key={`${e.ticker}-${i}`} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]">
                        <td className="px-3 py-1.5">
                          <Link
                            href={`https://finance.yahoo.com/quote/${e.ticker}`}
                            target="_blank"
                            className="font-medium text-white hover:text-[#5ba3e6]"
                          >
                            {e.ticker}
                          </Link>
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`rounded border px-1 py-0.5 text-xs ${
                            e.state === "Armed" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400" :
                            e.state === "Trigger" ? "border-green-500/30 bg-green-500/10 text-green-400" :
                            "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          }`}>
                            {e.state}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-[#888]">{e.timeframe}</td>
                        <td className="px-3 py-1.5 font-mono text-white">{e.score}</td>
                        <td className="px-3 py-1.5 font-mono text-[#888]">${fmtNum(e.price, 2)}</td>
                        <td className="px-3 py-1.5 font-mono text-[#888]">
                          {e.bslTarget != null ? `$${fmtNum(e.bslTarget, 2)}` : "—"}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[#888]">
                          {e.distanceToBslPct != null ? `${fmtNum(e.distanceToBslPct, 1)}%` : "—"}
                        </td>
                        <td className={`px-3 py-1.5 font-mono ${returnColor(e.return1d)}`}>
                          {e.return1d !== null ? `${e.return1d > 0 ? "+" : ""}${fmtNum(e.return1d, 2)}%` : "—"}
                        </td>
                        <td className={`px-3 py-1.5 font-mono ${returnColor(e.return3d)}`}>
                          {e.return3d !== null ? `${e.return3d > 0 ? "+" : ""}${fmtNum(e.return3d, 2)}%` : "—"}
                        </td>
                        <td className={`px-3 py-1.5 font-mono ${returnColor(e.return5d)}`}>
                          {e.return5d !== null ? `${e.return5d > 0 ? "+" : ""}${fmtNum(e.return5d, 2)}%` : "—"}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-green-400">
                          {e.mfe5d !== null ? `+${fmtNum(e.mfe5d, 2)}%` : "—"}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-red-400">
                          {e.mae5d !== null ? `${fmtNum(e.mae5d, 2)}%` : "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          {e.bslTarget != null ? (
                            e.hitBsl ? (
                              <Target className="h-4 w-4 text-cyan-400" />
                            ) : (
                              <span className="text-[#333]">—</span>
                            )
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="py-12 text-center text-[#888]">
              No backtest events found. Adjust filters or run the scanner first.
            </div>
          )}
        </>
      )}
    </div>
  );
}
