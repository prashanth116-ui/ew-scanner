"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
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
  ArrowLeft,
  ArrowUpDown,
} from "lucide-react";
import {
  loadStratWatchlists,
  saveStratWatchlist,
  deleteStratWatchlist,
  renameStratWatchlist,
  removeFromStratWatchlist,
} from "@/lib/strat/watchlist";
import type {
  StratWatchlist,
  StratWatchlistItem,
  StratResult,
  StratSignal,
  TFCAlignment,
} from "@/lib/strat/types";

const BATCH_SIZE = 10;
const BATCH_DELAY = 2000;

function signalColor(signal: string): string {
  switch (signal) {
    case "ACTIONABLE": return "text-green-400 border-green-500/30 bg-green-500/10";
    case "SETTING_UP": return "text-amber-400 border-amber-500/30 bg-amber-500/10";
    case "NEUTRAL": return "text-[#888] border-[#333] bg-[#1a1a1a]";
    case "CONFLICTED": return "text-red-400 border-red-500/30 bg-red-500/10";
    default: return "text-[#888] border-[#333] bg-[#1a1a1a]";
  }
}

function directionColor(dir: string): string {
  switch (dir) {
    case "BULL": return "text-green-400";
    case "BEAR": return "text-red-400";
    default: return "text-amber-400";
  }
}

function tfcLabel(tfc: TFCAlignment): string {
  switch (tfc) {
    case "FULL_BULL": return "Bull";
    case "FULL_BEAR": return "Bear";
    default: return "Mixed";
  }
}

function tfcColor(tfc: TFCAlignment): string {
  switch (tfc) {
    case "FULL_BULL": return "text-green-400";
    case "FULL_BEAR": return "text-red-400";
    default: return "text-[#888]";
  }
}

type SortKey = "ticker" | "score" | "signal" | "date";

interface QuickScanResult {
  ticker: string;
  name: string;
  oldScore: number;
  newScore: number;
  delta: number;
  newSignal: StratSignal;
  newTfc: TFCAlignment;
  newDirection: "LONG" | "SHORT" | "BOTH" | null;
}

export default function StratWatchlistPage() {
  const [watchlists, setWatchlists] = useState<StratWatchlist[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [scanning, setScanning] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState("");
  const [scanResults, setScanResults] = useState<Record<string, QuickScanResult[]>>({});
  const [sortKeys, setSortKeys] = useState<Record<string, SortKey>>({});
  const [sortDirs, setSortDirs] = useState<Record<string, "asc" | "desc">>({});
  const scanAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setWatchlists(loadStratWatchlists());
    return () => { scanAbortRef.current?.abort(); scanAbortRef.current = null; };
  }, []);

  const refresh = useCallback(() => setWatchlists(loadStratWatchlists()), []);

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    saveStratWatchlist(newName.trim());
    setNewName("");
    refresh();
  }, [newName, refresh]);

  const handleDelete = useCallback((id: string) => {
    if (!confirm("Delete this watchlist and all its items?")) return;
    deleteStratWatchlist(id);
    refresh();
  }, [refresh]);

  const handleRename = useCallback((id: string) => {
    if (!editName.trim()) return;
    renameStratWatchlist(id, editName.trim());
    setEditingId(null);
    refresh();
  }, [editName, refresh]);

  const handleRemoveItem = useCallback((wlId: string, ticker: string) => {
    removeFromStratWatchlist(wlId, ticker);
    refresh();
  }, [refresh]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }, []);

  const toggleSort = useCallback((wlId: string, key: SortKey) => {
    setSortKeys((prev) => {
      if (prev[wlId] === key) {
        setSortDirs((d) => ({ ...d, [wlId]: d[wlId] === "desc" ? "asc" : "desc" }));
        return prev;
      }
      setSortDirs((d) => ({ ...d, [wlId]: "desc" }));
      return { ...prev, [wlId]: key };
    });
  }, []);

  const sortItems = useCallback((items: StratWatchlistItem[], wlId: string): StratWatchlistItem[] => {
    const key = sortKeys[wlId] ?? "date";
    const dir = sortDirs[wlId] ?? "desc";
    const arr = [...items];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (key) {
        case "ticker": cmp = a.ticker.localeCompare(b.ticker); break;
        case "score": cmp = a.scoreAtAdd - b.scoreAtAdd; break;
        case "signal": cmp = a.signalAtAdd.localeCompare(b.signalAtAdd); break;
        case "date": cmp = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime(); break;
      }
      return dir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [sortKeys, sortDirs]);

  const runQuickScan = useCallback(async (wl: StratWatchlist) => {
    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;
    const signal = controller.signal;

    setScanning(wl.id);
    setScanProgress("Fetching strat data...");
    setScanResults((prev) => { const n = { ...prev }; delete n[wl.id]; return n; });

    const tickers = wl.items.map((i) => i.ticker);
    const results: QuickScanResult[] = [];

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      if (signal.aborted) break;
      const batch = tickers.slice(i, i + BATCH_SIZE);
      setScanProgress(`Fetching ${Math.min(i + BATCH_SIZE, tickers.length)}/${tickers.length}...`);

      try {
        const res = await fetch("/api/strat/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickers: batch }),
          signal,
        });

        if (res.ok) {
          const data = (await res.json()) as { results: StratResult[] };
          if (data.results) {
            for (const fresh of data.results) {
              const item = wl.items.find((wi) => wi.ticker === fresh.ticker);
              if (!item) continue;
              results.push({
                ticker: fresh.ticker,
                name: item.name,
                oldScore: item.scoreAtAdd,
                newScore: fresh.scores.totalScore,
                delta: fresh.scores.totalScore - item.scoreAtAdd,
                newSignal: fresh.signal,
                newTfc: fresh.tfc.alignment,
                newDirection: fresh.actionDirection,
              });
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") break;
      }

      if (i + BATCH_SIZE < tickers.length && !signal.aborted) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    setScanResults((prev) => ({ ...prev, [wl.id]: results }));
    setScanProgress("");
    setScanning(null);
  }, []);

  return (
    <div className="space-y-6 px-4 sm:px-6 py-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Strat Watchlists</h1>
          <p className="text-sm text-[#a0a0a0]">Track Strat setups and monitor score changes over time</p>
        </div>
        <Link
          href="/strat"
          className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#a0a0a0] transition-colors hover:text-white hover:border-[#444]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Scanner
        </Link>
      </div>

      {/* Create new */}
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="flex-1 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#555] focus:border-[#f97316] focus:outline-none"
          placeholder="New watchlist name..."
        />
        <button
          onClick={handleCreate}
          disabled={!newName.trim()}
          className="flex items-center gap-1.5 rounded-md bg-[#f97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#ea6c08] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Create
        </button>
      </div>

      {watchlists.length === 0 ? (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-12 text-center">
          <p className="text-sm text-[#a0a0a0]">
            No watchlists yet. Create one above, then add stocks from the Strat scanner using the list icon on each row.
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
                        className="w-40 rounded border border-[#2a2a2a] bg-[#262626] px-2 py-0.5 text-sm text-white focus:border-[#f97316] focus:outline-none"
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
                  {/* Sort controls */}
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-[#2a2a2a] bg-[#0f0f0f]">
                    <span className="text-[10px] text-[#666]">Sort:</span>
                    {([
                      { key: "ticker" as SortKey, label: "Ticker" },
                      { key: "score" as SortKey, label: "Score" },
                      { key: "signal" as SortKey, label: "Signal" },
                      { key: "date" as SortKey, label: "Date" },
                    ]).map((s) => (
                      <button
                        key={s.key}
                        onClick={() => toggleSort(wl.id, s.key)}
                        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                          sortKeys[wl.id] === s.key
                            ? "bg-[#f97316]/10 text-[#f97316] border border-[#f97316]/30"
                            : "text-[#a0a0a0] hover:text-white border border-transparent"
                        }`}
                      >
                        {s.label}
                        {sortKeys[wl.id] === s.key && <ArrowUpDown className="h-2.5 w-2.5" />}
                      </button>
                    ))}
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#2a2a2a] bg-[#0f0f0f]">
                        <th className="px-4 py-2 font-medium text-[#666]">Ticker</th>
                        <th className="px-4 py-2 font-medium text-[#666]">Name</th>
                        <th className="px-4 py-2 font-medium text-[#666]">Score</th>
                        <th className="px-4 py-2 font-medium text-[#666]">Signal</th>
                        <th className="px-4 py-2 font-medium text-[#666]">TFC</th>
                        <th className="px-4 py-2 font-medium text-[#666]">Direction</th>
                        <th className="px-4 py-2 font-medium text-[#666]">Long</th>
                        <th className="px-4 py-2 font-medium text-[#666]">Short</th>
                        <th className="px-4 py-2 font-medium text-[#666]">Added</th>
                        <th className="px-4 py-2 font-medium text-[#666]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a2a2a]">
                      {sortItems(wl.items, wl.id).map((item) => (
                        <tr key={item.ticker} className="hover:bg-[#262626]">
                          <td className="px-4 py-2 font-medium text-white">{item.ticker}</td>
                          <td className="px-4 py-2 text-[#a0a0a0]">{item.name}</td>
                          <td className="px-4 py-2 font-mono text-[#a0a0a0]">{item.scoreAtAdd}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium border ${signalColor(item.signalAtAdd)}`}>
                              {item.signalAtAdd}
                            </span>
                          </td>
                          <td className={`px-4 py-2 ${tfcColor(item.tfcAtAdd)}`}>
                            {tfcLabel(item.tfcAtAdd)}
                          </td>
                          <td className={`px-4 py-2 ${directionColor(item.directionAtAdd)}`}>
                            {item.directionAtAdd === "BULL" ? "\u2191 Bull" : item.directionAtAdd === "BEAR" ? "\u2193 Bear" : "\u2195 Mixed"}
                          </td>
                          <td className="px-4 py-2 text-green-400">
                            {item.longTrigger != null ? `$${item.longTrigger.toFixed(2)}` : "\u2014"}
                          </td>
                          <td className="px-4 py-2 text-red-400">
                            {item.shortTrigger != null ? `$${item.shortTrigger.toFixed(2)}` : "\u2014"}
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
                <div className="border-t border-[#2a2a2a] px-4 py-6 text-center text-xs text-[#666]">
                  Empty watchlist. Add stocks from the Strat scanner.
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
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium border ${signalColor(r.newSignal)}`}>
                            {r.newSignal}
                          </span>
                        </div>
                      </div>
                    ))}
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
