"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowUpCircle,
  Plus,
  Shield,
  LogOut,
} from "lucide-react";
import type {
  RotationTrackerResult,
  ActiveRotationDetail,
  RotationEvent,
  RotationPatternStats,
  RotationStockPerformance,
  RRGQuadrant,
  LifecycleStage,
  ConvictionLevel,
  ConvictionResult,
  RegimeData,
  PairSignalData,
  StockCategory,
} from "@/lib/sector-rotation/rotation-types";

// ── localStorage cache (4-hour TTL) ──

const CACHE_KEY = "ew-rotation-tracker-v3";
const CACHE_TTL = 4 * 60 * 60 * 1000;

function loadCached(): RotationTrackerResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as RotationTrackerResult;
  } catch {
    return null;
  }
}

function saveCache(data: RotationTrackerResult) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // localStorage full — ignore
  }
}

// ── Data freshness badge ──

function timeAgo(isoDate: string): {
  text: string;
  stale: boolean;
  veryStale: boolean;
} {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let text: string;
  if (mins < 1) text = "just now";
  else if (mins < 60) text = `${mins}m ago`;
  else if (hours < 24) text = `${hours}h ago`;
  else text = `${days}d ago`;

  return { text, stale: hours >= 6, veryStale: hours >= 24 };
}

function DataAgeBadge({ calculatedAt }: { calculatedAt: string }) {
  const [age, setAge] = useState(() => timeAgo(calculatedAt));

  useEffect(() => {
    setAge(timeAgo(calculatedAt));
    const interval = setInterval(() => setAge(timeAgo(calculatedAt)), 60_000);
    return () => clearInterval(interval);
  }, [calculatedAt]);

  if (age.veryStale) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
        <AlertTriangle className="h-3 w-3" />
        {age.text} — data is stale
      </span>
    );
  }
  if (age.stale) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
        <Clock className="h-3 w-3" />
        {age.text}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[#888]">
      <Clock className="h-3 w-3" />
      {age.text}
    </span>
  );
}

// ── Signal dot indicator ──

function SignalDot({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        active
          ? "bg-green-500/15 text-green-400"
          : "bg-[#2a2a2a] text-[#555]"
      }`}
      title={label}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          active ? "bg-green-400" : "bg-[#444]"
        }`}
      />
      {label}
    </span>
  );
}

// ── Performance color ──

function perfColor(pct: number): string {
  if (pct >= 5) return "text-green-400";
  if (pct > 0) return "text-green-400/70";
  if (pct > -5) return "text-red-400/70";
  return "text-red-400";
}

function perfBg(pct: number): string {
  if (pct >= 5) return "bg-green-500/10";
  if (pct > 0) return "bg-green-500/5";
  if (pct > -5) return "bg-red-500/5";
  return "bg-red-500/10";
}

// ── Safe health accessor (guards against stale cached data missing health) ──

const DEFAULT_HEALTH = { acceleration: 0, cmf20: 0, quadrant: "LAGGING" as RRGQuadrant };

function getHealth(event: RotationEvent) {
  return event.health ?? DEFAULT_HEALTH;
}

// ── Quadrant + health helpers ──

function quadrantBadge(q: RRGQuadrant): { label: string; className: string } {
  switch (q) {
    case "LEADING":
      return { label: "LEADING", className: "bg-green-500/15 text-green-400 border-green-500/30" };
    case "WEAKENING":
      return { label: "WEAKENING", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    case "LAGGING":
      return { label: "LAGGING", className: "bg-red-500/15 text-red-400 border-red-500/30" };
    case "IMPROVING":
      return { label: "IMPROVING", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
  }
}

function accelColor(val: number): string {
  if (val > 1) return "text-green-400";
  if (val > 0) return "text-green-400/70";
  if (val > -1) return "text-red-400/70";
  return "text-red-400";
}

function cmfColor(val: number): string {
  if (val > 0.1) return "text-green-400";
  if (val > 0) return "text-green-400/70";
  if (val > -0.1) return "text-red-400/70";
  return "text-red-400";
}

function accelLabel(val: number): string {
  if (val > 1) return "Accelerating";
  if (val > 0) return "Gaining";
  if (val > -1) return "Slowing";
  return "Fading";
}

function cmfLabel(val: number): string {
  if (val > 0.1) return "Strong Inflow";
  if (val > 0) return "Mild Inflow";
  if (val > -0.1) return "Mild Outflow";
  return "Strong Outflow";
}

// ── Enhancement #1: Lifecycle Stage ──

function computeLifecycleStage(event: RotationEvent): LifecycleStage {
  const h = getHealth(event);
  if (
    event.daysActive > 30 ||
    (h.acceleration < 0 && (h.quadrant === "WEAKENING" || h.quadrant === "LAGGING"))
  ) {
    return "EXHAUSTING";
  }
  if (event.daysActive <= 5) return "EARLY";
  if (event.daysActive <= 15) return "MATURING";
  return "LATE";
}

function lifecycleBadge(stage: LifecycleStage): { className: string; guidance: string } {
  switch (stage) {
    case "EARLY":
      return {
        className: "bg-green-500/15 text-green-400 border-green-500/30",
        guidance: "New rotation — consider entry",
      };
    case "MATURING":
      return {
        className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
        guidance: "Established trend — add on pullbacks",
      };
    case "LATE":
      return {
        className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        guidance: "Extended — tighten stops, reduce size",
      };
    case "EXHAUSTING":
      return {
        className: "bg-red-500/15 text-red-400 border-red-500/30",
        guidance: "Fading — consider exit or avoid new entries",
      };
  }
}

// ── Enhancement #2: Conviction Score ──

function computeConviction(event: RotationEvent): ConvictionResult {
  const h = getHealth(event);
  let score = 0;
  const factors: string[] = [];

  // Quadrant (0-3)
  if (h.quadrant === "LEADING") { score += 3; factors.push("leading quadrant"); }
  else if (h.quadrant === "IMPROVING") { score += 2; factors.push("improving quadrant"); }
  else if (h.quadrant === "WEAKENING") { score += 0; factors.push("weakening quadrant"); }
  else { score -= 1; factors.push("lagging quadrant"); }

  // Acceleration (-1 to +2)
  if (h.acceleration > 1) { score += 2; factors.push("strong acceleration"); }
  else if (h.acceleration > 0) { score += 1; }
  else { score -= 1; factors.push("negative acceleration"); }

  // CMF (-1 to +2)
  if (h.cmf20 > 0.1) { score += 2; factors.push("strong inflow"); }
  else if (h.cmf20 > 0) { score += 1; }
  else { score -= 1; factors.push("money outflow"); }

  // Signal trend (-1 to +1)
  const hist = event.signalHistory ?? [];
  if (hist.length >= 3) {
    const recent = hist.slice(-3);
    const trending = recent[2].signalCount >= recent[0].signalCount;
    if (trending) { score += 1; }
    else { score -= 1; factors.push("signals declining"); }
  }

  let level: ConvictionLevel;
  if (score >= 6) level = "HIGH";
  else if (score >= 3) level = "MODERATE";
  else if (score >= 0) level = "LOW";
  else level = "EXIT";

  const topFactor = factors[0] ?? "mixed signals";
  const reason = `${level} conviction: ${topFactor}${factors.length > 1 ? ` + ${factors.slice(1).join(", ")}` : ""}`;

  return { level, score, reason };
}

function convictionBadge(level: ConvictionLevel): string {
  switch (level) {
    case "HIGH":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "MODERATE":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "LOW":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "EXIT":
      return "bg-red-500/15 text-red-400 border-red-500/30";
  }
}

// ── Enhancement #3: Signal Sparkline + Exit Warnings ──

function SignalSparkline({ history }: { history: { date: string; signalCount: number }[] }) {
  if (history.length < 2) return null;

  const W = 80;
  const H = 24;
  const pad = 2;
  const maxSig = 3;
  const points = history.map((h, i) => {
    const x = pad + (i / (history.length - 1)) * (W - 2 * pad);
    const y = H - pad - (h.signalCount / maxSig) * (H - 2 * pad);
    return `${x},${y}`;
  });

  return (
    <svg width={W} height={H} className="inline-block" aria-label="Signal history">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="#5ba3e6"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function computeExitWarnings(event: RotationEvent): string[] {
  const warnings: string[] = [];
  const h = getHealth(event);
  const hist = event.signalHistory ?? [];

  // Signal count drop
  if (hist.length >= 5) {
    const recent = hist.slice(-3);
    const prior = hist.slice(-5, -2);
    const recentAvg = recent.reduce((s, h) => s + h.signalCount, 0) / recent.length;
    const priorAvg = prior.reduce((s, h) => s + h.signalCount, 0) / prior.length;
    if (recentAvg < priorAvg - 0.5) {
      warnings.push("Signal strength declining");
    }
  }

  // Negative acceleration
  if (h.acceleration < -1) {
    warnings.push("Momentum fading sharply");
  }

  // Weak quadrant
  if (h.quadrant === "WEAKENING" || h.quadrant === "LAGGING") {
    warnings.push(`Quadrant: ${h.quadrant}`);
  }

  return warnings;
}

// ── Enhancement #4: Macro Regime Banner ──

const REGIME_SECTOR_DISPLAY_MAP: Record<string, string[]> = {
  "Technology": ["Semiconductors", "Software & Cloud"],
  "Health Care": ["Health Care", "Biotech"],
  "Consumer Discretionary": ["Consumer Discretionary"],
  "Consumer Staples": ["Consumer Staples"],
  "Communication Services": ["Communication Services"],
  "Financials": ["Financials"],
  "Industrials": ["Industrials"],
  "Energy": ["Energy"],
  "Materials": ["Materials"],
  "Utilities": ["Utilities"],
  "Real Estate": ["Real Estate"],
};

function isRegimeAligned(sectorName: string, regime: RegimeData): "aligned" | "headwind" | "neutral" {
  for (const favored of regime.favoredSectors) {
    const mapped = REGIME_SECTOR_DISPLAY_MAP[favored] ?? [favored];
    if (mapped.includes(sectorName)) return "aligned";
  }
  for (const avoid of regime.avoidSectors) {
    const mapped = REGIME_SECTOR_DISPLAY_MAP[avoid] ?? [avoid];
    if (mapped.includes(sectorName)) return "headwind";
  }
  return "neutral";
}

function regimeColor(regime: RegimeData["regime"]): string {
  switch (regime) {
    case "RISK_ON": return "text-green-400";
    case "RISK_OFF": return "text-red-400";
    case "INFLATIONARY": return "text-amber-400";
    case "MIXED": return "text-[#888]";
  }
}

function regimeBorderColor(regime: RegimeData["regime"]): string {
  switch (regime) {
    case "RISK_ON": return "border-green-500/30";
    case "RISK_OFF": return "border-red-500/30";
    case "INFLATIONARY": return "border-amber-500/30";
    case "MIXED": return "border-[#333]";
  }
}

function RegimeBanner({ regime }: { regime: RegimeData }) {
  return (
    <div className={`rounded-lg border ${regimeBorderColor(regime.regime)} bg-[#1a1a1a] p-4`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <span className="text-xs text-[#888]">Regime</span>
          <div className={`text-sm font-semibold ${regimeColor(regime.regime)}`}>
            {regime.regime.replace("_", " ")}
          </div>
        </div>
        <div>
          <span className="text-xs text-[#888]">VIX</span>
          <div className={`text-sm font-medium ${regime.vix > 25 ? "text-red-400" : regime.vix < 18 ? "text-green-400" : "text-amber-400"}`}>
            {regime.vix.toFixed(1)}
            <span className="ml-1 text-[10px] text-[#666]">{regime.vixSlope}</span>
          </div>
        </div>
        <div>
          <span className="text-xs text-[#888]">10Y Yield</span>
          <div className="text-sm font-medium text-[#ccc]">{regime.yield10y.toFixed(2)}%</div>
        </div>
        <div>
          <span className="text-xs text-[#888]">USD (DXY)</span>
          <div className="text-sm font-medium text-[#ccc]">
            {regime.dxy.toFixed(1)}
            <span className="ml-1 text-[10px] text-[#666]">{regime.dxyTrend}</span>
          </div>
        </div>
        {regime.favoredSectors.length > 0 && (
          <div>
            <span className="text-xs text-[#888]">Favored</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {regime.favoredSectors.map((s) => (
                <span key={s} className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        {regime.avoidSectors.length > 0 && (
          <div>
            <span className="text-xs text-[#888]">Avoid</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {regime.avoidSectors.map((s) => (
                <span key={s} className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Enhancement #7: Pair Z-Score Bar ──

function PairZScoreBar({
  pairSignals,
}: {
  pairSignals: { xlyXlp: PairSignalData | null; xlkXlu: PairSignalData | null };
}) {
  const pairs = [pairSignals.xlyXlp, pairSignals.xlkXlu].filter(
    (p): p is PairSignalData => p !== null
  );
  if (pairs.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-4 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3">
      {pairs.map((p) => {
        const absZ = Math.abs(p.zScore);
        const barWidth = Math.min(100, (absZ / 3) * 100);
        const isPositive = p.zScore >= 0;
        const signalLabel =
          p.signal === "extreme_risk_on"
            ? "Risk-On Extreme"
            : p.signal === "extreme_risk_off"
              ? "Risk-Off Extreme"
              : "Neutral";
        const signalColor =
          p.signal === "extreme_risk_on"
            ? "text-green-400"
            : p.signal === "extreme_risk_off"
              ? "text-red-400"
              : "text-[#888]";

        return (
          <div key={p.pair} className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#ccc]">{p.pair}</span>
              <span className={signalColor}>{signalLabel}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="relative h-2 flex-1 rounded-full bg-[#222]">
                <div
                  className={`absolute top-0 h-2 rounded-full ${
                    p.isExtreme
                      ? isPositive
                        ? "bg-green-500"
                        : "bg-red-500"
                      : "bg-[#5ba3e6]"
                  }`}
                  style={{
                    width: `${barWidth}%`,
                    left: isPositive ? "50%" : `${50 - barWidth}%`,
                  }}
                />
                <div className="absolute left-1/2 top-0 h-2 w-px bg-[#444]" />
              </div>
              <span className={`text-xs font-mono ${p.isExtreme ? (isPositive ? "text-green-400" : "text-red-400") : "text-[#888]"}`}>
                {p.zScore > 0 ? "+" : ""}{p.zScore.toFixed(2)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Enhancement #5: Stock Categorization ──

function categorizeStock(
  stock: RotationStockPerformance,
  sectorAvgPct: number
): StockCategory {
  if (!stock.aboveSma50) return "avoid";
  if (stock.performancePct > sectorAvgPct && stock.volumeVsAvg >= 1.0) return "leader";
  return "catch-up";
}

function stockCategoryBadge(cat: StockCategory): { label: string; className: string } {
  switch (cat) {
    case "leader":
      return { label: "Leader", className: "bg-green-500/15 text-green-400" };
    case "catch-up":
      return { label: "Catch-up", className: "bg-cyan-500/15 text-cyan-400" };
    case "avoid":
      return { label: "Avoid", className: "bg-red-500/15 text-red-400" };
  }
}

// ── Strategy Overlay: Action Signal ──

type ActionSignal = {
  action: "ENTER" | "ADD ON PULLBACK" | "HOLD — TIGHTEN STOPS" | "EXIT";
  color: string;
  bgColor: string;
  borderColor: string;
  icon: "enter" | "add" | "hold" | "exit";
  description: string;
};

function computeActionSignal(
  lifecycle: LifecycleStage,
  conviction: ConvictionResult,
  regimeAlignment: "aligned" | "headwind" | "neutral"
): ActionSignal {
  // EXIT: exhausting lifecycle, or EXIT conviction, or headwind + LOW conviction
  if (
    lifecycle === "EXHAUSTING" ||
    conviction.level === "EXIT" ||
    (regimeAlignment === "headwind" && conviction.level === "LOW")
  ) {
    const reason =
      lifecycle === "EXHAUSTING"
        ? "Rotation exhausting — momentum fading"
        : conviction.level === "EXIT"
          ? "Exit signals triggered — conviction collapsed"
          : "Regime headwind with low conviction";
    return {
      action: "EXIT",
      color: "text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      icon: "exit",
      description: reason,
    };
  }

  // HOLD: LATE lifecycle, or MATURING + LOW conviction, or headwind + MODERATE
  if (
    lifecycle === "LATE" ||
    (lifecycle === "MATURING" && conviction.level === "LOW") ||
    (regimeAlignment === "headwind" && conviction.level === "MODERATE")
  ) {
    const reason =
      lifecycle === "LATE"
        ? "Extended rotation — protect gains"
        : regimeAlignment === "headwind"
          ? "Regime headwind — reduce exposure"
          : "Maturing with weakening conviction";
    return {
      action: "HOLD — TIGHTEN STOPS",
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/30",
      icon: "hold",
      description: reason,
    };
  }

  // ADD ON PULLBACK: MATURING + MODERATE+ conviction + not headwind
  if (
    lifecycle === "MATURING" &&
    (conviction.level === "MODERATE" || conviction.level === "HIGH") &&
    regimeAlignment !== "headwind"
  ) {
    const reason =
      regimeAlignment === "aligned"
        ? "Established trend with regime support — add on dips"
        : "Established trend — add on pullbacks";
    return {
      action: "ADD ON PULLBACK",
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/10",
      borderColor: "border-cyan-500/30",
      icon: "add",
      description: reason,
    };
  }

  // ENTER: EARLY + HIGH/MODERATE conviction + not headwind
  if (
    lifecycle === "EARLY" &&
    (conviction.level === "HIGH" || conviction.level === "MODERATE") &&
    regimeAlignment !== "headwind"
  ) {
    const reason =
      regimeAlignment === "aligned"
        ? "Early rotation with high conviction and regime alignment"
        : "New rotation with strong conviction — consider entry";
    return {
      action: "ENTER",
      color: "text-green-400",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/30",
      icon: "enter",
      description: reason,
    };
  }

  // Fallback: HOLD for anything else (EARLY + LOW, etc.)
  return {
    action: "HOLD — TIGHTEN STOPS",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    icon: "hold",
    description: "Mixed signals — wait for clarity",
  };
}

function ActionIcon({ icon, className }: { icon: ActionSignal["icon"]; className?: string }) {
  switch (icon) {
    case "enter":
      return <ArrowUpCircle className={className} />;
    case "add":
      return <Plus className={className} />;
    case "hold":
      return <Shield className={className} />;
    case "exit":
      return <LogOut className={className} />;
  }
}

// ── Strategy Overlay: Stock Action ──

type StockAction = {
  label: string;
  rowBg: string;
  badgeClass: string;
  sortOrder: number;
};

function computeStockAction(
  category: StockCategory,
  lifecycle: LifecycleStage
): StockAction {
  if (category === "avoid") {
    if (lifecycle === "EXHAUSTING") {
      return { label: "Exit", rowBg: "bg-red-500/8", badgeClass: "bg-red-500/15 text-red-400", sortOrder: 5 };
    }
    return { label: "Avoid", rowBg: "bg-red-500/5", badgeClass: "bg-red-500/15 text-red-400", sortOrder: 4 };
  }
  if (category === "leader") {
    if (lifecycle === "EARLY" || lifecycle === "MATURING") {
      return { label: "Ride", rowBg: "bg-green-500/8", badgeClass: "bg-green-500/15 text-green-400", sortOrder: 1 };
    }
    if (lifecycle === "LATE") {
      return { label: "Take Profit", rowBg: "bg-amber-500/8", badgeClass: "bg-amber-500/15 text-amber-400", sortOrder: 2 };
    }
    // EXHAUSTING
    return { label: "Exit", rowBg: "bg-red-500/8", badgeClass: "bg-red-500/15 text-red-400", sortOrder: 5 };
  }
  // catch-up
  if (lifecycle === "EARLY" || lifecycle === "MATURING") {
    return { label: "Entry Candidate", rowBg: "bg-cyan-500/8", badgeClass: "bg-cyan-500/15 text-cyan-400", sortOrder: 0 };
  }
  if (lifecycle === "LATE") {
    return { label: "Watch", rowBg: "", badgeClass: "bg-[#2a2a2a] text-[#888]", sortOrder: 3 };
  }
  // EXHAUSTING
  return { label: "Avoid", rowBg: "bg-red-500/5", badgeClass: "bg-red-500/15 text-red-400", sortOrder: 4 };
}

// ── Enhancement #6: Historical Projection ──

function HistoricalProjection({
  event,
  patternStats,
}: {
  event: RotationEvent;
  patternStats: RotationPatternStats[];
}) {
  const stats = patternStats.find((s) => s.sectorId === event.sectorId);
  if (!stats || stats.totalRotations < 2) return null;

  const completedCount = stats.history.length;
  if (completedCount === 0) return null;

  const pctThroughDuration =
    stats.avgDurationDays > 0
      ? Math.round((event.daysActive / stats.avgDurationDays) * 100)
      : 0;
  const pctThroughReturn =
    stats.avgPerformancePct !== 0
      ? Math.round((event.etfPerformancePct / stats.avgPerformancePct) * 100)
      : 0;
  const isPastAvgDuration = event.daysActive > stats.avgDurationDays;

  return (
    <div className="mt-2 rounded-md bg-[#151515] px-3 py-2 text-[11px] text-[#999]">
      <span className="text-[#666]">Based on {completedCount} prior rotations:</span>{" "}
      avg {stats.avgDurationDays}d (you&apos;re at {event.daysActive}d —{" "}
      <span className={isPastAvgDuration ? "text-red-400" : "text-green-400/70"}>
        {pctThroughDuration}%
      </span>
      ), avg return{" "}
      {stats.avgPerformancePct > 0 ? "+" : ""}{stats.avgPerformancePct.toFixed(1)}% (you&apos;re at{" "}
      {event.etfPerformancePct > 0 ? "+" : ""}{event.etfPerformancePct.toFixed(1)}% —{" "}
      <span className={pctThroughReturn > 100 ? "text-green-400" : "text-[#999]"}>
        {pctThroughReturn}% of historical
      </span>
      )
    </div>
  );
}

// ── Section 1: Active Rotation Cards (enhanced) ──

function ActiveRotationCards({
  rotations,
  onExpand,
  expandedId,
  regime,
  patternStats,
}: {
  rotations: ActiveRotationDetail[];
  onExpand: (id: string | null) => void;
  expandedId: string | null;
  regime: RegimeData | null | undefined;
  patternStats: RotationPatternStats[];
}) {
  if (rotations.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center text-[#888]">
        No active rotations detected
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {rotations.map((r) => {
        const isExpanded = expandedId === r.event.sectorId;
        const h = getHealth(r.event);
        const lifecycle = computeLifecycleStage(r.event);
        const lcBadge = lifecycleBadge(lifecycle);
        const conviction = computeConviction(r.event);
        const exitWarnings = computeExitWarnings(r.event);
        const regimeAlignment = regime ? isRegimeAligned(r.event.sectorName, regime) : "neutral";
        const actionSignal = computeActionSignal(lifecycle, conviction, regimeAlignment);

        return (
          <button
            key={r.event.sectorId}
            onClick={() => onExpand(isExpanded ? null : r.event.sectorId)}
            className={`rounded-lg border-l-4 ${
              lifecycle === "EXHAUSTING" ? "border-red-500" : lifecycle === "LATE" ? "border-amber-500" : "border-green-500"
            } bg-[#1a1a1a] text-left transition-colors hover:bg-[#222] overflow-hidden ${
              isExpanded ? "ring-1 ring-green-500/30" : ""
            }`}
          >
            {/* Enhancement A: Action Signal Banner */}
            <div className={`flex items-center gap-2 px-4 py-1.5 ${actionSignal.bgColor} border-b ${actionSignal.borderColor}`}>
              <ActionIcon icon={actionSignal.icon} className={`h-3.5 w-3.5 ${actionSignal.color}`} />
              <span className={`text-xs font-semibold ${actionSignal.color}`}>{actionSignal.action}</span>
            </div>

            <div className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white">
                  {r.event.sectorName}
                </h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-[#888]">{r.event.etf}</span>
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${quadrantBadge(h.quadrant).className}`}>
                    {quadrantBadge(h.quadrant).label}
                  </span>
                  {/* Enhancement #1: Lifecycle badge */}
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${lcBadge.className}`}>
                    {lifecycle}
                  </span>
                  {/* Enhancement #4: Regime alignment */}
                  {regime && regimeAlignment !== "neutral" && (
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                      regimeAlignment === "aligned"
                        ? "bg-green-500/10 text-green-400 border-green-500/30"
                        : "bg-red-500/10 text-red-400 border-red-500/30"
                    }`}>
                      {regimeAlignment === "aligned" ? "Regime Aligned" : "Regime Headwind"}
                    </span>
                  )}
                </div>
              </div>
              <span className={`text-lg font-bold ${perfColor(r.event.etfPerformancePct)}`}>
                {r.event.etfPerformancePct > 0 ? "+" : ""}
                {r.event.etfPerformancePct.toFixed(1)}%
              </span>
            </div>

            {/* Enhancement #2: Conviction score */}
            <div className="mt-2 flex items-center gap-2">
              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${convictionBadge(conviction.level)}`}>
                {conviction.level}
              </span>
              <span className="text-[10px] text-[#666] leading-tight">
                {conviction.reason}
              </span>
            </div>

            {/* Health signals */}
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#888]">Momentum</span>
                <span className={accelColor(h.acceleration)}>
                  {accelLabel(h.acceleration)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#888]">Money Flow</span>
                <span className={cmfColor(h.cmf20)}>
                  {cmfLabel(h.cmf20)}
                </span>
              </div>
            </div>

            {/* Enhancement #3: Signal sparkline + exit warnings */}
            <div className="mt-2 flex items-center gap-2">
              <SignalSparkline history={r.event.signalHistory ?? []} />
              {exitWarnings.length > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-amber-400">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span className="truncate">{exitWarnings[0]}</span>
                </div>
              )}
            </div>

            {/* Enhancement #1: Lifecycle guidance */}
            <div className="mt-1 text-[10px] text-[#666] italic">{lcBadge.guidance}</div>

            <div className="mt-2 flex items-center gap-2 text-xs text-[#888]">
              <span>Started {r.event.startDate}</span>
              <span className="text-[#555]">|</span>
              <span>{r.event.daysActive}d active</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              <SignalDot
                active={r.event.signals.rsGoldenCross}
                label="RS Cross"
              />
              <SignalDot
                active={r.event.signals.volumeSurge}
                label="Vol Surge"
              />
              <SignalDot
                active={r.event.signals.priceAbove50MA}
                label=">50MA"
              />
            </div>

            {/* Enhancement #6: Historical projection */}
            <HistoricalProjection event={r.event} patternStats={patternStats} />

            <div className="mt-2 flex items-center justify-end text-xs text-[#666]">
              {isExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </div>
            </div>{/* close p-4 wrapper */}
          </button>
        );
      })}
    </div>
  );
}

// ── Section 2: Stock Performance Table (sortable + categorized) ──

type StockSortKey = "symbol" | "name" | "action" | "priceAtRotationStart" | "priceNow" | "performancePct" | "vsEtf" | "aboveSma50" | "volumeVsAvg";

function StockPerformanceTable({
  detail,
  lifecycle,
}: {
  detail: ActiveRotationDetail;
  lifecycle: LifecycleStage;
}) {
  const [sortKey, setSortKey] = useState<StockSortKey>("performancePct");
  const [sortAsc, setSortAsc] = useState(false);

  const sectorAvgPct =
    detail.stocks.length > 0
      ? detail.stocks.reduce((s, st) => s + st.performancePct, 0) / detail.stocks.length
      : 0;

  const etfPerfPct = detail.event.etfPerformancePct;

  const sorted = useMemo(() => {
    const copy = detail.stocks.map((s) => {
      const cat = categorizeStock(s, sectorAvgPct);
      const stockAction = computeStockAction(cat, lifecycle);
      const vsEtf = s.performancePct - etfPerfPct;
      return { stock: s, cat, stockAction, vsEtf };
    });
    copy.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortKey === "action") {
        av = a.stockAction.sortOrder;
        bv = b.stockAction.sortOrder;
      } else if (sortKey === "vsEtf") {
        av = a.vsEtf;
        bv = b.vsEtf;
      } else if (sortKey === "aboveSma50") {
        av = a.stock.aboveSma50 ? 1 : 0;
        bv = b.stock.aboveSma50 ? 1 : 0;
      } else {
        av = a.stock[sortKey];
        bv = b.stock[sortKey];
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return copy;
  }, [detail.stocks, sectorAvgPct, sortKey, sortAsc, lifecycle, etfPerfPct]);

  if (detail.stocks.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-[#888]">
        No stock data available for this rotation
      </p>
    );
  }

  function handleSort(key: StockSortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "symbol" || key === "name");
    }
  }

  function SortArrow({ col }: { col: StockSortKey }) {
    if (sortKey !== col) return <span className="ml-1 text-[#444]">&uarr;&darr;</span>;
    return <span className="ml-1 text-[#5ba3e6]">{sortAsc ? "\u25B2" : "\u25BC"}</span>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2a2a2a] text-left text-xs text-[#888]">
            <th className="cursor-pointer px-3 py-2 select-none hover:text-white" onClick={() => handleSort("symbol")}>
              Symbol<SortArrow col="symbol" />
            </th>
            <th className="cursor-pointer px-3 py-2 select-none hover:text-white" onClick={() => handleSort("name")}>
              Name<SortArrow col="name" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-center select-none hover:text-white" onClick={() => handleSort("action")}>
              Action<SortArrow col="action" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("priceAtRotationStart")}>
              Start Price<SortArrow col="priceAtRotationStart" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("priceNow")}>
              Current<SortArrow col="priceNow" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("performancePct")}>
              % Change<SortArrow col="performancePct" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("vsEtf")}>
              vs ETF<SortArrow col="vsEtf" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-center select-none hover:text-white" onClick={() => handleSort("aboveSma50")}>
              &gt;50MA<SortArrow col="aboveSma50" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("volumeVsAvg")}>
              Vol vs Avg<SortArrow col="volumeVsAvg" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ stock: s, stockAction, vsEtf }) => {
            return (
              <tr
                key={s.symbol}
                className={`border-b border-[#1a1a1a] transition-colors hover:bg-[#1a1a1a] ${stockAction.rowBg}`}
              >
                <td className="px-3 py-2 font-mono font-semibold text-white">
                  {s.symbol}
                </td>
                <td className="px-3 py-2 text-[#ccc]">{s.name}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${stockAction.badgeClass}`}>
                    {stockAction.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-[#888]">
                  ${s.priceAtRotationStart.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-white">
                  ${s.priceNow.toFixed(2)}
                </td>
                <td className={`px-3 py-2 text-right font-semibold ${perfColor(s.performancePct)}`}>
                  {s.performancePct > 0 ? "+" : ""}
                  {s.performancePct.toFixed(1)}%
                </td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${vsEtf >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {vsEtf >= 0 ? "+" : ""}{vsEtf.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      s.aboveSma50 ? "bg-green-400" : "bg-red-400"
                    }`}
                  />
                </td>
                <td className="px-3 py-2 text-right text-[#888]">
                  {s.volumeVsAvg.toFixed(1)}x
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Enhancement D: Strategy Summary Bar ──

function StrategySummaryBar({
  detail,
  lifecycle,
  actionSignal,
}: {
  detail: ActiveRotationDetail;
  lifecycle: LifecycleStage;
  actionSignal: ActionSignal;
}) {
  const sectorAvgPct =
    detail.stocks.length > 0
      ? detail.stocks.reduce((s, st) => s + st.performancePct, 0) / detail.stocks.length
      : 0;

  let leaders = 0;
  let entryCandidates = 0;
  let avoidCount = 0;

  for (const s of detail.stocks) {
    const cat = categorizeStock(s, sectorAvgPct);
    const action = computeStockAction(cat, lifecycle);
    if (action.label === "Ride" || action.label === "Take Profit") leaders++;
    else if (action.label === "Entry Candidate") entryCandidates++;
    else if (action.label === "Avoid" || action.label === "Exit") avoidCount++;
  }

  return (
    <div className={`border-b ${actionSignal.borderColor} ${actionSignal.bgColor} px-4 py-3`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <div className="flex items-center gap-2">
          <ActionIcon icon={actionSignal.icon} className={`h-4 w-4 ${actionSignal.color}`} />
          <span className={`text-sm font-semibold ${actionSignal.color}`}>{actionSignal.action}</span>
          <span className="text-xs text-[#888]">— {actionSignal.description}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#888]">
          {leaders > 0 && <span>Leaders: <span className="text-green-400 font-medium">{leaders}</span></span>}
          {entryCandidates > 0 && <span>Entry Candidates: <span className="text-cyan-400 font-medium">{entryCandidates}</span></span>}
          {avoidCount > 0 && <span>Avoid: <span className="text-red-400 font-medium">{avoidCount}</span></span>}
          <span className="text-[#666]">|</span>
          <span>
            ETF ({detail.event.etf}){" "}
            <span className={perfColor(detail.event.etfPerformancePct)}>
              {detail.event.etfPerformancePct > 0 ? "+" : ""}{detail.event.etfPerformancePct.toFixed(1)}%
            </span>
            {" "}since rotation start
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Section 3: Historical Timeline ──

function HistoricalTimeline({ events }: { events: RotationEvent[] }) {
  // Group events by sector
  const sectors = useMemo(() => {
    const map = new Map<string, { etf: string; name: string; events: RotationEvent[] }>();
    for (const e of events) {
      if (!map.has(e.sectorId)) {
        map.set(e.sectorId, { etf: e.etf, name: e.sectorName, events: [] });
      }
      map.get(e.sectorId)!.events.push(e);
    }
    // Sort by sector name
    return Array.from(map.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name)
    );
  }, [events]);

  if (sectors.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center text-[#888]">
        No rotation events to display
      </div>
    );
  }

  // Date range: 12 months ago to today
  const now = new Date();
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const startMs = yearAgo.getTime();
  const endMs = now.getTime();
  const rangeMs = endMs - startMs;

  const W = 900;
  const H = sectors.length * 32 + 60;
  const LEFT = 70;
  const RIGHT = 20;
  const TOP = 30;
  const BAR_H = 16;

  // Month labels
  const months: { label: string; x: number }[] = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(yearAgo);
    d.setMonth(d.getMonth() + m);
    const x =
      LEFT +
      ((d.getTime() - startMs) / rangeMs) * (W - LEFT - RIGHT);
    months.push({
      label: d.toLocaleString("en-US", { month: "short" }),
      x,
    });
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[600px]"
        role="img"
        aria-label="Sector rotation timeline"
      >
        {/* Month grid lines and labels */}
        {months.map((m, i) => (
          <g key={i}>
            <line
              x1={m.x}
              y1={TOP - 5}
              x2={m.x}
              y2={H - 10}
              stroke="#222"
              strokeWidth={1}
            />
            <text
              x={m.x}
              y={TOP - 10}
              textAnchor="middle"
              fill="#666"
              fontSize={10}
            >
              {m.label}
            </text>
          </g>
        ))}

        {/* Sector rows */}
        {sectors.map(([sectorId, { etf, name, events: sectorEvents }], rowIdx) => {
          const y = TOP + rowIdx * 32;

          return (
            <g key={sectorId}>
              {/* Sector label */}
              <text
                x={LEFT - 5}
                y={y + BAR_H / 2 + 4}
                textAnchor="end"
                fill="#aaa"
                fontSize={10}
              >
                {etf}
              </text>

              {/* Row background */}
              <rect
                x={LEFT}
                y={y}
                width={W - LEFT - RIGHT}
                height={BAR_H}
                fill={rowIdx % 2 === 0 ? "#111" : "#151515"}
                rx={2}
              />

              {/* Rotation bars */}
              {sectorEvents.map((evt, evtIdx) => {
                const s = new Date(evt.startDate).getTime();
                const e = evt.endDate
                  ? new Date(evt.endDate).getTime()
                  : endMs;

                const x1 =
                  LEFT +
                  Math.max(0, ((s - startMs) / rangeMs)) *
                    (W - LEFT - RIGHT);
                const x2 =
                  LEFT +
                  Math.min(1, ((e - startMs) / rangeMs)) *
                    (W - LEFT - RIGHT);
                const barW = Math.max(2, x2 - x1);

                const fill =
                  evt.etfPerformancePct >= 0 ? "#22c55e" : "#ef4444";
                const opacity =
                  Math.min(1, 0.3 + Math.abs(evt.etfPerformancePct) * 0.07);

                return (
                  <g key={evtIdx}>
                    <rect
                      x={x1}
                      y={y + 2}
                      width={barW}
                      height={BAR_H - 4}
                      fill={fill}
                      opacity={opacity}
                      rx={2}
                    >
                      <title>
                        {name}: {evt.startDate} - {evt.endDate ?? "Active"} (
                        {evt.etfPerformancePct > 0 ? "+" : ""}
                        {evt.etfPerformancePct.toFixed(1)}%)
                      </title>
                    </rect>
                    {/* Pulsing indicator for active rotations */}
                    {evt.endDate === null && (
                      <circle
                        cx={x2}
                        cy={y + BAR_H / 2}
                        r={3}
                        fill={fill}
                      >
                        <animate
                          attributeName="opacity"
                          values="1;0.3;1"
                          dur="2s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Today marker */}
        <line
          x1={W - RIGHT}
          y1={TOP - 5}
          x2={W - RIGHT}
          y2={H - 10}
          stroke="#5ba3e6"
          strokeWidth={1}
          strokeDasharray="3,3"
          opacity={0.5}
        />
        <text
          x={W - RIGHT}
          y={H}
          textAnchor="middle"
          fill="#5ba3e6"
          fontSize={9}
          opacity={0.7}
        >
          Today
        </text>
      </svg>
    </div>
  );
}

// ── Section 4: Pattern Statistics (sortable) ──

type PatternSortKey = "sectorName" | "totalRotations" | "avgDurationDays" | "avgPerformancePct" | "bestPerformancePct" | "worstPerformancePct";

function PatternStatsTable({
  stats,
}: {
  stats: RotationPatternStats[];
}) {
  const [sortKey, setSortKey] = useState<PatternSortKey>("totalRotations");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...stats];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return copy;
  }, [stats, sortKey, sortAsc]);

  if (stats.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-8 text-center text-[#888]">
        No pattern statistics available
      </div>
    );
  }

  function handleSort(key: PatternSortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "sectorName");
    }
  }

  function SortArrow({ col }: { col: PatternSortKey }) {
    if (sortKey !== col) return <span className="ml-1 text-[#444]">&uarr;&darr;</span>;
    return <span className="ml-1 text-[#5ba3e6]">{sortAsc ? "\u25B2" : "\u25BC"}</span>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2a2a2a] text-left text-xs text-[#888]">
            <th className="cursor-pointer px-3 py-2 select-none hover:text-white" onClick={() => handleSort("sectorName")}>
              Sector<SortArrow col="sectorName" />
            </th>
            <th className="px-3 py-2">ETF</th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("totalRotations")}>
              Rotations (1y)<SortArrow col="totalRotations" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("avgDurationDays")}>
              Avg Duration<SortArrow col="avgDurationDays" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("avgPerformancePct")}>
              Avg Perf<SortArrow col="avgPerformancePct" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("bestPerformancePct")}>
              Best<SortArrow col="bestPerformancePct" />
            </th>
            <th className="cursor-pointer px-3 py-2 text-right select-none hover:text-white" onClick={() => handleSort("worstPerformancePct")}>
              Worst<SortArrow col="worstPerformancePct" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr
              key={s.sectorId}
              className="border-b border-[#1a1a1a] transition-colors hover:bg-[#1a1a1a]"
            >
              <td className="px-3 py-2 font-medium text-white">
                {s.sectorName}
              </td>
              <td className="px-3 py-2 font-mono text-[#888]">{s.etf}</td>
              <td className="px-3 py-2 text-right text-white">
                {s.totalRotations}
              </td>
              <td className="px-3 py-2 text-right text-[#ccc]">
                {s.avgDurationDays}d
              </td>
              <td
                className={`px-3 py-2 text-right font-semibold ${perfColor(s.avgPerformancePct)}`}
              >
                {s.avgPerformancePct > 0 ? "+" : ""}
                {s.avgPerformancePct.toFixed(1)}%
              </td>
              <td
                className={`px-3 py-2 text-right ${perfColor(s.bestPerformancePct)}`}
              >
                {s.bestPerformancePct > 0 ? "+" : ""}
                {s.bestPerformancePct.toFixed(1)}%
              </td>
              <td
                className={`px-3 py-2 text-right ${perfColor(s.worstPerformancePct)}`}
              >
                {s.worstPerformancePct > 0 ? "+" : ""}
                {s.worstPerformancePct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Recently Ended Rotations ──

function RecentlyEndedList({ events }: { events: RotationEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      {events.map((e, i) => {
        const h = getHealth(e);
        return (
        <div
          key={`${e.sectorId}-${i}`}
          className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <div>
              <span className="font-medium text-white">{e.sectorName}</span>
              <span className="ml-2 text-xs text-[#888]">{e.etf}</span>
              <span className={`ml-2 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${quadrantBadge(h.quadrant).className}`}>
                {h.quadrant}
              </span>
            </div>
            <span className="text-xs text-[#666]">
              {e.startDate} — {e.endDate} ({e.daysActive}d)
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-xs sm:flex sm:gap-3">
              <span className={accelColor(h.acceleration)}>
                Accel: {h.acceleration > 0 ? "+" : ""}{h.acceleration.toFixed(2)}
              </span>
              <span className={cmfColor(h.cmf20)}>
                CMF: {h.cmf20 > 0 ? "+" : ""}{h.cmf20.toFixed(3)}
              </span>
            </div>
            <span className={`font-semibold ${perfColor(e.etfPerformancePct)}`}>
              {e.etfPerformancePct > 0 ? "+" : ""}
              {e.etfPerformancePct.toFixed(1)}%
            </span>
          </div>
        </div>
        );
      })}
    </div>
  );
}

// ── Main Page Component ──

export default function RotationTrackerPage() {
  const [data, setData] = useState<RotationTrackerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  const fetchData = useCallback(async (skipCache = false) => {
    setLoading(true);
    setError(null);

    // Try localStorage cache first
    if (!skipCache) {
      const cached = loadCached();
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/rotation-tracker");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }
      const result = (await res.json()) as RotationTrackerResult;
      setData(result);
      saveCache(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rotation data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 10 minutes
  useEffect(() => {
    const interval = setInterval(() => fetchData(true), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Find expanded rotation detail
  const expandedDetail = useMemo(() => {
    if (!data || !expandedSector) return null;
    return (
      data.activeRotations.find((r) => r.event.sectorId === expandedSector) ??
      null
    );
  }, [data, expandedSector]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Rotation Tracker</h1>
          <p className="mt-1 text-sm text-[#888]">
            Detect sector rotation inflection points and track stock performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && <DataAgeBadge calculatedAt={data.calculatedAt} />}
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="rounded-md border border-[#333] bg-[#1a1a1a] p-2 text-[#a0a0a0] transition-colors hover:bg-[#222] hover:text-white disabled:opacity-50"
            aria-label="Refresh data"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#5ba3e6]" />
          <span className="ml-3 text-[#888]">
            Analyzing sector rotations...
          </span>
        </div>
      )}

      {/* Content */}
      {data && (
        <div className="space-y-8">
          {/* Enhancement #4: Regime Banner */}
          {data.regime && (
            <section>
              <RegimeBanner regime={data.regime} />
            </section>
          )}

          {/* Enhancement #7: Pair Z-Score Bar */}
          {data.pairSignals && (
            <section>
              <PairZScoreBar pairSignals={data.pairSignals} />
            </section>
          )}

          {/* Section 1: Active Rotations */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
              <TrendingUp className="h-5 w-5 text-green-400" />
              Active Rotations
              {data.activeRotations.length > 0 && (
                <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-400">
                  {data.activeRotations.length}
                </span>
              )}
            </h2>
            <ActiveRotationCards
              rotations={data.activeRotations}
              onExpand={setExpandedSector}
              expandedId={expandedSector}
              regime={data.regime}
              patternStats={data.patternStats}
            />
          </section>

          {/* Section 2: Stock Performance (expanded) */}
          {expandedDetail && (() => {
            const lc = computeLifecycleStage(expandedDetail.event);
            const conv = computeConviction(expandedDetail.event);
            const ra = data.regime ? isRegimeAligned(expandedDetail.event.sectorName, data.regime) : "neutral";
            const as_ = computeActionSignal(lc, conv, ra);
            return (
              <section className="rounded-lg border border-[#2a2a2a] bg-[#111] overflow-hidden">
                <div className="border-b border-[#2a2a2a] px-4 py-3">
                  <h2 className="font-semibold text-white">
                    {expandedDetail.event.sectorName} — Top Stocks Since Rotation
                    Start ({expandedDetail.event.startDate})
                  </h2>
                </div>
                <StrategySummaryBar detail={expandedDetail} lifecycle={lc} actionSignal={as_} />
                <StockPerformanceTable detail={expandedDetail} lifecycle={lc} />
              </section>
            );
          })()}

          {/* Recently Ended */}
          {data.recentlyEndedRotations.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
                <TrendingDown className="h-5 w-5 text-[#888]" />
                Recently Ended
              </h2>
              <RecentlyEndedList events={data.recentlyEndedRotations} />
            </section>
          )}

          {/* Historical Timeline */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              12-Month Timeline
            </h2>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
              <HistoricalTimeline events={data.allEvents} />
              <div className="mt-2 flex items-center justify-center gap-4 text-xs text-[#666]">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-6 rounded bg-green-500/50" />{" "}
                  Positive return
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-6 rounded bg-red-500/50" />{" "}
                  Negative return
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-400" />{" "}
                  Active
                </span>
              </div>
            </div>
          </section>

          {/* Pattern Statistics */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">
              Pattern Statistics
            </h2>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#111]">
              <PatternStatsTable stats={data.patternStats} />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
