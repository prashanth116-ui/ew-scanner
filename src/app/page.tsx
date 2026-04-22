"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Activity,
  Search,
  FileSpreadsheet,
  FileDown,
  Loader2,
  ChevronRight,
  X,
  TrendingDown,
  TrendingUp,
  Clock,
  BarChart3,
  Save,
  FolderOpen,
  Trash2,
  ArrowUpDown,
  Layers,
  AlertTriangle,
  ListPlus,
  Bell,
  Check,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import * as Select from "@radix-ui/react-select";
import { UNIVERSES, UNIVERSE_KEYS, type UniverseKey } from "@/data/ew-universes";
import {
  scoreBatchEnhanced,
  type EnrichedQuoteInput,
} from "@/lib/ew-scoring";
import { exportEnhancedToExcel, exportEnhancedToCsv } from "@/lib/ew-export";
import type {
  ScannerMode,
  EnhancedScoredCandidate,
  DeepAnalysisResult,
  PriceSeries,
  SavedScan,
} from "@/lib/ew-types";
import { SCANNER_MODES, getModeConfig, applyModeFilters } from "@/lib/ew-scanner-modes";
import { saveScan, loadScans, deleteScan, loadCustomUniverses } from "@/lib/ew-watchlist";
import { loadWatchlists, addToWatchlist } from "@/lib/ew-watchlists";
import { confirmMultiTimeframe } from "@/lib/ew-wave-counter";
import { EWSparkline } from "@/components/ew-sparkline";
import { EWFibBar } from "@/components/ew-fib-bar";
import { EWSectorHeatmap } from "@/components/ew-sector-heatmap";
import { EWDeepChart } from "@/components/ew-deep-chart";
import { EWUniverseBuilder } from "@/components/ew-universe-builder";
import { EWAlertConfig } from "@/components/ew-alert-config";
import { useDebounce } from "@/lib/use-debounce";

const HTF_OPTIONS = ["Monthly", "Weekly"] as const;
const LTF_OPTIONS = ["Daily", "4H", "1H"] as const;

const BATCH_SIZE = 10;
const BATCH_DELAY = 300;
const LABEL_TOP_N = 30;
const LABEL_MIN_SCORE = 0.5; // 50% normalized score

type SortKey = "score" | "decline" | "recovery" | "sector" | "confidence";
type GroupKey = "none" | "sector" | "confidence";

interface Preset {
  name: string;
  shortName: string;
  description: string;
  mode: ScannerMode;
  htf: string;
  ltf: string;
  minDecline: number;
  minMonths: number;
  minRecovery: number;
}

const PRESETS: Preset[] = [
  {
    name: "Deep Value W2",
    shortName: "Deep Value",
    description: "Classic beaten-down stocks recovering from golden zone. High conviction, fewer results.",
    mode: "wave2",
    htf: "Weekly",
    ltf: "Daily",
    minDecline: 40,
    minMonths: 6,
    minRecovery: 10,
  },
  {
    name: "Quality Pullback W4",
    shortName: "Pullback",
    description: "Strong stocks with shallow dips — high win rate. Best for trending markets.",
    mode: "wave4",
    htf: "Weekly",
    ltf: "Daily",
    minDecline: 15,
    minMonths: 3,
    minRecovery: 20,
  },
  {
    name: "Momentum Top W5",
    shortName: "Topping",
    description: "Near ATH with exhaustion signals. Use for short/exit timing, not entries.",
    mode: "wave5",
    htf: "Weekly",
    ltf: "Daily",
    minDecline: 5,
    minMonths: 1,
    minRecovery: 80,
  },
  {
    name: "Breakout",
    shortName: "Breakout",
    description: "Recovered most of decline with volume. New impulse wave starting.",
    mode: "breakout",
    htf: "Weekly",
    ltf: "Daily",
    minDecline: 20,
    minMonths: 3,
    minRecovery: 40,
  },
  {
    name: "Aggressive W2",
    shortName: "Wide Net",
    description: "Wider net, catches early recoveries before they're obvious. More results, lower avg quality.",
    mode: "wave2",
    htf: "Weekly",
    ltf: "Daily",
    minDecline: 25,
    minMonths: 3,
    minRecovery: 5,
  },
];

export default function EWScannerPageWrapper() {
  return (
    <Suspense fallback={null}>
      <EWScannerPage />
    </Suspense>
  );
}

function EWScannerPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [htf, setHtf] = useState<string>("Monthly");
  const [ltf, setLtf] = useState<string>("Daily");
  const [universe, setUniverse] = useState<string>("SP500");
  const [mode, setMode] = useState<ScannerMode>("wave2");

  // Default sliders from mode config
  const modeConfig = getModeConfig(mode);
  const [minDecline, setMinDecline] = useState(modeConfig.defaults.minDecline);
  const [minMonths, setMinMonths] = useState(modeConfig.defaults.minMonths);
  const [minRecovery, setMinRecovery] = useState(modeConfig.defaults.minRecovery);

  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<EnhancedScoredCandidate[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [labeling, setLabeling] = useState(false);

  // AbortController refs for cancelling in-flight requests
  const scanAbort = useRef<AbortController | null>(null);
  const deepAbort = useRef<AbortController | null>(null);

  // Debounced slider values for expensive recomputation
  const debouncedDecline = useDebounce(minDecline, 300);
  const debouncedMonths = useDebounce(minMonths, 300);
  const debouncedRecovery = useDebounce(minRecovery, 300);

  // Abort all in-flight on unmount
  useEffect(() => {
    return () => {
      scanAbort.current?.abort();
      deepAbort.current?.abort();
      tickerAbort.current?.abort();
    };
  }, []);

  const [deepTicker, setDeepTicker] = useState<string | null>(null);
  const [deepCandidate, setDeepCandidate] = useState<EnhancedScoredCandidate | null>(null);
  const [deepAnalysis, setDeepAnalysis] = useState<string>("");
  const [deepStructured, setDeepStructured] = useState<DeepAnalysisResult | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepTab, setDeepTab] = useState<"analysis" | "chart">("analysis");

  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [groupBy, setGroupBy] = useState<GroupKey>("none");

  const [savedScans, setSavedScans] = useState<SavedScan[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [showUniverseBuilder, setShowUniverseBuilder] = useState(false);
  const [customUniverseKeys, setCustomUniverseKeys] = useState<string[]>([]);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [showAlertConfig, setShowAlertConfig] = useState(false);

  // Collapsible left panel sections (stores collapsed section keys)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleSection = useCallback((key: string) => {
    setCollapsed((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });
  }, []);

  // Single-ticker search
  const [tickerSearch, setTickerSearch] = useState("");
  const [tickerSearching, setTickerSearching] = useState(false);
  const [tickerResult, setTickerResult] = useState<EnhancedScoredCandidate | null>(null);
  const [tickerLabel, setTickerLabel] = useState<string | null>(null);
  const tickerAbort = useRef<AbortController | null>(null);

  // Load saved scans and custom universes on mount
  useEffect(() => {
    setSavedScans(loadScans());
    setCustomUniverseKeys(loadCustomUniverses().map((u) => `custom:${u.id}`));
  }, []);

  // Load scan from URL param (from history page)
  useEffect(() => {
    const scanId = searchParams.get("loadScan");
    if (!scanId) return;
    const scan = loadScans().find((s) => s.id === scanId);
    if (scan) {
      handleLoadScan(scan);
    }
    // Clear param from URL
    router.replace("/", { scroll: false });
  }, [searchParams, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update slider defaults when mode changes
  const handleModeChange = useCallback((newMode: ScannerMode) => {
    setMode(newMode);
    const cfg = getModeConfig(newMode);
    setMinDecline(cfg.defaults.minDecline);
    setMinMonths(cfg.defaults.minMonths);
    setMinRecovery(cfg.defaults.minRecovery);
  }, []);

  // Apply a preset (cheat code)
  const applyPreset = useCallback((preset: Preset) => {
    setMode(preset.mode);
    setHtf(preset.htf);
    setLtf(preset.ltf);
    setMinDecline(preset.minDecline);
    setMinMonths(preset.minMonths);
    setMinRecovery(preset.minRecovery);
  }, []);

  const passed = useMemo(() => results.filter((r) => r.passed), [results]);
  // Apply mode filters to passing candidates (uses debounced slider values)
  const modeFiltered = useMemo(() => {
    const mf = applyModeFilters(passed, mode);
    return mf.filter(
      (c) =>
        c.declinePct >= debouncedDecline &&
        c.monthsDecline >= debouncedMonths &&
        c.recoveryPct >= debouncedRecovery
    );
  }, [passed, mode, debouncedDecline, debouncedMonths, debouncedRecovery]);

  // Sort
  const sorted = [...modeFiltered].sort((a, b) => {
    switch (sortBy) {
      case "score": return b.enhancedNormalized - a.enhancedNormalized;
      case "decline": return b.declinePct - a.declinePct;
      case "recovery": return b.recoveryPct - a.recoveryPct;
      case "sector": return (a.sector ?? "").localeCompare(b.sector ?? "");
      case "confidence": {
        const tierOrder = { high: 0, probable: 1, speculative: 2 };
        return tierOrder[a.confidenceTier] - tierOrder[b.confidenceTier];
      }
      default: return 0;
    }
  });

  // Group
  const grouped = groupCandidates(sorted, groupBy);

  const cancelScan = useCallback(() => {
    scanAbort.current?.abort();
    scanAbort.current = null;
    setScanning(false);
    setProgress("");
  }, []);

  // --- Single Ticker Search ---
  const runTickerSearch = useCallback(async () => {
    const ticker = tickerSearch.trim().toUpperCase();
    if (!ticker) return;

    tickerAbort.current?.abort();
    const controller = new AbortController();
    tickerAbort.current = controller;
    const signal = controller.signal;

    setTickerSearching(true);
    setTickerResult(null);
    setTickerLabel(null);

    try {
      // Fetch quote
      const res = await fetch(
        `/api/quote?ticker=${encodeURIComponent(ticker)}&detail=1`,
        { signal }
      );
      if (!res.ok) {
        setTickerSearching(false);
        return;
      }
      const data = await res.json();
      if (data.error || !data.ath) {
        setTickerSearching(false);
        return;
      }

      // Score it
      const quote: EnrichedQuoteInput = {
        ticker,
        name: ticker,
        ath: data.ath,
        low: data.low,
        current: data.current,
        athYear: data.athYear,
        lowYear: data.lowYear,
        series: data.series,
        athIdx: data.athIdx,
        lowIdx: data.lowIdx,
      };

      const scored = scoreBatchEnhanced([quote], {
        minDecline: 0,
        minDuration: 0,
        minRecovery: 0,
        mode,
      });

      if (scored.length > 0) {
        // Force passed=true so the card renders regardless of filters
        const candidate = { ...scored[0], passed: true };
        setTickerResult(candidate);

        // Try to get a label
        if (signal.aborted) return;
        try {
          const labelRes = await fetch("/api/label", {
            method: "POST",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              candidates: [{
                ticker: candidate.ticker,
                ath: candidate.ath,
                low: candidate.low,
                current: candidate.current,
                declinePct: candidate.declinePct,
                monthsDecline: candidate.monthsDecline,
                recoveryPct: candidate.recoveryPct,
                fibZone: candidate.fibAnalysis?.depthLabel,
                volumeTrend: candidate.volumeAnalysis?.volumeTrend,
                swingCount: candidate.structureAnalysis?.swingCount,
                structure: candidate.structureAnalysis?.classification,
                scannerMode: mode,
              }],
              htf,
              ltf,
            }),
          });
          const labelData = await labelRes.json();
          if (labelData.labels?.[ticker]) {
            setTickerLabel(labelData.labels[ticker]);
          }
        } catch {
          // Label is non-critical
        }
      }
    } catch {
      // Aborted or failed
    }
    if (!signal.aborted) setTickerSearching(false);
  }, [tickerSearch, mode, htf, ltf]);

  // --- Scan ---
  const runScan = useCallback(async () => {
    // Abort any previous scan
    scanAbort.current?.abort();
    const controller = new AbortController();
    scanAbort.current = controller;
    const signal = controller.signal;

    setScanning(true);
    setResults([]);
    setLabels({});

    // Resolve tickers from preset or custom universe
    let tickers: { symbol: string; name: string; sector?: string }[];
    if (universe.startsWith("custom:")) {
      const customId = universe.replace("custom:", "");
      const customs = loadCustomUniverses();
      const custom = customs.find((u) => u.id === customId);
      if (!custom) {
        setProgress("Custom universe not found.");
        setScanning(false);
        return;
      }
      tickers = custom.tickers.map((t) => ({ symbol: t, name: t }));
    } else {
      tickers = UNIVERSES[universe as UniverseKey] ?? [];
    }
    const total = tickers.length;
    const quotes: EnrichedQuoteInput[] = [];

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      setProgress(`Fetching ${Math.min(i + BATCH_SIZE, total)}/${total}...`);

      const settled = await Promise.allSettled(
        batch.map(async (t) => {
          const res = await fetch(
            `/api/quote?ticker=${encodeURIComponent(t.symbol)}&detail=1`,
            { signal }
          );
          if (!res.ok) return null;
          const data = await res.json();
          if (data.error) return null;
          return {
            ticker: t.symbol,
            name: t.name,
            sector: t.sector,
            ath: data.ath,
            low: data.low,
            current: data.current,
            athYear: data.athYear,
            lowYear: data.lowYear,
            series: data.series as PriceSeries | undefined,
            athIdx: data.athIdx as number | undefined,
            lowIdx: data.lowIdx as number | undefined,
          } as EnrichedQuoteInput;
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          quotes.push(r.value);
        }
      }

      if (i + BATCH_SIZE < total) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    if (!quotes.length) {
      setProgress("No data returned. Try again.");
      setScanning(false);
      return;
    }

    setProgress("Analyzing & scoring...");
    const scored = scoreBatchEnhanced(quotes, {
      minDecline,
      minDuration: minMonths,
      minRecovery,
      mode,
    });

    setResults(scored);
    const passingCandidates = scored.filter((s) => s.passed);
    const modeFilteredCandidates = applyModeFilters(passingCandidates, mode);

    // MTF confirmation for top 10 candidates (saves API calls)
    const topForMtf = modeFilteredCandidates
      .filter((c) => c.waveCount && c.series)
      .slice(0, 10);

    if (topForMtf.length > 0) {
      setProgress(`Running multi-timeframe confirmation for top ${topForMtf.length}...`);
      for (const c of topForMtf) {
        try {
          const mtfRes = await fetch(
            `/api/quote?ticker=${encodeURIComponent(c.ticker)}&detail=1&mtf=1`,
            { signal }
          );
          if (mtfRes.ok) {
            const mtfData = await mtfRes.json();
            if (mtfData.dailySeries && c.waveCount) {
              const dailySeries = mtfData.dailySeries as PriceSeries;
              // Find ATH/Low indices in daily data
              let dAthIdx = 0, dLowIdx = 0, dMax = -Infinity, dMin = Infinity;
              for (let i = 0; i < dailySeries.high.length; i++) {
                if (dailySeries.high[i] > dMax) { dMax = dailySeries.high[i]; dAthIdx = i; }
              }
              for (let i = dAthIdx; i < dailySeries.low.length; i++) {
                if (dailySeries.low[i] < dMin) { dMin = dailySeries.low[i]; dLowIdx = i; }
              }
              c.mtfConfirmation = confirmMultiTimeframe(c.waveCount, dailySeries, dAthIdx, dLowIdx);
            }
          }
        } catch {
          // MTF is non-critical
        }
      }
      // Update results to trigger re-render
      setResults([...scored]);
    }

    // Label top candidates only (token gate: top N above min score)
    const labelCandidates = modeFilteredCandidates
      .filter((c) => c.enhancedNormalized >= LABEL_MIN_SCORE)
      .slice(0, LABEL_TOP_N);

    if (labelCandidates.length > 0) {
      const skipped = modeFilteredCandidates.length - labelCandidates.length;
      setProgress(
        `${modeFilteredCandidates.length} candidates found. Labeling top ${labelCandidates.length}...` +
        (skipped > 0 ? ` (${skipped} below 50% skipped)` : "")
      );
      setLabeling(true);

      try {
        const labelRes = await fetch("/api/label", {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidates: labelCandidates.map((c) => ({
              ticker: c.ticker,
              ath: c.ath,
              low: c.low,
              current: c.current,
              declinePct: c.declinePct,
              monthsDecline: c.monthsDecline,
              recoveryPct: c.recoveryPct,
              fibZone: c.fibAnalysis?.depthLabel,
              volumeTrend: c.volumeAnalysis?.volumeTrend,
              swingCount: c.structureAnalysis?.swingCount,
              structure: c.structureAnalysis?.classification,
              scannerMode: mode,
            })),
            htf,
            ltf,
          }),
        });

        const labelData = await labelRes.json();
        if (labelData.error?.includes("ANTHROPIC_API_KEY")) {
          setApiKeyMissing(true);
        } else {
          setLabels(labelData.labels ?? {});
        }
      } catch {
        // Labels are non-critical
      }
      setLabeling(false);
    }

    if (signal.aborted) return;
    setProgress("");
    setScanning(false);
  }, [universe, htf, ltf, minDecline, minMonths, minRecovery, mode]);

  // --- Deep Analysis ---
  const runDeep = useCallback(
    async (candidate: EnhancedScoredCandidate) => {
      deepAbort.current?.abort();
      const controller = new AbortController();
      deepAbort.current = controller;

      setDeepTicker(candidate.ticker);
      setDeepCandidate(candidate);
      setDeepAnalysis("");
      setDeepStructured(null);
      setDeepLoading(true);
      setDeepTab("analysis");

      try {
        const res = await fetch("/api/deep", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: candidate.ticker,
            name: candidate.name,
            ath: candidate.ath,
            athDate: String(candidate.athYear),
            low: candidate.low,
            lowDate: String(candidate.lowYear),
            current: candidate.current,
            declinePct: candidate.declinePct,
            durationMonths: candidate.monthsDecline,
            recoveryPct: candidate.recoveryPct,
            score: candidate.enhancedScore,
            label: labels[candidate.ticker],
            htf,
            ltf,
            weeklyCloses: candidate.series?.close,
            fibZone: candidate.fibAnalysis?.depthLabel,
            fibDepth: candidate.fibAnalysis
              ? candidate.fibAnalysis.retracementDepth * 100
              : undefined,
            goldenZone: candidate.fibAnalysis?.withinGoldenZone,
            volumeTrend: candidate.volumeAnalysis?.volumeTrend,
            structure: candidate.structureAnalysis?.classification,
            swingCount: candidate.structureAnalysis?.swingCount,
            momentumScore: candidate.momentumAnalysis?.score,
            scannerMode: mode,
            // V3 wave count data — send actual prices and dates
            waveCountValid: candidate.waveCount?.isValid,
            waveCountScore: candidate.waveCount?.score,
            waveCountPosition: candidate.waveCount?.position,
            waveCountViolations: candidate.waveCount?.violations,
            waveLabels: candidate.waveCount?.waves.map((w) => w.label).join("-"),
            wavePoints: candidate.waveCount?.waves.map((w) => ({
              label: w.label,
              price: w.price,
              date: w.timestamp && candidate.series
                ? new Date(w.timestamp * 1000).toISOString().slice(0, 10)
                : candidate.series
                  ? new Date(candidate.series.timestamps[w.index] * 1000).toISOString().slice(0, 10)
                  : "unknown",
              type: w.type,
            })),
            alternatePosition: candidate.waveCount?.alternateCount?.position,
            fibExtensions: candidate.fibAnalysis?.extensions,
            confluenceZones: candidate.fibAnalysis?.confluenceZones,
          }),
        });

        const data = await res.json();
        setDeepAnalysis(data.analysis ?? "No analysis returned.");
        if (data.structured) {
          setDeepStructured(data.structured as DeepAnalysisResult);
        }
      } catch {
        setDeepAnalysis("Failed to generate analysis.");
      }
      setDeepLoading(false);
    },
    [htf, ltf, labels, mode]
  );

  // --- Save Scan ---
  const handleSave = useCallback(() => {
    const name = `${getModeConfig(mode).shortLabel} - ${universe} - ${new Date().toLocaleDateString()}`;
    saveScan(name, mode, universe, { minDecline, minMonths, minRecovery }, modeFiltered, labels);
    setSavedScans(loadScans());
  }, [mode, universe, minDecline, minMonths, minRecovery, modeFiltered, labels]);

  const handleLoadScan = useCallback((scan: SavedScan) => {
    setMode(scan.mode);
    setUniverse(scan.universe as UniverseKey);
    setMinDecline(scan.filters.minDecline);
    setMinMonths(scan.filters.minMonths);
    setMinRecovery(scan.filters.minRecovery);
    // Restore candidates (without series data)
    const restored = scan.candidates.map((c) => ({
      ...c,
      series: undefined,
    })) as EnhancedScoredCandidate[];
    setResults(restored);
    setLabels(scan.labels);
    setShowSaved(false);
  }, []);

  const handleDeleteScan = useCallback((id: string) => {
    deleteScan(id);
    setSavedScans(loadScans());
  }, []);

  // --- Helpers ---
  const scoreTextColor = (n: number) => {
    if (n >= 0.7) return "text-green-400";
    if (n >= 0.4) return "text-yellow-400";
    return "text-red-400";
  };

  const scoreBgColor = (n: number) => {
    if (n >= 0.7) return "bg-green-500";
    if (n >= 0.4) return "bg-yellow-500";
    return "bg-red-500";
  };

  const confidenceBadge = (tier: string) => {
    switch (tier) {
      case "high":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "probable":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const fmtYear = (y: number) => String(y);

  type DotStatus = "pass" | "warn" | "fail";
  const getDot = (value: number, threshold: number): DotStatus => {
    if (value >= threshold) return "pass";
    if (value >= threshold * 0.5) return "warn";
    return "fail";
  };
  const dotCss: Record<DotStatus, string> = {
    pass: "bg-green-400",
    warn: "bg-yellow-400",
    fail: "bg-red-400",
  };

  return (
    <div className="space-y-6">
      {/* API key warning */}
      {apiKeyMissing && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-400" />
          <div className="text-sm">
            <p className="font-medium text-yellow-400">ANTHROPIC_API_KEY not configured</p>
            <p className="text-yellow-400/70">
              AI wave labeling and deep analysis are disabled. Scanning and scoring still work.
            </p>
          </div>
          <button onClick={() => setApiKeyMissing(false)} className="ml-auto shrink-0 p-1 text-yellow-400/50 hover:text-yellow-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Subtitle */}
      <p className="text-[#a0a0a0]">
        Algorithmic wave counting, Fibonacci analysis, and AI-powered deep analysis across 180+ stocks.
      </p>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── Left Panel ── */}
        <aside className="w-full shrink-0 space-y-3 lg:w-72">
          {/* Scanner Mode Tabs */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
            <button
              onClick={() => toggleSection("mode")}
              className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
            >
              <span>Scanner Mode</span>
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has("mode") ? "" : "rotate-90"}`} />
            </button>
            {!collapsed.has("mode") && (
              <div className="border-t border-[#2a2a2a] px-4 pb-4 pt-3">
                <Tabs.Root value={mode} onValueChange={(v) => handleModeChange(v as ScannerMode)}>
                  <Tabs.List className="grid grid-cols-2 gap-2">
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
                <p className="mt-2 text-[10px] leading-tight text-[#666]">
                  {modeConfig.description}
                </p>
              </div>
            )}
          </div>

          {/* Presets */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
            <button
              onClick={() => toggleSection("presets")}
              className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
            >
              <span>Quick Presets</span>
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has("presets") ? "" : "rotate-90"}`} />
            </button>
            {!collapsed.has("presets") && (
              <div className="border-t border-[#2a2a2a] px-4 pb-3 pt-2">
                <div className="space-y-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => applyPreset(p)}
                      className="group flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[#262626]"
                    >
                      <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-[#555] transition-colors group-hover:text-[#5ba3e6]" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#e6e6e6] group-hover:text-[#5ba3e6]">
                          {p.shortName}
                        </p>
                        <p className="text-[10px] leading-tight text-[#555] group-hover:text-[#888]">
                          {p.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* HTF + LTF (combined) */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
            <button
              onClick={() => toggleSection("timeframes")}
              className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
            >
              <span>Timeframes <span className="normal-case text-[#666]">({htf}/{ltf})</span></span>
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has("timeframes") ? "" : "rotate-90"}`} />
            </button>
            {!collapsed.has("timeframes") && (
              <div className="space-y-4 border-t border-[#2a2a2a] px-4 pb-4 pt-3">
                <div>
                  <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-[#666]">
                    HTF (Primary)
                  </label>
                  <div className="flex gap-2">
                    {HTF_OPTIONS.map((o) => (
                      <button
                        key={o}
                        onClick={() => setHtf(o)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                          htf === o
                            ? "bg-[#185FA5]/30 text-[#5ba3e6] ring-1 ring-[#185FA5]"
                            : "bg-[#262626] text-[#a0a0a0] hover:text-white"
                        }`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-[#666]">
                    LTF (Sub-wave)
                  </label>
                  <div className="flex gap-2">
                    {LTF_OPTIONS.map((o) => (
                      <button
                        key={o}
                        onClick={() => setLtf(o)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                          ltf === o
                            ? "bg-[#185FA5]/30 text-[#5ba3e6] ring-1 ring-[#185FA5]"
                            : "bg-[#262626] text-[#a0a0a0] hover:text-white"
                        }`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Universe */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
              Universe
            </label>
            <select
              value={universe}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setShowUniverseBuilder(true);
                } else {
                  setUniverse(e.target.value);
                }
              }}
              className="w-full rounded-md border border-[#2a2a2a] bg-[#262626] px-3 py-2 text-sm text-[#e6e6e6]"
            >
              {UNIVERSE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k} ({UNIVERSES[k].length})
                </option>
              ))}
              {loadCustomUniverses().map((u) => (
                <option key={u.id} value={`custom:${u.id}`}>
                  {u.name} ({u.tickers.length})
                </option>
              ))}
              <option value="__custom__">+ Custom...</option>
            </select>
          </div>

          {/* Sliders / Filters */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
            <button
              onClick={() => toggleSection("filters")}
              className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
            >
              <span>Filters <span className="normal-case text-[#666]">({minDecline}%/{minMonths}mo/{minRecovery}%)</span></span>
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has("filters") ? "" : "rotate-90"}`} />
            </button>
            {!collapsed.has("filters") && (
              <div className="space-y-4 border-t border-[#2a2a2a] px-4 pb-4 pt-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-[#a0a0a0]">Min Decline %</span>
                    <span className="font-mono text-[#5ba3e6]">{minDecline}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={80}
                    value={minDecline}
                    onChange={(e) => setMinDecline(Number(e.target.value))}
                    className="ew-slider w-full"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-[#a0a0a0]">Min Duration</span>
                    <span className="font-mono text-[#5ba3e6]">{minMonths}mo</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={36}
                    value={minMonths}
                    onChange={(e) => setMinMonths(Number(e.target.value))}
                    className="ew-slider w-full"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-[#a0a0a0]">Min Recovery %</span>
                    <span className="font-mono text-[#5ba3e6]">{minRecovery}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={200}
                    value={minRecovery}
                    onChange={(e) => setMinRecovery(Number(e.target.value))}
                    className="ew-slider w-full"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Scan Button */}
          {scanning ? (
            <button
              onClick={cancelScan}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          ) : (
            <button
              onClick={runScan}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#185FA5] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1a6dba]"
            >
              <Search className="h-4 w-4" />
              Scan
            </button>
          )}

          {progress && (
            <p className="text-center text-xs text-[#a0a0a0]">{progress}</p>
          )}

          {/* Saved Scans */}
          {savedScans.length > 0 && (
            <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
              <button
                onClick={() => setShowSaved(!showSaved)}
                className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
              >
                <span className="flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5" />
                  Saved Scans ({savedScans.length})
                </span>
                <ChevronRight
                  className={`h-3.5 w-3.5 transition-transform ${showSaved ? "rotate-90" : ""}`}
                />
              </button>
              {showSaved && (
                <div className="mt-3 space-y-2">
                  {savedScans.map((scan) => (
                    <div
                      key={scan.id}
                      className="flex items-center justify-between rounded-md bg-[#262626] px-2.5 py-1.5"
                    >
                      <button
                        onClick={() => handleLoadScan(scan)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-xs text-[#e6e6e6]">{scan.name}</p>
                        <p className="text-[10px] text-[#666]">
                          {scan.candidateCount} results
                        </p>
                      </button>
                      <button
                        onClick={() => handleDeleteScan(scan.id)}
                        className="ml-2 shrink-0 p-1 text-[#666] hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── Right Panel ── */}
        <div className="flex-1 space-y-4">
          {/* Ticker Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#555]" />
              <input
                value={tickerSearch}
                onChange={(e) => setTickerSearch(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && runTickerSearch()}
                placeholder="Search any ticker (e.g. AAPL, TSLA)..."
                className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2.5 pl-10 pr-3 text-sm text-white placeholder-[#555] transition-colors focus:border-[#185FA5] focus:outline-none"
              />
            </div>
            <button
              onClick={runTickerSearch}
              disabled={tickerSearching || !tickerSearch.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-[#185FA5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1a6dba] disabled:opacity-50"
            >
              {tickerSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Analyze
            </button>
          </div>

          {/* Ticker search result */}
          {tickerResult && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  Ticker Lookup: {tickerResult.ticker}
                </h3>
                <button
                  onClick={() => { setTickerResult(null); setTickerLabel(null); setTickerSearch(""); }}
                  className="rounded p-1 text-[#666] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <CandidateCard
                  c={tickerResult}
                  idx={0}
                  labels={tickerLabel ? { [tickerResult.ticker]: tickerLabel } : {}}
                  labeling={tickerSearching}
                  minDecline={minDecline}
                  minMonths={minMonths}
                  minRecovery={minRecovery}
                  getDot={getDot}
                  dotCss={dotCss}
                  scoreTextColor={scoreTextColor}
                  scoreBgColor={scoreBgColor}
                  confidenceBadge={confidenceBadge}
                  fmtYear={fmtYear}
                  runDeep={runDeep}
                  mode={mode}
                />
              </div>
            </div>
          )}

          {/* Export + Stats + Sort/Group bar */}
          {results.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-[#a0a0a0]">
                    <span className="font-bold text-white">{modeFiltered.length}</span> passed
                  </span>
                  <span className="text-[#a0a0a0]">
                    <span className="font-bold text-white">{results.length - modeFiltered.length}</span> filtered
                  </span>
                  {labeling && (
                    <span className="flex items-center gap-1 text-[#5ba3e6]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Labeling...
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-[#a0a0a0] transition-colors hover:text-white"
                    title="Save this scan"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </button>
                  <button
                    onClick={() => exportEnhancedToExcel(modeFiltered, labels, mode)}
                    className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-[#a0a0a0] transition-colors hover:text-white"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel
                  </button>
                  <button
                    onClick={() => exportEnhancedToCsv(modeFiltered, labels, mode)}
                    className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-[#a0a0a0] transition-colors hover:text-white"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    CSV
                  </button>
                  <button
                    onClick={() => setShowAlertConfig(true)}
                    className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-[#a0a0a0] transition-colors hover:text-white"
                    title="Send Telegram alert"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    Alert
                  </button>
                </div>
              </div>

              {/* Sort + Group controls */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="h-3.5 w-3.5 text-[#666]" />
                  <Select.Root value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                    <Select.Trigger className="inline-flex items-center gap-1 rounded-md border border-[#2a2a2a] bg-[#262626] px-2.5 py-1 text-xs text-[#a0a0a0]">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="rounded-md border border-[#2a2a2a] bg-[#1a1a1a] p-1 shadow-xl">
                        <Select.Viewport>
                          {(["score", "decline", "recovery", "sector", "confidence"] as SortKey[]).map((k) => (
                            <Select.Item
                              key={k}
                              value={k}
                              className="cursor-pointer rounded px-3 py-1.5 text-xs text-[#a0a0a0] outline-none hover:bg-[#262626] hover:text-white data-[highlighted]:bg-[#262626] data-[highlighted]:text-white"
                            >
                              <Select.ItemText>Sort: {k}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>

                <div className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-[#666]" />
                  <Select.Root value={groupBy} onValueChange={(v) => setGroupBy(v as GroupKey)}>
                    <Select.Trigger className="inline-flex items-center gap-1 rounded-md border border-[#2a2a2a] bg-[#262626] px-2.5 py-1 text-xs text-[#a0a0a0]">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="rounded-md border border-[#2a2a2a] bg-[#1a1a1a] p-1 shadow-xl">
                        <Select.Viewport>
                          {(["none", "sector", "confidence"] as GroupKey[]).map((k) => (
                            <Select.Item
                              key={k}
                              value={k}
                              className="cursor-pointer rounded px-3 py-1.5 text-xs text-[#a0a0a0] outline-none hover:bg-[#262626] hover:text-white data-[highlighted]:bg-[#262626] data-[highlighted]:text-white"
                            >
                              <Select.ItemText>Group: {k}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  icon={<BarChart3 className="h-4 w-4 text-[#5ba3e6]" />}
                  label="Scanned"
                  value={String(results.length)}
                />
                <StatCard
                  icon={<TrendingDown className="h-4 w-4 text-red-400" />}
                  label="Avg Decline"
                  value={`${(modeFiltered.reduce((s, r) => s + r.declinePct, 0) / (modeFiltered.length || 1)).toFixed(1)}%`}
                />
                <StatCard
                  icon={<Clock className="h-4 w-4 text-yellow-400" />}
                  label="Avg Duration"
                  value={`${(modeFiltered.reduce((s, r) => s + r.monthsDecline, 0) / (modeFiltered.length || 1)).toFixed(0)}mo`}
                />
                <StatCard
                  icon={<TrendingUp className="h-4 w-4 text-green-400" />}
                  label="Avg Recovery"
                  value={`${(modeFiltered.reduce((s, r) => s + r.recoveryPct, 0) / (modeFiltered.length || 1)).toFixed(1)}%`}
                />
              </div>

              {/* Sector heatmap when grouping by sector */}
              {groupBy === "sector" && (
                <EWSectorHeatmap candidates={modeFiltered} />
              )}
            </>
          )}

          {/* Empty state */}
          {results.length === 0 && !scanning && (
            <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-12 text-center">
              <Activity className="mx-auto h-12 w-12 text-[#333]" />
              <h2 className="mt-4 text-lg font-semibold text-white">
                Ready to Scan
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#a0a0a0]">
                Choose a scanner mode, pick a universe, adjust your filters, then hit Scan. Results will show
                scored candidates with Fibonacci analysis, wave counts, and AI labels.
              </p>
              <div className="mx-auto mt-6 grid max-w-lg grid-cols-4 gap-3">
                <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                  <p className="text-2xl font-bold text-[#5ba3e6]">4</p>
                  <p className="text-[10px] text-[#666]">Scanner Modes</p>
                </div>
                <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                  <p className="text-2xl font-bold text-[#5ba3e6]">180+</p>
                  <p className="text-[10px] text-[#666]">Stocks</p>
                </div>
                <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                  <p className="text-2xl font-bold text-[#5ba3e6]">20pt</p>
                  <p className="text-[10px] text-[#666]">Scoring</p>
                </div>
                <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                  <p className="text-2xl font-bold text-[#5ba3e6]">AI</p>
                  <p className="text-[10px] text-[#666]">Wave Labels</p>
                </div>
              </div>
            </div>
          )}

          {/* Scanning skeleton */}
          {scanning && results.length === 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4"
                >
                  <div className="mb-3 h-5 w-20 rounded bg-[#262626]" />
                  <div className="mb-2 h-3 w-full rounded bg-[#262626]" />
                  <div className="h-3 w-3/4 rounded bg-[#262626]" />
                </div>
              ))}
            </div>
          )}

          {/* Result cards (grouped or flat) */}
          {grouped.map(({ groupLabel, items }) => (
            <div key={groupLabel}>
              {groupLabel !== "__all__" && (
                <h3 className="mb-2 mt-4 text-sm font-semibold text-[#a0a0a0]">
                  {groupLabel}
                  <span className="ml-2 text-xs text-[#666]">({items.length})</span>
                </h3>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((c, idx) => (
                  <CandidateCard
                    key={c.ticker}
                    c={c}
                    idx={idx}
                    labels={labels}
                    labeling={labeling}
                    minDecline={minDecline}
                    minMonths={minMonths}
                    minRecovery={minRecovery}
                    getDot={getDot}
                    dotCss={dotCss}
                    scoreTextColor={scoreTextColor}
                    scoreBgColor={scoreBgColor}
                    confidenceBadge={confidenceBadge}
                    fmtYear={fmtYear}
                    runDeep={runDeep}
                    mode={mode}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Filtered out (collapsed) */}
          {results.length > modeFiltered.length && (
            <details className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
              <summary className="cursor-pointer px-4 py-3 text-sm text-[#a0a0a0] hover:text-white">
                {results.length - modeFiltered.length} tickers filtered out
              </summary>
              <div className="border-t border-[#2a2a2a] px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const passedSet = new Set(modeFiltered.map((c) => c.ticker));
                    return results
                      .filter((c) => !passedSet.has(c.ticker))
                      .map((c) => (
                        <span
                          key={c.ticker}
                          className="rounded bg-[#262626] px-2 py-0.5 text-xs text-[#666]"
                          title={`Score: ${c.enhancedScore.toFixed(1)}/${c.enhancedMax} | Decline: ${c.declinePct.toFixed(1)}% | Recovery: ${c.recoveryPct.toFixed(1)}%`}
                        >
                          {c.ticker}
                        </span>
                      ));
                  })()}
                </div>
              </div>
            </details>
          )}
        </div>
      </div>

      {/* ── Deep Analysis Modal ── */}
      {deepTicker && (
        <Dialog.Root open onOpenChange={() => setDeepTicker(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Dialog.Title className="text-lg font-bold text-white">
                    {deepTicker}
                  </Dialog.Title>
                  {deepStructured?.wavePosition && (
                    <span className="rounded-full bg-[#185FA5]/30 px-2.5 py-0.5 text-xs font-medium text-[#5ba3e6]">
                      {deepStructured.wavePosition}
                    </span>
                  )}
                  {deepStructured?.confidence && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${confidenceBadge(deepStructured.confidence)}`}
                    >
                      {deepStructured.confidence}
                    </span>
                  )}
                  {deepStructured?.riskLevel && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        deepStructured.riskLevel === "Low"
                          ? "bg-green-500/20 text-green-400"
                          : deepStructured.riskLevel === "High"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-yellow-500/20 text-yellow-400"
                      }`}
                    >
                      Risk: {deepStructured.riskLevel}
                    </span>
                  )}
                </div>
                <Dialog.Close className="rounded-md p-1 text-[#a0a0a0] hover:text-white">
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>

              {/* Tab switcher */}
              <div className="mb-4 flex gap-2 border-b border-[#2a2a2a] pb-2">
                <button
                  onClick={() => setDeepTab("analysis")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    deepTab === "analysis"
                      ? "bg-[#185FA5]/30 text-[#5ba3e6] ring-1 ring-[#185FA5]"
                      : "bg-[#262626] text-[#a0a0a0] hover:text-white"
                  }`}
                >
                  Analysis
                </button>
                {deepCandidate?.series && (
                  <button
                    onClick={() => setDeepTab("chart")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      deepTab === "chart"
                        ? "bg-[#185FA5]/30 text-[#5ba3e6] ring-1 ring-[#185FA5]"
                        : "bg-[#262626] text-[#a0a0a0] hover:text-white"
                    }`}
                  >
                    Chart
                  </button>
                )}
              </div>

              {deepTab === "chart" && deepCandidate?.series ? (
                <div className="flex justify-center">
                  <EWDeepChart
                    series={deepCandidate.series}
                    waveLabels={deepCandidate.waveCount?.waves}
                    fibLevels={deepCandidate.fibAnalysis?.levels}
                    fibExtensions={deepCandidate.fibAnalysis?.extensions}
                    keyLevels={deepStructured?.keyLevels}
                    width={600}
                    height={360}
                  />
                </div>
              ) : deepLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-[#5ba3e6]" />
                  <span className="ml-2 text-sm text-[#a0a0a0]">Analyzing...</span>
                </div>
              ) : deepStructured?.primaryCount ? (
                <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-2">
                  {/* Primary & Alternate counts */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-[#666]">Primary Count</p>
                      <p className="mt-1 text-sm text-[#e6e6e6]">{deepStructured.primaryCount}</p>
                    </div>
                    <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-[#666]">Alternate Count</p>
                      <p className="mt-1 text-sm text-[#e6e6e6]">{deepStructured.alternateCount || "N/A"}</p>
                    </div>
                  </div>

                  {/* Wave Count Quality (V3) */}
                  {deepCandidate?.waveCount && (
                    <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-[#666]">Algorithmic Wave Count</p>
                      <div className="mt-1 flex items-center gap-3">
                        <span className="text-sm font-bold text-purple-300">
                          {deepCandidate.waveCount.waves.map((w) => w.label).join("-")}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          deepCandidate.waveCount.isValid
                            ? "bg-green-500/20 text-green-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}>
                          {deepCandidate.waveCount.isValid ? "Valid" : "Partial"} ({deepCandidate.waveCount.score}/100)
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-purple-200/70">{deepCandidate.waveCount.position}</p>
                      {deepCandidate.waveCount.violations.length > 0 && (
                        <p className="mt-1 text-[10px] text-red-400/70">
                          Violations: {deepCandidate.waveCount.violations.join(", ")}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Target & Invalidation */}
                  <div className="grid grid-cols-2 gap-3">
                    {deepStructured.nextTarget && (
                      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-[#666]">Next Target</p>
                        <p className="mt-1 text-lg font-bold text-green-400">
                          ${deepStructured.nextTarget.toFixed(2)}
                        </p>
                      </div>
                    )}
                    {deepStructured.invalidation && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-[#666]">Invalidation</p>
                        <p className="mt-1 text-lg font-bold text-red-400">
                          ${deepStructured.invalidation.toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Confluence Zones (V3) */}
                  {deepCandidate?.fibAnalysis?.confluenceZones && deepCandidate.fibAnalysis.confluenceZones.length > 0 && (
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                      <p className="mb-2 text-[10px] uppercase tracking-wider text-[#666]">Confluence Zones</p>
                      <div className="space-y-1">
                        {deepCandidate.fibAnalysis.confluenceZones.map((z, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-[#5ba3e6]">{z.levels.join(" + ")}</span>
                            <span className="font-mono text-[#e6e6e6]">${z.price.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Levels */}
                  {deepStructured.keyLevels?.length > 0 && (
                    <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
                      <p className="mb-2 text-[10px] uppercase tracking-wider text-[#666]">Key Levels</p>
                      <div className="grid grid-cols-2 gap-2">
                        {deepStructured.keyLevels.map((kl, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-[#a0a0a0]">{kl.label}</span>
                            <span className="font-mono text-[#e6e6e6]">${kl.price.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#c0c0c0]">
                    {deepStructured.summary}
                  </div>
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto pr-2">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#c0c0c0]">
                    {deepAnalysis}
                  </div>
                </div>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      {/* ── Universe Builder Modal ── */}
      <EWUniverseBuilder
        open={showUniverseBuilder}
        onOpenChange={setShowUniverseBuilder}
        onUniverseCreated={() => {
          setCustomUniverseKeys(loadCustomUniverses().map((u) => `custom:${u.id}`));
        }}
      />

      {/* ── Alert Config Modal ── */}
      <EWAlertConfig
        open={showAlertConfig}
        onOpenChange={setShowAlertConfig}
        defaultMode={mode}
        defaultUniverse={universe}
        defaultFilters={{ minDecline, minMonths, minRecovery }}
      />
    </div>
  );
}

// ── Sub-components ──

function CandidateCard({
  c,
  idx,
  labels,
  labeling,
  minDecline,
  minMonths,
  minRecovery,
  getDot,
  dotCss,
  scoreTextColor,
  scoreBgColor,
  confidenceBadge,
  fmtYear,
  runDeep,
  mode,
}: {
  c: EnhancedScoredCandidate;
  idx: number;
  labels: Record<string, string>;
  labeling: boolean;
  minDecline: number;
  minMonths: number;
  minRecovery: number;
  getDot: (value: number, threshold: number) => "pass" | "warn" | "fail";
  dotCss: Record<string, string>;
  scoreTextColor: (n: number) => string;
  scoreBgColor: (n: number) => string;
  confidenceBadge: (tier: string) => string;
  fmtYear: (y: number) => string;
  runDeep: (c: EnhancedScoredCandidate) => void;
  mode: ScannerMode;
}) {
  const [wlOpen, setWlOpen] = useState(false);
  const [wlAdded, setWlAdded] = useState<string | null>(null);
  const watchlists = wlOpen ? loadWatchlists() : [];
  const pct = Math.round(c.enhancedNormalized * 100);
  const isHigh = c.enhancedNormalized >= 0.7;
  const declineDot = getDot(c.declinePct, minDecline);
  const directionDot: "pass" | "warn" | "fail" = c.athYear <= c.lowYear ? "pass" : "fail";
  const durationDot = getDot(c.monthsDecline, minMonths);
  const recoveryDot = getDot(c.recoveryPct, minRecovery);

  return (
    <div
      className={`ew-card-in group rounded-lg border bg-[#1a1a1a] transition-colors hover:border-[#3a3a3a] ${
        isHigh ? "border-green-500/40" : "border-[#2a2a2a]"
      }`}
      style={{ animationDelay: `${idx * 50}ms` }}
    >
      {/* Top: Ticker + Score + Confidence */}
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-base font-bold text-white">{c.ticker}</span>
          <span className="truncate text-xs text-[#a0a0a0]">{c.name}</span>
          <span
            className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${confidenceBadge(c.confidenceTier)}`}
          >
            {c.confidenceTier}
          </span>
          {c.mtfConfirmation && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                c.mtfConfirmation.alignment === "confirmed"
                  ? "bg-green-500/20 text-green-400"
                  : c.mtfConfirmation.alignment === "conflicting"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-yellow-500/20 text-yellow-400"
              }`}
              title={c.mtfConfirmation.details}
            >
              MTF {c.mtfConfirmation.alignment === "confirmed" ? "\u2713" : c.mtfConfirmation.alignment === "conflicting" ? "\u2717" : "?"}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="h-1.5 w-10 overflow-hidden rounded-full bg-[#262626]">
            <div
              className={`h-full rounded-full ${scoreBgColor(c.enhancedNormalized)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`text-sm font-bold ${scoreTextColor(c.enhancedNormalized)}`}>
            {pct}%
          </span>
        </div>
      </div>

      {/* Body: Finding rows */}
      <div className="space-y-1.5 px-4 pt-3 pb-1">
        <FindingRow dot={declineDot} dotCss={dotCss} label="Decline" value={`${c.declinePct.toFixed(1)}% (\u2265${minDecline}%)`} />
        <FindingRow dot={directionDot} dotCss={dotCss} label="Direction" value={directionDot === "pass" ? "ATH \u2192 Low correct" : "ATH after Low"} />
        <FindingRow dot={durationDot} dotCss={dotCss} label="Duration" value={`${c.monthsDecline.toFixed(0)}mo (\u2265${minMonths}mo)`} />
        <FindingRow dot={recoveryDot} dotCss={dotCss} label="Recovery" value={`${c.recoveryPct.toFixed(1)}% (\u2265${minRecovery}%)`} />

        {/* New analysis dots */}
        {c.fibAnalysis && (
          <FindingRow
            dot={c.fibAnalysis.withinGoldenZone ? "pass" : c.fibAnalysis.retracementDepth >= 0.236 ? "warn" : "fail"}
            dotCss={dotCss}
            label="Fib Zone"
            value={c.fibAnalysis.depthLabel}
          />
        )}
        {c.volumeAnalysis && (
          <FindingRow
            dot={c.volumeAnalysis.confirmation ? "pass" : c.volumeAnalysis.volumeTrend === "neutral" ? "warn" : "fail"}
            dotCss={dotCss}
            label="Volume"
            value={c.volumeAnalysis.volumeTrend}
          />
        )}
        {c.structureAnalysis && (
          <FindingRow
            dot={c.structureAnalysis.classification === "impulsive" ? "pass" : c.structureAnalysis.classification === "corrective" ? "warn" : "fail"}
            dotCss={dotCss}
            label="Structure"
            value={`${c.structureAnalysis.classification} (${c.structureAnalysis.swingCount} swings)`}
          />
        )}
        {c.waveCount && (
          <FindingRow
            dot={c.waveCount.isValid && c.waveCount.score >= 50 ? "pass" : c.waveCount.score > 30 ? "warn" : "fail"}
            dotCss={dotCss}
            label="Wave Count"
            value={`${c.waveCount.waves.map((w) => w.label).join("-")} (${c.waveCount.score}/100${c.waveCount.isValid ? " valid" : ""})`}
          />
        )}
        {c.waveCount?.position && (
          <div className="flex items-start gap-2 text-xs">
            <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-purple-400" />
            <span className="text-purple-300">{c.waveCount.position}</span>
          </div>
        )}
        {c.fibAnalysis?.extensions && c.fibAnalysis.extensions.length > 0 && (
          <div className="flex items-start gap-2 text-xs">
            <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-blue-400" />
            <span className="text-[#a0a0a0]">
              <span className="text-[#c0c0c0]">Targets:</span>{" "}
              {c.fibAnalysis.extensions.slice(0, 3).map((e) => `$${e.price.toFixed(0)}`).join(", ")}
            </span>
          </div>
        )}

        {/* EW Label */}
        {labels[c.ticker] ? (
          <div className="flex items-start gap-2 text-xs">
            <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-cyan-400" />
            <span className="text-[#5ba3e6]">{labels[c.ticker]}</span>
          </div>
        ) : labeling ? (
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#333]" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-[#262626]" />
          </div>
        ) : null}
      </div>

      {/* Sparkline */}
      {c.series && (
        <div className="flex justify-center px-4 py-1">
          <EWSparkline
            series={c.series}
            athIdx={c.athIdx}
            lowIdx={c.lowIdx}
            fibLevels={c.fibAnalysis?.levels}
            waveLabels={c.waveCount?.waves}
            width={200}
            height={50}
          />
        </div>
      )}

      {/* Fib Bar */}
      {c.fibAnalysis && (
        <div className="flex justify-center px-4 pb-1">
          <EWFibBar retracementDepth={c.fibAnalysis.retracementDepth} extensions={c.fibAnalysis.extensions} width={200} height={22} />
        </div>
      )}

      {/* Price Grid */}
      <div className="mx-4 grid grid-cols-3 gap-2 border-t border-[#2a2a2a] py-3 text-center text-xs">
        <div>
          <p className="text-[#666]">ATH</p>
          <p className="font-mono font-medium text-[#e6e6e6]">${c.ath.toFixed(2)}</p>
          <p className="text-[#555]">{fmtYear(c.athYear)}</p>
        </div>
        <div>
          <p className="text-[#666]">Low</p>
          <p className="font-mono font-medium text-red-400">${c.low.toFixed(2)}</p>
          <p className="text-[#555]">{fmtYear(c.lowYear)}</p>
        </div>
        <div>
          <p className="text-[#666]">Current</p>
          <p className="font-mono font-medium text-green-400">${c.current.toFixed(2)}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[#2a2a2a] px-4 py-2.5">
        <div className="flex gap-3 text-xs text-[#a0a0a0]">
          <span>
            <TrendingDown className="mr-0.5 inline h-3 w-3 text-red-400" />
            {c.declinePct.toFixed(1)}%
          </span>
          <span>
            <Clock className="mr-0.5 inline h-3 w-3 text-yellow-400" />
            {c.monthsDecline.toFixed(0)}mo
          </span>
          <span>
            <TrendingUp className="mr-0.5 inline h-3 w-3 text-green-400" />
            {c.recoveryPct.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <button
              onClick={() => setWlOpen(!wlOpen)}
              className="flex items-center gap-1 rounded-md border border-[#2a2a2a] bg-[#262626] px-2 py-1 text-xs text-[#a0a0a0] transition-colors hover:border-[#3a3a3a] hover:text-white"
              title="Add to watchlist"
            >
              {wlAdded ? <Check className="h-3 w-3 text-green-400" /> : <ListPlus className="h-3 w-3" />}
            </button>
            {wlOpen && (
              <div className="absolute bottom-full right-0 z-50 mb-1 w-44 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] p-1 shadow-xl">
                {watchlists.length === 0 ? (
                  <p className="px-2 py-1.5 text-[10px] text-[#666]">No watchlists. Create one on the Watchlists page.</p>
                ) : (
                  watchlists.map((wl) => (
                    <button
                      key={wl.id}
                      onClick={() => {
                        const ok = addToWatchlist(wl.id, c, mode);
                        setWlOpen(false);
                        if (ok) { setWlAdded(wl.id); setTimeout(() => setWlAdded(null), 1500); }
                      }}
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs text-[#a0a0a0] hover:bg-[#262626] hover:text-white"
                    >
                      <span className="truncate">{wl.name}</span>
                      <span className="text-[10px] text-[#555]">{wl.items.length}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => runDeep(c)}
            className="flex items-center gap-1 rounded-md border border-[#2a2a2a] bg-[#262626] px-2.5 py-1 text-xs text-[#a0a0a0] transition-colors hover:border-[#3a3a3a] hover:text-white"
          >
            Deep Analysis
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FindingRow({
  dot,
  dotCss,
  label,
  value,
}: {
  dot: "pass" | "warn" | "fail";
  dotCss: Record<string, string>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${dotCss[dot]}`} />
      <span className="text-[#a0a0a0]">
        <span className="text-[#c0c0c0]">{label}:</span> {value}
      </span>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <p className="text-xs text-[#a0a0a0]">{label}</p>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}

// ── Grouping helper ──

function groupCandidates(
  candidates: EnhancedScoredCandidate[],
  groupKey: GroupKey
): { groupLabel: string; items: EnhancedScoredCandidate[] }[] {
  if (groupKey === "none") {
    return [{ groupLabel: "__all__", items: candidates }];
  }

  const map = new Map<string, EnhancedScoredCandidate[]>();
  for (const c of candidates) {
    let key: string;
    switch (groupKey) {
      case "sector":
        key = c.sector ?? "Other";
        break;
      case "confidence":
        key = c.confidenceTier;
        break;
      default:
        key = "All";
    }
    const arr = map.get(key) ?? [];
    arr.push(c);
    map.set(key, arr);
  }

  const groups = Array.from(map.entries()).map(([groupLabel, items]) => ({
    groupLabel,
    items,
  }));

  // Confidence groups: fixed semantic order (high → probable → speculative)
  if (groupKey === "confidence") {
    const order: Record<string, number> = { high: 0, probable: 1, speculative: 2 };
    groups.sort((a, b) => (order[a.groupLabel] ?? 99) - (order[b.groupLabel] ?? 99));
  } else {
    // Other groups: sort by item count (most first)
    groups.sort((a, b) => b.items.length - a.items.length);
  }

  return groups;
}
