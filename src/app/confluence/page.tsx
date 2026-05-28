"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Search,
  Loader2,
  ChevronRight,
  ChevronDown,
  X,
  Layers,
  Copy,
  Check,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  FileDown,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import type {
  ConfluenceResult,
  ConfluenceScores,
  ConfluenceScanResult,
  ConfluenceWeights,
  ConfluenceThresholds,
  ConfluenceSignal,
  ConfluenceStratResult,
} from "@/lib/confluence/types";
import {
  CONFLUENCE_PRESETS,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
} from "@/lib/confluence/types";
import { computeConfluenceScore, classifySignal, deriveConfluenceBias, applyStratModifier } from "@/lib/confluence/scoring";
import { exportConfluenceToExcel } from "@/lib/confluence/export";
import {
  saveConfluenceScan,
  loadConfluenceScans,
  deleteConfluenceScan,
  type SavedConfluenceScan,
} from "@/lib/confluence/storage";
import { saveScanSnapshot, computeSignalPersistence, type SignalPersistence } from "@/lib/confluence/history";
import { detectConflicts, type ConflictWarning } from "@/lib/confluence/conflict";
import { recordSignals, fetchClientHitRates, type HitRateEntry } from "@/lib/signal-client";
import { getConfluenceUniverse, getConfluenceTickerInfo } from "@/data/confluence-universe";
import { getSectorForSymbol } from "@/data/sector-universe";
import type { SectorRotationScore, SectorRotationResult, RRGQuadrant } from "@/lib/sector-rotation/types";
import type { RotationTrackerResult } from "@/lib/sector-rotation/rotation-types";
import { ScannerCTA } from "@/components/scanner-cta";
import { useCollapsibleSections } from "@/lib/use-collapsible-sections";
import { useSidebarState } from "@/lib/use-sidebar-state";
import { SidebarShell } from "@/components/sidebar-shell";
import { SidebarSection } from "@/components/sidebar-section";
import { PresetList } from "@/components/preset-list";
import { ScoreBar } from "@/components/score-bar";
import { ProgressBar } from "@/components/progress-bar";

const BATCH_SIZE = 25;
const BATCH_DELAY = 300;
const CONCURRENT_BATCHES = 3;

type SortKey = "confluence" | "ew" | "squeeze" | "prerun" | "sector" | "strat" | "pass";
type SortDir = "asc" | "desc";

const SIGNAL_COLORS: Record<ConfluenceSignal, string> = {
  strong: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  moderate: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  weak: "bg-[#2a2a2a] text-[#a0a0a0] border-[#333]",
  none: "bg-red-500/10 text-red-400/60 border-red-500/20",
};

const SIGNAL_LABELS: Record<ConfluenceSignal, string> = {
  strong: "STRONG",
  moderate: "MODERATE",
  weak: "WEAK",
  none: "NONE",
};

const SIGNAL_BAR_COLORS: Record<ConfluenceSignal, string> = {
  strong: "bg-pink-500",
  moderate: "bg-amber-500",
  weak: "bg-[#555]",
  none: "bg-[#333]",
};

function passDot(pass: boolean): string {
  return pass ? "bg-pink-500" : "bg-[#333]";
}

/** Generate a one-line natural language summary for a confluence result. */
function generateWhyThisStock(r: ConfluenceResult): string {
  const parts: string[] = [];

  if (r.ewResult) {
    if (r.scores.ewNormalized >= DEFAULT_THRESHOLDS.ew * 1.5) parts.push("strong EW wave setup");
    else if (r.scores.ewNormalized >= DEFAULT_THRESHOLDS.ew) parts.push("favorable EW positioning");
    if (r.ewResult.wavePosition) {
      const wp = r.ewResult.wavePosition.toLowerCase();
      if (wp.length < 40) parts.push(wp);
    }
    if (r.ewResult.fibDepthLabel) parts.push(`fib ${r.ewResult.fibDepthLabel} retracement`);
  }

  if (r.squeezeResult) {
    if (r.scores.squeezeNormalized >= DEFAULT_THRESHOLDS.squeeze * 2) parts.push("high short squeeze potential");
    else if (r.scores.squeezeNormalized >= DEFAULT_THRESHOLDS.squeeze) parts.push("elevated short interest");
    if (r.squeezeResult.shortPercentOfFloat != null) {
      const si = r.squeezeResult.shortPercentOfFloat * (r.squeezeResult.shortPercentOfFloat < 1 ? 100 : 1);
      if (si > 10) parts.push(`${si.toFixed(0)}% SI`);
    }
  }

  if (r.prerunResult) {
    if (r.prerunResult.verdict === "PRIORITY") parts.push("priority pre-run candidate");
    else if (r.prerunResult.verdict === "KEEP") parts.push("strong fundamental catalyst");
    if (r.prerunResult.daysToEarnings != null && r.prerunResult.daysToEarnings <= 30) {
      parts.push(`earnings in ${r.prerunResult.daysToEarnings}d`);
    }
    if (r.prerunResult.pctFromAth != null && r.prerunResult.pctFromAth < -40) {
      parts.push(`${r.prerunResult.pctFromAth.toFixed(0)}% from ATH`);
    }
  }

  if (r.sectorResult) {
    if (r.sectorResult.quadrant === "LEADING") parts.push("leading sector rotation");
    else if (r.sectorResult.quadrant === "IMPROVING") parts.push("improving sector momentum");
    if (r.sectorResult.trend === "UP") parts.push("sector uptrend");
  }

  if (r.momentumQuality?.rsImproving && r.momentumQuality.volumeConsistency >= 3) {
    parts.push("sustained momentum quality");
  }

  if (r.stratResult) {
    if (r.stratResult.signal === "ACTIONABLE") {
      const dir = r.stratResult.actionDirection;
      parts.push(`Strat ${dir} trigger active`);
    } else if (r.stratResult.tfcAlignment === "FULL_BULL") {
      parts.push("full bull TFC alignment");
    } else if (r.stratResult.tfcAlignment === "FULL_BEAR") {
      parts.push("full bear TFC alignment");
    }
    if (r.stratResult.hasBroadening) parts.push("broadening formation");
  }

  if (parts.length === 0) return "Limited data available — review individual scanner details below.";
  // Cap at 4 reasons to keep it concise
  return parts.slice(0, 4).join(" · ");
}

// Scanner link paths
const SCANNER_LINKS: Record<string, { href: string; label: string }> = {
  ew: { href: "/", label: "EW Scanner" },
  squeeze: { href: "/squeeze", label: "Squeeze Scanner" },
  prerun: { href: "/pre-run", label: "Pre-Run Scanner" },
  sector: { href: "/sectors", label: "Sector Scanner" },
  strat: { href: "/strat", label: "Strat Scanner" },
};

export default function ConfluencePage() {
  // Weights & thresholds
  const [weights, setWeights] = useState<ConfluenceWeights>({ ...DEFAULT_WEIGHTS });
  const [thresholds, setThresholds] = useState<ConfluenceThresholds>({ ...DEFAULT_THRESHOLDS });

  // Signal filter
  const [signalFilter, setSignalFilter] = useState<Set<ConfluenceSignal>>(
    new Set(["strong", "moderate", "weak"])
  );

  // Sector filter
  const [sectorFilter, setSectorFilter] = useState("All");

  // Quadrant filter
  const [quadrantFilter, setQuadrantFilter] = useState<Set<RRGQuadrant>>(new Set());

  // Strat aligned filter
  const [stratAlignedFilter, setStratAlignedFilter] = useState(false);

  // Quality filter
  const [qualityFilter, setQualityFilter] = useState<"all" | "improving" | "high" | "fading">("all");

  // Scanner filters
  const [verdictFilter, setVerdictFilter] = useState<"all" | "priority" | "keep" | "watch" | "discard">("all");
  const [ewConfFilter, setEwConfFilter] = useState<"all" | "high" | "probable" | "speculative">("all");
  const [tfcFilter, setTfcFilter] = useState<"all" | "full_bull" | "full_bear" | "mixed">("all");
  const [dirFilter, setDirFilter] = useState<"all" | "long" | "short">("all");
  const [stockRSFilter, setStockRSFilter] = useState<Set<"leading" | "improving" | "weakening" | "lagging">>(new Set());

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [scannedCount, setScannedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [rawResults, setRawResults] = useState<ConfluenceScanResult[]>([]);
  const [sectorData, setSectorData] = useState<SectorRotationScore[] | null>(null);
  const [rotationStockMap, setRotationStockMap] = useState<Map<string, { rsAccel: number; rsImproving: boolean; rsDelta: number; volConsistency: number }>>(new Map());
  const scanAbort = useRef<AbortController | null>(null);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("confluence");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // UI state
  const [sidebarOpen, setSidebarOpen] = useSidebarState("confluence");
  const { collapsed, toggleSection } = useCollapsibleSections(undefined, "confluence");
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Ticker search
  const [tickerSearch, setTickerSearch] = useState("");
  const [tickerSearching, setTickerSearching] = useState(false);

  // Export toast
  const [copiedToast, setCopiedToast] = useState(false);

  // Saved scans
  const [savedScans, setSavedScans] = useState<SavedConfluenceScan[]>([]);
  const [saveName, setSaveName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    setSavedScans(loadConfluenceScans());
  }, []);

  // Signal persistence from previous scan
  const [persistence, setPersistence] = useState<SignalPersistence | null>(null);

  // Hit rates from Supabase
  const [hitRates, setHitRates] = useState<HitRateEntry[]>([]);

  // Conflict warnings per ticker
  const [conflicts, setConflicts] = useState<Map<string, ConflictWarning[]>>(new Map());

  // Fetch hit rates on mount
  useEffect(() => {
    fetchClientHitRates("confluence").then(setHitRates).catch(() => {});
  }, []);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      scanAbort.current?.abort();
    };
  }, []);

  // Build a map from ticker -> sector rotation data
  const sectorMap = useMemo(() => {
    if (!sectorData) return new Map<string, SectorRotationScore>();
    const map = new Map<string, SectorRotationScore>();
    for (const s of sectorData) {
      map.set(s.sector, s);
    }
    return map;
  }, [sectorData]);

  // Previous scan scores from localStorage (for trending detection)
  const prevScoresRef = useRef<Map<string, number>>(new Map());

  // Load previous confluence scores from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ew-confluence-prev-scores");
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, number>;
        prevScoresRef.current = new Map(Object.entries(parsed));
      }
    } catch {
      // ignore
    }
  }, []);

  // Compute confluence results from raw scan results + sector data
  const confluenceResults: ConfluenceResult[] = useMemo(() => {
    const results = rawResults.map((r) => {
      const sector = getSectorForSymbol(r.ticker);
      const sectorInfo = sectorMap.get(sector) ?? null;

      const ewNorm = r.ewResult ? r.ewResult.enhancedNormalized : null;
      const squeezeNorm = r.squeezeResult ? r.squeezeResult.squeezeScore / 100 : null;
      const prerunNorm = r.prerunResult ? r.prerunResult.finalScore / 24 : null;
      const sectorNorm = sectorInfo ? sectorInfo.compositeScore / 100 : null;

      // Trending: compare to previous scan
      const prevScore = prevScoresRef.current.get(r.ticker);
      const trending = prevScore != null
        ? (ewNorm ?? 0) + (squeezeNorm ?? 0) + (prerunNorm ?? 0) > prevScore
        : undefined;

      const scores = computeConfluenceScore(
        ewNorm, squeezeNorm, prerunNorm, sectorNorm,
        weights, thresholds,
        trending,
      );

      // Apply Strat conditional modifier
      const sectorQuadrant = sectorInfo?.quadrant ?? null;
      const bias = deriveConfluenceBias(scores, sectorQuadrant);
      const { adjustedScore, stratBonus } = applyStratModifier(scores.confluenceScore, r.stratResult ?? null, bias);
      const adjustedScores = { ...scores, confluenceScore: adjustedScore };

      const signal = classifySignal(adjustedScores);

      const tickerInfo = getConfluenceTickerInfo(r.ticker);

      const rotStock = rotationStockMap.get(r.ticker);

      return {
        ticker: r.ticker,
        name: r.name || tickerInfo?.name || r.ticker,
        sector,
        price: r.price,
        scores: adjustedScores,
        signal,
        ewResult: r.ewResult,
        squeezeResult: r.squeezeResult,
        prerunResult: r.prerunResult,
        sectorResult: sectorInfo ? {
          compositeScore: sectorInfo.compositeScore,
          quadrant: sectorInfo.quadrant,
          trend: sectorInfo.trend,
        } : null,
        stratResult: r.stratResult ?? null,
        stratBonus: stratBonus !== 0 ? stratBonus : undefined,
        trending: trending === true ? true : undefined,
        momentumQuality: rotStock ? {
          rsAcceleration: rotStock.rsAccel,
          rsImproving: rotStock.rsImproving,
          rsDelta: rotStock.rsDelta,
          volumeConsistency: rotStock.volConsistency,
        } : null,
      };
    });

    return results;
  }, [rawResults, sectorMap, rotationStockMap, weights, thresholds]);

  // Save current raw scores to localStorage for next comparison (trending detection)
  useEffect(() => {
    if (confluenceResults.length === 0) return;
    const scoreMap: Record<string, number> = {};
    for (const r of rawResults) {
      const ewN = r.ewResult ? r.ewResult.enhancedNormalized : 0;
      const sqN = r.squeezeResult ? r.squeezeResult.squeezeScore / 100 : 0;
      const prN = r.prerunResult ? r.prerunResult.finalScore / 24 : 0;
      scoreMap[r.ticker] = ewN + sqN + prN;
    }
    try {
      localStorage.setItem("ew-confluence-prev-scores", JSON.stringify(scoreMap));
    } catch {
      // ignore storage errors
    }
  }, [confluenceResults, rawResults]);

  // Save scan snapshot & compute persistence when scan finishes
  const prevScanningRef = useRef(false);
  useEffect(() => {
    if (prevScanningRef.current && !scanning && confluenceResults.length > 0) {
      // Compute persistence before saving (compares against last saved snapshot)
      setPersistence(computeSignalPersistence(confluenceResults));
      // Save current scan as a new snapshot
      saveScanSnapshot(confluenceResults);

      // Detect conflicts for each result
      const conflictMap = new Map<string, ConflictWarning[]>();
      for (const r of confluenceResults) {
        const c = detectConflicts(r);
        if (c.length > 0) conflictMap.set(r.ticker, c);
      }
      setConflicts(conflictMap);

      // Record strong/moderate signals to Supabase (fire-and-forget)
      const today = new Date().toISOString().slice(0, 10);
      const toRecord = confluenceResults
        .filter((r) => r.signal === "strong" || r.signal === "moderate")
        .slice(0, 50)
        .map((r) => ({
          scanner: "confluence" as const,
          ticker: r.ticker,
          signal_date: today,
          price_at_signal: r.price ?? 0,
          signal_strength: r.signal,
          score: r.scores.confluenceScore,
        }));
      recordSignals(toRecord);
    }
    prevScanningRef.current = scanning;
  }, [scanning, confluenceResults]);

  // Filter & sort
  const filtered = useMemo(() => {
    return confluenceResults.filter((r) => {
      if (!signalFilter.has(r.signal)) return false;
      if (sectorFilter !== "All" && r.sector !== sectorFilter) return false;
      if (quadrantFilter.size > 0) {
        if (!r.sectorResult) return false;
        if (!quadrantFilter.has(r.sectorResult.quadrant as RRGQuadrant)) return false;
      }
      if (stratAlignedFilter && r.stratResult) {
        const aligned = r.stratResult.signal === "ACTIONABLE" ||
          r.stratResult.tfcAlignment === "FULL_BULL" ||
          r.stratResult.tfcAlignment === "FULL_BEAR";
        if (!aligned) return false;
      }
      if (stratAlignedFilter && !r.stratResult) return false;
      if (qualityFilter === "improving" && (!r.momentumQuality || !r.momentumQuality.rsImproving)) return false;
      if (qualityFilter === "high" && (!r.momentumQuality || !r.momentumQuality.rsImproving || r.momentumQuality.volumeConsistency < 3)) return false;
      if (qualityFilter === "fading" && (!r.momentumQuality || r.momentumQuality.rsImproving || r.momentumQuality.rsAcceleration >= 0)) return false;
      // Verdict filter
      if (verdictFilter !== "all") {
        if (!r.prerunResult) return false;
        if (r.prerunResult.verdict.toUpperCase() !== verdictFilter.toUpperCase()) return false;
      }
      // EW Confidence filter
      if (ewConfFilter !== "all") {
        if (!r.ewResult) return false;
        if (r.ewResult.confidenceTier.toLowerCase() !== ewConfFilter) return false;
      }
      // TFC Alignment filter
      if (tfcFilter !== "all") {
        if (!r.stratResult) return false;
        const tfcMap: Record<string, string> = { full_bull: "FULL_BULL", full_bear: "FULL_BEAR", mixed: "MIXED" };
        if (r.stratResult.tfcAlignment !== tfcMap[tfcFilter]) return false;
      }
      // Direction filter
      if (dirFilter !== "all") {
        if (!r.stratResult?.actionDirection) return false;
        if (dirFilter === "long" && r.stratResult.actionDirection !== "LONG" && r.stratResult.actionDirection !== "BOTH") return false;
        if (dirFilter === "short" && r.stratResult.actionDirection !== "SHORT" && r.stratResult.actionDirection !== "BOTH") return false;
      }
      // Stock RS Quadrant filter
      if (stockRSFilter.size > 0) {
        if (!r.momentumQuality) return false;
        const { rsAcceleration, rsImproving } = r.momentumQuality;
        const sq = rsAcceleration > 0
          ? (rsImproving ? "leading" : "weakening")
          : (rsImproving ? "improving" : "lagging");
        if (!stockRSFilter.has(sq)) return false;
      }
      return true;
    });
  }, [confluenceResults, signalFilter, sectorFilter, quadrantFilter, stratAlignedFilter, qualityFilter, verdictFilter, ewConfFilter, tfcFilter, dirFilter, stockRSFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "confluence":
          cmp = a.scores.confluenceScore - b.scores.confluenceScore;
          break;
        case "ew":
          cmp = a.scores.ewNormalized - b.scores.ewNormalized;
          break;
        case "squeeze":
          cmp = a.scores.squeezeNormalized - b.scores.squeezeNormalized;
          break;
        case "prerun":
          cmp = a.scores.prerunNormalized - b.scores.prerunNormalized;
          break;
        case "sector":
          cmp = a.scores.sectorNormalized - b.scores.sectorNormalized;
          break;
        case "strat":
          cmp = (a.stratResult?.normalizedScore ?? 0) - (b.stratResult?.normalizedScore ?? 0);
          break;
        case "pass":
          cmp = a.scores.passCount - b.scores.passCount;
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const strong = filtered.filter((r) => r.signal === "strong").length;
    const moderate = filtered.filter((r) => r.signal === "moderate").length;
    const weak = filtered.filter((r) => r.signal === "weak").length;
    return { total: filtered.length, strong, moderate, weak };
  }, [filtered]);

  // Unique sectors for filter with counts
  const sectorsWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of confluenceResults) {
      counts.set(r.sector, (counts.get(r.sector) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sector, count]) => ({ sector, count }));
  }, [confluenceResults]);

  // Scan
  const runScan = useCallback(async () => {
    scanAbort.current?.abort();
    const controller = new AbortController();
    scanAbort.current = controller;
    const signal = controller.signal;

    setScanning(true);
    setRawResults([]);
    setSectorData(null);
    setRotationStockMap(new Map());
    setScannedCount(0);

    const universe = getConfluenceUniverse();
    const tickers = universe.map((t) => t.symbol);
    setTotalCount(tickers.length);

    if (tickers.length === 0) {
      setScanning(false);
      return;
    }

    // Fetch sector rotation data once (non-blocking if it fails)
    try {
      const sectorRes = await fetch("/api/sector-rotation", { signal });
      if (sectorRes.ok) {
        const data = (await sectorRes.json()) as SectorRotationResult;
        setSectorData(data.sectors);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setScanning(false);
        return;
      }
    }

    // Fetch rotation tracker data for per-stock momentum quality
    try {
      const rotRes = await fetch("/api/rotation-tracker", { signal });
      if (rotRes.ok) {
        const rotData = (await rotRes.json()) as RotationTrackerResult;
        const map = new Map<string, { rsAccel: number; rsImproving: boolean; rsDelta: number; volConsistency: number }>();
        for (const rotation of rotData.activeRotations) {
          for (const s of rotation.stocks) {
            map.set(s.symbol, { rsAccel: s.rsAcceleration, rsImproving: s.rsImproving, rsDelta: s.rsDelta, volConsistency: s.volumeConsistency });
          }
        }
        setRotationStockMap(map);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setScanning(false);
        return;
      }
    }

    const results: ConfluenceScanResult[] = [];
    const stride = BATCH_SIZE * CONCURRENT_BATCHES;

    for (let i = 0; i < tickers.length; i += stride) {
      if (signal.aborted) break;

      // Build up to CONCURRENT_BATCHES fetch promises
      const batchPromises: Promise<ConfluenceScanResult[]>[] = [];
      for (let j = 0; j < CONCURRENT_BATCHES; j++) {
        const start = i + j * BATCH_SIZE;
        if (start >= tickers.length) break;
        const batch = tickers.slice(start, start + BATCH_SIZE);
        batchPromises.push(
          fetch("/api/confluence/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tickers: batch }),
            signal,
          })
            .then(async (res) => {
              if (res.ok) {
                const data = (await res.json()) as { results: ConfluenceScanResult[] };
                return data.results ?? [];
              }
              return [];
            })
            .catch((err) => {
              if ((err as Error).name === "AbortError") throw err;
              return [];
            })
        );
      }

      const tickerEnd = Math.min(i + stride, tickers.length);
      setProgress(`Scanning ${tickerEnd}/${tickers.length}...`);

      const settled = await Promise.allSettled(batchPromises);
      for (const r of settled) {
        if (r.status === "fulfilled") {
          results.push(...r.value);
        }
      }

      setScannedCount(tickerEnd);
      setRawResults([...results]);

      if (tickerEnd < tickers.length && !signal.aborted) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    setScanning(false);
    setProgress("");
  }, []);

  const cancelScan = useCallback(() => {
    scanAbort.current?.abort();
    scanAbort.current = null;
    setScanning(false);
    setProgress("");
  }, []);

  // Ticker search
  const lookupTicker = useCallback(async () => {
    const ticker = tickerSearch.trim().toUpperCase();
    if (!ticker) return;

    if (rawResults.some((r) => r.ticker === ticker)) {
      setTickerSearch("");
      return;
    }

    setTickerSearching(true);
    try {
      const res = await fetch("/api/confluence/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: [ticker] }),
      });

      if (res.ok) {
        const data = (await res.json()) as { results: ConfluenceScanResult[] };
        if (data.results?.length) {
          setRawResults((prev) => [...data.results, ...prev]);
        }
      }
    } catch {
      // silently fail
    }
    setTickerSearching(false);
    setTickerSearch("");
  }, [tickerSearch, rawResults]);

  // Preset
  const applyPreset = useCallback((preset: typeof CONFLUENCE_PRESETS[number]) => {
    setWeights({ ...preset.weights });
    setThresholds({ ...preset.thresholds });
    if (preset.name === "Rotation Opportunities") {
      setQuadrantFilter(new Set<RRGQuadrant>(["IMPROVING"]));
    } else {
      setQuadrantFilter(new Set());
    }
  }, []);

  // Sort toggle
  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  // Quadrant filter toggle
  const toggleQuadrant = useCallback((q: RRGQuadrant) => {
    setQuadrantFilter((prev) => {
      const s = new Set(prev);
      if (s.has(q)) s.delete(q);
      else s.add(q);
      return s;
    });
  }, []);

  // Stock RS Quadrant filter toggle
  const toggleStockRS = useCallback((q: "leading" | "improving" | "weakening" | "lagging") => {
    setStockRSFilter((prev) => {
      const s = new Set(prev);
      if (s.has(q)) s.delete(q); else s.add(q);
      return s;
    });
  }, []);

  // Signal filter toggle
  const toggleSignal = useCallback((sig: ConfluenceSignal) => {
    setSignalFilter((prev) => {
      const s = new Set(prev);
      if (s.has(sig)) s.delete(sig);
      else s.add(sig);
      return s;
    });
  }, []);

  // Export / copy watchlist
  const copyWatchlist = useCallback(() => {
    const symbols = sorted.map((r) => r.ticker).join(", ");
    navigator.clipboard.writeText(symbols).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    }).catch(() => {});
  }, [sorted]);

  const handleExport = useCallback(() => {
    if (sorted.length > 0) exportConfluenceToExcel(sorted);
  }, [sorted]);

  // Save/load scan handlers
  const handleSaveScan = useCallback(() => {
    const name = saveName.trim() || `Scan ${new Date().toLocaleString()}`;
    const scan = saveConfluenceScan(name, weights, thresholds, [...signalFilter] as ConfluenceSignal[], sorted);
    if (scan) {
      setSavedScans(loadConfluenceScans());
      setSaveName("");
    }
  }, [saveName, weights, thresholds, signalFilter, sorted]);

  const handleLoadScan = useCallback(
    (scan: SavedConfluenceScan) => {
      setWeights(scan.weights);
      setThresholds(scan.thresholds);
      setSignalFilter(new Set(scan.signalFilters));
    },
    []
  );

  const handleDeleteScan = useCallback((id: string) => {
    deleteConfluenceScan(id);
    setSavedScans(loadConfluenceScans());
    setDeleteConfirm(null);
  }, []);

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-6 px-4 sm:px-6 py-6 max-w-[1600px] mx-auto">
        <SidebarShell open={sidebarOpen} onToggle={setSidebarOpen}>
          {/* Presets */}
          <SidebarSection title="Presets" sectionKey="presets" collapsed={collapsed.has("presets")} onToggle={toggleSection}>
            <PresetList presets={CONFLUENCE_PRESETS} onSelect={applyPreset} accent="#ec4899" />
          </SidebarSection>

          {/* Weights */}
          <SidebarSection title="Weights" sectionKey="weights" collapsed={collapsed.has("weights")} onToggle={toggleSection}>
              <div className="space-y-3">
                {(["ew", "squeeze", "prerun", "sector"] as const).map((key) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#a0a0a0] capitalize">{key === "ew" ? "EW" : key === "prerun" ? "Pre-Run" : key.charAt(0).toUpperCase() + key.slice(1)}</span>
                      <span className="text-white">{weights[key]}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={weights[key]}
                      onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                      className="w-full accent-[#ec4899]"
                    />
                  </div>
                ))}
              </div>
          </SidebarSection>

          {/* Thresholds */}
          <SidebarSection title="Thresholds" sectionKey="thresholds" collapsed={collapsed.has("thresholds")} onToggle={toggleSection}>
                {(["ew", "squeeze", "prerun", "sector"] as const).map((key) => (
                  <div key={key} className="mb-3 last:mb-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#a0a0a0] capitalize">{key === "ew" ? "EW" : key === "prerun" ? "Pre-Run" : key.charAt(0).toUpperCase() + key.slice(1)}</span>
                      <span className="text-white">{(thresholds[key] * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={thresholds[key] * 100}
                      onChange={(e) => setThresholds((t) => ({ ...t, [key]: Number(e.target.value) / 100 }))}
                      className="w-full accent-[#ec4899]"
                    />
                  </div>
                ))}
          </SidebarSection>

          {/* Signal filter */}
          <SidebarSection title="Signal Filter" sectionKey="signal" collapsed={collapsed.has("signal")} onToggle={toggleSection}>
              <div className="space-y-2">
                {(["strong", "moderate", "weak", "none"] as ConfluenceSignal[]).map((sig) => (
                  <label key={sig} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={signalFilter.has(sig)}
                      onChange={() => toggleSignal(sig)}
                      className="accent-[#ec4899]"
                    />
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SIGNAL_COLORS[sig]}`}>
                      {SIGNAL_LABELS[sig]}
                    </span>
                  </label>
                ))}
              </div>
          </SidebarSection>

          {/* Quadrant filter */}
          <SidebarSection title="Quadrant" sectionKey="quadrant" collapsed={collapsed.has("quadrant")} onToggle={toggleSection}>
            <div className="flex flex-wrap gap-1.5">
              {([
                { q: "LEADING" as RRGQuadrant, color: "green", label: "Leading" },
                { q: "IMPROVING" as RRGQuadrant, color: "cyan", label: "Improving" },
                { q: "WEAKENING" as RRGQuadrant, color: "amber", label: "Weakening" },
                { q: "LAGGING" as RRGQuadrant, color: "red", label: "Lagging" },
              ] as const).map(({ q, color, label }) => {
                const active = quadrantFilter.has(q);
                const colorMap: Record<string, { active: string; inactive: string }> = {
                  green:  { active: "bg-green-500/15 text-green-400 border-green-500/30", inactive: "text-[#a0a0a0] border-[#2a2a2a] hover:border-green-500/30 hover:text-green-400" },
                  cyan:   { active: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30", inactive: "text-[#a0a0a0] border-[#2a2a2a] hover:border-cyan-500/30 hover:text-cyan-400" },
                  amber:  { active: "bg-amber-500/15 text-amber-400 border-amber-500/30", inactive: "text-[#a0a0a0] border-[#2a2a2a] hover:border-amber-500/30 hover:text-amber-400" },
                  red:    { active: "bg-red-500/15 text-red-400 border-red-500/30", inactive: "text-[#a0a0a0] border-[#2a2a2a] hover:border-red-500/30 hover:text-red-400" },
                };
                return (
                  <button
                    key={q}
                    onClick={() => toggleQuadrant(q)}
                    className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
                      active ? colorMap[color].active : colorMap[color].inactive
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              {quadrantFilter.size > 0 && (
                <button
                  onClick={() => setQuadrantFilter(new Set())}
                  className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium text-[#666] border border-[#2a2a2a] hover:text-white hover:border-[#444] transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </SidebarSection>

          {/* Stock RS Quadrant filter */}
          <SidebarSection title="Stock RS Quadrant" sectionKey="stock-rs" collapsed={collapsed.has("stock-rs")} onToggle={toggleSection}>
            <div className="flex flex-wrap gap-1.5">
              {([
                { q: "leading" as const, color: "green", label: "Leading" },
                { q: "improving" as const, color: "cyan", label: "Improving" },
                { q: "weakening" as const, color: "amber", label: "Weakening" },
                { q: "lagging" as const, color: "red", label: "Lagging" },
              ] as const).map(({ q, color, label }) => {
                const active = stockRSFilter.has(q);
                const colorMap: Record<string, { active: string; inactive: string }> = {
                  green:  { active: "bg-green-500/15 text-green-400 border-green-500/30", inactive: "text-[#a0a0a0] border-[#2a2a2a] hover:border-green-500/30 hover:text-green-400" },
                  cyan:   { active: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30", inactive: "text-[#a0a0a0] border-[#2a2a2a] hover:border-cyan-500/30 hover:text-cyan-400" },
                  amber:  { active: "bg-amber-500/15 text-amber-400 border-amber-500/30", inactive: "text-[#a0a0a0] border-[#2a2a2a] hover:border-amber-500/30 hover:text-amber-400" },
                  red:    { active: "bg-red-500/15 text-red-400 border-red-500/30", inactive: "text-[#a0a0a0] border-[#2a2a2a] hover:border-red-500/30 hover:text-red-400" },
                };
                return (
                  <button
                    key={q}
                    onClick={() => toggleStockRS(q)}
                    className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
                      active ? colorMap[color].active : colorMap[color].inactive
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              {stockRSFilter.size > 0 && (
                <button
                  onClick={() => setStockRSFilter(new Set())}
                  className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium text-[#666] border border-[#2a2a2a] hover:text-white hover:border-[#444] transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-[10px] text-[#555] mt-1.5">Per-stock relative strength quadrant (from rotation tracker)</p>
          </SidebarSection>

          {/* Strat Aligned filter */}
          <SidebarSection title="Strat Filter" sectionKey="strat-filter" collapsed={collapsed.has("strat-filter")} onToggle={toggleSection}>
            <button
              onClick={() => setStratAlignedFilter((v) => !v)}
              className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium border transition-colors ${
                stratAlignedFilter
                  ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                  : "text-[#a0a0a0] border-[#2a2a2a] hover:border-orange-500/30 hover:text-orange-400"
              }`}
            >
              Strat Aligned Only
            </button>
            <p className="text-[10px] text-[#555] mt-1.5">Show only results with ACTIONABLE strat signal or full TFC alignment</p>
          </SidebarSection>

          {/* Sector filter — enhanced with counts */}
          {sectorsWithCounts.length > 0 && (
            <SidebarSection title="Sector" sectionKey="sector-filter" collapsed={collapsed.has("sector-filter")} onToggle={toggleSection}>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setSectorFilter("All")}
                      className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                        sectorFilter === "All"
                          ? "bg-[#ec4899]/15 text-[#ec4899] border border-[#ec4899]/30"
                          : "text-[#a0a0a0] border border-[#2a2a2a] hover:border-[#444] hover:text-white"
                      }`}
                    >
                      All ({confluenceResults.length})
                    </button>
                    {sectorsWithCounts.map(({ sector, count }) => (
                      <button
                        key={sector}
                        onClick={() => setSectorFilter(sectorFilter === sector ? "All" : sector)}
                        className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                          sectorFilter === sector
                            ? "bg-[#ec4899]/15 text-[#ec4899] border border-[#ec4899]/30"
                            : "text-[#a0a0a0] border border-[#2a2a2a] hover:border-[#444] hover:text-white"
                        }`}
                      >
                        {sector} ({count})
                      </button>
                    ))}
                  </div>
            </SidebarSection>
          )}

          {/* Quality filter */}
          <SidebarSection title="Momentum Quality" sectionKey="quality-filter" collapsed={collapsed.has("quality-filter")} onToggle={toggleSection}>
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: "all" as const, label: "All" },
                { key: "improving" as const, label: "RS Improving" },
                { key: "high" as const, label: "High Quality" },
                { key: "fading" as const, label: "Fading" },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setQualityFilter(qualityFilter === key ? "all" : key)}
                  className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
                    qualityFilter === key
                      ? "bg-[#ec4899]/15 text-[#ec4899] border-[#ec4899]/30"
                      : "text-[#a0a0a0] border-[#2a2a2a] hover:border-[#444] hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[#555] mt-1.5">Filters by rotation tracker momentum data (active sectors only)</p>
          </SidebarSection>

          {/* Scanner Filters */}
          <SidebarSection title="Scanner Filters" sectionKey="scanner-filters" collapsed={collapsed.has("scanner-filters")} onToggle={toggleSection}>
            <div className="space-y-3">
              {/* Verdict (Pre-Run) */}
              <div>
                <p className="text-[10px] text-[#666] mb-1.5">Verdict (Pre-Run)</p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: "all" as const, label: "All" },
                    { key: "priority" as const, label: "Priority" },
                    { key: "keep" as const, label: "Keep" },
                    { key: "watch" as const, label: "Watch" },
                    { key: "discard" as const, label: "Discard" },
                  ]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setVerdictFilter(verdictFilter === key ? "all" : key)}
                      className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
                        verdictFilter === key
                          ? "bg-[#ec4899]/15 text-[#ec4899] border-[#ec4899]/30"
                          : "text-[#a0a0a0] border-[#2a2a2a] hover:border-[#444] hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* EW Confidence */}
              <div>
                <p className="text-[10px] text-[#666] mb-1.5">EW Confidence</p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: "all" as const, label: "All" },
                    { key: "high" as const, label: "High" },
                    { key: "probable" as const, label: "Probable" },
                    { key: "speculative" as const, label: "Speculative" },
                  ]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setEwConfFilter(ewConfFilter === key ? "all" : key)}
                      className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
                        ewConfFilter === key
                          ? "bg-[#ec4899]/15 text-[#ec4899] border-[#ec4899]/30"
                          : "text-[#a0a0a0] border-[#2a2a2a] hover:border-[#444] hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* TFC Alignment (Strat) */}
              <div>
                <p className="text-[10px] text-[#666] mb-1.5">TFC Alignment (Strat)</p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: "all" as const, label: "All" },
                    { key: "full_bull" as const, label: "Full Bull" },
                    { key: "full_bear" as const, label: "Full Bear" },
                    { key: "mixed" as const, label: "Mixed" },
                  ]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setTfcFilter(tfcFilter === key ? "all" : key)}
                      className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
                        tfcFilter === key
                          ? "bg-[#ec4899]/15 text-[#ec4899] border-[#ec4899]/30"
                          : "text-[#a0a0a0] border-[#2a2a2a] hover:border-[#444] hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Direction (Strat) */}
              <div>
                <p className="text-[10px] text-[#666] mb-1.5">Direction (Strat)</p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: "all" as const, label: "All" },
                    { key: "long" as const, label: "Long" },
                    { key: "short" as const, label: "Short" },
                  ]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setDirFilter(dirFilter === key ? "all" : key)}
                      className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
                        dirFilter === key
                          ? "bg-[#ec4899]/15 text-[#ec4899] border-[#ec4899]/30"
                          : "text-[#a0a0a0] border-[#2a2a2a] hover:border-[#444] hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SidebarSection>

          {/* Scan / Cancel */}
          <div className="flex gap-2">
            <button
              onClick={runScan}
              disabled={scanning}
              className="flex-1 flex items-center justify-center gap-2 rounded-md bg-[#ec4899] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#db2777] disabled:opacity-50 transition-colors"
            >
              {scanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {scanning ? "Scanning..." : "Scan"}
            </button>
            {scanning && (
              <button
                onClick={cancelScan}
                className="rounded-md border border-[#2a2a2a] px-3 py-2.5 text-sm text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Ticker search */}
          <SidebarSection title="Add Ticker" sectionKey="ticker" collapsed={collapsed.has("ticker")} onToggle={toggleSection}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tickerSearch}
                    onChange={(e) => setTickerSearch(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && lookupTicker()}
                    placeholder="e.g. AAPL, NVDA..."
                    className="flex-1 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white placeholder-[#555] focus:border-[#ec4899] focus:outline-none"
                  />
                  <button
                    onClick={lookupTicker}
                    disabled={tickerSearching || !tickerSearch.trim()}
                    className="rounded-md bg-[#ec4899] px-3 py-1.5 text-sm text-white hover:bg-[#db2777] disabled:opacity-50 transition-colors"
                  >
                    {tickerSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </button>
                </div>
          </SidebarSection>

          {/* Saved Scans */}
          <SidebarSection title="Saved Scans" sectionKey="saved" collapsed={collapsed.has("saved")} onToggle={toggleSection}>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Scan name…"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="flex-1 rounded-md border border-[#2a2a2a] bg-[#141414] px-2 py-1 text-xs text-white placeholder-[#555] focus:border-[#ec4899]/50 focus:outline-none"
              />
              <button
                onClick={handleSaveScan}
                disabled={sorted.length === 0}
                className="rounded-md border border-[#2a2a2a] px-2 py-1 text-xs text-[#a0a0a0] hover:text-[#ec4899] hover:border-[#ec4899]/30 transition-colors disabled:opacity-40"
              >
                <Save className="h-3 w-3" />
              </button>
            </div>
            {savedScans.length === 0 ? (
              <p className="text-[11px] text-[#555]">No saved scans yet.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {savedScans.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-md border border-[#2a2a2a] bg-[#141414] px-2 py-1.5 text-xs"
                  >
                    <button
                      onClick={() => handleLoadScan(s)}
                      className="flex-1 text-left text-[#a0a0a0] hover:text-white truncate mr-2"
                      title={`Load: ${s.name}\n${s.candidateCount} results • ${new Date(s.savedAt).toLocaleDateString()}`}
                    >
                      <span className="text-white">{s.name}</span>
                      <span className="text-[#555] ml-1">({s.candidateCount})</span>
                    </button>
                    {deleteConfirm === s.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteScan(s.id)}
                          className="text-red-400 hover:text-red-300 text-[10px]"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="text-[#666] hover:text-white text-[10px]"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(s.id)}
                        className="text-[#444] hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SidebarSection>

          {/* Reset */}
          <button
            onClick={() => {
              setWeights({ ...DEFAULT_WEIGHTS });
              setThresholds({ ...DEFAULT_THRESHOLDS });
              setSignalFilter(new Set(["strong", "moderate", "weak"]));
              setSectorFilter("All");
              setQuadrantFilter(new Set());
              setStratAlignedFilter(false);
              setQualityFilter("all");
              setVerdictFilter("all");
              setEwConfFilter("all");
              setTfcFilter("all");
              setDirFilter("all");
              setStockRSFilter(new Set());
            }}
            className="w-full rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#666] hover:text-white hover:border-[#444] transition-colors"
          >
            Reset All
          </button>
        </SidebarShell>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Progress */}
          {scanning && (
            <div className="mb-4">
              <ProgressBar
                current={scannedCount}
                total={totalCount}
                label={`${progress}${totalCount > 200 && scannedCount > 0 && scannedCount < totalCount ? ` (~${Math.ceil(((totalCount - scannedCount) / (BATCH_SIZE * CONCURRENT_BATCHES)) * (BATCH_DELAY / 1000) / 60)}min left)` : ""}`}
                color="bg-[#ec4899]"
              />
            </div>
          )}

          {/* Summary stats */}
          {confluenceResults.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Showing</p>
                <p className="text-lg font-bold text-white">
                  {stats.total}
                  <span className="text-xs font-normal text-[#666] ml-1">/ {confluenceResults.length}</span>
                </p>
              </div>
              <div className="rounded-lg border border-pink-500/20 bg-[#141414] px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-pink-400/60 mb-1">Strong</p>
                <p className="text-lg font-bold text-pink-400">{stats.strong}</p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-[#141414] px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-amber-400/60 mb-1">Moderate</p>
                <p className="text-lg font-bold text-amber-400">{stats.moderate}</p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Weak</p>
                <p className="text-lg font-bold text-[#a0a0a0]">{stats.weak}</p>
              </div>
            </div>
          )}

          {/* Signal persistence from previous scan */}
          {persistence && !scanning && (
            <div className="mb-4 rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-2.5 flex items-center gap-4 text-xs">
              <span className="text-purple-400 font-medium">Signal Persistence:</span>
              <span className="text-white">{persistence.persisted}/{persistence.total} strong signals persisted</span>
              <span className="text-[#a0a0a0]">({(persistence.rate * 100).toFixed(0)}%)</span>
              {persistence.upgraded > 0 && (
                <span className="text-green-400">+{persistence.upgraded} new</span>
              )}
              {persistence.downgraded > 0 && (
                <span className="text-red-400">-{persistence.downgraded} dropped</span>
              )}
            </div>
          )}

          {/* Hit rate + conflict summary */}
          {!scanning && confluenceResults.length > 0 && (hitRates.length > 0 || conflicts.size > 0) && (
            <div className="mb-4 flex items-center gap-4 text-xs">
              {hitRates.length > 0 && (() => {
                const r30 = hitRates.find((h) => h.period_days === 30);
                if (!r30 || r30.total_signals < 5) return null;
                return (
                  <span className="rounded border border-green-500/20 bg-green-500/5 px-2 py-1 text-green-400">
                    30d hit rate: {Math.round(r30.hit_rate * 100)}% (n={r30.total_signals})
                  </span>
                );
              })()}
              {conflicts.size > 0 && (
                <span className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-amber-400">
                  {conflicts.size} conflict{conflicts.size !== 1 ? "s" : ""} detected
                </span>
              )}
            </div>
          )}

          {/* Action bar: sort pills + export */}
          {sorted.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-[#666]">Sort:</span>
              {(
                [
                  { key: "confluence", label: "Confluence" },
                  { key: "pass", label: "Pass Count" },
                  { key: "ew", label: "EW" },
                  { key: "squeeze", label: "Squeeze" },
                  { key: "prerun", label: "Pre-Run" },
                  { key: "sector", label: "Sector" },
                  { key: "strat", label: "Strat" },
                ] as { key: SortKey; label: string }[]
              ).map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSort(s.key)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
                    sortKey === s.key
                      ? "bg-[#ec4899]/10 text-[#ec4899] border border-[#ec4899]/30"
                      : "text-[#a0a0a0] hover:text-white border border-[#2a2a2a] hover:border-[#444]"
                  }`}
                >
                  {s.label}
                  {sortKey === s.key && (
                    sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
                  )}
                </button>
              ))}

              {/* Export / Copy Watchlist */}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={handleExport}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-[#a0a0a0] hover:text-white border border-[#2a2a2a] hover:border-[#444] transition-colors"
                >
                  <FileDown className="h-3 w-3" />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  onClick={copyWatchlist}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-[#a0a0a0] hover:text-white border border-[#2a2a2a] hover:border-[#444] transition-colors"
                  title="Copy all visible tickers to clipboard"
                >
                  {copiedToast ? (
                    <>
                      <Check className="h-3 w-3 text-green-400" />
                      <span className="text-green-400">Copied {sorted.length}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span className="hidden sm:inline">Copy Watchlist</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Results table */}
          {sorted.length > 0 ? (
            <div className="space-y-2">
              {/* Clickable header row */}
              <div className="hidden sm:grid grid-cols-[2.5rem_4rem_1fr_8rem_5rem_4rem_5rem_4rem_4rem_4rem_4rem] gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-[#555]">
                <span>#</span>
                <span>Ticker</span>
                <span>Name</span>
                <SortHeader label="Score" sortKey="confluence" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Pass" sortKey="pass" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <span>Signal</span>
                <SortHeader label="EW" sortKey="ew" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Sqz" sortKey="squeeze" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Pre" sortKey="prerun" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Sec" sortKey="sector" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="Strat" sortKey="strat" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              </div>

              {sorted.map((result, idx) => (
                <ResultRow
                  key={result.ticker}
                  result={result}
                  rank={idx + 1}
                  expanded={expandedTicker === result.ticker}
                  onToggle={() => setExpandedTicker(expandedTicker === result.ticker ? null : result.ticker)}
                  thresholds={thresholds}
                  conflicts={conflicts.get(result.ticker)}
                />
              ))}
            </div>
          ) : confluenceResults.length > 0 && !scanning ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#666]">
              <Layers className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">No stocks matched the current filters.</p>
              <p className="text-xs mt-1">Try enabling more signal types or lowering thresholds.</p>
            </div>
          ) : !scanning ? (
            <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-12 text-center">
              <Layers className="mx-auto h-12 w-12 text-[#333]" />
              <h2 className="mt-4 text-lg font-semibold text-white">
                Ready to Scan
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#a0a0a0]">
                Cross-reference {getConfluenceUniverse().length} stocks across all 4 scanners.
                Stocks passing multiple scanners simultaneously represent the highest conviction setups.
              </p>
              <div className="mx-auto mt-6 grid max-w-lg grid-cols-4 gap-3">
                <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                  <p className="text-2xl font-bold text-[#ec4899]">{getConfluenceUniverse().length}</p>
                  <p className="text-[10px] text-[#666]">Stocks</p>
                </div>
                <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                  <p className="text-2xl font-bold text-[#ec4899]">4</p>
                  <p className="text-[10px] text-[#666]">Scanners</p>
                </div>
                <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                  <p className="text-2xl font-bold text-[#ec4899]">5</p>
                  <p className="text-[10px] text-[#666]">Presets</p>
                </div>
                <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                  <p className="text-2xl font-bold text-[#ec4899]">AI</p>
                  <p className="text-[10px] text-[#666]">Summary</p>
                </div>
              </div>
              <Link
                href="/confluence/guide"
                className="mt-6 inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-xs font-medium text-[#a0a0a0] transition-colors hover:text-[#ec4899] hover:border-[#ec4899]/30"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Confluence Guide
              </Link>
            </div>
          ) : null}
        </main>
      </div>
      <ScannerCTA />
    </>
  );
}

// -- Sortable header cell --

function SortHeader({
  label,
  sortKey: key,
  currentKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = currentKey === key;
  return (
    <button
      onClick={() => onSort(key)}
      className={`flex items-center gap-0.5 text-[10px] uppercase tracking-wider transition-colors cursor-pointer ${
        active ? "text-[#ec4899]" : "text-[#555] hover:text-[#a0a0a0]"
      }`}
    >
      {label}
      {active && (
        dir === "desc" ? <ArrowDown className="h-2.5 w-2.5" /> : <ArrowUp className="h-2.5 w-2.5" />
      )}
    </button>
  );
}

// -- Result Row Component --

function ResultRow({
  result,
  rank,
  expanded,
  onToggle,
  thresholds,
  conflicts,
}: {
  result: ConfluenceResult;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
  thresholds: ConfluenceThresholds;
  conflicts?: ConflictWarning[];
}) {
  const s = result.scores;
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);

  return (
    <div className="ew-card-in rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] hover:border-[#3a3a3a] transition-colors">
      {/* Main row */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3"
      >
        {/* Mobile layout */}
        <div className="sm:hidden space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#555] w-6">{rank}</span>
              <span className="text-sm font-bold text-white">{result.ticker}</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${SIGNAL_COLORS[result.signal]}`}>
                {SIGNAL_LABELS[result.signal]}
              </span>
              {conflicts && conflicts.length > 0 && (
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[8px] text-amber-400" title={conflicts.map((c) => c.description).join("; ")}>
                  Conflict
                </span>
              )}
            </div>
            {expanded ? <ChevronDown className="h-4 w-4 text-[#555]" /> : <ChevronRight className="h-4 w-4 text-[#555]" />}
          </div>
          <p className="text-xs text-[#a0a0a0] truncate pl-8">{result.name}</p>
          <div className="flex items-center gap-2 pl-8">
            <div className="flex-1 h-2 bg-[#0f0f0f] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${SIGNAL_BAR_COLORS[result.signal]}`}
                style={{ width: `${Math.min(100, s.confluenceScore * 100)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-white w-10 text-right">
              {(s.confluenceScore * 100).toFixed(0)}%
            </span>
            <div className="flex gap-1">
              {[s.ewNormalized, s.squeezeNormalized, s.prerunNormalized, s.sectorNormalized].map((v, i) => (
                <div key={i} className={`w-2 h-2 rounded-full ${v > 0 ? passDot(
                  i === 0 ? v >= (thresholds.ew) :
                  i === 1 ? v >= (thresholds.squeeze) :
                  i === 2 ? v >= (thresholds.prerun) :
                  v >= (thresholds.sector)
                ) : "bg-[#222]"}`} />
              ))}
              <div className={`w-2 h-2 rounded-full ${result.stratResult ? ((result.stratResult.normalizedScore >= 0.35) ? "bg-orange-500" : "bg-[#333]") : "bg-[#222]"}`} />
            </div>
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden sm:grid grid-cols-[2.5rem_4rem_1fr_8rem_5rem_4rem_5rem_4rem_4rem_4rem_4rem] gap-2 items-center">
          <span className="text-xs text-[#555]">{rank}</span>
          <span className="text-sm font-bold text-white">{result.ticker}</span>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-[#a0a0a0] truncate">{result.name}</span>
            {result.price != null && (
              <span className="text-[10px] text-[#555] shrink-0">${result.price.toFixed(2)}</span>
            )}
          </div>
          {/* Confluence bar — signal-colored */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-[#0f0f0f] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${SIGNAL_BAR_COLORS[result.signal]}`}
                style={{ width: `${Math.min(100, s.confluenceScore * 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-white w-7 text-right">
              {(s.confluenceScore * 100).toFixed(0)}
            </span>
            {result.stratBonus != null && result.stratBonus !== 0 && (
              <span className={`text-[8px] font-semibold ${result.stratBonus > 0 ? "text-green-400" : "text-red-400"}`}>
                {result.stratBonus > 0 ? "+" : ""}{(result.stratBonus * 100).toFixed(0)}%
              </span>
            )}
          </div>
          {/* Pass dots */}
          <div className="flex items-center gap-1.5">
            <PassDots scores={s} thresholds={thresholds} stratResult={result.stratResult} />
            <span className="text-[10px] text-[#666]">{s.passCount}/4</span>
          </div>
          {/* Signal */}
          <span className={`inline-flex items-center justify-center rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${SIGNAL_COLORS[result.signal]}`}>
            {SIGNAL_LABELS[result.signal]}
          </span>
          {/* Individual scores */}
          <ScoreCell value={s.ewNormalized} label="EW" />
          <ScoreCell value={s.squeezeNormalized} label="Sqz" />
          <ScoreCell value={s.prerunNormalized} label="Pre" />
          <ScoreCell value={s.sectorNormalized} label="Sec" />
          <ScoreCell value={result.stratResult?.normalizedScore ?? 0} label="Strat" />
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[#2a2a2a] px-4 py-4">
          {/* "Why This Stock" summary */}
          <div className="mb-3 flex items-start gap-2 px-1">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#a0a0a0]">
                <span className="text-[#ec4899] font-medium">Why this stock: </span>
                {generateWhyThisStock(result)}
              </p>
            </div>
            {result.price != null && (
              <div className="shrink-0 text-right">
                <span className="text-sm font-bold text-white">${result.price.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* EW Panel */}
            <DetailPanel
              title="EW Scanner"
              color="#5ba3e6"
              available={!!result.ewResult}
              score={s.ewNormalized}
              expanded={expandedPanel === "ew"}
              onToggle={() => setExpandedPanel(expandedPanel === "ew" ? null : "ew")}
            >
              {result.ewResult && (
                <div className="space-y-1.5">
                  <DetailRow label="Enhanced Score" value={result.ewResult.enhancedScore.toFixed(1)} />
                  <DetailRow label="Normalized" value={`${(result.ewResult.enhancedNormalized * 100).toFixed(0)}%`} />
                  <DetailRow label="Confidence" value={result.ewResult.confidenceTier} highlight={result.ewResult.confidenceTier === "HIGH"} />
                  {result.ewResult.fibDepthLabel && <DetailRow label="Fib Level" value={result.ewResult.fibDepthLabel} />}
                  {result.ewResult.wavePosition && <DetailRow label="Wave" value={result.ewResult.wavePosition} />}
                  {expandedPanel === "ew" && (
                    <div className="pt-2 border-t border-[#2a2a2a] mt-2">
                      <div className="space-y-2">
                        <ScoreBar size="sm" label="Score" value={result.ewResult.enhancedScore} max={25} color="#5ba3e6" />
                        <ScoreBar size="sm" label="Normalized" value={result.ewResult.enhancedNormalized * 100} max={100} color="#5ba3e6" />
                      </div>
                      <ScannerLink scanner="ew" />
                    </div>
                  )}
                </div>
              )}
            </DetailPanel>

            {/* Squeeze Panel */}
            <DetailPanel
              title="Squeeze"
              color="#f59e0b"
              available={!!result.squeezeResult}
              score={s.squeezeNormalized}
              expanded={expandedPanel === "squeeze"}
              onToggle={() => setExpandedPanel(expandedPanel === "squeeze" ? null : "squeeze")}
            >
              {result.squeezeResult && (
                <div className="space-y-1.5">
                  <DetailRow label="Squeeze Score" value={`${result.squeezeResult.squeezeScore}/100`} />
                  <DetailRow label="Tier" value={result.squeezeResult.tier} highlight={result.squeezeResult.tier === "high"} />
                  {result.squeezeResult.shortPercentOfFloat != null && (
                    <DetailRow label="SI %" value={`${(result.squeezeResult.shortPercentOfFloat * (result.squeezeResult.shortPercentOfFloat < 1 ? 100 : 1)).toFixed(1)}%`} />
                  )}
                  {result.squeezeResult.shortRatio != null && (
                    <DetailRow label="Days to Cover" value={result.squeezeResult.shortRatio.toFixed(1)} />
                  )}
                  {expandedPanel === "squeeze" && (
                    <div className="pt-2 border-t border-[#2a2a2a] mt-2">
                      {result.squeezeResult.components ? (
                        <div className="space-y-2">
                          <ScoreBar size="sm" label="SI %" value={result.squeezeResult.components.siPercent} max={25} color="#ef4444" />
                          <ScoreBar size="sm" label="Days Cover" value={result.squeezeResult.components.daysTocover} max={15} color="#f97316" />
                          <ScoreBar size="sm" label="Float Size" value={result.squeezeResult.components.floatSize} max={15} color="#eab308" />
                          <ScoreBar size="sm" label="Vol Surge" value={result.squeezeResult.components.volumeSurge} max={15} color="#3b82f6" />
                          <ScoreBar size="sm" label="Near Low" value={result.squeezeResult.components.near52wLow} max={15} color="#a855f7" />
                          <ScoreBar size="sm" label="EW Align" value={result.squeezeResult.components.ewAlignment} max={15} color="#22c55e" />
                        </div>
                      ) : (
                        <ScoreBar size="sm" label="Score" value={result.squeezeResult.squeezeScore} max={100} color="#f59e0b" />
                      )}
                      <ScannerLink scanner="squeeze" />
                    </div>
                  )}
                </div>
              )}
            </DetailPanel>

            {/* Pre-Run Panel */}
            <DetailPanel
              title="Pre-Run"
              color="#10b981"
              available={!!result.prerunResult}
              score={s.prerunNormalized}
              expanded={expandedPanel === "prerun"}
              onToggle={() => setExpandedPanel(expandedPanel === "prerun" ? null : "prerun")}
            >
              {result.prerunResult && (
                <div className="space-y-1.5">
                  <DetailRow label="Score" value={`${result.prerunResult.finalScore}/24`} />
                  <DetailRow label="Verdict" value={result.prerunResult.verdict} highlight={result.prerunResult.verdict === "PRIORITY"} />
                  {result.prerunResult.pctFromAth != null && (
                    <DetailRow label="% from ATH" value={`${result.prerunResult.pctFromAth.toFixed(0)}%`} />
                  )}
                  {result.prerunResult.shortFloat != null && (
                    <DetailRow label="Short Float" value={`${result.prerunResult.shortFloat.toFixed(1)}%`} />
                  )}
                  {result.prerunResult.daysToEarnings != null && (
                    <DetailRow label="Earnings In" value={`${result.prerunResult.daysToEarnings}d`} />
                  )}
                  {expandedPanel === "prerun" && (
                    <div className="pt-2 border-t border-[#2a2a2a] mt-2">
                      <div className="space-y-2">
                        <ScoreBar size="sm" label="Score" value={result.prerunResult.finalScore} max={24} color="#10b981" />
                      </div>
                      <ScannerLink scanner="prerun" />
                    </div>
                  )}
                </div>
              )}
            </DetailPanel>

            {/* Sector Panel */}
            <DetailPanel
              title="Sector Rotation"
              color="#8b5cf6"
              available={!!result.sectorResult}
              score={s.sectorNormalized}
              expanded={expandedPanel === "sector"}
              onToggle={() => setExpandedPanel(expandedPanel === "sector" ? null : "sector")}
            >
              {result.sectorResult ? (
                <div className="space-y-1.5">
                  <DetailRow label="Sector" value={result.sector} />
                  <DetailRow label="Composite" value={`${result.sectorResult.compositeScore}/100`} />
                  <DetailRow label="Quadrant" value={result.sectorResult.quadrant} highlight={result.sectorResult.quadrant === "LEADING"} />
                  <DetailRow label="Trend" value={result.sectorResult.trend} />
                  {result.momentumQuality && (
                    <>
                      <DetailRow label="RS Direction" value={`${result.momentumQuality.rsImproving ? "Improving \u25B2" : "Fading \u25BC"}`} highlight={result.momentumQuality.rsImproving} />
                      <DetailRow label="RS Delta" value={`${result.momentumQuality.rsDelta > 0 ? "+" : ""}${result.momentumQuality.rsDelta.toFixed(2)}`} />
                      <DetailRow label="Vol Consistency" value={`${result.momentumQuality.volumeConsistency}/5 days`} />
                    </>
                  )}
                  {expandedPanel === "sector" && (
                    <div className="pt-2 border-t border-[#2a2a2a] mt-2">
                      <div className="space-y-2">
                        <ScoreBar size="sm" label="Composite" value={result.sectorResult.compositeScore} max={100} color="#8b5cf6" />
                      </div>
                      <ScannerLink scanner="sector" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <DetailRow label="Sector" value={result.sector} />
                </div>
              )}
            </DetailPanel>

            {/* Strat Panel */}
            <DetailPanel
              title="Strat"
              color="#f97316"
              available={!!result.stratResult}
              score={result.stratResult?.normalizedScore ?? 0}
              expanded={expandedPanel === "strat"}
              onToggle={() => setExpandedPanel(expandedPanel === "strat" ? null : "strat")}
            >
              {result.stratResult ? (
                <div className="space-y-1.5">
                  <DetailRow label="Score" value={`${result.stratResult.totalScore}/13`} />
                  <DetailRow label="Signal" value={result.stratResult.signal} highlight={result.stratResult.signal === "ACTIONABLE"} />
                  <DetailRow label="TFC" value={result.stratResult.tfcAlignment.replace("_", " ")} />
                  {result.stratResult.actionDirection && (
                    <DetailRow label="Direction" value={result.stratResult.actionDirection} />
                  )}
                  <DetailRow label="Combos" value={String(result.stratResult.comboCount)} />
                  <DetailRow label="Broadening" value={result.stratResult.hasBroadening ? "Yes" : "No"} highlight={result.stratResult.hasBroadening} />
                  {expandedPanel === "strat" && (
                    <div className="pt-2 border-t border-[#2a2a2a] mt-2">
                      <div className="space-y-2">
                        <ScoreBar size="sm" label="Score" value={result.stratResult.totalScore} max={13} color="#f97316" />
                      </div>
                      {result.stratResult.longTrigger != null && (
                        <p className="text-[10px] text-[#888] mt-2">Long trigger: ${result.stratResult.longTrigger.toFixed(2)}</p>
                      )}
                      {result.stratResult.shortTrigger != null && (
                        <p className="text-[10px] text-[#888]">Short trigger: ${result.stratResult.shortTrigger.toFixed(2)}</p>
                      )}
                      <ScannerLink scanner="strat" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-[#444]">No data available</p>
                </div>
              )}
            </DetailPanel>
          </div>
        </div>
      )}
    </div>
  );
}

function PassDots({ scores, thresholds, stratResult }: { scores: ConfluenceScores; thresholds: ConfluenceThresholds; stratResult?: ConfluenceStratResult | null }) {
  const items = [
    { val: scores.ewNormalized, thresh: thresholds.ew, label: "EW", color: null },
    { val: scores.squeezeNormalized, thresh: thresholds.squeeze, label: "Sqz", color: null },
    { val: scores.prerunNormalized, thresh: thresholds.prerun, label: "Pre", color: null },
    { val: scores.sectorNormalized, thresh: thresholds.sector, label: "Sec", color: null },
  ];

  const stratNorm = stratResult?.normalizedScore ?? 0;
  const stratPass = stratNorm >= 0.35; // score 5+/13

  return (
    <div className="flex gap-1">
      {items.map((item) => (
        <div
          key={item.label}
          title={`${item.label}: ${(item.val * 100).toFixed(0)}% (threshold: ${(item.thresh * 100).toFixed(0)}%)`}
          className={`w-2.5 h-2.5 rounded-full ${item.val > 0 ? passDot(item.val >= item.thresh) : "bg-[#222]"}`}
        />
      ))}
      <div
        title={`Strat: ${(stratNorm * 100).toFixed(0)}% (threshold: 35%)`}
        className={`w-2.5 h-2.5 rounded-full ${stratResult ? (stratPass ? "bg-orange-500" : "bg-[#333]") : "bg-[#222]"}`}
      />
    </div>
  );
}

function ScoreCell({ value, label }: { value: number; label: string }) {
  const pct = (value * 100).toFixed(0);
  const color = value >= 0.5 ? "text-white" : value > 0 ? "text-[#888]" : "text-[#444]";
  return (
    <span className={`text-xs font-medium ${color}`} title={`${label}: ${pct}%`}>
      {value > 0 ? pct : "-"}
    </span>
  );
}

function DetailPanel({
  title,
  color,
  available,
  score,
  expanded: panelExpanded,
  onToggle,
  children,
}: {
  title: string;
  color: string;
  available: boolean;
  score: number;
  expanded?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-3">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
        className="flex items-center justify-between mb-2 w-full group cursor-pointer"
      >
        <span
          className="text-[10px] uppercase tracking-wider font-medium group-hover:brightness-125 transition-all"
          style={{ color }}
        >
          {title}
          {available && (
            <ChevronRight
              className={`inline h-3 w-3 ml-0.5 transition-transform ${panelExpanded ? "rotate-90" : ""}`}
              style={{ color }}
            />
          )}
        </span>
        {available ? (
          <span className="text-xs font-bold text-white">
            {(score * 100).toFixed(0)}%
          </span>
        ) : (
          <span className="text-[10px] text-[#444]">N/A</span>
        )}
      </button>
      {/* Score bar */}
      <div className="h-1.5 bg-[#0f0f0f] rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, score * 100)}%`, backgroundColor: color }}
        />
      </div>
      {available ? children : (
        <p className="text-[10px] text-[#444]">No data available</p>
      )}
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-[#666]">{label}</span>
      <span className={highlight ? "text-[#ec4899] font-semibold" : "text-white font-medium"}>{value}</span>
    </div>
  );
}

/** "View in Scanner" link rendered inside expanded panel. */
function ScannerLink({ scanner }: { scanner: string }) {
  const info = SCANNER_LINKS[scanner];
  if (!info) return null;
  return (
    <Link
      href={info.href}
      className="flex items-center gap-1 mt-3 text-[10px] text-[#666] hover:text-[#ec4899] transition-colors"
    >
      <ExternalLink className="h-3 w-3" />
      View in {info.label}
    </Link>
  );
}
