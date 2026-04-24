"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  X,
  Pencil,
  Check,
  Bell,
} from "lucide-react";
import {
  loadSqueezeWatchlists,
  saveSqueezeWatchlist,
  deleteSqueezeWatchlist,
  renameSqueezeWatchlist,
  removeFromSqueezeWatchlist,
} from "@/lib/squeeze-watchlists";
import { computeSqueezeScore } from "@/lib/squeeze-scoring";
import type { SqueezeWatchlist, SqueezeWatchlistItem, SqueezeData, SqueezeTier } from "@/lib/ew-types";

const TIER_COLORS: Record<SqueezeTier, string> = {
  high: "text-red-400",
  medium: "text-yellow-400",
  low: "text-[#a0a0a0]",
};

const BATCH_SIZE = 10;
const BATCH_DELAY = 300;

interface QuickScanResult {
  ticker: string;
  name: string;
  oldScore: number;
  newScore: number;
  delta: number;
  newTier: SqueezeTier;
  oldSi: number;
  newSi: number;
}

export default function SqueezeWatchlistPage() {
  const [watchlists, setWatchlists] = useState<SqueezeWatchlist[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [scanning, setScanning] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState("");
  const [scanResults, setScanResults] = useState<Record<string, QuickScanResult[]>>({});
  const [alertingId, setAlertingId] = useState<string | null>(null);
  const [alertResult, setAlertResult] = useState<Record<string, { sent: boolean; triggered: number; error?: string }>>({});
  const scanAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setWatchlists(loadSqueezeWatchlists());
    return () => { scanAbortRef.current?.abort(); };
  }, []);

  const refresh = useCallback(() => setWatchlists(loadSqueezeWatchlists()), []);

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    saveSqueezeWatchlist(newName.trim());
    setNewName("");
    refresh();
  }, [newName, refresh]);

  const handleDelete = useCallback((id: string) => {
    deleteSqueezeWatchlist(id);
    refresh();
  }, [refresh]);

  const handleRename = useCallback((id: string) => {
    if (!editName.trim()) return;
    renameSqueezeWatchlist(id, editName.trim());
    setEditingId(null);
    refresh();
  }, [editName, refresh]);

  const handleRemoveItem = useCallback((wlId: string, ticker: string) => {
    removeFromSqueezeWatchlist(wlId, ticker);
    refresh();
  }, [refresh]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }, []);

  const runQuickScan = useCallback(async (wl: SqueezeWatchlist) => {
    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;
    const signal = controller.signal;

    setScanning(wl.id);
    setScanProgress("Fetching squeeze data...");

    const tickers = wl.items.map((i) => i.ticker);
    const results: QuickScanResult[] = [];

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      setScanProgress(`Fetching ${Math.min(i + BATCH_SIZE, tickers.length)}/${tickers.length}...`);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const res = await fetch(`/api/squeeze?ticker=${encodeURIComponent(ticker)}`, { signal });
          if (!res.ok) return null;
          const data = await res.json();
          if (data.error) return null;
          return data as SqueezeData;
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          const fresh = r.value;
          const scored = computeSqueezeScore(fresh);
          const item = wl.items.find((wi) => wi.ticker === fresh.ticker);
          if (!item) continue;

          const newSi = fresh.shortPercentOfFloat ?? 0;
          results.push({
            ticker: fresh.ticker,
            name: item.name,
            oldScore: item.scoreAtAdd,
            newScore: scored.squeezeScore,
            delta: scored.squeezeScore - item.scoreAtAdd,
            newTier: scored.tier,
            oldSi: item.siPercentAtAdd,
            newSi: newSi > 1 ? newSi : newSi * 100,
          });
        }
      }

      if (i + BATCH_SIZE < tickers.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    setScanResults((prev) => ({ ...prev, [wl.id]: results }));
    setScanProgress("");
    setScanning(null);
  }, []);

  const runCheckAlert = useCallback(async (wl: SqueezeWatchlist) => {
    setAlertingId(wl.id);
    try {
      const res = await fetch("/api/squeeze-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watchlist: wl,
          threshold: wl.scoreThreshold ?? 10,
        }),
      });
      const data = await res.json();
      setAlertResult((prev) => ({
        ...prev,
        [wl.id]: {
          sent: data.sent ?? false,
          triggered: data.triggered?.length ?? 0,
          error: data.error,
        },
      }));
    } catch (err) {
      setAlertResult((prev) => ({
        ...prev,
        [wl.id]: { sent: false, triggered: 0, error: String(err) },
      }));
    }
    setAlertingId(null);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Squeeze Watchlists</h1>
        <p className="text-sm text-[#a0a0a0]">Track squeeze candidates and monitor score changes over time</p>
      </div>

      {/* Create new */}
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="flex-1 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#555]"
          placeholder="New watchlist name..."
        />
        <button
          onClick={handleCreate}
          disabled={!newName.trim()}
          className="flex items-center gap-1.5 rounded-md bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a6dba] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Create
        </button>
      </div>

      {watchlists.length === 0 ? (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-12 text-center">
          <p className="text-sm text-[#a0a0a0]">
            No watchlists yet. Create one above, then add stocks from the Squeeze screener using the list icon on each row.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {watchlists.map((wl) => (
            <div key={wl.id} className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  onClick={() => toggleExpand(wl.id)}
                  className="flex items-center gap-2 text-left"
                >
                  {expanded.has(wl.id) ? (
                    <ChevronDown className="h-4 w-4 text-[#666]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[#666]" />
                  )}
                  {editingId === wl.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRename(wl.id)}
                        className="w-40 rounded border border-[#2a2a2a] bg-[#262626] px-2 py-0.5 text-sm text-white"
                        autoFocus
                      />
                      <button onClick={() => handleRename(wl.id)} className="p-0.5 text-green-400">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-0.5 text-[#666]">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="font-medium text-white">{wl.name}</span>
                  )}
                  <span className="text-xs text-[#666]">
                    {wl.items.length} stock{wl.items.length !== 1 ? "s" : ""}
                  </span>
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => runQuickScan(wl)}
                    disabled={scanning === wl.id || wl.items.length === 0}
                    className="flex items-center gap-1 rounded-md border border-[#2a2a2a] bg-[#262626] px-2.5 py-1 text-xs text-[#a0a0a0] hover:text-white disabled:opacity-50"
                  >
                    {scanning === wl.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Quick Scan
                  </button>
                  <button
                    onClick={() => runCheckAlert(wl)}
                    disabled={alertingId === wl.id || wl.items.length === 0}
                    className="flex items-center gap-1 rounded-md border border-[#2a2a2a] bg-[#262626] px-2.5 py-1 text-xs text-[#a0a0a0] hover:text-white disabled:opacity-50"
                    title="Check scores and send Telegram alert if delta > threshold"
                  >
                    {alertingId === wl.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Bell className="h-3 w-3" />
                    )}
                    Check &amp; Alert
                  </button>
                  <button
                    onClick={() => { setEditingId(wl.id); setEditName(wl.name); }}
                    className="rounded p-1 text-[#666] hover:text-white"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(wl.id)}
                    className="rounded p-1 text-[#666] hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {scanning === wl.id && scanProgress && (
                <div className="border-t border-[#2a2a2a] px-4 py-2">
                  <p className="text-xs text-[#a0a0a0]">{scanProgress}</p>
                </div>
              )}

              {/* Expanded items */}
              {expanded.has(wl.id) && wl.items.length > 0 && (
                <div className="border-t border-[#2a2a2a]">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#2a2a2a] bg-[#0f0f0f]">
                        <th className="px-4 py-2 font-medium text-[#666]">Ticker</th>
                        <th className="px-4 py-2 font-medium text-[#666]">Name</th>
                        <th className="px-4 py-2 font-medium text-[#666]">SI% at Add</th>
                        <th className="px-4 py-2 font-medium text-[#666]">Score at Add</th>
                        <th className="px-4 py-2 font-medium text-[#666]">Tier</th>
                        <th className="px-4 py-2 font-medium text-[#666]">Added</th>
                        <th className="px-4 py-2 font-medium text-[#666]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a2a2a]">
                      {wl.items.map((item) => (
                        <tr key={item.ticker} className="hover:bg-[#262626]">
                          <td className="px-4 py-2 font-medium text-white">{item.ticker}</td>
                          <td className="px-4 py-2 text-[#a0a0a0]">{item.name}</td>
                          <td className="px-4 py-2 font-mono text-[#a0a0a0]">
                            {item.siPercentAtAdd.toFixed(1)}%
                          </td>
                          <td className="px-4 py-2 font-mono text-[#a0a0a0]">
                            {item.scoreAtAdd}
                          </td>
                          <td className={`px-4 py-2 ${TIER_COLORS[item.tierAtAdd]}`}>
                            {item.tierAtAdd}
                          </td>
                          <td className="px-4 py-2 text-[#666]">
                            {new Date(item.addedAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => handleRemoveItem(wl.id, item.ticker)}
                              className="rounded p-1 text-[#666] hover:text-red-400"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {expanded.has(wl.id) && wl.items.length === 0 && (
                <div className="border-t border-[#2a2a2a] px-4 py-6 text-center text-xs text-[#555]">
                  Empty watchlist. Add stocks from the Squeeze screener.
                </div>
              )}

              {/* Quick scan results */}
              {scanResults[wl.id] && (
                <div className="border-t border-[#2a2a2a] px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-medium text-[#a0a0a0]">Quick Scan Results</h4>
                    <button
                      onClick={() => setScanResults((prev) => { const n = { ...prev }; delete n[wl.id]; return n; })}
                      className="p-0.5 text-[#666] hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {scanResults[wl.id].map((r) => (
                      <div key={r.ticker} className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-[#262626]">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{r.ticker}</span>
                          <span className="text-[#666]">{r.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[#a0a0a0]">{r.oldScore}</span>
                          <span className="text-[#666]">&rarr;</span>
                          <span className="text-[#a0a0a0]">{r.newScore}</span>
                          <span className={`font-mono font-medium ${
                            r.delta > 0 ? "text-green-400" : r.delta < 0 ? "text-red-400" : "text-[#666]"
                          }`}>
                            {r.delta > 0 ? "+" : ""}{r.delta}
                          </span>
                          <span className={TIER_COLORS[r.newTier]}>
                            {r.newTier}
                          </span>
                          <span className="text-[#555]">
                            SI: {r.newSi.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Alert result */}
              {alertResult[wl.id] && (
                <div className="border-t border-[#2a2a2a] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs">
                      {alertResult[wl.id].sent ? (
                        <span className="text-green-400">
                          Alert sent ({alertResult[wl.id].triggered} ticker{alertResult[wl.id].triggered !== 1 ? "s" : ""} triggered)
                        </span>
                      ) : alertResult[wl.id].triggered === 0 ? (
                        <span className="text-[#a0a0a0]">No tickers exceeded threshold</span>
                      ) : (
                        <span className="text-red-400">
                          Failed: {alertResult[wl.id].error ?? "Unknown error"}
                        </span>
                      )}
                    </p>
                    <button
                      onClick={() => setAlertResult((prev) => { const n = { ...prev }; delete n[wl.id]; return n; })}
                      className="p-0.5 text-[#666] hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
