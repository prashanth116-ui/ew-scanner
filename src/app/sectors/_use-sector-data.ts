"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { SectorRotationResult, SectorRotationScore, ExtensionTier } from "@/lib/sector-rotation/types";
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

const COMPARISON_CHANGE_THRESHOLD = 2;

export function useSectorData() {
  const [data, setData] = useState<SectorRotationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<PreRunResult[]>([]);
  const [scanResultsDate, setScanResultsDate] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [compareDate, setCompareDate] = useState<string | null>(null);
  const [history, setHistory] = useState<DailySnapshot[]>([]);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [rotationSectorRS, setRotationSectorRS] = useState<Map<string, { rsAccel: number; rsImproving: boolean; rsDelta: number; volConsistency: number; perfPct: number }>>(new Map());
  const [rotationFetchFailed, setRotationFetchFailed] = useState(false);
  const [rotationData, setRotationData] = useState<RotationTrackerResult | null>(null);

  // Fetch rotation tracker data for Sector RS column + Entry Signals panel (non-blocking, with retry)
  const fetchRotation = useCallback(() => {
    fetch("/api/rotation-tracker").then(res => res.ok ? res.json() : null).then((result: RotationTrackerResult | null) => {
      if (!result?.activeRotations) return;
      setRotationData(result);
      setRotationFetchFailed(false);
      const map = new Map<string, { rsAccel: number; rsImproving: boolean; rsDelta: number; volConsistency: number; perfPct: number }>();
      for (const rotation of result.activeRotations) {
        for (const s of rotation.stocks) {
          map.set(s.symbol, { rsAccel: s.rsAcceleration, rsImproving: s.rsImproving, rsDelta: s.rsDelta, volConsistency: s.volumeConsistency, perfPct: s.performancePct });
        }
      }
      setRotationSectorRS(map);
    }).catch(() => { setRotationFetchFailed(true); });
  }, []);

  useEffect(() => { fetchRotation(); }, [fetchRotation]);
  useEffect(() => { const id = setInterval(fetchRotation, 10 * 60 * 1000); return () => clearInterval(id); }, [fetchRotation]);
  useEffect(() => {
    if (!rotationFetchFailed || rotationData) return;
    const id = setTimeout(fetchRotation, 5_000);
    return () => clearTimeout(id);
  }, [rotationFetchFailed, rotationData, fetchRotation]);

  useEffect(() => { if (data) setHistory(loadHistory()); }, [data]);

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
      if (delta > COMPARISON_CHANGE_THRESHOLD) improved++;
      else if (delta < -COMPARISON_CHANGE_THRESHOLD) declined++;
      else unchanged++;
    }
    return { improved, declined, unchanged };
  }, [comparisonMap, data]);

  useEffect(() => {
    const { results, date } = loadScanResultsWithDate();
    setScanResults(results);
    setScanResultsDate(date);

    // If localStorage data is >24h old or missing, fetch latest from server
    const ageMs = date ? Date.now() - new Date(date).getTime() : Infinity;
    if (ageMs > 24 * 60 * 60 * 1000) {
      fetch("/api/prerun/latest")
        .then((res) => (res.ok ? res.json() : null))
        .then((result: { date: string | null; signals: { ticker: string; verdict: string; score: number; price: number }[] } | null) => {
          if (!result?.date || !result.signals?.length) return;
          // Only use server data if it's newer than localStorage
          const serverDate = new Date(result.date + "T21:30:00Z").toISOString();
          if (date && new Date(date) >= new Date(serverDate)) return;
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
          setScanResultsDate(serverDate);
        })
        .catch(() => {});
    }
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
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); return () => { abortRef.current?.abort(); }; }, [fetchData]);
  useEffect(() => { const interval = setInterval(() => fetchData(true), 10 * 60 * 1000); return () => clearInterval(interval); }, [fetchData]);

  const handleExport = useCallback(() => { if (data) exportSectorsToExcel(data); }, [data]);

  const watchlistTickers = useMemo(() => data?.topStocksToWatch.flatMap((g) => g.stocks.map((s) => s.ticker)) ?? [], [data]);

  const [loadingTimeout, setLoadingTimeout] = useState(false);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, data]);

  const subSectorScores = data?.subSectorScores ?? [];
  const crossAssetScores = data?.crossAssetScores ?? [];

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
    comparisonMap,
    comparisonSummary,
    handleExport,
    watchlistTickers,
  };
}
