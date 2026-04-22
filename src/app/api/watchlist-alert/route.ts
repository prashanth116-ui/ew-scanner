import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { fetchQuote } from "@/lib/ew-alert-core";
import { scoreBatchEnhanced, type EnrichedQuoteInput } from "@/lib/ew-scoring";
import { sendTelegramMessage } from "@/lib/ew-telegram";
import { logError } from "@/lib/error-logger";
import type { Watchlist, ScannerMode } from "@/lib/ew-types";

const BATCH_SIZE = 10;
const BATCH_DELAY = 300;
const DEFAULT_THRESHOLD = 0.15; // 15% score delta triggers alert

export async function POST(request: NextRequest) {
  // Rate limit: 5 req/min
  const rl = rateLimit(`watchlist-alert:${getClientKey(request)}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set" },
      { status: 400 }
    );
  }

  let body: { watchlist: Watchlist; threshold?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { watchlist, threshold = DEFAULT_THRESHOLD } = body;
  if (!watchlist?.items?.length) {
    return NextResponse.json({ error: "Watchlist has no items" }, { status: 400 });
  }

  try {
    // Fetch fresh quotes
    const quotes: EnrichedQuoteInput[] = [];
    for (let i = 0; i < watchlist.items.length; i += BATCH_SIZE) {
      const batch = watchlist.items.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(
        batch.map((item) =>
          fetchQuote(item.ticker).then((q) => {
            if (q) { q.name = item.name; q.sector = item.sector; }
            return q;
          })
        )
      );
      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) quotes.push(r.value);
      }
      if (i + BATCH_SIZE < watchlist.items.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    if (quotes.length === 0) {
      return NextResponse.json({ error: "No quotes fetched" }, { status: 502 });
    }

    // Score with zero filters to ensure all watchlist items get scored
    const mode: ScannerMode = watchlist.items[0]?.mode ?? "wave2";
    const scored = scoreBatchEnhanced(quotes, {
      minDecline: 0,
      minDuration: 0,
      minRecovery: 0,
      mode,
    });

    // Compare scores
    const triggered: { ticker: string; name: string; oldScore: number; newScore: number; delta: number }[] = [];

    for (const item of watchlist.items) {
      const fresh = scored.find((s) => s.ticker === item.ticker);
      if (!fresh) continue;
      const delta = fresh.enhancedNormalized - item.scoreAtAdd;
      if (Math.abs(delta) >= threshold) {
        triggered.push({
          ticker: item.ticker,
          name: item.name,
          oldScore: item.scoreAtAdd,
          newScore: fresh.enhancedNormalized,
          delta,
        });
      }
    }

    if (triggered.length === 0) {
      return NextResponse.json({
        sent: false,
        triggered: [],
        message: "No tickers exceeded threshold",
      });
    }

    // Format message
    const lines: string[] = [];
    lines.push(`<b>Watchlist Alert: ${watchlist.name}</b>`);
    lines.push(`${triggered.length} ticker${triggered.length !== 1 ? "s" : ""} moved >${Math.round(threshold * 100)}%`);
    lines.push("");
    for (const t of triggered.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))) {
      const dir = t.delta > 0 ? "+" : "";
      lines.push(
        `${t.ticker} ${Math.round(t.oldScore * 100)}% -> ${Math.round(t.newScore * 100)}% (${dir}${Math.round(t.delta * 100)})`
      );
    }

    const message = lines.join("\n");
    const tgResult = await sendTelegramMessage(botToken, chatId, message);

    return NextResponse.json({
      sent: tgResult.ok,
      triggered,
      ...(tgResult.error ? { error: tgResult.error } : {}),
    });
  } catch (err) {
    logError("watchlist-alert", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
