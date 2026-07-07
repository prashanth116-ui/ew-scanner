import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { calculateSectorRotation } from "@/lib/sector-rotation/sector-rotation";
import { calculateRotationTracker } from "@/lib/sector-rotation/rotation-tracker";
import { fetchPremarketData } from "@/lib/premarket/fetch";
import { fetchMacroRegime, enhanceRegimeWithCrossAsset } from "@/lib/sector-rotation/regime";
import { computeMarketPosture, computeSectorTiers, computeRiskFlags } from "@/lib/sector-rotation/brief";
import type { MarketPosture, PostureResult, RiskFlag, SectorTiers } from "@/lib/sector-rotation/brief";
import { computeBiasScore } from "@/lib/premarket/scoring";
import { computeTradingBias } from "@/lib/premarket/trading-bias";
import type { VixBounds } from "@/lib/premarket/trading-bias";
import {
  computeLifecycleStage,
  computeConviction,
  computeActionSignal,
  isRegimeAligned,
} from "@/lib/sector-rotation/rotation-helpers";
import type { ActionSignal } from "@/lib/sector-rotation/rotation-helpers";
import { computeLeadershipHealth } from "@/lib/sector-rotation/leadership-health";
import type { LeadershipHealth } from "@/lib/sector-rotation/leadership-health";
import { sendTelegramMessage } from "@/lib/ew-wave/telegram";
import { COMPOSITE } from "@/lib/sector-rotation/config";
import { createAdminClient } from "@/lib/supabase/server";
import { recordSectorSnapshotBatch } from "@/lib/supabase/persistence";
import type { SectorSnapshotRecord } from "@/lib/supabase/persistence";
import type { SectorRotationResult, SectorRotationScore, RRGQuadrant } from "@/lib/sector-rotation/types";
import type { RotationTrackerResult, LifecycleStage, ConvictionResult, RegimeData, PairSignalData } from "@/lib/sector-rotation/rotation-types";
import type { SectorBreadth, MarketBias, DayType } from "@/lib/premarket/types";

export const maxDuration = 60;

// ── Direction Synthesis ──

type Direction = "BULL" | "LEAN BULL" | "NEUTRAL" | "LEAN BEAR" | "BEAR";

interface RotationAnalysis {
  sectorName: string;
  etf: string;
  daysActive: number;
  performancePct: number;
  lifecycle: LifecycleStage;
  conviction: ConvictionResult;
  action: ActionSignal;
  regimeAlignment: "aligned" | "headwind" | "neutral";
}

function synthesizeDirection(
  posture: MarketPosture,
  bias: MarketBias | null,
  riskFlags: RiskFlag[],
  rotationAnalyses: RotationAnalysis[],
): Direction {
  const highRiskCount = riskFlags.filter((f) => f.severity === "high").length;
  const enterCount = rotationAnalyses.filter((r) => r.action.action === "ENTER").length;
  const isBearish = bias === "Strong Bear" || bias === "Lean Bear";
  const isBullish = bias === "Strong Bull" || bias === "Lean Bull";

  // BEAR: posture=CASH OR (Strong Bear bias + 3+ high risk flags)
  if (posture === "CASH" || (bias === "Strong Bear" && highRiskCount >= 3)) {
    return "BEAR";
  }

  // LEAN BEAR: Strong Bear bias always demands respect — unanimous futures conviction
  // overrides even bullish structure. Also: DEFENSIVE + any bearish.
  if (bias === "Strong Bear" || (posture === "DEFENSIVE" && isBearish)) {
    return "LEAN BEAR";
  }

  // DEFENSIVE posture without bearish bias — cautious structure, neutral futures
  if (posture === "DEFENSIVE") {
    return "NEUTRAL";
  }

  // BULL: posture=AGGRESSIVE + bullish bias + >=2 ENTER rotations
  if (posture === "AGGRESSIVE" && isBullish && enterCount >= 2) {
    return "BULL";
  }

  // LEAN BULL: posture=SELECTIVE/AGGRESSIVE + not bearish + >=1 ENTER
  if (
    (posture === "SELECTIVE" || posture === "AGGRESSIVE") &&
    !isBearish &&
    enterCount >= 1
  ) {
    return "LEAN BULL";
  }

  // NEUTRAL: fallback (includes AGGRESSIVE/SELECTIVE + Lean Bear = mild conflict)
  return "NEUTRAL";
}

// ── Previous Snapshot Loading (Supabase) ──

interface PreviousSnapshot {
  sector: string;
  quadrant: string;
  compositeScore: number;
}

async function loadPreviousSnapshot(): Promise<PreviousSnapshot[]> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return [];

    const today = new Date().toISOString().slice(0, 10);

    // Find most recent snapshot date that isn't today
    const { data: dates } = await supabase
      .from("sector_snapshots")
      .select("snapshot_date")
      .neq("snapshot_date", today)
      .order("snapshot_date", { ascending: false })
      .limit(1);

    if (!dates?.length) return [];

    const { data } = await supabase
      .from("sector_snapshots")
      .select("sector, quadrant, momentum_score")
      .eq("snapshot_date", dates[0].snapshot_date);

    return (data ?? []).map((row) => ({
      sector: row.sector,
      quadrant: row.quadrant ?? "LAGGING",
      compositeScore: row.momentum_score ?? 0,
    }));
  } catch {
    return [];
  }
}

// ── What Changed (server-side, from Supabase snapshots) ──

interface WhatChangedSummary {
  upgrades: number;
  downgrades: number;
  quadrantTransitions: { sector: string; from: string; to: string }[];
}

function computeWhatChangedFromSnapshots(
  currentSectors: SectorRotationScore[],
  previousSnapshot: PreviousSnapshot[],
): WhatChangedSummary {
  if (previousSnapshot.length === 0) {
    return { upgrades: 0, downgrades: 0, quadrantTransitions: [] };
  }

  const prevMap = new Map(previousSnapshot.map((s) => [s.sector, s]));
  const quadrantRank: Record<string, number> = { LEADING: 3, IMPROVING: 2, WEAKENING: 1, LAGGING: 0 };
  let upgrades = 0;
  let downgrades = 0;
  const transitions: { sector: string; from: string; to: string }[] = [];

  for (const curr of currentSectors) {
    const prev = prevMap.get(curr.sector);
    if (!prev || prev.quadrant === curr.quadrant) continue;

    const prevRank = quadrantRank[prev.quadrant] ?? 0;
    const currRank = quadrantRank[curr.quadrant] ?? 0;
    if (currRank > prevRank) upgrades++;
    else downgrades++;

    transitions.push({ sector: curr.sector, from: prev.quadrant, to: curr.quadrant });
  }

  return { upgrades, downgrades, quadrantTransitions: transitions };
}

// ── Telegram Formatter ──

interface BriefingData {
  direction: Direction;
  posture: MarketPosture;
  postureReasoning: string;
  regimeLabel: string;
  regimeConfidence: number | null;
  vix: number | null;
  vixSlope: string | null;
  bias: MarketBias | null;
  biasConfidence: number | null;
  biasConflict: boolean;
  biasConflictDetail: string | null;
  futures: { symbol: string; changePct: number }[];
  dayType: DayType | null;
  preferredDirection: "Long" | "Short" | "Flat" | null;
  leadingAsset: string | null;
  weakestAsset: string | null;
  leadershipHealth: LeadershipHealth | null;
  sectorTierCounts: { actionable: number; watch: number; avoid: number };
  sectorBreadth: { advancing: number; total: number } | null;
  crossPairs: { xlyXlp: { ratio: number; trend: string } | null; xlkXlu: { ratio: number; trend: string } | null };
  pairSignals: { xlyXlp: PairSignalData | null; xlkXlu: PairSignalData | null } | null;
  dispersionIndex: number | null;
  riskFlags: RiskFlag[];
  topSectors: { sector: string; quadrant: string; acceleration: number; cmf: number; stealth: boolean }[];
  rotationAnalyses: RotationAnalysis[];
  whatChanged: WhatChangedSummary | null;
  topPicks: { symbol: string; acceleration: number; category: string; conviction: string }[];
  pullbackWatchCount: number;
  watchlist: string[];
}

function formatDailyBriefing(data: BriefingData): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  const lines: string[] = [];
  lines.push(`<b>DAILY BRIEFING \u2014 ${date}</b>`);
  lines.push("");
  lines.push(`<b>DIRECTION: ${data.direction}</b>`);
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");

  // ── DAY TRADE ──

  // MACRO
  lines.push("");
  lines.push("<b>MACRO</b>");
  const vixStr = data.vix != null ? `VIX: ${data.vix.toFixed(1)} (${data.vixSlope ?? "?"})` : "VIX: N/A";
  const regimeConf = data.regimeConfidence != null ? ` (${data.regimeConfidence}%)` : "";
  lines.push(`Regime: ${data.regimeLabel}${regimeConf} | ${vixStr}`);
  const todayStr = data.bias
    ? `Today: ${data.bias}${data.biasConfidence != null ? ` (${data.biasConfidence}%)` : ""}`
    : "Today: N/A";
  lines.push(`Structure: ${data.posture} | ${todayStr}`);
  if (data.biasConflict && data.biasConflictDetail) {
    lines.push(`\u26a0 CONFLICT: ${data.biasConflictDetail}`);
  }

  // FUTURES
  if (data.futures.length > 0) {
    lines.push("");
    lines.push("<b>FUTURES</b>");
    const labels: Record<string, string> = { "ES=F": "ES", "NQ=F": "NQ", "YM=F": "YM", "RTY=F": "RTY", "CL=F": "Oil", "GC=F": "Gold" };
    const equities = data.futures.filter((f) => ["ES=F", "NQ=F", "YM=F", "RTY=F"].includes(f.symbol));
    if (equities.length > 0) {
      lines.push(equities.map((f) => `${labels[f.symbol] ?? f.symbol} ${fmtPct(f.changePct)}`).join(" | "));
    }
    const commodities = data.futures.filter((f) => ["CL=F", "GC=F"].includes(f.symbol));
    if (commodities.length > 0) {
      lines.push(commodities.map((f) => `${labels[f.symbol] ?? f.symbol} ${fmtPct(f.changePct)}`).join(" | "));
    }
    const parts: string[] = [];
    if (data.dayType) parts.push(data.dayType);
    if (data.preferredDirection) parts.push(`Dir: ${data.preferredDirection}`);
    if (data.leadingAsset) parts.push(`Lead: ${data.leadingAsset}`);
    if (data.weakestAsset) parts.push(`Weak: ${data.weakestAsset}`);
    if (parts.length > 0) lines.push(parts.join(" | "));
  }

  // SECTORS (day-trade: breadth + top actionable)
  lines.push("");
  const breadthTag = data.sectorBreadth ? ` (${data.sectorBreadth.advancing}/${data.sectorBreadth.total})` : "";
  lines.push(`<b>SECTORS</b>${breadthTag}`);
  if (data.topSectors.length === 0) {
    lines.push("No actionable sectors");
  } else {
    for (const s of data.topSectors.slice(0, 3)) {
      lines.push(
        `${s.sector}: ${s.quadrant} | accel ${s.acceleration.toFixed(2)} | CMF ${s.cmf >= 0 ? "+" : ""}${s.cmf.toFixed(2)}`
      );
    }
  }

  // TOP PICKS (capped at 3)
  lines.push("");
  lines.push("<b>TOP PICKS</b>");
  if (data.topPicks.length === 0) {
    lines.push("No qualifying picks");
  } else {
    for (const p of data.topPicks.slice(0, 3)) {
      lines.push(
        `${p.symbol} \u2014 accel ${p.acceleration.toFixed(2)} | ${p.category} | ${p.conviction}`
      );
    }
  }

  // ── SWING CONTEXT ──

  lines.push("");
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  lines.push("<b>SWING CONTEXT</b>");

  // Rotations
  if (data.rotationAnalyses.length === 0) {
    lines.push("No active rotations");
  } else {
    const enterCount = data.rotationAnalyses.filter((r) => r.action.action === "ENTER").length;
    lines.push(`Rotations: ${data.rotationAnalyses.length} active | ${enterCount} ENTER`);
    for (const r of data.rotationAnalyses.slice(0, 2)) {
      const actionIcon = r.action.action === "ENTER" ? " \u2713" : "";
      const perfStr = `${r.performancePct >= 0 ? "+" : ""}${r.performancePct.toFixed(1)}%`;
      lines.push(
        `${r.sectorName}: ${r.lifecycle} (${r.daysActive}d, ${perfStr}) | ${r.conviction.level} | ${r.action.action}${actionIcon}`
      );
    }
  }

  // Dispersion + Cross-Sector Pairs
  const swingParts: string[] = [];
  if (data.dispersionIndex != null) {
    swingParts.push(`Disp: ${data.dispersionIndex.toFixed(1)}${data.dispersionIndex > 5 ? " (high)" : data.dispersionIndex < 2 ? " (low)" : ""}`);
  }
  const pairParts: string[] = [];
  if (data.crossPairs.xlyXlp) {
    const signal = data.pairSignals?.xlyXlp;
    const extreme = signal?.isExtreme ? ` [${signal.signal === "extreme_risk_on" ? "RISK ON" : "RISK OFF"}]` : "";
    pairParts.push(`XLY/XLP: ${data.crossPairs.xlyXlp.trend}${extreme}`);
  }
  if (data.crossPairs.xlkXlu) {
    const signal = data.pairSignals?.xlkXlu;
    const extreme = signal?.isExtreme ? ` [${signal.signal === "extreme_risk_on" ? "RISK ON" : "RISK OFF"}]` : "";
    pairParts.push(`XLK/XLU: ${data.crossPairs.xlkXlu.trend}${extreme}`);
  }
  if (swingParts.length > 0 || pairParts.length > 0) {
    lines.push([...swingParts, ...pairParts].join(" | "));
  }

  // Leadership + Pullback Watch
  const contextParts: string[] = [];
  if (data.leadershipHealth) {
    contextParts.push(`Leadership: ${data.leadershipHealth.score} (${data.leadershipHealth.label})`);
  }
  if (data.pullbackWatchCount > 0) {
    contextParts.push(`Pullbacks: ${data.pullbackWatchCount}`);
  }
  if (contextParts.length > 0) {
    lines.push(contextParts.join(" | "));
  }

  // What Changed
  if (data.whatChanged && (data.whatChanged.upgrades > 0 || data.whatChanged.downgrades > 0)) {
    const wc = data.whatChanged;
    const changeParts: string[] = [];
    if (wc.upgrades > 0) changeParts.push(`${wc.upgrades}\u2191`);
    if (wc.downgrades > 0) changeParts.push(`${wc.downgrades}\u2193`);
    lines.push(`Quadrants: ${changeParts.join(" ")}`);
  }

  // Watchlist (shared)
  if (data.watchlist.length > 0) {
    lines.push("");
    lines.push(`<b>WATCHLIST:</b> ${data.watchlist.join(", ")}`);
  }

  return lines.join("\n");
}

// ── GET Handler ──

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const startTime = Date.now();

    // 1. Parallel fetch all data sources + previous snapshot for "what changed"
    const [premarketResult, sectorResult, regime, rotationData, previousSnapshot] = await Promise.all([
      fetchPremarketData(),
      calculateSectorRotation().catch(() => null),
      fetchMacroRegime().catch(() => null),
      calculateRotationTracker().catch(() => null),
      loadPreviousSnapshot().catch(() => [] as PreviousSnapshot[]),
    ]);

    // 2. Enhance regime with cross-asset (GLD/TLT acceleration)
    const enhancedRegime = regime && sectorResult?.crossAssetScores
      ? enhanceRegimeWithCrossAsset(regime, {
          gld: sectorResult.crossAssetScores.find((s) => s.etf === "GLD")?.acceleration,
          tlt: sectorResult.crossAssetScores.find((s) => s.etf === "TLT")?.acceleration,
        })
      : regime;

    // 3. Attach regime to sector result
    let posture: PostureResult = { posture: "SELECTIVE", reasoning: "Sector data unavailable." };
    const dataWithRegime: SectorRotationResult | null = sectorResult ? {
      ...sectorResult,
      regime: enhancedRegime ? {
        regime: enhancedRegime.regime,
        regimeConfidence: enhancedRegime.regimeConfidence,
        vix: enhancedRegime.vix,
        vixSlope: enhancedRegime.vixSlope,
        yield10y: enhancedRegime.yield10y,
        dxy: enhancedRegime.dxy,
        dxyTrend: enhancedRegime.dxyTrend,
        favoredSectors: enhancedRegime.favoredSectors,
        avoidSectors: enhancedRegime.avoidSectors,
        vixBounds: enhancedRegime.vixBounds,
      } : undefined,
    } : null;

    // 4. Compute posture
    if (dataWithRegime) {
      posture = computeMarketPosture(dataWithRegime, rotationData);
    }

    // 5. Compute sector breadth
    let sectorBreadth: SectorBreadth | null = null;
    if (sectorResult) {
      const gicsSectors = sectorResult.sectors.filter((s) => s.category === "gics_sector");
      let advancing = 0;
      let declining = 0;
      for (const s of gicsSectors) {
        if (s.compositeScore >= COMPOSITE.ACTIONABLE_THRESHOLD) advancing++;
        else declining++;
      }
      const total = advancing + declining;
      sectorBreadth = { advancing, declining, ratio: total > 0 ? advancing / total : 0.5 };
    }

    // 6. Compute bias score and trading bias
    const { score: biasScore, label: biasLabel } = computeBiasScore(
      premarketResult.futures,
      posture,
      enhancedRegime,
      sectorBreadth,
    );
    const vixBounds: VixBounds | null = enhancedRegime?.vixBounds ?? null;
    const tradingBias = computeTradingBias(
      premarketResult.futures,
      premarketResult.vixData,
      biasScore,
      sectorBreadth,
      vixBounds,
    );

    // #5 Detect bias conflict (structural posture vs futures bias)
    // Posture reflects structure (regime, rotations, leadership health).
    // Trading bias reflects tactical futures momentum.
    // Conflict = structural signal says one direction, futures say the opposite.
    let biasConflict = false;
    let biasConflictDetail: string | null = null;
    if (tradingBias) {
      const postureIsBullish = posture.posture === "AGGRESSIVE" || posture.posture === "SELECTIVE";
      const postureIsBearish = posture.posture === "DEFENSIVE" || posture.posture === "CASH";
      const futuresAreBearish = tradingBias.bias === "Strong Bear" || tradingBias.bias === "Lean Bear";
      const futuresAreBullish = tradingBias.bias === "Strong Bull" || tradingBias.bias === "Lean Bull";

      if (postureIsBullish && futuresAreBearish) {
        biasConflict = true;
        biasConflictDetail = `Structure ${posture.posture} but today ${tradingBias.bias} \u2014 reduce size`;
      } else if (postureIsBearish && futuresAreBullish) {
        biasConflict = true;
        biasConflictDetail = `Structure ${posture.posture} but today ${tradingBias.bias} \u2014 don't chase`;
      }
    }

    // 7. Compute tiers and risk flags
    let riskFlags: RiskFlag[] = [];
    let actionableSectors: SectorRotationScore[] = [];
    let sectorTierCounts = { actionable: 0, watch: 0, avoid: 0 };
    if (dataWithRegime) {
      const tiers = computeSectorTiers(dataWithRegime.sectors, rotationData);
      riskFlags = computeRiskFlags(dataWithRegime, rotationData);
      actionableSectors = tiers.actionable;
      sectorTierCounts = {
        actionable: tiers.actionable.length,
        watch: tiers.watch.length,
        avoid: tiers.avoid.length,
      };
    }

    // #1 Leadership Health
    let leadershipHealth: LeadershipHealth | null = null;
    if (sectorResult?.leadershipBasketScores?.length) {
      leadershipHealth = computeLeadershipHealth(
        sectorResult.leadershipBasketScores,
        sectorResult.crossAssetScores ?? [],
        sectorResult.sectors,
        sectorResult.subSectorScores ?? [],
      );
    }

    // 8. Analyze active rotations
    const rotationAnalyses: RotationAnalysis[] = [];
    const regimeData: RegimeData | null = enhancedRegime ? {
      regime: enhancedRegime.regime,
      regimeConfidence: enhancedRegime.regimeConfidence,
      vix: enhancedRegime.vix,
      vixSlope: enhancedRegime.vixSlope,
      yield10y: enhancedRegime.yield10y,
      dxy: enhancedRegime.dxy,
      dxyTrend: enhancedRegime.dxyTrend,
      favoredSectors: enhancedRegime.favoredSectors,
      avoidSectors: enhancedRegime.avoidSectors,
      vixBounds: enhancedRegime.vixBounds,
    } : null;

    if (rotationData) {
      for (const r of rotationData.activeRotations) {
        const lifecycle = computeLifecycleStage(r.event);
        const conviction = computeConviction(r.event);
        const alignment = regimeData
          ? isRegimeAligned(r.event.sectorName, regimeData)
          : "neutral" as const;
        const action = computeActionSignal(lifecycle, conviction, alignment);
        rotationAnalyses.push({
          sectorName: r.event.sectorName,
          etf: r.event.etf,
          daysActive: r.event.daysActive,
          performancePct: r.event.etfPerformancePct,
          lifecycle,
          conviction,
          action,
          regimeAlignment: alignment,
        });
      }
    }

    // Sort rotations: ENTER first, then by conviction score desc
    const actionOrder: Record<string, number> = { "ENTER": 0, "ADD ON PULLBACK": 1, "HOLD \u2014 TIGHTEN STOPS": 2, "EXIT": 3 };
    rotationAnalyses.sort((a, b) => {
      const aOrder = actionOrder[a.action.action] ?? 99;
      const bOrder = actionOrder[b.action.action] ?? 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return b.conviction.score - a.conviction.score;
    });

    // 9. Collect top picks from enriched stocks
    const topPicks: { symbol: string; acceleration: number; category: string; conviction: string }[] = [];
    if (sectorResult?.enrichedStocks?.passed) {
      const convictionOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const sorted = [...sectorResult.enrichedStocks.passed]
        .filter((s) => s.conviction === "HIGH" || s.conviction === "MEDIUM")
        .sort((a, b) => {
          const tierDiff = (convictionOrder[a.conviction] ?? 99) - (convictionOrder[b.conviction] ?? 99);
          if (tierDiff !== 0) return tierDiff;
          return (b.rsAccel ?? 0) - (a.rsAccel ?? 0);
        });
      for (const s of sorted.slice(0, 5)) {
        topPicks.push({
          symbol: s.symbol,
          acceleration: s.rsAccel ?? 0,
          category: s.category,
          conviction: s.conviction,
        });
      }
    }

    // #8 Pullback Watch count
    const pullbackWatchCount = sectorResult?.enrichedStocks?.pullbackWatch?.length ?? 0;

    // Build watchlist from top picks + rotation stock leaders
    const watchlistSet = new Set(topPicks.map((p) => p.symbol));
    if (rotationData) {
      for (const r of rotationData.activeRotations) {
        for (const stock of r.stocks.slice(0, 2)) {
          watchlistSet.add(stock.symbol);
        }
        if (watchlistSet.size >= 10) break;
      }
    }
    const watchlist = [...watchlistSet].slice(0, 10);

    // 10. Synthesize direction
    const bias: MarketBias | null = tradingBias?.bias ?? null;
    const direction = synthesizeDirection(posture.posture, bias, riskFlags, rotationAnalyses);

    // 11. Build top sectors for display
    const topSectors = actionableSectors.slice(0, 4).map((s) => ({
      sector: s.sector,
      quadrant: s.quadrant,
      acceleration: s.acceleration,
      cmf: s.cmf20,
      stealth: s.stealthAccumulation,
    }));

    // #3 Cross-sector pairs
    const crossPairs = {
      xlyXlp: sectorResult?.crossSectorPairs?.xlyXlp ?? null,
      xlkXlu: sectorResult?.crossSectorPairs?.xlkXlu ?? null,
    };

    // #6 What Changed (quadrant transitions vs previous Supabase snapshot)
    const whatChanged = sectorResult
      ? computeWhatChangedFromSnapshots(sectorResult.sectors, previousSnapshot)
      : null;

    // Persist today's snapshot so tomorrow's briefing can compare
    if (sectorResult) {
      const today = new Date().toISOString().slice(0, 10);
      const allScores = [
        ...sectorResult.sectors,
        ...(sectorResult.subSectorScores ?? []),
        ...(sectorResult.crossAssetScores ?? []),
        ...(sectorResult.leadershipBasketScores ?? []),
      ];
      const snapshots: SectorSnapshotRecord[] = allScores.map((s) => ({
        snapshot_date: today,
        sector: s.sector,
        etf_symbol: s.etf,
        rs_ratio: s.rsRatio,
        rs_momentum: s.rsMomentum,
        quadrant: s.quadrant,
        momentum_score: s.compositeScore,
        breadth_pct: s.breadthPct ?? undefined,
      }));
      await recordSectorSnapshotBatch(snapshots).catch(() => {});
    }

    // 12. Format and send Telegram message
    const briefingData: BriefingData = {
      direction,
      posture: posture.posture,
      postureReasoning: posture.reasoning,
      regimeLabel: enhancedRegime?.regime ?? "UNKNOWN",
      regimeConfidence: enhancedRegime?.regimeConfidence ?? null,
      vix: enhancedRegime?.vix ?? null,
      vixSlope: enhancedRegime?.vixSlope ?? null,
      bias,
      biasConfidence: tradingBias?.confidence ?? null,
      biasConflict,
      biasConflictDetail,
      futures: premarketResult.futures.map((f) => ({ symbol: f.symbol, changePct: f.changePct })),
      dayType: tradingBias?.dayType ?? null,
      preferredDirection: tradingBias?.preferredDirection ?? null,
      leadingAsset: tradingBias?.leadingAsset ?? null,
      weakestAsset: tradingBias?.weakestAsset ?? null,
      leadershipHealth,
      sectorTierCounts,
      sectorBreadth: sectorBreadth ? { advancing: sectorBreadth.advancing, total: sectorBreadth.advancing + sectorBreadth.declining } : null,
      crossPairs,
      pairSignals: rotationData?.pairSignals ?? null,
      dispersionIndex: sectorResult?.dispersionIndex ?? null,
      riskFlags,
      topSectors,
      rotationAnalyses,
      whatChanged,
      topPicks,
      pullbackWatchCount,
      watchlist,
    };

    const message = formatDailyBriefing(briefingData);

    let telegramSent = false;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (botToken && chatId) {
      const tgResult = await sendTelegramMessage(botToken, chatId, message);
      telegramSent = tgResult.ok;
      if (!tgResult.ok) {
        logError("api/daily-briefing/cron/telegram", new Error(tgResult.error ?? "Telegram send failed"));
      }
    }

    const enterSignals = rotationAnalyses.filter((r) => r.action.action === "ENTER").length;

    return NextResponse.json({
      direction,
      posture: posture.posture,
      bias,
      biasConfidence: tradingBias?.confidence ?? null,
      biasConflict,
      regime: enhancedRegime?.regime ?? null,
      leadershipHealth: leadershipHealth ? { score: leadershipHealth.score, label: leadershipHealth.label } : null,
      sectorTierCounts,
      dispersionIndex: sectorResult?.dispersionIndex ?? null,
      activeRotations: rotationAnalyses.length,
      enterSignals,
      riskFlags: riskFlags.length,
      highRiskFlags: riskFlags.filter((f) => f.severity === "high").length,
      whatChanged: whatChanged ? { upgrades: whatChanged.upgrades, downgrades: whatChanged.downgrades } : null,
      pullbackWatchCount,
      topPicks: topPicks.map((p) => p.symbol),
      watchlist,
      telegramSent,
      elapsedMs: Date.now() - startTime,
    });
  } catch (err) {
    logError("api/daily-briefing/cron", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Daily briefing failed" },
      { status: 500 },
    );
  }
}
