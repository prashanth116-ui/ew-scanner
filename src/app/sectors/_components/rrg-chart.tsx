"use client";

import { useState, useMemo, useCallback } from "react";
import { Plus, Minus, RotateCcw } from "lucide-react";
import type { SectorRotationScore } from "@/lib/sector-rotation/types";
import { quadrantDotColor } from "./helpers";

export function RRGChart({ sectors, subSectorScores = [], crossAssetScores = [], leadershipBasketScores = [] }: { sectors: SectorRotationScore[]; subSectorScores?: SectorRotationScore[]; crossAssetScores?: SectorRotationScore[]; leadershipBasketScores?: SectorRotationScore[] }) {
  const W = 600;
  const H = 480;
  const PAD = 55;

  // Layer toggles
  const [showSectors, setShowSectors] = useState(true);
  const [showSubSectors, setShowSubSectors] = useState(true);
  const [showCrossAssets, setShowCrossAssets] = useState(true);
  const [showLeadershipBaskets, setShowLeadershipBaskets] = useState(true);

  // Hover & pin state
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  // Zoom state
  const [zoomLevel, setZoomLevel] = useState(0);

  const activeLabel = pinned ?? hovered;

  // Compute data bounds
  const allScores = [...sectors, ...subSectorScores, ...crossAssetScores, ...leadershipBasketScores];
  const allRatios: number[] = [];
  const allMoms: number[] = [];
  for (const s of allScores) {
    if (isFinite(s.rsRatio)) allRatios.push(s.rsRatio);
    if (isFinite(s.rsMomentum)) allMoms.push(s.rsMomentum);
    for (const pt of s.rrgTrail ?? []) {
      if (isFinite(pt.rsRatio)) allRatios.push(pt.rsRatio);
      if (isFinite(pt.rsMomentum)) allMoms.push(pt.rsMomentum);
    }
  }
  if (allRatios.length === 0) return <div className="text-center py-8 text-sm text-[#555]">No RRG data available</div>;

  const autoRMin = Math.min(99, ...allRatios) - 0.5;
  const autoRMax = Math.max(101, ...allRatios) + 0.5;
  const autoMMin = Math.min(99, ...allMoms) - 0.5;
  const autoMMax = Math.max(101, ...allMoms) + 0.5;

  // Apply zoom — narrow range by 25% per step toward center (100, 100)
  const zoomFactor = 1 - zoomLevel * 0.25;
  const rCenter = (autoRMin + autoRMax) / 2;
  const mCenter = (autoMMin + autoMMax) / 2;
  const rHalf = ((autoRMax - autoRMin) / 2) * zoomFactor;
  const mHalf = ((autoMMax - autoMMin) / 2) * zoomFactor;
  const rMin = rCenter - rHalf;
  const rMax = rCenter + rHalf;
  const mMin = mCenter - mHalf;
  const mMax = mCenter + mHalf;

  const scaleX = (v: number) => PAD + ((v - rMin) / (rMax - rMin)) * (W - 2 * PAD);
  const scaleY = (v: number) => H - PAD - ((v - mMin) / (mMax - mMin)) * (H - 2 * PAD);

  const cx = scaleX(100);
  const cy = scaleY(100);

  // Gridlines at 0.5 RS-unit intervals
  const gridLinesX: number[] = [];
  const gridLinesY: number[] = [];
  for (let v = Math.ceil(rMin * 2) / 2; v <= rMax; v += 0.5) {
    if (Math.abs(v - 100) > 0.01) gridLinesX.push(v);
  }
  for (let v = Math.ceil(mMin * 2) / 2; v <= mMax; v += 0.5) {
    if (Math.abs(v - 100) > 0.01) gridLinesY.push(v);
  }

  const handleClick = useCallback((sector: string) => {
    setPinned((prev) => (prev === sector ? null : sector));
  }, []);

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).tagName === "svg" || (e.target as SVGElement).tagName === "rect" || (e.target as SVGElement).tagName === "line") {
      setPinned(null);
    }
  }, []);

  // Find the active score for tooltip
  const activeScore = useMemo(() => {
    if (!activeLabel) return null;
    return allScores.find((s) => s.sector === activeLabel) ?? null;
  }, [activeLabel, allScores]);

  // Tooltip position
  const tooltipX = activeScore ? scaleX(activeScore.rsRatio) : 0;
  const tooltipY = activeScore ? scaleY(activeScore.rsMomentum) : 0;
  const tooltipFlipX = tooltipX > W - PAD - 120;
  const tooltipFlipY = tooltipY < PAD + 80;

  const dimOpacity = pinned ? 0.15 : undefined;

  return (
    <div>
      {/* Layer toggles */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[10px] text-[#555] uppercase tracking-wider mr-1">Layers</span>
        <button
          onClick={() => setShowSectors(!showSectors)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${showSectors ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border-[#5ba3e6]/30" : "text-[#666] border-[#333]"}`}
        >
          Sectors
        </button>
        {subSectorScores.length > 0 && (
          <button
            onClick={() => setShowSubSectors(!showSubSectors)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${showSubSectors ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border-[#5ba3e6]/30" : "text-[#666] border-[#333]"}`}
          >
            Sub-sectors
          </button>
        )}
        {crossAssetScores.length > 0 && (
          <button
            onClick={() => setShowCrossAssets(!showCrossAssets)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${showCrossAssets ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border-[#5ba3e6]/30" : "text-[#666] border-[#333]"}`}
          >
            Cross-assets
          </button>
        )}
        {leadershipBasketScores.length > 0 && (
          <button
            onClick={() => setShowLeadershipBaskets(!showLeadershipBaskets)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${showLeadershipBaskets ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border-[#5ba3e6]/30" : "text-[#666] border-[#333]"}`}
          >
            Leadership
          </button>
        )}
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full aspect-[5/4]" role="img" aria-label="Relative Rotation Graph" onClick={handleSvgClick}>
          <defs>
            <marker id="rrg-arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={5} markerHeight={5} orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#888" />
            </marker>
            <filter id="rrg-shadow">
              <feDropShadow dx={0} dy={1} stdDeviation={2} floodOpacity={0.3} />
            </filter>
          </defs>

          {/* Quadrant backgrounds */}
          <rect x={cx} y={PAD} width={W - PAD - cx} height={cy - PAD} fill="rgba(74,222,128,0.05)" />
          <rect x={PAD} y={PAD} width={cx - PAD} height={cy - PAD} fill="rgba(34,211,238,0.05)" />
          <rect x={PAD} y={cy} width={cx - PAD} height={H - PAD - cy} fill="rgba(248,113,113,0.05)" />
          <rect x={cx} y={cy} width={W - PAD - cx} height={H - PAD - cy} fill="rgba(251,191,36,0.05)" />

          {/* Gridlines */}
          {gridLinesX.map((v) => (
            <line key={`gx-${v}`} x1={scaleX(v)} y1={PAD} x2={scaleX(v)} y2={H - PAD} stroke="#1a1a1a" strokeWidth={0.5} />
          ))}
          {gridLinesY.map((v) => (
            <line key={`gy-${v}`} x1={PAD} y1={scaleY(v)} x2={W - PAD} y2={scaleY(v)} stroke="#1a1a1a" strokeWidth={0.5} />
          ))}

          {/* Center axes */}
          <line x1={cx} y1={PAD} x2={cx} y2={H - PAD} stroke="#333" strokeWidth={1} />
          <line x1={PAD} y1={cy} x2={W - PAD} y2={cy} stroke="#333" strokeWidth={1} />

          {/* Axis tick labels */}
          {gridLinesX.filter((_, i) => i % 2 === 0).map((v) => (
            <text key={`tx-${v}`} x={scaleX(v)} y={H - PAD + 14} textAnchor="middle" fill="#555" fontSize={8}>{v.toFixed(1)}</text>
          ))}
          {gridLinesY.filter((_, i) => i % 2 === 0).map((v) => (
            <text key={`ty-${v}`} x={PAD - 6} y={scaleY(v) + 3} textAnchor="end" fill="#555" fontSize={8}>{v.toFixed(1)}</text>
          ))}

          {/* Quadrant labels */}
          <text x={W - PAD - 5} y={PAD + 15} textAnchor="end" fill="#4ade80" fontSize={11} opacity={0.5}>LEADING</text>
          <text x={PAD + 5} y={PAD + 15} textAnchor="start" fill="#22d3ee" fontSize={11} opacity={0.5}>IMPROVING</text>
          <text x={PAD + 5} y={H - PAD - 5} textAnchor="start" fill="#f87171" fontSize={11} opacity={0.5}>LAGGING</text>
          <text x={W - PAD - 5} y={H - PAD - 5} textAnchor="end" fill="#fbbf24" fontSize={11} opacity={0.5}>WEAKENING</text>

          {/* Axis labels */}
          <text x={W / 2} y={H - 8} textAnchor="middle" fill="#666" fontSize={10}>RS-Ratio</text>
          <text x={12} y={H / 2} textAnchor="middle" fill="#666" fontSize={10} transform={`rotate(-90,12,${H / 2})`}>RS-Momentum</text>

          {/* Sector trails with arrows */}
          {showSectors && sectors.map((s) => {
            const trail = s.rrgTrail;
            if (!trail || trail.length < 2) return null;
            const color = quadrantDotColor(s.quadrant);
            const points = trail.map((pt) => `${scaleX(pt.rsRatio)},${scaleY(pt.rsMomentum)}`).join(" ");
            const isActive = activeLabel === s.sector;
            const opacity = isActive ? 0.8 : dimOpacity ?? 0.3;
            return (
              <g key={`trail-${s.sector}`}>
                <polyline points={points} fill="none" stroke={color} strokeWidth={isActive ? 2.5 : 1.5} opacity={opacity} strokeLinejoin="round" markerEnd="url(#rrg-arrow)" />
                <circle cx={scaleX(trail[0].rsRatio)} cy={scaleY(trail[0].rsMomentum)} r={3} fill={color} opacity={isActive ? 0.7 : dimOpacity ?? 0.25} />
              </g>
            );
          })}

          {/* Sector markers */}
          {showSectors && sectors.map((s) => {
            const x = scaleX(s.rsRatio);
            const y = scaleY(s.rsMomentum);
            const color = quadrantDotColor(s.quadrant);
            const isActive = activeLabel === s.sector;
            const isPinned = pinned === s.sector;
            const opacity = isActive ? 1 : dimOpacity ?? 0.85;
            return (
              <g
                key={s.sector}
                onMouseEnter={() => setHovered(s.sector)}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => { e.stopPropagation(); handleClick(s.sector); }}
                style={{ cursor: "pointer" }}
              >
                <circle cx={x} cy={y} r={isActive ? 7 : 5} fill={color} stroke={isPinned ? "#fff" : isActive ? "#fff" : "none"} strokeWidth={isPinned ? 2 : 1.5} opacity={opacity} />
                {!isActive && (
                  <text x={x} y={y - 8} textAnchor="middle" fill={color} fontSize={8} opacity={dimOpacity ?? 0.7}>{s.etf}</text>
                )}
              </g>
            );
          })}

          {/* Sub-sector markers (triangles) */}
          {showSubSectors && subSectorScores.map((s) => {
            const x = scaleX(s.rsRatio);
            const y = scaleY(s.rsMomentum);
            const color = quadrantDotColor(s.quadrant);
            const isActive = activeLabel === s.sector;
            const size = isActive ? 8 : 6;
            const tri = `${x},${y - size} ${x - size},${y + size} ${x + size},${y + size}`;
            const opacity = isActive ? 1 : dimOpacity ?? 0.7;
            return (
              <g
                key={`sub-${s.etf}`}
                onMouseEnter={() => setHovered(s.sector)}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => { e.stopPropagation(); handleClick(s.sector); }}
                style={{ cursor: "pointer" }}
              >
                <polygon points={tri} fill={color} stroke={isActive ? "#fff" : "none"} strokeWidth={1} opacity={opacity} />
                {!isActive && <text x={x} y={y - size - 4} textAnchor="middle" fill={color} fontSize={7} opacity={dimOpacity ?? 0.6}>{s.etf}</text>}
              </g>
            );
          })}

          {/* Cross-asset markers (diamonds) */}
          {showCrossAssets && crossAssetScores.map((s) => {
            const x = scaleX(s.rsRatio);
            const y = scaleY(s.rsMomentum);
            const color = quadrantDotColor(s.quadrant);
            const isActive = activeLabel === s.sector;
            const size = isActive ? 7 : 5;
            const diamond = `${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`;
            const opacity = isActive ? 1 : dimOpacity ?? 0.7;
            return (
              <g
                key={`cross-${s.etf}`}
                onMouseEnter={() => setHovered(s.sector)}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => { e.stopPropagation(); handleClick(s.sector); }}
                style={{ cursor: "pointer" }}
              >
                <polygon points={diamond} fill={color} stroke={isActive ? "#fff" : "none"} strokeWidth={1} opacity={opacity} />
                {!isActive && <text x={x} y={y - size - 4} textAnchor="middle" fill={color} fontSize={7} opacity={dimOpacity ?? 0.6}>{s.etf}</text>}
              </g>
            );
          })}

          {/* Leadership basket markers (squares) */}
          {showLeadershipBaskets && leadershipBasketScores.map((s) => {
            const x = scaleX(s.rsRatio);
            const y = scaleY(s.rsMomentum);
            const color = quadrantDotColor(s.quadrant);
            const isActive = activeLabel === s.sector;
            const size = isActive ? 7 : 5;
            const opacity = isActive ? 1 : dimOpacity ?? 0.7;
            return (
              <g
                key={`lead-${s.etf}`}
                onMouseEnter={() => setHovered(s.sector)}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => { e.stopPropagation(); handleClick(s.sector); }}
                style={{ cursor: "pointer" }}
              >
                <rect x={x - size} y={y - size} width={size * 2} height={size * 2} fill={color} stroke={isActive ? "#fff" : "none"} strokeWidth={1} opacity={opacity} rx={1} />
                {!isActive && <text x={x} y={y - size - 4} textAnchor="middle" fill={color} fontSize={7} opacity={dimOpacity ?? 0.6}>{s.etf}</text>}
              </g>
            );
          })}

          {/* Enhanced tooltip */}
          {activeScore && (() => {
            const tx = tooltipFlipX ? tooltipX - 140 : tooltipX + 12;
            const ty = tooltipFlipY ? tooltipY + 12 : tooltipY - 90;
            const color = quadrantDotColor(activeScore.quadrant);
            const prevTrailPt = activeScore.rrgTrail && activeScore.rrgTrail.length >= 2
              ? activeScore.rrgTrail[activeScore.rrgTrail.length - 2]
              : null;
            const velocity = prevTrailPt
              ? Math.sqrt(
                  Math.pow(activeScore.rsRatio - prevTrailPt.rsRatio, 2) +
                  Math.pow(activeScore.rsMomentum - prevTrailPt.rsMomentum, 2)
                ).toFixed(2)
              : "—";
            return (
              <g filter="url(#rrg-shadow)">
                <rect x={tx} y={ty} width={130} height={82} rx={6} fill="#1a1a1a" stroke="#333" strokeWidth={1} />
                <text x={tx + 8} y={ty + 16} fill={color} fontSize={11} fontWeight="bold">{activeScore.etf}</text>
                <text x={tx + 122} y={ty + 16} textAnchor="end" fill="#888" fontSize={9}>{activeScore.quadrant}</text>
                <text x={tx + 8} y={ty + 30} fill="#a0a0a0" fontSize={9}>{activeScore.sector}</text>
                <text x={tx + 8} y={ty + 44} fill="#888" fontSize={9}>Score: <tspan fill="#fff">{activeScore.compositeScore}</tspan></text>
                <text x={tx + 8} y={ty + 57} fill="#888" fontSize={9}>RS-R: <tspan fill="#fff">{activeScore.rsRatio.toFixed(2)}</tspan>  RS-M: <tspan fill="#fff">{activeScore.rsMomentum.toFixed(2)}</tspan></text>
                <text x={tx + 8} y={ty + 70} fill="#888" fontSize={9}>Velocity: <tspan fill="#fff">{velocity}</tspan></text>
              </g>
            );
          })()}

          {/* Legend */}
          {(subSectorScores.length > 0 || crossAssetScores.length > 0 || leadershipBasketScores.length > 0) && (
            <g>
              <circle cx={PAD + 10} cy={H - 18} r={4} fill="#888" />
              <text x={PAD + 20} y={H - 14} fill="#666" fontSize={9}>Sector</text>
              {subSectorScores.length > 0 && (
                <>
                  <polygon points={`${PAD + 70},${H - 22} ${PAD + 64},${H - 14} ${PAD + 76},${H - 14}`} fill="#888" />
                  <text x={PAD + 82} y={H - 14} fill="#666" fontSize={9}>Sub-sector</text>
                </>
              )}
              {crossAssetScores.length > 0 && (
                <>
                  <polygon points={`${PAD + 145},${H - 22} ${PAD + 150},${H - 18} ${PAD + 145},${H - 14} ${PAD + 140},${H - 18}`} fill="#888" />
                  <text x={PAD + 156} y={H - 14} fill="#666" fontSize={9}>Cross-asset</text>
                </>
              )}
              {leadershipBasketScores.length > 0 && (
                <>
                  <rect x={PAD + 218} y={H - 22} width={8} height={8} fill="#888" rx={1} />
                  <text x={PAD + 232} y={H - 14} fill="#666" fontSize={9}>Leadership</text>
                </>
              )}
            </g>
          )}
        </svg>

        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1">
          <button
            onClick={() => setZoomLevel((z) => Math.min(z + 1, 3))}
            disabled={zoomLevel >= 3}
            className="rounded border border-[#333] bg-[#1a1a1a] p-1 text-[#888] hover:text-white hover:bg-[#2a2a2a] disabled:opacity-30"
            aria-label="Zoom in"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.max(z - 1, 0))}
            disabled={zoomLevel <= 0}
            className="rounded border border-[#333] bg-[#1a1a1a] p-1 text-[#888] hover:text-white hover:bg-[#2a2a2a] disabled:opacity-30"
            aria-label="Zoom out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          {zoomLevel > 0 && (
            <button
              onClick={() => setZoomLevel(0)}
              className="rounded border border-[#333] bg-[#1a1a1a] p-1 text-[#888] hover:text-white hover:bg-[#2a2a2a]"
              aria-label="Reset zoom"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
