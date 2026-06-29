"use client";

import { useMemo } from "react";
import type { CryptoRotationResult } from "@/lib/crypto-rotation/types";

import { baseSymbol } from "@/lib/crypto-rotation/format";

interface SectorCorrelationStats {
  sector: string;
  etf: string;
  avgCorrelation: number;
  btcCorrelation: number | null;
  isDiversifier: boolean; // avg correlation < 0.3
}

export function CorrelationEnhancements({
  data,
}: {
  data: CryptoRotationResult;
}) {
  const { stats, avgCrossCorrelation, herdingAlert } = useMemo(() => {
    const matrix = data.correlationMatrix ?? {};
    const sectorETFs = data.sectors.map((s) => s.etf);

    // Compute per-sector average correlation
    const sectorStats: SectorCorrelationStats[] = data.sectors.map((s) => {
      const pairCorrelations: number[] = [];
      let btcCorr: number | null = null;

      for (const [key, val] of Object.entries(matrix)) {
        const [a, b] = key.split(":");
        if (a === s.etf || b === s.etf) {
          const other = a === s.etf ? b : a;
          // Only include sector ETFs (not BTC itself)
          if (sectorETFs.includes(other)) {
            pairCorrelations.push(val);
          }
          // Check BTC correlation
          if (other === "BTC-USD") {
            btcCorr = val;
          }
        }
      }

      const avg =
        pairCorrelations.length > 0
          ? pairCorrelations.reduce((s, v) => s + v, 0) /
            pairCorrelations.length
          : 0;

      return {
        sector: s.sector,
        etf: s.etf,
        avgCorrelation: Math.round(avg * 100) / 100,
        btcCorrelation: btcCorr != null ? Math.round(btcCorr * 100) / 100 : null,
        isDiversifier: avg < 0.3,
      };
    });

    // Overall average cross-sector correlation
    const allCorrs = Object.values(matrix);
    const overallAvg =
      allCorrs.length > 0
        ? allCorrs.reduce((s, v) => s + v, 0) / allCorrs.length
        : 0;

    // Herding alert: avg > 0.8
    const herding = overallAvg > 0.8;

    return {
      stats: sectorStats,
      avgCrossCorrelation: Math.round(overallAvg * 100) / 100,
      herdingAlert: herding,
    };
  }, [data]);

  const diversifiers = stats.filter((s) => s.isDiversifier);

  if (stats.length === 0) {
    return (
      <p className="text-sm text-[#666]">
        Correlation data not available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[#888]">
          Avg Cross-Correlation:{" "}
          <span
            className={`font-medium ${
              avgCrossCorrelation > 0.7
                ? "text-red-400"
                : avgCrossCorrelation < 0.3
                ? "text-green-400"
                : "text-[#ccc]"
            }`}
          >
            {avgCrossCorrelation.toFixed(2)}
          </span>
        </span>

        {herdingAlert && (
          <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400 font-medium">
            HERDING RISK
          </span>
        )}

        {diversifiers.length > 0 && (
          <span className="text-xs text-[#888]">
            Diversifiers:{" "}
            {diversifiers.map((d) => (
              <span
                key={d.etf}
                className="inline-flex rounded-full border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400 ml-1"
              >
                {d.sector}
              </span>
            ))}
          </span>
        )}
      </div>

      {herdingAlert && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-xs text-red-400 font-medium">
            Herding Alert: Average cross-sector correlation is{" "}
            {avgCrossCorrelation.toFixed(2)} (&gt; 0.80)
          </p>
          <p className="text-[10px] text-[#999] mt-1">
            All sectors are moving together. This indicates systemic risk —
            diversification across crypto sectors provides minimal protection.
          </p>
        </div>
      )}

      {/* Correlation table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[#666]">
              <th className="pb-1.5 pr-3">Sector</th>
              <th className="pb-1.5 pr-3">Proxy</th>
              <th className="pb-1.5 pr-3 text-right">BTC Corr</th>
              <th className="pb-1.5 pr-3 text-right">Avg Sector Corr</th>
              <th className="pb-1.5">Role</th>
            </tr>
          </thead>
          <tbody>
            {stats
              .sort((a, b) => a.avgCorrelation - b.avgCorrelation)
              .map((s) => (
                <tr key={s.etf} className="border-t border-[#1a1a1a]">
                  <td className="py-1.5 pr-3 text-white font-medium">
                    {s.sector}
                  </td>
                  <td className="py-1.5 pr-3 text-[#888]">
                    {baseSymbol(s.etf)}
                  </td>
                  <td
                    className={`py-1.5 pr-3 text-right font-mono ${
                      (s.btcCorrelation ?? 0) > 0.7
                        ? "text-red-400"
                        : (s.btcCorrelation ?? 0) < 0.3
                        ? "text-green-400"
                        : "text-[#ccc]"
                    }`}
                  >
                    {s.btcCorrelation != null
                      ? s.btcCorrelation.toFixed(2)
                      : "\u2014"}
                  </td>
                  <td
                    className={`py-1.5 pr-3 text-right font-mono ${
                      s.avgCorrelation > 0.7
                        ? "text-red-400"
                        : s.avgCorrelation < 0.3
                        ? "text-green-400"
                        : "text-[#ccc]"
                    }`}
                  >
                    {s.avgCorrelation.toFixed(2)}
                  </td>
                  <td className="py-1.5">
                    {s.isDiversifier ? (
                      <span className="inline-flex rounded-full border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400">
                        Diversifier
                      </span>
                    ) : s.avgCorrelation > 0.7 ? (
                      <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400">
                        Correlated
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#666]">Normal</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
