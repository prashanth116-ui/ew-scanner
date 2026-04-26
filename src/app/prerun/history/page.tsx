"use client";

import { useState, useEffect, Suspense } from "react";
import { Clock, ArrowUpDown, Check, Search } from "lucide-react";
import Link from "next/link";
import {
  loadPreRunHistory,
  loadScanResults,
} from "@/lib/prerun/storage";
import type { PreRunHistoryEntry, PreRunResult } from "@/lib/prerun/types";

function verdictColor(v: string): string {
  switch (v) {
    case "PRIORITY":
      return "bg-purple-500/20 text-purple-400";
    case "KEEP":
      return "bg-green-500/20 text-green-400";
    case "WATCH":
      return "bg-yellow-500/20 text-yellow-400";
    default:
      return "bg-red-500/20 text-red-400";
  }
}

function changeIcon(type: string): string {
  switch (type) {
    case "added":
      return "+";
    case "removed":
      return "−";
    case "verdict_change":
      return "↔";
    case "score_update":
      return "↑";
    case "price_update":
      return "$";
    default:
      return "•";
  }
}

function changeColor(type: string): string {
  switch (type) {
    case "added":
      return "text-green-400 bg-green-500/10";
    case "removed":
      return "text-red-400 bg-red-500/10";
    case "verdict_change":
      return "text-yellow-400 bg-yellow-500/10";
    default:
      return "text-[#5ba3e6] bg-[#185FA5]/10";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistoryPage() {
  const [tab, setTab] = useState<"scans" | "changelog">("scans");
  const [scanResults, setScanResults] = useState<PreRunResult[]>([]);
  const [history, setHistory] = useState<PreRunHistoryEntry[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setScanResults(loadScanResults());
    setHistory(loadPreRunHistory());
  }, []);

  const filteredScans = search
    ? scanResults.filter(
        (r) =>
          r.data.ticker.toLowerCase().includes(search.toLowerCase()) ||
          r.data.companyName.toLowerCase().includes(search.toLowerCase())
      )
    : scanResults;

  const filteredHistory = search
    ? history.filter((h) =>
        h.ticker.toLowerCase().includes(search.toLowerCase())
      )
    : history;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pre-Run History</h1>
          <p className="mt-1 text-sm text-[#a0a0a0]">
            Scan results and watchlist change log
          </p>
        </div>
        <Link
          href="/prerun"
          className="rounded-md bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#185FA5]/80"
        >
          Back to Scanner
        </Link>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() => setTab("scans")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "scans"
              ? "bg-[#185FA5]/20 text-[#5ba3e6]"
              : "text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
          }`}
        >
          <Clock className="mr-1.5 inline-block h-4 w-4" />
          Scan Results ({scanResults.length})
        </button>
        <button
          onClick={() => setTab("changelog")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "changelog"
              ? "bg-[#185FA5]/20 text-[#5ba3e6]"
              : "text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
          }`}
        >
          <ArrowUpDown className="mr-1.5 inline-block h-4 w-4" />
          Change Log ({history.length})
        </button>

        {/* Search */}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#666]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by ticker..."
              className="rounded-md border border-[#2a2a2a] bg-[#1a1a1a] py-2 pl-9 pr-3 text-sm text-white placeholder-[#666] focus:border-[#5ba3e6] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Scan Results Tab */}
      {tab === "scans" && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] overflow-hidden">
          {filteredScans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#666]">
              <Clock className="mb-3 h-8 w-8" />
              <p className="text-sm">No scan results yet</p>
              <p className="mt-1 text-xs text-[#555]">
                Run a scan from the{" "}
                <Link href="/prerun" className="text-[#5ba3e6] hover:underline">
                  scanner page
                </Link>
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2a2a2a]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#a0a0a0]">
                      Ticker
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#a0a0a0]">
                      Company
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#a0a0a0]">
                      Price
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#a0a0a0]">
                      % ATH
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#a0a0a0]">
                      Short %
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#a0a0a0]">
                      Score
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#a0a0a0]">
                      Verdict
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScans.map((r) => (
                    <tr
                      key={r.data.ticker}
                      className="border-b border-[#2a2a2a]/50 hover:bg-[#1a1a1a] ew-row-in"
                    >
                      <td className="px-4 py-3 text-sm font-bold text-white">
                        {r.data.ticker}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#a0a0a0]">
                        {r.data.companyName}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-white">
                        {r.data.currentPrice
                          ? `$${r.data.currentPrice.toFixed(2)}`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-green-400">
                        {r.data.pctFromAth
                          ? `${r.data.pctFromAth.toFixed(1)}%`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-yellow-400">
                        {r.data.shortFloat
                          ? `${r.data.shortFloat.toFixed(1)}%`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-white">
                        {r.scores.finalScore}/14
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${verdictColor(r.verdict)}`}
                        >
                          {r.verdict}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Change Log Tab */}
      {tab === "changelog" && (
        <div className="space-y-2">
          {filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#141414] py-16 text-[#666]">
              <ArrowUpDown className="mb-3 h-8 w-8" />
              <p className="text-sm">No history entries yet</p>
            </div>
          ) : (
            filteredHistory.map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-4 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3 ew-row-in"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${changeColor(h.changeType)}`}
                >
                  {changeIcon(h.changeType)}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      {h.ticker}
                    </span>
                    <span className="text-xs text-[#a0a0a0]">
                      {h.changeType.replace("_", " ")}
                    </span>
                  </div>
                  {(h.fromValue || h.toValue) && (
                    <p className="mt-0.5 text-xs text-[#666]">
                      {h.fromValue && (
                        <span className="text-red-400/70">{h.fromValue}</span>
                      )}
                      {h.fromValue && h.toValue && " → "}
                      {h.toValue && (
                        <span className="text-green-400/70">{h.toValue}</span>
                      )}
                    </p>
                  )}
                  {h.notes && (
                    <p className="mt-0.5 text-xs text-[#555]">{h.notes}</p>
                  )}
                </div>
                <span className="text-xs text-[#555]">
                  {formatDate(h.changedAt)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function HistoryPageWrapper() {
  return (
    <Suspense fallback={null}>
      <HistoryPage />
    </Suspense>
  );
}
