"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Loader2, RefreshCw, ChevronDown, ChevronUp, FileDown } from "lucide-react";
import type {
  SectorRotationScore,
  RRGQuadrant,
  EnrichedStock,
  ConvictionLevel,
} from "@/lib/sector-rotation/types";
import type { CryptoRotationResult } from "@/lib/crypto-rotation/types";
import type { RotationTrackerResult } from "@/lib/sector-rotation/rotation-types";
import {
  getHealth,
  computeLifecycleStage,
  computeConviction,
  computeActionSignal,
} from "@/lib/crypto-rotation/helpers";
import { isCryptoRegimeAligned } from "@/lib/crypto-rotation/helpers";
import type { CryptoRegimeData } from "@/lib/crypto-rotation/crypto-regime";
import {
  loadCryptoRotation,
  saveCryptoRotation,
} from "@/lib/crypto-rotation/storage";
import { exportCryptoRotationToExcel } from "@/lib/crypto-rotation/export";
import { CRYPTO_UNIVERSE } from "@/data/crypto-sector-universe";
import { compositeTextColor } from "@/lib/color-utils";
import { DataAgeBadge } from "@/components/data-age-badge";
import { ScannerCTA } from "@/components/scanner-cta";
import {
  useCollapsedPanels,
  CollapsiblePanel,
  quadrantColor,
  quadrantDotColor,
} from "../_components";

// ── Sparkline ──

function Sparkline({ returns }: { returns?: number[] }) {
  if (!returns || returns.length < 3) return null;
  const W = 60, H = 20;
  const min = Math.min(...returns);
  const max = Math.max(...returns);
  const range = max - min || 1;
  const points = returns
    .map((v, i) => `${(i / (returns.length - 1)) * W},${H - ((v - min) / range) * H}`)
    .join(" ");
  const lastVal = returns[returns.length - 1];
  const color = lastVal >= 0 ? "#4ade80" : "#f87171";
  return (
    <svg width={W} height={H} className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

// ── RRG Chart ──

function RRGChart({ sectors: rawSectors }: { sectors: SectorRotationScore[] }) {
  const W = 500;
  const H = 400;
  const PAD = 50;

  // Filter out sectors with invalid RRG data (NaN from bad Yahoo responses)
  const sectors = rawSectors.filter(
    (s) => isFinite(s.rsRatio) && isFinite(s.rsMomentum)
  );

  const allRatios: number[] = [];
  const allMoms: number[] = [];
  for (const s of sectors) {
    allRatios.push(s.rsRatio);
    allMoms.push(s.rsMomentum);
    for (const pt of s.rrgTrail ?? []) {
      if (isFinite(pt.rsRatio) && isFinite(pt.rsMomentum)) {
        allRatios.push(pt.rsRatio);
        allMoms.push(pt.rsMomentum);
      }
    }
  }
  if (allRatios.length === 0) return <div className="text-center py-8 text-sm text-[#555]">No RRG data available</div>;

  const rMin = Math.min(99, ...allRatios) - 0.5;
  const rMax = Math.max(101, ...allRatios) + 0.5;
  const mMin = Math.min(99, ...allMoms) - 0.5;
  const mMax = Math.max(101, ...allMoms) + 0.5;

  const scaleX = (v: number) => PAD + ((v - rMin) / (rMax - rMin)) * (W - 2 * PAD);
  const scaleY = (v: number) => H - PAD - ((v - mMin) / (mMax - mMin)) * (H - 2 * PAD);

  const cx = scaleX(100);
  const cy = scaleY(100);

  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Crypto Relative Rotation Graph">
      <rect x={cx} y={PAD} width={W - PAD - cx} height={cy - PAD} fill="rgba(74,222,128,0.05)" />
      <rect x={PAD} y={PAD} width={cx - PAD} height={cy - PAD} fill="rgba(34,211,238,0.05)" />
      <rect x={PAD} y={cy} width={cx - PAD} height={H - PAD - cy} fill="rgba(248,113,113,0.05)" />
      <rect x={cx} y={cy} width={W - PAD - cx} height={H - PAD - cy} fill="rgba(251,191,36,0.05)" />
      <line x1={cx} y1={PAD} x2={cx} y2={H - PAD} stroke="#333" strokeWidth={1} />
      <line x1={PAD} y1={cy} x2={W - PAD} y2={cy} stroke="#333" strokeWidth={1} />
      <text x={W - PAD - 5} y={PAD + 15} textAnchor="end" fill="#4ade80" fontSize={11} opacity={0.5}>LEADING</text>
      <text x={PAD + 5} y={PAD + 15} textAnchor="start" fill="#22d3ee" fontSize={11} opacity={0.5}>IMPROVING</text>
      <text x={PAD + 5} y={H - PAD - 5} textAnchor="start" fill="#f87171" fontSize={11} opacity={0.5}>LAGGING</text>
      <text x={W - PAD - 5} y={H - PAD - 5} textAnchor="end" fill="#fbbf24" fontSize={11} opacity={0.5}>WEAKENING</text>
      <text x={W / 2} y={H - 8} textAnchor="middle" fill="#666" fontSize={10}>RS-Ratio (vs BTC)</text>
      <text x={12} y={H / 2} textAnchor="middle" fill="#666" fontSize={10} transform={`rotate(-90,12,${H / 2})`}>RS-Momentum</text>
      {sectors.map((s) => {
        const trail = s.rrgTrail;
        if (!trail || trail.length < 2) return null;
        const color = quadrantDotColor(s.quadrant);
        const points = trail.map((pt) => `${scaleX(pt.rsRatio)},${scaleY(pt.rsMomentum)}`).join(" ");
        const isHov = hovered === s.sector;
        return (
          <g key={`trail-${s.sector}`}>
            <polyline points={points} fill="none" stroke={color} strokeWidth={isHov ? 2 : 1.5} opacity={isHov ? 0.8 : 0.3} strokeLinejoin="round" />
            <circle cx={scaleX(trail[0].rsRatio)} cy={scaleY(trail[0].rsMomentum)} r={2} fill={color} opacity={isHov ? 0.6 : 0.2} />
          </g>
        );
      })}
      {sectors.map((s) => {
        const x = scaleX(s.rsRatio);
        const y = scaleY(s.rsMomentum);
        const color = quadrantDotColor(s.quadrant);
        const isHov = hovered === s.sector;
        return (
          <g key={s.sector} onMouseEnter={() => setHovered(s.sector)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
            <circle cx={x} cy={y} r={isHov ? 7 : 5} fill={color} stroke={isHov ? "#fff" : "none"} strokeWidth={1.5} opacity={isHov ? 1 : 0.85} />
            {isHov ? (
              <>
                <text x={x} y={y - 12} textAnchor="middle" fill={color} fontSize={11} fontWeight="bold">{s.etf.replace("-USD", "")}</text>
                <text x={x} y={y + 20} textAnchor="middle" fill="#a0a0a0" fontSize={10}>{s.sector} ({s.compositeScore}/100)</text>
              </>
            ) : (
              <text x={x} y={y - 8} textAnchor="middle" fill={color} fontSize={8} opacity={0.7}>{s.etf.replace("-USD", "")}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Sector Heatmap Card ──

function SectorCard({
  sector,
  etfReturns,
  onClick,
  isExpanded,
}: {
  sector: SectorRotationScore;
  etfReturns?: number[];
  onClick: () => void;
  isExpanded: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={isExpanded}
      aria-label={`${sector.sector} — score ${sector.compositeScore}, ${sector.quadrant}`}
      className={`rounded-lg border p-3 text-left transition-colors hover:bg-[#1a1a1a] ${
        isExpanded ? "border-[#5ba3e6]/50 bg-[#1a1a1a]" : "border-[#2a2a2a] bg-[#141414]"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium text-white truncate">{sector.sector}</span>
        <span className="text-lg">{sector.trendArrow}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className={`text-lg font-bold ${compositeTextColor(sector.compositeScore)}`}>
          {sector.compositeScore}
        </span>
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] ${quadrantColor(sector.quadrant)}`}>
          {sector.quadrant}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-[#666]">{sector.etf.replace("-USD", "")}</span>
        <Sparkline returns={etfReturns} />
      </div>
      {sector.stealthAccumulation && (
        <span className="mt-1 inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-400">STEALTH</span>
      )}
    </button>
  );
}

// ── Sector Detail Expand ──

function SectorDetail({ sector, tokens }: { sector: SectorRotationScore; tokens: EnrichedStock[] }) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div className="flex justify-between"><span className="text-[#888]">Momentum Composite</span><span className="text-white">{sector.momentumComposite} <span className="text-[#666]">({sector.momentumPercentile}th %ile)</span></span></div>
        <div className="flex justify-between"><span className="text-[#888]">Acceleration</span><span className={sector.acceleration > 0 ? "text-green-400" : sector.acceleration < 0 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.acceleration > 0 ? "+" : ""}{sector.acceleration}</span></div>
        <div className="flex justify-between"><span className="text-[#888]">Mansfield RS (vs BTC)</span><span className={sector.mansfieldRS > 0 ? "text-green-400" : sector.mansfieldRS < 0 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.mansfieldRS > 0 ? "+" : ""}{sector.mansfieldRS}</span></div>
        <div className="flex justify-between"><span className="text-[#888]">CMF (20d)</span><span className={sector.cmf20 > 0 ? "text-green-400" : sector.cmf20 < 0 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.cmf20 > 0 ? "+" : ""}{sector.cmf20}</span></div>
        <div className="flex justify-between"><span className="text-[#888]">OBV Trend</span><span className={sector.obvTrend === 1 ? "text-green-400" : sector.obvTrend === -1 ? "text-red-400" : "text-[#a0a0a0]"}>{sector.obvTrend === 1 ? "Accumulation" : sector.obvTrend === -1 ? "Distribution" : "Flat"}</span></div>
        <div className="flex justify-between"><span className="text-[#888]">RS-Ratio / Momentum</span><span className="text-white">{sector.rsRatio} / {sector.rsMomentum}</span></div>
        <div className="flex justify-between"><span className="text-[#888]">Rotation Velocity</span><span className="text-white">{sector.rotationVelocity}</span></div>
      </div>
      {tokens.length > 0 && (
        <div className="border-t border-[#2a2a2a] pt-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#666]">
                  <th className="text-left py-1 pr-2">Token</th>
                  <th className="text-right py-1 px-2">Price</th>
                  <th className="text-right py-1 px-2">% 50MA</th>
                  <th className="text-right py-1 px-2">RS Accel</th>
                  <th className="text-right py-1 px-2">Vol Ratio</th>
                  <th className="text-center py-1 px-2">Category</th>
                  <th className="text-center py-1 px-2">Phase</th>
                  <th className="text-center py-1 px-2">Conviction</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.symbol} className="border-t border-[#1a1a1a] hover:bg-[#1a1a1a]">
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-white">{t.symbol.replace("-USD", "")}</span>
                        <span className="text-[#555]">{t.shortName}</span>
                      </div>
                    </td>
                    <td className="text-right py-1.5 px-2 text-white">${t.price < 1 ? t.price.toPrecision(4) : t.price.toFixed(2)}</td>
                    <td className={`text-right py-1.5 px-2 ${(t.pctFrom50ma ?? 0) > 0 ? "text-green-400" : (t.pctFrom50ma ?? 0) < 0 ? "text-red-400" : "text-[#a0a0a0]"}`}>
                      {t.pctFrom50ma != null ? `${t.pctFrom50ma > 0 ? "+" : ""}${t.pctFrom50ma.toFixed(1)}%` : "-"}
                    </td>
                    <td className={`text-right py-1.5 px-2 ${(t.rsAccel ?? 0) > 0 ? "text-green-400" : (t.rsAccel ?? 0) < 0 ? "text-red-400" : "text-[#a0a0a0]"}`}>
                      {t.rsAccel != null ? t.rsAccel.toFixed(2) : "-"}
                    </td>
                    <td className={`text-right py-1.5 px-2 ${t.volRatio >= 1.5 ? "text-amber-400" : "text-[#a0a0a0]"}`}>
                      {t.volRatio.toFixed(1)}x
                    </td>
                    <td className="text-center py-1.5 px-2">
                      <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] ${
                        t.category === "LEADER" ? "border-green-500/30 bg-green-500/10 text-green-400" :
                        t.category === "CATCH_UP" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400" :
                        t.category === "TURNAROUND" ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                        "border-red-500/30 bg-red-500/10 text-red-400"
                      }`}>{t.category}</span>
                    </td>
                    <td className="text-center py-1.5 px-2 text-[#a0a0a0]">{t.phase.replace("P", "").replace("_", " ")}</td>
                    <td className="text-center py-1.5 px-2">
                      <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] ${
                        t.conviction === "HIGH" ? "border-green-500/30 bg-green-500/10 text-green-400" :
                        t.conviction === "MEDIUM" ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                        "border-[#333] bg-[#1a1a1a] text-[#888]"
                      }`}>{t.conviction} ({t.convictionSignals})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Entry Signals Panel ──

function EntrySignalsPanel({ trackerData, regime }: {
  trackerData: RotationTrackerResult | null;
  regime: CryptoRotationResult["regime"];
}) {
  if (!trackerData?.activeRotations || trackerData.activeRotations.length === 0) {
    return <p className="text-sm text-[#555]">No active rotation signals detected.</p>;
  }

  const rawRegime = regime?.regime ?? "MIXED";
  const mappedRegime = rawRegime === "INFLATIONARY" ? "MIXED" as const : rawRegime as "RISK_ON" | "RISK_OFF" | "MIXED";
  // Invert vixSlope back to marketTrend (server inverts marketTrend→vixSlope for equity UI compat)
  const cryptoRegime: CryptoRegimeData = {
    regime: mappedRegime,
    btcVolatility: regime?.vix ?? 0,
    marketTrend: regime?.vixSlope === "falling" ? "rising" : regime?.vixSlope === "rising" ? "falling" : "flat",
    altSeasonSignal: false,
    favoredSectors: regime?.favoredSectors ?? [],
    avoidSectors: regime?.avoidSectors ?? [],
  };

  return (
    <div className="space-y-3">
      {trackerData.activeRotations.map((rotation) => {
        const event = rotation.event;
        const lifecycle = computeLifecycleStage(event);
        const conviction = computeConviction(event);
        const alignment = isCryptoRegimeAligned(event.sectorName, cryptoRegime);
        const action = computeActionSignal(lifecycle, conviction, alignment);
        return (
          <div key={event.sectorId} className={`rounded-lg border p-3 ${action.borderColor} ${action.bgColor}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${action.color}`}>{action.action}</span>
                <span className="text-sm text-white">{event.sectorName}</span>
                <span className="text-xs text-[#666]">{event.etf.replace("-USD", "")}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#888]">
                <span>{event.daysActive}d active</span>
                <span className={event.etfPerformancePct > 0 ? "text-green-400" : "text-red-400"}>
                  {event.etfPerformancePct > 0 ? "+" : ""}{event.etfPerformancePct}%
                </span>
              </div>
            </div>
            <p className="mt-1 text-xs text-[#888]">{action.description}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Token Picks Table ──

function TokenPicksTable({ tokens }: { tokens: EnrichedStock[] }) {
  const [sortBy, setSortBy] = useState<"conviction" | "rsAccel" | "sector">("conviction");

  const sorted = useMemo(() => {
    const arr = [...tokens];
    switch (sortBy) {
      case "conviction":
        return arr; // Already sorted by conviction from engine
      case "rsAccel":
        return arr.sort((a, b) => (b.rsAccel ?? -999) - (a.rsAccel ?? -999));
      case "sector":
        return arr.sort((a, b) => a.sector.localeCompare(b.sector));
      default:
        return arr;
    }
  }, [tokens, sortBy]);

  const high = sorted.filter((t) => t.conviction === "HIGH");
  const medium = sorted.filter((t) => t.conviction === "MEDIUM");

  const renderGroup = (title: string, items: EnrichedStock[], color: string) => {
    if (items.length === 0) return null;
    return (
      <div>
        <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${color}`}>{title} ({items.length})</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {items.map((t) => (
            <div key={t.symbol} className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-white">{t.symbol.replace("-USD", "")}</span>
                  <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] ${quadrantColor(t.sectorQuadrant)}`}>{t.sectorQuadrant}</span>
                </div>
                <div className="text-[10px] text-[#666]">{t.sector} / {t.category} / {t.phase.replace("P", "").replace("_", " ")}</div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <div className="text-sm text-white">${t.price < 1 ? t.price.toPrecision(4) : t.price.toFixed(2)}</div>
                <div className={`text-[10px] ${(t.rsAccel ?? 0) > 0 ? "text-green-400" : "text-red-400"}`}>
                  RS: {t.rsAccel?.toFixed(2) ?? "-"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#666]">Sort:</span>
        {(["conviction", "rsAccel", "sector"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setSortBy(mode)}
            className={`rounded px-2 py-0.5 text-xs ${sortBy === mode ? "bg-[#5ba3e6]/20 text-[#5ba3e6]" : "text-[#888] hover:text-white"}`}
          >
            {mode === "conviction" ? "Conviction" : mode === "rsAccel" ? "RS Accel" : "Sector"}
          </button>
        ))}
      </div>
      {renderGroup("HIGH Conviction", high, "text-green-400")}
      {renderGroup("MEDIUM Conviction", medium, "text-amber-400")}
      {high.length === 0 && medium.length === 0 && (
        <p className="text-sm text-[#555]">No high or medium conviction tokens found. All tokens either failed quality gates or scored WATCH-level conviction.</p>
      )}
    </div>
  );
}

// ── Main Page ──

export default function CryptoRotationPage() {
  const [data, setData] = useState<CryptoRotationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackerData, setTrackerData] = useState<RotationTrackerResult | null>(null);
  const [collapsedPanels, togglePanel] = useCollapsedPanels("ew-crypto-collapsed-v1");
  const [expandedSector, setExpandedSector] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch rotation tracker
  const fetchTracker = useCallback(() => {
    fetch("/api/crypto-rotation-tracker")
      .then((res) => (res.ok ? res.json() : null))
      .then((result: RotationTrackerResult | null) => {
        if (result) setTrackerData(result);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchTracker(); }, [fetchTracker]);

  const fetchData = useCallback(async (skipCache = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    if (!skipCache) {
      const cached = loadCryptoRotation();
      if (cached) { setData(cached); setLoading(false); return; }
    }
    try {
      const res = await fetch("/api/crypto-rotation", { signal: controller.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const result = (await res.json()) as CryptoRotationResult;
      setData(result);
      saveCryptoRotation(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); return () => { abortRef.current?.abort(); }; }, [fetchData]);
  useEffect(() => { const id = setInterval(() => { fetchData(true); fetchTracker(); }, 10 * 60 * 1000); return () => clearInterval(id); }, [fetchData, fetchTracker]);

  const handleExport = useCallback(() => { if (data) exportCryptoRotationToExcel(data); }, [data]);

  // Token picks grouped by sector
  const tokensBySector = useMemo(() => {
    if (!data?.enrichedStocks) return new Map<string, EnrichedStock[]>();
    const map = new Map<string, EnrichedStock[]>();
    for (const t of data.enrichedStocks.passed) {
      const list = map.get(t.sector) ?? [];
      list.push(t);
      map.set(t.sector, list);
    }
    return map;
  }, [data]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5ba3e6]" />
        <p className="mt-4 text-[#888]">Loading crypto rotation data...</p>
        <p className="mt-1 text-xs text-[#555]">10 sector proxies + ~70 token quotes via BTC benchmark</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 text-center">
        <p className="text-red-400">{error}</p>
        <button onClick={() => fetchData(true)} className="mt-4 rounded-lg bg-[#5ba3e6] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a8fd4]">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const regime = data.regime;
  const btcDom = data.btcDominance;

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Crypto Sector Rotation</h1>
          <p className="text-xs text-[#666]">
            10 sectors / ~70 tokens / benchmark: BTC-USD
            {data.calculatedAt && <> &middot; <DataAgeBadge calculatedAt={data.calculatedAt} /></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-xs font-medium text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-xs font-medium text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
          >
            <FileDown className="h-3 w-3" />
            Export
          </button>
        </div>
      </div>

      {/* Regime Banner */}
      {regime && (
        <div className={`rounded-lg border p-3 text-sm ${
          regime.regime === "RISK_ON" ? "border-green-500/30 bg-green-500/5" :
          regime.regime === "RISK_OFF" ? "border-red-500/30 bg-red-500/5" :
          "border-[#2a2a2a] bg-[#141414]"
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className={`font-semibold ${
                regime.regime === "RISK_ON" ? "text-green-400" :
                regime.regime === "RISK_OFF" ? "text-red-400" :
                "text-amber-400"
              }`}>{regime.regime.replace("_", " ")}</span>
              <span className="text-xs text-[#888]">BTC Vol: {regime.vix.toFixed(1)}%</span>
              {btcDom?.altSeasonSignal && (
                <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-400">ALT SEASON</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-[#888]">
              {regime.favoredSectors.length > 0 && (
                <span>Favored: <span className="text-green-400">{regime.favoredSectors.join(", ")}</span></span>
              )}
              {regime.avoidSectors.length > 0 && (
                <span>Avoid: <span className="text-red-400">{regime.avoidSectors.join(", ")}</span></span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rotation Status Banner */}
      <div className={`rounded-lg border p-3 text-sm ${data.rotationActive ? "border-cyan-500/30 bg-cyan-500/5" : "border-[#2a2a2a] bg-[#141414]"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-2 w-2 rounded-full ${data.rotationActive ? "bg-cyan-400 animate-pulse" : "bg-[#555]"}`} />
            <span className={data.rotationActive ? "text-cyan-400 font-medium" : "text-[#888]"}>
              {data.rotationActive ? "Rotation Active" : "No Active Rotation"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#888]">
            <span>Dispersion: {data.dispersionIndex}</span>
            <span>Spread: {data.sectorSpread}%</span>
          </div>
        </div>
        <p className="mt-1 text-xs text-[#888]">{data.rotationSummary}</p>
      </div>

      {/* Entry Signals */}
      <CollapsiblePanel
        id="entry-signals"
        title="Entry Signals"
        collapsed={collapsedPanels.has("entry-signals")}
        onToggle={togglePanel}
        badge={
          trackerData?.activeRotations && trackerData.activeRotations.length > 0
            ? <span className="inline-flex items-center rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-400">{trackerData.activeRotations.length}</span>
            : undefined
        }
      >
        <EntrySignalsPanel trackerData={trackerData} regime={regime} />
      </CollapsiblePanel>

      {/* Sector Heatmap */}
      <CollapsiblePanel
        id="heatmap"
        title="Sector Heatmap"
        collapsed={collapsedPanels.has("heatmap")}
        onToggle={togglePanel}
        badge={<span className="text-xs text-[#666]">{data.sectors.length} sectors</span>}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.sectors.map((s) => (
            <SectorCard
              key={s.sector}
              sector={s}
              etfReturns={data.etfReturns20d?.[s.etf]}
              onClick={() => setExpandedSector(expandedSector === s.sector ? null : s.sector)}
              isExpanded={expandedSector === s.sector}
            />
          ))}
        </div>
        {expandedSector && (
          <div className="mt-3">
            {data.sectors
              .filter((s) => s.sector === expandedSector)
              .map((s) => (
                <SectorDetail key={s.sector} sector={s} tokens={tokensBySector.get(s.sector) ?? []} />
              ))}
          </div>
        )}
      </CollapsiblePanel>

      {/* RRG Chart */}
      <CollapsiblePanel
        id="rrg"
        title="Relative Rotation Graph (vs BTC)"
        collapsed={collapsedPanels.has("rrg")}
        onToggle={togglePanel}
      >
        <div className="mx-auto max-w-[500px]">
          <RRGChart sectors={data.sectors} />
        </div>
      </CollapsiblePanel>

      {/* Token Picks */}
      <CollapsiblePanel
        id="token-picks"
        title="Token Picks"
        collapsed={collapsedPanels.has("token-picks")}
        onToggle={togglePanel}
        badge={
          data.enrichedStocks
            ? <span className="text-xs text-[#666]">{data.enrichedStocks.passed.length} passed / {data.enrichedStocks.rejected.length} rejected</span>
            : undefined
        }
      >
        <TokenPicksTable tokens={data.enrichedStocks?.passed ?? []} />
      </CollapsiblePanel>

      {/* Per-Sector Token Tables */}
      <CollapsiblePanel
        id="sector-tables"
        title="Per-Sector Token Tables"
        collapsed={collapsedPanels.has("sector-tables")}
        onToggle={togglePanel}
      >
        <div className="space-y-3">
          {data.sectors.map((s) => {
            const tokens = tokensBySector.get(s.sector) ?? [];
            if (tokens.length === 0) return null;
            return (
              <SectorAccordion key={s.sector} sector={s} tokens={tokens} />
            );
          })}
        </div>
      </CollapsiblePanel>

      <ScannerCTA />
    </div>
  );
}

// ── Sector Accordion ──

function SectorAccordion({ sector, tokens }: { sector: SectorRotationScore; tokens: EnrichedStock[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg border-[#2a2a2a]">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-[#1a1a1a] transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{sector.trendArrow}</span>
          <span className="font-medium text-white text-sm">{sector.sector}</span>
          <span className="text-xs text-[#666]">{sector.etf.replace("-USD", "")}</span>
          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] ${quadrantColor(sector.quadrant)}`}>{sector.quadrant}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#666]">{tokens.length} tokens</span>
          <span className={`font-bold ${compositeTextColor(sector.compositeScore)}`}>{sector.compositeScore}</span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-[#666]" /> : <ChevronDown className="h-3.5 w-3.5 text-[#666]" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-[#2a2a2a] px-4 py-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#666]">
                  <th className="text-left py-1 pr-2">Token</th>
                  <th className="text-right py-1 px-2">Price</th>
                  <th className="text-right py-1 px-2">% 50MA</th>
                  <th className="text-right py-1 px-2">% 200MA</th>
                  <th className="text-right py-1 px-2">RS Accel</th>
                  <th className="text-right py-1 px-2">Vol</th>
                  <th className="text-center py-1 px-2">Category</th>
                  <th className="text-center py-1 px-2">Conviction</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.symbol} className="border-t border-[#1a1a1a] hover:bg-[#1a1a1a]">
                    <td className="py-1.5 pr-2">
                      <span className="font-medium text-white">{t.symbol.replace("-USD", "")}</span>
                      <span className="ml-1 text-[#555]">{t.shortName}</span>
                    </td>
                    <td className="text-right py-1.5 px-2 text-white">${t.price < 1 ? t.price.toPrecision(4) : t.price.toFixed(2)}</td>
                    <td className={`text-right py-1.5 px-2 ${(t.pctFrom50ma ?? 0) > 0 ? "text-green-400" : "text-red-400"}`}>
                      {t.pctFrom50ma != null ? `${t.pctFrom50ma.toFixed(1)}%` : "-"}
                    </td>
                    <td className={`text-right py-1.5 px-2 ${(t.pctFrom200ma ?? 0) > 0 ? "text-green-400" : "text-red-400"}`}>
                      {t.pctFrom200ma != null ? `${t.pctFrom200ma.toFixed(1)}%` : "-"}
                    </td>
                    <td className={`text-right py-1.5 px-2 ${(t.rsAccel ?? 0) > 0 ? "text-green-400" : "text-red-400"}`}>
                      {t.rsAccel != null ? t.rsAccel.toFixed(2) : "-"}
                    </td>
                    <td className={`text-right py-1.5 px-2 ${t.volRatio >= 1.5 ? "text-amber-400" : "text-[#a0a0a0]"}`}>
                      {t.volRatio.toFixed(1)}x
                    </td>
                    <td className="text-center py-1.5 px-2">
                      <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] ${
                        t.category === "LEADER" ? "border-green-500/30 bg-green-500/10 text-green-400" :
                        t.category === "CATCH_UP" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400" :
                        t.category === "TURNAROUND" ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                        "border-red-500/30 bg-red-500/10 text-red-400"
                      }`}>{t.category}</span>
                    </td>
                    <td className="text-center py-1.5 px-2">
                      <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] ${
                        t.conviction === "HIGH" ? "border-green-500/30 bg-green-500/10 text-green-400" :
                        t.conviction === "MEDIUM" ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                        "border-[#333] bg-[#1a1a1a] text-[#888]"
                      }`}>{t.conviction}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
