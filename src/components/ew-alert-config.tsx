"use client";

import { useState, useCallback } from "react";
import { X, Send, Loader2, Copy, Check } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { UNIVERSE_KEYS, UNIVERSES } from "@/data/ew-universes";
import { SCANNER_MODES } from "@/lib/ew-scanner-modes";
import type { ScannerMode, ConfidenceTier, AlertConfig } from "@/lib/ew-types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode: ScannerMode;
  defaultUniverse: string;
  defaultFilters: { minDecline: number; minMonths: number; minRecovery: number };
}

export function EWAlertConfig({
  open,
  onOpenChange,
  defaultMode,
  defaultUniverse,
  defaultFilters,
}: Props) {
  const [mode, setMode] = useState<ScannerMode>(defaultMode);
  const [universe, setUniverse] = useState(defaultUniverse);
  const [minConfidence, setMinConfidence] = useState<ConfidenceTier>("probable");
  const [minDecline, setMinDecline] = useState(defaultFilters.minDecline);
  const [minMonths, setMinMonths] = useState(defaultFilters.minMonths);
  const [minRecovery, setMinRecovery] = useState(defaultFilters.minRecovery);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: boolean; candidateCount: number; newCount: number; error?: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const buildConfig = useCallback((): AlertConfig => ({
    mode,
    universe,
    minConfidence,
    filters: { minDecline, minMonths, minRecovery },
  }), [mode, universe, minConfidence, minDecline, minMonths, minRecovery]);

  const handleSend = useCallback(async () => {
    setSending(true);
    setResult(null);
    setError("");
    try {
      const res = await fetch("/api/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildConfig()),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to send alert");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error");
    }
    setSending(false);
  }, [buildConfig]);

  const handleCopyCurl = useCallback(() => {
    const config = buildConfig();
    const cmd = `curl -X POST ${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/alert -H "Content-Type: application/json" -d '${JSON.stringify(config)}'`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [buildConfig]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold text-white">
              Telegram Alert
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-[#a0a0a0] hover:text-white">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            {/* Mode */}
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
                Mode
              </label>
              <Tabs.Root value={mode} onValueChange={(v) => setMode(v as ScannerMode)}>
                <Tabs.List className="grid grid-cols-4 gap-2">
                  {SCANNER_MODES.map((m) => (
                    <Tabs.Trigger
                      key={m.key}
                      value={m.key}
                      className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                        mode === m.key
                          ? "bg-[#185FA5]/30 text-[#5ba3e6] ring-1 ring-[#185FA5]"
                          : "bg-[#262626] text-[#a0a0a0] hover:text-white"
                      }`}
                    >
                      {m.shortLabel}
                    </Tabs.Trigger>
                  ))}
                </Tabs.List>
              </Tabs.Root>
            </div>

            {/* Universe */}
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
                Universe
              </label>
              <select
                value={universe}
                onChange={(e) => setUniverse(e.target.value)}
                className="w-full rounded-md border border-[#2a2a2a] bg-[#262626] px-3 py-2 text-sm text-[#e6e6e6]"
              >
                {UNIVERSE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k} ({UNIVERSES[k].length})
                  </option>
                ))}
              </select>
            </div>

            {/* Min confidence */}
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
                Min Confidence
              </label>
              <div className="flex gap-2">
                {(["high", "probable", "speculative"] as ConfidenceTier[]).map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setMinConfidence(tier)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      minConfidence === tier
                        ? "bg-[#185FA5]/30 text-[#5ba3e6] ring-1 ring-[#185FA5]"
                        : "bg-[#262626] text-[#a0a0a0] hover:text-white"
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter sliders */}
            <div className="space-y-3 rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
              <label className="block text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
                Filters
              </label>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-[#a0a0a0]">Min Decline %</span>
                  <span className="font-mono text-[#5ba3e6]">{minDecline}%</span>
                </div>
                <input
                  type="range" min={5} max={80} value={minDecline}
                  onChange={(e) => setMinDecline(Number(e.target.value))}
                  className="ew-slider w-full"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-[#a0a0a0]">Min Duration</span>
                  <span className="font-mono text-[#5ba3e6]">{minMonths}mo</span>
                </div>
                <input
                  type="range" min={1} max={36} value={minMonths}
                  onChange={(e) => setMinMonths(Number(e.target.value))}
                  className="ew-slider w-full"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-[#a0a0a0]">Min Recovery %</span>
                  <span className="font-mono text-[#5ba3e6]">{minRecovery}%</span>
                </div>
                <input
                  type="range" min={5} max={200} value={minRecovery}
                  onChange={(e) => setMinRecovery(Number(e.target.value))}
                  className="ew-slider w-full"
                />
              </div>
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#185FA5] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1a6dba] disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending..." : "Send Alert Now"}
            </button>

            {/* Result */}
            {result && (
              <div className={`rounded-lg border p-3 text-xs ${
                result.sent
                  ? "border-green-500/20 bg-green-500/5 text-green-400"
                  : "border-red-500/20 bg-red-500/5 text-red-400"
              }`}>
                {result.sent
                  ? `Sent! ${result.candidateCount} candidates, ${result.newCount} new.`
                  : `Failed: ${result.error ?? "Check bot token and chat ID."}`}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
                {error}
              </div>
            )}

            {/* Cron URL */}
            <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-medium text-[#a0a0a0]">Cron / External Trigger</p>
                <button
                  onClick={handleCopyCurl}
                  className="flex items-center gap-1 text-[10px] text-[#666] hover:text-white"
                >
                  {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy curl"}
                </button>
              </div>
              <p className="text-[10px] leading-relaxed text-[#555]">
                Hit <code className="text-[#5ba3e6]">POST /api/alert</code> with the config JSON to trigger alerts from a cron job or webhook.
                Requires <code className="text-[#5ba3e6]">TELEGRAM_BOT_TOKEN</code> and <code className="text-[#5ba3e6]">TELEGRAM_CHAT_ID</code> env vars.
              </p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
