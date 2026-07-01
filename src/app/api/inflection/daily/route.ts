import { NextRequest, NextResponse } from "next/server";
import { loadInflectionDaily, loadInflectionDailyDates } from "@/lib/supabase/persistence";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // GET ?dates=true → return available scan dates
  if (searchParams.get("dates") === "true") {
    const dates = await loadInflectionDailyDates(14);
    return NextResponse.json({ dates });
  }

  // GET ?date=YYYY-MM-DD → return results for that date
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json(
      { error: "Missing ?date=YYYY-MM-DD or ?dates=true" },
      { status: 400 }
    );
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Invalid date format. Use YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const results = await loadInflectionDaily(date);
  return NextResponse.json({ date, count: results.length, results });
}
