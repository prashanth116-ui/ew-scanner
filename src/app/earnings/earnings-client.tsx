"use client";

import { useState, useEffect, useCallback, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  Search,
  DollarSign,
  BarChart3,
  Loader2,
  Target,
  ArrowUpCircle,
  ArrowDownCircle,
  Users,
  ShieldCheck,
  PieChart,
  Minus,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useCollapsibleSections } from "@/lib/use-collapsible-sections";

// ── Types ──

interface EarningsQuarter {
  quarter: string;
  date: string;
  epsEstimate: number | null;
  epsActual: number | null;
  epsSurprise: number | null;
  surprisePercent: number | null;
}

interface EarningsEstimate {
  period: string;
  epsAvg: number | null;
  epsLow: number | null;
  epsHigh: number | null;
  numAnalysts: number | null;
  revenueAvg: number | null;
  revenueLow: number | null;
  revenueHigh: number | null;
}

interface EarningsFinancial {
  quarter: string;
  revenue: number | null;
  earnings: number | null;
}

interface AnalystRatings {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  targetMean: number | null;
  targetMedian: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  recommendationKey: string | null;
  recommendationMean: number | null;
  numAnalysts: number | null;
}

interface UpgradeDowngrade {
  date: string;
  firm: string;
  toGrade: string;
  fromGrade: string;
  action: string;
}

interface InsiderTransaction {
  name: string;
  relation: string;
  date: string;
  shares: number | null;
  value: number | null;
  text: string;
}

interface KeyFinancials {
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  grossMargins: number | null;
  operatingMargins: number | null;
  profitMargins: number | null;
  totalRevenue: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
  currentRatio: number | null;
}

interface Ownership {
  insidersPercent: number | null;
  institutionsPercent: number | null;
  institutionsFloatPercent: number | null;
  institutionsCount: number | null;
}

interface EarningsData {
  ticker: string;
  name: string;
  currentPrice: number | null;
  nextEarningsDate: string | null;
  nextEpsEstimate: number | null;
  nextRevenueAvg: number | null;
  nextRevenueLow: number | null;
  nextRevenueHigh: number | null;
  exDividendDate: string | null;
  dividendDate: string | null;
  history: EarningsQuarter[];
  estimates: EarningsEstimate[];
  financials: EarningsFinancial[];
  analystRatings: AnalystRatings | null;
  upgradeDowngrades: UpgradeDowngrade[];
  insiderTransactions: InsiderTransaction[];
  keyFinancials: KeyFinancials | null;
  ownership: Ownership | null;
}

// ── Formatters ──

const DASH = "\u2014";

function formatCurrency(val: number | null): string {
  if (val == null) return DASH;
  return val.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatEps(val: number | null): string {
  if (val == null) return DASH;
  return val >= 0 ? `$${val.toFixed(2)}` : `-$${Math.abs(val).toFixed(2)}`;
}

function formatLargeNumber(val: number | null): string {
  if (val == null) return DASH;
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return formatCurrency(val);
}

function formatPercent(val: number | null): string {
  if (val == null) return DASH;
  const pct = (val * 100).toFixed(1);
  return val >= 0 ? `+${pct}%` : `${pct}%`;
}

function formatRatio(val: number | null): string {
  if (val == null) return DASH;
  return val.toFixed(2);
}

function formatShares(val: number | null): string {
  if (val == null) return DASH;
  const abs = Math.abs(val);
  if (abs >= 1e6) return `${val < 0 ? "-" : ""}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${val < 0 ? "-" : ""}${(abs / 1e3).toFixed(1)}K`;
  return val.toLocaleString();
}

// ── Small components ──

function SurpriseIndicator({ val }: { val: number | null }) {
  if (val == null) return <span className="text-[#555]">{DASH}</span>;
  if (val > 0)
    return (
      <span className="flex items-center justify-center gap-1 text-green-400">
        <TrendingUp className="h-3 w-3" /> Beat
      </span>
    );
  if (val < 0)
    return (
      <span className="flex items-center justify-center gap-1 text-red-400">
        <TrendingDown className="h-3 w-3" /> Miss
      </span>
    );
  return <span className="text-[#a0a0a0]">Inline</span>;
}

function RatingBar({ ratings }: { ratings: AnalystRatings }) {
  const total =
    ratings.strongBuy +
    ratings.buy +
    ratings.hold +
    ratings.sell +
    ratings.strongSell;
  if (total === 0) return null;

  const segments = [
    { count: ratings.strongBuy, color: "bg-green-500", label: "Strong Buy" },
    { count: ratings.buy, color: "bg-green-400", label: "Buy" },
    { count: ratings.hold, color: "bg-yellow-500", label: "Hold" },
    { count: ratings.sell, color: "bg-red-400", label: "Sell" },
    { count: ratings.strongSell, color: "bg-red-500", label: "Strong Sell" },
  ];

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {segments.map(
          (s) =>
            s.count > 0 && (
              <div
                key={s.label}
                className={`${s.color}`}
                style={{ width: `${(s.count / total) * 100}%` }}
                title={`${s.label}: ${s.count}`}
              />
            )
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map(
          (s) =>
            s.count > 0 && (
              <span key={s.label} className="flex items-center gap-1.5 text-xs text-[#a0a0a0]">
                <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
                {s.label} ({s.count})
              </span>
            )
        )}
      </div>
    </div>
  );
}

function PriceTargetRange({
  low,
  mean,
  high,
  current,
}: {
  low: number | null;
  mean: number | null;
  high: number | null;
  current: number | null;
}) {
  if (low == null || high == null || current == null) return null;
  const min = Math.min(low, current);
  const max = Math.max(high, current);
  const range = max - min || 1;
  const currentPos = ((current - min) / range) * 100;
  const meanPos = mean != null ? ((mean - min) / range) * 100 : null;

  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs text-[#777]">
        <span>{formatCurrency(low)}</span>
        {mean != null && <span>Mean: {formatCurrency(mean)}</span>}
        <span>{formatCurrency(high)}</span>
      </div>
      <div className="relative h-2 rounded-full bg-[#2a2a2a]">
        <div
          className="absolute top-0 h-2 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
          style={{ left: `${((low - min) / range) * 100}%`, width: `${((high - low) / range) * 100}%` }}
        />
        <div
          className="absolute top-[-3px] h-4 w-0.5 bg-white"
          style={{ left: `${currentPos}%` }}
          title={`Current: ${formatCurrency(current)}`}
        />
        {meanPos != null && (
          <div
            className="absolute top-[-3px] h-4 w-0.5 bg-[#5ba3e6]"
            style={{ left: `${meanPos}%` }}
            title={`Mean target: ${formatCurrency(mean)}`}
          />
        )}
      </div>
      <div className="mt-1 flex items-center gap-3 text-xs text-[#555]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-white" /> Current
        </span>
        {meanPos != null && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[#5ba3e6]" /> Target
          </span>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-md border border-[#2a2a2a] bg-[#141414] p-3">
      <div className="text-xs text-[#777]">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${color ?? "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const lower = action.toLowerCase();
  if (lower === "upgrade")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-xs text-green-400">
        <ArrowUpCircle className="h-3 w-3" /> Upgrade
      </span>
    );
  if (lower === "downgrade")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-xs text-red-400">
        <ArrowDownCircle className="h-3 w-3" /> Downgrade
      </span>
    );
  if (lower === "init")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
        Initiated
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#2a2a2a] px-2 py-0.5 text-xs text-[#a0a0a0]">
      {action}
    </span>
  );
}

function OwnershipBar({
  label,
  percent,
  color,
}: {
  label: string;
  percent: number | null;
  color: string;
}) {
  if (percent == null) return null;
  const pct = Math.min(percent * 100, 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-[#a0a0a0]">{label}</span>
        <span className="text-white">{(percent * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#2a2a2a]">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Collapsible section wrapper ──

function Section({
  id,
  icon: Icon,
  title,
  collapsed,
  onToggle,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  collapsed: boolean;
  onToggle: (key: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
      <button
        onClick={() => onToggle(id)}
        className="flex w-full items-center gap-2 px-5 py-4 text-left"
      >
        <Icon className="h-5 w-5 text-[#5ba3e6]" />
        <h3 className="flex-1 text-lg font-bold text-white">{title}</h3>
        <ChevronRight
          className={`h-4 w-4 text-[#555] transition-transform ${collapsed ? "" : "rotate-90"}`}
        />
      </button>
      {!collapsed && (
        <div className="border-t border-[#2a2a2a] px-5 pb-5 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Main component ──

export function EarningsClient() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isCollapsed, toggleSection } = useCollapsibleSections([], "earnings");

  const doSearch = useCallback(async (ticker: string) => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(
        `/api/earnings?ticker=${encodeURIComponent(ticker)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error || `Failed to fetch earnings for ${ticker}`
        );
      }
      setData(await res.json());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-search if ?ticker= is in the URL (e.g. from calendar link)
  useEffect(() => {
    const t = searchParams.get("ticker")?.trim().toUpperCase();
    if (t) {
      setQuery(t);
      doSearch(t);
    }
  }, [searchParams, doSearch]);

  const handleSearch = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      doSearch(query.trim().toUpperCase());
    },
    [query, doSearch]
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="text-center">
        <div className="mx-auto flex items-center justify-center gap-3 mb-4">
          <Calendar className="h-8 w-8 text-[#5ba3e6]" />
          <h1 className="text-3xl font-bold text-white">Earnings</h1>
        </div>
        <p className="mx-auto max-w-xl text-sm text-[#a0a0a0]">
          Earnings, analyst ratings, insider activity, and key financials for
          any stock. Data sourced from Yahoo Finance.
        </p>
      </section>

      {/* Search */}
      <form onSubmit={handleSearch} className="mx-auto flex max-w-md gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter ticker (e.g. AAPL)"
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2.5 pl-10 pr-4 text-sm text-white placeholder-[#555] focus:border-[#5ba3e6] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-lg bg-[#185FA5] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1a6dba] disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Search"
          )}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="mx-auto max-w-md rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="space-y-6">
          {/* ── Company Header ── */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">{data.name}</h2>
                <span className="text-sm text-[#5ba3e6]">{data.ticker}</span>
              </div>
              <div className="text-right">
                {data.currentPrice != null && (
                  <div className="text-2xl font-bold text-white">
                    {formatCurrency(data.currentPrice)}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-[#2a2a2a] bg-[#141414] p-4">
                <div className="mb-1 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#5ba3e6]" />
                  <span className="text-xs font-semibold text-[#777]">Next Earnings</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {data.nextEarningsDate ?? "TBD"}
                </span>
              </div>
              <div className="rounded-md border border-[#2a2a2a] bg-[#141414] p-4">
                <div className="mb-1 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-[#10b981]" />
                  <span className="text-xs font-semibold text-[#777]">EPS Estimate</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {data.nextEpsEstimate != null ? formatEps(data.nextEpsEstimate) : DASH}
                </span>
              </div>
              <div className="rounded-md border border-[#2a2a2a] bg-[#141414] p-4">
                <div className="mb-1 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#8b5cf6]" />
                  <span className="text-xs font-semibold text-[#777]">Revenue Estimate</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {data.nextRevenueAvg != null ? formatLargeNumber(data.nextRevenueAvg) : DASH}
                </span>
              </div>
              <div className="rounded-md border border-[#2a2a2a] bg-[#141414] p-4">
                <div className="mb-1 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#f59e0b]" />
                  <span className="text-xs font-semibold text-[#777]">Ex-Dividend</span>
                </div>
                <span className="text-lg font-bold text-white">
                  {data.exDividendDate ?? "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* ── Analyst Consensus + Price Targets ── */}
          {data.analystRatings && (
            <Section id="analyst" icon={Target} title="Analyst Consensus & Price Targets" collapsed={isCollapsed("analyst")} onToggle={toggleSection}>
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  {data.analystRatings.recommendationKey && (
                    <div className="mb-3 flex items-center gap-3">
                      <span
                        className={`rounded-md px-3 py-1 text-sm font-bold uppercase ${
                          ["strongbuy", "buy"].includes(data.analystRatings.recommendationKey.toLowerCase())
                            ? "bg-green-500/10 border border-green-500/20 text-green-400"
                            : data.analystRatings.recommendationKey.toLowerCase() === "hold"
                              ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400"
                              : "bg-red-500/10 border border-red-500/20 text-red-400"
                        }`}
                      >
                        {data.analystRatings.recommendationKey.replace("_", " ")}
                      </span>
                      {data.analystRatings.numAnalysts != null && (
                        <span className="text-xs text-[#777]">
                          {data.analystRatings.numAnalysts} analysts
                        </span>
                      )}
                    </div>
                  )}
                  <RatingBar ratings={data.analystRatings} />
                </div>

                <div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-xs text-[#777]">Low</div>
                      <div className="text-sm font-bold text-red-400">
                        {formatCurrency(data.analystRatings.targetLow)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#777]">Mean</div>
                      <div className="text-sm font-bold text-[#5ba3e6]">
                        {formatCurrency(data.analystRatings.targetMean)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#777]">High</div>
                      <div className="text-sm font-bold text-green-400">
                        {formatCurrency(data.analystRatings.targetHigh)}
                      </div>
                    </div>
                  </div>
                  <PriceTargetRange
                    low={data.analystRatings.targetLow}
                    mean={data.analystRatings.targetMean}
                    high={data.analystRatings.targetHigh}
                    current={data.currentPrice}
                  />
                  {data.analystRatings.targetMean != null &&
                    data.currentPrice != null && (
                      <div className="mt-3 text-center text-xs text-[#777]">
                        Upside/Downside:{" "}
                        <span
                          className={
                            data.analystRatings.targetMean > data.currentPrice
                              ? "text-green-400"
                              : "text-red-400"
                          }
                        >
                          {(
                            ((data.analystRatings.targetMean - data.currentPrice) /
                              data.currentPrice) *
                            100
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                    )}
                </div>
              </div>
            </Section>
          )}

          {/* ── Recent Upgrades / Downgrades ── */}
          {data.upgradeDowngrades.length > 0 && (
            <Section id="upgrades" icon={ShieldCheck} title="Recent Upgrades / Downgrades" collapsed={isCollapsed("upgrades")} onToggle={toggleSection}>
              <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a]">
                      <th className="px-4 py-3 text-left font-semibold text-white">Date</th>
                      <th className="px-4 py-3 text-left font-semibold text-white">Firm</th>
                      <th className="px-4 py-3 text-center font-semibold text-white">Action</th>
                      <th className="px-4 py-3 text-left font-semibold text-white">From</th>
                      <th className="px-4 py-3 text-left font-semibold text-white">To</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a2a]">
                    {data.upgradeDowngrades.map((u, i) => (
                      <tr key={i} className="bg-[#141414]">
                        <td className="px-4 py-3 text-[#a0a0a0]">{u.date}</td>
                        <td className="px-4 py-3 font-medium text-white">{u.firm}</td>
                        <td className="px-4 py-3 text-center">
                          <ActionBadge action={u.action} />
                        </td>
                        <td className="px-4 py-3 text-[#a0a0a0]">{u.fromGrade || DASH}</td>
                        <td className="px-4 py-3 text-white">{u.toGrade || DASH}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ── Earnings History ── */}
          {data.history.length > 0 && (
            <Section id="history" icon={Calendar} title="Earnings History" collapsed={isCollapsed("history")} onToggle={toggleSection}>
              <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a]">
                      <th className="px-4 py-3 text-left font-semibold text-white">Quarter</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">EPS Est.</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">EPS Actual</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">Surprise</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">Surprise %</th>
                      <th className="px-4 py-3 text-center font-semibold text-white">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a2a]">
                    {data.history.map((h, i) => (
                      <tr key={i} className="bg-[#141414]">
                        <td className="px-4 py-3 font-medium text-white">
                          {h.quarter || h.date}
                        </td>
                        <td className="px-4 py-3 text-right text-[#a0a0a0]">
                          {formatEps(h.epsEstimate)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-white">
                          {formatEps(h.epsActual)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#a0a0a0]">
                          {formatEps(h.epsSurprise)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${
                            h.surprisePercent != null && h.surprisePercent > 0
                              ? "text-green-400"
                              : h.surprisePercent != null && h.surprisePercent < 0
                                ? "text-red-400"
                                : "text-[#a0a0a0]"
                          }`}
                        >
                          {formatPercent(h.surprisePercent)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-medium">
                          <SurpriseIndicator val={h.epsSurprise} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ── Forward Estimates ── */}
          {data.estimates.length > 0 && (
            <Section id="estimates" icon={TrendingUp} title="Analyst Estimates" collapsed={isCollapsed("estimates")} onToggle={toggleSection}>
              <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a]">
                      <th className="px-4 py-3 text-left font-semibold text-white">Period</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">EPS Avg</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">EPS Low</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">EPS High</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">Analysts</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">Revenue Est.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a2a]">
                    {data.estimates.map((e, i) => (
                      <tr key={i} className="bg-[#141414]">
                        <td className="px-4 py-3 font-medium text-white">{e.period}</td>
                        <td className="px-4 py-3 text-right text-[#a0a0a0]">{formatEps(e.epsAvg)}</td>
                        <td className="px-4 py-3 text-right text-[#555]">{formatEps(e.epsLow)}</td>
                        <td className="px-4 py-3 text-right text-[#555]">{formatEps(e.epsHigh)}</td>
                        <td className="px-4 py-3 text-right text-[#a0a0a0]">{e.numAnalysts ?? DASH}</td>
                        <td className="px-4 py-3 text-right text-[#a0a0a0]">{formatLargeNumber(e.revenueAvg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ── Quarterly Financials ── */}
          {data.financials.length > 0 && (
            <Section id="financials" icon={DollarSign} title="Quarterly Financials" collapsed={isCollapsed("financials")} onToggle={toggleSection}>
              <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a]">
                      <th className="px-4 py-3 text-left font-semibold text-white">Quarter</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">Revenue</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">Earnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a2a]">
                    {data.financials.map((f, i) => (
                      <tr key={i} className="bg-[#141414]">
                        <td className="px-4 py-3 font-medium text-white">{f.quarter}</td>
                        <td className="px-4 py-3 text-right text-[#a0a0a0]">{formatLargeNumber(f.revenue)}</td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${
                            f.earnings != null && f.earnings >= 0 ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {formatLargeNumber(f.earnings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ── Key Financials + Ownership ── */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Key Financials */}
            {data.keyFinancials && (
              <Section id="keyfinancials" icon={BarChart3} title="Key Financials" collapsed={isCollapsed("keyfinancials")} onToggle={toggleSection}>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard
                    label="Revenue Growth"
                    value={formatPercent(data.keyFinancials.revenueGrowth)}
                    color={
                      data.keyFinancials.revenueGrowth != null && data.keyFinancials.revenueGrowth > 0
                        ? "text-green-400"
                        : data.keyFinancials.revenueGrowth != null && data.keyFinancials.revenueGrowth < 0
                          ? "text-red-400"
                          : undefined
                    }
                  />
                  <MetricCard
                    label="Earnings Growth"
                    value={formatPercent(data.keyFinancials.earningsGrowth)}
                    color={
                      data.keyFinancials.earningsGrowth != null && data.keyFinancials.earningsGrowth > 0
                        ? "text-green-400"
                        : data.keyFinancials.earningsGrowth != null && data.keyFinancials.earningsGrowth < 0
                          ? "text-red-400"
                          : undefined
                    }
                  />
                  <MetricCard label="Gross Margin" value={formatPercent(data.keyFinancials.grossMargins)} />
                  <MetricCard label="Profit Margin" value={formatPercent(data.keyFinancials.profitMargins)} />
                  <MetricCard label="Total Revenue" value={formatLargeNumber(data.keyFinancials.totalRevenue)} />
                  <MetricCard label="Total Cash" value={formatLargeNumber(data.keyFinancials.totalCash)} />
                  <MetricCard label="Total Debt" value={formatLargeNumber(data.keyFinancials.totalDebt)} />
                  <MetricCard label="Debt/Equity" value={formatRatio(data.keyFinancials.debtToEquity)} />
                  <MetricCard label="Return on Equity" value={formatPercent(data.keyFinancials.returnOnEquity)} />
                  <MetricCard label="Current Ratio" value={formatRatio(data.keyFinancials.currentRatio)} />
                </div>
              </Section>
            )}

            {/* Ownership */}
            {data.ownership && (
              <Section id="ownership" icon={PieChart} title="Ownership" collapsed={isCollapsed("ownership")} onToggle={toggleSection}>
                <div className="space-y-4">
                  <OwnershipBar
                    label="Institutional"
                    percent={data.ownership.institutionsPercent}
                    color="bg-[#5ba3e6]"
                  />
                  <OwnershipBar
                    label="Insiders"
                    percent={data.ownership.insidersPercent}
                    color="bg-[#10b981]"
                  />
                  <OwnershipBar
                    label="Institutional (Float)"
                    percent={data.ownership.institutionsFloatPercent}
                    color="bg-[#8b5cf6]"
                  />
                  {data.ownership.institutionsCount != null && (
                    <div className="mt-2 text-xs text-[#777]">
                      {data.ownership.institutionsCount.toLocaleString()} institutional holders
                    </div>
                  )}
                </div>
              </Section>
            )}
          </div>

          {/* ── Insider Activity ── */}
          {data.insiderTransactions.length > 0 && (
            <Section id="insiders" icon={Users} title="Insider Activity" collapsed={isCollapsed("insiders")} onToggle={toggleSection}>
              <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a]">
                      <th className="px-4 py-3 text-left font-semibold text-white">Date</th>
                      <th className="px-4 py-3 text-left font-semibold text-white">Insider</th>
                      <th className="px-4 py-3 text-left font-semibold text-white">Title</th>
                      <th className="px-4 py-3 text-center font-semibold text-white">Type</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">Shares</th>
                      <th className="px-4 py-3 text-right font-semibold text-white">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a2a]">
                    {data.insiderTransactions.map((t, i) => {
                      const isSale =
                        t.text.toLowerCase().includes("sale") ||
                        (t.shares != null && t.shares < 0);
                      const isPurchase =
                        t.text.toLowerCase().includes("purchase") ||
                        (t.shares != null && t.shares > 0 && !t.text.toLowerCase().includes("exercise"));
                      return (
                        <tr key={i} className="bg-[#141414]">
                          <td className="px-4 py-3 text-[#a0a0a0]">{t.date}</td>
                          <td className="px-4 py-3 font-medium text-white">{t.name}</td>
                          <td className="px-4 py-3 text-xs text-[#777]">{t.relation}</td>
                          <td className="px-4 py-3 text-center">
                            {isPurchase ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-xs text-green-400">
                                <TrendingUp className="h-3 w-3" /> Buy
                              </span>
                            ) : isSale ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-xs text-red-400">
                                <TrendingDown className="h-3 w-3" /> Sale
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#2a2a2a] px-2 py-0.5 text-xs text-[#a0a0a0]">
                                <Minus className="h-3 w-3" /> Other
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-[#a0a0a0]">
                            {formatShares(t.shares)}
                          </td>
                          <td className="px-4 py-3 text-right text-[#a0a0a0]">
                            {t.value != null ? formatLargeNumber(t.value) : DASH}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div className="py-16 text-center">
          <DollarSign className="mx-auto mb-4 h-12 w-12 text-[#2a2a2a]" />
          <p className="text-sm text-[#555]">
            Search for a stock ticker to see earnings, ratings, and insider
            activity
          </p>
        </div>
      )}
    </div>
  );
}
