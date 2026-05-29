import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { fetchEarningsCalendar } from "@/lib/earnings-calendar";

/** Validate YYYY-MM-DD date string. */
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(`earnings-cal:${getClientKey(request)}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";

  if (!isValidDate(from) || !isValidDate(to)) {
    return NextResponse.json(
      { error: "Invalid date. Use ?from=YYYY-MM-DD&to=YYYY-MM-DD" },
      { status: 400 }
    );
  }

  // Limit range to 35 days to prevent abuse
  const diff =
    (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  if (diff < 0 || diff > 35) {
    return NextResponse.json(
      { error: "Date range must be 0-35 days" },
      { status: 400 }
    );
  }

  try {
    const entries = await fetchEarningsCalendar(from, to);
    if (entries === null) {
      return NextResponse.json(
        {
          error: "Earnings calendar unavailable",
          hint: "FINNHUB_API_KEY may not be configured",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { from, to, count: entries.length, entries },
      {
        headers: {
          "Cache-Control": "s-maxage=3600, stale-while-revalidate=1800",
        },
      }
    );
  } catch (err) {
    logError("api/earnings/calendar", err, { from, to });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 502 }
    );
  }
}
