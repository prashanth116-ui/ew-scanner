import type { ConfidenceTier, ScannerMode } from "./ew-types";

interface AlertCandidate {
  ticker: string;
  name: string;
  enhancedNormalized: number;
  confidenceTier: ConfidenceTier;
  declinePct: number;
  recoveryPct: number;
  waveCount?: { position: string };
}

const MODE_LABELS: Record<ScannerMode, string> = {
  wave2: "Wave 2 Bottom",
  wave4: "Wave 4 Pullback",
  wave5: "Wave 5 Exhaustion",
  breakout: "Breakout",
};

export function formatAlertMessage(
  candidates: AlertCandidate[],
  mode: ScannerMode,
  universe: string,
  newTickers: string[],
  labels: Record<string, string>
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push(`<b>EW Scanner Alert</b>`);
  lines.push(`${MODE_LABELS[mode]} | ${universe} | ${date}`);
  lines.push(`${candidates.length} candidate${candidates.length !== 1 ? "s" : ""}`);
  lines.push("");

  // New tickers section
  if (newTickers.length > 0) {
    lines.push(`<b>NEW:</b> ${newTickers.join(", ")}`);
    lines.push("");
  }

  // Top candidates
  const top = candidates.slice(0, 15);
  for (const c of top) {
    const pct = Math.round(c.enhancedNormalized * 100);
    const conf = c.confidenceTier === "high" ? "H" : c.confidenceTier === "probable" ? "P" : "S";
    const isNew = newTickers.includes(c.ticker);
    let line = `${isNew ? "* " : ""}${c.ticker} ${pct}% [${conf}]`;
    if (c.waveCount?.position) {
      line += ` - ${c.waveCount.position}`;
    } else if (labels[c.ticker]) {
      line += ` - ${labels[c.ticker]}`;
    }
    lines.push(line);
  }

  if (candidates.length > 15) {
    lines.push(`\n... and ${candidates.length - 15} more`);
  }

  return lines.join("\n");
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (data.ok === true) return { ok: true };
    return { ok: false, error: data.description ?? `Telegram API error ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
