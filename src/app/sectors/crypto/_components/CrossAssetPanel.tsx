"use client";

import { useMemo } from "react";
import type { CryptoRotationResult } from "@/lib/crypto-rotation/types";
import { Sparkline } from "../../_components";

/** Strip quote currency suffix from crypto symbols. */
function baseSymbol(sym: string): string {
  return sym.replace(/-USD[T]?$/, "");
}

interface CrossAssetRow {
  name: string;
  value: string;
  sparkline?: number[];
  interpretation: string;
  interpretationColor: string;
}

export function CrossAssetPanel({ data }: { data: CryptoRotationResult }) {
  const rows = useMemo(() => {
    const result: CrossAssetRow[] = [];

    // 1. BTC Dominance
    if (data.btcDominance) {
      const trendLabel =
        data.btcDominance.trend === "rising"
          ? "Rising (flight to safety)"
          : data.btcDominance.trend === "falling"
          ? "Falling (alt-season)"
          : "Flat";
      const trendColor =
        data.btcDominance.trend === "falling"
          ? "text-green-400"
          : data.btcDominance.trend === "rising"
          ? "text-red-400"
          : "text-[#888]";
      result.push({
        name: "BTC Dominance",
        value: `${data.btcDominance.current.toFixed(1)}%`,
        interpretation: trendLabel,
        interpretationColor: trendColor,
      });
    }

    // 2. Sector Dispersion
    const dispColor =
      data.dispersionIndex > 6
        ? "text-green-400"
        : data.dispersionIndex < 2
        ? "text-red-400"
        : "text-[#888]";
    const dispLabel =
      data.dispersionIndex > 6
        ? "High — active rotation"
        : data.dispersionIndex < 2
        ? "Low — sectors correlated"
        : "Moderate";
    result.push({
      name: "Sector Dispersion",
      value: data.dispersionIndex.toFixed(1),
      interpretation: dispLabel,
      interpretationColor: dispColor,
    });

    // 3. Sector Spread
    const spreadColor =
      data.sectorSpread > 15
        ? "text-amber-400"
        : data.sectorSpread > 8
        ? "text-green-400"
        : "text-[#888]";
    const spreadLabel =
      data.sectorSpread > 15
        ? "Wide — divergence"
        : data.sectorSpread > 8
        ? "Moderate spread"
        : "Narrow — consensus";
    result.push({
      name: "Sector Spread",
      value: `${data.sectorSpread.toFixed(1)}%`,
      interpretation: spreadLabel,
      interpretationColor: spreadColor,
    });

    // 4. Top vs Bottom Performance Gap
    if (data.sectors.length >= 2) {
      const sorted = [...data.sectors].sort(
        (a, b) => b.compositeScore - a.compositeScore
      );
      const top = sorted[0];
      const bottom = sorted[sorted.length - 1];
      const gap = top.compositeScore - bottom.compositeScore;
      const gapColor = gap > 40 ? "text-amber-400" : gap > 20 ? "text-green-400" : "text-[#888]";
      result.push({
        name: "Top vs Bottom",
        value: `${gap} pts`,
        interpretation: `${top.sector} (${top.compositeScore}) vs ${bottom.sector} (${bottom.compositeScore})`,
        interpretationColor: gapColor,
      });
    }

    // 5. Correlation trend
    if (data.correlationMatrix) {
      const values = Object.values(data.correlationMatrix);
      if (values.length > 0) {
        const avgCorr =
          values.reduce((s, v) => s + v, 0) / values.length;
        const corrColor =
          avgCorr > 0.7
            ? "text-red-400"
            : avgCorr < 0.3
            ? "text-green-400"
            : "text-[#888]";
        const corrLabel =
          avgCorr > 0.7
            ? "High — herding risk"
            : avgCorr < 0.3
            ? "Low — diversification"
            : "Normal correlation";
        result.push({
          name: "Avg Correlation",
          value: avgCorr.toFixed(2),
          interpretation: corrLabel,
          interpretationColor: corrColor,
        });
      }
    }

    // 6. Rotation Activity
    result.push({
      name: "Rotation Status",
      value: data.rotationActive ? "Active" : "Inactive",
      interpretation: data.rotationSummary,
      interpretationColor: data.rotationActive ? "text-cyan-400" : "text-[#666]",
    });

    return result;
  }, [data]);

  // Collect sparklines from top 5 sectors by composite
  const sectorSparklines = useMemo(() => {
    const sorted = [...data.sectors].sort(
      (a, b) => b.compositeScore - a.compositeScore
    );
    return sorted.slice(0, 5).map((s) => ({
      sector: s.sector,
      etf: s.etf,
      returns: data.etfReturns20d?.[s.etf],
    }));
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Cross-Asset Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[#666]">
              <th className="pb-1.5 pr-3">Metric</th>
              <th className="pb-1.5 pr-3 text-right">Value</th>
              <th className="pb-1.5">Interpretation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-[#1a1a1a]">
                <td className="py-2 pr-3 text-white font-medium">
                  {row.name}
                </td>
                <td className="py-2 pr-3 text-right text-[#ccc] font-mono">
                  {row.value}
                </td>
                <td className={`py-2 ${row.interpretationColor}`}>
                  {row.interpretation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sector Sparklines */}
      {sectorSparklines.some((s) => s.returns) && (
        <div>
          <div className="text-xs text-[#666] mb-2">
            Top Sector 20d Trends
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {sectorSparklines.map((s) => (
              <div
                key={s.etf}
                className="flex flex-col items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2"
              >
                <span className="text-[10px] text-[#888]">{s.sector}</span>
                <Sparkline returns={s.returns} width={80} height={24} />
                <span className="text-[10px] text-[#666]">
                  {baseSymbol(s.etf)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
