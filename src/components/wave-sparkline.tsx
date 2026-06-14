"use client";

import { useMemo } from "react";
import type { P2ImpulsePattern } from "@/lib/phase2-wave-detector";

interface WaveSparklineProps {
  pattern: P2ImpulsePattern;
  width?: number;
  height?: number;
}

export function WaveSparkline({
  pattern,
  width = 280,
  height = 80,
}: WaveSparklineProps) {
  const { impulsePath, correctionPath, fibRect, labels, viewBox } = useMemo(() => {
    const w = pattern.waves;
    const isBull = pattern.direction === 1;

    // Collect all points
    const points = [
      { label: "W0", price: w.w0.price, bar: w.w0.barIndex },
      { label: "W1", price: w.w1.price, bar: w.w1.barIndex },
      { label: "W2", price: w.w2.price, bar: w.w2.barIndex },
      { label: "W3", price: w.w3.price, bar: w.w3.barIndex },
      { label: "W4", price: w.w4.price, bar: w.w4.barIndex },
      { label: "W5", price: w.w5.price, bar: w.w5.barIndex },
    ];

    const corr = pattern.correction;
    if (corr) {
      points.push(
        { label: "A", price: corr.points.a.price, bar: corr.points.a.barIndex },
        { label: "B", price: corr.points.b.price, bar: corr.points.b.barIndex },
        { label: "C", price: corr.points.c.price, bar: corr.points.c.barIndex },
      );
    }

    // Compute ranges
    let minPrice = Infinity, maxPrice = -Infinity;
    let minBar = Infinity, maxBar = -Infinity;
    for (const p of points) {
      if (p.price < minPrice) minPrice = p.price;
      if (p.price > maxPrice) maxPrice = p.price;
      if (p.bar < minBar) minBar = p.bar;
      if (p.bar > maxBar) maxBar = p.bar;
    }

    const pricePad = (maxPrice - minPrice) * 0.12 || 1;
    minPrice -= pricePad;
    maxPrice += pricePad;
    const barRange = maxBar - minBar || 1;
    const priceRange = maxPrice - minPrice;

    const px = 20; // horizontal padding for labels
    const py = 12; // vertical padding for labels
    const chartW = width - px * 2;
    const chartH = height - py * 2;

    const toX = (bar: number) => px + ((bar - minBar) / barRange) * chartW;
    const toY = (price: number) => py + (1 - (price - minPrice) / priceRange) * chartH;

    // Impulse path (W0→W5)
    const impulsePoints = [w.w0, w.w1, w.w2, w.w3, w.w4, w.w5];
    const impulsePath = impulsePoints
      .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.barIndex).toFixed(1)},${toY(p.price).toFixed(1)}`)
      .join("");

    // Correction path (W5→A→B→C)
    let correctionPath = "";
    if (corr) {
      const cp = [w.w5, corr.points.a, corr.points.b, corr.points.c];
      correctionPath = cp
        .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.barIndex).toFixed(1)},${toY(p.price).toFixed(1)}`)
        .join("");
    }

    // Fibonacci 38.2%-61.8% zone (shaded rectangle)
    const impulseRange = Math.abs(w.w5.price - w.w0.price);
    const f382Price = isBull
      ? w.w5.price - impulseRange * 0.382
      : w.w5.price + impulseRange * 0.382;
    const f618Price = isBull
      ? w.w5.price - impulseRange * 0.618
      : w.w5.price + impulseRange * 0.618;

    const fibTop = Math.max(f382Price, f618Price);
    const fibBottom = Math.min(f382Price, f618Price);
    const fibRect = {
      x: toX(w.w5.barIndex),
      y: toY(fibTop),
      width: toX(maxBar) - toX(w.w5.barIndex),
      height: toY(fibBottom) - toY(fibTop),
    };

    // Labels
    const labels = points.map((p) => {
      const x = toX(p.bar);
      const y = toY(p.price);
      // Determine if label should go above or below
      const isHigh = ["W1", "W3", "W5", "B"].includes(p.label) === isBull
        || ["W0", "W2", "W4", "A", "C"].includes(p.label) !== isBull;
      return {
        x,
        y: isHigh ? y - 5 : y + 10,
        text: p.label,
        color: p.label.startsWith("W") ? undefined : "#22d3ee", // cyan for ABC
      };
    });

    return {
      impulsePath,
      correctionPath,
      fibRect,
      labels,
      viewBox: `0 0 ${width} ${height}`,
    };
  }, [pattern, width, height]);

  const strokeColor = pattern.direction === 1 ? "#22c55e" : "#ef4444";

  return (
    <svg width={width} height={height} viewBox={viewBox} className="block">
      {/* Fib zone */}
      {fibRect.width > 0 && fibRect.height > 0 && (
        <rect
          x={fibRect.x}
          y={fibRect.y}
          width={Math.max(fibRect.width, 4)}
          height={fibRect.height}
          fill={pattern.direction === 1 ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)"}
          stroke={pattern.direction === 1 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}
          strokeWidth={0.5}
        />
      )}

      {/* Impulse path */}
      <path
        d={impulsePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Correction path */}
      {correctionPath && (
        <path
          d={correctionPath}
          fill="none"
          stroke="#22d3ee"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4,2"
        />
      )}

      {/* Wave labels */}
      {labels.map((lbl, i) => (
        <text
          key={i}
          x={lbl.x}
          y={lbl.y}
          textAnchor="middle"
          fill={lbl.color ?? "#a78bfa"}
          fontSize={8}
          fontWeight="bold"
          fontFamily="monospace"
        >
          {lbl.text}
        </text>
      ))}
    </svg>
  );
}
