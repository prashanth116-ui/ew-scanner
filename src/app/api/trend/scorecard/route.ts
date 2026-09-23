import { NextRequest, NextResponse } from "next/server";
import { computeScorecard } from "@/lib/trend/scorecard";

/**
 * Measured forward returns for each signal the trend page renders.
 *
 * Separate from /api/trend because it reads the whole archive rather than a window, and
 * the matrix request is on the critical path for the page's first paint. The page fetches
 * this alongside and fills the scorecard in when it lands.
 */
export async function GET(request: NextRequest) {
  const engineParam = request.nextUrl.searchParams.get("engine") ?? "inflection";
  if (engineParam !== "inflection" && engineParam !== "transition") {
    return NextResponse.json(
      { error: "Invalid ?engine - use inflection or transition" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await computeScorecard(engineParam));
  } catch (err) {
    console.error("[api/trend/scorecard] error:", err);
    return NextResponse.json({ error: "Could not compute scorecard" }, { status: 500 });
  }
}
