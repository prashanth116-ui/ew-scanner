import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { computeSqueezeScore } from "@/lib/squeeze-scoring";
import { sendTelegramMessage } from "@/lib/ew-telegram";
import { logError } from "@/lib/error-logger";
import type { SqueezeWatchlist, SqueezeData } from "@/lib/ew-types";

const BATCH_SIZE = 10;
const BATCH_DELAY = 300;
const DEFAULT_THRESHOLD = 10; // 10-point delta on 0-100 scale

export async function POST(request: NextRequest) {
  const rl = rateLimit(`squeeze-alert:${getClientKey(request)}`, 5, 60_000);
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

  let body: { watchlist: SqueezeWatchlist; threshold?: number };
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
    // Fetch fresh squeeze data for each ticker
    const squeezeMap = new Map<string, SqueezeData>();

    for (let i = 0; i < watchlist.items.length; i += BATCH_SIZE) {
      const batch = watchlist.items.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(
        batch.map(async (item) => {
          const url = new URL("/api/squeeze", request.url);
          url.searchParams.set("ticker", item.ticker);
          const res = await fetch(url.toString());
          if (!res.ok) return null;
          const data = await res.json();
          if (data.error) return null;
          return data as SqueezeData;
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          squeezeMap.set(r.value.ticker, r.value);
        }
      }

      if (i + BATCH_SIZE < watchlist.items.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    if (squeezeMap.size === 0) {
      return NextResponse.json({ error: "No data fetched" }, { status: 502 });
    }

    // Re-score and compare
    const triggered: {
      ticker: string;
      name: string;
      oldScore: number;
      newScore: number;
      delta: number;
      oldSi: number;
      newSi: number;
    }[] = [];

    for (const item of watchlist.items) {
      const fresh = squeezeMap.get(item.ticker);
      if (!fresh) continue;

      const scored = computeSqueezeScore(fresh);
      const delta = scored.squeezeScore - item.scoreAtAdd;

      if (Math.abs(delta) >= threshold) {
        const newSi = fresh.shortPercentOfFloat ?? 0;
        triggered.push({
          ticker: item.ticker,
          name: item.name,
          oldScore: item.scoreAtAdd,
          newScore: scored.squeezeScore,
          delta,
          oldSi: item.siPercentAtAdd,
          newSi: newSi > 1 ? newSi : newSi * 100,
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
    lines.push(`<b>Squeeze Watchlist Alert: ${watchlist.name}</b>`);
    lines.push(
      `${triggered.length} ticker${triggered.length !== 1 ? "s" : ""} moved >${threshold} pts`
    );
    lines.push("");

    for (const t of triggered.sort(
      (a, b) => Math.abs(b.delta) - Math.abs(a.delta)
    )) {
      const dir = t.delta > 0 ? "+" : "";
      lines.push(
        `${t.ticker}: ${t.oldScore} -> ${t.newScore} (${dir}${t.delta}) | SI: ${t.oldSi.toFixed(1)}% -> ${t.newSi.toFixed(1)}%`
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
    logError("squeeze-alert", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
