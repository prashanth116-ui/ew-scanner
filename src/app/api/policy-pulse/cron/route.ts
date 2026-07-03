import { NextRequest, NextResponse } from "next/server";
import { ingestPolicyPulse } from "@/lib/policy-pulse/ingest";
import { loadRecentThemeEvents } from "@/lib/policy-pulse/persistence";
import { getThemeLabel } from "@/data/theme-map";
import { sendTelegramMessage } from "@/lib/ew-telegram";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Auth
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Run ingestion pipeline
    const result = await ingestPolicyPulse();

    // Telegram alert for high-impact events
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (botToken && chatId && result.classified > 0) {
      // Check for high-impact events in last 4 hours
      const recent = await loadRecentThemeEvents(5);
      const highImpact = recent.filter((e) => e.impact_score >= 75);

      if (highImpact.length > 0) {
        const lines: string[] = [];
        lines.push("<b>Policy Pulse Alert</b>");
        lines.push(
          `${result.classified} events classified | ${highImpact.length} high-impact`,
        );
        lines.push("");

        for (const event of highImpact.slice(0, 5)) {
          const badge =
            event.impact_score >= 75 ? "🔴" : event.impact_score >= 50 ? "🟡" : "🟢";
          lines.push(
            `${badge} <b>${event.impact_score}</b> ${event.headline.slice(0, 80)}`,
          );
          lines.push(
            `   ${getThemeLabel(event.theme_id)} · ${event.impacted_tickers.slice(0, 5).join(", ")}`,
          );
          lines.push("");
        }

        await sendTelegramMessage(botToken, chatId, lines.join("\n"));
      }
    }

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error("[policy-pulse] cron error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
