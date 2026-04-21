"use client";

import type { FibExtension } from "@/lib/ew-types";

interface FibBarProps {
  retracementDepth: number; // 0 = at low, 1 = at ATH
  extensions?: FibExtension[];
  width?: number;
  height?: number;
}

const FIB_TICKS = [
  { ratio: 0.236, label: "23.6" },
  { ratio: 0.382, label: "38.2" },
  { ratio: 0.5, label: "50" },
  { ratio: 0.618, label: "61.8" },
  { ratio: 0.786, label: "78.6" },
];

const EXT_TICKS = [
  { ratio: 1.0, label: "100" },
  { ratio: 1.618, label: "161.8" },
  { ratio: 2.618, label: "261.8" },
];

export function EWFibBar({ retracementDepth, extensions, width = 180, height = 28 }: FibBarProps) {
  const hasExtensions = extensions && extensions.length > 0;
  const maxScale = hasExtensions ? 2.618 : 1.2;
  const ticks = hasExtensions ? [...FIB_TICKS, ...EXT_TICKS] : FIB_TICKS;

  const barY = 8;
  const barH = 4;
  const padding = 4;
  const barW = width - padding * 2;

  // Clamp depth to display range
  const clampedDepth = Math.max(0, Math.min(maxScale, retracementDepth));
  const markerX = padding + (clampedDepth / maxScale) * barW;

  // Golden zone (38.2% - 61.8%)
  const gzStart = padding + (0.382 / maxScale) * barW;
  const gzEnd = padding + (0.618 / maxScale) * barW;

  // Extension zone (100%+) — light blue highlight
  const extStart = hasExtensions ? padding + (1.0 / maxScale) * barW : 0;

  return (
    <svg width={width} height={height} className="block">
      {/* Background bar */}
      <rect
        x={padding}
        y={barY}
        width={barW}
        height={barH}
        rx={2}
        fill="#262626"
      />

      {/* Extension zone highlight */}
      {hasExtensions && (
        <rect
          x={extStart}
          y={barY - 1}
          width={barW - (extStart - padding)}
          height={barH + 2}
          rx={1}
          fill="rgba(91, 163, 230, 0.1)"
        />
      )}

      {/* Golden zone highlight */}
      <rect
        x={gzStart}
        y={barY - 1}
        width={gzEnd - gzStart}
        height={barH + 2}
        rx={1}
        fill="rgba(234, 179, 8, 0.2)"
      />

      {/* Tick marks */}
      {ticks.map(({ ratio, label }) => {
        const x = padding + (ratio / maxScale) * barW;
        return (
          <g key={ratio}>
            <line
              x1={x}
              y1={barY - 2}
              x2={x}
              y2={barY + barH + 2}
              stroke={ratio >= 1.0 ? "#3b6fa0" : "#444"}
              strokeWidth={0.5}
            />
            <text
              x={x}
              y={barY + barH + 10}
              textAnchor="middle"
              fill={ratio >= 1.0 ? "#5ba3e6" : "#555"}
              fontSize={7}
              fontFamily="monospace"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Extension target markers */}
      {extensions?.map((ext) => {
        if (ext.ratio > maxScale) return null;
        const x = padding + (ext.ratio / maxScale) * barW;
        return (
          <line
            key={ext.ratio}
            x1={x}
            y1={barY - 3}
            x2={x}
            y2={barY + barH + 3}
            stroke="#5ba3e6"
            strokeWidth={1}
            strokeDasharray="2,2"
            opacity={0.5}
          />
        );
      })}

      {/* Current position marker */}
      <circle
        cx={markerX}
        cy={barY + barH / 2}
        r={3.5}
        fill={
          retracementDepth >= 1.0
            ? "#5ba3e6" // Beyond ATH — extension zone
            : retracementDepth >= 0.382 && retracementDepth <= 0.618
              ? "#eab308" // Golden zone
              : "#5ba3e6"
        }
        stroke="#1a1a1a"
        strokeWidth={1}
      />
    </svg>
  );
}
