"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { THEME_MAP } from "@/data/theme-map";

// ── Types ──

interface ScannerCrossRef {
  ticker: string;
  qfeRating?: string;
  qfeScore?: number;
  prerunVerdict?: string;
  prerunScore?: number;
}

interface ThemeEventWithCrossRef {
  id: number;
  themeId: string;
  themeName: string;
  headline: string;
  summary: string | null;
  source: string;
  sourceUrl: string | null;
  publishedAt: string;
  impactScore: number;
  impactedTickers: string[];
  impactedEtfs: string[];
  scannerData: ScannerCrossRef[];
}

type TimeRange = 7 | 14 | 30;

// ── Helpers ──

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function impactBadge(score: number): { color: string; bg: string; border: string } {
  if (score >= 75) return { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" };
  if (score >= 50) return { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" };
  return { color: "text-[#888]", bg: "bg-[#222]", border: "border-[#333]" };
}

function sourceLabel(source: string): string {
  if (source === "whitehouse-rss") return "White House";
  if (source === "fed-register") return "Fed Register";
  return "Finnhub";
}

// ── Component ──

export default function PolicyPulsePage() {
  const [events, setEvents] = useState<ThemeEventWithCrossRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [minImpact, setMinImpact] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("days", String(timeRange));
    if (selectedTheme) params.set("theme", selectedTheme);
    if (minImpact > 0) params.set("minImpact", String(minImpact));

    fetch(`/api/policy-pulse?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ThemeEventWithCrossRef[]) => setEvents(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [timeRange, selectedTheme, minImpact]);

  // Group events by date
  const grouped = useMemo(() => {
    const groups = new Map<string, ThemeEventWithCrossRef[]>();
    for (const event of events) {
      const key = new Date(event.publishedAt).toDateString();
      const list = groups.get(key) ?? [];
      list.push(event);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).map(([, evts]) => ({
      label: dateLabel(evts[0].publishedAt),
      events: evts,
    }));
  }, [events]);

  // Unique themes in current results (for filter chips)
  const activeThemes = useMemo(() => {
    const ids = new Set(events.map((e) => e.themeId));
    return THEME_MAP.filter((t) => ids.has(t.id));
  }, [events]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Policy Pulse</h1>
          <p className="mt-1 text-xs text-[#666]">
            Government and policy news mapped to your scanner universe
          </p>
        </div>

        {/* Time Range Tabs */}
        <div className="flex gap-1 rounded-lg border border-[#333] bg-[#111] p-1">
          {([7, 14, 30] as TimeRange[]).map((d) => (
            <button
              key={d}
              onClick={() => setTimeRange(d)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                timeRange === d
                  ? "bg-[#222] text-white"
                  : "text-[#888] hover:text-white"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Theme Filter Chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelectedTheme(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
            selectedTheme === null
              ? "bg-[#5ba3e6]/10 border-[#5ba3e6]/40 text-[#5ba3e6]"
              : "bg-[#111] border-[#333] text-[#888] hover:text-white"
          }`}
        >
          All
        </button>
        {(activeThemes.length > 0 ? activeThemes : THEME_MAP).map((theme) => (
          <button
            key={theme.id}
            onClick={() =>
              setSelectedTheme(selectedTheme === theme.id ? null : theme.id)
            }
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
              selectedTheme === theme.id
                ? "bg-[#5ba3e6]/10 border-[#5ba3e6]/40 text-[#5ba3e6]"
                : "bg-[#111] border-[#333] text-[#888] hover:text-white"
            }`}
          >
            {theme.label}
          </button>
        ))}
      </div>

      {/* Impact Slider */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[#666]">Min Impact:</span>
        <input
          type="range"
          min={0}
          max={90}
          step={10}
          value={minImpact}
          onChange={(e) => setMinImpact(parseInt(e.target.value, 10))}
          className="w-32 accent-[#5ba3e6]"
        />
        <span className="text-xs text-white font-mono w-6">{minImpact}</span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5ba3e6]" />
          <p className="mt-4 text-[#888]">Loading policy events...</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center">
          <p className="text-red-400">Error: {error}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && events.length === 0 && (
        <div className="rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-8 text-center">
          <p className="text-[#888]">No policy events found for the selected filters.</p>
          <p className="mt-2 text-xs text-[#555]">
            Try increasing the time range or lowering the impact threshold.
          </p>
        </div>
      )}

      {/* Timeline */}
      {!loading && !error && grouped.map((group, gi) => (
        <div key={gi}>
          {/* Date separator */}
          <div className="flex items-center gap-3 py-2">
            <div className="h-2 w-2 rounded-full bg-[#5ba3e6]" />
            <span className="text-sm font-semibold text-[#ccc]">
              {group.label}
            </span>
            <div className="flex-1 h-px bg-[#222]" />
          </div>

          {/* Events */}
          <div className="space-y-3 pl-4">
            {group.events.map((event) => {
              const badge = impactBadge(event.impactScore);
              return (
                <div
                  key={event.id}
                  className={`rounded-xl border ${badge.border} ${badge.bg} p-4 space-y-2`}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${badge.color} ${badge.bg} border ${badge.border}`}
                      >
                        {event.impactScore}
                      </span>
                      <h3 className="text-sm font-medium text-white truncate">
                        {event.headline}
                      </h3>
                    </div>
                    {event.sourceUrl && (
                      <a
                        href={event.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-[#666] hover:text-white"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#888]">
                    <span className="rounded-full border border-[#333] bg-[#111] px-2 py-0.5 text-[10px] font-medium text-[#ccc]">
                      {event.themeName}
                    </span>
                    <span>{sourceLabel(event.source)}</span>
                    <span>{relativeTime(event.publishedAt)}</span>
                  </div>

                  {/* Summary */}
                  {event.summary && (
                    <p className="text-xs text-[#999] leading-relaxed line-clamp-2">
                      {event.summary}
                    </p>
                  )}

                  {/* Tickers with cross-ref */}
                  <div className="flex flex-wrap gap-1.5">
                    {event.scannerData.slice(0, 8).map((ref) => {
                      const hasData = ref.qfeRating || ref.prerunVerdict;
                      const score = ref.qfeScore ?? ref.prerunScore;
                      const label = ref.qfeRating ?? ref.prerunVerdict;
                      return (
                        <span
                          key={ref.ticker}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            hasData
                              ? "border-[#5ba3e6]/30 bg-[#5ba3e6]/5 text-[#5ba3e6]"
                              : "border-[#333] bg-[#111] text-[#888]"
                          }`}
                        >
                          {ref.ticker}
                          {hasData && (
                            <span className="text-[#ccc]">
                              ({label} {score})
                            </span>
                          )}
                        </span>
                      );
                    })}
                    {event.scannerData.length > 8 && (
                      <span className="text-[10px] text-[#666]">
                        +{event.scannerData.length - 8} more
                      </span>
                    )}
                  </div>

                  {/* ETFs */}
                  {event.impactedEtfs.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[#555]">ETFs:</span>
                      {event.impactedEtfs.map((etf) => (
                        <span
                          key={etf}
                          className="rounded-full border border-[#333] bg-[#111] px-2 py-0.5 text-[10px] text-[#888]"
                        >
                          {etf}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Footer link */}
      {!loading && events.length > 0 && (
        <p className="text-center text-xs text-[#555] pt-4">
          Showing {events.length} event{events.length !== 1 ? "s" : ""} over {timeRange} days.
          Scanner cross-references update daily.
        </p>
      )}
    </div>
  );
}
