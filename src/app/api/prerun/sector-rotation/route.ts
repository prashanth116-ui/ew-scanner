import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { calculateSectorRotation } from "@/lib/prerun/sector-rotation";

export async function GET(request: NextRequest) {
  const rl = rateLimit(`sector-rotation:${getClientKey(request)}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const result = await calculateSectorRotation();
    return NextResponse.json(result);
  } catch (err) {
    logError("api/prerun/sector-rotation", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sector rotation calculation failed" },
      { status: 502 }
    );
  }
}
