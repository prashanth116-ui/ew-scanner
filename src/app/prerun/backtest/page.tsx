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
  compositeScore: number;
  prerunPts: number;
  inflectionPts: number;
  transitionPts: number;
  instPts: number;
  prerunnerPts: number;
  confluencePts: number;
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
  diagnostics: {
    poolSize: number;
    qualifiedCount: number;
    pickedCount: number;
    avgCompositeScore: number;
    scannerCoverage: {
      prerun: number;
      inflection: number;
      transition: number;
      institutional: number;
      prerunner: number;
    };
  };
  picks: FunnelPick[];
}

interface FunnelSummary {
  totalDays: number;
  totalPicks: number;
  avgPicksPerDay: number;
  avgCompositeScore: number;
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
  EXPANSION: "EXP",
};

function scoreBarColor(pts: number, max: number): string {
  const pct = max > 0 ? pts / max : 0;
  if (pct >= 0.6) return "bg-emerald-500";
  if (pct >= 0.3) return "bg-amber-500";
  if (pts > 0) return "bg-blue-500";
  return "bg-[#333]";
}

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
              Composite scoring across 5 scanners with forward returns
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
            <span className="ml-3 text-[#a0a0a0]">Running composite backtest...</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && data && s && s.totalPicks === 0 && (
          <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-8 text-center">
            <p className="text-lg text-[#a0a0a0]">
              No stocks met the composite score threshold in this period.
            </p>
            <p className="mt-2 text-sm text-[#666]">
              Minimum composite score is 25 (needs meaningful signals from at least 2 scanners).
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && data && s && (
          <>
            {/* Summary cards */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {/* Picks */}
              <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-[#666]">Total Picks</div>
                <div className="mt-1 text-2xl font-bold">{s.totalPicks}</div>
                <div className="text-xs text-[#666]">
                  {fmtNum(s.avgPicksPerDay, 1)}/day over {s.totalDays} days
                </div>
              </div>

              {/* Avg Composite */}
              <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-[#666]">Avg Composite</div>
                <div className="mt-1 text-2xl font-bold text-[#5ba3e6]">{fmtNum(s.avgCompositeScore, 1)}</div>
                <div className="text-xs text-[#666]">out of 100 max</div>
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

            {/* Score Distribution Bar */}
            {data.funnelResults.length > 0 && (
              <div className="mb-6 rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
                <div className="mb-3 text-xs font-medium uppercase tracking-wider text-[#666]">
                  Average Funnel Flow
                </div>
                <ScoreDistributionBar results={data.funnelResults} />
              </div>
            )}

            {/* Per-day table */}
            <TableErrorBoundary>
              <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a2a] bg-[#111]">
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[#666]">Date</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-[#666]">Pool</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-[#666]">Qualified</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-[#666]">Picks</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-[#666]">Avg Score</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-[#666]">Avg 5d</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.funnelResults.map((day) => {
                      const isExpanded = expandedDate === day.date;
                      const fwdArr = day.picks.filter((p) => p.forward.return5d != null);
                      const avg5d = fwdArr.length > 0
                        ? fwdArr.reduce((a, p) => a + (p.forward.return5d ?? 0), 0) / fwdArr.length
                        : null;

                      return (
                        <Fragment key={day.date}>
                          <tr
                            className="cursor-pointer border-b border-[#1a1a1a] hover:bg-[#151515] transition-colors"
                            onClick={() => setExpandedDate(isExpanded ? null : day.date)}
                          >
                            <td className="px-3 py-2 font-medium">{formatDateShort(day.date)}</td>
                            <td className="px-3 py-2 text-right text-[#a0a0a0]">{day.diagnostics.poolSize}</td>
                            <td className="px-3 py-2 text-right text-[#a0a0a0]">{day.diagnostics.qualifiedCount}</td>
                            <td className="px-3 py-2 text-right font-medium">
                              {day.diagnostics.pickedCount > 0 ? day.diagnostics.pickedCount : <span className="text-[#666]">0</span>}
                            </td>
                            <td className="px-3 py-2 text-right text-[#5ba3e6] font-medium">
                              {day.diagnostics.pickedCount > 0 ? fmtNum(day.diagnostics.avgCompositeScore, 1) : "-"}
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
                              <td colSpan={7} className="bg-[#0d0d0d] p-0">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-[#1a1a1a]">
                                        <th className="px-3 py-1.5 text-left text-[#666]">Ticker</th>
                                        <th className="px-3 py-1.5 text-right text-[#666]">Composite</th>
                                        <th className="px-3 py-1.5 text-center text-[#666]">Score Breakdown</th>
                                        <th className="px-3 py-1.5 text-left text-[#666]">Presets</th>
                                        <th className="px-3 py-1.5 text-left text-[#666]">Stage</th>
                                        <th className="px-3 py-1.5 text-left text-[#666]">Alert</th>
                                        <th className="px-3 py-1.5 text-center text-[#666]">Badges</th>
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
                                            <span className="ml-1 text-[#444]">${fmtNum(pick.price, 0)}</span>
                                          </td>
                                          <td className="px-3 py-1.5 text-right">
                                            <span className="font-bold text-white">{pick.compositeScore}</span>
                                          </td>
                                          <td className="px-3 py-1.5">
                                            <div className="flex items-center justify-center gap-0.5">
                                              <ScorePill label="PR" pts={pick.prerunPts} max={25} />
                                              <ScorePill label="INF" pts={pick.inflectionPts} max={25} />
                                              <ScorePill label="TR" pts={pick.transitionPts} max={20} />
                                              <ScorePill label="IN" pts={pick.instPts} max={15} />
                                              <ScorePill label="RO" pts={pick.prerunnerPts} max={10} />
                                              <ScorePill label="C" pts={pick.confluencePts} max={5} />
                                            </div>
                                          </td>
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
                                              {pick.presets.length === 0 && <span className="text-[#444]">-</span>}
                                            </div>
                                          </td>
                                          <td className="px-3 py-1.5 text-cyan-400">
                                            {pick.inflectionStage !== "-"
                                              ? <>{STAGE_SHORT[pick.inflectionStage] ?? pick.inflectionStage}<span className="ml-1 text-[#666]">{pick.inflectionScore}</span></>
                                              : <span className="text-[#444]">-</span>
                                            }
                                          </td>
                                          <td className="px-3 py-1.5">
                                            {pick.alertState !== "-"
                                              ? <>
                                                  <span className={
                                                    pick.alertState === "TRIGGERED" ? "text-emerald-400"
                                                    : pick.alertState === "READY" ? "text-amber-400"
                                                    : "text-[#a0a0a0]"
                                                  }>
                                                    {pick.alertState}
                                                  </span>
                                                  <span className="ml-1 text-[#666]">{pick.transitionScore}</span>
                                                </>
                                              : <span className="text-[#444]">-</span>
                                            }
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

// ── Score Distribution Bar ──

function ScoreDistributionBar({ results }: { results: FunnelDayResult[] }) {
  const n = results.length;
  if (n === 0) return null;

  const avgPool = results.reduce((a, d) => a + d.diagnostics.poolSize, 0) / n;
  const avgQualified = results.reduce((a, d) => a + d.diagnostics.qualifiedCount, 0) / n;
  const avgPicked = results.reduce((a, d) => a + d.diagnostics.pickedCount, 0) / n;
  const max = Math.max(avgPool, 1);

  const steps = [
    { label: "Pool (conf >= 2.0)", value: avgPool, color: "bg-blue-500" },
    { label: "Qualified (score >= 25)", value: avgQualified, color: "bg-amber-500" },
    { label: "Picked (top 15)", value: avgPicked, color: "bg-emerald-500" },
  ];

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 shrink-0 text-right text-xs font-medium text-[#a0a0a0]">
            {i + 1}
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
          <div className="w-40 shrink-0 text-xs text-[#666]">{step.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Score Pill ──

function ScorePill({ label, pts, max }: { label: string; pts: number; max: number }) {
  const bg = scoreBarColor(pts, max);
  return (
    <span
      className={`inline-block rounded px-1 py-0.5 text-[9px] font-medium ${
        pts > 0 ? `${bg}/20 text-white` : "bg-[#1a1a1a] text-[#444]"
      }`}
      title={`${label}: ${pts}/${max}`}
    >
      {label}{pts > 0 ? ` ${pts}` : ""}
    </span>
  );
}
