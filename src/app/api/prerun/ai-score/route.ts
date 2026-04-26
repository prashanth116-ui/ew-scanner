import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTicker, sanitizeForPrompt, checkOriginAuth } from "@/lib/api-utils";
import { checkFeatureGate, incrementUsage } from "@/lib/auth-gate";

export async function POST(request: NextRequest) {
  // Origin check — AI endpoints only accept same-origin or API key
  const auth = checkOriginAuth(request, process.env.AI_API_KEY);
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Feature gate: check user tier + usage limit
  const gate = await checkFeatureGate("ai_scores");
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error: "Usage limit reached",
        tier: gate.tier,
        used: gate.used,
        limit: gate.limit,
        upgrade: true,
      },
      { status: 403 }
    );
  }

  // Rate limit: 5 req/min per IP (AI endpoint — costs money)
  const rl = rateLimit(`prerun-ai:${getClientKey(request)}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as {
      ticker: string;
      companyName?: string;
      recentNews?: string;
    };

    const ticker = validateTicker(body.ticker);
    if (!ticker) {
      return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
    }
    const companyName = body.companyName ? sanitizeForPrompt(body.companyName, 100) : "";
    const recentNews = body.recentNews ? sanitizeForPrompt(body.recentNews, 500) : "";

    const prompt = `You are a stock analyst evaluating whether ${ticker}${companyName ? ` (${companyName})` : ""} has a structural narrative catalyst that is NOT yet priced in by the market.

${recentNews ? `Recent news/context:\n${recentNews}\n` : ""}
This is for a Pre-Run Scanner that identifies stocks building bases 40%+ below ATH that could become multi-baggers. The scanner scores 11 criteria (A-K) including short interest, insider buying, options flow, relative sector strength, and breakout proximity.

Score the narrative catalyst on this expanded scale:
- 3: Multiple converging catalysts — structural shift + near-term trigger + sector tailwind (rare)
- 2: Structural change confirmed, not yet consensus (e.g., new regulation benefiting sector, supply chain shift, emerging technology demand)
- 1: Speculative or unconfirmed catalyst (e.g., rumors, early-stage trends)
- 0: No catalyst or catalyst already fully priced in

Reply with ONLY valid JSON (no code fences):
{
  "suggestedScore": 0 | 1 | 2 | 3,
  "reasoning": "Brief 1-2 sentence explanation",
  "confidence": "high" | "medium" | "low"
}`;

    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = msg.content[0].type === "text" ? msg.content[0].text : "";
    let text = rawText.trim();
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1);
    }

    // Increment usage on success
    if (gate.userId) {
      await incrementUsage(gate.userId, "ai_scores");
    }

    try {
      const parsed = JSON.parse(text) as {
        suggestedScore: number;
        reasoning: string;
        confidence: string;
      };
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({
        suggestedScore: 1,
        reasoning: rawText,
        confidence: "low",
      });
    }
  } catch (err) {
    logError("api/prerun/ai-score", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI scoring failed" },
      { status: 502 }
    );
  }
}
