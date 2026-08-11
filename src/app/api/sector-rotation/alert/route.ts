import { NextRequest, NextResponse } from "next/server";
import { calculateSectorRotation } from "@/lib/sector-rotation/sector-rotation";
import { calculateRotationTracker } from "@/lib/sector-rotation/rotation-tracker";
import {
  detectTransitions,
  formatRotationAlert,
  detectRotationChanges,
  formatRotationChanges,
} from "@/lib/sector-rotation/transitions";
import type { RotationSnapshot, RotationTopStock } from "@/lib/sector-rotation/transitions";
import {
  buildScannerHitMap,
  buildEnrichedMap,
  buildStockMap,
  buildCurrentRotations,
} from "@/lib/sector-rotation/confluence";
import { sendTelegramMessage, getTelegramChatId } from "@/lib/ew-wave/telegram";
import { logError } from "@/lib/error-logger";
import {
  loadPreRunDaily,
  loadInflectionDaily,
  loadTransitionDaily,
  loadInstitutionalDaily,
} from "@/lib/supabase/persistence";

/**
 * Sector rotation alert cron — runs at 22:00 UTC (6 PM ET) weekdays.
 * Sends up to 2 Telegram messages to the SECTOR channel:
 *   Message 1: Quadrant transitions (sector RRG quadrant changes)
 *   Message 2: Rotation tracker changes (lifecycle upgrades/warnings, new/ended)
 *
 * Message 3 (Rotation × Scanner Confluence) moved to /api/sector-rotation/confluence
 * which runs at 03:02 UTC (11:02 PM ET) AFTER all nightly scanners finish,
 * ensuring fresh scanner data instead of ~20-hour-old stale data.
 *
 * Scanner data is still loaded here for Message 2 scanner badges (supplementary
 * context on rotation changes — staleness acceptable since the focus is lifecycle).
 *
 * State persistence (3-tier):
 *   1. Module-level cache — survives across warm Vercel invocations (same instance)
 *   2. Vercel KV — persists across cold starts (optional, requires @vercel/kv + KV_REST_API_URL)
 *   3. SECTOR_ROTATION_PREVIOUS env var — manual fallback
 */

const VALID_QUADRANTS = new Set(["LEADING", "WEAKENING", "LAGGING", "IMPROVING"]);

interface PreviousState {
  date: string;
  sectors: { sector: string; quadrant: string }[];
  rotations?: RotationSnapshot[];  // optional for backward compat with existing KV data
  confluenceTickers?: string[];    // vestigial — kept for KV backward compat, no longer populated
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
    let stockMap = new Map<string, RotationTopStock[]>();
    try {
      const rotationResult = await calculateRotationTracker();

      // Load scanner data for Message 2 scanner badges (supplementary context).
      // NOTE: At 22:00 UTC, this loads last night's scanner data (~20h old).
      // This is acceptable for Message 2 since badges are supplementary to lifecycle changes.
      // Fresh scanner confluence (Message 3) runs at 03:02 UTC via /api/sector-rotation/confluence.
      const today = current.calculatedAt.slice(0, 10);
      const [prerunData, inflectionData, transitionData, institutionalData] = await Promise.all([
        loadPreRunDaily(today).catch(() => []),
        loadInflectionDaily(today).catch(() => []),
        loadTransitionDaily(today).catch(() => []),
        loadInstitutionalDaily(today).catch(() => []),
      ]);

      // Build stock map with scanner badges using shared helpers
      const scannerHitMap = buildScannerHitMap(prerunData, inflectionData, transitionData, institutionalData);
      const enrichedMap = buildEnrichedMap(current.enrichedStocks);
      const { stockMap: builtStockMap, breadthMap } = buildStockMap(
        rotationResult.activeRotations, scannerHitMap, enrichedMap,
      );
      stockMap = builtStockMap;

      currentRotations = buildCurrentRotations(rotationResult.activeRotations);
      rotationChanges = detectRotationChanges(currentRotations, previous?.rotations, stockMap);

      // Enrich rotation changes with breadth and historical pattern stats
      const historyMap = new Map<string, { avgReturn: number; avgDuration: number; count: number }>();
      for (const ps of rotationResult.patternStats) {
        if (ps.totalRotations > 0) {
          historyMap.set(ps.sectorId, {
            avgReturn: ps.avgPerformancePct,
            avgDuration: ps.avgDurationDays,
            count: ps.totalRotations,
          });
        }
      }

      // Build sectorName → sectorId lookup for enrichment
      const sectorIdLookup = new Map<string, string>();
      for (const r of currentRotations) sectorIdLookup.set(r.sectorName, r.sectorId);
      for (const r of (previous?.rotations ?? [])) sectorIdLookup.set(r.sectorName, r.sectorId);

      for (const change of rotationChanges) {
        const sectorId = sectorIdLookup.get(change.sectorName);
        if (!sectorId) continue;

        // Attach breadth (non-ended only)
        if (change.type !== "rotation_ended") {
          change.breadth = breadthMap.get(sectorId);
        }

        // Attach historical stats
        const hist = historyMap.get(sectorId);
        if (hist) {
          change.historicalAvgReturn = hist.avgReturn;
          change.historicalAvgDuration = hist.avgDuration;
          change.historicalCount = hist.count;
        }
      }
    } catch (err) {
      logError("sector-rotation/alert:rotation-tracker", err);
    }

    // 4. Persist current state for next run (module cache + KV)
    // confluenceTickers no longer populated here — managed by /api/sector-rotation/confluence
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

    // 5a. Quadrant transition alert
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

    // 5b. Rotation tracker change alert
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

    // Message 3 (Rotation × Scanner Confluence) now runs at 03:02 UTC
    // via /api/sector-rotation/confluence with fresh scanner data

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
