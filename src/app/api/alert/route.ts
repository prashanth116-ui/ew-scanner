import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { runAlertPipeline } from "@/lib/ew-alert-core";
import { logError } from "@/lib/error-logger";
import type { AlertConfig } from "@/lib/ew-types";

export async function POST(request: NextRequest) {
  // Rate limit: 5 req/min per IP
  const rl = rateLimit(`alert:${getClientKey(request)}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  // Auth check (optional — only enforced if ALERT_API_KEY env var is set)
  const alertApiKey = process.env.ALERT_API_KEY;
  if (alertApiKey) {
    const authHeader = request.headers.get("authorization");
    const origin = request.headers.get("origin") ?? "";
    const host = request.headers.get("host") ?? "";
    const isSameOrigin = origin && host && (origin === `https://${host}` || origin === `http://${host}`);
    const cronSecret = process.env.CRON_SECRET;
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isSameOrigin && !isCron && authHeader !== `Bearer ${alertApiKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let config: AlertConfig;
  try {
    config = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await runAlertPipeline(config);

    if (result.error && !result.sent) {
      const status = result.error.includes("TELEGRAM") ? 400 : 502;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({
      sent: result.sent,
      candidateCount: result.candidateCount,
      newCount: result.newCount,
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (err) {
    logError("api/alert", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
