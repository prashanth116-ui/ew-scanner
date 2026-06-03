import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { calculateRotationTracker } from "@/lib/sector-rotation/rotation-tracker";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const rl = rateLimit(`rotation-tracker:${getClientKey(request)}`, 3, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const result = await calculateRotationTracker();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (err) {
    logError("api/rotation-tracker", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rotation tracker calculation failed" },
      { status: 502 }
    );
  }
}
