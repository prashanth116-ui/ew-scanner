"use client";

import { useState, useEffect } from "react";
import { fetchClientHitRates, type HitRateEntry } from "@/lib/signal-client";

interface HitRateDashboardProps {
  scanner: string;
  mode?: string;
  strength?: string;
}

export function HitRateDashboard({ scanner, mode, strength }: HitRateDashboardProps) {
  const [rates, setRates] = useState<HitRateEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchClientHitRates(scanner, mode, strength)
      .then(setRates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scanner, mode, strength]);

  if (loading) {
    return <p className="text-xs text-[#555]">Loading hit rates...</p>;
  }

  if (rates.length === 0) {
    return <p className="text-xs text-[#555]">No data yet &mdash; signals will be tracked after scanning.</p>;
  }

  const r30 = rates.find((h) => h.period_days === 30);
  const r7 = rates.find((h) => h.period_days === 7);
  const primary = r30 ?? r7;

  if (!primary || primary.total_signals < 3) {
    return (
      <p className="text-xs text-[#555]">
        {primary ? `${primary.total_signals} signals tracked — need 3+ for stats.` : "No data yet."}
      </p>
    );
  }

  const pct = Math.round(primary.hit_rate * 100);
  const color = pct >= 60 ? "text-green-400" : pct >= 40 ? "text-amber-400" : "text-red-400";

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className={`text-lg font-bold ${color}`}>{pct}%</span>
        <span className="text-xs text-[#888]">
          {primary.period_days}d accuracy (n={primary.total_signals})
        </span>
      </div>
      {primary.avg_return_pct != null && (
        <div className="flex gap-4 text-[10px] text-[#666]">
          <span>Avg return: {(primary.avg_return_pct * 100).toFixed(1)}%</span>
          {primary.avg_max_drawdown_pct != null && (
            <span>Avg drawdown: {(primary.avg_max_drawdown_pct * 100).toFixed(1)}%</span>
          )}
        </div>
      )}
      {rates.length > 1 && (
        <div className="space-y-1">
          {rates
            .filter((r) => r !== primary && r.total_signals >= 3)
            .slice(0, 3)
            .map((r) => {
              const p = Math.round(r.hit_rate * 100);
              const c = p >= 60 ? "text-green-400" : p >= 40 ? "text-amber-400" : "text-red-400";
              const label = r.mode ?? `${r.period_days}d`;
              return (
                <div key={`${r.period_days}-${r.mode}-${r.signal_strength}`} className="flex items-center gap-2 text-[10px]">
                  <span className="text-[#888] w-16 truncate">{label}</span>
                  <span className={`font-medium ${c}`}>{p}%</span>
                  <span className="text-[#555]">n={r.total_signals}</span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
