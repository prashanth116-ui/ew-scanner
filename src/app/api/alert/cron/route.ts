import { NextRequest, NextResponse } from "next/server";
import { runAlertPipeline } from "@/lib/ew-alert-core";
import { logError } from "@/lib/error-logger";
import type { AlertConfig } from "@/lib/ew-types";

export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read config from env var
  const configStr = process.env.ALERT_CRON_CONFIG;
  if (!configStr) {
    return NextResponse.json(
      { error: "ALERT_CRON_CONFIG env var not set" },
      { status: 500 }
    );
  }

  let config: AlertConfig;
  try {
    config = JSON.parse(configStr);
  } catch (err) {
    logError("alert/cron", err, { configStr });
    return NextResponse.json(
      { error: "Invalid ALERT_CRON_CONFIG JSON" },
      { status: 500 }
    );
  }

  try {
    const result = await runAlertPipeline(config);

    if (result.error && !result.sent) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      sent: result.sent,
      candidateCount: result.candidateCount,
      newCount: result.newCount,
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (err) {
    logError("alert/cron", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
