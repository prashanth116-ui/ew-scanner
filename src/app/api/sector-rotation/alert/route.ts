import { NextRequest, NextResponse } from "next/server";
import { calculateSectorRotation } from "@/lib/sector-rotation/sector-rotation";
import { calculateRotationTracker } from "@/lib/sector-rotation/rotation-tracker";
import { computeLifecycleStage, computeConviction } from "@/lib/sector-rotation/rotation-helpers";
import {
  detectTransitions,
  formatRotationAlert,
  detectRotationChanges,
  formatRotationChanges,
} from "@/lib/sector-rotation/transitions";
import type { RotationSnapshot, RotationTopStock, ScannerHit } from "@/lib/sector-rotation/transitions";
import { sendTelegramMessage, getTelegramChatId } from "@/lib/ew-wave/telegram";
import { logError } from "@/lib/error-logger";
import {
  loadPreRunDaily,
  loadInflectionDaily,
  loadTransitionDaily,
} from "@/lib/supabase/persistence";

/**
 * Sector rotation alert cron — runs at 22:00 UTC weekdays.
 * Compares current quadrants vs previous snapshot.
 * Sends Telegram alert only when sectors change quadrants.
 *
 * State persistence (3-tier):
 *   1. Module-level cache — survives across warm Vercel invocations (same instance)
 *   2. Vercel KV — persists across cold starts (optional, requires @vercel/kv + KV_REST_API_URL)
 *   3. SECTOR_ROTATION_PREVIOUS env var — manual fallback
 *
 * If KV is not configured, behavior is identical to the previous 2-tier system.
 */

const VALID_QUADRANTS = new Set(["LEADING", "WEAKENING", "LAGGING", "IMPROVING"]);

interface PreviousState {
  date: string;
  sectors: { sector: string; quadrant: string }[];
  rotations?: RotationSnapshot[];  // optional for backward compat with existing KV data
}

const KV_KEY = "sector-rotation:previous";
const KV_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// Module-level cache — persists across warm invocations on the same instance
let cachedPrevious: PreviousState | null = null;

/** Try to load state from Vercel KV. Returns null if KV not configured or unavailable. */
async function loadFromKV(): Promise<PreviousState | null> {
  if (!process.env.KV_REST_API_URL) return null;
  try {
    const { kv } = await import("@vercel/kv");
    return await kv.get<PreviousState>(KV_KEY);
  } catch {
    return null;
  }
}

/** Try to persist state to Vercel KV. Silently fails if KV not configured. */
async function saveToKV(state: PreviousState): Promise<void> {
  if (!process.env.KV_REST_API_URL) return;
  try {
    const { kv } = await import("@vercel/kv");
    await kv.set(KV_KEY, state, { ex: KV_TTL });
  } catch {
    // Non-critical — module cache still works
  }
}

export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch fresh sector data
    const current = await calculateSectorRotation();

    // 2. Load previous snapshot (3-tier: module cache → KV → env var)
    let previous = cachedPrevious;
    let stateSource = "cache";

    if (!previous) {
      previous = await loadFromKV();
      stateSource = previous ? "kv" : "none";
    }

    if (!previous) {
      const prevStr = process.env.SECTOR_ROTATION_PREVIOUS;
      if (prevStr) {
        try {
          previous = JSON.parse(prevStr);
          stateSource = "env";
        } catch {
          // Invalid JSON — treat as no previous
        }
      }
    }

    // 3. Detect transitions
    const previousSnapshot = previous
      ? {
          date: previous.date ?? "",
          sectors: previous.sectors
            .filter((s) => VALID_QUADRANTS.has(s.quadrant))
            .map((s) => ({
              sector: s.sector,
              etf: "",
              compositeScore: 0,
              acceleration: 0,
              quadrant: s.quadrant as "LEADING" | "WEAKENING" | "LAGGING" | "IMPROVING",
              mansfieldRS: 0,
              breadthPct: null,
              trend: "FLAT" as const,
            })),
          rotationSummary: "",
          dispersionIndex: 0,
        }
      : null;

    const transitions = detectTransitions(current, previousSnapshot);

    // 3b. Fetch rotation tracker data and detect rotation changes
    let currentRotations: RotationSnapshot[] = [];
    let rotationChanges: ReturnType<typeof detectRotationChanges> = [];
    try {
      const rotationResult = await calculateRotationTracker();

      // Load cross-scanner data for confluence detection
      const today = current.calculatedAt.slice(0, 10);
      const [prerunData, inflectionData, transitionData] = await Promise.all([
        loadPreRunDaily(today).catch(() => []),
        loadInflectionDaily(today).catch(() => []),
        loadTransitionDaily(today).catch(() => []),
      ]);

      // Build scanner hit maps: ticker → ScannerHit[]
      const scannerHitMap = new Map<string, ScannerHit[]>();
      const addHit = (ticker: string, hit: ScannerHit) => {
        const arr = scannerHitMap.get(ticker) ?? [];
        arr.push(hit);
        scannerHitMap.set(ticker, arr);
      };
      for (const r of prerunData) {
        if (r.final_score > 0 && (r.verdict === "PRIORITY" || r.verdict === "KEEP")) {
          addHit(r.ticker, { scanner: "Setup", detail: r.verdict });
        }
      }
      for (const r of inflectionData) {
        if (r.trade_read === "STARTER" || r.trade_read === "ADD_ON") {
          addHit(r.ticker, { scanner: "Inflect", detail: r.trade_read });
        }
      }
      for (const r of transitionData) {
        if (r.alert_state === "TRIGGERED" || r.alert_state === "READY") {
          addHit(r.ticker, { scanner: "Trans", detail: r.alert_state });
        }
      }

      // Build enriched stock lookup from sector rotation result
      const enrichedMap = new Map<string, { conviction: string; category: string }>();
      if (current.enrichedStocks?.passed) {
        for (const s of current.enrichedStocks.passed) {
          enrichedMap.set(s.symbol, { conviction: s.conviction, category: s.category });
        }
      }

      // Build stock map: sectorId → top 15 stocks across 3 categories
      // Filters: trendAccel >= 0 (structural acceleration), dailyChangePct < 5% (no chasing)
      // Exclude: AVOID-classified stocks from enrichment
      // Sort: rsDelta descending (fastest RS acceleration change)
      const stockMap = new Map<string, RotationTopStock[]>();
      type Stock = typeof rotationResult.activeRotations[0]["stocks"][0];

      const passesFilters = (s: Stock): boolean => {
        // Reject structurally decelerating stocks (trendAccel deeply negative)
        if (s.trendAccel !== null && s.trendAccel < -5) return false;
        // Reject stocks that already moved 8%+ today (chasing)
        if (Math.abs(s.dailyChangePct) >= 8) return false;
        // Reject AVOID-classified stocks from enrichment
        const enriched = enrichedMap.get(s.symbol);
        if (enriched?.category === "AVOID") return false;
        return true;
      };

      const toTopStock = (s: Stock, category: RotationTopStock["category"]): RotationTopStock => {
        const enriched = enrichedMap.get(s.symbol);
        return {
          symbol: s.symbol,
          performancePct: s.performancePct,
          rsAcceleration: s.rsAcceleration,
          rsDelta: s.rsDelta,
          trendAccel: s.trendAccel,
          dailyChangePct: s.dailyChangePct,
          aboveSma50: s.aboveSma50,
          volumeVsAvg: s.volumeVsAvg,
          volumeConsistency: s.volumeConsistency,
          isTurnaroundCandidate: s.isTurnaroundCandidate,
          category,
          scannerHits: scannerHitMap.get(s.symbol),
          enrichedConviction: enriched?.conviction,
          enrichedCategory: enriched?.category,
        };
      };

      for (const r of rotationResult.activeRotations) {
        const eligible = r.stocks.filter(passesFilters);
        const turnaroundSet = new Set<string>();

        // 1. Turnarounds: below SMA50, curated flag, sustained volume
        const turnarounds = eligible
          .filter((s) => s.isTurnaroundCandidate && s.volumeConsistency >= 2)
          .sort((a, b) => b.rsDelta - a.rsDelta)
          .slice(0, 5);
        for (const s of turnarounds) turnaroundSet.add(s.symbol);

        // 2. Inflections: RS accelerating, sustained volume, not already picked
        const inflectionSet = new Set<string>();
        const inflections = eligible
          .filter((s) =>
            !turnaroundSet.has(s.symbol) &&
            !s.isTurnaroundCandidate &&
            s.rsDelta > 0 &&
            s.volumeConsistency >= 2 &&
            s.rsAcceleration > 0
          )
          .sort((a, b) => b.rsDelta - a.rsDelta)
          .slice(0, 5);
        for (const s of inflections) inflectionSet.add(s.symbol);

        // 3. Leaders: above SMA50, RS improving, sustained volume
        const leaders = eligible
          .filter((s) =>
            !turnaroundSet.has(s.symbol) &&
            !inflectionSet.has(s.symbol) &&
            s.aboveSma50 &&
            s.rsAcceleration > 0 &&
            s.rsImproving &&
            s.volumeConsistency >= 2
          )
          .sort((a, b) => b.rsDelta - a.rsDelta)
          .slice(0, 5);

        const combined = [
          ...turnarounds.map((s) => toTopStock(s, "turnaround")),
          ...inflections.map((s) => toTopStock(s, "inflection")),
          ...leaders.map((s) => toTopStock(s, "leading")),
        ].slice(0, 15);
        if (combined.length > 0) stockMap.set(r.event.sectorId, combined);
      }

      currentRotations = rotationResult.activeRotations.map((r) => ({
        sectorId: r.event.sectorId,
        sectorName: r.event.sectorName,
        etf: r.event.etf,
        lifecycle: computeLifecycleStage(r.event),
        conviction: computeConviction(r.event).level,
        quadrant: r.event.health.quadrant,
        daysActive: r.event.daysActive,
        startDate: r.event.startDate,
      }));
      rotationChanges = detectRotationChanges(currentRotations, previous?.rotations, stockMap);
    } catch (err) {
      logError("sector-rotation/alert:rotation-tracker", err);
    }

    // 4. Persist current state for next run (module cache + KV)
    cachedPrevious = {
      date: current.calculatedAt.slice(0, 10),
      sectors: current.sectors.map((s) => ({
        sector: s.sector,
        quadrant: s.quadrant,
      })),
      rotations: currentRotations,
    };

    // Non-blocking KV persist
    saveToKV(cachedPrevious).catch(() => {});

    // 5. Send Telegram alerts
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = getTelegramChatId("SECTOR");

    // 5a. Quadrant transition alert (existing)
    let quadrantSent = false;
    if (transitions.length > 0 && botToken && chatId) {
      const message = formatRotationAlert(
        transitions,
        current.topStocksToWatch,
        current.calculatedAt
      );
      const result = await sendTelegramMessage(botToken, chatId, message);
      quadrantSent = result.ok;
      if (!result.ok) {
        logError("sector-rotation/alert", new Error(result.error ?? "Telegram send failed"));
      }
    }

    // 5b. Rotation tracker change alert (new)
    let rotationSent = false;
    if (rotationChanges.length > 0 && botToken && chatId) {
      const message = formatRotationChanges(rotationChanges, current.calculatedAt);
      if (message) {
        const result = await sendTelegramMessage(botToken, chatId, message);
        rotationSent = result.ok;
        if (!result.ok) {
          logError("sector-rotation/alert:rotation-changes", new Error(result.error ?? "Telegram send failed"));
        }
      }
    }

    return NextResponse.json({
      sent: quadrantSent || rotationSent,
      transitionCount: transitions.length,
      transitions: transitions.map((t) => ({
        sector: t.sector,
        from: t.from,
        to: t.to,
      })),
      rotationChangeCount: rotationChanges.length,
      rotationChanges: rotationChanges.map((c) => ({
        type: c.type,
        sectorName: c.sectorName,
        lifecycle: c.lifecycle,
        previousLifecycle: c.previousLifecycle,
      })),
      currentQuadrants: cachedPrevious,
      stateSource,
    });
  } catch (err) {
    logError("sector-rotation/alert", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rotation alert failed" },
      { status: 500 }
    );
  }
}
