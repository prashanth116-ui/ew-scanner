"use client";

import { useMemo } from "react";
import type { CryptoRotationResult } from "@/lib/crypto-rotation/types";

interface SnapshotPoint {
  date: string;
  sectors: Record<string, number>; // sector name -> composite score
}

const CHART_COLORS = [
  "#4ade80", // green
  "#22d3ee", // cyan
  "#fbbf24", // amber
  "#f87171", // red
  "#a78bfa", // purple
  "#fb923c", // orange
  "#2dd4bf", // teal
  "#f472b6", // pink
  "#818cf8", // indigo
  "#34d399", // emerald
];

/**
 * CryptoHistoryChart renders a line chart of sector composite scores
 * over time using localStorage snapshots.
 * Only renders when >= 3 data points exist.
 */
export function CryptoHistoryChart({ data }: { data: CryptoRotationResult }) {
  const history = useMemo(() => loadCryptoHistory(), []);

  // Build time series from localStorage history
  const { points, sectorNames } = useMemo(() => {
    if (history.length < 3) return { points: [], sectorNames: [] };

    // Get unique sector names from most recent snapshot
    const names = history[history.length - 1].sectors.map((s) => s.name);

    const pts: SnapshotPoint[] = history.map((snap) => {
      const sectors: Record<string, number> = {};
      for (const s of snap.sectors) {
        sectors[s.name] = s.composite;
      }
      return { date: snap.date, sectors };
    });

    return { points: pts, sectorNames: names };
  }, [history]);

  if (points.length < 3) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-[#666]">
          History chart requires at least 3 daily snapshots.
          Currently {points.length} snapshot{points.length !== 1 ? "s" : ""} recorded.
        </p>
        <p className="text-[10px] text-[#555] mt-1">
          Visit this page daily to build history automatically.
        </p>
      </div>
    );
  }

  // SVG dimensions
  const W = 600;
  const H = 250;
  const PAD_L = 40;
  const PAD_R = 15;
  const PAD_T = 15;
  const PAD_B = 35;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  // Y-axis: 0-100 (composite score range)
  const yMin = 0;
  const yMax = 100;
  const scaleY = (v: number) =>
    PAD_T + chartH - ((v - yMin) / (yMax - yMin)) * chartH;
  const scaleX = (i: number) =>
    PAD_L + (i / (points.length - 1)) * chartW;

  // Y-axis gridlines
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Crypto sector composite score history"
      >
        {/* Y-axis gridlines */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_L}
              y1={scaleY(tick)}
              x2={W - PAD_R}
              y2={scaleY(tick)}
              stroke="#222"
              strokeWidth={0.5}
            />
            <text
              x={PAD_L - 5}
              y={scaleY(tick) + 4}
              textAnchor="end"
              fill="#555"
              fontSize={9}
            >
              {tick}
            </text>
          </g>
        ))}

        {/* X-axis labels (show first, middle, last date) */}
        {[0, Math.floor(points.length / 2), points.length - 1].map((idx) => (
          <text
            key={idx}
            x={scaleX(idx)}
            y={H - 5}
            textAnchor="middle"
            fill="#555"
            fontSize={9}
          >
            {points[idx].date.slice(5)} {/* MM-DD */}
          </text>
        ))}

        {/* Sector lines */}
        {sectorNames.map((name, si) => {
          const color = CHART_COLORS[si % CHART_COLORS.length];
          const linePoints = points
            .map((pt, i) => {
              const score = pt.sectors[name];
              if (score == null) return null;
              return `${scaleX(i)},${scaleY(score)}`;
            })
            .filter(Boolean)
            .join(" ");

          if (!linePoints) return null;

          // Current (last) value for label
          const lastScore = points[points.length - 1].sectors[name];

          return (
            <g key={name}>
              <polyline
                points={linePoints}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                opacity={0.7}
              />
              {/* Label at the end of the line */}
              {lastScore != null && (
                <text
                  x={scaleX(points.length - 1) + 3}
                  y={scaleY(lastScore) + 3}
                  fill={color}
                  fontSize={8}
                  opacity={0.8}
                >
                  {lastScore}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
        {sectorNames.map((name, si) => (
          <div key={name} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                backgroundColor: CHART_COLORS[si % CHART_COLORS.length],
              }}
            />
            <span className="text-[10px] text-[#888]">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── localStorage helper ──

interface CryptoHistorySnapshot {
  date: string;
  sectors: Array<{ name: string; composite: number }>;
}

function loadCryptoHistory(): CryptoHistorySnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("ew-crypto-brief-snapshot");
    if (!raw) return [];
    const store = JSON.parse(raw) as {
      snapshots: Array<{
        date: string;
        sectors: Array<{ name: string; composite: number }>;
      }>;
      version: number;
    };
    // Return oldest first for charting
    return [...store.snapshots].reverse();
  } catch {
    return [];
  }
}
