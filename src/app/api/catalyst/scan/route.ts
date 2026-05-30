import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { runCatalystScan } from "@/lib/catalyst/scan";
import type { CatalystLayer } from "@/data/catalyst-universe";

export const maxDuration = 300; // 5 min — 60 tickers with batch delays

const VALID_LAYERS: CatalystLayer[] = [
  "ai-chips", "ai-servers", "ai-networking", "ai-optics",
  "ai-power", "ai-builders", "ai-software", "semi-equipment",
  "commodities", "defense-ai", "robotics",
];

export async function POST(request: NextRequest) {
  const rl = rateLimit(`catalyst-scan:${getClientKey(request)}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const body = (await request.json()) as {
      layers?: string[];
      tiers?: number[];
    };

    // Validate layers
    const layers = body.layers?.filter((l): l is CatalystLayer =>
      VALID_LAYERS.includes(l as CatalystLayer)
    );

    // Validate tiers (1, 2, or 3)
    const tiers = body.tiers?.filter((t) => t >= 1 && t <= 3);

    const result = await runCatalystScan({
      layers: layers?.length ? layers : undefined,
      tiers: tiers?.length ? tiers : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    logError("api/catalyst/scan", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 502 }
    );
  }
}
