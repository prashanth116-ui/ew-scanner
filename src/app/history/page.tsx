"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  X,
  Pencil,
  Check,
  StickyNote,
  Tag,
  GitCompareArrows,
  ArrowLeft,
  ArrowUpDown,
  Filter,
  ExternalLink,
} from "lucide-react";
import { loadScans, deleteScan, updateScan } from "@/lib/ew-watchlist";
import { compareScansPair } from "@/lib/ew-scan-compare";
import type { SavedScan, ScanComparison, ScannerMode } from "@/lib/ew-types";

const MODE_COLORS: Record<ScannerMode, string> = {
  wave2: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  wave4: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  wave5: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  breakout: "bg-green-500/20 text-green-400 border-green-500/30",
};

const MODE_LABELS: Record<ScannerMode, string> = {
  wave2: "W2",
  wave4: "W4",
  wave5: "W5",
  breakout: "BRK",
};

type SortField = "date" | "candidates" | "mode";

export default function HistoryPage() {
  const router = useRouter();
  const [scans, setScans] = useState<SavedScan[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comparison, setComparison] = useState<ScanComparison | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [tagId, setTagId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [filterMode, setFilterMode] = useState<ScannerMode | "all">("all");
  const [filterTag, setFilterTag] = useState("");

  useEffect(() => {
    setScans(loadScans());
  }, []);

  const refresh = useCallback(() => setScans(loadScans()), []);

  const handleDelete = useCallback((id: string) => {
    if (!confirm("Delete this saved scan?")) return;
    deleteScan(id);
    setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
    setScans(loadScans());
  }, []);

  const handleRename = useCallback((id: string) => {
    if (!editName.trim()) return;
    updateScan(id, { name: editName.trim() });
    setEditingId(null);
    refresh();
  }, [editName, refresh]);

  const handleSaveNote = useCallback((id: string) => {
    updateScan(id, { notes: noteText });
    setNoteId(null);
    refresh();
  }, [noteText, refresh]);

  const handleAddTag = useCallback((id: string) => {
    if (!tagInput.trim()) return;
    const scan = scans.find((s) => s.id === id);
    const existing = scan?.tags ?? [];
    const tag = tagInput.trim().toLowerCase();
    if (!existing.includes(tag)) {
      updateScan(id, { tags: [...existing, tag] });
    }
    setTagInput("");
    setTagId(null);
    refresh();
  }, [tagInput, scans, refresh]);

  const handleRemoveTag = useCallback((id: string, tag: string) => {
    const scan = scans.find((s) => s.id === id);
    if (!scan) return;
    updateScan(id, { tags: (scan.tags ?? []).filter((t) => t !== tag) });
    refresh();
  }, [scans, refresh]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }, []);

  const handleCompare = useCallback(() => {
    const ids = Array.from(selected);
    if (ids.length !== 2) return;
    const a = scans.find((s) => s.id === ids[0]);
    const b = scans.find((s) => s.id === ids[1]);
    if (!a || !b) return;
    setComparison(compareScansPair(a, b));
  }, [selected, scans]);

  const handleLoad = useCallback((scanId: string) => {
    router.push(`/?loadScan=${scanId}`);
  }, [router]);

  // Collect all tags for filter
  const allTags = Array.from(new Set(scans.flatMap((s) => s.tags ?? [])));

  // Filter
  let filtered = scans;
  if (filterMode !== "all") filtered = filtered.filter((s) => s.mode === filterMode);
  if (filterTag) filtered = filtered.filter((s) => s.tags?.includes(filterTag));

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "date": cmp = new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(); break;
      case "candidates": cmp = b.candidateCount - a.candidateCount; break;
      case "mode": cmp = a.mode.localeCompare(b.mode); break;
    }
    return sortAsc ? -cmp : cmp;
  });

  const handleSortClick = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  // Auto-compare: compute diff badge for each scan vs its previous same-mode+universe scan
  // Uses the already-loaded scans array to avoid N*loadScans() redundant localStorage reads
  const autoCompareMap = useMemo(() => {
    const map: Record<string, { newCount: number; droppedCount: number; prevId: string } | null> = {};
    for (const scan of scans) {
      // Find most recent scan matching mode+universe before this scan's date (inline)
      const before = new Date(scan.savedAt).getTime();
      const prev = scans.find(
        (s) =>
          s.id !== scan.id &&
          s.mode === scan.mode &&
          s.universe === scan.universe &&
          new Date(s.savedAt).getTime() < before
      );
      if (!prev) {
        map[scan.id] = null;
      } else {
        const tickersA = new Set(prev.candidates.map((c) => c.ticker));
        const tickersB = new Set(scan.candidates.map((c) => c.ticker));
        const newCount = scan.candidates.filter((c) => !tickersA.has(c.ticker)).length;
        const droppedCount = prev.candidates.filter((c) => !tickersB.has(c.ticker)).length;
        map[scan.id] = { newCount, droppedCount, prevId: prev.id };
      }
    }
    return map;
  }, [scans]);

  const handleAutoCompare = useCallback((scanId: string) => {
    const info = autoCompareMap[scanId];
    if (!info) return;
    const a = scans.find((s) => s.id === info.prevId);
    const b = scans.find((s) => s.id === scanId);
    if (!a || !b) return;
    setComparison(compareScansPair(a, b));
  }, [autoCompareMap, scans]);

  // ── Compare view ──
  if (comparison) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setComparison(null)}
            className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-[#a0a0a0] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <h2 className="text-lg font-bold text-white">Scan Comparison</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
            <p className="text-xs text-[#666]">Scan A</p>
            <p className="font-medium text-white">{comparison.scanA.name}</p>
            <p className="text-xs text-[#a0a0a0]">
              {new Date(comparison.scanA.savedAt).toLocaleDateString()} &middot; {comparison.scanA.candidateCount} candidates
            </p>
          </div>
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
            <p className="text-xs text-[#666]">Scan B</p>
            <p className="font-medium text-white">{comparison.scanB.name}</p>
            <p className="text-xs text-[#a0a0a0]">
              {new Date(comparison.scanB.savedAt).toLocaleDateString()} &middot; {comparison.scanB.candidateCount} candidates
            </p>
          </div>
        </div>

        {/* New tickers */}
        {comparison.newTickers.length > 0 && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
            <h3 className="mb-2 text-sm font-semibold text-green-400">
              New in Scan B ({comparison.newTickers.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {comparison.newTickers.map((t) => (
                <span key={t} className="rounded bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Dropped tickers */}
        {comparison.droppedTickers.length > 0 && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <h3 className="mb-2 text-sm font-semibold text-red-400">
              Dropped from Scan A ({comparison.droppedTickers.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {comparison.droppedTickers.map((t) => (
                <span key={t} className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Score changes */}
        {comparison.scoreChanges.length > 0 && (
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">
              Score Changes ({comparison.scoreChanges.length})
            </h3>
            <div className="space-y-1">
              {comparison.scoreChanges.map((sc) => (
                <div key={sc.ticker} className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-[#262626]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{sc.ticker}</span>
                    <span className="text-[#666]">{sc.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#a0a0a0]">{Math.round(sc.scoreA * 100)}%</span>
                    <span className="text-[#666]">&rarr;</span>
                    <span className="text-[#a0a0a0]">{Math.round(sc.scoreB * 100)}%</span>
                    <span className={`font-mono font-medium ${
                      sc.delta > 0 ? "text-green-400" : sc.delta < 0 ? "text-red-400" : "text-[#666]"
                    }`}>
                      {sc.delta > 0 ? "+" : ""}{Math.round(sc.delta * 100)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Timeline view ──
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Scan History</h1>
          <p className="text-sm text-[#a0a0a0]">{scans.length} saved scans</p>
        </div>
        {selected.size === 2 && (
          <button
            onClick={handleCompare}
            className="flex items-center gap-1.5 rounded-md bg-[#185FA5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1a6dba]"
          >
            <GitCompareArrows className="h-3.5 w-3.5" /> Compare Selected
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-[#666]" />
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as ScannerMode | "all")}
            className="rounded-md border border-[#2a2a2a] bg-[#262626] px-2.5 py-1 text-xs text-[#a0a0a0]"
          >
            <option value="all">All Modes</option>
            <option value="wave2">W2 Bottom</option>
            <option value="wave4">W4 Pullback</option>
            <option value="wave5">W5 Exhaust</option>
            <option value="breakout">Breakout</option>
          </select>
        </div>
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-[#666]" />
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="rounded-md border border-[#2a2a2a] bg-[#262626] px-2.5 py-1 text-xs text-[#a0a0a0]"
            >
              <option value="">All Tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-12 text-center">
          <p className="text-sm text-[#a0a0a0]">No saved scans yet. Run a scan and hit Save to get started.</p>
        </div>
      ) : (
        <>
        {/* Mobile cards */}
        <div className="space-y-3 sm:hidden">
          {sorted.map((scan) => (
            <div key={scan.id} className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-[#185FA5]"
                      checked={selected.has(scan.id)}
                      onChange={() => toggleSelect(scan.id)}
                    />
                    <button
                      onClick={() => handleLoad(scan.id)}
                      className="truncate text-sm font-medium text-[#e6e6e6] hover:text-[#5ba3e6]"
                    >
                      {scan.name}
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${MODE_COLORS[scan.mode]}`}>
                      {MODE_LABELS[scan.mode]}
                    </span>
                    <span className="text-[10px] text-[#666]">{scan.universe}</span>
                    <span className="text-[10px] text-[#a0a0a0]">
                      {new Date(scan.savedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-[#a0a0a0]">
                  <span>{scan.candidateCount}</span>
                  {autoCompareMap[scan.id] ? (
                    <button
                      onClick={() => handleAutoCompare(scan.id)}
                      className="inline-flex items-center gap-0.5 rounded bg-[#262626] px-1 py-0.5 text-[9px] hover:bg-[#333]"
                    >
                      {autoCompareMap[scan.id]!.newCount > 0 && (
                        <span className="text-green-400">+{autoCompareMap[scan.id]!.newCount}</span>
                      )}
                      {autoCompareMap[scan.id]!.droppedCount > 0 && (
                        <span className="text-red-400">-{autoCompareMap[scan.id]!.droppedCount}</span>
                      )}
                      {autoCompareMap[scan.id]!.newCount === 0 && autoCompareMap[scan.id]!.droppedCount === 0 && (
                        <span className="text-[#666]">=</span>
                      )}
                    </button>
                  ) : (
                    <span className="text-[9px] text-[#555]">First</span>
                  )}
                </div>
              </div>
              {/* Top 3 chips */}
              <div className="mt-2 flex gap-1">
                {(scan.topTickers ?? scan.candidates.slice(0, 3).map((c) => c.ticker)).map((t) => (
                  <span key={t} className="rounded bg-[#262626] px-1.5 py-0.5 text-[10px] text-[#a0a0a0]">
                    {t}
                  </span>
                ))}
              </div>
              {scan.notes && (
                <p className="mt-1 truncate text-[10px] text-[#555]">{scan.notes}</p>
              )}
              {/* Tags */}
              {scan.tags && scan.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {scan.tags.map((tag) => (
                    <span key={tag} className="rounded bg-[#185FA5]/20 px-1.5 py-0.5 text-[10px] text-[#5ba3e6]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {/* Actions */}
              <div className="mt-2 flex items-center gap-1 border-t border-[#2a2a2a] pt-2">
                <button
                  onClick={() => { setEditingId(scan.id); setEditName(scan.name); }}
                  className="rounded p-1 text-[#666] hover:text-white"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => {
                    if (noteId === scan.id) { setNoteId(null); }
                    else { setNoteId(scan.id); setNoteText(scan.notes ?? ""); }
                  }}
                  className="rounded p-1 text-[#666] hover:text-white"
                >
                  <StickyNote className="h-3 w-3" />
                </button>
                <button
                  onClick={() => { setTagId(tagId === scan.id ? null : scan.id); setTagInput(""); }}
                  className="rounded p-1 text-[#666] hover:text-white"
                >
                  <Tag className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleDelete(scan.id)}
                  className="rounded p-1 text-[#666] hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {/* Inline note editor */}
              {noteId === scan.id && (
                <div className="mt-2 flex gap-1">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="h-16 flex-1 rounded border border-[#2a2a2a] bg-[#262626] px-2 py-1 text-xs text-white"
                    placeholder="Add a note..."
                  />
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => handleSaveNote(scan.id)} className="rounded p-1 text-green-400">
                      <Check className="h-3 w-3" />
                    </button>
                    <button onClick={() => setNoteId(null)} className="rounded p-1 text-[#666]">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
              {/* Inline tag editor */}
              {tagId === scan.id && (
                <div className="mt-1 flex items-center gap-0.5">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTag(scan.id)}
                    className="w-24 rounded border border-[#2a2a2a] bg-[#262626] px-1 py-0.5 text-[10px] text-white"
                    placeholder="tag"
                    autoFocus
                  />
                  <button onClick={() => handleAddTag(scan.id)} className="p-0.5 text-green-400">
                    <Check className="h-2.5 w-2.5" />
                  </button>
                  <button onClick={() => setTagId(null)} className="p-0.5 text-[#666]">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}
              {/* Inline rename */}
              {editingId === scan.id && (
                <div className="mt-1 flex items-center gap-1">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRename(scan.id)}
                    className="flex-1 rounded border border-[#2a2a2a] bg-[#262626] px-2 py-0.5 text-xs text-white"
                    autoFocus
                  />
                  <button onClick={() => handleRename(scan.id)} className="p-0.5 text-green-400">
                    <Check className="h-3 w-3" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="p-0.5 text-[#666]">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto rounded-lg border border-[#2a2a2a] sm:block">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#2a2a2a] bg-[#1a1a1a]">
              <tr>
                <th className="px-3 py-2 font-medium text-[#666]">
                  <input
                    type="checkbox"
                    className="accent-[#185FA5]"
                    checked={selected.size === sorted.length && sorted.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) setSelected(new Set(sorted.map((s) => s.id)));
                      else setSelected(new Set());
                    }}
                  />
                </th>
                <th
                  className="cursor-pointer px-3 py-2 font-medium text-[#666] hover:text-white"
                  onClick={() => handleSortClick("date")}
                >
                  <span className="flex items-center gap-1">
                    Date <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className="px-3 py-2 font-medium text-[#666]">Name</th>
                <th
                  className="cursor-pointer px-3 py-2 font-medium text-[#666] hover:text-white"
                  onClick={() => handleSortClick("mode")}
                >
                  <span className="flex items-center gap-1">
                    Mode <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className="px-3 py-2 font-medium text-[#666]">Universe</th>
                <th
                  className="cursor-pointer px-3 py-2 font-medium text-[#666] hover:text-white"
                  onClick={() => handleSortClick("candidates")}
                >
                  <span className="flex items-center gap-1">
                    Results <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className="px-3 py-2 font-medium text-[#666]">Top 3</th>
                <th className="px-3 py-2 font-medium text-[#666]">Tags</th>
                <th className="px-3 py-2 font-medium text-[#666]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2a2a] bg-[#0f0f0f]">
              {sorted.map((scan) => (
                <tr key={scan.id} className="ew-row-in transition-colors hover:bg-[#1a1a1a]">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="accent-[#185FA5]"
                      checked={selected.has(scan.id)}
                      onChange={() => toggleSelect(scan.id)}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[#a0a0a0]">
                    {new Date(scan.savedAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === scan.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleRename(scan.id)}
                          className="w-40 rounded border border-[#2a2a2a] bg-[#262626] px-2 py-0.5 text-xs text-white"
                          autoFocus
                        />
                        <button onClick={() => handleRename(scan.id)} className="p-0.5 text-green-400 hover:text-green-300">
                          <Check className="h-3 w-3" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-0.5 text-[#666] hover:text-white">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <button
                          onClick={() => handleLoad(scan.id)}
                          className="font-medium text-[#e6e6e6] hover:text-[#5ba3e6]"
                        >
                          {scan.name} <ExternalLink className="ml-0.5 inline h-2.5 w-2.5" />
                        </button>
                        {scan.notes && (
                          <p className="mt-0.5 max-w-xs truncate text-[10px] text-[#555]">{scan.notes}</p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${MODE_COLORS[scan.mode]}`}>
                      {MODE_LABELS[scan.mode]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#a0a0a0]">{scan.universe}</td>
                  <td className="px-3 py-2">
                    <span className="text-[#a0a0a0]">{scan.candidateCount}</span>
                    {autoCompareMap[scan.id] ? (
                      <button
                        onClick={() => handleAutoCompare(scan.id)}
                        className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-[#262626] px-1 py-0.5 text-[9px] hover:bg-[#333]"
                        title="Compare vs last same-mode scan"
                      >
                        {autoCompareMap[scan.id]!.newCount > 0 && (
                          <span className="text-green-400">+{autoCompareMap[scan.id]!.newCount}</span>
                        )}
                        {autoCompareMap[scan.id]!.newCount > 0 && autoCompareMap[scan.id]!.droppedCount > 0 && (
                          <span className="text-[#555]">/</span>
                        )}
                        {autoCompareMap[scan.id]!.droppedCount > 0 && (
                          <span className="text-red-400">-{autoCompareMap[scan.id]!.droppedCount}</span>
                        )}
                        {autoCompareMap[scan.id]!.newCount === 0 && autoCompareMap[scan.id]!.droppedCount === 0 && (
                          <span className="text-[#666]">=</span>
                        )}
                      </button>
                    ) : (
                      <span className="ml-1.5 text-[9px] text-[#555]">First</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {(scan.topTickers ?? scan.candidates.slice(0, 3).map((c) => c.ticker)).map((t) => (
                        <span key={t} className="rounded bg-[#262626] px-1.5 py-0.5 text-[10px] text-[#a0a0a0]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {scan.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="group inline-flex items-center gap-0.5 rounded bg-[#185FA5]/20 px-1.5 py-0.5 text-[10px] text-[#5ba3e6]"
                        >
                          {tag}
                          <button
                            onClick={() => handleRemoveTag(scan.id, tag)}
                            className="hidden text-[#5ba3e6]/50 hover:text-[#5ba3e6] group-hover:inline"
                          >
                            <X className="h-2 w-2" />
                          </button>
                        </span>
                      ))}
                      {tagId === scan.id ? (
                        <div className="flex items-center gap-0.5">
                          <input
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAddTag(scan.id)}
                            className="w-16 rounded border border-[#2a2a2a] bg-[#262626] px-1 py-0.5 text-[10px] text-white"
                            placeholder="tag"
                            autoFocus
                          />
                          <button onClick={() => handleAddTag(scan.id)} className="p-0.5 text-green-400">
                            <Check className="h-2.5 w-2.5" />
                          </button>
                          <button onClick={() => setTagId(null)} className="p-0.5 text-[#666]">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingId(scan.id); setEditName(scan.name); }}
                        className="rounded p-1 text-[#666] hover:bg-[#262626] hover:text-white"
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => {
                          if (noteId === scan.id) { setNoteId(null); }
                          else { setNoteId(scan.id); setNoteText(scan.notes ?? ""); }
                        }}
                        className="rounded p-1 text-[#666] hover:bg-[#262626] hover:text-white"
                        title="Note"
                      >
                        <StickyNote className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => { setTagId(tagId === scan.id ? null : scan.id); setTagInput(""); }}
                        className="rounded p-1 text-[#666] hover:bg-[#262626] hover:text-white"
                        title="Add tag"
                      >
                        <Tag className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(scan.id)}
                        className="rounded p-1 text-[#666] hover:bg-[#262626] hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    {noteId === scan.id && (
                      <div className="mt-2 flex gap-1">
                        <textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          className="h-16 flex-1 rounded border border-[#2a2a2a] bg-[#262626] px-2 py-1 text-xs text-white"
                          placeholder="Add a note..."
                        />
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => handleSaveNote(scan.id)} className="rounded p-1 text-green-400 hover:bg-[#262626]">
                            <Check className="h-3 w-3" />
                          </button>
                          <button onClick={() => setNoteId(null)} className="rounded p-1 text-[#666] hover:bg-[#262626]">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
