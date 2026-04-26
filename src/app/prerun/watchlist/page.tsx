"use client";

import { Fragment, Suspense, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Save,
  RefreshCw,
  Bell,
  Check,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type {
  PreRunWatchlistItem,
  PreRunAlert,
  PreRunVerdict,
  PreRunRisk,
  PreRunScores,
  PreRunGates,
  PreRunResult,
} from "@/lib/prerun/types";
import {
  loadPreRunWatchlist,
  updatePreRunWatchlistItem,
  removeFromPreRunWatchlist,
  seedWatchlistIfEmpty,
  loadPreRunAlerts,
  markAlertRead,
} from "@/lib/prerun/storage";

// ── Score labels ──

const SCORE_LABELS: Record<string, string> = {
  scoreA: "A: Dead Money Base",
  scoreB: "B: Short Interest",
  scoreC: "C: Narrative Catalyst",
  scoreD: "D: Earnings Inflection",
  scoreE: "E: Institutional Under-Own",
  scoreF: "F: Volume Accumulation",
  scoreG: "G: Index Inclusion",
};

const VERDICT_BORDER: Record<PreRunVerdict, string> = {
  PRIORITY: "border-l-4 border-purple-500",
  KEEP: "border-l-4 border-green-500",
  WATCH: "border-l-4 border-yellow-500",
  DISCARD: "border-l-4 border-[#2a2a2a]",
};

const VERDICT_BADGE: Record<PreRunVerdict, string> = {
  PRIORITY: "bg-purple-500/20 text-purple-400",
  KEEP: "bg-green-500/20 text-green-400",
  WATCH: "bg-yellow-500/20 text-yellow-400",
  DISCARD: "bg-[#2a2a2a] text-[#666]",
};

const RISK_COLORS: Record<PreRunRisk, string> = {
  LOW: "text-green-400",
  MEDIUM: "text-yellow-400",
  HIGH: "text-orange-400",
  VERY_HIGH: "text-red-400",
};

const ALERT_TYPE_COLORS: Record<string, string> = {
  stop_loss: "border-l-4 border-red-500 bg-red-500/5",
  earnings: "border-l-4 border-yellow-500 bg-yellow-500/5",
  new_candidate: "border-l-4 border-green-500 bg-green-500/5",
  tv_webhook: "border-l-4 border-blue-500 bg-blue-500/5",
};

function scoreDot(value: number): string {
  if (value >= 2) return "bg-green-500";
  if (value >= 1) return "bg-yellow-500";
  return "bg-red-500";
}

// ── Editable row state ──

interface EditState {
  gate2Pass: boolean;
  scoreC: number;
  scoreG: number;
  stopLoss: number;
  riskLevel: PreRunRisk;
  notes: string;
}

// ── Main content component ──

function WatchlistContent() {
  const [items, setItems] = useState<PreRunWatchlistItem[]>([]);
  const [alerts, setAlerts] = useState<PreRunAlert[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editStates, setEditStates] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState("");

  // Load watchlist and alerts on mount
  useEffect(() => {
    seedWatchlistIfEmpty();
    setItems(loadPreRunWatchlist());
    setAlerts(loadPreRunAlerts());
  }, []);

  const reload = useCallback(() => {
    setItems(loadPreRunWatchlist());
    setAlerts(loadPreRunAlerts());
  }, []);

  // Initialize edit state when expanding a row
  const initEditState = useCallback((item: PreRunWatchlistItem): EditState => {
    return {
      gate2Pass: item.gate2Pass,
      scoreC: item.scoreC,
      scoreG: item.scoreG,
      stopLoss: item.stopLoss,
      riskLevel: item.riskLevel,
      notes: item.notes,
    };
  }, []);

  const toggleExpand = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
          // Initialize edit state if not already present
          const item = items.find((i) => i.id === id);
          if (item) {
            setEditStates((es) => ({
              ...es,
              [id]: es[id] ?? initEditState(item),
            }));
          }
        }
        return next;
      });
    },
    [items, initEditState]
  );

  const updateEdit = useCallback(
    (id: string, patch: Partial<EditState>) => {
      setEditStates((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...patch },
      }));
    },
    []
  );

  const handleSave = useCallback(
    (id: string) => {
      const es = editStates[id];
      if (!es) return;
      setSaving((prev) => new Set(prev).add(id));
      updatePreRunWatchlistItem(id, {
        gate2Pass: es.gate2Pass,
        scoreC: es.scoreC,
        scoreG: es.scoreG,
        stopLoss: es.stopLoss,
        riskLevel: es.riskLevel,
        notes: es.notes,
      });
      reload();
      setTimeout(() => {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 600);
    },
    [editStates, reload]
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (!confirm("Remove this stock from the watchlist?")) return;
      removeFromPreRunWatchlist(id);
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      reload();
    },
    [reload]
  );

  const handleMarkAlertRead = useCallback(
    (alertId: string) => {
      markAlertRead(alertId);
      reload();
    },
    [reload]
  );

  // Refresh prices for all watchlist tickers
  const handleRefreshPrices = useCallback(async () => {
    setRefreshing(true);
    setRefreshProgress("Starting...");

    const tickers = items.map((i) => i.ticker);
    let completed = 0;

    for (const ticker of tickers) {
      setRefreshProgress(`Fetching ${ticker} (${completed + 1}/${tickers.length})`);
      try {
        const res = await fetch(`/api/prerun/stock?ticker=${encodeURIComponent(ticker)}`);
        if (res.ok) {
          const result: PreRunResult = await res.json();
          // Update the item's latest data in the watchlist items state
          setItems((prev) =>
            prev.map((it) =>
              it.ticker === ticker
                ? {
                    ...it,
                    latestData: result.data,
                    latestScores: result.scores,
                    latestGates: result.gates,
                  }
                : it
            )
          );
        }
      } catch {
        // Skip failures silently
      }
      completed++;
      // Small delay between requests to avoid rate limiting
      if (completed < tickers.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setRefreshProgress("");
    setRefreshing(false);
  }, [items]);

  // Helpers
  const daysToEarnings = (item: PreRunWatchlistItem): number | null => {
    return item.latestData?.daysToEarnings ?? null;
  };

  const isPriceNearStop = (item: PreRunWatchlistItem): boolean => {
    const price = item.latestData?.currentPrice;
    if (!price || !item.stopLoss || item.stopLoss === 0) return false;
    return price <= item.stopLoss * 1.05;
  };

  const earningsUrgent = (item: PreRunWatchlistItem): boolean => {
    const d = daysToEarnings(item);
    return d !== null && d <= 7 && d >= 0;
  };

  const unreadAlerts = alerts.filter((a) => !a.isRead);

  return (
    <div className="min-h-screen bg-[#0f0f0f] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Pre-Run Watchlist</h1>
            <p className="text-sm text-[#a0a0a0]">
              {items.length} stock{items.length !== 1 ? "s" : ""} tracked
              {unreadAlerts.length > 0 && (
                <span className="ml-2 text-yellow-400">
                  ({unreadAlerts.length} unread alert{unreadAlerts.length !== 1 ? "s" : ""})
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing || items.length === 0}
              className="flex items-center gap-1.5 rounded-md bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a6dba] disabled:opacity-50"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh Prices
            </button>
            <Link
              href="/prerun"
              className="rounded-md border border-[#2a2a2a] px-4 py-2 text-sm text-[#a0a0a0] transition-colors hover:border-[#444] hover:text-white"
            >
              Scanner
            </Link>
          </div>
        </div>

        {/* Refresh progress */}
        {refreshing && refreshProgress && (
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2">
            <p className="text-xs text-[#a0a0a0]">{refreshProgress}</p>
          </div>
        )}

        {/* Watchlist Table */}
        {items.length === 0 ? (
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-12 text-center">
            <p className="text-sm text-[#a0a0a0]">
              No stocks in watchlist. Add candidates from the Pre-Run scanner.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] bg-[#0f0f0f]">
                  <th className="w-8 px-2 py-3"></th>
                  <th className="px-3 py-3 font-medium text-[#666]">Ticker</th>
                  <th className="px-3 py-3 font-medium text-[#666]">Company</th>
                  <th className="px-3 py-3 font-medium text-[#666] text-right">Price</th>
                  <th className="px-3 py-3 font-medium text-[#666] text-right">% ATH</th>
                  <th className="px-3 py-3 font-medium text-[#666] text-right">Short%</th>
                  <th className="px-3 py-3 font-medium text-[#666] text-right">Earnings</th>
                  <th className="px-3 py-3 font-medium text-[#666] text-right">Score</th>
                  <th className="px-3 py-3 font-medium text-[#666]">Verdict</th>
                  <th className="px-3 py-3 font-medium text-[#666] text-right">Stop Loss</th>
                  <th className="px-3 py-3 font-medium text-[#666]">Risk</th>
                  <th className="px-3 py-3 font-medium text-[#666]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {items.map((item) => {
                  const isExpanded = expanded.has(item.id);
                  const es = editStates[item.id];
                  const price = item.latestData?.currentPrice ?? null;
                  const pctAth = item.latestData?.pctFromAth ?? null;
                  const shortPct = item.latestData?.shortFloat ?? null;
                  const daysEarn = daysToEarnings(item);
                  const score = item.latestScores?.finalScore ?? null;
                  const nearStop = isPriceNearStop(item);
                  const urgentEarnings = earningsUrgent(item);
                  const isSaving = saving.has(item.id);

                  return (
                    <Fragment key={item.id}>
                      {/* Main row */}
                      <tr
                        className={`cursor-pointer transition-colors hover:bg-[#262626] ${VERDICT_BORDER[item.verdict]}`}
                        onClick={() => toggleExpand(item.id)}
                      >
                        <td className="px-2 py-3 text-center">
                          {isExpanded ? (
                            <ChevronDown className="mx-auto h-4 w-4 text-[#666]" />
                          ) : (
                            <ChevronRight className="mx-auto h-4 w-4 text-[#666]" />
                          )}
                        </td>
                        <td className="px-3 py-3 font-medium text-white">
                          {item.ticker}
                        </td>
                        <td className="px-3 py-3 text-[#a0a0a0] max-w-[180px] truncate">
                          {item.companyName}
                        </td>
                        <td className={`px-3 py-3 text-right font-mono ${nearStop ? "text-red-400 font-semibold" : "text-[#a0a0a0]"}`}>
                          {price !== null ? `$${price.toFixed(2)}` : "--"}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[#a0a0a0]">
                          {pctAth !== null ? `${pctAth.toFixed(0)}%` : "--"}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[#a0a0a0]">
                          {shortPct !== null ? `${shortPct.toFixed(1)}%` : "--"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {daysEarn !== null ? (
                            <span
                              className={`inline-flex items-center gap-1 font-mono ${
                                urgentEarnings
                                  ? "text-red-400 animate-pulse font-semibold"
                                  : "text-[#a0a0a0]"
                              }`}
                            >
                              {urgentEarnings && <AlertTriangle className="h-3 w-3" />}
                              {daysEarn}d
                            </span>
                          ) : (
                            <span className="text-[#666]">--</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[#a0a0a0]">
                          {score !== null ? score : "--"}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${VERDICT_BADGE[item.verdict]}`}
                          >
                            {item.verdict}
                          </span>
                        </td>
                        <td className={`px-3 py-3 text-right font-mono ${nearStop ? "text-red-400 font-semibold" : "text-[#a0a0a0]"}`}>
                          {item.stopLoss > 0 ? `$${item.stopLoss.toFixed(2)}` : "--"}
                        </td>
                        <td className={`px-3 py-3 text-xs font-medium ${RISK_COLORS[item.riskLevel]}`}>
                          {item.riskLevel}
                        </td>
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="rounded p-1 text-[#666] transition-colors hover:text-red-400"
                            title="Remove from watchlist"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && es && (
                        <tr className={VERDICT_BORDER[item.verdict]}>
                          <td colSpan={12} className="bg-[#141414] px-6 py-4">
                            <div className="grid gap-6 lg:grid-cols-2">
                              {/* Left column: Scores + Gates */}
                              <div className="space-y-4">
                                {/* Score breakdown */}
                                <div>
                                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#666]">
                                    Score Breakdown
                                  </h4>
                                  <div className="space-y-1.5">
                                    {item.latestScores &&
                                      (
                                        Object.keys(SCORE_LABELS) as Array<
                                          keyof typeof SCORE_LABELS
                                        >
                                      ).map((key) => {
                                        const val =
                                          item.latestScores?.[
                                            key as keyof PreRunScores
                                          ] as number;
                                        return (
                                          <div
                                            key={key}
                                            className="flex items-center gap-2 text-xs"
                                          >
                                            <span
                                              className={`inline-block h-2.5 w-2.5 rounded-full ${scoreDot(val)}`}
                                            />
                                            <span className="w-48 text-[#a0a0a0]">
                                              {SCORE_LABELS[key]}
                                            </span>
                                            <span className="font-mono text-white">
                                              {val}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    {!item.latestScores && (
                                      <p className="text-xs text-[#666]">
                                        No score data. Click &quot;Refresh Prices&quot; to fetch.
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Gate status */}
                                <div>
                                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#666]">
                                    Gate Status
                                  </h4>
                                  <div className="flex items-center gap-4 text-xs">
                                    {(["gate1", "gate2", "gate3"] as const).map(
                                      (g, idx) => {
                                        const pass = item.latestGates
                                          ? item.latestGates[g]
                                          : g === "gate2"
                                            ? item.gate2Pass
                                            : null;
                                        return (
                                          <div
                                            key={g}
                                            className="flex items-center gap-1"
                                          >
                                            <span className="text-[#a0a0a0]">
                                              G{idx + 1}
                                            </span>
                                            {pass === null ? (
                                              <span className="text-[#666]">?</span>
                                            ) : pass ? (
                                              <span className="text-green-400">
                                                &#10003;
                                              </span>
                                            ) : (
                                              <span className="text-red-400">
                                                &#10007;
                                              </span>
                                            )}
                                          </div>
                                        );
                                      }
                                    )}
                                  </div>
                                </div>

                                {/* Thesis */}
                                <div>
                                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#666]">
                                    Thesis
                                  </h4>
                                  <p className="text-xs leading-relaxed text-[#a0a0a0]">
                                    {item.thesis || "No thesis provided."}
                                  </p>
                                </div>

                                {/* Catalyst */}
                                <div>
                                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#666]">
                                    Catalyst
                                  </h4>
                                  <p className="text-xs leading-relaxed text-[#a0a0a0]">
                                    {item.catalystDescription ||
                                      "No catalyst description."}
                                  </p>
                                </div>
                              </div>

                              {/* Right column: Manual inputs */}
                              <div className="space-y-4">
                                {/* Gate 2 toggle */}
                                <div className="flex items-center gap-3">
                                  <label className="text-xs text-[#a0a0a0]">
                                    Gate 2 (No existential risk):
                                  </label>
                                  <input
                                    type="checkbox"
                                    checked={es.gate2Pass}
                                    onChange={(e) =>
                                      updateEdit(item.id, {
                                        gate2Pass: e.target.checked,
                                      })
                                    }
                                    className="h-4 w-4 rounded border-[#2a2a2a] bg-[#1a1a1a] accent-[#185FA5]"
                                  />
                                  <span
                                    className={`text-xs font-medium ${es.gate2Pass ? "text-green-400" : "text-red-400"}`}
                                  >
                                    {es.gate2Pass ? "PASS" : "FAIL"}
                                  </span>
                                </div>

                                {/* C score slider */}
                                <div>
                                  <label className="mb-1 block text-xs text-[#a0a0a0]">
                                    C Score (Narrative Catalyst):{" "}
                                    <span className="font-mono text-white">
                                      {es.scoreC}
                                    </span>
                                  </label>
                                  <input
                                    type="range"
                                    min={0}
                                    max={2}
                                    step={1}
                                    value={es.scoreC}
                                    onChange={(e) =>
                                      updateEdit(item.id, {
                                        scoreC: Number(e.target.value),
                                      })
                                    }
                                    className="w-full accent-[#185FA5]"
                                  />
                                  <div className="flex justify-between text-[10px] text-[#666]">
                                    <span>0</span>
                                    <span>1</span>
                                    <span>2</span>
                                  </div>
                                </div>

                                {/* G score slider */}
                                <div>
                                  <label className="mb-1 block text-xs text-[#a0a0a0]">
                                    G Score (Index Inclusion):{" "}
                                    <span className="font-mono text-white">
                                      {es.scoreG}
                                    </span>
                                  </label>
                                  <input
                                    type="range"
                                    min={0}
                                    max={2}
                                    step={1}
                                    value={es.scoreG}
                                    onChange={(e) =>
                                      updateEdit(item.id, {
                                        scoreG: Number(e.target.value),
                                      })
                                    }
                                    className="w-full accent-[#185FA5]"
                                  />
                                  <div className="flex justify-between text-[10px] text-[#666]">
                                    <span>0</span>
                                    <span>1</span>
                                    <span>2</span>
                                  </div>
                                </div>

                                {/* Stop loss */}
                                <div>
                                  <label className="mb-1 block text-xs text-[#a0a0a0]">
                                    Stop Loss ($)
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    value={es.stopLoss || ""}
                                    onChange={(e) =>
                                      updateEdit(item.id, {
                                        stopLoss: Number(e.target.value) || 0,
                                      })
                                    }
                                    placeholder="0.00"
                                    className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs font-mono text-white placeholder-[#555]"
                                  />
                                </div>

                                {/* Risk level */}
                                <div>
                                  <label className="mb-1 block text-xs text-[#a0a0a0]">
                                    Risk Level
                                  </label>
                                  <select
                                    value={es.riskLevel}
                                    onChange={(e) =>
                                      updateEdit(item.id, {
                                        riskLevel: e.target.value as PreRunRisk,
                                      })
                                    }
                                    className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white"
                                  >
                                    <option value="LOW">LOW</option>
                                    <option value="MEDIUM">MEDIUM</option>
                                    <option value="HIGH">HIGH</option>
                                    <option value="VERY_HIGH">VERY_HIGH</option>
                                  </select>
                                </div>

                                {/* Notes */}
                                <div>
                                  <label className="mb-1 block text-xs text-[#a0a0a0]">
                                    Notes
                                  </label>
                                  <textarea
                                    value={es.notes}
                                    onChange={(e) =>
                                      updateEdit(item.id, {
                                        notes: e.target.value,
                                      })
                                    }
                                    rows={3}
                                    placeholder="Additional notes..."
                                    className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white placeholder-[#555] resize-none"
                                  />
                                </div>

                                {/* Action buttons */}
                                <div className="flex items-center gap-2 pt-1">
                                  <button
                                    onClick={() => handleSave(item.id)}
                                    disabled={isSaving}
                                    className="flex items-center gap-1.5 rounded-md bg-[#185FA5] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#1a6dba] disabled:opacity-50"
                                  >
                                    {isSaving ? (
                                      <Check className="h-3.5 w-3.5 text-green-400" />
                                    ) : (
                                      <Save className="h-3.5 w-3.5" />
                                    )}
                                    {isSaving ? "Saved" : "Save"}
                                  </button>
                                  <button
                                    onClick={() => handleDelete(item.id)}
                                    className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-4 py-1.5 text-xs text-[#a0a0a0] transition-colors hover:border-red-500/50 hover:text-red-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Alerts Panel */}
        {alerts.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#5ba3e6]" />
              <h2 className="text-sm font-semibold text-white">Alerts</h2>
              {unreadAlerts.length > 0 && (
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                  {unreadAlerts.length} unread
                </span>
              )}
            </div>
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-start justify-between rounded-lg p-3 ${
                    ALERT_TYPE_COLORS[alert.alertType] ?? "border-l-4 border-[#2a2a2a] bg-[#1a1a1a]"
                  } ${alert.isRead ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">
                        {alert.ticker}
                      </span>
                      <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 text-[10px] text-[#a0a0a0]">
                        {alert.alertType.replace("_", " ")}
                      </span>
                      <span className="text-[10px] text-[#666]">
                        {new Date(alert.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#a0a0a0]">{alert.message}</p>
                    {alert.price !== null && (
                      <p className="mt-0.5 text-[10px] text-[#666]">
                        Price: ${alert.price.toFixed(2)}
                        {alert.stopLoss !== null &&
                          ` | Stop: $${alert.stopLoss.toFixed(2)}`}
                      </p>
                    )}
                  </div>
                  {!alert.isRead && (
                    <button
                      onClick={() => handleMarkAlertRead(alert.id)}
                      className="ml-2 flex-shrink-0 rounded p-1 text-[#666] transition-colors hover:text-green-400"
                      title="Mark as read"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PreRunWatchlistPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f]">
          <Loader2 className="h-6 w-6 animate-spin text-[#5ba3e6]" />
        </div>
      }
    >
      <WatchlistContent />
    </Suspense>
  );
}
