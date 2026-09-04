"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, Download, Search, TrendingUp, TrendingDown, Minus, X } from "lucide-react";
import Link from "next/link";
import { TableErrorBoundary } from "@/components/table-error-boundary";
import { formatDatePill, downloadCSV } from "@/lib/daily-page-utils";
import { isFocusTicker } from "@/data/focus-list";

// ── Types ──

interface Cell {
  px: number;
  se: number;
  dmd: number;
  cmp: number;
  run: number;
  rs: number;
  ovr: number;
  str: number | null;
  label: string;
}

interface TrendRow {
  ticker: string;
  sector: string | null;
  price: number;
  present: number;
  read: string;
  stage: string;
  isCoiled: boolean;
  isPrimary: boolean;
  isStronger: boolean;
  extensionRisk: boolean;
  byDate: Record<string, Cell>;
}

type Engine = "inflection" | "transition";
type Metric = "se" | "dmd" | "cmp" | "run" | "rs" | "ovr" | "str";
type Scope = "focus" | "all";
type SortField = "ticker" | "latest" | "change" | "present" | string;

const METRICS: { key: Metric; label: string; short: string; title: string; engine?: Engine }[] = [
  { key: "se",  label: "Seller Exhaustion", short: "SE",  title: "Supply Exhaustion — absorption, structural spring, range asymmetry, down-body contraction, distribution days" },
  { key: "dmd", label: "Buyer Demand",      short: "Dmd", title: "Demand Emergence — close location, pocket pivots, RVOL trajectory, OBV divergence, money flow, distance to breakout" },
  { key: "cmp", label: "Compression",       short: "Cmp", title: "Compression — ATR contraction, nested ranges, inside bars, tight closes, dry volume" },
  { key: "run", label: "Runner",            short: "Run", title: "Runner Potential — overhead supply, ATR%, base energy, float rotation, insider conviction, risk distance" },
  { key: "rs",  label: "RS",                short: "RS",  title: "RS Trajectory — acceleration vs SPY and the trend of that acceleration" },
  { key: "str", label: "Structure",         short: "Str", title: "Market structure — ChoCH and BOS quality. Transition only.", engine: "transition" },
  { key: "ovr", label: "Overall",           short: "Ovr", title: "Weighted composite across all components" },
];

/**
 * Colour thresholds are PERCENTILES OF THE LOADED WINDOW, computed per metric, not one
 * shared ramp. The components sit on very different scales — on a recent scan RS had a
 * median of 66 against Seller Exhaustion's 32 — so a fixed ramp would render RS uniformly
 * green and SE uniformly amber, encoding scale rather than strength. Percentiles also
 * survive recalibration, which fixed cutoffs do not; this matches the reasoning already
 * used by ComponentFilterBar on the daily pages.
 */
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

function valueClass(v: number, t: [number, number, number]): string {
  if (v >= t[0]) return "text-emerald-400";
  if (v >= t[1]) return "text-cyan-400";
  if (v >= t[2]) return "text-amber-400";
  return "text-red-400";
}

/**
 * Change across the window, measured between the first and last days that actually carry
 * a row. Missing days are skipped rather than read as zero — a gap means "not scored",
 * and treating it as a collapse to 0 would invent a move that never happened.
 */
function windowChange(row: TrendRow, dates: string[], metric: Metric): number | null {
  const present: number[] = [];
  for (const d of dates) {
    const c = row.byDate[d];
    if (c) {
      const v = c[metric];
      if (v !== null) present.push(v);
    }
  }
  if (present.length < 2) return null;
  return present[present.length - 1] - present[0];
}

function latestValue(row: TrendRow, dates: string[], metric: Metric): number | null {
  for (let i = dates.length - 1; i >= 0; i--) {
    const c = row.byDate[dates[i]];
    if (c) {
      const v = c[metric];
      if (v !== null) return v;
    }
  }
  return null;
}

/**
 * Supply exhausting while demand builds is the accumulation signature — either component
 * moving alone is ordinary noise. Deliberately a plain "both improved across the window"
 * with no magnitude floor: any cutoff here would be invented rather than calibrated, and
 * the two deltas are shown on hover so the size of the move stays visible.
 */
function bothRising(row: TrendRow, dates: string[]): { se: number; dmd: number } | null {
  const se = windowChange(row, dates, "se");
  const dmd = windowChange(row, dates, "dmd");
  if (se === null || dmd === null || se <= 0 || dmd <= 0) return null;
  return { se, dmd };
}

/** Percent price change between the first and last scans that carry a row, so it spans
 *  the same days the component change does and the two stay comparable. */
function priceChangePct(row: TrendRow, dates: string[]): number | null {
  const present: number[] = [];
  for (const d of dates) {
    const c = row.byDate[d];
    if (c && c.px > 0) present.push(c.px);
  }
  if (present.length < 2) return null;
  return ((present[present.length - 1] - present[0]) / present[0]) * 100;
}

/**
 * The component trend and the price trend pointing opposite ways.
 *
 * "Price up, component down" is the one worth catching — NVDA rose to $228 across the
 * window while Seller Exhaustion fell 45 to 21, so the tape improved while the evidence
 * behind it decayed. The mirror ("price down, component up") is the constructive case:
 * accumulation showing up under a falling price.
 *
 * Both legs need a real move or every flat row qualifies. A component is chunky and
 * slot-driven so a single step is meaningful; price needs a wider band than noise.
 */
const DIVERGENCE_MIN_SCORE = 5;
const DIVERGENCE_MIN_PRICE_PCT = 3;

type Divergence = { kind: "bearish" | "bullish"; score: number; price: number } | null;

function divergence(row: TrendRow, dates: string[], metric: Metric): Divergence {
  const s = windowChange(row, dates, metric);
  const p = priceChangePct(row, dates);
  if (s === null || p === null) return null;
  if (Math.abs(s) < DIVERGENCE_MIN_SCORE || Math.abs(p) < DIVERGENCE_MIN_PRICE_PCT) return null;
  if (p > 0 && s < 0) return { kind: "bearish", score: s, price: p };
  if (p < 0 && s > 0) return { kind: "bullish", score: s, price: p };
  return null;
}

const FLAGS = [
  { key: "isCoiled" as const,      label: "Coiled",    title: "Supply exhausted, compressed, real Runner Potential, not yet moving" },
  { key: "isPrimary" as const,     label: "Primary",   title: "Primary signal on the latest scan" },
  { key: "isStronger" as const,    label: "Stronger",  title: "Stronger signal — the higher conviction tier" },
  { key: "extensionRisk" as const, label: "Extended",  title: "Extension risk flagged — near highs or far from EMA" },
];

/**
 * RRG quadrant of the stock's SECTOR, from the newest sector_snapshots row — not a
 * property of the stock. LEADING+IMPROVING is offered as one choice because that pair is
 * the actual "rotation is with me" question: IMPROVING is where a sector turns and LEADING
 * is where it is already working, and narrowing to either alone splits that in half.
 */
const QUADRANTS = [
  { key: "LEADING",   label: "Leading",   match: ["LEADING"] },
  { key: "IMPROVING", label: "Improving", match: ["IMPROVING"] },
  { key: "LEAD_IMP",  label: "Lead+Imp",  match: ["LEADING", "IMPROVING"] },
  { key: "WEAKENING", label: "Weakening", match: ["WEAKENING"] },
  { key: "LAGGING",   label: "Lagging",   match: ["LAGGING"] },
];

const QUADRANT_STYLE: Record<string, string> = {
  LEADING:   "bg-emerald-500/15 text-emerald-400",
  IMPROVING: "bg-cyan-500/15 text-cyan-400",
  WEAKENING: "bg-amber-500/15 text-amber-400",
  LAGGING:   "bg-red-500/15 text-red-400",
};

const SCORE_TIERS = [
  { label: "Top 50%", q: 0.5 },
  { label: "Top 25%", q: 0.75 },
  { label: "Top 10%", q: 0.9 },
];

// ── Page ──

export default function TrendPage() {
  const [engine, setEngine] = useState<Engine>("inflection");
  const [metricChoice, setMetric] = useState<Metric>("se");
  const [scope, setScope] = useState<Scope>("focus");
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("latest");
  const [sortAsc, setSortAsc] = useState(false);

  // Filters
  const [sector, setSector] = useState("");
  const [stage, setStage] = useState("");
  const [read, setRead] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [risingOnly, setRisingOnly] = useState(false);
  const [quadrant, setQuadrant] = useState("");
  const [divergeOnly, setDivergeOnly] = useState("");
  const [fullOnly, setFullOnly] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  const [dates, setDates] = useState<string[]>([]);
  const [rows, setRows] = useState<TrendRow[]>([]);
  const [quadrants, setQuadrants] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/trend?engine=${engine}&days=${days}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as {
          dates: string[];
          rows: TrendRow[];
          quadrants?: Record<string, string>;
        };
        if (cancelled) return;
        setDates(d.dates ?? []);
        setRows(d.rows ?? []);
        setQuadrants(d.quadrants ?? {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [engine, days]);

  const metrics = useMemo(
    () => METRICS.filter((m) => !m.engine || m.engine === engine),
    [engine],
  );

  // Structure exists only on Transition. Derive the effective metric rather than
  // correcting state in an effect — switching to Inflection while Structure is selected
  // falls back on the next render, with no extra pass and nothing to keep in sync.
  const metric: Metric = metrics.some((m) => m.key === metricChoice) ? metricChoice : "se";

  /** Percentile thresholds for the active metric, from every loaded row's latest value.
   *  Computed before user filtering so narrowing the table does not move the colours. */
  const thresholds = useMemo<[number, number, number]>(() => {
    const vals = rows
      .map((r) => latestValue(r, dates, metric))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    return [quantile(vals, 0.75), quantile(vals, 0.5), quantile(vals, 0.25)];
  }, [rows, dates, metric]);

  const scoreOptions = useMemo(() => {
    const vals = rows
      .map((r) => latestValue(r, dates, metric))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    return SCORE_TIERS.map((t) => ({ label: `${t.label} (≥${quantile(vals, t.q)})`, min: quantile(vals, t.q) }));
  }, [rows, dates, metric]);

  const sectors = useMemo(
    () => [...new Set(rows.map((r) => r.sector).filter(Boolean))].sort() as string[],
    [rows],
  );
  const stages = useMemo(
    () => [...new Set(rows.map((r) => r.stage).filter(Boolean))].sort(),
    [rows],
  );
  const reads = useMemo(
    () => [...new Set(rows.map((r) => r.read).filter(Boolean))].sort(),
    [rows],
  );

  const activeFilters =
    (sector ? 1 : 0) + (stage ? 1 : 0) + (read ? 1 : 0) + (minScore ? 1 : 0) +
    (risingOnly ? 1 : 0) + (divergeOnly ? 1 : 0) + (fullOnly ? 1 : 0) + (quadrant ? 1 : 0) +
    Object.values(flags).filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setSector(""); setStage(""); setRead(""); setMinScore(0);
    setRisingOnly(false); setDivergeOnly(""); setFullOnly(false); setQuadrant(""); setFlags({});
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    const filtered = rows.filter((r) => {
      if (scope === "focus" && !isFocusTicker(r.ticker)) return false;
      if (q && !r.ticker.includes(q) && !(r.sector ?? "").toUpperCase().includes(q)) return false;
      if (sector && r.sector !== sector) return false;
      if (quadrant) {
        // A sector with no snapshot (the "Other" bucket) has no quadrant to match, so it
        // drops out whenever a quadrant is selected. That is the honest reading: the
        // filter asks about rotation, and those names are in no basket to rotate.
        const q = r.sector ? quadrants[r.sector] : undefined;
        const want = QUADRANTS.find((x) => x.key === quadrant);
        if (!q || !want || !want.match.includes(q)) return false;
      }
      if (stage && r.stage !== stage) return false;
      if (read && r.read !== read) return false;
      if (fullOnly && r.present !== dates.length) return false;
      if (risingOnly && !bothRising(r, dates)) return false;
      if (divergeOnly) {
        const d = divergence(r, dates, metric);
        if (!d || d.kind !== divergeOnly) return false;
      }
      for (const f of FLAGS) if (flags[f.key] && !r[f.key]) return false;
      if (minScore) {
        const v = latestValue(r, dates, metric);
        if (v === null || v < minScore) return false;
      }
      return true;
    });

    const dir = sortAsc ? 1 : -1;
    const nullsLast = (a: number | null, b: number | null) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return dir * (a - b);
    };

    return [...filtered].sort((a, b) => {
      if (sortField === "ticker") return dir * a.ticker.localeCompare(b.ticker);
      if (sortField === "present") return dir * (a.present - b.present);
      if (sortField === "price") return nullsLast(priceChangePct(a, dates), priceChangePct(b, dates));
      if (sortField === "change") return nullsLast(windowChange(a, dates, metric), windowChange(b, dates, metric));
      if (sortField === "latest") return nullsLast(latestValue(a, dates, metric), latestValue(b, dates, metric));
      // Any date column: sortField is the scan_date itself.
      const ca = a.byDate[sortField], cb = b.byDate[sortField];
      return nullsLast(ca ? ca[metric] : null, cb ? cb[metric] : null);
    });
  }, [rows, scope, search, sector, stage, read, minScore, risingOnly, divergeOnly, fullOnly,
      quadrant, quadrants, flags, sortField, sortAsc, dates, metric]);

  const handleSort = useCallback((f: SortField) => {
    setSortField((prev) => {
      if (prev === f) { setSortAsc((a) => !a); return prev; }
      setSortAsc(false);
      return f;
    });
  }, []);

  const handleExport = useCallback(() => {
    const active = metrics.find((m) => m.key === metric)!;
    const headers = ["Ticker", "Sector", "Quadrant", "Price", "Stage", "Read", "Days",
      ...dates.map(formatDatePill), "Change", "PricePct", "BothRising", "Divergence"];
    const lines = visible.map((r) => {
      const br = bothRising(r, dates);
      return [
        r.ticker,
        `"${(r.sector ?? "").replace(/"/g, '""')}"`,
        (r.sector && quadrants[r.sector]) || "",
        r.price,
        r.stage,
        r.read,
        `${r.present}/${dates.length}`,
        ...dates.map((d) => {
          const c = r.byDate[d];
          const v = c ? c[metric] : null;
          return v === null || v === undefined ? "" : String(v);
        }),
        windowChange(r, dates, metric) ?? "",
        priceChangePct(r, dates)?.toFixed(2) ?? "",
        br ? `SE+${br.se} Dmd+${br.dmd}` : "",
        divergence(r, dates, metric)?.kind ?? "",
      ].join(",");
    });
    downloadCSV(
      [headers.join(","), ...lines].join("\n"),
      `trend-${engine}-${active.short.toLowerCase()}-${dates[dates.length - 1] ?? "latest"}.csv`,
    );
  }, [visible, dates, metric, engine, metrics, quadrants]);

  const activeMetric = metrics.find((m) => m.key === metric) ?? metrics[0];
  const risingCount = useMemo(
    () => visible.filter((r) => bothRising(r, dates)).length,
    [visible, dates],
  );

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Component Trend</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#a0a0a0]">
            {activeMetric?.label} by day — one row per ticker, one column per scan. A dash
            means the scanner produced no row that day, which is not the same as a low score.
          </p>
        </div>
        <Link
          href="/prerun/inflection-daily"
          className="shrink-0 rounded-md bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#185FA5]/80"
        >
          Daily View
        </Link>
      </div>

      {/* Row 1 — what is being shown */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Toggle
          options={[["inflection", "Inflection"], ["transition", "Transition"]]}
          value={engine}
          onChange={(v) => setEngine(v as Engine)}
        />
        <span className="mx-1 h-5 w-px bg-[#2a2a2a]" />
        <Toggle
          options={metrics.map((m) => [m.key, m.label] as [string, string])}
          value={metric}
          onChange={(v) => setMetric(v as Metric)}
          titles={Object.fromEntries(metrics.map((m) => [m.key, m.title]))}
        />
        <span className="mx-1 h-5 w-px bg-[#2a2a2a]" />
        <Toggle
          options={[["focus", "Focus"], ["all", "All"]]}
          value={scope}
          onChange={(v) => setScope(v as Scope)}
        />
        <Toggle
          options={[["7", "7d"], ["14", "14d"], ["30", "30d"], ["90", "90d"], ["365", "All"]]}
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
        />
      </div>

      {/* Row 2 — narrowing */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-md border border-[#1e1e1e] bg-[#0d0d0d] px-3 py-2">
        <label className="flex items-center gap-1" title="RRG quadrant of the ticker's sector, from the latest sector snapshot">
          <span className={`text-[10px] font-medium ${quadrant ? "text-white" : "text-[#666]"}`}>Rotation</span>
          <div className="flex rounded border border-[#2a2a2a] bg-[#111] p-0.5">
            <button
              onClick={() => setQuadrant("")}
              aria-pressed={!quadrant}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${!quadrant ? "bg-[#185FA5]/25 text-[#5ba3e6]" : "text-[#666] hover:text-white"}`}
            >
              Any
            </button>
            {QUADRANTS.map((q) => (
              <button
                key={q.key}
                onClick={() => setQuadrant((v) => (v === q.key ? "" : q.key))}
                aria-pressed={quadrant === q.key}
                title={`Sectors currently ${q.match.join(" or ").toLowerCase()}`}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${quadrant === q.key ? "bg-[#185FA5]/25 text-[#5ba3e6]" : "text-[#666] hover:text-white"}`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </label>

        <Select value={sector} onChange={setSector} label="Sector" options={sectors} />
        <Select value={stage} onChange={setStage} label={engine === "inflection" ? "Stage" : "State"} options={stages} />
        <Select value={read} onChange={setRead} label={engine === "inflection" ? "Read" : "Alert"} options={reads} />

        <label className="flex items-center gap-1" title={`Minimum ${activeMetric?.label} on the latest scan`}>
          <span className={`text-[10px] font-medium ${minScore ? "text-white" : "text-[#666]"}`}>
            {activeMetric?.short} min
          </span>
          <select
            aria-label={`Minimum ${activeMetric?.label}`}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className={`rounded border bg-[#111] px-1.5 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-white/30 ${
              minScore ? "border-white/20 text-white" : "border-[#2a2a2a] text-[#666] hover:text-white"
            }`}
          >
            <option value={0}>Any</option>
            {scoreOptions.map((o) => (
              <option key={o.label} value={o.min}>{o.label}</option>
            ))}
          </select>
        </label>

        <Chip on={risingOnly} onClick={() => setRisingOnly((v) => !v)} title="Both Seller Exhaustion and Buyer Demand improved across the window">
          ◉ Both rising
        </Chip>
        <Chip
          on={divergeOnly === "bearish"}
          onClick={() => setDivergeOnly((v) => (v === "bearish" ? "" : "bearish"))}
          title={`Price rose but ${activeMetric?.label} fell across the window — the tape improved while the evidence behind it decayed`}
        >
          ⚠ Price up, score down
        </Chip>
        <Chip
          on={divergeOnly === "bullish"}
          onClick={() => setDivergeOnly((v) => (v === "bullish" ? "" : "bullish"))}
          title={`Price fell but ${activeMetric?.label} rose across the window — accumulation showing up under a falling price`}
        >
          ◈ Price down, score up
        </Chip>
        <Chip on={fullOnly} onClick={() => setFullOnly((v) => !v)} title="Only tickers scored on every scan in the window">
          No gaps
        </Chip>
        {FLAGS.map((f) => (
          <Chip key={f.key} on={!!flags[f.key]} onClick={() => setFlags((p) => ({ ...p, [f.key]: !p[f.key] }))} title={f.title}>
            {f.label}
          </Chip>
        ))}

        {activeFilters > 0 && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-0.5 rounded border border-amber-500/40 px-1.5 py-1 text-[10px] text-amber-400 hover:border-amber-400 hover:text-amber-300"
          >
            <X className="h-2.5 w-2.5" /> Clear {activeFilters}
          </button>
        )}

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#666]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ticker or sector"
            className="w-44 rounded-md border border-[#2a2a2a] bg-[#111] py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-[#555] focus:border-[#185FA5] focus:outline-none"
          />
        </div>
        <button
          onClick={handleExport}
          disabled={!visible.length}
          className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#111] px-3 py-1.5 text-sm text-[#a0a0a0] hover:text-white disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-16 text-sm text-[#a0a0a0]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading trend…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Could not load trend data: {error}
        </div>
      )}

      {!loading && !error && (
        <TableErrorBoundary>
          <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-[#111] text-[11px] uppercase tracking-wide text-[#888]">
                <tr>
                  <Th onClick={() => handleSort("ticker")} active={sortField === "ticker"} asc={sortAsc} align="left">Ticker</Th>
                  {dates.map((d) => (
                    <Th key={d} onClick={() => handleSort(d)} active={sortField === d} asc={sortAsc}>
                      {formatDatePill(d)}
                    </Th>
                  ))}
                  <Th onClick={() => handleSort("change")} active={sortField === "change"} asc={sortAsc}>Chg</Th>
                  <Th onClick={() => handleSort("price")} active={sortField === "price"} asc={sortAsc}>Price</Th>
                  <Th onClick={() => handleSort("present")} active={sortField === "present"} asc={sortAsc}>Days</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const chg = windowChange(r, dates, metric);
                  const rising = bothRising(r, dates);
                  const div = divergence(r, dates, metric);
                  const pxChg = priceChangePct(r, dates);
                  return (
                    <tr
                      key={r.ticker}
                      className={`border-t border-[#1e1e1e] hover:bg-[#141414] ${
                        rising ? "bg-emerald-500/[0.06]" : ""
                      }`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {isFocusTicker(r.ticker) && <span className="text-amber-400" title="Focus list">★</span>}
                          <span className="font-medium text-white">{r.ticker}</span>
                          {rising && (
                            <span
                              className="rounded-sm bg-emerald-500/15 px-1 py-px text-[9px] font-semibold text-emerald-400"
                              title={`Seller Exhaustion +${rising.se} and Buyer Demand +${rising.dmd} across the window`}
                            >
                              ◉ RISING
                            </span>
                          )}
                          {div && (
                            <span
                              className={`rounded-sm px-1 py-px text-[9px] font-semibold ${div.kind === "bearish" ? "bg-red-500/15 text-red-400" : "bg-sky-500/15 text-sky-400"}`}
                              title={`Price ${div.price > 0 ? "+" : ""}${div.price.toFixed(1)}% while ${activeMetric?.short} ${div.score > 0 ? "+" : ""}${div.score} across the window`}
                            >
                              {div.kind === "bearish" ? "⚠ DIVERGING" : "◈ ACCUM"}
                            </span>
                          )}
                          {r.isCoiled && (
                            <span className="rounded-sm bg-cyan-500/15 px-1 py-px text-[9px] font-semibold text-cyan-400" title="Coiled — supply exhausted, compressed, not yet moving">
                              COILED
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-[#666]">
                          <span>{r.sector ?? "—"}</span>
                          {r.sector && quadrants[r.sector] && (
                            <span
                              className={`rounded-sm px-1 text-[9px] font-semibold ${QUADRANT_STYLE[quadrants[r.sector]] ?? "bg-[#1a1a1a] text-[#888]"}`}
                              title={`Sector is ${quadrants[r.sector]} on the RRG`}
                            >
                              {quadrants[r.sector].slice(0, 4)}
                            </span>
                          )}
                        </div>
                      </td>
                      {dates.map((d) => {
                        const c = r.byDate[d];
                        const v = c ? c[metric] : null;
                        return (
                          <td key={d} className="px-3 py-2 text-center tabular-nums">
                            {v === null || v === undefined ? (
                              <span className="text-[#3a3a3a]" title="No row — not scored this day">—</span>
                            ) : (
                              <span className={`font-medium ${valueClass(v, thresholds)}`} title={c!.label}>{v}</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center tabular-nums">
                        {chg === null ? (
                          <span className="text-[#3a3a3a]">—</span>
                        ) : (
                          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                            chg > 0 ? "text-emerald-400" : chg < 0 ? "text-red-400" : "text-[#888]"
                          }`}>
                            {chg > 0 ? <TrendingUp className="h-3 w-3" /> : chg < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {chg > 0 ? `+${chg}` : chg}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {pxChg === null ? (
                          <span className="text-[#3a3a3a]">—</span>
                        ) : (
                          <span
                            className={`text-xs font-medium ${pxChg > 0 ? "text-emerald-400/80" : pxChg < 0 ? "text-red-400/80" : "text-[#888]"}`}
                            title={`$${r.price.toFixed(2)} — ${pxChg > 0 ? "+" : ""}${pxChg.toFixed(1)}% across the window`}
                          >
                            {pxChg > 0 ? "+" : ""}{pxChg.toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs tabular-nums ${r.present === dates.length ? "text-[#888]" : "text-amber-400/80"}`}>
                          {r.present}/{dates.length}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!visible.length && (
            <p className="py-12 text-center text-sm text-[#666]">
              No tickers match.{activeFilters > 0 ? " Try clearing filters." : scope === "focus" ? " Try switching to All." : ""}
            </p>
          )}

          <p className="mt-3 text-xs text-[#666]">
            {visible.length} tickers · {dates.length} scans
            {dates.length > 0 ? ` · ${formatDatePill(dates[0])} to ${formatDatePill(dates[dates.length - 1])}` : ""}
            {risingCount > 0 ? ` · ${risingCount} with SE and Demand both rising` : ""}
            {" · "}colours are percentiles of {activeMetric?.short} across the loaded window
            {" · "}scan date reflects the prior session&apos;s close
          </p>
        </TableErrorBoundary>
      )}
    </div>
  );
}

// ── Small UI helpers ──

function Toggle({
  options, value, onChange, titles,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  titles?: Record<string, string>;
}) {
  return (
    <div className="flex rounded-md border border-[#2a2a2a] bg-[#111] p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          title={titles?.[key]}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            value === key ? "bg-[#185FA5]/25 text-[#5ba3e6]" : "text-[#888] hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Select({
  value, onChange, label, options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-1">
      <span className={`text-[10px] font-medium ${value ? "text-white" : "text-[#666]"}`}>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`max-w-[150px] rounded border bg-[#111] px-1.5 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-white/30 ${
          value ? "border-white/20 text-white" : "border-[#2a2a2a] text-[#666] hover:text-white"
        }`}
      >
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
        ))}
      </select>
    </label>
  );
}

function Chip({
  on, onClick, title, children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`rounded border px-1.5 py-1 text-[10px] font-medium transition-colors ${
        on ? "border-[#5ba3e6]/50 bg-[#185FA5]/25 text-[#5ba3e6]" : "border-[#2a2a2a] text-[#666] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Th({
  children, onClick, active, asc, align = "center",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  asc: boolean;
  align?: "left" | "center";
}) {
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none px-3 py-2.5 font-medium hover:text-white ${
        align === "left" ? "text-left" : "text-center"
      } ${active ? "text-[#5ba3e6]" : ""}`}
    >
      {children}
      {active ? (asc ? " ↑" : " ↓") : ""}
    </th>
  );
}
