"use client";

import { useState, useEffect, useMemo } from "react";
import { CRYPTO_EVENTS, getBtcHalvingCountdown, type CryptoEvent } from "@/data/crypto-events";
import type { CatalystCalendarEvent } from "@/lib/catalyst/types";
import { useNow } from "@/lib/hooks/use-now";

import { baseSymbol } from "@/lib/crypto-rotation/format";

const CATEGORY_STYLE: Record<
  CryptoEvent["category"],
  { bg: string; text: string }
> = {
  upgrade: { bg: "bg-cyan-500/10 border-cyan-500/30", text: "text-cyan-400" },
  unlock: { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-400" },
  etf: { bg: "bg-green-500/10 border-green-500/30", text: "text-green-400" },
  halving: { bg: "bg-purple-500/10 border-purple-500/30", text: "text-purple-400" },
  macro: { bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-400" },
  fork: { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-400" },
};

const IMPACT_STYLE: Record<string, string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-[#888]",
};

export function CryptoEventsPanel() {
  const [macroEvents, setMacroEvents] = useState<CatalystCalendarEvent[]>([]);
  const [macroLoading, setMacroLoading] = useState(true);
  const now = useNow(60_000);

  // Fetch macro events that impact crypto (FOMC, CPI, employment)
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/macro-events", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : []))
      .then((events: CatalystCalendarEvent[]) => {
        if (!controller.signal.aborted) setMacroEvents(events);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setMacroEvents([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setMacroLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Combine crypto events + macro events, sorted by date
  const allEvents = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const cutoff90d = new Date();
    cutoff90d.setDate(cutoff90d.getDate() + 90);
    const cutoffStr = cutoff90d.toISOString().slice(0, 10);

    // Filter crypto events to upcoming (within 90 days)
    const cryptoUpcoming = CRYPTO_EVENTS.filter(
      (e) => e.date >= today && e.date <= cutoffStr
    ).map((e) => ({
      date: e.date,
      title: e.title,
      category: e.category,
      impact: e.impact,
      tokens: e.affectedTokens.map(baseSymbol),
      description: e.description,
      source: "crypto" as const,
      daysAway: Math.ceil(
        (new Date(e.date).getTime() - now) / (1000 * 60 * 60 * 24)
      ),
    }));

    // Filter macro events to crypto-relevant ones (within 14 days)
    const macroRelevant = macroEvents
      .filter((e) => e.daysAway <= 14 && e.daysAway >= 0)
      .map((e) => ({
        date: e.date,
        title: e.label,
        category: "macro" as const,
        impact: e.daysAway <= 1 ? ("high" as const) : ("medium" as const),
        tokens: [] as string[],
        description: `Macro event that impacts crypto markets. ${e.type.replaceAll("_", " ")}.`,
        source: "macro" as const,
        daysAway: e.daysAway,
      }));

    const combined = [...cryptoUpcoming, ...macroRelevant];
    combined.sort((a, b) => a.date.localeCompare(b.date));
    return combined;
  }, [macroEvents, now]);

  // BTC halving countdown — recompute on render (cheap; changes only daily)
  const halving = getBtcHalvingCountdown();

  return (
    <div className="space-y-4">
      {/* BTC Halving Countdown */}
      <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-purple-400 font-medium">
              Next BTC Halving
            </span>
            <span className="ml-2 text-xs text-[#888]">
              Block {halving.blockTarget.toLocaleString()}
            </span>
          </div>
          <div className="text-right">
            <span className="text-sm text-white font-bold">
              {halving.daysAway}
            </span>
            <span className="text-xs text-[#888] ml-1">days</span>
          </div>
        </div>
        <div className="mt-1 text-[10px] text-[#666]">
          Est. {halving.estimatedDate} — reward drops 3.125 to 1.5625 BTC
        </div>
      </div>

      {/* Events List */}
      {macroLoading && allEvents.length === 0 ? (
        <p className="text-sm text-[#666]">Loading events...</p>
      ) : allEvents.length === 0 ? (
        <p className="text-sm text-[#666]">
          No upcoming crypto or macro events in the next 90 days.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[#666]">
                <th className="pb-1.5 pr-3">Date</th>
                <th className="pb-1.5 pr-3">Event</th>
                <th className="pb-1.5 pr-3">Category</th>
                <th className="pb-1.5 pr-3">Impact</th>
                <th className="pb-1.5 pr-3">Tokens</th>
                <th className="pb-1.5 text-right">Days</th>
              </tr>
            </thead>
            <tbody>
              {allEvents.map((e, i) => {
                const catStyle = CATEGORY_STYLE[e.category];
                return (
                  <tr
                    key={`${e.date}-${i}`}
                    className="border-t border-[#1a1a1a]"
                  >
                    <td className="py-1.5 pr-3 text-[#ccc]">{e.date}</td>
                    <td className="py-1.5 pr-3">
                      <div className="text-white font-medium">
                        {e.title}
                      </div>
                      <div className="text-[10px] text-[#666] mt-0.5">
                        {e.description}
                      </div>
                    </td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${catStyle.bg} ${catStyle.text}`}
                      >
                        {e.category.toUpperCase()}
                      </span>
                    </td>
                    <td
                      className={`py-1.5 pr-3 font-medium ${
                        IMPACT_STYLE[e.impact]
                      }`}
                    >
                      {e.impact.toUpperCase()}
                    </td>
                    <td className="py-1.5 pr-3 text-[#888]">
                      {e.tokens.length > 0 ? e.tokens.join(", ") : "\u2014"}
                    </td>
                    <td
                      className={`py-1.5 text-right font-medium ${
                        e.daysAway <= 1
                          ? "text-red-400"
                          : e.daysAway <= 7
                          ? "text-amber-400"
                          : "text-[#ccc]"
                      }`}
                    >
                      {e.daysAway === 0
                        ? "Today"
                        : e.daysAway === 1
                        ? "Tomorrow"
                        : `${e.daysAway}d`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
