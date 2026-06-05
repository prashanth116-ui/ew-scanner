import { NextResponse } from "next/server";
import { getUpcomingCatalysts } from "@/lib/catalyst/calendar";

export async function GET() {
  try {
    // Macro events only (no symbols = no earnings)
    const events = await getUpcomingCatalysts(undefined, 30);
    // Filter to macro-only (exclude earnings)
    const macroOnly = events.filter((e) => e.type !== "earnings");

    return NextResponse.json(macroOnly, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch macro events" },
      { status: 500 }
    );
  }
}
