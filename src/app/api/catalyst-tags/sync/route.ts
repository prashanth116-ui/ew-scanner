/**
 * Nightly earnings-catalyst sync.
 *
 * Scheduled ahead of the nightly summary so tonight's alert sees today's dates. Earnings
 * dates get revised, and a stale tag is worse than no tag — it reminds you of a date that
 * no longer exists.
 *
 * Scoped to the focus list rather than the universe: 42 names in the scan universe report
 * in a typical fortnight against 16 on the focus list, and badging all 42 would bury the
 * alert during earnings season.
 */

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { syncEarningsCatalysts } from "@/lib/catalyst/earnings-sync";
import { FOCUS_LIST } from "@/data/focus-list";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncEarningsCatalysts(FOCUS_LIST, { withinDays: 21 });
    if (result.errors.length > 0) {
      logError("api/catalyst-tags/sync", new Error(result.errors.join("; ")));
    }
    return NextResponse.json(result);
  } catch (err) {
    logError("api/catalyst-tags/sync", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
