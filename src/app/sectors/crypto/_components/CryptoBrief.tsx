"use client";

import { useMemo, useEffect } from "react";
import {
  TrendingUp,
  Crosshair,
  Shield,
  Banknote,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import type { CryptoRotationResult } from "@/lib/crypto-rotation/types";
import type { RotationTrackerResult } from "@/lib/sector-rotation/rotation-types";
import type { SectorRotationScore } from "@/lib/sector-rotation/types";
import {
  computeCryptoPosture,
  computeCryptoTiers,
  computeCryptoRiskFlags,
  computeCryptoWhatChanged,
  computeCryptoBiasScore,
  saveCryptoSnapshot,
  loadPreviousCryptoSnapshot,
  saveCryptoPosture,
  loadPreviousCryptoPosture,
  type MarketPosture,
  type PostureResult,
  type RiskFlag,
  type SectorTiers,
  type WhatChangedResult,
  type BiasSignal,
} from "@/lib/crypto-rotation/brief";
import {
  CollapsiblePanel,
  useCollapsedPanels,
  quadrantColor,
  getTradingAction,
} from "../../_components";

/** Strip quote currency suffix from crypto symbols. */
function baseSymbol(sym: string): string {
  return sym.replace(/-USD[T]?$/, "");
}

// ── Posture Styles ──

const POSTURE_STYLES: Record<
  MarketPosture,
  { bg: string; border: string; text: string; icon: typeof TrendingUp }
> = {
  AGGRESSIVE: {
    bg: "bg-green-500/10",
    border: "border-green-500/40",
    text: "text-green-400",
    icon: TrendingUp,
  },
  SELECTIVE: {
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/40",
    text: "text-cyan-400",
    icon: Crosshair,
  },
  DEFENSIVE: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    text: "text-amber-400",
    icon: Shield,
  },
  CASH: {
    bg: "bg-red-500/10",
    border: "border-red-500/40",
    text: "text-red-400",
    icon: Banknote,
  },
};

const TRANSITION_LABELS: Record<
  string,
  { label: string; color: string }
> = {
  rotation_starting: { label: "Rotation Starting", color: "text-green-400" },
  breakout_confirmed: { label: "Breakout Confirmed", color: "text-green-400" },
  momentum_fading: { label: "Momentum Fading", color: "text-amber-400" },
  rotation_out: { label: "Rotation Out", color: "text-red-400" },
  other: { label: "Quadrant Shift", color: "text-[#ccc]" },
};

const TIER_RANK: Record<string, number> = {
  actionable: 0,
  watch: 1,
  avoid: 2,
};

// ── Main Component ──

export function CryptoBrief({
  data,
  rotationData,
}: {
  data: CryptoRotationResult;
  rotationData: RotationTrackerResult | null;
}) {
  const [collapsed, toggle] = useCollapsedPanels("ew-crypto-brief-collapsed-v1");

  // Compute synthesis
  const posture = useMemo<PostureResult>(
    () => computeCryptoPosture(data, rotationData),
    [data, rotationData]
  );

  const tiers = useMemo<SectorTiers>(
    () => computeCryptoTiers(data.sectors, rotationData),
    [data, rotationData]
  );

  const riskFlags = useMemo<RiskFlag[]>(
    () => computeCryptoRiskFlags(data, rotationData),
    [data, rotationData]
  );

  const biasResult = useMemo(
    () => computeCryptoBiasScore(data),
    [data]
  );

  // Load previous snapshot/posture for what-changed
  const previousSnapshot = useMemo(() => loadPreviousCryptoSnapshot(), []);
  const previousPosture = useMemo(() => loadPreviousCryptoPosture(), []);

  const whatChanged = useMemo<WhatChangedResult>(
    () =>
      computeCryptoWhatChanged(
        data,
        posture.posture,
        previousSnapshot,
        previousPosture
      ),
    [data, posture, previousSnapshot, previousPosture]
  );

  // Persist today's snapshot + posture (side effects)
  useEffect(() => {
    saveCryptoSnapshot(data);
  }, [data]);

  useEffect(() => {
    saveCryptoPosture(posture.posture);
  }, [posture]);

  const totalChanges = whatChanged
    ? (whatChanged.postureChange ? 1 : 0) +
      whatChanged.quadrantTransitions.length +
      whatChanged.tierChanges.length +
      Math.min(whatChanged.scoreMovers.length, 3) +
      whatChanged.trendFlips.length +
      (whatChanged.dispersionChange ? 1 : 0)
    : 0;

  return (
    <div className="space-y-4">
      {/* 1. Crypto Pulse Gauge */}
      <CollapsiblePanel
        id="crypto-pulse"
        title="Crypto Pulse"
        collapsed={collapsed.has("crypto-pulse")}
        onToggle={toggle}
        badge={
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${
              biasResult.score >= 2
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : biasResult.score <= -2
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
            }`}
          >
            {biasResult.score >= 2
              ? "Bullish"
              : biasResult.score <= -2
              ? "Bearish"
              : "Neutral"}{" "}
            ({biasResult.score > 0 ? "+" : ""}
            {biasResult.score})
          </span>
        }
      >
        <CryptoPulseGauge biasResult={biasResult} />
      </CollapsiblePanel>

      {/* 2. Market Posture Banner */}
      <PostureBanner posture={posture} />

      {/* 3. What Changed */}
      <CollapsiblePanel
        id="crypto-changes"
        title="What Changed"
        collapsed={collapsed.has("crypto-changes")}
        onToggle={toggle}
        badge={
          whatChanged.noHistory ? (
            <span className="rounded-full bg-[#222] px-2 py-0.5 text-[10px] text-[#888]">
              First visit
            </span>
          ) : totalChanges === 0 ? (
            <span className="rounded-full bg-[#222] px-2 py-0.5 text-[10px] text-[#888]">
              No changes
            </span>
          ) : (
            <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] text-cyan-400">
              {totalChanges} change{totalChanges > 1 ? "s" : ""}
            </span>
          )
        }
      >
        <WhatChangedPanel whatChanged={whatChanged} />
      </CollapsiblePanel>

      {/* 4. Risk Flags */}
      <CollapsiblePanel
        id="crypto-risks"
        title="Risk Flags"
        collapsed={collapsed.has("crypto-risks")}
        onToggle={toggle}
        badge={
          riskFlags.length > 0 ? (
            <span className="rounded-full bg-red-500/10 border border-red-500/30 px-2 py-0.5 text-[10px] text-red-400">
              {riskFlags.length} flag{riskFlags.length > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="rounded-full bg-green-500/10 border border-green-500/30 px-2 py-0.5 text-[10px] text-green-400">
              Clear
            </span>
          )
        }
      >
        <RiskFlagsPanel riskFlags={riskFlags} />
      </CollapsiblePanel>

      {/* 5. Sector Tiers */}
      <CollapsiblePanel
        id="crypto-tiers"
        title="Sector Tiers"
        collapsed={collapsed.has("crypto-tiers")}
        onToggle={toggle}
        badge={
          <span className="rounded-full bg-[#222] px-2 py-0.5 text-[10px] text-[#888]">
            {tiers.actionable.length} actionable
          </span>
        }
      >
        <div className="space-y-4">
          <TierTable
            label="Actionable"
            sectors={tiers.actionable}
            labelColor="text-green-400"
          />
          <TierTable
            label="Watch"
            sectors={tiers.watch}
            labelColor="text-amber-400"
          />
          <TierTable
            label="Avoid"
            sectors={tiers.avoid}
            labelColor="text-red-400"
          />
        </div>
      </CollapsiblePanel>
    </div>
  );
}

// ── Sub-components ──

function CryptoPulseGauge({
  biasResult,
}: {
  biasResult: { score: number; signals: BiasSignal[] };
}) {
  return (
    <div className="space-y-3">
      {/* Gauge bar */}
      <div className="space-y-1.5">
        <div className="relative h-2.5 rounded-full bg-gradient-to-r from-red-600/40 via-yellow-500/40 to-green-600/40">
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full border-2 border-white/80 shadow-lg transition-all duration-500"
            style={{
              left: `${((biasResult.score + 10) / 20) * 100}%`,
              backgroundColor:
                biasResult.score >= 2
                  ? "#22c55e"
                  : biasResult.score <= -2
                  ? "#ef4444"
                  : "#eab308",
            }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-[#555]">
          <span>-10 Bearish</span>
          <span>0</span>
          <span>+10 Bullish</span>
        </div>
      </div>

      {/* Signal breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {biasResult.signals.map((signal) => (
          <div
            key={signal.label}
            className="flex items-center justify-between text-xs rounded px-2 py-1 bg-[#0f0f0f]"
          >
            <span className="text-[#999]">{signal.label}</span>
            <span
              className={`font-medium ${
                signal.direction === "bullish"
                  ? "text-green-400"
                  : signal.direction === "bearish"
                  ? "text-red-400"
                  : "text-[#666]"
              }`}
            >
              {signal.value > 0 ? "+" : ""}
              {signal.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PostureBanner({ posture }: { posture: PostureResult }) {
  const style = POSTURE_STYLES[posture.posture];
  const Icon = style.icon;
  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
      <div className="flex items-center gap-3">
        <Icon className={`h-6 w-6 ${style.text}`} />
        <span className={`text-xl font-bold ${style.text}`}>
          {posture.posture}
        </span>
      </div>
      <p className="mt-2 text-sm text-[#ccc]">{posture.reasoning}</p>
    </div>
  );
}

function WhatChangedPanel({
  whatChanged,
}: {
  whatChanged: WhatChangedResult;
}) {
  if (whatChanged.noHistory) {
    return (
      <p className="text-sm text-[#666]">
        History builds automatically. Check back tomorrow for daily changes.
      </p>
    );
  }

  const totalChanges =
    (whatChanged.postureChange ? 1 : 0) +
    whatChanged.quadrantTransitions.length +
    whatChanged.tierChanges.length +
    Math.min(whatChanged.scoreMovers.length, 3) +
    whatChanged.trendFlips.length +
    (whatChanged.dispersionChange ? 1 : 0);

  if (totalChanges === 0) {
    return (
      <p className="text-sm text-[#666]">
        No meaningful changes since last snapshot.
      </p>
    );
  }

  // Group quadrant transitions by category
  const transitionsByCategory = new Map<
    string,
    WhatChangedResult["quadrantTransitions"]
  >();
  for (const t of whatChanged.quadrantTransitions) {
    const list = transitionsByCategory.get(t.category) ?? [];
    list.push(t);
    transitionsByCategory.set(t.category, list);
  }

  return (
    <div className="space-y-3">
      {/* Posture shift */}
      {whatChanged.postureChange && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
          <div className="text-xs text-[#888] mb-1">Market Posture</div>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={
                POSTURE_STYLES[whatChanged.postureChange.from].text +
                " font-medium"
              }
            >
              {whatChanged.postureChange.from}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-[#666]" />
            <span
              className={
                POSTURE_STYLES[whatChanged.postureChange.to].text +
                " font-medium"
              }
            >
              {whatChanged.postureChange.to}
            </span>
          </div>
        </div>
      )}

      {/* Quadrant transitions */}
      {whatChanged.quadrantTransitions.length > 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
          <div className="text-xs text-[#888] mb-2">Quadrant Transitions</div>
          <div className="space-y-1.5">
            {Array.from(transitionsByCategory.entries()).map(
              ([category, transitions]) => {
                const style = TRANSITION_LABELS[category];
                return transitions.map((t) => (
                  <div
                    key={t.etf}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className={`font-medium ${style.color}`}>
                      {style.label}
                    </span>
                    <span className="text-[#666]">&mdash;</span>
                    <span className="text-white">{t.sector}</span>
                    <span className="text-[#666]">
                      ({baseSymbol(t.etf)})
                    </span>
                    <span
                      className={
                        quadrantColor(t.from) +
                        " rounded-full border px-1.5 py-0 text-[9px]"
                      }
                    >
                      {t.from}
                    </span>
                    <ArrowRight className="h-3 w-3 text-[#555]" />
                    <span
                      className={
                        quadrantColor(t.to) +
                        " rounded-full border px-1.5 py-0 text-[9px]"
                      }
                    >
                      {t.to}
                    </span>
                  </div>
                ));
              }
            )}
          </div>
        </div>
      )}

      {/* Tier changes */}
      {whatChanged.tierChanges.length > 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
          <div className="text-xs text-[#888] mb-2">Tier Changes</div>
          <div className="space-y-1">
            {whatChanged.tierChanges.map((tc) => {
              const promoted = TIER_RANK[tc.to] < TIER_RANK[tc.from];
              return (
                <div
                  key={tc.etf}
                  className="flex items-center gap-2 text-xs"
                >
                  {promoted ? (
                    <ArrowUpRight className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />
                  )}
                  <span className="text-white">{tc.sector}</span>
                  <span
                    className={
                      promoted ? "text-green-400" : "text-red-400"
                    }
                  >
                    {promoted ? "promoted to" : "demoted to"} {tc.to}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Score movers (top 3) */}
      {whatChanged.scoreMovers.length > 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
          <div className="text-xs text-[#888] mb-2">
            Biggest Score Movers
          </div>
          <div className="flex flex-wrap gap-3">
            {whatChanged.scoreMovers.slice(0, 3).map((sm) => (
              <div key={sm.etf} className="text-xs">
                <span className="text-white">{sm.sector}</span>{" "}
                <span
                  className={
                    sm.delta > 0
                      ? "text-green-400 font-medium"
                      : "text-red-400 font-medium"
                  }
                >
                  {sm.delta > 0 ? "+" : ""}
                  {sm.delta}
                </span>
                <span className="text-[#666]">
                  {" "}
                  ({sm.from}&rarr;{sm.to})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trend flips */}
      {whatChanged.trendFlips.length > 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
          <div className="text-xs text-[#888] mb-2">Trend Flips</div>
          <div className="space-y-1">
            {whatChanged.trendFlips.map((tf) => (
              <div
                key={tf.etf}
                className="flex items-center gap-2 text-xs"
              >
                <span className="text-white">{tf.sector}</span>
                <TrendArrow trend={tf.from} />
                <ArrowRight className="h-3 w-3 text-[#555]" />
                <TrendArrow trend={tf.to} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dispersion change */}
      {whatChanged.dispersionChange && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
          <div className="text-xs text-[#888] mb-1">Dispersion Index</div>
          <div className="text-xs">
            <span className="text-[#ccc]">
              {whatChanged.dispersionChange.from.toFixed(1)}
            </span>
            <span className="text-[#666]"> &rarr; </span>
            <span className="text-white font-medium">
              {whatChanged.dispersionChange.to.toFixed(1)}
            </span>
            <span
              className={`ml-1 ${
                whatChanged.dispersionChange.to >
                whatChanged.dispersionChange.from
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              (
              {whatChanged.dispersionChange.to >
              whatChanged.dispersionChange.from
                ? "+"
                : ""}
              {(
                whatChanged.dispersionChange.to -
                whatChanged.dispersionChange.from
              ).toFixed(1)}
              )
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function RiskFlagsPanel({ riskFlags }: { riskFlags: RiskFlag[] }) {
  if (riskFlags.length === 0) {
    return <p className="text-sm text-green-400">No risk flags detected.</p>;
  }

  return (
    <div className="space-y-2">
      {riskFlags.map((f, i) => (
        <div
          key={i}
          className={`rounded-lg border p-3 ${
            f.severity === "high"
              ? "border-red-500/30 bg-red-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                f.severity === "high" ? "bg-red-400" : "bg-amber-400"
              }`}
            />
            <span
              className={`text-sm font-medium ${
                f.severity === "high" ? "text-red-400" : "text-amber-400"
              }`}
            >
              {f.message}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#999]">{f.detail}</p>
        </div>
      ))}
    </div>
  );
}

function TierTable({
  label,
  sectors,
  labelColor,
}: {
  label: string;
  sectors: SectorRotationScore[];
  labelColor: string;
}) {
  if (sectors.length === 0) {
    return (
      <div>
        <h3 className={`text-sm font-semibold ${labelColor} mb-1`}>
          {label}
        </h3>
        <p className="text-xs text-[#666]">None</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className={`text-sm font-semibold ${labelColor} mb-2`}>
        {label} ({sectors.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[#666]">
              <th className="pb-1.5 pr-3">Sector</th>
              <th className="pb-1.5 pr-3">Proxy</th>
              <th className="pb-1.5 pr-3">Quadrant</th>
              <th className="pb-1.5 pr-3 text-right">Composite</th>
              <th className="pb-1.5 pr-3 text-right">Accel</th>
              <th className="pb-1.5 pr-3 text-right">CMF</th>
              <th className="pb-1.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((s) => {
              const action = getTradingAction(s);
              return (
                <tr key={s.etf} className="border-t border-[#1a1a1a]">
                  <td className="py-1.5 pr-3 text-white font-medium">
                    {s.sector}
                  </td>
                  <td className="py-1.5 pr-3 text-[#888]">
                    {baseSymbol(s.etf)}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${quadrantColor(
                        s.quadrant
                      )}`}
                    >
                      {s.quadrant}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right text-[#ccc]">
                    {s.compositeScore}
                  </td>
                  <td
                    className={`py-1.5 pr-3 text-right ${
                      s.acceleration > 0
                        ? "text-green-400"
                        : s.acceleration < 0
                        ? "text-red-400"
                        : "text-[#666]"
                    }`}
                  >
                    {s.acceleration > 0 ? "+" : ""}
                    {s.acceleration.toFixed(2)}
                  </td>
                  <td
                    className={`py-1.5 pr-3 text-right ${
                      s.cmf20 > 0
                        ? "text-green-400"
                        : s.cmf20 < 0
                        ? "text-red-400"
                        : "text-[#666]"
                    }`}
                  >
                    {s.cmf20.toFixed(3)}
                  </td>
                  <td className="py-1.5">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        action === "TRADE"
                          ? "bg-green-500/15 text-green-400 border-green-500/30"
                          : action === "BUILD"
                          ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                          : action === "WATCH"
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          : action === "TRIM"
                          ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                          : "bg-red-500/15 text-red-400 border-red-500/30"
                      }`}
                    >
                      {action}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrendArrow({ trend }: { trend: "UP" | "DOWN" | "FLAT" }) {
  if (trend === "UP")
    return <span className="text-green-400 font-medium">UP</span>;
  if (trend === "DOWN")
    return <span className="text-red-400 font-medium">DOWN</span>;
  return <span className="text-[#888] font-medium">FLAT</span>;
}
