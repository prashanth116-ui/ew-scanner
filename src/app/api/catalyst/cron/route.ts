import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { runCatalystScan } from "@/lib/catalyst/scan";

import { recordSignalBatch } from "@/lib/supabase/persistence";

export const maxDuration = 300; // 5 min — full universe scan with batch delays

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
    const result = await runCatalystScan();

    // Collect fire drills from all buckets
    const allResults = [
      ...result.prespike,
      ...result.watch,
      ...result.monitor,
    ];
    const fireDrills = allResults.filter((r) => r.fireDrill);

    // Record PRE_SPIKE + WATCH signals to Supabase
    const today = new Date().toISOString().slice(0, 10);
    const signalRecords = [...result.prespike, ...result.watch].map((r) => ({
      scanner: "catalyst" as const,
      ticker: r.symbol,
      signal_date: today,
      price_at_signal: r.price,
      signal_strength: r.verdict,
      score: r.totalScore,
    }));
    await recordSignalBatch(signalRecords).catch(() => {});

    let telegramSent = false;

    return NextResponse.json({
      prespikeCount: result.prespike.length,
      watchCount: result.watch.length,
      monitorCount: result.monitor.length,
      missCount: Object.values(result.misses).reduce((a, b) => a + b.length, 0),
      fireDrillCount: fireDrills.length,
      telegramSent,
      prespike: result.prespike,
      watch: result.watch,
    });
  } catch (err) {
    logError("api/catalyst/cron", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
