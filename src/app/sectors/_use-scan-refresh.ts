"use client";

import { useState, useCallback, useRef } from "react";
import type { PreRunResult, PreRunVerdict, PreRunScores, PreRunStockData } from "@/lib/prerun/types";
import { getAllSectorSymbols } from "@/data/sector-universe";
import { saveScanResults } from "@/lib/prerun/storage";

const BATCH_SIZE = 25;
const BATCH_DELAY = 500;

/**
 * Reusable hook for two-phase scan refresh:
 * 1. Try fast Supabase lookup via GET /api/prerun/latest
 * 2. If still stale, fall back to full client-side scan via POST /api/prerun/scan
 */
export function useScanRefresh(
  currentScanDate: string | null,
  onComplete: (results: PreRunResult[], date: string) => void,
) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [scannedCount, setScannedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshScan = useCallback(async () => {
    if (scanning) return;
    setError(null);
    setScanning(true);
    setProgress("Checking server...");

    // Phase 1: Try fast Supabase lookup
    try {
      const res = await fetch("/api/prerun/latest");
      if (res.ok) {
        const result = (await res.json()) as {
          date: string | null;
          signals: { ticker: string; verdict: string; score: number; price: number }[];
        } | null;
        if (result?.date && result.signals?.length) {
          const serverDate = new Date(result.date + "T21:30:00Z").toISOString();
          const isNewer = !currentScanDate || new Date(serverDate) > new Date(currentScanDate);
          if (isNewer) {
            const shims: PreRunResult[] = result.signals.map((s) => ({
              data: {
                ticker: s.ticker,
                companyName: "",
                currentPrice: s.price,
                pctFromAth: null,
                shortFloat: null,
                daysToEarnings: null,
                nextEarningsDate: null,
                relativeStrength20d: null,
              } as PreRunStockData,
              gates: { gate1: true, gate2: true, gate3: true },
              scores: { finalScore: s.score } as PreRunScores,
              verdict: s.verdict as PreRunVerdict,
              patternMatch: null,
            }));
            saveScanResults(shims);
            onComplete(shims, serverDate);
            setScanning(false);
            setProgress("");
            return;
          }
        }
      }
    } catch {
      // Supabase lookup failed — fall through to full scan
    }

    // Phase 2: Full client-side scan
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    const tickers = getAllSectorSymbols();
    setTotalCount(tickers.length);
    setScannedCount(0);
    setProgress(`Scanning 0/${tickers.length}...`);

    const results: PreRunResult[] = [];

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      if (signal.aborted) break;
      const batch = tickers.slice(i, i + BATCH_SIZE);
      const count = Math.min(i + BATCH_SIZE, tickers.length);
      setProgress(`Scanning ${count}/${tickers.length}...`);

      try {
        const res = await fetch("/api/prerun/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickers: batch }),
          signal,
        });
        if (res.ok) {
          const json = (await res.json()) as { results?: PreRunResult[] };
          if (json.results) results.push(...json.results);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") break;
      }

      setScannedCount(count);

      if (i + BATCH_SIZE < tickers.length && !signal.aborted) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    if (!signal.aborted && results.length > 0) {
      saveScanResults(results);
      const now = new Date().toISOString();
      onComplete(results, now);
    }

    abortRef.current = null;
    setScanning(false);
    setProgress("");
  }, [scanning, currentScanDate, onComplete]);

  const cancelScan = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setScanning(false);
    setProgress("");
    setScannedCount(0);
    setTotalCount(0);
  }, []);

  return { scanning, progress, scannedCount, totalCount, error, refreshScan, cancelScan };
}
