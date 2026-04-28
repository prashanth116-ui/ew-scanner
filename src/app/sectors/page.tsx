"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Clock, FileDown, Copy, Check } from "lucide-react";
import type {
  SectorRotationResult,
  SectorRotationScore,
  RRGQuadrant,
} from "@/lib/sector-rotation/types";
import type { PreRunResult } from "@/lib/prerun/types";
import {
  loadSectorRotation,
  saveSectorRotation,
} from "@/lib/sector-rotation/storage";
import {
  saveSnapshot,
  loadHistory,
  getSnapshot,
} from "@/lib/sector-rotation/history";
import type { DailySnapshot, SectorSnapshot } from "@/lib/sector-rotation/history";
import { loadScanResults } from "@/lib/prerun/storage";
import { SECTOR_UNIVERSE, getSectorForSymbol } from "@/data/sector-universe";
import { ScannerCTA } from "@/components/scanner-cta";
import { compositeColor, compositeTextColor } from "@/lib/color-utils";
import { exportSectorsToExcel } from "@/lib/sector-rotation/export";

// ── Color helpers ──


function quadrantColor(q: RRGQuadrant): string {
  switch (q) {
    case "LEADING": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "WEAKENING": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "LAGGING": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "IMPROVING": return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
  }
}

function quadrantDotColor(q: RRGQuadrant): string {
  switch (q) {
    case "LEADING": return "#4ade80";
    case "WEAKENING": return "#fbbf24";
    case "LAGGING": return "#f87171";
    case "IMPROVING": return "#22d3ee";
  }
}

// ── Data freshness helpers ──

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

  // Update every minute
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

// ── Trading action helpers ──

type TradingAction = "TRADE" | "BUILD" | "WATCH" | "TRIM" | "AVOID";

function getTradingAction(s: SectorRotationScore): TradingAction {
  // Best: LEADING with strong composite + positive acceleration
  if (s.quadrant === "LEADING" && s.compositeScore >= 60 && s.acceleration > 0) return "TRADE";
  // Early entry: IMPROVING with positive acceleration (textbook rotation entry)
  if (s.quadrant === "IMPROVING" && s.acceleration > 0) return "BUILD";
  // Good: LEADING with high composite (even if accel is turning)
  if (s.quadrant === "LEADING" && s.compositeScore >= 60) return "TRADE";
  // Decent: LEADING but weak composite — still outperforming SPY
  if (s.quadrant === "LEADING") return "WATCH";
  // Warning: WEAKENING — money starting to leave
  if (s.quadrant === "WEAKENING") return "TRIM";
  // Potential: IMPROVING but not yet accelerating
  if (s.quadrant === "IMPROVING") return "WATCH";
  // Transition signal: LAGGING but acceleration turning positive with decent composite
  if (s.quadrant === "LAGGING" && s.acceleration > 0 && s.compositeScore >= 40) return "WATCH";
  // Bottom: LAGGING
  return "AVOID";
}

function actionBadge(action: TradingAction): { label: string; className: string } {
  switch (action) {
    case "TRADE": return { label: "TRADE", className: "bg-green-500/15 text-green-400 border-green-500/30" };
    case "BUILD": return { label: "BUILD", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
    case "WATCH": return { label: "WATCH", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    case "TRIM": return { label: "TRIM", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" };
    case "AVOID": return { label: "AVOID", className: "bg-red-500/15 text-red-400 border-red-500/30" };
  }
}

// ── Stock ranking helpers ──

interface StockInSector {
  ticker: string;
  companyName: string;
  rs20d: number | null;
  pctFromAth: number | null;
  finalScore: number;
  verdict: string;
}

function rsColor(rs: number | null): string {
  if (rs === null) return "text-[#666]";
  if (rs > 5) return "text-green-400";
  if (rs > 0) return "text-green-400/70";
  if (rs > -5) return "text-red-400/70";
  return "text-red-400";
}

// ── RRG SVG Chart ──

function RRGChart({ sectors }: { sectors: SectorRotationScore[] }) {
  const W = 500;
  const H = 400;
  const PAD = 50;

  // Find axis ranges (include trail points for proper scaling)
  const allRatios: number[] = [];
  const allMoms: number[] = [];
  for (const s of sectors) {
    allRatios.push(s.rsRatio);
    allMoms.push(s.rsMomentum);
    for (const pt of s.rrgTrail ?? []) {
      allRatios.push(pt.rsRatio);
      allMoms.push(pt.rsMomentum);
    }
  }
  const rMin = Math.min(99, ...allRatios) - 0.5;
  const rMax = Math.max(101, ...allRatios) + 0.5;
  const mMin = Math.min(-0.1, ...allMoms) - 0.02;
  const mMax = Math.max(0.1, ...allMoms) + 0.02;

  const scaleX = (v: number) => PAD + ((v - rMin) / (rMax - rMin)) * (W - 2 * PAD);
  const scaleY = (v: number) => H - PAD - ((v - mMin) / (mMax - mMin)) * (H - 2 * PAD);

  const cx = scaleX(100);
  const cy = scaleY(0);

  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[500px]" role="img" aria-label="Relative Rotation Graph">
      {/* Quadrant backgrounds */}
      <rect x={cx} y={PAD} width={W - PAD - cx} height={cy - PAD} fill="rgba(74,222,128,0.05)" />
      <rect x={PAD} y={PAD} width={cx - PAD} height={cy - PAD} fill="rgba(34,211,238,0.05)" />
      <rect x={PAD} y={cy} width={cx - PAD} height={H - PAD - cy} fill="rgba(248,113,113,0.05)" />
      <rect x={cx} y={cy} width={W - PAD - cx} height={H - PAD - cy} fill="rgba(251,191,36,0.05)" />

      {/* Crosshair */}
      <line x1={cx} y1={PAD} x2={cx} y2={H - PAD} stroke="#333" strokeWidth={1} />
      <line x1={PAD} y1={cy} x2={W - PAD} y2={cy} stroke="#333" strokeWidth={1} />

      {/* Quadrant labels */}
      <text x={W - PAD - 5} y={PAD + 15} textAnchor="end" fill="#4ade80" fontSize={11} opacity={0.5}>LEADING</text>
      <text x={PAD + 5} y={PAD + 15} textAnchor="start" fill="#22d3ee" fontSize={11} opacity={0.5}>IMPROVING</text>
      <text x={PAD + 5} y={H - PAD - 5} textAnchor="start" fill="#f87171" fontSize={11} opacity={0.5}>LAGGING</text>
      <text x={W - PAD - 5} y={H - PAD - 5} textAnchor="end" fill="#fbbf24" fontSize={11} opacity={0.5}>WEAKENING</text>

      {/* Axis labels */}
      <text x={W / 2} y={H - 8} textAnchor="middle" fill="#666" fontSize={10}>RS-Ratio</text>
      <text x={12} y={H / 2} textAnchor="middle" fill="#666" fontSize={10} transform={`rotate(-90,12,${H / 2})`}>RS-Momentum</text>

      {/* Trailing tails — 4-week history showing direction of movement */}
      {sectors.map((s) => {
        const trail = s.rrgTrail;
        if (!trail || trail.length < 2) return null;
        const color = quadrantDotColor(s.quadrant);
        const points = trail.map((pt) => `${scaleX(pt.rsRatio)},${scaleY(pt.rsMomentum)}`).join(" ");
        const isHov = hovered === s.sector;
        return (
          <g key={`trail-${s.sector}`}>
            <polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={isHov ? 2 : 1.5}
              opacity={isHov ? 0.8 : 0.3}
              strokeLinejoin="round"
            />
            {/* Small dot at trail start (oldest point) */}
            <circle
              cx={scaleX(trail[0].rsRatio)}
              cy={scaleY(trail[0].rsMomentum)}
              r={2}
              fill={color}
              opacity={isHov ? 0.6 : 0.2}
            />
          </g>
        );
      })}

      {/* Sector dots — labels shown on hover to avoid overlap with 13 sectors */}
      {sectors.map((s) => {
        const x = scaleX(s.rsRatio);
        const y = scaleY(s.rsMomentum);
        const color = quadrantDotColor(s.quadrant);
        const isHov = hovered === s.sector;

        return (
          <g
            key={s.sector}
            onMouseEnter={() => setHovered(s.sector)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={x}
              cy={y}
              r={isHov ? 7 : 5}
              fill={color}
              stroke={isHov ? "#fff" : "none"}
              strokeWidth={1.5}
              opacity={isHov ? 1 : 0.85}
            />
            {isHov ? (
              <>
                <text x={x} y={y - 12} textAnchor="middle" fill={color} fontSize={11} fontWeight="bold">
                  {s.etf}
                </text>
                <text x={x} y={y + 20} textAnchor="middle" fill="#a0a0a0" fontSize={10}>
                  {s.sector} ({s.compositeScore}/100)
                </text>
              </>
            ) : (
              <text x={x} y={y - 8} textAnchor="middle" fill={color} fontSize={8} opacity={0.7}>
                {s.etf}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Sector Detail Accordion ──

function SectorDetail({ sector, stocks, prevSnapshot }: { sector: SectorRotationScore; stocks: StockInSector[]; prevSnapshot?: SectorSnapshot | null }) {
  const [open, setOpen] = useState(false);
  const [showNoData, setShowNoData] = useState(false);

  const leaders = stocks.filter((s) => s.rs20d !== null && s.rs20d > 0).sort((a, b) => (b.rs20d ?? 0) - (a.rs20d ?? 0));
  const laggards = stocks.filter((s) => s.rs20d !== null && s.rs20d <= 0).sort((a, b) => (a.rs20d ?? 0) - (b.rs20d ?? 0));
  const noData = stocks.filter((s) => s.rs20d === null);

  return (
    <div className={`border rounded-lg ${sector.stealthAccumulation ? "border-cyan-500/40" : "border-[#2a2a2a]"}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#1a1a1a] transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg">{sector.trendArrow}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-white truncate">{sector.sector}</span>
              <span className="text-xs text-[#666]">{sector.etf}</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${quadrantColor(sector.quadrant)}`}>
                {sector.quadrant}
              </span>
              {(() => {
                const action = getTradingAction(sector);
                const badge = actionBadge(action);
                return (
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
                );
              })()}
              {sector.stealthAccumulation && (
                <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-400">
                  STEALTH
                </span>
              )}
              {(sector.dataQuality ?? 100) < 100 && (
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                  {sector.dataQuality ?? 100}% data
                </span>
              )}
            </div>
            {/* subsectors display removed — 1:1 sector-to-ETF mapping */}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-[#666]">{stocks.length} stocks</span>
          <span className={`text-lg font-bold ${compositeTextColor(sector.compositeScore)}`}>
            {sector.compositeScore}
            {prevSnapshot && (() => {
              const delta = sector.compositeScore - prevSnapshot.compositeScore;
              if (delta === 0) return null;
              return (
                <span className={`ml-1 text-xs font-semibold ${delta > 0 ? "text-green-400" : "text-red-400"}`}>
                  ({delta > 0 ? "+" : ""}{delta})
                </span>
              );
            })()}
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-[#666]" /> : <ChevronDown className="h-4 w-4 text-[#666]" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-[#2a2a2a] px-4 py-3 space-y-4">
          {/* Sector indicators grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#888]">Momentum Composite</span>
              <span className="text-white">{sector.momentumComposite} <span className="text-[#666]">({sector.momentumPercentile}th %ile)</span></span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">Acceleration</span>
              <span className={sector.acceleration > 0 ? "text-green-400" : sector.acceleration < 0 ? "text-red-400" : "text-[#a0a0a0]"}>
                {sector.acceleration > 0 ? "+" : ""}{sector.acceleration}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">Mansfield RS</span>
              <span className={sector.mansfieldRS > 0 ? "text-green-400" : sector.mansfieldRS < 0 ? "text-red-400" : "text-[#a0a0a0]"}>
                {sector.mansfieldRS > 0 ? "+" : ""}{sector.mansfieldRS}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">CMF (20d)</span>
              <span className={sector.cmf20 > 0 ? "text-green-400" : sector.cmf20 < 0 ? "text-red-400" : "text-[#a0a0a0]"}>
                {sector.cmf20 > 0 ? "+" : ""}{sector.cmf20}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">OBV Trend</span>
              <span className={sector.obvTrend === 1 ? "text-green-400" : sector.obvTrend === -1 ? "text-red-400" : "text-[#a0a0a0]"}>
                {sector.obvTrend === 1 ? "Accumulation" : sector.obvTrend === -1 ? "Distribution" : "Flat"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">Breadth (% &gt; 50d SMA)</span>
              <span className="text-white">{sector.breadthPct !== null ? `${sector.breadthPct}%` : "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">Unusual Volume</span>
              <span className={sector.unusualVolume ? "text-amber-400" : "text-[#a0a0a0]"}>
                {sector.unusualVolume ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">Insider Buys</span>
              <span className={sector.aggregateInsiderBuys > 0 ? "text-green-400" : "text-[#a0a0a0]"}>
                {sector.aggregateInsiderBuys}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">Avg P/C Ratio</span>
              <span className="text-white">{sector.aggregatePCR !== null ? sector.aggregatePCR : "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">Earnings Beat %</span>
              <span className="text-white">{sector.earningsBeatPct}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">Smart Money Score</span>
              <span className={compositeTextColor(sector.smartMoneyScore)}>{sector.smartMoneyScore}/100</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">RS-Ratio / Momentum</span>
              <span className="text-white">{sector.rsRatio} / {sector.rsMomentum}</span>
            </div>
          </div>

          {/* Leading / Lagging stocks */}
          {stocks.length > 0 && (
            <div className="border-t border-[#2a2a2a] pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Leaders */}
                <div>
                  <div className="text-xs font-semibold text-green-400 mb-2">
                    Leaders ({leaders.length})
                  </div>
                  {leaders.length === 0 ? (
                    <p className="text-xs text-[#555]">None</p>
                  ) : (
                    <div className="space-y-1">
                      {leaders.map((s) => (
                        <div key={s.ticker} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <a
                              href={`https://finance.yahoo.com/quote/${encodeURIComponent(s.ticker)}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-white hover:text-[#5ba3e6] transition-colors"
                            >
                              {s.ticker}
                            </a>
                            <span className="text-[#555] truncate">{s.companyName}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={rsColor(s.rs20d)}>
                              {s.rs20d !== null ? `${s.rs20d > 0 ? "+" : ""}${s.rs20d.toFixed(1)}%` : "-"}
                            </span>
                            <span className="text-[#666] w-8 text-right">{s.finalScore}pt</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Laggards */}
                <div>
                  <div className="text-xs font-semibold text-red-400 mb-2">
                    Laggards ({laggards.length})
                  </div>
                  {laggards.length === 0 ? (
                    <p className="text-xs text-[#555]">None</p>
                  ) : (
                    <div className="space-y-1">
                      {laggards.map((s) => (
                        <div key={s.ticker} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <a
                              href={`https://finance.yahoo.com/quote/${encodeURIComponent(s.ticker)}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-white hover:text-[#5ba3e6] transition-colors"
                            >
                              {s.ticker}
                            </a>
                            <span className="text-[#555] truncate">{s.companyName}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={rsColor(s.rs20d)}>
                              {s.rs20d !== null ? `${s.rs20d.toFixed(1)}%` : "-"}
                            </span>
                            <span className="text-[#666] w-8 text-right">{s.finalScore}pt</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {noData.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowNoData(!showNoData)}
                    className="text-xs text-[#555] hover:text-[#888] transition-colors"
                  >
                    {showNoData ? "Hide" : "Show"} {noData.length} stocks without scan data {showNoData ? "\u25B2" : "\u25BC"}
                  </button>
                  {showNoData && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {noData.map((s) => (
                        <span key={s.ticker} className="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-1.5 py-0.5 text-[10px] text-[#555]">
                          {s.ticker}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

type SortMode = "score" | "action" | "quadrant" | "acceleration" | "name";

const ACTION_RANK: Record<TradingAction, number> = { TRADE: 0, BUILD: 1, WATCH: 2, TRIM: 3, AVOID: 4 };
const QUADRANT_RANK: Record<RRGQuadrant, number> = { LEADING: 0, IMPROVING: 1, WEAKENING: 2, LAGGING: 3 };

export default function SectorRotationPage() {
  const [data, setData] = useState<SectorRotationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<PreRunResult[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [compareDate, setCompareDate] = useState<string | null>(null);
  const [history, setHistory] = useState<DailySnapshot[]>([]);
  const [copiedToast, setCopiedToast] = useState(false);

  // Load history from localStorage
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Reload history after fresh fetch (data change = potential new snapshot)
  useEffect(() => {
    if (data) setHistory(loadHistory());
  }, [data]);

  // Build comparison lookup: sector name → SectorSnapshot for selected date
  const comparisonMap = useMemo(() => {
    if (!compareDate) return null;
    const snap = getSnapshot(compareDate);
    if (!snap) return null;
    const map = new Map<string, SectorSnapshot>();
    for (const s of snap.sectors) map.set(s.sector, s);
    return map;
  }, [compareDate]);

  // Comparison summary counts
  const comparisonSummary = useMemo(() => {
    if (!comparisonMap || !data) return null;
    let improved = 0, declined = 0, unchanged = 0;
    for (const s of data.sectors) {
      const prev = comparisonMap.get(s.sector);
      if (!prev) { unchanged++; continue; }
      const delta = s.compositeScore - prev.compositeScore;
      if (delta > 2) improved++;
      else if (delta < -2) declined++;
      else unchanged++;
    }
    return { improved, declined, unchanged };
  }, [comparisonMap, data]);

  // Load pre-run scan results from localStorage for stock-level data
  useEffect(() => {
    setScanResults(loadScanResults());
  }, []);

  // Build stock list per sector: ALL sector-universe stocks, enriched with pre-run + batch quote data
  const stocksBySector = useMemo(() => {
    // Index scan results by ticker for fast lookup
    const scanByTicker = new Map<string, (typeof scanResults)[number]>();
    for (const r of scanResults) {
      scanByTicker.set(r.data.ticker, r);
    }

    const quotes = data?.stockQuotes ?? {};

    const map = new Map<string, StockInSector[]>();
    for (const sectorDef of SECTOR_UNIVERSE) {
      const stocks: StockInSector[] = sectorDef.stocks.map((stock) => {
        const preRun = scanByTicker.get(stock.symbol);
        const quote = quotes[stock.symbol];
        // Prefer pre-run RS, fall back to batch quote pctFromSma50
        const rs20d = preRun?.data.relativeStrength20d ?? quote?.pctFromSma50 ?? null;
        return {
          ticker: stock.symbol,
          companyName: stock.name,
          rs20d,
          pctFromAth: preRun?.data.pctFromAth ?? null,
          finalScore: preRun?.scores.finalScore ?? 0,
          verdict: preRun?.verdict ?? "",
        };
      });
      map.set(sectorDef.displayName, stocks);
    }
    return map;
  }, [scanResults, data]);

  // Sort sectors based on selected mode
  const sortedSectors = useMemo(() => {
    if (!data) return [];
    const sectors = [...data.sectors];
    switch (sortMode) {
      case "score":
        return sectors.sort((a, b) => b.compositeScore - a.compositeScore);
      case "action":
        return sectors.sort((a, b) => {
          const diff = ACTION_RANK[getTradingAction(a)] - ACTION_RANK[getTradingAction(b)];
          return diff !== 0 ? diff : b.compositeScore - a.compositeScore;
        });
      case "quadrant":
        return sectors.sort((a, b) => {
          const diff = QUADRANT_RANK[a.quadrant] - QUADRANT_RANK[b.quadrant];
          return diff !== 0 ? diff : b.compositeScore - a.compositeScore;
        });
      case "acceleration":
        return sectors.sort((a, b) => b.acceleration - a.acceleration);
      case "name":
        return sectors.sort((a, b) => a.sector.localeCompare(b.sector));
      default:
        return sectors;
    }
  }, [data, sortMode]);

  const fetchData = useCallback(async (skipCache = false) => {
    setLoading(true);
    setError(null);

    // Try localStorage cache first
    if (!skipCache) {
      const cached = loadSectorRotation();
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/sector-rotation");
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const result = (await res.json()) as SectorRotationResult;
      setData(result);
      saveSectorRotation(result);
      saveSnapshot(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 10 minutes (skip cache to get fresh data)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true);
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleExport = useCallback(() => {
    if (data) exportSectorsToExcel(data);
  }, [data]);

  const copyWatchlist = useCallback(() => {
    if (!data) return;
    const tickers = data.topStocksToWatch
      .flatMap((g) => g.stocks.map((s) => s.ticker))
      .join(", ");
    navigator.clipboard.writeText(tickers).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    });
  }, [data]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5ba3e6]" />
        <p className="mt-4 text-[#888]">Calculating sector rotation...</p>
        <p className="mt-1 text-xs text-[#555]">Fetching 1-year data for 15 ETFs + batch quotes for ~900 stocks</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 text-center">
        <p className="text-red-400">Error: {error}</p>
        <button
          onClick={() => fetchData(true)}
          className="mt-4 rounded-lg bg-[#5ba3e6] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a8fd4]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sector Rotation</h1>
          <div className="mt-1 flex items-center gap-3">
            <DataAgeBadge calculatedAt={data.calculatedAt} />
            <span className="text-xs text-[#555]">
              {new Date(data.calculatedAt).toLocaleString()}
            </span>
            {data.stockQuotes && (
              <span className="text-xs text-[#555]">
                {Object.keys(data.stockQuotes).length} quotes
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
          >
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={copyWatchlist}
            className="flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
            title="Copy all top stock tickers to clipboard"
          >
            {copiedToast ? (
              <>
                <Check className="h-4 w-4 text-green-400" />
                <span className="text-green-400 hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span className="hidden sm:inline">Copy Tickers</span>
              </>
            )}
          </button>
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-[#333] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Panel 1: Rotation Status Banner */}
      <div className={`rounded-xl border p-4 ${data.rotationActive ? "border-green-500/30 bg-green-500/5" : "border-[#2a2a2a] bg-[#141414]"}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${data.rotationActive ? "bg-green-500 animate-pulse" : "bg-[#555]"}`} />
            <div>
              <div className="font-semibold text-white">
                {data.rotationActive ? "Rotation Active" : "No Clear Rotation"}
              </div>
              <div className="text-sm text-[#a0a0a0]">{data.rotationSummary}</div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-[#666]">Dispersion</div>
              <div className={`text-lg font-bold ${data.dispersionIndex > 4 ? "text-green-400" : data.dispersionIndex > 2 ? "text-amber-400" : "text-[#a0a0a0]"}`}>
                {data.dispersionIndex}
              </div>
              <div className="text-xs text-[#555]">
                {data.dispersionIndex > 4 ? "High" : data.dispersionIndex > 2 ? "Moderate" : "Low"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#666]">Sector Spread</div>
              <div className={`text-lg font-bold ${(data.sectorSpread ?? 0) > 8 ? "text-green-400" : (data.sectorSpread ?? 0) > 4 ? "text-amber-400" : "text-[#a0a0a0]"}`}>
                {data.sectorSpread ?? 0}%
              </div>
              <div className="text-xs text-[#555]">
                {(data.sectorSpread ?? 0) > 8 ? "Wide" : (data.sectorSpread ?? 0) > 4 ? "Moderate" : "Narrow"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Panel 2: Sector Heatmap Grid */}
      <div>
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Sector Scores</h2>
            <div className="flex items-center gap-1 overflow-x-auto">
              <span className="text-xs text-[#555] shrink-0 mr-1">Sort:</span>
              {([
                ["score", "Score"],
                ["action", "Action"],
                ["quadrant", "Quadrant"],
                ["acceleration", "Accel"],
                ["name", "Name"],
              ] as [SortMode, string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    sortMode === mode
                      ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border border-[#5ba3e6]/30"
                      : "text-[#666] hover:text-[#a0a0a0] border border-transparent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Comparison date selector */}
          {history.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto">
              <span className="text-xs text-[#555] shrink-0 mr-1">Compare:</span>
              <button
                onClick={() => setCompareDate(null)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  compareDate === null
                    ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border border-[#5ba3e6]/30"
                    : "text-[#666] hover:text-[#a0a0a0] border border-transparent"
                }`}
              >
                None
              </button>
              {history.map((snap) => {
                const d = new Date(snap.date + "T12:00:00");
                const daysAgo = Math.round((Date.now() - d.getTime()) / 86_400_000);
                let label: string;
                if (daysAgo <= 1) label = "Yesterday";
                else if (daysAgo <= 8) label = "1w ago";
                else if (daysAgo <= 15) label = "2w ago";
                else if (daysAgo <= 22) label = "3w ago";
                else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return (
                  <button
                    key={snap.date}
                    onClick={() => setCompareDate(snap.date)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      compareDate === snap.date
                        ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                        : "text-[#666] hover:text-[#a0a0a0] border border-transparent"
                    }`}
                    title={snap.date}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Comparison summary banner */}
          {compareDate && comparisonSummary && (
            <div className="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-1.5 text-xs text-[#a0a0a0]">
              <span className="text-purple-400 font-medium">
                Comparing to {new Date(compareDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              <span>&mdash;</span>
              <span className="text-green-400">{comparisonSummary.improved} improved</span>
              <span className="text-red-400">{comparisonSummary.declined} declined</span>
              <span className="text-[#666]">{comparisonSummary.unchanged} unchanged</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {sortedSectors.map((s) => (
            <div
              key={s.sector}
              className={`rounded-lg border p-3 transition-colors ${
                s.stealthAccumulation
                  ? "border-cyan-500/40 bg-cyan-500/5"
                  : "border-[#2a2a2a] bg-[#141414]"
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-white" title={s.sector}>
                    {s.sector}
                  </div>
                  <div className="text-xs text-[#666]">{s.etf}</div>
                </div>
                <span className="text-lg shrink-0">{s.trendArrow}</span>
              </div>
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className={compositeTextColor(s.compositeScore)}>{s.compositeScore}</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${quadrantColor(s.quadrant)}`}>
                    {s.quadrant}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-[#2a2a2a]">
                  <div
                    className={`h-1.5 rounded-full ${compositeColor(s.compositeScore)}`}
                    style={{ width: `${s.compositeScore}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  {(() => {
                    const action = getTradingAction(s);
                    const badge = actionBadge(action);
                    return (
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    );
                  })()}
                  {(s.dataQuality ?? 100) < 100 && (
                    <span className="text-[10px] text-amber-400/70" title={`${s.dataQuality ?? 100}% of composite factors have real data`}>
                      {s.dataQuality ?? 100}% data
                    </span>
                  )}
                </div>
                {/* Delta indicators when comparison active */}
                {(() => {
                  const prev = comparisonMap?.get(s.sector);
                  if (!prev) return null;
                  const delta = s.compositeScore - prev.compositeScore;
                  const quadChanged = s.quadrant !== prev.quadrant;
                  const curAction = getTradingAction(s);
                  const prevAction = getTradingAction({ ...s, compositeScore: prev.compositeScore, acceleration: prev.acceleration, quadrant: prev.quadrant } as SectorRotationScore);
                  const actionChanged = curAction !== prevAction;
                  if (delta === 0 && !quadChanged && !actionChanged) return null;
                  return (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {delta !== 0 && (
                        <span className={`text-[10px] font-semibold ${delta > 0 ? "text-green-400" : "text-red-400"}`}>
                          {delta > 0 ? "+" : ""}{delta}
                        </span>
                      )}
                      {quadChanged && (
                        <span className="rounded-full bg-[#1a1a1a] border border-[#333] px-1.5 py-0.5 text-[9px] text-[#888]">
                          was {prev.quadrant}
                        </span>
                      )}
                      {actionChanged && (
                        <span className="rounded-full bg-[#1a1a1a] border border-[#333] px-1.5 py-0.5 text-[9px] text-[#888]">
                          was {prevAction}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Panel 3: RRG + Panel 4: Leading Indicators / Smart Money */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* RRG Chart */}
        <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
          <h2 className="mb-3 text-lg font-semibold text-white">Relative Rotation Graph</h2>
          <div className="flex justify-center">
            <RRGChart sectors={data.sectors} />
          </div>
        </div>

        {/* Leading Indicators + Smart Money */}
        <div className="space-y-4">
          {/* Leading Indicators */}
          <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
            <h2 className="mb-3 text-base font-semibold text-white">Leading Indicators</h2>
            {(() => {
              const withSignals = data.sectors.filter(
                (s) => s.stealthAccumulation || s.flowPriceDivergence || s.breadthDivergence || s.accelerationInflection
              );
              if (withSignals.length === 0) {
                return <p className="text-sm text-[#666]">No leading indicators detected</p>;
              }
              return (
                <div className="space-y-2">
                  {withSignals.map((s) => {
                    const signals: string[] = [];
                    if (s.flowPriceDivergence) signals.push("Flow/price divergence");
                    if (s.breadthDivergence) signals.push("Breadth divergence");
                    if (s.accelerationInflection) signals.push("Momentum inflection");
                    return (
                      <div key={s.sector} className="flex items-start gap-2 text-sm">
                        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${s.stealthAccumulation ? "bg-cyan-400" : "bg-amber-400"}`} />
                        <div>
                          <span className="font-medium text-white">{s.sector}</span>
                          {s.stealthAccumulation && (
                            <span className="ml-2 text-xs text-cyan-400">(Stealth)</span>
                          )}
                          <div className="text-xs text-[#888]">{signals.join(", ")}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Stocks to Watch */}
          <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
            <h2 className="mb-3 text-base font-semibold text-white">Stocks to Watch</h2>
            {data.topStocksToWatch.length === 0 ? (
              <p className="text-sm text-[#666]">No rotation targets detected. Run a Pre-Run scan first for stock-level data.</p>
            ) : (
              <div className="space-y-3">
                {data.topStocksToWatch.map((sw) => (
                  <div key={sw.sector}>
                    <div className="text-xs font-medium text-[#888] mb-1">{sw.sector}</div>
                    <div className="flex flex-wrap gap-2">
                      {sw.stocks.map((stock) => (
                        <div
                          key={stock.ticker}
                          className="rounded-md border border-[#333] bg-[#1a1a1a] px-2.5 py-1.5 text-sm"
                          title={stock.reasons.join(", ")}
                        >
                          <span className="font-medium text-white">{stock.ticker}</span>
                          <span className="ml-1.5 text-xs text-[#888]">{stock.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panel 5: Sector Detail Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Sector Details</h2>
          {scanResults.length === 0 && (
            <span className="text-xs text-[#555]">Run a Pre-Run scan to see stock-level data</span>
          )}
        </div>
        <div className="space-y-2">
          {sortedSectors.map((s) => (
            <SectorDetail key={s.sector} sector={s} stocks={stocksBySector.get(s.sector) ?? []} prevSnapshot={comparisonMap?.get(s.sector)} />
          ))}
        </div>
      </div>

      {/* Panel 6: Cross-Sector Pairs */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">Cross-Sector Pairs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
            <div className="text-xs font-medium text-[#888] mb-1">XLY / XLP (Risk Appetite)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">{data.crossSectorPairs.xlyXlp.ratio}</span>
              <span className={`text-sm ${
                data.crossSectorPairs.xlyXlp.trend.includes("Rising") ? "text-green-400" :
                data.crossSectorPairs.xlyXlp.trend.includes("Falling") ? "text-red-400" : "text-[#888]"
              }`}>
                {data.crossSectorPairs.xlyXlp.trend}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#666]">
              Rising = cyclical rotation (risk-on). Falling = defensive rotation (risk-off).
            </p>
          </div>
          <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-4">
            <div className="text-xs font-medium text-[#888] mb-1">XLK / XLU (Growth vs Defense)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">{data.crossSectorPairs.xlkXlu.ratio}</span>
              <span className={`text-sm ${
                data.crossSectorPairs.xlkXlu.trend.includes("Rising") ? "text-green-400" :
                data.crossSectorPairs.xlkXlu.trend.includes("Falling") ? "text-red-400" : "text-[#888]"
              }`}>
                {data.crossSectorPairs.xlkXlu.trend}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#666]">
              Rising = growth favored. Falling = defensive/utilities favored.
            </p>
          </div>
        </div>
      </div>
      <ScannerCTA />
    </div>
  );
}
