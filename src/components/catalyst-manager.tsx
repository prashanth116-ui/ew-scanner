"use client";

import { useState, useEffect, useCallback } from "react";
import { Zap, Plus, Trash2, Check, Loader2, X } from "lucide-react";
import { CatalystBadge, type CatalystInfo } from "./catalyst-badge";

interface Tag extends CatalystInfo {
  id: string;
  ticker: string;
  resolved: boolean;
}

/** Suggestions, not a fixed list — the field stays free text because the catalysts that
 *  matter are the ones nobody anticipated a category for. */
const TYPE_SUGGESTIONS = [
  "Earnings", "FDA / readout", "Investor day", "Product launch",
  "Court / regulatory", "Lockup expiry", "Index rebalance", "Guidance",
];

export function CatalystManager({ initialTicker = "" }: { initialTicker?: string }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [ticker, setTicker] = useState(initialTicker);
  const [eventDate, setEventDate] = useState("");
  const [eventType, setEventType] = useState("");
  const [note, setNote] = useState("");

  // Fetching is separated from state so the mount effect never calls setState
  // synchronously — that cascades renders, and the linter is right to reject it.
  const fetchTags = useCallback(async (): Promise<{ tags: Tag[]; error: string | null }> => {
    try {
      const r = await fetch("/api/catalyst-tags?withinDays=180");
      if (r.status === 401) return { tags: [], error: "Sign in to manage catalysts" };
      if (!r.ok) throw new Error(`${r.status}`);
      const j = await r.json();
      return { tags: j.tags ?? [], error: null };
    } catch {
      return { tags: [], error: "Could not load catalysts" };
    }
  }, []);

  const load = useCallback(async () => {
    const { tags: next, error: err } = await fetchTags();
    setTags(next);
    setError(err);
    setLoading(false);
  }, [fetchTags]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { tags: next, error: err } = await fetchTags();
      if (cancelled) return; // unmounted mid-flight
      setTags(next);
      setError(err);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchTags]);

  const save = async () => {
    if (!ticker.trim() || !eventDate || !eventType.trim()) {
      setError("Ticker, date and type are all required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/catalyst-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          event_date: eventDate,
          event_type: eventType.trim(),
          note: note.trim() || null,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `${r.status}`);
      }
      setTicker(initialTicker); setEventDate(""); setEventType(""); setNote("");
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const r = await fetch(`/api/catalyst-tags?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`${r.status}`);
      await load();
    } catch {
      setError("Could not delete");
    }
  };

  const input = "rounded border border-[#2a2a2a] bg-[#0f0f0f] px-2 py-1.5 text-sm text-white outline-none focus:border-[#3a3a3a]";

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-medium text-white">Catalysts</h3>
        <span className="text-xs text-[#707070]">{tags.length}</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-1 rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-[#a0a0a0] transition-colors hover:bg-[#2a2a2a] hover:text-white"
        >
          {open ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {open ? "Cancel" : "Add"}
        </button>
      </div>

      {open && (
        <div className="mb-3 space-y-2 rounded border border-[#2a2a2a] bg-[#141414] p-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="TICKER"
              className={`${input} w-28 font-mono`}
            />
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className={`${input} w-40`}
            />
            <input
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="Event type"
              list="catalyst-types"
              className={`${input} flex-1 min-w-[10rem]`}
            />
            <datalist id="catalyst-types">
              {TYPE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional) — what you expect, and what would change your mind"
            className={`${input} w-full`}
          />
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/30 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
        </div>
      )}

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-[#5ba3e6]" /></div>
      ) : tags.length === 0 ? (
        <p className="py-2 text-xs text-[#707070]">
          No catalysts tracked. Add one for any name with a dated event — a readout, an
          earnings date, a court ruling. The scanners cannot see these.
        </p>
      ) : (
        <ul className="space-y-1">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-[#141414]">
              <span className="w-16 font-mono text-xs text-white">{t.ticker}</span>
              <CatalystBadge catalyst={t} />
              {t.note && <span className="truncate text-xs text-[#707070]">{t.note}</span>}
              <button
                onClick={() => void remove(t.id)}
                title="Delete"
                className="ml-auto text-[#555] transition-colors hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
