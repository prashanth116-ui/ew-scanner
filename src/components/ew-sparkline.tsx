"use client";

import { useMemo, useState } from "react";
import type { PriceSeries, WavePoint } from "@/lib/ew-types";

interface SparklineProps {
  series: PriceSeries;
  athIdx?: number;
  lowIdx?: number;
  fibLevels?: { ratio: number; price: number }[];
  waveLabels?: WavePoint[];
  width?: number;
  height?: number;
}

export function EWSparkline({
  series,
  athIdx,
  lowIdx,
  fibLevels,
  waveLabels,
  width = 200,
  height = 60,
}: SparklineProps) {
  const [hover, setHover] = useState<{ x: number; y: number; price: number; date: string } | null>(null);

  const { segments, fibLines, labels, yMin, yMax } = useMemo(() => {
    const { close, timestamps } = series;
    if (close.length === 0) return { segments: [], fibLines: [], labels: [], yMin: 0, yMax: 0 };

    // Find effective indices
    let aIdx = athIdx ?? 0;
    let lIdx = lowIdx ?? 0;
    if (athIdx == null || lowIdx == null) {
      let maxVal = -Infinity;
      for (let i = 0; i < close.length; i++) {
        if (close[i] > maxVal) { maxVal = close[i]; aIdx = i; }
      }
      let minVal = Infinity;
      for (let i = aIdx; i < close.length; i++) {
        if (close[i] < minVal) { minVal = close[i]; lIdx = i; }
      }
    }
    aIdx = Math.max(0, Math.min(aIdx, close.length - 1));
    lIdx = Math.max(aIdx, Math.min(lIdx, close.length - 1));

    // Y range with 5% padding
    let yMin = Infinity, yMax = -Infinity;
    for (const v of close) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
    const pad = (yMax - yMin) * 0.05 || 1;
    yMin -= pad;
    yMax += pad;

    const px = 3; // horizontal padding
    const py = 2; // vertical padding
    const chartW = width - px * 2;
    const chartH = height - py * 2;

    const toX = (i: number) => px + (i / Math.max(close.length - 1, 1)) * chartW;
    const toY = (v: number) => py + (1 - (v - yMin) / (yMax - yMin)) * chartH;

    // Build 3 segments
    const segDefs: { startIdx: number; endIdx: number; color: string; strokeW: number }[] = [
      { startIdx: 0, endIdx: aIdx, color: "#555", strokeW: 1 },
      { startIdx: aIdx, endIdx: lIdx, color: "#ef4444", strokeW: 1.5 },
      { startIdx: lIdx, endIdx: close.length - 1, color: "#22c55e", strokeW: 1.5 },
    ];

    const segments: { path: string; color: string; strokeW: number }[] = [];
    for (const seg of segDefs) {
      if (seg.endIdx <= seg.startIdx) continue;
      const pts: string[] = [];
      for (let i = seg.startIdx; i <= seg.endIdx; i++) {
        pts.push(`${toX(i).toFixed(1)},${toY(close[i]).toFixed(1)}`);
      }
      if (pts.length > 1) {
        segments.push({ path: `M${pts.join("L")}`, color: seg.color, strokeW: seg.strokeW });
      }
    }

    // Fib level lines (golden zone only)
    const fibLines: { y: number; }[] = [];
    if (fibLevels) {
      for (const fib of fibLevels) {
        if (fib.ratio === 0.382 || fib.ratio === 0.5 || fib.ratio === 0.618) {
          fibLines.push({ y: toY(fib.price) });
        }
      }
    }

    // Wave labels mapped to SVG coordinates
    const labels: { x: number; y: number; label: string }[] = [];
    if (waveLabels) {
      for (const wp of waveLabels) {
        if (wp.index >= 0 && wp.index < close.length) {
          labels.push({
            x: toX(wp.index),
            y: toY(wp.price) + (wp.type === "high" ? -5 : 9),
            label: wp.label,
          });
        }
      }
    }

    return { segments, fibLines, labels, yMin, yMax, toX, toY, close, timestamps };
  }, [series, athIdx, lowIdx, fibLevels, waveLabels, width, height]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const { close, timestamps } = series;
    if (close.length === 0) return;

    const px = 3;
    const chartW = width - px * 2;
    const idx = Math.round(((mouseX - px) / chartW) * (close.length - 1));
    const clampedIdx = Math.max(0, Math.min(idx, close.length - 1));
    const price = close[clampedIdx];
    const date = new Date(timestamps[clampedIdx] * 1000).toISOString().slice(0, 10);

    const chartH = height - 4;
    const toY = (v: number) => 2 + (1 - (v - yMin) / (yMax - yMin || 1)) * chartH;

    setHover({ x: px + (clampedIdx / Math.max(close.length - 1, 1)) * chartW, y: toY(price), price, date });
  };

  return (
    <svg
      width={width}
      height={height}
      className="block"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      {/* Fib level lines */}
      {fibLines.map((fl, i) => (
        <line
          key={i}
          x1={3}
          y1={fl.y}
          x2={width - 3}
          y2={fl.y}
          stroke="rgba(91,163,230,0.3)"
          strokeWidth={0.5}
          strokeDasharray="2,3"
        />
      ))}

      {/* Price line segments */}
      {segments.map((seg, i) => (
        <path
          key={i}
          d={seg.path}
          fill="none"
          stroke={seg.color}
          strokeWidth={seg.strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* Wave labels at swing points */}
      {labels.map((lbl, i) => (
        <text
          key={i}
          x={lbl.x}
          y={lbl.y}
          textAnchor="middle"
          fill="#c084fc"
          fontSize={7}
          fontWeight="bold"
          fontFamily="monospace"
        >
          {lbl.label}
        </text>
      ))}

      {/* Hover crosshair + tooltip */}
      {hover && (
        <>
          <circle cx={hover.x} cy={hover.y} r={2.5} fill="#fff" opacity={0.8} />
          <line x1={hover.x} y1={0} x2={hover.x} y2={height} stroke="#fff" strokeWidth={0.5} opacity={0.3} />
          <rect
            x={Math.min(hover.x + 4, width - 70)}
            y={Math.max(hover.y - 18, 0)}
            width={66}
            height={16}
            rx={3}
            fill="#1a1a1a"
            stroke="#333"
            strokeWidth={0.5}
          />
          <text
            x={Math.min(hover.x + 7, width - 67)}
            y={Math.max(hover.y - 6, 12)}
            fill="#e6e6e6"
            fontSize={8}
            fontFamily="monospace"
          >
            ${hover.price.toFixed(2)}
          </text>
        </>
      )}
    </svg>
  );
}
