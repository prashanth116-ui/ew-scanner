import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";

export async function POST(request: NextRequest) {
  const secret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Validate secret from header or query param
  const authHeader = request.headers.get("x-webhook-secret") ??
    request.nextUrl.searchParams.get("secret");
  if (authHeader !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      ticker?: string;
      price?: number;
      alert?: string;
      message?: string;
    };

    if (!body.ticker) {
      return NextResponse.json({ error: "ticker required" }, { status: 400 });
    }

    // Return the alert data — the client stores it in localStorage
    // For a full Supabase implementation, this would write to prerun_alerts table
    return NextResponse.json({
      success: true,
      alert: {
        ticker: body.ticker.toUpperCase(),
        alertType: body.alert ?? "tv_webhook",
        message: body.message ?? `TradingView alert for ${body.ticker}`,
        price: body.price ?? null,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    logError("api/prerun/webhook/tradingview", err);
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }
}
