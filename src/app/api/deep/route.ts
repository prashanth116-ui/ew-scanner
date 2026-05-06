import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit, getClientKey } from "@/lib/rate-limit";
import { logError } from "@/lib/error-logger";
import { validateTicker, sanitizeForPrompt, checkOriginAuth } from "@/lib/api-utils";
import { checkFeatureGate, incrementUsage } from "@/lib/auth-gate";

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
  // Structural fallback: true ATH/Low when analysis uses prior correction
  trueAth?: number;
  trueAthDate?: string;
  trueLow?: number;
  trueLowDate?: string;
  // Pre-ATH impulse start for Fibonacci context
  preAthLow?: number;
  preAthLowYear?: string;
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
  // Pre-computed algorithmic targets from getWaveStatusInfo()
  waveTargets?: { label: string; price: number }[];
  waveStartPrice?: number;
  // Micro (daily) wave count
  microWavePoints?: { label: string; price: number; date: string; type: string }[];
  microWavePosition?: string;
  microWaveTargets?: { label: string; price: number }[];
  microWaveStartPrice?: number;
  // Alternate wave count
  alternateWavePoints?: { label: string; price: number; date: string; type: string }[];
  alternateWaveTargets?: { label: string; price: number }[];
  alternateWaveStartPrice?: number;
}

export async function POST(request: NextRequest) {
  // Origin check — AI endpoints only accept same-origin or API key
  const auth = checkOriginAuth(request, process.env.AI_API_KEY);
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Feature gate: check user tier + usage limit
  const gate = await checkFeatureGate("deep_analyses");
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

  // Rate limit: 10 req/min per IP (AI endpoint — costs money)
  const rl = rateLimit(`deep:${getClientKey(request)}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const data = (await request.json()) as DeepInput;

  // Validate ticker
  const validTicker = validateTicker(data.ticker);
  if (!validTicker) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }
  data.ticker = validTicker;
  // Sanitize free-text fields to prevent prompt injection
  if (data.name) data.name = sanitizeForPrompt(data.name, 100);
  if (data.label) data.label = sanitizeForPrompt(data.label, 100);
  if (data.scannerMode) data.scannerMode = sanitizeForPrompt(data.scannerMode, 50);

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
    if (data.alternateWavePoints?.length) {
      waveCountContext += `\n\nALTERNATE WAVE COUNT:`;
      for (const wp of data.alternateWavePoints) {
        waveCountContext += `\n  Wave ${wp.label}: $${wp.price.toFixed(2)} (${wp.date}, swing ${wp.type})`;
      }
      if (data.alternatePosition) waveCountContext += `\n- Position: ${data.alternatePosition}`;
    } else if (data.alternatePosition) {
      waveCountContext += `\n- Alternate interpretation: ${data.alternatePosition}`;
    }
  } else if (data.waveCountPosition) {
    waveCountContext += `\nAlgorithmic wave counting:`;
    waveCountContext += `\n- Position: ${data.waveCountPosition}`;
    waveCountContext += `\n- Valid: ${data.waveCountValid ? "yes" : "no"} (score: ${data.waveCountScore ?? 0}/100)`;
    if (data.waveLabels) waveCountContext += `\n- Wave labels: ${data.waveLabels}`;
  }

  let microWaveContext = "";
  if (data.microWavePoints?.length) {
    microWaveContext += `\n\nMICRO WAVE COUNT (Daily timeframe — intermediate degree):`;
    for (const wp of data.microWavePoints) {
      microWaveContext += `\n  Wave ${wp.label}: $${wp.price.toFixed(2)} (${wp.date}, swing ${wp.type})`;
    }
    if (data.microWavePosition) microWaveContext += `\n- Position: ${data.microWavePosition}`;
  }

  let extensionContext = "";
  // Filter out negative/zero extensions (impossible prices from bearish impulse projections)
  const validExtensions = (data.fibExtensions ?? []).filter((ext) => ext.price > 0);
  if (validExtensions.length) {
    extensionContext += `\nFibonacci extensions (Wave 3/5 targets):`;
    for (const ext of validExtensions) {
      extensionContext += `\n- ${ext.label}: $${ext.price.toFixed(2)}`;
    }
  }
  if (data.confluenceZones?.length) {
    extensionContext += `\nConfluence zones (multiple Fib levels cluster):`;
    for (const z of data.confluenceZones) {
      extensionContext += `\n- $${z.price.toFixed(2)}: ${z.levels.join(" + ")}`;
    }
  }

  // Pre-computed algorithmic targets — source of truth for nextTarget/keyLevels
  let targetContext = "";
  if (data.waveTargets?.length) {
    targetContext += `\n\nPRE-COMPUTED TARGETS (from algorithmic Fibonacci analysis — use these EXACT values):`;
    for (const t of data.waveTargets) {
      targetContext += `\n  ${t.label}: $${t.price.toFixed(2)}`;
    }
    if (data.waveStartPrice != null) {
      targetContext += `\n  Wave start (p0): $${data.waveStartPrice.toFixed(2)}`;
    }
  }
  if (data.microWaveTargets?.length) {
    targetContext += `\n\nMICRO TARGETS (Daily wave count — intermediate degree):`;
    for (const t of data.microWaveTargets) {
      targetContext += `\n  ${t.label}: $${t.price.toFixed(2)}`;
    }
    if (data.microWaveStartPrice != null) {
      targetContext += `\n  Micro wave start: $${data.microWaveStartPrice.toFixed(2)}`;
    }
  }
  if (data.alternateWaveTargets?.length) {
    targetContext += `\n\nALTERNATE COUNT TARGETS (alternate interpretation):`;
    for (const t of data.alternateWaveTargets) {
      targetContext += `\n  ${t.label}: $${t.price.toFixed(2)}`;
    }
    if (data.alternateWaveStartPrice != null) {
      targetContext += `\n  Alternate wave start: $${data.alternateWaveStartPrice.toFixed(2)}`;
    }
  }

  // Pre-ATH impulse context: gives LLM exact Fibonacci retracement of the prior impulse
  let impulseContext = "";
  if (data.preAthLow != null && data.preAthLow < data.ath) {
    const impulseRange = data.ath - data.preAthLow;
    const declineRetrace = (data.ath - data.low) / impulseRange;

    if (declineRetrace <= 1.0) {
      // Good data: decline stays within the visible impulse — Fibonacci levels are meaningful
      const r382 = data.ath - impulseRange * 0.382;
      const r500 = data.ath - impulseRange * 0.500;
      const r618 = data.ath - impulseRange * 0.618;

      impulseContext = `\nPrior impulse: $${data.preAthLow.toFixed(2)} (${data.preAthLowYear ?? "unknown"}) → $${data.ath.toFixed(2)} ATH
- The post-ATH decline to $${data.low.toFixed(2)} retraces ${(declineRetrace * 100).toFixed(1)}% of this impulse
- Impulse Fibonacci retracements: 38.2% = $${r382.toFixed(2)}, 50% = $${r500.toFixed(2)}, 61.8% = $${r618.toFixed(2)}`;
    } else {
      // Insufficient data: decline exceeds the visible impulse start — Fibonacci levels are unreliable
      impulseContext = `\nPrior impulse (partial): $${data.preAthLow.toFixed(2)} (${data.preAthLowYear ?? "unknown"}) → $${data.ath.toFixed(2)} ATH
- The post-ATH decline to $${data.low.toFixed(2)} exceeded this impulse start (${(declineRetrace * 100).toFixed(1)}% retracement), meaning the 5-year data window does not capture the full prior impulse. The true impulse likely started from a much lower price.
- Do NOT reference impulse Fibonacci retracement zones (38.2%, 50%, 61.8%) — they are unreliable with incomplete impulse data. Focus your analysis on the actual price levels and recovery from the low.`;
    }
  }

  const hasWavePoints = data.wavePoints && data.wavePoints.length > 0;

  // Forward-looking directive for completed patterns
  let forwardContext = "";
  const pos = (data.waveCountPosition ?? "").toLowerCase();
  if (pos.includes("beyond wave 5") || pos.includes("post-wave 5") || pos.includes("correction may be complete")) {
    forwardContext = `\nIMPORTANT: The algorithmic wave count shows a COMPLETED pattern (${data.waveCountPosition}). Your analysis must focus on what comes NEXT — not rehash what already happened. Specifically:
- What is the likely next wave structure (new impulse cycle, corrective bounce, etc.)?
- What are realistic UPSIDE targets for the recovery, using Fibonacci retracement levels of the prior decline?
- What key support must hold for the bullish case?
- The "nextTarget" MUST be an upside target above the current price, not a downside extension.
- Keep the completed wave description brief (1-2 sentences) and spend most of the analysis on the forward outlook.\n`;
  }

  // Structural fallback context for stocks at/near ATH
  let structuralContext = "";
  if (data.trueAth != null) {
    const trueLowLine = data.trueLow != null
      ? `\nThe post-ATH low was $${data.trueLow.toFixed(2)}${data.trueLowDate ? ` (${data.trueLowDate})` : ""} — a ${((data.trueAth - data.trueLow) / data.trueAth * 100).toFixed(1)}% decline from the new ATH.`
      : "";
    structuralContext = `\nIMPORTANT: This stock recently reached a new all-time high of $${data.trueAth.toFixed(2)}${data.trueAthDate ? ` (${data.trueAthDate})` : ""}, surpassing its prior structural peak of $${data.ath.toFixed(2)}.${trueLowLine}\nThe analysis uses the previous structural correction ($${data.ath.toFixed(0)} to $${data.low.toFixed(0)}) as the wave reference frame. Current price at $${data.current.toFixed(2)} is above the prior peak, indicating extended impulse or new wave cycle.\n`;
  }

  const prompt = `You are an expert Elliott Wave analyst. Provide a deep analysis for ${data.ticker} (${data.name}).

Price data:
- ATH: $${data.ath.toFixed(2)} (${data.athDate})
- Low: $${data.low.toFixed(2)} (${data.lowDate})
- Current: $${data.current.toFixed(2)}
- Decline: ${data.declinePct.toFixed(1)}% over ${data.durationMonths.toFixed(0)} months
- Recovery: ${data.recoveryPct.toFixed(1)}% from low
- Mechanical score: ${data.score}/25
${data.label ? `- Quick label: ${data.label}` : ""}${seriesContext}${analysisContext ? `\nTechnical analysis:${analysisContext}` : ""}${impulseContext}${waveCountContext}${microWaveContext}${extensionContext}${targetContext}${structuralContext}${forwardContext}

Timeframes: ${data.htf} (primary) / ${data.ltf} (sub-waves)
${hasWavePoints ? `
CRITICAL: The wave points above are from algorithmic swing detection on actual price data. You MUST reference these exact prices in your analysis. Do NOT invent different wave prices. Your job is to INTERPRET the algorithmic wave count — explain what it means, assess confidence, provide targets and invalidation — not to re-count the waves with made-up prices.
IMPORTANT: Use ONLY the prices and Fibonacci levels provided above. Do NOT calculate or estimate prices that aren't given. If the prior impulse start price is provided, use that exact value — do NOT invent a different starting price.${data.waveTargets?.length ? `
TARGETS: The pre-computed targets above are from three analytical frameworks: primary (macro weekly), micro (daily), and alternate count. You MUST use these exact prices — do NOT calculate your own. For "nextTarget", pick the most relevant target above current price (for recovery/uptrend) or below (for correction/downtrend). Prefer micro targets for near-term outlook and primary targets for the bigger picture. For "keyLevels", use wave points and targets from all three sets. The "invalidation" level should be the wave start or the extreme that invalidates the count.` : ""}` : ""}

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

    const MODELS = [
      "claude-sonnet-4-5-20250929",
      "claude-haiku-3-5-20241022",
    ];

    // Try primary model with retries, then fall back to secondary model
    let msg: Anthropic.Messages.Message | null = null;
    const MAX_RETRIES = 2;
    for (const model of MODELS) {
      let succeeded = false;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          msg = await client.messages.create({
            model,
            max_tokens: 800,
            messages: [{ role: "user", content: prompt }],
          });
          succeeded = true;
          break;
        } catch (retryErr) {
          const isOverloaded =
            retryErr instanceof Error &&
            (retryErr.message.includes("overloaded") || retryErr.message.includes("529"));
          if (isOverloaded && attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
            continue;
          }
          if (isOverloaded && model !== MODELS[MODELS.length - 1]) {
            break; // try fallback model
          }
          throw retryErr;
        }
      }
      if (succeeded) break;
    }

    if (!msg) throw new Error("Failed to get API response after retries");

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

    // Increment usage on success
    if (gate.userId) {
      await incrementUsage(gate.userId, "deep_analyses");
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

    // Detect billing/credit errors for user-friendly messaging
    const isBilling = message.includes("credit balance") || message.includes("billing") || message.includes("purchase credits");
    if (isBilling) {
      return NextResponse.json(
        { error: "API credits exhausted", billing: true, analysis: "AI analysis is temporarily unavailable — API credits need to be replenished." },
        { status: 402 }
      );
    }

    // Detect overload errors
    const isOverloaded = message.includes("overloaded") || message.includes("529");
    if (isOverloaded) {
      return NextResponse.json(
        { error: "API temporarily overloaded", analysis: "AI analysis is temporarily unavailable — the API is experiencing high traffic. Please try again in a minute." },
        { status: 503 }
      );
    }

    return NextResponse.json({ analysis: `Analysis unavailable: ${message}` });
  }
}
