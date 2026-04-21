"use client";

import { useState } from "react";
import { X, Loader2, Plus, Trash2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  saveCustomUniverse,
  loadCustomUniverses,
  deleteCustomUniverse,
  type CustomUniverse,
} from "@/lib/ew-watchlist";

interface UniverseBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUniverseCreated: () => void;
}

export function EWUniverseBuilder({ open, onOpenChange, onUniverseCreated }: UniverseBuilderProps) {
  const [name, setName] = useState("");
  const [tickerInput, setTickerInput] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<CustomUniverse[]>(() => loadCustomUniverses());

  const handleCreate = async () => {
    setError("");
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a name for the universe.");
      return;
    }

    // Parse tickers
    const raw = tickerInput
      .toUpperCase()
      .split(/[,\s\n]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && t.length <= 10);

    const unique = [...new Set(raw)];
    if (unique.length === 0) {
      setError("Enter at least one ticker.");
      return;
    }
    if (unique.length > 100) {
      setError("Maximum 100 tickers per custom universe.");
      return;
    }

    // Validate tickers exist via quick quote check
    setValidating(true);
    const valid: string[] = [];
    const invalid: string[] = [];

    // Check in batches of 10
    for (let i = 0; i < unique.length; i += 10) {
      const batch = unique.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map(async (ticker) => {
          const res = await fetch(`/api/quote?ticker=${encodeURIComponent(ticker)}`);
          if (!res.ok) return { ticker, ok: false };
          const data = await res.json();
          return { ticker, ok: !data.error };
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.ok) {
          valid.push(r.value.ticker);
        } else if (r.status === "fulfilled") {
          invalid.push(r.value.ticker);
        }
      }
    }

    setValidating(false);

    if (valid.length === 0) {
      setError("No valid tickers found. Check your input.");
      return;
    }

    saveCustomUniverse(trimmedName, valid);
    setExisting(loadCustomUniverses());
    setName("");
    setTickerInput("");
    onUniverseCreated();

    if (invalid.length > 0) {
      setError(`Created with ${valid.length} tickers. Invalid: ${invalid.join(", ")}`);
    }
  };

  const handleDelete = (id: string) => {
    deleteCustomUniverse(id);
    setExisting(loadCustomUniverses());
    onUniverseCreated();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold text-white">
              Custom Universe
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-[#a0a0a0] hover:text-white">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {/* Create new */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-[#a0a0a0]">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Watchlist"
                className="w-full rounded-md border border-[#2a2a2a] bg-[#262626] px-3 py-2 text-sm text-[#e6e6e6] placeholder-[#555] focus:border-[#185FA5] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#a0a0a0]">
                Tickers (comma or space separated, max 100)
              </label>
              <textarea
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                placeholder="AAPL, MSFT, TSLA, NVDA..."
                rows={4}
                className="w-full rounded-md border border-[#2a2a2a] bg-[#262626] px-3 py-2 text-sm text-[#e6e6e6] placeholder-[#555] focus:border-[#185FA5] focus:outline-none"
              />
            </div>
            {error && (
              <p className="text-xs text-yellow-400">{error}</p>
            )}
            <button
              onClick={handleCreate}
              disabled={validating}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#185FA5] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1a6dba] disabled:opacity-50"
            >
              {validating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Validating tickers...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Universe
                </>
              )}
            </button>
          </div>

          {/* Existing custom universes */}
          {existing.length > 0 && (
            <div className="mt-5 border-t border-[#2a2a2a] pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
                Saved Custom Universes
              </p>
              <div className="space-y-2">
                {existing.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between rounded-md bg-[#262626] px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-[#e6e6e6]">{u.name}</p>
                      <p className="text-[10px] text-[#666]">
                        {u.tickers.length} tickers
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="p-1 text-[#666] hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
