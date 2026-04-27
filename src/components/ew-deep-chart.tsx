"use client";

import { useEffect, useRef } from "react";
import type { PriceSeries, WavePoint, FibLevel, FibExtension, DeepAnalysisResult } from "@/lib/ew-types";

interface DeepChartProps {
  series: PriceSeries;
  waveLabels?: WavePoint[];
  fibLevels?: FibLevel[];
  fibExtensions?: FibExtension[];
  keyLevels?: DeepAnalysisResult["keyLevels"];
  nextTarget?: number | null;
  invalidation?: number | null;
  width?: number;
  height?: number;
}

export function EWDeepChart({
  series,
  waveLabels,
  fibLevels,
  fibExtensions,
  keyLevels,
  nextTarget,
  invalidation,
  width = 560,
  height = 360,
}: DeepChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof import("lightweight-charts").createChart> | null>(null);

  useEffect(() => {
    if (!containerRef.current || series.close.length === 0) return;

    let disposed = false;

    const init = async () => {
      const { createChart, CandlestickSeries, HistogramSeries, LineSeries } = await import("lightweight-charts");

      if (disposed || !containerRef.current) return;

      // Clear previous chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      const chart = createChart(containerRef.current, {
        width,
        height,
        layout: {
          background: { color: "#1a1a1a" },
          textColor: "#a0a0a0",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "#2a2a2a" },
          horzLines: { color: "#2a2a2a" },
        },
        crosshair: {
          vertLine: { color: "#5ba3e6", width: 1, style: 2, labelBackgroundColor: "#185FA5" },
          horzLine: { color: "#5ba3e6", width: 1, style: 2, labelBackgroundColor: "#185FA5" },
        },
        rightPriceScale: {
          borderColor: "#2a2a2a",
        },
        timeScale: {
          borderColor: "#2a2a2a",
          timeVisible: false,
        },
      });

      chartRef.current = chart;

      // Candlestick data — use minimum array length to prevent out-of-bounds
      const barCount = Math.min(
        series.timestamps.length,
        series.open.length,
        series.high.length,
        series.low.length,
        series.close.length,
        series.volume.length
      );
      const candleData = Array.from({ length: barCount }, (_, i) => ({
        time: series.timestamps[i] as import("lightweight-charts").UTCTimestamp,
        open: series.open[i],
        high: series.high[i],
        low: series.low[i],
        close: series.close[i],
      }));

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
        borderVisible: false,
      });
      candleSeries.setData(candleData);

      // Volume bars
      const volData = Array.from({ length: barCount }, (_, i) => ({
        time: series.timestamps[i] as import("lightweight-charts").UTCTimestamp,
        value: series.volume[i],
        color: series.close[i] >= series.open[i] ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
      }));

      const volSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
      });
      volSeries.setData(volData);
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      // Wave labels as markers
      if (waveLabels && waveLabels.length > 0) {
        const markers = waveLabels
          .filter((w) => w.index >= 0 && w.index < series.timestamps.length)
          .map((w) => ({
            time: series.timestamps[w.index] as import("lightweight-charts").UTCTimestamp,
            position: (w.type === "high" ? "aboveBar" : "belowBar") as "aboveBar" | "belowBar",
            color: "#c084fc",
            shape: "circle" as const,
            text: w.label,
            size: 1,
          }));
        // Use setMarkers if available, or attachPrimitive-based approach
        if ("setMarkers" in candleSeries) {
          (candleSeries as unknown as { setMarkers: (m: typeof markers) => void }).setMarkers(markers);
        }
      }

      // Fib retracement lines
      if (fibLevels) {
        for (const fib of fibLevels) {
          if (fib.ratio === 0.236 || fib.ratio === 0.382 || fib.ratio === 0.5 || fib.ratio === 0.618 || fib.ratio === 0.786) {
            const lineSeries = chart.addSeries(LineSeries, {
              color: fib.ratio >= 0.382 && fib.ratio <= 0.618
                ? "rgba(234, 179, 8, 0.4)"
                : "rgba(91, 163, 230, 0.3)",
              lineWidth: 1,
              lineStyle: 2, // dashed
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: false,
            });
            lineSeries.setData([
              { time: series.timestamps[0] as import("lightweight-charts").UTCTimestamp, value: fib.price },
              { time: series.timestamps[series.timestamps.length - 1] as import("lightweight-charts").UTCTimestamp, value: fib.price },
            ]);
          }
        }
      }

      // Fib extension lines
      if (fibExtensions) {
        for (const ext of fibExtensions) {
          if (ext.ratio <= 2.618) {
            const lineSeries = chart.addSeries(LineSeries, {
              color: "rgba(91, 163, 230, 0.4)",
              lineWidth: 1,
              lineStyle: 3, // dotted
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: false,
            });
            lineSeries.setData([
              { time: series.timestamps[0] as import("lightweight-charts").UTCTimestamp, value: ext.price },
              { time: series.timestamps[series.timestamps.length - 1] as import("lightweight-charts").UTCTimestamp, value: ext.price },
            ]);
          }
        }
      }

      // Key levels from Claude analysis
      if (keyLevels) {
        for (const kl of keyLevels) {
          const isSupport = kl.label.toLowerCase().includes("support") || kl.label.toLowerCase().includes("invalidation");
          const lineSeries = chart.addSeries(LineSeries, {
            color: isSupport ? "rgba(239, 68, 68, 0.5)" : "rgba(34, 197, 94, 0.5)",
            lineWidth: 1,
            lineStyle: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          lineSeries.setData([
            { time: series.timestamps[0] as import("lightweight-charts").UTCTimestamp, value: kl.price },
            { time: series.timestamps[series.timestamps.length - 1] as import("lightweight-charts").UTCTimestamp, value: kl.price },
          ]);
        }
      }

      // Next target line (prominent green)
      if (nextTarget != null) {
        const targetLine = chart.addSeries(LineSeries, {
          color: "rgba(34, 197, 94, 0.8)",
          lineWidth: 2,
          lineStyle: 2, // dashed
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
          title: "Target",
        });
        targetLine.setData([
          { time: series.timestamps[0] as import("lightweight-charts").UTCTimestamp, value: nextTarget },
          { time: series.timestamps[series.timestamps.length - 1] as import("lightweight-charts").UTCTimestamp, value: nextTarget },
        ]);
      }

      // Invalidation line (prominent red)
      if (invalidation != null) {
        const invalLine = chart.addSeries(LineSeries, {
          color: "rgba(239, 68, 68, 0.8)",
          lineWidth: 2,
          lineStyle: 2, // dashed
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
          title: "Invalidation",
        });
        invalLine.setData([
          { time: series.timestamps[0] as import("lightweight-charts").UTCTimestamp, value: invalidation },
          { time: series.timestamps[series.timestamps.length - 1] as import("lightweight-charts").UTCTimestamp, value: invalidation },
        ]);
      }

      chart.timeScale().fitContent();
    };

    init();

    return () => {
      disposed = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [series, waveLabels, fibLevels, fibExtensions, keyLevels, nextTarget, invalidation, width, height]);

  return <div ref={containerRef} className="rounded-lg overflow-hidden" />;
}
