import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { calculateSectorRotation } from "@/lib/sector-rotation/sector-rotation";
import { calculateRotationTracker } from "@/lib/sector-rotation/rotation-tracker";
import { fetchPremarketData } from "@/lib/premarket/fetch";
import { fetchMacroRegime, enhanceRegimeWithCrossAsset } from "@/lib/sector-rotation/regime";
import { computeMarketPosture, computeSectorTiers, computeRiskFlags } from "@/lib/sector-rotation/brief";
import type { MarketPosture, PostureResult, RiskFlag } from "@/lib/sector-rotation/brief";
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
import { sendTelegramMessage } from "@/lib/ew-wave/telegram";
import { COMPOSITE } from "@/lib/sector-rotation/config";
import type { SectorRotationResult, SectorRotationScore, EnrichedStock } from "@/lib/sector-rotation/types";
import type { RotationTrackerResult, ActiveRotationDetail, LifecycleStage, ConvictionResult, RegimeData } from "@/lib/sector-rotation/rotation-types";
import type { SectorBreadth, MarketBias, TradingBias } from "@/lib/premarket/types";

export const maxDuration = 60;

// ── Direction Synthesis ──

type Direction = "BULL" | "LEAN BULL" | "NEUTRAL" | "LEAN BEAR" | "BEAR";

interface RotationAnalysis {
  sectorName: string;
  etf: string;
  daysActive: number;
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

  // LEAN BEAR: posture=DEFENSIVE OR bias is bearish
  if (posture === "DEFENSIVE" || isBearish) {
    return "LEAN BEAR";
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

  // NEUTRAL: fallback
  return "NEUTRAL";
}

// ── Telegram Formatter ──

interface BriefingData {
  direction: Direction;
  posture: MarketPosture;
  postureReasoning: string;
  regimeLabel: string;
  vix: number | null;
  vixSlope: string | null;
  bias: MarketBias | null;
  biasConfidence: number | null;
  riskFlags: RiskFlag[];
  topSectors: { sector: string; quadrant: string; acceleration: number; cmf: number; stealth: boolean }[];
  rotationAnalyses: RotationAnalysis[];
  topPicks: { symbol: string; acceleration: number; category: string; conviction: string }[];
  watchlist: string[];
}

function formatDailyBriefing(data: BriefingData): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push(`<b>DAILY BRIEFING \u2014 ${date}</b>`);
  lines.push("");
  lines.push(`<b>DIRECTION: ${data.direction}</b>`);
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");

  // L1 MACRO
  lines.push("");
  lines.push("<b>L1 MACRO</b>");
  const vixStr = data.vix != null ? `VIX: ${data.vix.toFixed(1)} (${data.vixSlope ?? "?"})` : "VIX: N/A";
  lines.push(`Regime: ${data.regimeLabel} | ${vixStr}`);
  const biasStr = data.bias
    ? `Bias: ${data.bias}${data.biasConfidence != null ? ` (${data.biasConfidence}%)` : ""}`
    : "Bias: N/A";
  lines.push(`Posture: ${data.posture} | ${biasStr}`);
  const highFlags = data.riskFlags.filter((f) => f.severity === "high").length;
  const medFlags = data.riskFlags.filter((f) => f.severity === "medium").length;
  lines.push(`Risk Flags: ${data.riskFlags.length} (${highFlags} high, ${medFlags} med)`);
  const macroGo = data.posture !== "CASH" && data.posture !== "DEFENSIVE" && highFlags < 3;
  lines.push(`\u2192 ${macroGo ? "GO \u2713" : "CAUTION \u2717"}`);

  // L2 SECTORS
  lines.push("");
  lines.push("<b>L2 SECTORS</b>");
  if (data.topSectors.length === 0) {
    lines.push("No actionable sectors");
  } else {
    for (const s of data.topSectors.slice(0, 4)) {
      const stealthTag = s.stealth ? " | stealth" : "";
      lines.push(
        `${s.sector}: ${s.quadrant} | accel ${s.acceleration.toFixed(2)} | CMF ${s.cmf >= 0 ? "+" : ""}${s.cmf.toFixed(2)}${stealthTag}`
      );
    }
  }

  // L3 ROTATIONS
  lines.push("");
  lines.push("<b>L3 ROTATIONS</b>");
  if (data.rotationAnalyses.length === 0) {
    lines.push("No active rotations");
  } else {
    for (const r of data.rotationAnalyses.slice(0, 4)) {
      const actionIcon = r.action.action === "ENTER" ? " \u2713" : "";
      lines.push(
        `${r.sectorName}: ${r.lifecycle} (${r.daysActive}d) | ${r.conviction.level} | ${r.action.action}${actionIcon}`
      );
    }
  }

  // L4 TOP PICKS
  lines.push("");
  lines.push("<b>L4 TOP PICKS</b>");
  if (data.topPicks.length === 0) {
    lines.push("No qualifying picks");
  } else {
    for (const p of data.topPicks.slice(0, 5)) {
      lines.push(
        `${p.symbol} \u2014 accel ${p.acceleration.toFixed(2)} | ${p.category} | ${p.conviction}`
      );
    }
  }

  // Watchlist
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

    // 1. Parallel fetch all data sources
    const [premarketResult, sectorResult, regime, rotationData] = await Promise.all([
      fetchPremarketData(),
      calculateSectorRotation().catch(() => null),
      fetchMacroRegime().catch(() => null),
      calculateRotationTracker().catch(() => null),
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

    // 7. Compute tiers and risk flags
    let riskFlags: RiskFlag[] = [];
    let actionableSectors: SectorRotationScore[] = [];
    if (dataWithRegime) {
      const tiers = computeSectorTiers(dataWithRegime.sectors, rotationData);
      riskFlags = computeRiskFlags(dataWithRegime, rotationData);
      actionableSectors = tiers.actionable;
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
      const sorted = [...sectorResult.enrichedStocks.passed]
        .filter((s) => s.conviction === "HIGH" || s.conviction === "MEDIUM")
        .sort((a, b) => (b.rsAccel ?? 0) - (a.rsAccel ?? 0));
      for (const s of sorted.slice(0, 5)) {
        topPicks.push({
          symbol: s.symbol,
          acceleration: s.rsAccel ?? 0,
          category: s.category,
          conviction: s.conviction,
        });
      }
    }

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

    // 12. Format and send Telegram message
    const briefingData: BriefingData = {
      direction,
      posture: posture.posture,
      postureReasoning: posture.reasoning,
      regimeLabel: enhancedRegime?.regime ?? "UNKNOWN",
      vix: enhancedRegime?.vix ?? null,
      vixSlope: enhancedRegime?.vixSlope ?? null,
      bias,
      biasConfidence: tradingBias?.confidence ?? null,
      riskFlags,
      topSectors,
      rotationAnalyses,
      topPicks,
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
      regime: enhancedRegime?.regime ?? null,
      activeRotations: rotationAnalyses.length,
      enterSignals,
      riskFlags: riskFlags.length,
      highRiskFlags: riskFlags.filter((f) => f.severity === "high").length,
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
