import type { Session, TimeWindow, TimeWindowName } from "./types";

// ── Time Windows (Eastern Time) ────────────────────────────────────

const TIME_WINDOWS: TimeWindow[] = [
  { name: "eth_low_liq", label: "ETH Low Liquidity", start: "18:00", end: "02:00", quality: "avoid" },
  { name: "london",      label: "London Session",    start: "02:00", end: "05:00", quality: "medium" },
  { name: "pre_market",  label: "Pre-Market",        start: "05:00", end: "09:30", quality: "medium" },
  { name: "ny_open",     label: "NY Open",           start: "09:30", end: "10:30", quality: "high" },
  { name: "primary",     label: "Primary Session",   start: "10:30", end: "12:00", quality: "high" },
  { name: "midday_chop", label: "Midday Chop",       start: "12:00", end: "14:00", quality: "avoid" },
  { name: "power_hour",  label: "Power Hour",        start: "14:00", end: "15:30", quality: "high" },
  { name: "eod",         label: "End of Day",        start: "15:30", end: "16:00", quality: "medium" },
  { name: "post_market", label: "Post-Market",       start: "16:00", end: "18:00", quality: "low" },
];

const DEFAULT_WINDOW: TimeWindow = {
  name: "post_market",
  label: "Post-Market",
  start: "16:00",
  end: "18:00",
  quality: "low",
};

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function getETMinutes(): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function getCurrentTimeWindow(_session?: Session): TimeWindow {
  const now = getETMinutes();

  for (const w of TIME_WINDOWS) {
    const start = parseHHMM(w.start);
    const end = parseHHMM(w.end);

    if (start < end) {
      // Normal range (e.g. 09:30-10:30)
      if (now >= start && now < end) return w;
    } else {
      // Overnight range (e.g. 18:00-02:00)
      if (now >= start || now < end) return w;
    }
  }

  return DEFAULT_WINDOW;
}

export function getSessionWarning(window: TimeWindow, _session?: Session): string | null {
  const warnings: Partial<Record<TimeWindowName, string>> = {
    eth_low_liq: "Low liquidity overnight session — wide spreads and erratic moves. Avoid new entries.",
    midday_chop: "Midday chop zone (12:00-14:00 ET) — no new entries per strategy rules.",
    post_market: "Post-market session — reduced liquidity and unreliable price action.",
    eod: "End-of-day window — consider closing positions rather than opening new ones.",
  };
  return warnings[window.name] ?? null;
}

export function getTimeWindowColor(quality: TimeWindow["quality"]): string {
  switch (quality) {
    case "high": return "#22c55e";
    case "medium": return "#eab308";
    case "low": return "#f97316";
    case "avoid": return "#ef4444";
  }
}
