import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[copilot-webhook] Received payload:", JSON.stringify(body));
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("copilot-webhook", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
