"use client";

import { useState, useEffect, Fragment } from "react";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { fmtNum } from "@/lib/daily-format";
import { TableErrorBoundary } from "@/components/table-error-boundary";

// ── Types (mirrors API response) ──

interface ForwardReturn {
  return1d: number | null;
  return3d: number | null;
  return5d: number | null;
  maxFavorable5d: number | null;
  maxAdverse5d: number | null;
}

interface FunnelPick {
  ticker: string;
  sector: string;
  price: number;
  presets: string[];
  prerunScore: number;
  tradeRead: string;
  inflectionStage: string;
  inflectionScore: number;
  alertState: string;
  transitionState: string;
  transitionScore: number;
  triggerLevel: number | null;
  confluenceCount: number;
  onVcpFocus: boolean;
  vcpScore: number | null;
  onInstShortlist: boolean;
  instScore: number | null;
  forward: ForwardReturn;
}

interface FunnelDayResult {
  date: string;
  funnelCounts: { step1: number; step2: number; step3: number; step4: number };
  picks: FunnelPick[];
}

interface FunnelSummary {
  totalDays: number;
  totalPicks: number;
  avgPicksPerDay: number;
  avgReturn1d: number;
  avgReturn3d: number;
  avgReturn5d: number;
  winRate1d: number;
  winRate3d: number;
  winRate5d: number;
  avgMaxFavorable: number;
  avgMaxAdverse: number;
  bestTrade: { ticker: string; date: string; return5d: number } | null;
  worstTrade: { ticker: string; date: string; return5d: number } | null;
}

interface BacktestData {
  dates: string[];
  funnelResults: FunnelDayResult[];
  summary: FunnelSummary;
}

// ── Helpers ──

function retColor(v: number | null): string {
  if (v == null) return "text-[#666]";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-[#a0a0a0]";
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PRESET_SHORT: Record<string, string> = {
  early_mover: "EM",
  stealth: "ST",
  early_plus: "E+",
  sndk: "SNDK",
  leading: "LD",
  pullback: "PB",
};

const STAGE_SHORT: Record<string, string> = {
  INFLECTION: "INF",
  EARLY_ACCUMULATION: "EA",
  SELLER_EXHAUSTION: "SE",
};

// ── Component ──

export default function FunnelBacktestPage() {
  const [days, setDays] = useState<5 | 10>(10);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BacktestData | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);

    fetch(`/api/backtest/funnel?days=${days}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [days]);

  const s = data?.summary;

  // Compute average funnel counts for funnel bar
  const avgFunnel = data?.funnelResults && data.funnelResults.length > 0
    ? {
        step1: data.funnelResults.reduce((a, d) => a + d.funnelCounts.step1, 0) / data.funnelResults.length,
        step2: data.funnelResults.reduce((a, d) => a + d.funnelCounts.step2, 0) / data.funnelResults.length,
        step3: data.funnelResults.reduce((a, d) => a + d.funnelCounts.step3, 0) / data.funnelResults.length,
        step4: data.funnelResults.reduce((a, d) => a + d.funnelCounts.step4, 0) / data.funnelResults.length,
      }
    : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/prerun" className="text-sm text-[#666] hover:text-[#a0a0a0]">
              &larr; Pre-Run
            </Link>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Funnel Backtest</h1>
            <p className="mt-1 text-sm text-[#666]">
              5-step playbook funnel against persisted scanner data with forward returns
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDays(5)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                days === 5
                  ? "bg-[#185FA5]/20 text-[#5ba3e6]"
                  : "text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
              }`}
            >
              5 days
            </button>
            <button
              onClick={() => setDays(10)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                days === 10
                  ? "bg-[#185FA5]/20 text-[#5ba3e6]"
                  : "text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
              }`}
            >
              10 days
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#5ba3e6]" />
            <span className="ml-3 text-[#a0a0a0]">Running funnel backtest...</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && data && s && s.totalPicks === 0 && (
          <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-8 text-center">
            <p className="text-lg text-[#a0a0a0]">
              No stocks passed all funnel steps in this period.
            </p>
            <p className="mt-2 text-sm text-[#666]">
              This is expected — the 5-step funnel is intentionally strict.
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && data && s && (
          <>
            {/* Summary cards */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Picks */}
              <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-[#666]">Total Picks</div>
                <div className="mt-1 text-2xl font-bold">{s.totalPicks}</div>
                <div className="text-xs text-[#666]">
                  {fmtNum(s.avgPicksPerDay, 1)}/day over {s.totalDays} days
                </div>
              </div>

              {/* Avg Returns */}
              <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-[#666]">Avg Returns</div>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className={`text-lg font-bold ${retColor(s.avgReturn1d)}`}>
                    {fmtNum(s.avgReturn1d, 2)}%
                  </span>
                  <span className="text-xs text-[#666]">1d</span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className={retColor(s.avgReturn3d)}>{fmtNum(s.avgReturn3d, 2)}%</span>
                  <span className="text-xs text-[#666]">3d</span>
                  <span className={retColor(s.avgReturn5d)}>{fmtNum(s.avgReturn5d, 2)}%</span>
                  <span className="text-xs text-[#666]">5d</span>
                </div>
              </div>

              {/* Win Rates */}
              <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-[#666]">Win Rates</div>
                <div className="mt-1 text-lg font-bold">{fmtNum(s.winRate5d, 0)}%</div>
                <div className="text-xs text-[#666]">
                  1d: {fmtNum(s.winRate1d, 0)}% &middot; 3d: {fmtNum(s.winRate3d, 0)}%
                </div>
              </div>

              {/* Best / Worst */}
              <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-[#666]">MFE / MAE</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-emerald-400 text-lg font-bold">+{fmtNum(s.avgMaxFavorable, 2)}%</span>
                  <span className="text-red-400">{fmtNum(s.avgMaxAdverse, 2)}%</span>
                </div>
                <div className="text-xs text-[#666]">
                  {s.bestTrade && (
                    <span className="text-emerald-400">{s.bestTrade.ticker} +{fmtNum(s.bestTrade.return5d, 1)}%</span>
                  )}
                  {s.bestTrade && s.worstTrade && " / "}
                  {s.worstTrade && (
                    <span className="text-red-400">{s.worstTrade.ticker} {fmtNum(s.worstTrade.return5d, 1)}%</span>
                  )}
                </div>
              </div>
            </div>

            {/* Funnel bar */}
            {avgFunnel && (
              <div className="mb-6 rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
                <div className="mb-3 text-xs font-medium uppercase tracking-wider text-[#666]">
                  Average Funnel Narrowing
                </div>
                <FunnelBar counts={avgFunnel} />
              </div>
            )}

            {/* Per-day table */}
            <TableErrorBoundary>
              <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a2a] bg-[#111]">
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[#666]">Date</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-[#666]">Step 1</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-[#666]">Step 2</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-[#666]">Step 3</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-[#666]">Step 4</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-[#666]">Picks</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-[#666]">Avg 5d</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.funnelResults.map((day) => {
                      const isExpanded = expandedDate === day.date;
                      const avg5d = day.picks.length > 0
                        ? day.picks.reduce((a, p) => a + (p.forward.return5d ?? 0), 0) / day.picks.filter((p) => p.forward.return5d != null).length
                        : null;

                      return (
                        <Fragment key={day.date}>
                          <tr
                            className="cursor-pointer border-b border-[#1a1a1a] hover:bg-[#151515] transition-colors"
                            onClick={() => setExpandedDate(isExpanded ? null : day.date)}
                          >
                            <td className="px-3 py-2 font-medium">{formatDateShort(day.date)}</td>
                            <td className="px-3 py-2 text-right text-[#a0a0a0]">{day.funnelCounts.step1}</td>
                            <td className="px-3 py-2 text-right text-[#a0a0a0]">{day.funnelCounts.step2}</td>
                            <td className="px-3 py-2 text-right text-[#a0a0a0]">{day.funnelCounts.step3}</td>
                            <td className="px-3 py-2 text-right text-[#a0a0a0]">{day.funnelCounts.step4}</td>
                            <td className="px-3 py-2 text-right font-medium">
                              {day.picks.length > 0 ? day.picks.length : <span className="text-[#666]">0</span>}
                            </td>
                            <td className={`px-3 py-2 text-right font-medium ${retColor(avg5d)}`}>
                              {avg5d != null && !isNaN(avg5d) ? `${fmtNum(avg5d, 2)}%` : "-"}
                            </td>
                            <td className="px-3 py-2 text-[#666]">
                              {day.picks.length > 0 && (
                                isExpanded
                                  ? <ChevronUp className="h-4 w-4" />
                                  : <ChevronDown className="h-4 w-4" />
                              )}
                            </td>
                          </tr>

                          {/* Expanded picks sub-table */}
                          {isExpanded && day.picks.length > 0 && (
                            <tr>
                              <td colSpan={8} className="bg-[#0d0d0d] p-0">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-[#1a1a1a]">
                                        <th className="px-3 py-1.5 text-left text-[#666]">Ticker</th>
                                        <th className="px-3 py-1.5 text-right text-[#666]">Price</th>
                                        <th className="px-3 py-1.5 text-left text-[#666]">Presets</th>
                                        <th className="px-3 py-1.5 text-right text-[#666]">PR Score</th>
                                        <th className="px-3 py-1.5 text-left text-[#666]">Stage</th>
                                        <th className="px-3 py-1.5 text-left text-[#666]">Alert</th>
                                        <th className="px-3 py-1.5 text-center text-[#666]">VCP/Inst</th>
                                        <th className="px-3 py-1.5 text-right text-[#666]">1d</th>
                                        <th className="px-3 py-1.5 text-right text-[#666]">3d</th>
                                        <th className="px-3 py-1.5 text-right text-[#666]">5d</th>
                                        <th className="px-3 py-1.5 text-right text-[#666]">MFE</th>
                                        <th className="px-3 py-1.5 text-right text-[#666]">MAE</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {day.picks.map((pick) => (
                                        <tr key={pick.ticker} className="border-b border-[#1a1a1a] hover:bg-[#111]">
                                          <td className="px-3 py-1.5 font-medium text-[#5ba3e6]">
                                            {pick.ticker}
                                            <span className="ml-1 text-[#444]">{pick.confluenceCount}/5</span>
                                          </td>
                                          <td className="px-3 py-1.5 text-right text-[#a0a0a0]">${fmtNum(pick.price, 2)}</td>
                                          <td className="px-3 py-1.5">
                                            <div className="flex flex-wrap gap-1">
                                              {pick.presets.map((p) => (
                                                <span
                                                  key={p}
                                                  className="rounded bg-[#1a1a1a] px-1.5 py-0.5 text-[10px] font-medium text-[#a0a0a0]"
                                                >
                                                  {PRESET_SHORT[p] ?? p}
                                                </span>
                                              ))}
                                            </div>
                                          </td>
                                          <td className="px-3 py-1.5 text-right font-medium">{pick.prerunScore}</td>
                                          <td className="px-3 py-1.5 text-cyan-400">
                                            {STAGE_SHORT[pick.inflectionStage] ?? pick.inflectionStage}
                                            <span className="ml-1 text-[#666]">{pick.inflectionScore}</span>
                                          </td>
                                          <td className="px-3 py-1.5">
                                            <span className={pick.alertState === "TRIGGERED" ? "text-emerald-400" : "text-amber-400"}>
                                              {pick.alertState}
                                            </span>
                                            <span className="ml-1 text-[#666]">{pick.transitionScore}</span>
                                          </td>
                                          <td className="px-3 py-1.5 text-center">
                                            {pick.onVcpFocus && (
                                              <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                                                VCP {pick.vcpScore}
                                              </span>
                                            )}
                                            {pick.onInstShortlist && (
                                              <span className="ml-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                                                INST {pick.instScore}
                                              </span>
                                            )}
                                            {!pick.onVcpFocus && !pick.onInstShortlist && (
                                              <span className="text-[#444]">-</span>
                                            )}
                                          </td>
                                          <td className={`px-3 py-1.5 text-right font-medium ${retColor(pick.forward.return1d)}`}>
                                            {pick.forward.return1d != null ? `${fmtNum(pick.forward.return1d, 2)}%` : "-"}
                                          </td>
                                          <td className={`px-3 py-1.5 text-right font-medium ${retColor(pick.forward.return3d)}`}>
                                            {pick.forward.return3d != null ? `${fmtNum(pick.forward.return3d, 2)}%` : "-"}
                                          </td>
                                          <td className={`px-3 py-1.5 text-right font-medium ${retColor(pick.forward.return5d)}`}>
                                            {pick.forward.return5d != null ? `${fmtNum(pick.forward.return5d, 2)}%` : "-"}
                                          </td>
                                          <td className="px-3 py-1.5 text-right text-emerald-400">
                                            {pick.forward.maxFavorable5d != null ? `+${fmtNum(pick.forward.maxFavorable5d, 2)}%` : "-"}
                                          </td>
                                          <td className="px-3 py-1.5 text-right text-red-400">
                                            {pick.forward.maxAdverse5d != null ? `${fmtNum(pick.forward.maxAdverse5d, 2)}%` : "-"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
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
          </>
        )}
      </div>
    </div>
  );
}

// ── Funnel Bar ──

function FunnelBar({ counts }: { counts: { step1: number; step2: number; step3: number; step4: number } }) {
  const max = Math.max(counts.step1, 1);
  const steps = [
    { label: "Confluence >= 3", value: counts.step1, color: "bg-blue-500" },
    { label: "Preset + Score", value: counts.step2, color: "bg-cyan-500" },
    { label: "Inflection", value: counts.step3, color: "bg-amber-500" },
    { label: "Transition", value: counts.step4, color: "bg-emerald-500" },
  ];

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-28 shrink-0 text-right text-xs text-[#a0a0a0]">
            Step {i + 1}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="h-5 rounded" style={{ width: `${Math.max((step.value / max) * 100, 2)}%` }}>
                <div className={`h-full rounded ${step.color} opacity-60`} />
              </div>
              <span className="text-xs font-medium text-[#a0a0a0]">
                {fmtNum(step.value, 1)}
              </span>
            </div>
          </div>
          <div className="w-32 shrink-0 text-xs text-[#666]">{step.label}</div>
        </div>
      ))}
    </div>
  );
}
