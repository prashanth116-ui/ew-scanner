import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

interface CandidateInput {
  ticker: string;
  ath: number;
  low: number;
  current: number;
  declinePct: number;
  monthsDecline: number;
  recoveryPct: number;
  fibZone?: string;
  volumeTrend?: string;
  swingCount?: number;
  structure?: string;
  scannerMode?: string;
}

export async function POST(request: NextRequest) {
  const { candidates, htf, ltf } = (await request.json()) as {
    candidates: CandidateInput[];
    htf: string;
    ltf: string;
  };

  if (!candidates?.length) {
    return NextResponse.json({ error: "No candidates" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const modeContext = candidates[0]?.scannerMode
    ? `\nScanner mode: ${candidates[0].scannerMode} (focus your labels on this wave context).`
    : "";

  try {
    const client = new Anthropic();
    const allLabels: Record<string, string> = {};

    // Chunk into batches of 25 to stay within token limits
    const CHUNK_SIZE = 25;
    for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
      const chunk = candidates.slice(i, i + CHUNK_SIZE);
      const chunkLines = chunk
        .map((c) => {
          let line = `${c.ticker}: ATH=$${c.ath.toFixed(2)}, Low=$${c.low.toFixed(2)}, Now=$${c.current.toFixed(2)}, Decline=${c.declinePct.toFixed(1)}%, ${c.monthsDecline.toFixed(0)}mo, Recovery=${c.recoveryPct.toFixed(1)}%`;
          if (c.fibZone) line += `, Fib=${c.fibZone}`;
          if (c.volumeTrend) line += `, Vol=${c.volumeTrend}`;
          if (c.swingCount != null) line += `, Swings=${c.swingCount}`;
          if (c.structure) line += `, Structure=${c.structure}`;
          return line;
        })
        .join("\n");

      const chunkPrompt = `You are an Elliott Wave analyst. For each ticker below, determine the current wave position. Consider the ${htf} timeframe as the primary wave degree and ${ltf} for sub-waves.${modeContext}

Reply with ONLY valid JSON in this format:
{"labels":{"TICKER":{"label":"wave position, max 55 chars","wavePosition":"W2/W3/W4/W5/WA/WB/WC"}}}

${chunkLines}`;

      const msg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        messages: [{ role: "user", content: chunkPrompt }],
      });

      const text =
        msg.content[0].type === "text" ? msg.content[0].text : "";

      // Try JSON parse first
      let parsed = false;
      try {
        const json = JSON.parse(text);
        if (json.labels) {
          for (const [ticker, val] of Object.entries(json.labels)) {
            if (typeof val === "object" && val !== null && "label" in val) {
              allLabels[ticker] = (val as { label: string }).label.slice(0, 55);
            } else if (typeof val === "string") {
              allLabels[ticker] = val.slice(0, 55);
            }
          }
          parsed = true;
        }
      } catch {
        // Fall back to freeform line parsing
      }

      if (!parsed) {
        for (const line of text.split("\n")) {
          const match = line.match(/^([A-Z0-9.]+):\s*(.+)$/);
          if (match) {
            allLabels[match[1]] = match[2].trim().slice(0, 55);
          }
        }
      }
    }

    return NextResponse.json({ labels: allLabels });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ labels: {}, error: message });
  }
}
