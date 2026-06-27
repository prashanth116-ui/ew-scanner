"use client";

import { useState } from "react";
import type { SectorRotationScore } from "@/lib/sector-rotation/types";
import { compositeColor, compositeTextColor } from "@/lib/color-utils";
import { CollapsiblePanel } from "./shared";
import { quadrantColor } from "./helpers";

// ── Correlation Matrix ──

export function CorrelationMatrix({ correlationMatrix, sectors, collapsed, onToggle }: { correlationMatrix?: Record<string, number>; sectors: SectorRotationScore[]; collapsed?: boolean; onToggle?: (id: string) => void }) {
  if (!correlationMatrix || Object.keys(correlationMatrix).length === 0) return null;
  const matrix = correlationMatrix;
  const etfs = sectors.map((s) => s.etf);

  function getCorr(a: string, b: string): number | null {
    if (a === b) return 1;
    return matrix[`${a}:${b}`] ?? matrix[`${b}:${a}`] ?? null;
  }

  function corrColor(c: number | null): string {
    if (c === null) return "bg-[#1a1a1a]";
    if (c >= 0.8) return "bg-green-500/40";
    if (c >= 0.5) return "bg-green-500/20";
    if (c >= 0.2) return "bg-green-500/10";
    if (c >= -0.2) return "bg-[#1a1a1a]";
    if (c >= -0.5) return "bg-red-500/10";
    if (c >= -0.8) return "bg-red-500/20";
    return "bg-red-500/40";
  }

  return (
    <CollapsiblePanel id="correlation" title="Sector Correlation (20d Returns)" collapsed={collapsed ?? false} onToggle={onToggle ?? (() => {})}>
      <div className="overflow-x-auto">
        <table className="text-[9px]">
          <thead>
            <tr>
              <th className="px-1 py-1" />
              {etfs.map((e) => <th key={e} className="px-1 py-1 text-[#888] font-normal text-center" style={{ writingMode: "vertical-rl" }}>{e}</th>)}
            </tr>
          </thead>
          <tbody>
            {etfs.map((row) => (
              <tr key={row}>
                <td className="px-1 py-0.5 text-[#888] font-medium whitespace-nowrap">{row}</td>
                {etfs.map((col) => {
                  const c = getCorr(row, col);
                  return (
                    <td key={col} className={`px-1 py-0.5 text-center ${corrColor(c)}`} title={`${row} vs ${col}: ${c?.toFixed(2) ?? "N/A"}`}>
                      <span className={c !== null && Math.abs(c) >= 0.8 ? "font-semibold text-white" : "text-[#888]"}>
                        {c !== null ? c.toFixed(1) : ""}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-[#555]">High correlation ({"\u2265"}0.8) = sectors move together. Low/negative = diversification opportunity.</p>
    </CollapsiblePanel>
  );
}

// ── Sector Comparison ──

export function SectorComparison({ sectors }: { sectors: SectorRotationScore[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSector = (etf: string) => {
    setSelected((prev) => prev.includes(etf) ? prev.filter((s) => s !== etf) : prev.length < 3 ? [...prev, etf] : prev);
  };

  const compared = sectors.filter((s) => selected.includes(s.etf));
  const metrics: { label: string; key: string; format: (s: SectorRotationScore) => string; color?: (s: SectorRotationScore) => string }[] = [
    { label: "Composite", key: "compositeScore", format: (s) => `${s.compositeScore}`, color: (s) => compositeTextColor(s.compositeScore) },
    { label: "Quadrant", key: "quadrant", format: (s) => s.quadrant },
    { label: "Acceleration", key: "acceleration", format: (s) => `${s.acceleration > 0 ? "+" : ""}${s.acceleration.toFixed(2)}`, color: (s) => s.acceleration > 0 ? "text-green-400" : "text-red-400" },
    { label: "Mansfield RS", key: "mansfieldRS", format: (s) => `${s.mansfieldRS > 0 ? "+" : ""}${s.mansfieldRS.toFixed(2)}`, color: (s) => s.mansfieldRS > 0 ? "text-green-400" : "text-red-400" },
    { label: "CMF (20d)", key: "cmf20", format: (s) => `${s.cmf20 > 0 ? "+" : ""}${s.cmf20.toFixed(3)}`, color: (s) => s.cmf20 > 0 ? "text-green-400" : "text-red-400" },
    { label: "Breadth %", key: "breadthPct", format: (s) => s.breadthPct !== null ? `${s.breadthPct}%` : "N/A" },
    { label: "OBV Trend", key: "obvTrend", format: (s) => s.obvTrend === 1 ? "Accum" : s.obvTrend === -1 ? "Distrib" : "Flat" },
    { label: "RS-Ratio", key: "rsRatio", format: (s) => s.rsRatio.toFixed(2) },
    { label: "RS-Momentum", key: "rsMomentum", format: (s) => s.rsMomentum.toFixed(2) },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {sectors.map((s) => (
          <button key={s.etf} onClick={() => toggleSector(s.etf)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
              selected.includes(s.etf) ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border-[#5ba3e6]/30" : "text-[#666] hover:text-[#a0a0a0] border-transparent"
            }`}>{s.etf}</button>
        ))}
        <span className="text-[10px] text-[#555] self-center ml-2">Select up to 3</span>
      </div>
      {compared.length < 2 && (
        <p className="text-xs text-[#555] py-4 text-center">
          Select 2 or more sectors above to compare scores side-by-side.
        </p>
      )}
      {compared.length >= 2 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2a2a2a]">
                <th className="text-left py-1.5 pr-4 text-[#666]">Metric</th>
                {compared.map((s) => <th key={s.etf} className="text-center py-1.5 px-3 text-white font-semibold">{s.etf}<div className="text-[10px] text-[#666] font-normal">{s.sector}</div></th>)}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.key} className="border-b border-[#1a1a1a]">
                  <td className="py-1.5 pr-4 text-[#888]">{m.label}</td>
                  {compared.map((s) => (
                    <td key={s.etf} className={`py-1.5 px-3 text-center ${m.color ? m.color(s) : "text-white"}`}>{m.format(s)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sub-Sector Leading Indicators Panel ──

const SUB_SECTOR_CONTEXT: Record<string, string> = {
  KRE: "vs XLF \u2014 tells you if credit conditions are tightening or loosening before big banks react",
  XHB: "vs XLY \u2014 tells you if housing and rate-sensitive spending are leading or lagging consumer discretionary",
  XRT: "vs XLY \u2014 tells you if consumer spending is accelerating or decelerating before broad retail moves",
  IYT: "vs XLI \u2014 tells you if freight and transport demand is signaling economic expansion or contraction",
  ITA: "vs XLI \u2014 tells you if defense/aerospace spending is outpacing or trailing broad industrials",
  ARKX: "vs XLI \u2014 tells you if space and defense tech innovation is gaining or losing momentum vs traditional industrials",
  UFO: "vs XLI \u2014 tells you if space industry (launch, satellite, orbital) is leading or lagging broad industrials",
  AIQ: "vs XLK \u2014 tells you if AI is outperforming or underperforming broad tech",
};

export function SubSectorPanel({ scores, collapsed, onToggle }: { scores: SectorRotationScore[]; collapsed?: boolean; onToggle?: (id: string) => void }) {
  if (scores.length === 0) return null;

  return (
    <CollapsiblePanel id="sub-sectors" title="Leading Indicators (Sub-Sectors)" collapsed={collapsed ?? false} onToggle={onToggle ?? (() => {})}>
      <p className="text-[10px] text-[#555] mb-3 px-1">KRE (credit cycle), XHB (housing), XRT (consumer), IYT (transport), ITA (aerospace &amp; defense), ARKX (space innovation), UFO (space), AIQ (AI &amp; robotics) — early signals before GICS sectors move.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 px-1">
        {scores.map((s) => (
          <div key={s.etf} className="rounded-lg border border-[#2a2a2a] bg-[#111] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-white text-sm">{s.etf}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${quadrantColor(s.quadrant)}`}>
                {s.quadrant}
              </span>
            </div>
            <p className="text-[10px] text-[#888] mb-2">{s.sector}</p>
            {SUB_SECTOR_CONTEXT[s.etf] && (
              <p className="text-[10px] text-[#888] mt-1">{SUB_SECTOR_CONTEXT[s.etf]}</p>
            )}
            <div className="grid grid-cols-2 gap-y-1 text-[11px]">
              <span className="text-[#666]">Score</span>
              <span className="text-right text-white font-mono">{s.compositeScore}</span>
              <span className="text-[#666]">Momentum</span>
              <span className="text-right text-white font-mono">{s.momentumPercentile}%</span>
              <span className="text-[#666]">Accel</span>
              <span className={`text-right font-mono ${s.acceleration > 0 ? "text-green-400" : s.acceleration < 0 ? "text-red-400" : "text-[#888]"}`}>
                {s.acceleration > 0 ? "+" : ""}{s.acceleration.toFixed(2)}
              </span>
              <span className="text-[#666]">RS</span>
              <span className="text-right text-white font-mono">{s.mansfieldRS.toFixed(2)}</span>
            </div>
            {s.stealthAccumulation && (
              <div className="mt-2 rounded border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-400">
                Stealth Accumulation
              </div>
            )}
          </div>
        ))}
      </div>
    </CollapsiblePanel>
  );
}

// ── Cross-Asset Money Flow Panel ──

export function CrossAssetPanel({ scores, collapsed, onToggle }: { scores: SectorRotationScore[]; collapsed?: boolean; onToggle?: (id: string) => void }) {
  if (scores.length === 0) return null;

  return (
    <CollapsiblePanel id="cross-asset" title="Cross-Asset Money Flow" collapsed={collapsed ?? false} onToggle={onToggle ?? (() => {})}>
      <p className="text-[10px] text-[#555] mb-3 px-1">GLD, TLT, HYG, EEM, UUP — detect money leaving/entering equities entirely.</p>
      <div className="overflow-x-auto px-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#2a2a2a] text-left text-[#666]">
              <th className="pb-2 pr-4 font-medium">ETF</th>
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium text-right">Score</th>
              <th className="pb-2 pr-4 font-medium">Quadrant</th>
              <th className="pb-2 pr-4 font-medium text-right">Momentum</th>
              <th className="pb-2 pr-4 font-medium text-right">Accel</th>
              <th className="pb-2 pr-4 font-medium text-right">RS vs SPY</th>
              <th className="pb-2 font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => (
              <tr key={s.etf} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]/50">
                <td className="py-2 pr-4 font-mono font-semibold text-[#5ba3e6]">{s.etf}</td>
                <td className="py-2 pr-4 text-[#a0a0a0]">{s.sector}</td>
                <td className="py-2 pr-4 text-right font-mono text-white">{s.compositeScore}</td>
                <td className="py-2 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${quadrantColor(s.quadrant)}`}>
                    {s.quadrant}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right font-mono text-white">{s.momentumPercentile}%</td>
                <td className={`py-2 pr-4 text-right font-mono ${s.acceleration > 0 ? "text-green-400" : s.acceleration < 0 ? "text-red-400" : "text-[#888]"}`}>
                  {s.acceleration > 0 ? "+" : ""}{s.acceleration.toFixed(2)}
                </td>
                <td className={`py-2 pr-4 text-right font-mono ${s.mansfieldRS > 0 ? "text-green-400" : s.mansfieldRS < 0 ? "text-red-400" : "text-[#888]"}`}>
                  {s.mansfieldRS > 0 ? "+" : ""}{s.mansfieldRS.toFixed(2)}
                </td>
                <td className="py-2 text-lg">{s.trendArrow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsiblePanel>
  );
}
