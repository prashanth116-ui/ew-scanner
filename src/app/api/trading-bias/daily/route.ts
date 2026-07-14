import { NextRequest, NextResponse } from "next/server";
import { loadTradingBiasDaily } from "@/lib/supabase/persistence";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get("date") ?? undefined;

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Invalid date format. Use YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const record = await loadTradingBiasDaily(date);

  if (!record) {
    return NextResponse.json({ snapshot: null }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120" },
    });
  }

  return NextResponse.json({ snapshot: record }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120" },
  });
}
