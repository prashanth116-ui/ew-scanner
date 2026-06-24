"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import type { SectorRotationScore } from "@/lib/sector-rotation/types";
import type { DailySnapshot } from "@/lib/sector-rotation/history";
import { getSectorTimeseries } from "@/lib/sector-rotation/history";
import { quadrantDotColor } from "./helpers";
import { CollapsiblePanel } from "./shared";

// ── Constants ──

const PERIODS = [7, 14, 30, 60] as const;
type Period = (typeof PERIODS)[number];

const PADDING = { left: 50, right: 20, top: 20, bottom: 30 };
const CHART_WIDTH = 600;
const CHART_HEIGHT = 300;
const PLOT_W = CHART_WIDTH - PADDING.left - PADDING.right;
const PLOT_H = CHART_HEIGHT - PADDING.top - PADDING.bottom;

const Y_TICKS = [0, 25, 50, 75, 100];

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate().toString().padStart(2, "0")}`;
}

// ── Component ──

export function HistoryChart({
  sectors,
  history,
  collapsed,
  onToggle,
}: {
  sectors: SectorRotationScore[];
  history: DailySnapshot[];
  collapsed: boolean;
  onToggle: (id: string) => void;
}) {
  const [period, setPeriod] = useState<Period>(30);

  // Default: top 5 sectors by current compositeScore
  const [visibleSectors, setVisibleSectors] = useState<Set<string>>(() => {
    const top5 = [...sectors]
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, 5)
      .map((s) => s.sector);
    return new Set(top5);
  });

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Filter history by period (history is newest-first)
  const filteredHistory = useMemo(() => {
    return history.slice(0, period);
  }, [history, period]);

  // Compute timeseries for each sector (oldest-first for charting)
  const timeseries = useMemo(() => {
    const map = new Map<string, { date: string; score: number }[]>();
    for (const s of sectors) {
      const series = getSectorTimeseries(filteredHistory, s.sector);
      if (series.length > 0) {
        map.set(s.sector, series);
      }
    }
    return map;
  }, [sectors, filteredHistory]);

  // All unique dates from filtered history, oldest-first
  const dates = useMemo(() => {
    return [...filteredHistory].reverse().map((s) => s.date);
  }, [filteredHistory]);

  // X-axis date labels (~5 evenly-spaced)
  const xLabels = useMemo(() => {
    if (dates.length === 0) return [];
    if (dates.length <= 5) return dates.map((d, i) => ({ date: d, index: i }));
    const step = (dates.length - 1) / 4;
    return Array.from({ length: 5 }, (_, i) => {
      const idx = Math.round(i * step);
      return { date: dates[idx], index: idx };
    });
  }, [dates]);

  // Quadrant color lookup
  const sectorQuadrantMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sectors) {
      map.set(s.sector, quadrantDotColor(s.quadrant));
    }
    return map;
  }, [sectors]);

  // Coordinate helpers
  const xScale = useCallback(
    (i: number) => {
      if (dates.length <= 1) return PADDING.left;
      return PADDING.left + (i / (dates.length - 1)) * PLOT_W;
    },
    [dates.length],
  );

  const yScale = useCallback((score: number) => {
    return PADDING.top + PLOT_H - (score / 100) * PLOT_H;
  }, []);

  // Build polyline points for a sector
  const buildPoints = useCallback(
    (series: { date: string; score: number }[]) => {
      return series
        .map((pt) => {
          const idx = dates.indexOf(pt.date);
          if (idx < 0) return null;
          return `${xScale(idx)},${yScale(pt.score)}`;
        })
        .filter(Boolean)
        .join(" ");
    },
    [dates, xScale, yScale],
  );

  // Mouse handler to compute hovered index
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || dates.length === 0) return;
      const rect = svg.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * CHART_WIDTH;
      const plotX = svgX - PADDING.left;
      if (plotX < 0 || plotX > PLOT_W) {
        setHoveredIndex(null);
        return;
      }
      const idx = Math.round((plotX / PLOT_W) * (dates.length - 1));
      setHoveredIndex(Math.max(0, Math.min(idx, dates.length - 1)));
    },
    [dates.length],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  // Toggle sector visibility
  const toggleSector = useCallback((sector: string) => {
    setVisibleSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  }, []);

  // Biggest movers: sectors with largest absolute score delta over the period
  const biggestMovers = useMemo(() => {
    if (filteredHistory.length < 2) return [];

    const oldest = filteredHistory[filteredHistory.length - 1]; // oldest snapshot
    const newest = filteredHistory[0]; // newest snapshot

    const movers: { sector: string; from: number; to: number; change: number }[] = [];

    for (const ns of newest.sectors) {
      const os = oldest.sectors.find((s) => s.sector === ns.sector);
      if (!os) continue;
      movers.push({
        sector: ns.sector,
        from: os.compositeScore,
        to: ns.compositeScore,
        change: ns.compositeScore - os.compositeScore,
      });
    }

    movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    return movers.slice(0, 5);
  }, [filteredHistory]);

  // Tooltip data for hovered index
  const tooltipData = useMemo(() => {
    if (hoveredIndex === null || !dates[hoveredIndex]) return null;
    const date = dates[hoveredIndex];
    const scores: { sector: string; score: number; color: string }[] = [];
    for (const sector of visibleSectors) {
      const series = timeseries.get(sector);
      if (!series) continue;
      const pt = series.find((p) => p.date === date);
      if (pt) {
        scores.push({
          sector,
          score: pt.score,
          color: sectorQuadrantMap.get(sector) ?? "#666",
        });
      }
    }
    scores.sort((a, b) => b.score - a.score);
    return { date, scores };
  }, [hoveredIndex, dates, visibleSectors, timeseries, sectorQuadrantMap]);

  // Tooltip position: flip when near right edge
  const tooltipX = useMemo(() => {
    if (hoveredIndex === null) return 0;
    const x = xScale(hoveredIndex);
    const tooltipWidth = 150;
    if (x + tooltipWidth + 10 > CHART_WIDTH - PADDING.right) {
      return x - tooltipWidth - 10;
    }
    return x + 10;
  }, [hoveredIndex, xScale]);

  return (
    <CollapsiblePanel id="sector-history" title="Sector History" collapsed={collapsed} onToggle={onToggle}>
      {/* Period selector pills */}
      <div className="mb-3 flex items-center gap-1.5">
        <span className="mr-1 text-[11px] text-[#666]">Period:</span>
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              period === p
                ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border border-[#5ba3e6]/30"
                : "text-[#666] hover:text-[#a0a0a0] border border-transparent hover:border-[#333]"
            }`}
          >
            {p}d
          </button>
        ))}
      </div>

      {/* Sector toggle checkboxes */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {sectors.map((s) => (
          <button
            key={s.sector}
            onClick={() => toggleSector(s.sector)}
            className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              visibleSectors.has(s.sector)
                ? "border-[#444] bg-[#1a1a1a] text-[#ccc]"
                : "border-transparent bg-transparent text-[#555] hover:border-[#333] hover:text-[#888]"
            }`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: quadrantDotColor(s.quadrant) }}
            />
            {s.sector}
          </button>
        ))}
      </div>

      {/* SVG Chart */}
      {dates.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-[#666]">
          No history data available. Data will accumulate over time.
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Gridlines and Y-axis labels */}
          {Y_TICKS.map((tick) => (
            <g key={tick}>
              <line
                x1={PADDING.left}
                y1={yScale(tick)}
                x2={CHART_WIDTH - PADDING.right}
                y2={yScale(tick)}
                stroke="#1a1a1a"
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 8}
                y={yScale(tick) + 4}
                textAnchor="end"
                fill="#555"
                fontSize={10}
              >
                {tick}
              </text>
            </g>
          ))}

          {/* X-axis date labels */}
          {xLabels.map(({ date, index }) => (
            <text
              key={date}
              x={xScale(index)}
              y={CHART_HEIGHT - 8}
              textAnchor="middle"
              fill="#555"
              fontSize={10}
            >
              {formatDate(date)}
            </text>
          ))}

          {/* Sector polylines */}
          {sectors.map((s) => {
            if (!visibleSectors.has(s.sector)) return null;
            const series = timeseries.get(s.sector);
            if (!series || series.length < 2) return null;
            const points = buildPoints(series);
            if (!points) return null;
            const color = sectorQuadrantMap.get(s.sector) ?? "#666";

            return (
              <polyline
                key={s.sector}
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                opacity={
                  hoveredIndex !== null && tooltipData?.scores.some((sc) => sc.sector === s.sector)
                    ? 1
                    : 0.7
                }
              />
            );
          })}

          {/* Hover vertical line */}
          {hoveredIndex !== null && (
            <line
              x1={xScale(hoveredIndex)}
              y1={PADDING.top}
              x2={xScale(hoveredIndex)}
              y2={CHART_HEIGHT - PADDING.bottom}
              stroke="#444"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          )}

          {/* Tooltip */}
          {tooltipData && hoveredIndex !== null && (
            <g>
              <rect
                x={tooltipX}
                y={PADDING.top}
                width={150}
                height={20 + tooltipData.scores.length * 16}
                rx={4}
                fill="#1a1a1a"
                stroke="#333"
                strokeWidth={1}
                opacity={0.95}
              />
              <text
                x={tooltipX + 8}
                y={PADDING.top + 14}
                fill="#aaa"
                fontSize={10}
                fontWeight="bold"
              >
                {formatDate(tooltipData.date)}
              </text>
              {tooltipData.scores.map((sc, i) => (
                <g key={sc.sector}>
                  <circle
                    cx={tooltipX + 12}
                    cy={PADDING.top + 28 + i * 16}
                    r={3}
                    fill={sc.color}
                  />
                  <text
                    x={tooltipX + 20}
                    y={PADDING.top + 32 + i * 16}
                    fill="#ccc"
                    fontSize={10}
                  >
                    {sc.sector}
                  </text>
                  <text
                    x={tooltipX + 140}
                    y={PADDING.top + 32 + i * 16}
                    fill="#ccc"
                    fontSize={10}
                    textAnchor="end"
                  >
                    {sc.score.toFixed(0)}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>
      )}

      {/* Biggest Movers Table */}
      {biggestMovers.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-[12px] font-semibold text-[#888]">Biggest Movers ({period}d)</h3>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[#666]">
                <th className="pb-1 text-left font-medium">Sector</th>
                <th className="pb-1 text-right font-medium">From</th>
                <th className="pb-1 text-right font-medium">To</th>
                <th className="pb-1 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {biggestMovers.map((m) => (
                <tr key={m.sector} className="border-t border-[#1a1a1a]">
                  <td className="py-1 text-[#ccc]">{m.sector}</td>
                  <td className="py-1 text-right text-[#888]">{m.from.toFixed(1)}</td>
                  <td className="py-1 text-right text-[#888]">{m.to.toFixed(1)}</td>
                  <td
                    className={`py-1 text-right font-medium ${
                      m.change > 0 ? "text-green-400" : m.change < 0 ? "text-red-400" : "text-[#666]"
                    }`}
                  >
                    {m.change > 0 ? "+" : ""}
                    {m.change.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsiblePanel>
  );
}
