"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { SectorRotationResult, SectorRotationScore } from "@/lib/sector-rotation/types";
import type { PreRunResult, PreRunStockData, PreRunScores, PreRunVerdict } from "@/lib/prerun/types";
import type { RotationTrackerResult } from "@/lib/sector-rotation/rotation-types";
import type { DailySnapshot, SectorSnapshot } from "@/lib/sector-rotation/history";
import {
  loadSectorRotation,
  saveSectorRotation,
} from "@/lib/sector-rotation/storage";
import {
  saveSnapshot,
  loadHistory,
  getSnapshot,
} from "@/lib/sector-rotation/history";
import { loadScanResultsWithDate } from "@/lib/prerun/storage";
import { SECTOR_UNIVERSE, getSectorsWithStocks } from "@/data/sector-universe";
import { exportSectorsToExcel } from "@/lib/sector-rotation/export";
import {
  type StockInSector,
  type SortMode,
  type TradingAction,
  getTradingAction,
  ACTION_RANK,
  QUADRANT_RANK,
  LOADING_PHASES,
  LOADING_TIMEOUT_MS,
  LOADING_PHASE_INTERVAL_MS,
} from "./_components";
import { COMPARISON } from "@/lib/sector-rotation/config";

export function useSectorData() {
  const [data, setData] = useState<SectorRotationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<PreRunResult[]>(() => loadScanResultsWithDate().results);
  const [scanResultsDate, setScanResultsDate] = useState<string | null>(() => loadScanResultsWithDate().date);
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [compareDate, setCompareDate] = useState<string | null>(null);
  const [history, setHistory] = useState<DailySnapshot[]>(() => loadHistory());
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [rotationSectorRS, setRotationSectorRS] = useState<Map<string, { rsAccel: number; rsImproving: boolean; rsDelta: number; volConsistency: number; perfPct: number }>>(new Map());
  const [rotationFetchFailed, setRotationFetchFailed] = useState(false);
  const [rotationData, setRotationData] = useState<RotationTrackerResult | null>(null);
  const rotationRetryCount = useRef(0);
  const MAX_ROTATION_RETRIES = 3;

  // Fetch rotation tracker data for Sector RS column + Entry Signals panel (non-blocking, with retry)
  const fetchRotation = useCallback(() => {
    fetch("/api/rotation-tracker")
      .then(res => res.ok ? res.json() : null)
      .then((result: RotationTrackerResult | null) => {
        if (!result?.activeRotations) {
          setRotationFetchFailed(true);
          return;
        }
        rotationRetryCount.current = 0;
        setRotationData(result);
        setRotationFetchFailed(false);
        const map = new Map<string, { rsAccel: number; rsImproving: boolean; rsDelta: number; volConsistency: number; perfPct: number }>();
        for (const rotation of result.activeRotations) {
          for (const s of rotation.stocks) {
            map.set(s.symbol, { rsAccel: s.rsAcceleration, rsImproving: s.rsImproving, rsDelta: s.rsDelta, volConsistency: s.volumeConsistency, perfPct: s.performancePct });
          }
        }
        setRotationSectorRS(map);
      })
      .catch(() => { setRotationFetchFailed(true); });
  }, []);

  useEffect(() => { fetchRotation(); }, [fetchRotation]);
  useEffect(() => {
    if (!document.hidden) {
      const id = setInterval(fetchRotation, 10 * 60 * 1000);
      return () => clearInterval(id);
    }
  }, [fetchRotation]);
  useEffect(() => {
    if (!rotationFetchFailed || rotationData) return;
    if (rotationRetryCount.current >= MAX_ROTATION_RETRIES) return;
    rotationRetryCount.current += 1;
    const id = setTimeout(fetchRotation, 5_000);
    return () => clearTimeout(id);
  }, [rotationFetchFailed, rotationData, fetchRotation]);

  const comparisonMap = useMemo(() => {
    if (!compareDate) return null;
    const snap = getSnapshot(compareDate);
    if (!snap) return null;
    const map = new Map<string, SectorSnapshot>();
    for (const s of snap.sectors) map.set(s.sector, s);
    return map;
  }, [compareDate]);

  const comparisonSummary = useMemo(() => {
    if (!comparisonMap || !data) return null;
    let improved = 0, declined = 0, unchanged = 0;
    for (const s of data.sectors) {
      const prev = comparisonMap.get(s.sector);
      if (!prev) { unchanged++; continue; }
      const delta = s.compositeScore - prev.compositeScore;
      if (delta > COMPARISON.CHANGE_THRESHOLD) improved++;
      else if (delta < -COMPARISON.CHANGE_THRESHOLD) declined++;
      else unchanged++;
    }
    return { improved, declined, unchanged };
  }, [comparisonMap, data]);

  // Fetch latest PreRun scan from server if it's newer than localStorage.
  // setState only happens inside async Promise callbacks, not synchronously
  // in the effect body.
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/prerun/latest", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((result: { date: string | null; signals: { ticker: string; verdict: string; score: number; price: number }[] } | null) => {
        if (!result?.date || !result.signals?.length) return;
        const serverDate = new Date(result.date + "T21:30:00Z").toISOString();
        setScanResultsDate((prevDate) => {
          if (prevDate && new Date(prevDate) >= new Date(serverDate)) return prevDate;
          const shims: PreRunResult[] = result.signals.map((s) => ({
            data: {
              ticker: s.ticker, companyName: "", currentPrice: s.price,
              pctFromAth: null, shortFloat: null, daysToEarnings: null,
              nextEarningsDate: null, relativeStrength20d: null,
            } as PreRunStockData,
            gates: { gate1: true, gate2: true, gate3: true },
            scores: { finalScore: s.score } as PreRunScores,
            verdict: s.verdict as PreRunVerdict,
            patternMatch: null,
          }));
          setScanResults(shims);
          return serverDate;
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Build stock list per sector with RS Accel (only sectors with stocks)
  const stocksBySector = useMemo(() => {
    const scanByTicker = new Map<string, (typeof scanResults)[number]>();
    for (const r of scanResults) scanByTicker.set(r.data.ticker, r);

    // Build institutional % lookup from enriched stocks
    const instMap = new Map<string, number | null>();
    if (data?.enrichedStocks?.passed) {
      for (const es of data.enrichedStocks.passed) {
        instMap.set(es.symbol, es.institutionalPct);
      }
    }

    const quotes = data?.stockQuotes ?? {};
    const map = new Map<string, StockInSector[]>();
    for (const sectorDef of getSectorsWithStocks()) {
      const stocks: StockInSector[] = sectorDef.stocks.map((stock) => {
        const preRun = scanByTicker.get(stock.symbol);
        const quote = quotes[stock.symbol];
        const rs20d = preRun?.data.relativeStrength20d ?? null;
        const aboveSma50 = quote?.sma50 != null && quote.sma50 > 0 ? quote.price > quote.sma50 : null;
        const volumeVsAvg = quote?.avgVolume10d != null && quote.avgVolume10d > 0
          ? Math.round((quote.volume / quote.avgVolume10d) * 100) / 100
          : null;
        const rsAccel = quote?.rsAccel ?? null;
        const rotData = rotationSectorRS.get(stock.symbol);
        return {
          ticker: stock.symbol,
          companyName: stock.name,
          rs20d,
          rsAccel,
          sectorRS: rotData?.rsAccel ?? null,
          pctFromAth: preRun?.data.pctFromAth ?? null,
          finalScore: preRun?.scores.finalScore ?? 0,
          verdict: preRun?.verdict ?? "",
          price: quote?.price ?? null,
          aboveSma50,
          volumeVsAvg,
          sectorName: sectorDef.displayName,
          daysToEarnings: preRun?.data.daysToEarnings ?? null,
          nextEarningsDate: preRun?.data.nextEarningsDate ?? null,
          rsImproving: rotData?.rsImproving ?? false,
          rsDelta: rotData?.rsDelta ?? 0,
          volumeConsistency: rotData?.volConsistency ?? 0,
          institutionalPct: instMap.get(stock.symbol) ?? null,
          inActiveRotation: !!rotData,
          rotationPerfPct: rotData?.perfPct ?? null,
        };
      });
      map.set(sectorDef.displayName, stocks);
    }
    return map;
  }, [scanResults, data, rotationSectorRS]);

  // Flat list of all stocks for search
  const allStocks = useMemo(() => {
    const list: StockInSector[] = [];
    for (const stocks of stocksBySector.values()) list.push(...stocks);
    return list;
  }, [stocksBySector]);

  const sortedSectors = useMemo(() => {
    if (!data) return [];
    const sectors = [...data.sectors];
    switch (sortMode) {
      case "score": return sectors.sort((a, b) => b.compositeScore - a.compositeScore);
      case "action": return sectors.sort((a, b) => { const diff = ACTION_RANK[getTradingAction(a)] - ACTION_RANK[getTradingAction(b)]; return diff !== 0 ? diff : b.compositeScore - a.compositeScore; });
      case "quadrant": return sectors.sort((a, b) => { const diff = QUADRANT_RANK[a.quadrant] - QUADRANT_RANK[b.quadrant]; return diff !== 0 ? diff : b.compositeScore - a.compositeScore; });
      case "acceleration": return sectors.sort((a, b) => b.acceleration - a.acceleration);
      case "name": return sectors.sort((a, b) => a.sector.localeCompare(b.sector));
      default: return sectors;
    }
  }, [data, sortMode]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (skipCache = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    if (!skipCache) {
      const cached = loadSectorRotation();
      if (cached) { setData(cached); setLoading(false); return; }
    }
    try {
      const res = await fetch("/api/sector-rotation", { signal: controller.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const result = (await res.json()) as SectorRotationResult;
      setData(result);
      saveSectorRotation(result);
      saveSnapshot(result);
      setHistory(loadHistory());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  // Standard async data-fetch on mount. State updates happen after await.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { fetchData(); return () => { abortRef.current?.abort(); }; }, [fetchData]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (document.hidden) return;
    const interval = setInterval(() => fetchData(true), 10 * 60 * 1000);
    const handleVisibility = () => {
      if (!document.hidden) fetchData(true);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchData]);

  const handleExport = useCallback(() => { if (data) exportSectorsToExcel(data); }, [data]);

  const watchlistTickers = useMemo(() => data?.topStocksToWatch.flatMap((g) => g.stocks.map((s) => s.ticker)) ?? [], [data]);

  const [loadingTimeout, setLoadingTimeout] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  // Loading timeout UI state is driven by an async timer.
  useEffect(() => {
    if (!loading || data) { setLoadingTimeout(false); return; }
    const timer = setTimeout(() => setLoadingTimeout(true), LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loading, data]);

  // Loading phase cycling
  useEffect(() => {
    if (!loading || data) { setLoadingPhase(0); return; }
    const timer = setInterval(() => setLoadingPhase((p) => (p + 1) % LOADING_PHASES.length), LOADING_PHASE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loading, data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const subSectorScores = data?.subSectorScores ?? [];
  const crossAssetScores = data?.crossAssetScores ?? [];
  const leadershipBasketScores = data?.leadershipBasketScores ?? [];

  return {
    data,
    loading,
    error,
    fetchData,
    scanResults,
    scanResultsDate,
    sortMode,
    setSortMode,
    compareDate,
    setCompareDate,
    history,
    loadingPhase,
    loadingTimeout,
    setLoadingTimeout,
    rotationData,
    rotationFetchFailed,
    rotationSectorRS,
    stocksBySector,
    allStocks,
    sortedSectors,
    subSectorScores,
    crossAssetScores,
    leadershipBasketScores,
    comparisonMap,
    comparisonSummary,
    handleExport,
    watchlistTickers,
    setScanResults,
    setScanResultsDate,
  };
}
