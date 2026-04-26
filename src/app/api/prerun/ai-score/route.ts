import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";

export async function POST(request: NextRequest) {
  const rl = rateLimit(`prerun-ai:${getClientKey(request)}`, 10, 60_000);
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

    if (!body.ticker) {
      return NextResponse.json({ error: "ticker required" }, { status: 400 });
    }

    const prompt = `You are a stock analyst evaluating whether ${body.ticker}${body.companyName ? ` (${body.companyName})` : ""} has a structural narrative catalyst that is NOT yet priced in by the market.

${body.recentNews ? `Recent news/context:\n${body.recentNews}\n` : ""}
Score the narrative catalyst on this scale:
- 2: Structural change confirmed, not yet consensus (e.g., new regulation benefiting sector, supply chain shift, emerging technology demand)
- 1: Speculative or unconfirmed catalyst (e.g., rumors, early-stage trends)
- 0: No catalyst or catalyst already fully priced in

Reply with ONLY valid JSON (no code fences):
{
  "suggestedScore": 0 | 1 | 2,
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
