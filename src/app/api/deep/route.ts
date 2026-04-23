import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";

interface DeepInput {
  ticker: string;
  name: string;
  ath: number;
  athDate: string;
  low: number;
  lowDate: string;
  current: number;
  declinePct: number;
  durationMonths: number;
  recoveryPct: number;
  score: number;
  label?: string;
  htf: string;
  ltf: string;
  // V2 enriched fields
  weeklyCloses?: number[];
  fibZone?: string;
  fibDepth?: number;
  goldenZone?: boolean;
  volumeTrend?: string;
  structure?: string;
  swingCount?: number;
  momentumScore?: number;
  scannerMode?: string;
  // Structural fallback: true ATH when analysis uses prior correction
  trueAth?: number;
  trueAthDate?: string;
  // V3 wave count fields
  waveCountValid?: boolean;
  waveCountScore?: number;
  waveCountPosition?: string;
  waveCountViolations?: string[];
  waveLabels?: string;
  wavePoints?: { label: string; price: number; date: string; type: string }[];
  alternatePosition?: string;
  fibExtensions?: { ratio: number; price: number; label: string }[];
  confluenceZones?: { price: number; levels: string[] }[];
}

export async function POST(request: NextRequest) {
  // Rate limit: 20 req/min per IP
  const rl = rateLimit(`deep:${getClientKey(request)}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const data = (await request.json()) as DeepInput;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  // Build price series context if available
  let seriesContext = "";
  if (data.weeklyCloses?.length) {
    // Sample to ~50 data points for prompt efficiency
    const closes = data.weeklyCloses;
    const step = Math.max(1, Math.floor(closes.length / 50));
    const sampled = closes.filter((_, i) => i % step === 0);
    seriesContext = `\nWeekly closes (sampled, ${sampled.length} pts): [${sampled.map((p) => p.toFixed(2)).join(", ")}]`;
  }

  // Build analysis context
  let analysisContext = "";
  if (data.fibZone) {
    analysisContext += `\n- Fibonacci zone: ${data.fibZone} (depth: ${(data.fibDepth ?? 0).toFixed(1)}%, golden zone: ${data.goldenZone ? "yes" : "no"})`;
  }
  if (data.volumeTrend) analysisContext += `\n- Volume trend: ${data.volumeTrend}`;
  if (data.structure) analysisContext += `\n- Decline structure: ${data.structure} (${data.swingCount ?? 0} swings)`;
  if (data.momentumScore != null) analysisContext += `\n- Momentum score: ${data.momentumScore.toFixed(2)} (-1 bearish to +1 bullish)`;
  if (data.scannerMode) analysisContext += `\n- Scanner mode: ${data.scannerMode}`;

  // V3: Wave count context — algorithm is source of truth for prices
  let waveCountContext = "";
  if (data.wavePoints?.length) {
    waveCountContext += `\n\nALGORITHMIC WAVE COUNT (verified from actual price data — use these exact prices):`;
    for (const wp of data.wavePoints) {
      waveCountContext += `\n  Wave ${wp.label}: $${wp.price.toFixed(2)} (${wp.date}, swing ${wp.type})`;
    }
    waveCountContext += `\n- Position: ${data.waveCountPosition ?? "unknown"}`;
    waveCountContext += `\n- Valid: ${data.waveCountValid ? "yes" : "no"} (quality score: ${data.waveCountScore ?? 0}/100)`;
    if (data.waveCountViolations?.length) waveCountContext += `\n- Rule violations: ${data.waveCountViolations.join(", ")}`;
    if (data.alternatePosition) waveCountContext += `\n- Alternate interpretation: ${data.alternatePosition}`;
  } else if (data.waveCountPosition) {
    waveCountContext += `\nAlgorithmic wave counting:`;
    waveCountContext += `\n- Position: ${data.waveCountPosition}`;
    waveCountContext += `\n- Valid: ${data.waveCountValid ? "yes" : "no"} (score: ${data.waveCountScore ?? 0}/100)`;
    if (data.waveLabels) waveCountContext += `\n- Wave labels: ${data.waveLabels}`;
  }

  let extensionContext = "";
  if (data.fibExtensions?.length) {
    extensionContext += `\nFibonacci extensions (Wave 3/5 targets):`;
    for (const ext of data.fibExtensions) {
      extensionContext += `\n- ${ext.label}: $${ext.price.toFixed(2)}`;
    }
  }
  if (data.confluenceZones?.length) {
    extensionContext += `\nConfluence zones (multiple Fib levels cluster):`;
    for (const z of data.confluenceZones) {
      extensionContext += `\n- $${z.price.toFixed(2)}: ${z.levels.join(" + ")}`;
    }
  }

  const hasWavePoints = data.wavePoints && data.wavePoints.length > 0;

  // Structural fallback context for stocks at/near ATH
  let structuralContext = "";
  if (data.trueAth != null) {
    structuralContext = `\nIMPORTANT: This stock recently reached a new all-time high of $${data.trueAth.toFixed(2)}${data.trueAthDate ? ` (${data.trueAthDate})` : ""}, surpassing its prior structural peak of $${data.ath.toFixed(2)}. The analysis uses the previous structural correction ($${data.ath.toFixed(0)} to $${data.low.toFixed(0)}) as the wave reference frame. Current price at $${data.current.toFixed(2)} is above the prior peak, indicating extended impulse or new wave cycle.\n`;
  }

  const prompt = `You are an expert Elliott Wave analyst. Provide a deep analysis for ${data.ticker} (${data.name}).

Price data:
- ATH: $${data.ath.toFixed(2)} (${data.athDate})
- Low: $${data.low.toFixed(2)} (${data.lowDate})
- Current: $${data.current.toFixed(2)}
- Decline: ${data.declinePct.toFixed(1)}% over ${data.durationMonths.toFixed(0)} months
- Recovery: ${data.recoveryPct.toFixed(1)}% from low
- Mechanical score: ${data.score}/25
${data.label ? `- Quick label: ${data.label}` : ""}${seriesContext}${analysisContext ? `\nTechnical analysis:${analysisContext}` : ""}${waveCountContext}${extensionContext}${structuralContext}

Timeframes: ${data.htf} (primary) / ${data.ltf} (sub-waves)
${hasWavePoints ? `
CRITICAL: The wave points above are from algorithmic swing detection on actual price data. You MUST reference these exact prices in your analysis. Do NOT invent different wave prices. Your job is to INTERPRET the algorithmic wave count — explain what it means, assess confidence, provide targets and invalidation — not to re-count the waves with made-up prices.` : ""}

Reply with ONLY valid JSON (no code fences, no markdown) in this exact format:
{
  "wavePosition": "e.g. Wave 2 bottom / Wave 4 correction / Wave 5 topping",
  "confidence": "high" | "medium" | "low",
  "primaryCount": "Primary EW count description using the exact wave prices provided",
  "alternateCount": "Alternate EW count description",
  "nextTarget": price_number_or_null,
  "invalidation": price_number_or_null,
  "keyLevels": [{"label": "Support 1", "price": 123.45}, {"label": "Resistance 1", "price": 234.56}],
  "riskLevel": "Low" | "Medium" | "High",
  "summary": "Concise 2-3 sentence analysis referencing the actual wave prices"
}`;

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText =
      msg.content[0].type === "text" ? msg.content[0].text : "";

    // Extract JSON from response — handle code fences, extra text, etc.
    let text = rawText.trim();
    // Try to extract JSON object between first { and last }
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1);
    }

    // Try JSON parse
    try {
      const parsed = JSON.parse(text);
      return NextResponse.json({ analysis: parsed.summary ?? text, structured: parsed });
    } catch {
      // Fall back to wrapping raw text in summary field
      return NextResponse.json({
        analysis: rawText,
        structured: {
          wavePosition: "",
          confidence: "medium",
          primaryCount: "",
          alternateCount: "",
          nextTarget: null,
          invalidation: null,
          keyLevels: [],
          riskLevel: "Medium",
          summary: rawText,
        },
      });
    }
  } catch (err) {
    logError("api/deep", err, { ticker: data.ticker });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ analysis: `Error: ${message}` });
  }
}
