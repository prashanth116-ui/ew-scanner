/**
 * Hunt alert — the playbook as a nightly message.
 *
 * Separate from the nightly summary rather than a third message inside it: the summary
 * answers "what agreed tonight", this answers "what do I do next", and the two want
 * different orderings. Keeping them apart also keeps each under Telegram's 4096 ceiling.
 *
 *   ?date=YYYY-MM-DD   run against an earlier scan date
 *   ?dryRun=true       return the text instead of sending
 */

import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { sendTelegramMessage, getTelegramChatId, capForTelegram } from "@/lib/ew-wave/telegram";
import { buildHuntReport } from "@/lib/hunt/hunt-report";
import { formatHuntReport } from "@/lib/hunt/format";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = new URL(request.url).searchParams;
    const dateParam = params.get("date");
    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }
    const scanDate = dateParam ?? new Date().toISOString().slice(0, 10);
    const dryRun = params.get("dryRun") === "true";

    const report = await buildHuntReport(scanDate);
    const label = new Date(`${scanDate}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
    });
    const message = capForTelegram(formatHuntReport(report, label));

    const counts = {
      scanDate,
      coiled: report.coiled.length,
      ready: report.ready.length,
      loaded: report.loaded.length,
      homework: report.research.length,
      chars: message.length,
    };

    if (dryRun) return NextResponse.json({ dryRun: true, ...counts, message });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = getTelegramChatId("NIGHTLY");
    if (!botToken || !chatId) {
      return NextResponse.json({ ...counts, sent: false, error: "Telegram not configured" });
    }

    const result = await sendTelegramMessage(botToken, chatId, message);
    if (!result.ok) {
      logError("api/hunt/cron/telegram", new Error(result.error ?? "send failed"));
    }
    return NextResponse.json({ ...counts, sent: result.ok });
  } catch (err) {
    logError("api/hunt/cron", err);
    return NextResponse.json({ error: "Hunt report failed" }, { status: 500 });
  }
}
