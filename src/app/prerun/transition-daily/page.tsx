"use client";

import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import {
  Loader2,
  Calendar,
  Download,
  Filter,
  Search,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Zap,
  Shield,
  TrendingDown,
  Copy,
  Check,
  Target,
} from "lucide-react";
import Link from "next/link";
import { TableErrorBoundary } from "@/components/table-error-boundary";
import { fmtNum } from "@/lib/daily-format";
import { formatDatePill, streakColor } from "@/lib/daily-page-utils";

// ── Types ──

interface TransitionDailyRow {
  scan_date: string;
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  overall_score: number;
  se_score: number;
  accum_score: number;
  choch_score: number;
  bos_score: number;
  compression_score: number;
  hl_score: number;
  rs_score: number;
  volume_score: number;
  state: string;
  alert_state: string;
  trigger_level: number | null;
  invalidation: number | null;
  is_primary: boolean;
  is_stronger: boolean;
  bullish_evidence: string[];
  caution_evidence: string[];
}

interface DroppedTicker {
  ticker: string;
  prev_score: number;
}

type AlertStateFilter = "ALL" | "TRIGGERED" | "READY" | "ARMED" | "WATCH";
type StateFilter = "ALL" | "BULLISH_BOS" | "BULLISH_CHOCH" | "EARLY_EXPANSION" | "COMPRESSION" | "HIGHER_LOW_FORMATION" | "SUSTAINED_MARKUP" | "DEMAND_INCREASING" | "ACCUMULATION" | "SELLING_EXHAUSTION" | "EXTENDED";
type SortField =
  | "overall_score" | "se_score" | "accum_score" | "choch_score" | "bos_score"
  | "compression_score" | "hl_score" | "rs_score" | "volume_score"
  | "state" | "alert_state" | "ticker" | "price" | "sector" | "streak" | "delta";

// ── Helpers ──

function stateBadge(state: string): { label: string; color: string } {
  switch (state) {
    case "SUSTAINED_MARKUP":
      return { label: "Markup", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "EARLY_EXPANSION":
      return { label: "Early Exp.", color: "text-green-400 bg-green-500/10 border-green-500/30" };
    case "BULLISH_BOS":
      return { label: "BOS", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
    case "COMPRESSION":
      return { label: "Compress", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" };
    case "HIGHER_LOW_FORMATION":
      return { label: "HL Form.", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30" };
    case "BULLISH_CHOCH":
      return { label: "ChoCH", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" };
    case "DEMAND_INCREASING":
      return { label: "Demand+", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    case "ACCUMULATION":
      return { label: "Accum.", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" };
    case "SELLING_EXHAUSTION":
      return { label: "Seller Exh.", color: "text-orange-400 bg-orange-500/10 border-orange-500/30" };
    case "EXTENDED":
      return { label: "Extended", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" };
    default:
      return { label: state, color: "text-red-400 bg-red-500/10 border-red-500/30" };
  }
}

function alertBadge(alert: string): { label: string; color: string } {
  switch (alert) {
    case "TRIGGERED":
      return { label: "Triggered", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "READY":
      return { label: "Ready", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
    case "ARMED":
      return { label: "Armed", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" };
    case "WATCH":
      return { label: "Watch", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    case "INVALIDATED":
      return { label: "Invalid", color: "text-red-400 bg-red-500/10 border-red-500/30" };
    default:
      return { label: alert, color: "text-[#666] bg-[#1a1a1a] border-[#2a2a2a]" };
  }
}

function alertFilterLabel(f: AlertStateFilter): string {
  switch (f) {
    case "ALL": return "All";
    case "TRIGGERED": return "Triggered";
    case "READY": return "Ready";
    case "ARMED": return "Armed";
    case "WATCH": return "Watch";
  }
}


function quadrantBadge(quadrant: string): { label: string; color: string } | null {
  switch (quadrant) {
    case "LEADING":
      return { label: "LD", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "IMPROVING":
      return { label: "IM", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
    case "WEAKENING":
      return { label: "WK", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    case "LAGGING":
      return { label: "LG", color: "text-red-400 bg-red-500/10 border-red-500/30" };
    default:
      return null;
  }
}

function instBadgeColor(classification: string): string {
  const green = ["STRONG_LEADER", "ACCUMULATION_SETUP", "BREAKOUT_SETUP", "MOMENTUM_LEADER", "WATCHLIST_LEADER"];
  const red = ["AVOID", "DISTRIBUTION", "BREAKDOWN"];
  if (green.some((g) => classification.includes(g))) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (red.some((r) => classification.includes(r))) return "text-red-400 bg-red-500/10 border-red-500/30";
  return "text-amber-400 bg-amber-500/10 border-amber-500/30";
}

function scoreBarColor(score: number): string {
  if (score >= 55) return "bg-emerald-500";
  if (score >= 40) return "bg-cyan-500";
  if (score >= 25) return "bg-amber-500";
  return "bg-red-500";
}

function scoreTextColor(score: number): string {
  if (score >= 55) return "text-emerald-400";
  if (score >= 40) return "text-cyan-400";
  if (score >= 25) return "text-amber-400";
  return "text-red-400";
}

const STATE_ORDER: Record<string, number> = {
  SUSTAINED_MARKUP: 0,
  EARLY_EXPANSION: 1,
  BULLISH_BOS: 2,
  COMPRESSION: 3,
  HIGHER_LOW_FORMATION: 4,
  BULLISH_CHOCH: 5,
  DEMAND_INCREASING: 6,
  ACCUMULATION: 7,
  SELLING_EXHAUSTION: 8,
  EXTENDED: 9,
  MARKDOWN: 10,
};

const ALERT_ORDER: Record<string, number> = {
  TRIGGERED: 0,
  READY: 1,
  ARMED: 2,
  WATCH: 3,
  INVALIDATED: 4,
};

// ── Inline Score Bar ──

function MiniScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1.5 bg-[#0f0f0f] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${scoreBarColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-[10px] font-medium tabular-nums ${scoreTextColor(score)}`}>{score}</span>
    </div>
  );
}

// ── CSV Export ──

function exportCSV(results: TransitionDailyRow[], date: string, streaks: Record<string, number>, deltas: Record<string, number>) {
  const headers = [
    "Ticker", "Company", "Sector", "Price", "Score", "Delta", "Streak",
    "SE", "Accum", "ChoCH", "BOS", "Compress", "HL", "RS", "VP",
    "State", "Alert", "Trigger", "Invalidation",
    "Primary Signal", "Stronger Signal",
    "Bullish Evidence", "Caution Evidence",
  ];
  const rows = results.map((r) => [
    r.ticker,
    `"${(r.company_name ?? "").replace(/"/g, '""')}"`,
    r.sector ?? "",
    r.price,
    r.overall_score,
    deltas[r.ticker] ?? "",
    streaks[r.ticker] ?? 1,
    r.se_score,
    r.accum_score,
    r.choch_score,
    r.bos_score,
    r.compression_score,
    r.hl_score,
    r.rs_score,
    r.volume_score,
    r.state,
    r.alert_state,
    r.trigger_level ?? "",
    r.invalidation ?? "",
    r.is_primary,
    r.is_stronger,
    `"${(r.bullish_evidence ?? []).join("; ").replace(/"/g, '""')}"`,
    `"${(r.caution_evidence ?? []).join("; ").replace(/"/g, '""')}"`,
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transition-daily-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Expanded Row Detail ──

function ExpandedEvidence({ row }: { row: TransitionDailyRow }) {
  const bullish = row.bullish_evidence ?? [];
  const caution = row.caution_evidence ?? [];

  return (
    <tr>
      <td colSpan={19} className="px-3 py-3 bg-[#111]">
        <div className="flex flex-wrap gap-4">
          {/* Trigger & Invalidation levels */}
          <div className="shrink-0">
            <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1">Trigger Level</p>
            <p className="text-xs font-medium text-white">
              {row.trigger_level != null ? `$${fmtNum(row.trigger_level, 2)}` : "-"}
            </p>
          </div>
          <div className="shrink-0">
            <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1">Invalidation</p>
            <p className="text-xs font-medium text-white">
              {row.invalidation != null ? `$${fmtNum(row.invalidation, 2)}` : "-"}
            </p>
          </div>
          {row.trigger_level != null && row.invalidation != null && row.price > row.invalidation && (
            <div className="shrink-0">
              <p className="text-[9px] uppercase tracking-wider text-[#555] mb-1">Risk/Reward</p>
              <p className="text-xs font-medium text-white">
                {`1:${fmtNum((row.trigger_level - row.price) / (row.price - row.invalidation), 1)}R`}
              </p>
            </div>
          )}
          {bullish.length > 0 && (
            <div className="flex-1 min-w-[200px]">
              <p className="text-[9px] uppercase tracking-wider text-emerald-500/60 mb-1.5">Bullish Evidence</p>
              <div className="flex flex-wrap gap-1">
                {bullish.map((ev, i) => (
                  <span key={i} className="rounded px-1.5 py-0.5 text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {ev}
                  </span>
                ))}
              </div>
            </div>
          )}
          {caution.length > 0 && (
            <div className="flex-1 min-w-[200px]">
              <p className="text-[9px] uppercase tracking-wider text-amber-500/60 mb-1.5">Caution</p>
              <div className="flex flex-wrap gap-1">
                {caution.map((ev, i) => (
                  <span key={i} className="rounded px-1.5 py-0.5 text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {ev}
                  </span>
                ))}
              </div>
            </div>
          )}
          {bullish.length === 0 && caution.length === 0 && (
            <p className="text-[10px] text-[#555]">No evidence details available.</p>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Sortable Column Header ──

function SortHeader({
  field,
  label,
  currentSort,
  sortAsc,
  onSort,
  className,
}: {
  field: SortField;
  label: string;
  currentSort: SortField;
  sortAsc: boolean;
  onSort: (f: SortField) => void;
  className?: string;
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
        {active && (
          <span className="text-[8px]">{sortAsc ? "\u25B2" : "\u25BC"}</span>
        )}
      </span>
    </th>
  );
}

// ── Main Page ──

export default function TransitionDailyPage() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [results, setResults] = useState<TransitionDailyRow[]>([]);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [dropped, setDropped] = useState<DroppedTicker[]>([]);
  const [inflectionTickers, setInflectionTickers] = useState<Map<string, { trade_read: string; score: number }>>(new Map());
  const [sectorQuadrants, setSectorQuadrants] = useState<Map<string, string>>(new Map());
  const [instTickers, setInstTickers] = useState<Map<string, { classification: string; score: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [alertFilter, setAlertFilter] = useState<AlertStateFilter>("ALL");
  const [stateFilter, setStateFilter] = useState<StateFilter>("ALL");
  const [minScore, setMinScore] = useState(0);
  const [tickerSearch, setTickerSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("overall_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [showDropped, setShowDropped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highConvictionOnly, setHighConvictionOnly] = useState(false);
  const [enrichmentMap, setEnrichmentMap] = useState<Map<string, { phase: string; rsAccel: number | null; category: string; volRatio: number; conviction: string; sectorQuadrant: string }>>(new Map());
  const [quadrantFilter, setQuadrantFilter] = useState<string>("ALL");
  const [phaseFilter, setPhaseFilter] = useState<string>("ALL");
  const [rsAccelFilter, setRsAccelFilter] = useState<string>("ALL");
  const [volumeFilter, setVolumeFilter] = useState<string>("ALL");

  // Load available dates on mount
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/transition/daily?dates=true");
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

  // Load results + cross-scanner enrichment when date changes
  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;

    async function load() {
      setLoadingResults(true);
      try {
        const [transRes, infRes, sectorRes, instRes] = await Promise.all([
          fetch(`/api/transition/daily?date=${selectedDate}`),
          fetch(`/api/inflection/daily?date=${selectedDate}`).catch(() => null),
          fetch("/api/sector-rotation").catch(() => null),
          fetch(`/api/institutional/daily?date=${selectedDate}`).catch(() => null),
        ]);
        const json = await transRes.json();
        if (!cancelled) {
          setResults(json.results ?? []);
          setStreaks(json.streaks ?? {});
          setDeltas(json.deltas ?? {});
          setDropped(json.dropped ?? []);
          setExpandedTicker(null);
        }
        // Build inflection ticker map
        if (infRes && infRes.ok) {
          const infJson = await infRes.json();
          const map = new Map<string, { trade_read: string; score: number }>();
          for (const r of infJson.results ?? []) {
            map.set(r.ticker, { trade_read: r.trade_read, score: r.overall_score });
          }
          if (!cancelled) setInflectionTickers(map);
        } else {
          if (!cancelled) setInflectionTickers(new Map());
        }
        // Build sector quadrant map
        if (sectorRes && sectorRes.ok) {
          const sectorJson = await sectorRes.json();
          const map = new Map<string, string>();
          for (const s of [...(sectorJson.sectors ?? []), ...(sectorJson.subSectorScores ?? [])]) {
            map.set(s.sector, s.quadrant);
          }
          if (!cancelled) setSectorQuadrants(map);
          // Build enrichment map from enrichedStocks.passed
          const eMap = new Map<string, { phase: string; rsAccel: number | null; category: string; volRatio: number; conviction: string; sectorQuadrant: string }>();
          for (const s of sectorJson.enrichedStocks?.passed ?? []) {
            eMap.set(s.symbol, {
              phase: s.phase,
              rsAccel: s.rsAccel ?? null,
              category: s.category,
              volRatio: s.volRatio,
              conviction: s.conviction,
              sectorQuadrant: s.sectorQuadrant,
            });
          }
          if (!cancelled) setEnrichmentMap(eMap);
        } else {
          if (!cancelled) setSectorQuadrants(new Map());
          if (!cancelled) setEnrichmentMap(new Map());
        }
        // Build institutional ticker map
        if (instRes && instRes.ok) {
          const instJson = await instRes.json();
          const map = new Map<string, { classification: string; score: number }>();
          for (const r of instJson.results ?? []) {
            map.set(r.ticker, { classification: r.classification, score: r.composite_score });
          }
          if (!cancelled) setInstTickers(map);
        } else {
          if (!cancelled) setInstTickers(new Map());
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setStreaks({});
          setDeltas({});
          setDropped([]);
          setInflectionTickers(new Map());
          setSectorQuadrants(new Map());
          setInstTickers(new Map());
          setEnrichmentMap(new Map());
        }
      } finally {
        if (!cancelled) setLoadingResults(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedDate]);

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

  // High conviction tickers: on BOTH scanners with favorable conditions
  const highConvictionTickers = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) {
      if (r.alert_state !== "ARMED" && r.alert_state !== "READY" && r.alert_state !== "TRIGGERED") continue;
      const inf = inflectionTickers.get(r.ticker);
      if (!inf) continue;
      if (inf.trade_read !== "STARTER_POSITION_CANDIDATE" && inf.trade_read !== "ADD_ON_CONFIRMATION") continue;
      // Sector quadrant check (optional: if available, require IMPROVING or LEADING)
      const q = sectorQuadrants.get(r.sector ?? "");
      if (q && q !== "IMPROVING" && q !== "LEADING") continue;
      set.add(r.ticker);
    }
    return set;
  }, [results, inflectionTickers, sectorQuadrants]);

  // Filter and sort results
  const filtered = useMemo(() => {
    let rows = results;

    if (highConvictionOnly) {
      rows = rows.filter((r) => highConvictionTickers.has(r.ticker));
    }
    if (alertFilter !== "ALL") {
      rows = rows.filter((r) => r.alert_state === alertFilter);
    }
    if (stateFilter !== "ALL") {
      rows = rows.filter((r) => r.state === stateFilter);
    }
    if (minScore > 0) {
      rows = rows.filter((r) => r.overall_score >= minScore);
    }
    if (tickerSearch.trim()) {
      const q = tickerSearch.trim().toUpperCase();
      rows = rows.filter(
        (r) => r.ticker.includes(q) || (r.company_name ?? "").toUpperCase().includes(q) || (r.sector ?? "").toUpperCase().includes(q)
      );
    }
    if (quadrantFilter !== "ALL") {
      rows = rows.filter((r) => enrichmentMap.get(r.ticker)?.sectorQuadrant === quadrantFilter);
    }
    if (phaseFilter !== "ALL") {
      rows = rows.filter((r) => enrichmentMap.get(r.ticker)?.phase === phaseFilter);
    }
    if (rsAccelFilter !== "ALL") {
      rows = rows.filter((r) => {
        const v = enrichmentMap.get(r.ticker)?.rsAccel;
        if (v == null) return false;
        switch (rsAccelFilter) {
          case "STRONG": return v >= 4.5;
          case "MODERATE": return v >= 1.5 && v < 4.5;
          case "NEUTRAL": return v >= -1.5 && v < 1.5;
          case "DECEL": return v < -1.5;
          default: return true;
        }
      });
    }
    if (volumeFilter !== "ALL") {
      rows = rows.filter((r) => {
        const v = enrichmentMap.get(r.ticker)?.volRatio;
        if (v == null) return false;
        switch (volumeFilter) {
          case "HIGH": return v >= 1.5;
          case "ABOVE_AVG": return v >= 1.2 && v < 1.5;
          case "NORMAL": return v >= 1.0 && v < 1.2;
          case "LOW": return v < 1.0;
          default: return true;
        }
      });
    }

    const sorted = [...rows].sort((a, b) => {
      let cmp: number;
      if (sortField === "state") {
        cmp = (STATE_ORDER[a.state] ?? 99) - (STATE_ORDER[b.state] ?? 99);
      } else if (sortField === "alert_state") {
        cmp = (ALERT_ORDER[a.alert_state] ?? 99) - (ALERT_ORDER[b.alert_state] ?? 99);
      } else if (sortField === "ticker") {
        cmp = a.ticker.localeCompare(b.ticker);
      } else if (sortField === "sector") {
        cmp = (a.sector ?? "").localeCompare(b.sector ?? "");
      } else if (sortField === "price") {
        cmp = Number(b.price) - Number(a.price);
      } else if (sortField === "streak") {
        cmp = (streaks[b.ticker] ?? 1) - (streaks[a.ticker] ?? 1);
      } else if (sortField === "delta") {
        cmp = (deltas[b.ticker] ?? 0) - (deltas[a.ticker] ?? 0);
      } else {
        cmp = (b[sortField] ?? 0) - (a[sortField] ?? 0);
      }
      return sortAsc ? -cmp : cmp;
    });

    return sorted;
  }, [results, highConvictionOnly, highConvictionTickers, alertFilter, stateFilter, minScore, tickerSearch, sortField, sortAsc, streaks, deltas, enrichmentMap, quadrantFilter, phaseFilter, rsAccelFilter, volumeFilter]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(filtered.map((r) => r.ticker).join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [filtered]);

  // Top picks: TRIGGERED + READY sorted by score, capped at 10
  const topPicks = useMemo(() => {
    return results
      .filter((r) => r.alert_state === "TRIGGERED" || r.alert_state === "READY")
      .sort((a, b) => {
        // TRIGGERED first, then READY; within same alert, by score desc
        if (a.alert_state !== b.alert_state) {
          return a.alert_state === "TRIGGERED" ? -1 : 1;
        }
        return b.overall_score - a.overall_score;
      })
      .slice(0, 10);
  }, [results]);

  // Summary counts
  const triggeredCount = results.filter((r) => r.alert_state === "TRIGGERED").length;
  const readyCount = results.filter((r) => r.alert_state === "READY").length;
  const armedCount = results.filter((r) => r.alert_state === "ARMED").length;
  const watchCount = results.filter((r) => r.alert_state === "WATCH").length;
  const newTodayCount = Object.values(streaks).filter((s) => s === 1).length;

  // Sector summary
  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of results) {
      const s = r.sector || "Other";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [results]);

  // State distribution
  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r.state] = (counts[r.state] ?? 0) + 1;
    }
    return counts;
  }, [results]);

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
        <h1 className="text-2xl font-bold text-white mb-4">Transition Daily Results</h1>
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center">
          <p className="text-[#a0a0a0] mb-2">No scan data available yet.</p>
          <p className="text-[#666] text-sm">
            The daily transition scan runs at 9:55 PM ET Mon-Fri. Results will appear here after the first run.
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
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Transition Daily Results</h1>
          <p className="text-xs text-[#666] mt-1">
            Market structure transitions: accumulation &rarr; markup | S&P 500 + Nasdaq-100 | 14-day rolling history
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

      {/* Top Picks Banner */}
      {!loadingResults && topPicks.length > 0 && (
        <div className="mb-5 rounded-lg border border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.05] to-cyan-500/[0.05] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Top Picks</h2>
            <span className="text-[10px] text-[#666]">Triggered + Ready, sorted by score</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {topPicks.map((r) => {
              const aBadge = alertBadge(r.alert_state);
              const sBadge = stateBadge(r.state);
              const streak = streaks[r.ticker] ?? 1;
              const isNew = streak === 1;
              return (
                <button
                  key={r.ticker}
                  onClick={() => {
                    setExpandedTicker(r.ticker);
                    // Scroll to table
                    document.querySelector(`[data-ticker="${r.ticker}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className="rounded-lg border border-[#2a2a2a] bg-[#111] p-2.5 text-left hover:border-emerald-500/30 hover:bg-[#161616] transition-colors"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-white">{r.ticker}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${aBadge.color}`}>
                      {aBadge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="flex-1 h-1.5 bg-[#0f0f0f] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${scoreBarColor(r.overall_score)}`}
                        style={{ width: `${r.overall_score}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-bold tabular-nums ${scoreTextColor(r.overall_score)}`}>
                      {r.overall_score}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${sBadge.color}`}>
                      {sBadge.label}
                    </span>
                    <div className="flex items-center gap-1">
                      {inflectionTickers.has(r.ticker) && (
                        <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1 py-0.5 text-[8px] font-bold text-sky-400">INF</span>
                      )}
                      {isNew && (
                        <span className="text-[8px] font-bold text-green-400">NEW</span>
                      )}
                      {r.trigger_level != null && (
                        <span className="text-[9px] text-[#666] tabular-nums">${fmtNum(r.trigger_level, 0)}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap mb-4 text-xs">
        <span className="text-[#a0a0a0]">
          <strong className="text-white">{results.length}</strong> stocks
        </span>
        <span className="text-[#333]">|</span>
        <span className="text-emerald-400">
          <strong>{triggeredCount}</strong> Triggered
        </span>
        <span className="text-cyan-400">
          <strong>{readyCount}</strong> Ready
        </span>
        <span className="text-purple-400">
          <strong>{armedCount}</strong> Armed
        </span>
        <span className="text-amber-400">
          <strong>{watchCount}</strong> Watch
        </span>
        {newTodayCount > 0 && (
          <>
            <span className="text-[#333]">|</span>
            <span className="text-green-400">
              <Sparkles className="h-3 w-3 inline mr-0.5" />
              <strong>{newTodayCount}</strong> new
            </span>
          </>
        )}
        {dropped.length > 0 && (
          <>
            <span className="text-[#333]">|</span>
            <button
              onClick={() => setShowDropped(!showDropped)}
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              <TrendingDown className="h-3 w-3 inline mr-0.5" />
              <strong>{dropped.length}</strong> dropped
            </button>
          </>
        )}
        {filtered.length !== results.length && (
          <>
            <span className="text-[#333]">|</span>
            <span className="text-[#a0a0a0]">
              Showing <strong className="text-white">{filtered.length}</strong>
            </span>
          </>
        )}
      </div>

      {/* State distribution mini-bar */}
      {!loadingResults && results.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          <span className="text-[10px] text-[#555] mr-1">States:</span>
          {Object.entries(stateCounts)
            .sort((a, b) => (STATE_ORDER[a[0]] ?? 99) - (STATE_ORDER[b[0]] ?? 99))
            .map(([state, count]) => {
              const badge = stateBadge(state);
              return (
                <button
                  key={state}
                  onClick={() => setStateFilter(state === stateFilter ? "ALL" : state as StateFilter)}
                  className={`rounded border px-2 py-0.5 text-[10px] transition-colors ${
                    stateFilter === state
                      ? badge.color
                      : "border-[#2a2a2a] bg-[#141414] text-[#a0a0a0] hover:text-white hover:border-[#444]"
                  }`}
                >
                  {badge.label} <strong className="text-white">{count}</strong>
                </button>
              );
            })}
        </div>
      )}

      {/* Dropped today section */}
      {showDropped && dropped.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/[0.03] p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider text-red-400/60 font-semibold">
              Dropped from previous day ({dropped.length})
            </p>
            <button onClick={() => setShowDropped(false)} className="text-[10px] text-[#666] hover:text-white">
              Hide
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {dropped.map((d) => (
              <span
                key={d.ticker}
                className="inline-flex items-center gap-1 rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400"
              >
                {d.ticker}
                <span className="text-red-500/50">{d.prev_score}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sector summary pills */}
      {sectorCounts.length > 0 && !loadingResults && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          <span className="text-[10px] text-[#555] mr-1">Sectors:</span>
          {sectorCounts.slice(0, 8).map(([sector, count]) => (
            <button
              key={sector}
              onClick={() => setTickerSearch(sector)}
              className="rounded border border-[#2a2a2a] bg-[#141414] px-2 py-0.5 text-[10px] text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
            >
              {sector} <strong className="text-white">{count}</strong>
            </button>
          ))}
          {sectorCounts.length > 8 && (
            <span className="text-[10px] text-[#555]">+{sectorCounts.length - 8} more</span>
          )}
        </div>
      )}

      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        {/* Ticker search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#555]" />
          <input
            type="text"
            value={tickerSearch}
            onChange={(e) => setTickerSearch(e.target.value)}
            placeholder="Ticker / sector..."
            className="w-40 rounded border border-[#333] bg-[#1a1a1a] pl-7 pr-2 py-1 text-xs text-white placeholder-[#555] focus:border-[#555] focus:outline-none"
          />
        </div>

        {/* Min score */}
        <select
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value))}
          className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#a0a0a0] focus:outline-none"
        >
          <option value={0}>All Scores</option>
          <option value={30}>30+</option>
          <option value={40}>40+</option>
          <option value={50}>50+</option>
          <option value={60}>60+</option>
        </select>

        <span className="text-[#333]">|</span>

        {/* Alert state filter */}
        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-[#555]" />
          {(["ALL", "TRIGGERED", "READY", "ARMED", "WATCH"] as AlertStateFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setAlertFilter(f)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                alertFilter === f
                  ? "bg-white/10 text-white border border-white/20"
                  : "text-[#666] hover:text-white"
              }`}
            >
              {alertFilterLabel(f)}
            </button>
          ))}
        </div>

        {/* High Conviction toggle + Copy + CSV export */}
        <div className="ml-auto flex items-center gap-2">
          {highConvictionTickers.size > 0 && (
            <button
              onClick={() => setHighConvictionOnly((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-colors ${
                highConvictionOnly
                  ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                  : "bg-[#1a1a1a] text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] border-[#2a2a2a]"
              }`}
            >
              <Target className="h-3 w-3" />
              High Conviction ({highConvictionTickers.size})
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#1a1a1a] text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] border border-[#2a2a2a] transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => exportCSV(filtered, selectedDate ?? "", streaks, deltas)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#1a1a1a] text-[#a0a0a0] hover:text-white hover:bg-[#2a2a2a] border border-[#2a2a2a] transition-colors"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
        </div>
      </div>

      {/* Enrichment filters row */}
      {enrichmentMap.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <select
            value={quadrantFilter}
            onChange={(e) => setQuadrantFilter(e.target.value)}
            className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#a0a0a0] focus:outline-none"
          >
            <option value="ALL">RRG Quadrant</option>
            <option value="LEADING">Leading</option>
            <option value="IMPROVING">Improving</option>
            <option value="WEAKENING">Weakening</option>
            <option value="LAGGING">Lagging</option>
          </select>
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#a0a0a0] focus:outline-none"
          >
            <option value="ALL">Phase</option>
            <option value="P1">P1 Basing</option>
            <option value="P2">P2 Turnaround</option>
            <option value="P3">P3 Trending</option>
            <option value="P4">P4 Exhausting</option>
          </select>
          <select
            value={rsAccelFilter}
            onChange={(e) => setRsAccelFilter(e.target.value)}
            className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#a0a0a0] focus:outline-none"
          >
            <option value="ALL">RS Accel</option>
            <option value="STRONG">Strong (&ge;4.5)</option>
            <option value="MODERATE">Moderate (&ge;1.5)</option>
            <option value="NEUTRAL">Neutral</option>
            <option value="DECEL">Decelerating</option>
          </select>
          <select
            value={volumeFilter}
            onChange={(e) => setVolumeFilter(e.target.value)}
            className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-1 text-xs text-[#a0a0a0] focus:outline-none"
          >
            <option value="ALL">Volume</option>
            <option value="HIGH">High (&ge;1.5x)</option>
            <option value="ABOVE_AVG">Above Avg (&ge;1.2x)</option>
            <option value="NORMAL">Normal (&ge;1.0x)</option>
            <option value="LOW">Low (&lt;1.0x)</option>
          </select>
          <span className="ml-auto text-[10px] text-[#555]">
            Enriched: <strong className="text-[#a0a0a0]">{results.filter((r) => enrichmentMap.has(r.ticker)).length}</strong>/{results.length}
          </span>
        </div>
      )}

      {/* Loading state */}
      {loadingResults && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#666]" />
        </div>
      )}

      {/* Empty state */}
      {!loadingResults && filtered.length === 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center">
          <p className="text-[#a0a0a0]">No results match the current filters.</p>
        </div>
      )}

      {/* Table */}
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
                  <SortHeader field="overall_score" label="Score" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="delta" label="+/-" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="streak" label="Days" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="se_score" label="SE" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="accum_score" label="Acc" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="choch_score" label="ChCH" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="bos_score" label="BOS" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="compression_score" label="Cmp" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="hl_score" label="HL" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="rs_score" label="RS" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="volume_score" label="VP" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="state" label="State" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortHeader field="alert_state" label="Alert" currentSort={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#666]">Flags</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const streak = streaks[row.ticker] ?? 1;
                  const delta = deltas[row.ticker];
                  const isNew = streak === 1;
                  const isExpanded = expandedTicker === row.ticker;
                  const sBadge = stateBadge(row.state);
                  const aBadge = alertBadge(row.alert_state);

                  return (
                    <Fragment key={row.ticker}>
                      <tr
                        data-ticker={row.ticker}
                        onClick={() => setExpandedTicker(isExpanded ? null : row.ticker)}
                        className={`border-b border-[#1a1a1a] cursor-pointer transition-colors ${
                          isExpanded ? "bg-[#161616]" : "hover:bg-[#141414]"
                        } ${isNew ? "bg-green-500/[0.03]" : ""}`}
                      >
                        {/* Expand indicator */}
                        <td className="px-2 py-2 text-[#444]">
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </td>

                        {/* Ticker */}
                        <td className="px-2 py-2 font-bold text-white whitespace-nowrap">
                          {row.ticker}
                        </td>

                        {/* Company */}
                        <td className="px-2 py-2 text-[#a0a0a0] max-w-[140px] truncate">
                          {row.company_name}
                        </td>

                        {/* Sector */}
                        <td className="px-2 py-2 text-[10px] whitespace-nowrap">
                          <span className="text-[#777]">{row.sector || "-"}</span>
                          {(() => {
                            const qb = quadrantBadge(sectorQuadrants.get(row.sector ?? "") ?? "");
                            return qb ? (
                              <span className={`ml-1 inline-flex items-center rounded border px-1 py-0 text-[7px] font-bold ${qb.color}`}>
                                {qb.label}
                              </span>
                            ) : null;
                          })()}
                        </td>

                        {/* Price */}
                        <td className="px-2 py-2 text-white tabular-nums whitespace-nowrap">
                          ${fmtNum(row.price, 2)}
                        </td>

                        {/* Overall Score */}
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-2 bg-[#0f0f0f] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${scoreBarColor(row.overall_score)}`}
                                style={{ width: `${row.overall_score}%` }}
                              />
                            </div>
                            <span className={`text-[11px] font-bold tabular-nums ${scoreTextColor(row.overall_score)}`}>
                              {row.overall_score}
                            </span>
                          </div>
                        </td>

                        {/* Delta */}
                        <td className="px-2 py-2 tabular-nums whitespace-nowrap">
                          {delta !== undefined ? (
                            <span className={`text-[10px] font-medium ${
                              delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-[#555]"
                            }`}>
                              {delta > 0 ? "+" : ""}{delta}
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#333]">-</span>
                          )}
                        </td>

                        {/* Streak */}
                        <td className="px-2 py-2">
                          <span className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[9px] font-bold tabular-nums min-w-[24px] ${streakColor(streak)}`}>
                            {streak}d
                          </span>
                        </td>

                        {/* Sub-scores */}
                        <td className="px-2 py-2"><MiniScoreBar score={row.se_score} /></td>
                        <td className="px-2 py-2"><MiniScoreBar score={row.accum_score} /></td>
                        <td className="px-2 py-2"><MiniScoreBar score={row.choch_score} /></td>
                        <td className="px-2 py-2"><MiniScoreBar score={row.bos_score} /></td>
                        <td className="px-2 py-2"><MiniScoreBar score={row.compression_score} /></td>
                        <td className="px-2 py-2"><MiniScoreBar score={row.hl_score} /></td>
                        <td className="px-2 py-2"><MiniScoreBar score={row.rs_score} /></td>
                        <td className="px-2 py-2"><MiniScoreBar score={row.volume_score} /></td>

                        {/* State */}
                        <td className="px-2 py-2">
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide whitespace-nowrap ${sBadge.color}`}>
                            {sBadge.label}
                          </span>
                        </td>

                        {/* Alert State */}
                        <td className="px-2 py-2">
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide whitespace-nowrap ${aBadge.color}`}>
                            {aBadge.label}
                          </span>
                        </td>

                        {/* Flags */}
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            {row.is_primary && (
                              <span title="Primary Signal" className="inline-flex items-center rounded border border-purple-500/30 bg-purple-500/10 px-1 py-0.5 text-[8px] font-semibold text-purple-400">
                                <Zap className="h-2.5 w-2.5" />
                              </span>
                            )}
                            {row.is_stronger && (
                              <span title="Stronger Signal" className="inline-flex items-center rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5 text-[8px] font-semibold text-emerald-400">
                                <Shield className="h-2.5 w-2.5" />
                              </span>
                            )}
                            {isNew && (
                              <span title="New Today" className="inline-flex items-center rounded border border-green-500/30 bg-green-500/10 px-1 py-0.5 text-[8px] font-bold text-green-400">
                                NEW
                              </span>
                            )}
                            {inflectionTickers.has(row.ticker) && (
                              <Link
                                href="/prerun/inflection-daily"
                                title={`Also on Inflection: ${inflectionTickers.get(row.ticker)!.trade_read} (${inflectionTickers.get(row.ticker)!.score})`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center rounded border border-sky-500/30 bg-sky-500/10 px-1 py-0.5 text-[8px] font-bold text-sky-400 hover:bg-sky-500/20 transition-colors"
                              >
                                INF
                              </Link>
                            )}
                            {instTickers.has(row.ticker) && (
                              <Link
                                href="/prerun/institutional-daily"
                                title={`Institutional: ${instTickers.get(row.ticker)!.classification} (${instTickers.get(row.ticker)!.score})`}
                                onClick={(e) => e.stopPropagation()}
                                className={`inline-flex items-center rounded border px-1 py-0.5 text-[8px] font-bold hover:opacity-80 transition-colors ${instBadgeColor(instTickers.get(row.ticker)!.classification)}`}
                              >
                                INST
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded evidence */}
                      {isExpanded && <ExpandedEvidence row={row} />}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </TableErrorBoundary>
      )}

      {/* Footer */}
      <div className="mt-6 text-center text-[10px] text-[#444]">
        Scan runs at 9:55 PM ET Tue-Sat | Universe: S&P 500 + Nasdaq-100 + Additional Members (~467 tickers) | 14-day retention
      </div>
    </div>
  );
}
