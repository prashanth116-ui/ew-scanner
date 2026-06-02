import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { createClient } from "@/lib/supabase/server";
import { calculateSectorRotation } from "@/lib/sector-rotation/sector-rotation";

export async function GET(request: NextRequest) {
  const rl = rateLimit(`rotation-picks:${getClientKey(request)}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Fetch Supabase scan data + TS sector rotation in parallel
    const [supabaseResult, tsRotation] = await Promise.all([
      supabase
        .from("rotation_scan_results")
        .select("scan_date, sectors_data, passed_stocks, rejected_stocks, summary, created_at")
        .order("scan_date", { ascending: false })
        .limit(1)
        .single(),
      calculateSectorRotation().catch(() => null),
    ]);

    const { data, error } = supabaseResult;

    if (error || !data) {
      return NextResponse.json(
        { error: "No scan data available" },
        { status: 404 }
      );
    }

    // Overlay TS breadth onto Supabase sector data (full-universe breadth is more accurate)
    let sectorsData = data.sectors_data;
    if (tsRotation) {
      const tsBreadthByEtf = new Map(
        tsRotation.sectors.map((s) => [s.etf, s.breadthPct])
      );
      sectorsData = (sectorsData as Record<string, unknown>[]).map((s) => {
        const etf = s.etf as string;
        const tsBreadth = tsBreadthByEtf.get(etf);
        if (tsBreadth != null) {
          return { ...s, breadth_pct: tsBreadth };
        }
        return s;
      });
    }

    return NextResponse.json({
      scanDate: data.scan_date,
      sectorsData,
      passedStocks: data.passed_stocks,
      rejectedStocks: data.rejected_stocks,
      summary: data.summary,
      calculatedAt: data.created_at,
    });
  } catch (err) {
    logError("api/rotation-picks", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch scan data" },
      { status: 502 }
    );
  }
}
