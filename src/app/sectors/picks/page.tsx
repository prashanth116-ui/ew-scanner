"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2,
  RefreshCw,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { compositeColor, compositeTextColor } from "@/lib/color-utils";

// ── Types ──

interface SectorData {
  etf: string;
  name: string;
  momentum_raw: number;
  acceleration: number;
  mansfield_rs: number;
  rs_ratio: number;
  rs_momentum: number;
  cmf: number;
  cmf_positive_days: number;
  breadth_pct: number | null;
  smart_money_pct: number | null;
  quadrant: "LEADING" | "WEAKENING" | "LAGGING" | "IMPROVING";
  ret_20d: number;
  stealth_accumulation: boolean;
  stealth_signals: number;
  flow_price_div: boolean;
  accel_inflection: boolean;
  breadth_div: boolean;
  composite: number | null;
  filter_reasons?: string[];
}

interface StockData {
  symbol: string;
  etf: string;
  sector_name: string;
  price: number;
  sma50: number;
  sma200: number;
  above_50ma: boolean;
  pct_from_50ma: number;
  pct_from_200ma: number;
  vol_5d: number;
  vol_20d: number;
  vol_ratio: number;
  ret_20d: number;
  etf_ret_20d: number;
  rs_accel: number;
  rs_accel_desc: string;
  market_cap: number | null;
  institutional_pct: number | null;
  short_name: string;
  sector_quadrant: string;
  sector_composite: number | null;
  sector_stealth: boolean;
  sector_acceleration: number;
  category: string;
  phase: string;
  conviction: string;
  conviction_signals: number;
  rejection_reasons?: string[];
}

interface ScanResult {
  scanDate: string;
  sectorsData: SectorData[];
  passedStocks: StockData[];
  rejectedStocks: StockData[];
  summary: {
    sectors_analyzed: number;
    interesting_sectors: number;
    stocks_enriched: number;
    stocks_passed: number;
    alerts_sent: number;
    scan_date: string;
  };
  calculatedAt: string;
}

type SortKey = "symbol" | "conviction" | "rs_accel" | "vol_ratio" | "institutional_pct" | "price" | "category" | "phase";
type SortDir = "asc" | "desc";

// ── Color helpers ──

function quadrantColor(q: string): string {
  switch (q) {
    case "LEADING": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "WEAKENING": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "LAGGING": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "IMPROVING": return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
    default: return "bg-[#2a2a2a] text-[#a0a0a0] border-[#333]";
  }
}

function convictionColor(c: string): string {
  switch (c) {
    case "HIGH": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "MEDIUM": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "WATCH": return "bg-[#2a2a2a] text-[#a0a0a0] border-[#333]";
    default: return "bg-[#2a2a2a] text-[#a0a0a0] border-[#333]";
  }
}

function categoryColor(c: string): string {
  switch (c) {
    case "LEADER": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "CATCH_UP": return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
    case "TURNAROUND": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    default: return "bg-[#2a2a2a] text-[#a0a0a0] border-[#333]";
  }
}

function rotationStatusLabel(dispersion: number): { label: string; color: string } {
  if (dispersion > 15) return { label: "High Rotation", color: "text-green-400" };
  if (dispersion > 8) return { label: "Moderate", color: "text-amber-400" };
  return { label: "Low Rotation", color: "text-[#a0a0a0]" };
}

// ── Data freshness ──

function timeAgo(isoDate: string): { text: string; stale: boolean; veryStale: boolean } {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let text: string;
  if (mins < 1) text = "just now";
  else if (mins < 60) text = `${mins}m ago`;
  else if (hours < 24) text = `${hours}h ago`;
  else text = `${days}d ago`;

  return { text, stale: hours >= 6, veryStale: hours >= 24 };
}

function DataAgeBadge({ calculatedAt }: { calculatedAt: string }) {
  const [age, setAge] = useState(() => timeAgo(calculatedAt));

  useEffect(() => {
    setAge(timeAgo(calculatedAt));
    const interval = setInterval(() => setAge(timeAgo(calculatedAt)), 60_000);
    return () => clearInterval(interval);
  }, [calculatedAt]);

  if (age.veryStale) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
        <AlertTriangle className="h-3 w-3" />
        {age.text} — data is stale
      </span>
    );
  }
  if (age.stale) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
        <Clock className="h-3 w-3" />
        {age.text}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[#888]">
      <Clock className="h-3 w-3" />
      {age.text}
    </span>
  );
}

// ── Conviction dots ──

function ConvictionDots({ signals, max = 7 }: { signals: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            i < signals ? "bg-green-400" : "bg-[#333]"
          }`}
        />
      ))}
    </span>
  );
}

// ── localStorage cache ──

const CACHE_KEY = "ew-rotation-picks-v1";
const CACHE_TTL = 4 * 60 * 60 * 1000;

function loadCached(): ScanResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as ScanResult;
  } catch {
    return null;
  }
}

function saveCache(data: ScanResult) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* ignore */ }
}

// ── Main page ──

export default function StockPicksPage() {
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("conviction");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
  const [showRejected, setShowRejected] = useState(false);

  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const cached = loadCached();
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rotation-picks");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const result: ScanResult = await res.json();
      setData(result);
      saveCache(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived data ──

  const sectors = data?.sectorsData ?? [];
  const passedStocks = data?.passedStocks ?? [];
  const rejectedStocks = data?.rejectedStocks ?? [];

  // Rotation metrics
  const rotationMetrics = useMemo(() => {
    if (sectors.length === 0) return { dispersion: 0, spread: 0, status: rotationStatusLabel(0) };
    const composites = sectors.map((s) => s.composite ?? 50);
    const max = Math.max(...composites);
    const min = Math.min(...composites);
    const mean = composites.reduce((a, b) => a + b, 0) / composites.length;
    const variance = composites.reduce((a, b) => a + (b - mean) ** 2, 0) / composites.length;
    const dispersion = Math.sqrt(variance);
    const spread = max - min;
    return { dispersion: Math.round(dispersion * 10) / 10, spread: Math.round(spread * 10) / 10, status: rotationStatusLabel(dispersion) };
  }, [sectors]);

  // Stealth accumulation sectors
  const stealthSectors = useMemo(() => sectors.filter((s) => s.stealth_accumulation), [sectors]);

  // Top 3 picks per sector
  const topPicksBySector = useMemo(() => {
    const map: Record<string, StockData[]> = {};
    for (const s of passedStocks) {
      if (!map[s.etf]) map[s.etf] = [];
      map[s.etf].push(s);
    }
    // Sort each sector by conviction then rs_accel
    const convOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, WATCH: 2 };
    for (const etf of Object.keys(map)) {
      map[etf].sort((a, b) => (convOrder[a.conviction] ?? 3) - (convOrder[b.conviction] ?? 3) || b.rs_accel - a.rs_accel);
      map[etf] = map[etf].slice(0, 3);
    }
    return map;
  }, [passedStocks]);

  // Sorted stocks
  const sortedStocks = useMemo(() => {
    const convOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, WATCH: 2 };
    const catOrder: Record<string, number> = { LEADER: 0, CATCH_UP: 1, TURNAROUND: 2, AVOID: 3 };
    const phaseOrder: Record<string, number> = { P1_BASING: 0, P2_TURNAROUND: 1, P3_TRENDING: 2, P4_EXHAUSTING: 3 };

    return [...passedStocks].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol": cmp = a.symbol.localeCompare(b.symbol); break;
        case "conviction": cmp = (convOrder[a.conviction] ?? 3) - (convOrder[b.conviction] ?? 3); break;
        case "rs_accel": cmp = a.rs_accel - b.rs_accel; break;
        case "vol_ratio": cmp = a.vol_ratio - b.vol_ratio; break;
        case "institutional_pct": cmp = (a.institutional_pct ?? 0) - (b.institutional_pct ?? 0); break;
        case "price": cmp = a.price - b.price; break;
        case "category": cmp = (catOrder[a.category] ?? 4) - (catOrder[b.category] ?? 4); break;
        case "phase": cmp = (phaseOrder[a.phase] ?? 4) - (phaseOrder[b.phase] ?? 4); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [passedStocks, sortKey, sortDir]);

  // Group by sector
  const stocksBySector = useMemo(() => {
    const map: Record<string, StockData[]> = {};
    for (const s of sortedStocks) {
      if (!map[s.etf]) map[s.etf] = [];
      map[s.etf].push(s);
    }
    return map;
  }, [sortedStocks]);

  // Cross-sector pairs
  const crossPairs = useMemo(() => {
    const find = (etf: string) => sectors.find((s) => s.etf === etf);
    const xly = find("XLY");
    const xlp = find("XLP");
    const xlk = find("XLK");
    const xlu = find("XLU");

    const ratio = (a?: SectorData, b?: SectorData) => {
      if (!a || !b) return null;
      const ca = a.composite ?? 50;
      const cb = b.composite ?? 50;
      return Math.round(((ca - cb) / (ca + cb || 1)) * 100);
    };

    return {
      xlyXlp: ratio(xly, xlp),
      xlkXlu: ratio(xlk, xlu),
    };
  }, [sectors]);

  // ── Sort handler ──

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortDir === "desc" ? <ChevronDown className="inline h-3 w-3" /> : <ChevronUp className="inline h-3 w-3" />;
  }

  // ── Toggle sector ──

  function toggleSector(etf: string) {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(etf)) next.delete(etf); else next.add(etf);
      return next;
    });
  }

  // ── Loading state ──

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#5ba3e6]" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-400" />
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => fetchData(true)}
            className="mt-4 rounded-md bg-[#1a1a1a] px-4 py-2 text-sm text-white hover:bg-[#222]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      {/* ── Panel 1: Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Stock Picks</h1>
          <p className="mt-1 text-sm text-[#888]">
            {data.summary.stocks_passed} picks from {data.summary.sectors_analyzed} sectors
            {" "}&middot;{" "}
            Scan: {data.scanDate}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DataAgeBadge calculatedAt={data.calculatedAt} />
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#333] bg-[#1a1a1a] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#222] hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Panel 2: Rotation Status ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
          <div className="text-xs uppercase tracking-wider text-[#666]">Dispersion Index</div>
          <div className="mt-1 text-2xl font-bold text-white">{rotationMetrics.dispersion}</div>
          <div className="mt-1 text-xs text-[#888]">Standard deviation of composite scores</div>
        </div>
        <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
          <div className="text-xs uppercase tracking-wider text-[#666]">Sector Spread</div>
          <div className="mt-1 text-2xl font-bold text-white">{rotationMetrics.spread}</div>
          <div className="mt-1 text-xs text-[#888]">Max - min composite score</div>
        </div>
        <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
          <div className="text-xs uppercase tracking-wider text-[#666]">Rotation Status</div>
          <div className={`mt-1 text-2xl font-bold ${rotationMetrics.status.color}`}>
            {rotationMetrics.status.label}
          </div>
          <div className="mt-1 text-xs text-[#888]">Based on dispersion index</div>
        </div>
      </div>

      {/* ── Panel 3: Sector Heatmap ── */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Sector Heatmap</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...sectors]
            .sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0))
            .map((s) => {
              const comp = s.composite ?? 0;
              return (
                <div
                  key={s.etf}
                  className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white">{s.etf}</span>
                      <span className="text-xs text-[#888]">{s.name}</span>
                    </div>
                    <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${quadrantColor(s.quadrant)}`}>
                      {s.quadrant}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-[#1a1a1a]">
                      <div
                        className={`h-1.5 rounded-full ${compositeColor(comp)}`}
                        style={{ width: `${comp}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono ${compositeTextColor(comp)}`}>
                      {comp.toFixed(0)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-[#888]">
                    <span>RS {s.rs_ratio.toFixed(1)}</span>
                    <span>CMF {s.cmf >= 0 ? "+" : ""}{s.cmf.toFixed(3)}</span>
                    <span>Breadth {s.breadth_pct != null ? `${s.breadth_pct.toFixed(0)}%` : "N/A"}</span>
                  </div>
                  {s.stealth_accumulation && (
                    <div className="mt-1 text-xs font-medium text-purple-400">
                      Stealth Accumulation ({s.stealth_signals}/3)
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* ── Panel 4: RRG Chart ── */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Relative Rotation Graph</h2>
        <div className="relative mx-auto" style={{ maxWidth: 600 }}>
          <svg viewBox="0 0 400 400" className="w-full" aria-label="RRG scatter chart">
            {/* Background quadrants */}
            <rect x="200" y="0" width="200" height="200" fill="rgba(74,222,128,0.05)" />
            <rect x="200" y="200" width="200" height="200" fill="rgba(251,191,36,0.05)" />
            <rect x="0" y="200" width="200" height="200" fill="rgba(248,113,113,0.05)" />
            <rect x="0" y="0" width="200" height="200" fill="rgba(34,211,238,0.05)" />

            {/* Axes */}
            <line x1="0" y1="200" x2="400" y2="200" stroke="#333" strokeWidth="1" />
            <line x1="200" y1="0" x2="200" y2="400" stroke="#333" strokeWidth="1" />

            {/* Quadrant labels */}
            <text x="300" y="20" textAnchor="middle" fill="#4ade80" fontSize="11" opacity="0.6">LEADING</text>
            <text x="300" y="390" textAnchor="middle" fill="#fbbf24" fontSize="11" opacity="0.6">WEAKENING</text>
            <text x="100" y="390" textAnchor="middle" fill="#f87171" fontSize="11" opacity="0.6">LAGGING</text>
            <text x="100" y="20" textAnchor="middle" fill="#22d3ee" fontSize="11" opacity="0.6">IMPROVING</text>

            {/* Axis labels */}
            <text x="395" y="215" textAnchor="end" fill="#666" fontSize="9">RS Ratio &rarr;</text>
            <text x="215" y="15" textAnchor="start" fill="#666" fontSize="9">RS Mom &uarr;</text>

            {/* Data points */}
            {sectors.map((s) => {
              // Scale: center at 100, range 95-105 maps to 0-400
              const range = 10; // +-5 from center
              const x = ((s.rs_ratio - (100 - range / 2)) / range) * 400;
              const y = 400 - ((s.rs_momentum - (100 - range / 2)) / range) * 400;
              const cx = Math.max(15, Math.min(385, x));
              const cy = Math.max(15, Math.min(385, y));
              const dotColor =
                s.quadrant === "LEADING" ? "#4ade80" :
                s.quadrant === "WEAKENING" ? "#fbbf24" :
                s.quadrant === "LAGGING" ? "#f87171" :
                "#22d3ee";
              return (
                <g key={s.etf}>
                  <circle cx={cx} cy={cy} r="6" fill={dotColor} opacity="0.8" />
                  <text
                    x={cx}
                    y={cy - 9}
                    textAnchor="middle"
                    fill="#ccc"
                    fontSize="9"
                    fontWeight="600"
                  >
                    {s.etf}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* ── Panel 5: Leading Indicators ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Stealth Accumulation */}
        <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Stealth Accumulation</h2>
          {stealthSectors.length === 0 ? (
            <p className="text-sm text-[#666]">No sectors showing stealth accumulation</p>
          ) : (
            <div className="space-y-2">
              {stealthSectors.map((s) => (
                <div key={s.etf} className="flex items-center justify-between rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2">
                  <div>
                    <span className="font-mono text-sm font-semibold text-white">{s.etf}</span>
                    <span className="ml-2 text-xs text-[#888]">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#888]">
                    {s.flow_price_div && <span className="text-purple-400">Flow Div</span>}
                    {s.breadth_div && <span className="text-purple-400">Breadth Div</span>}
                    {s.accel_inflection && <span className="text-purple-400">Accel Inflection</span>}
                    <span className="font-medium text-purple-400">{s.stealth_signals}/3</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 3 Picks per Sector */}
        <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Top Picks by Sector</h2>
          {Object.keys(topPicksBySector).length === 0 ? (
            <p className="text-sm text-[#666]">No stock picks available</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(topPicksBySector).map(([etf, stocks]) => {
                const sector = sectors.find((s) => s.etf === etf);
                return (
                  <div key={etf}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-white">{etf}</span>
                      <span className="text-xs text-[#888]">{sector?.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {stocks.map((s) => (
                        <span
                          key={s.symbol}
                          className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium ${convictionColor(s.conviction)}`}
                        >
                          <a
                            href={`https://finance.yahoo.com/quote/${s.symbol}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {s.symbol}
                          </a>
                          <span className="text-[10px] opacity-70">${s.price.toFixed(0)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Panel 6: Stock Table ── */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            All Stock Picks ({passedStocks.length})
          </h2>
          <CopyButton tickers={sortedStocks.map((s) => s.symbol)} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#2a2a2a] text-[#888]">
                {([
                  ["symbol", "Symbol"],
                  ["conviction", "Conviction"],
                  ["category", "Category"],
                  ["phase", "Phase"],
                  ["rs_accel", "RS Accel"],
                  ["vol_ratio", "Vol Ratio"],
                  ["institutional_pct", "Inst %"],
                  ["price", "Price"],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="cursor-pointer whitespace-nowrap px-2 py-2 font-medium hover:text-white"
                  >
                    {label} <SortIcon col={key} />
                  </th>
                ))}
                <th className="px-2 py-2 font-medium">Sector</th>
                <th className="px-2 py-2 font-medium">Signals</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stocksBySector).map(([etf, stocks]) => {
                const sector = sectors.find((s) => s.etf === etf);
                const isExpanded = expandedSectors.has(etf) || expandedSectors.size === 0;
                return (
                  <SectorGroup
                    key={etf}
                    etf={etf}
                    sectorName={sector?.name ?? etf}
                    quadrant={sector?.quadrant ?? "LAGGING"}
                    stocks={stocks}
                    isExpanded={isExpanded}
                    onToggle={() => toggleSector(etf)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Rejected stocks */}
        {rejectedStocks.length > 0 && (
          <div className="mt-4 border-t border-[#2a2a2a] pt-3">
            <button
              onClick={() => setShowRejected(!showRejected)}
              className="flex items-center gap-1.5 text-xs text-[#666] hover:text-[#a0a0a0]"
            >
              {showRejected ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {rejectedStocks.length} rejected stocks
            </button>
            {showRejected && (
              <div className="mt-2 space-y-1">
                {rejectedStocks.map((s) => (
                  <div key={s.symbol} className="flex items-center gap-3 rounded px-2 py-1 text-xs text-[#666]">
                    <span className="w-12 font-mono">{s.symbol}</span>
                    <span className="w-32 truncate">{s.sector_name}</span>
                    <span className="text-red-400/60">
                      {s.rejection_reasons?.join(", ") ?? "rejected"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Panel 7: Cross-Sector Pairs ── */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Cross-Sector Pairs</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <PairGauge
            label="XLY / XLP"
            description="Consumer Discretionary vs Staples"
            value={crossPairs.xlyXlp}
            leftLabel="Risk-Off"
            rightLabel="Risk-On"
          />
          <PairGauge
            label="XLK / XLU"
            description="Technology vs Utilities"
            value={crossPairs.xlkXlu}
            leftLabel="Defensive"
            rightLabel="Growth"
          />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function SectorGroup({
  etf,
  sectorName,
  quadrant,
  stocks,
  isExpanded,
  onToggle,
}: {
  etf: string;
  sectorName: string;
  quadrant: string;
  stocks: StockData[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-[#1a1a1a] bg-[#0f0f0f] hover:bg-[#1a1a1a]"
      >
        <td colSpan={10} className="px-2 py-2">
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="h-3 w-3 text-[#888]" /> : <ChevronUp className="h-3 w-3 text-[#888] rotate-90" />}
            <span className="font-mono text-xs font-semibold text-white">{etf}</span>
            <span className="text-xs text-[#888]">{sectorName}</span>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${quadrantColor(quadrant)}`}>
              {quadrant}
            </span>
            <span className="text-[10px] text-[#666]">{stocks.length} stocks</span>
          </div>
        </td>
      </tr>
      {isExpanded &&
        stocks.map((s) => (
          <tr key={s.symbol} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]/50">
            <td className="px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <a
                  href={`https://finance.yahoo.com/quote/${s.symbol}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono font-semibold text-[#5ba3e6] hover:underline"
                >
                  {s.symbol}
                </a>
                <span className="max-w-[120px] truncate text-[10px] text-[#666]">{s.short_name}</span>
              </div>
            </td>
            <td className="px-2 py-1.5">
              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${convictionColor(s.conviction)}`}>
                {s.conviction}
              </span>
            </td>
            <td className="px-2 py-1.5">
              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${categoryColor(s.category)}`}>
                {s.category.replace("_", " ")}
              </span>
            </td>
            <td className="whitespace-nowrap px-2 py-1.5 text-[#a0a0a0]">
              {s.phase.replace("P", "").replace("_", " ")}
            </td>
            <td className="px-2 py-1.5">
              <span className={s.rs_accel >= 0 ? "text-green-400" : "text-red-400"}>
                {s.rs_accel >= 0 ? "+" : ""}{s.rs_accel.toFixed(2)}
              </span>
            </td>
            <td className="px-2 py-1.5">
              <span className={s.vol_ratio >= 1.2 ? "text-green-400" : "text-[#a0a0a0]"}>
                {s.vol_ratio.toFixed(1)}x
              </span>
            </td>
            <td className="px-2 py-1.5 text-[#a0a0a0]">
              {s.institutional_pct != null ? `${s.institutional_pct.toFixed(0)}%` : "N/A"}
            </td>
            <td className="px-2 py-1.5 font-mono text-[#a0a0a0]">
              ${s.price.toFixed(2)}
            </td>
            <td className="px-2 py-1.5 text-[#a0a0a0]">
              {s.sector_name}
            </td>
            <td className="px-2 py-1.5">
              <ConvictionDots signals={s.conviction_signals} />
            </td>
          </tr>
        ))}
    </>
  );
}

function PairGauge({
  label,
  description,
  value,
  leftLabel,
  rightLabel,
}: {
  label: string;
  description: string;
  value: number | null;
  leftLabel: string;
  rightLabel: string;
}) {
  if (value == null) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3 text-xs text-[#666]">
        {label}: N/A
      </div>
    );
  }

  // value ranges from roughly -100 to +100
  const pct = Math.max(0, Math.min(100, (value + 100) / 2));
  const isPositive = value > 0;

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className={`text-sm font-mono font-bold ${isPositive ? "text-green-400" : "text-red-400"}`}>
          {value > 0 ? "+" : ""}{value}
        </span>
      </div>
      <div className="mt-1 text-xs text-[#888]">{description}</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] text-[#888]">{leftLabel}</span>
        <div className="relative h-2 flex-1 rounded-full bg-[#1a1a1a]">
          {/* Center line */}
          <div className="absolute left-1/2 top-0 h-2 w-px bg-[#444]" />
          {/* Gauge fill */}
          {isPositive ? (
            <div
              className="absolute left-1/2 top-0 h-2 rounded-r-full bg-green-500/60"
              style={{ width: `${(pct - 50)}%` }}
            />
          ) : (
            <div
              className="absolute top-0 h-2 rounded-l-full bg-red-500/60"
              style={{ width: `${(50 - pct)}%`, right: `${100 - 50}%` }}
            />
          )}
          {/* Indicator dot */}
          <div
            className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 ${
              isPositive ? "border-green-400 bg-green-500" : "border-red-400 bg-red-500"
            }`}
            style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
          />
        </div>
        <span className="text-[10px] text-[#888]">{rightLabel}</span>
      </div>
    </div>
  );
}
