import { NextRequest, NextResponse } from "next/server";
import { calculateSectorRotation } from "@/lib/sector-rotation/sector-rotation";
import { detectTransitions, formatRotationAlert } from "@/lib/sector-rotation/transitions";
import { sendTelegramMessage } from "@/lib/ew-telegram";
import { logError } from "@/lib/error-logger";

/**
 * Sector rotation alert cron — runs at 22:00 UTC weekdays.
 * Compares current quadrants vs yesterday's snapshot.
 * Sends Telegram alert only when sectors change quadrants.
 */
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

    // 2. Load previous snapshot from KV or env-stored state
    //    For serverless cron, we store yesterday's quadrants in an env-parseable format.
    //    Use SECTOR_ROTATION_PREVIOUS env var as JSON: { sectors: [{ sector, quadrant }] }
    let previous: { date: string; sectors: { sector: string; quadrant: string }[] } | null = null;
    const prevStr = process.env.SECTOR_ROTATION_PREVIOUS;
    if (prevStr) {
      try {
        previous = JSON.parse(prevStr);
      } catch {
        // Invalid JSON — treat as no previous
      }
    }

    // 3. Detect transitions
    const previousSnapshot = previous
      ? {
          date: previous.date ?? "",
          sectors: previous.sectors.map((s) => ({
            sector: s.sector,
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

    // 4. Build the new "previous" state for next run
    const newPrevious = {
      date: current.calculatedAt.slice(0, 10),
      sectors: current.sectors.map((s) => ({
        sector: s.sector,
        quadrant: s.quadrant,
      })),
    };

    // 5. Send Telegram alert if transitions found
    let sent = false;
    if (transitions.length > 0) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;

      if (botToken && chatId) {
        const message = formatRotationAlert(
          transitions,
          current.topStocksToWatch,
          current.calculatedAt
        );
        const result = await sendTelegramMessage(botToken, chatId, message);
        sent = result.ok;
        if (!result.ok) {
          logError("sector-rotation/alert", new Error(result.error ?? "Telegram send failed"));
        }
      }
    }

    return NextResponse.json({
      sent,
      transitionCount: transitions.length,
      transitions: transitions.map((t) => ({
        sector: t.sector,
        from: t.from,
        to: t.to,
      })),
      currentQuadrants: newPrevious,
    });
  } catch (err) {
    logError("sector-rotation/alert", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rotation alert failed" },
      { status: 500 }
    );
  }
}
