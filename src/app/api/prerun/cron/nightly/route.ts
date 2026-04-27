import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData } from "@/lib/prerun/data";
import { autoScorePreRun } from "@/lib/prerun/scoring";
import { getAllPreRunTickers } from "@/data/prerun-universe";
import { sendTelegramMessage } from "@/lib/ew-telegram";
import type { PreRunResult } from "@/lib/prerun/types";
import { MAX_SCORE } from "@/lib/prerun/types";
import { calculateSectorRotation, formatSectorRotationTelegram } from "@/lib/sector-rotation/sector-rotation";

const BATCH_SIZE = 10;
const BATCH_DELAY = 1100; // Respect Finnhub 60/min rate limit

function formatTelegramSummary(
  scannedCount: number,
  qualifying: PreRunResult[],
  aiScored: { ticker: string; score: number; reasoning: string }[]
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push(`<b>Pre-Run Nightly Scan</b>`);
  lines.push(`${date} | ${scannedCount} scanned | ${qualifying.length} qualifying`);
  lines.push("");

  const priority = qualifying.filter((r) => r.verdict === "PRIORITY");
  const keep = qualifying.filter((r) => r.verdict === "KEEP");
  const watch = qualifying.filter((r) => r.verdict === "WATCH");

  if (priority.length > 0) {
    lines.push("<b>PRIORITY:</b>");
    for (const r of priority) {
      const parts = [`${r.data.ticker} ${r.scores.finalScore}/${MAX_SCORE}`];
      if (r.data.pctFromAth !== null) parts.push(`${Math.round(r.data.pctFromAth)}% from ATH`);
      if (r.data.shortFloat !== null) parts.push(`${r.data.shortFloat.toFixed(1)}% SI`);
      if (r.data.daysToEarnings !== null) parts.push(`Earnings ${r.data.daysToEarnings}d`);
      if (r.patternMatch) parts.push(`~${r.patternMatch.template} ${r.patternMatch.similarity}%`);
      lines.push(`* ${parts.join(", ")}`);
    }
    lines.push("");
  }

  if (keep.length > 0) {
    lines.push("<b>KEEP:</b>");
    for (const r of keep) {
      const parts = [`${r.data.ticker} ${r.scores.finalScore}/${MAX_SCORE}`];
      if (r.data.pctFromAth !== null) parts.push(`${Math.round(r.data.pctFromAth)}% from ATH`);
      if (r.data.shortFloat !== null) parts.push(`${r.data.shortFloat.toFixed(1)}% SI`);
      if (r.patternMatch) parts.push(`~${r.patternMatch.template}`);
      lines.push(parts.join(", "));
    }
    lines.push("");
  }

  if (watch.length > 0) {
    const top5 = watch.slice(0, 5);
    lines.push(`<b>WATCH (top ${Math.min(5, watch.length)}):</b>`);
    for (const r of top5) {
      const parts = [`${r.data.ticker} ${r.scores.finalScore}/${MAX_SCORE}`];
      if (r.data.pctFromAth !== null) parts.push(`${Math.round(r.data.pctFromAth)}% from ATH`);
      if (r.data.shortFloat !== null) parts.push(`${r.data.shortFloat.toFixed(1)}% SI`);
      lines.push(parts.join(", "));
    }
    if (watch.length > 5) {
      lines.push(`... and ${watch.length - 5} more`);
    }
  }

  if (qualifying.length === 0) {
    lines.push("No qualifying candidates today.");
  }

  // AI auto-scores
  if (aiScored.length > 0) {
    lines.push("");
    lines.push("<b>AI Catalyst Scores (top 5):</b>");
    for (const ai of aiScored) {
      lines.push(`${ai.ticker}: ${ai.score}/2 — ${ai.reasoning.slice(0, 100)}`);
    }
  }

  return lines.join("\n");
}

/** Auto-fire AI scoring for top N stocks. */
async function autoAiScore(
  results: PreRunResult[],
  topN: number
): Promise<{ ticker: string; score: number; reasoning: string }[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const top = results.slice(0, topN);
  const scored: { ticker: string; score: number; reasoning: string }[] = [];

  for (const r of top) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic();

      const prompt = `You are a stock analyst evaluating whether ${r.data.ticker} (${r.data.companyName}) has a structural narrative catalyst that is NOT yet priced in by the market.

Key data: ${r.data.pctFromAth?.toFixed(0) ?? "?"}% from ATH, ${r.data.shortFloat?.toFixed(1) ?? "?"}% SI, ${r.data.weeksInBase ?? "?"} weeks in base, ${r.data.insiderBuys90d ?? 0} insider buys (90d), P/C ratio ${r.data.putCallRatio?.toFixed(2) ?? "N/A"}.

Score the narrative catalyst on this scale:
- 2: Structural change confirmed, not yet consensus
- 1: Speculative or unconfirmed catalyst
- 0: No catalyst or already fully priced in

Reply with ONLY valid JSON (no code fences):
{"suggestedScore": 0 | 1 | 2, "reasoning": "Brief 1-2 sentence explanation"}`;

      const msg = await client.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      });

      const rawText = msg.content[0].type === "text" ? msg.content[0].text : "";
      let text = rawText.trim();
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        text = text.slice(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(text) as { suggestedScore: number; reasoning: string };
      scored.push({
        ticker: r.data.ticker,
        score: parsed.suggestedScore,
        reasoning: parsed.reasoning,
      });
    } catch {
      // Skip failed AI scores — non-critical
    }
  }

  return scored;
}

export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tickers = getAllPreRunTickers();
    const results: PreRunResult[] = [];

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchPreRunData(ticker);
          if (!data) return null;
          return autoScorePreRun(data);
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          results.push(r.value);
        }
      }

      if (i + BATCH_SIZE < tickers.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    // Filter to qualifying candidates (gates pass + score >= 11)
    const qualifying = results.filter(
      (r) => r.gates.gate1 && r.gates.gate3 && r.scores.finalScore >= 11
    );

    qualifying.sort((a, b) => b.scores.finalScore - a.scores.finalScore);

    // Auto AI scoring for top 5
    const aiScored = await autoAiScore(qualifying, 5);

    // Sector rotation calculation (pass all results for breadth/smart money)
    let rotationResult = null;
    try {
      rotationResult = await calculateSectorRotation(results);
    } catch (rotErr) {
      logError("api/prerun/cron/nightly/rotation", rotErr);
    }

    // Send Telegram summary
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    let telegramSent = false;
    if (botToken && chatId) {
      const message = formatTelegramSummary(tickers.length, qualifying, aiScored);
      const tgResult = await sendTelegramMessage(botToken, chatId, message);
      telegramSent = tgResult.ok;
      if (!tgResult.ok) {
        logError("api/prerun/cron/nightly/telegram", new Error(tgResult.error ?? "Telegram send failed"));
      }

      // Send rotation as separate message (avoid 4096 char limit)
      if (rotationResult) {
        const rotMsg = formatSectorRotationTelegram(rotationResult);
        const rotTgResult = await sendTelegramMessage(botToken, chatId, rotMsg);
        if (!rotTgResult.ok) {
          logError("api/prerun/cron/nightly/rotation-telegram", new Error(rotTgResult.error ?? "Rotation Telegram send failed"));
        }
      }
    }

    return NextResponse.json({
      scannedCount: tickers.length,
      fetchedCount: results.length,
      qualifyingCount: qualifying.length,
      telegramSent,
      aiScored: aiScored.length,
      rotationCalculated: rotationResult !== null,
      results: qualifying,
    });
  } catch (err) {
    logError("api/prerun/cron/nightly", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
