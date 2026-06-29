import { NextRequest, NextResponse } from "next/server";
import { fetchLatestPrerunSignals, fetchLatestNightlyScan } from "@/lib/supabase/query";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode");

  // ?mode=full returns all nightly results (1,390+), default returns qualifying only
  if (mode === "full") {
    const result = await fetchLatestNightlyScan();
    return NextResponse.json(result);
  }

  const result = await fetchLatestPrerunSignals();
  return NextResponse.json(result);
}
