/**
 * Scanner scorecard — forward returns of Inflection / Transition signals vs SPY.
 *
 * Server component on purpose: it reads `query.ts`, which imports `server-only`. Adding
 * "use client" here would pass `tsc` and then fail the Turbopack build (see CLAUDE.md).
 *
 * Presents `avg_excess_return_pct` as the headline rather than `avg_return_pct`. An
 * absolute return is uninterpretable without the tape — Transition's is_stronger signals
 * averaged -4.5% over three weeks in which QQQ returned +5.1%, and those two numbers
 * describe the same three weeks.
 */

import Link from "next/link";
import { fetchDailyHitRates, type HitRateData } from "@/lib/supabase/query";

export const dynamic = "force-dynamic";

const HEADLINE_PERIOD = 14;
/** Past this, the nightly cron has not landed and the board is describing history. */
const STALE_HOURS = 36;

const pct = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

const rate = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(n * 100)}%`;

function tone(n: number | null | undefined): string {
  if (n == null) return "text-[#a0a0a0]";
  if (n > 0.25) return "text-emerald-400";
  if (n < -0.25) return "text-red-400";
  return "text-[#d0d0d0]";
}

function Empty() {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-6 text-sm text-[#a0a0a0]">
      No <code className="text-[#d0d0d0]">daily_table</code> rows yet. They are written by{" "}
      <code className="text-[#d0d0d0]">/api/cron/hit-rates</code> at 03:20 UTC Tue–Sat, or on
      demand with <code className="text-[#d0d0d0]">?dryRun=false</code>.
    </div>
  );
}

function TierTable({ rows }: { rows: HitRateData[] }) {
  const tiers = rows
    .filter((r) => r.mode === null)
    .sort(
      (a, b) =>
        a.period_days - b.period_days ||
        String(a.signal_strength ?? "").localeCompare(String(b.signal_strength ?? ""))
    );
  if (!tiers.length) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2a2a2a] text-left text-xs uppercase tracking-wide text-[#707070]">
            <th className="py-2 pr-4 font-medium">Horizon</th>
            <th className="py-2 pr-4 font-medium">Conviction</th>
            <th className="py-2 pr-4 font-medium text-right">Episodes</th>
            <th className="py-2 pr-4 font-medium text-right">Tickers</th>
            <th className="py-2 pr-4 font-medium text-right">Excess vs SPY</th>
            <th className="py-2 pr-4 font-medium text-right">Beat SPY</th>
            <th className="py-2 pr-4 font-medium text-right">Raw</th>
            <th className="py-2 font-medium text-right">Benchmark</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((r) => (
            <tr
              key={`${r.period_days}-${r.signal_strength ?? "all"}`}
              className="border-b border-[#1f1f1f]"
            >
              <td className="py-2 pr-4 text-[#d0d0d0]">{r.period_days}d</td>
              <td className="py-2 pr-4 text-[#d0d0d0]">{r.signal_strength ?? "all"}</td>
              <td className="py-2 pr-4 text-right text-[#a0a0a0]">{r.total_signals}</td>
              <td className="py-2 pr-4 text-right text-[#707070]">{r.distinct_tickers ?? "—"}</td>
              <td className={`py-2 pr-4 text-right font-medium ${tone(r.avg_excess_return_pct)}`}>
                {pct(r.avg_excess_return_pct)}
              </td>
              <td className="py-2 pr-4 text-right text-[#a0a0a0]">
                {rate(r.win_rate_vs_benchmark)}
              </td>
              <td className="py-2 pr-4 text-right text-[#707070]">{pct(r.avg_return_pct)}</td>
              <td className="py-2 text-right text-[#707070]">{pct(r.benchmark_return_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StateTable({ rows }: { rows: HitRateData[] }) {
  const states = rows
    .filter((r) => r.mode !== null && r.period_days === HEADLINE_PERIOD)
    .sort((a, b) => (b.avg_excess_return_pct ?? 0) - (a.avg_excess_return_pct ?? 0));
  if (!states.length) return null;

  return (
    <div className="mt-6 overflow-x-auto">
      <div className="mb-2 text-xs uppercase tracking-wide text-[#707070]">
        By state · {HEADLINE_PERIOD}d · best to worst
      </div>
      <table className="w-full text-sm">
        <tbody>
          {states.map((r) => (
            <tr key={r.mode} className="border-b border-[#1f1f1f]">
              <td className="py-2 pr-4 text-[#d0d0d0]">{r.mode}</td>
              <td className="py-2 pr-4 text-right text-[#707070]">
                {r.total_signals} ep / {r.distinct_tickers ?? "—"} tk
              </td>
              <td className={`py-2 pr-4 text-right font-medium ${tone(r.avg_excess_return_pct)}`}>
                {pct(r.avg_excess_return_pct)}
              </td>
              <td className="py-2 text-right text-[#a0a0a0]">{rate(r.win_rate_vs_benchmark)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function HitRatesPage() {
  const rows = await fetchDailyHitRates();

  const scanners = [...new Set(rows.map((r) => r.scanner))].sort();
  const newest = rows.reduce<string | null>(
    (a, r) => (a == null || r.computed_at > a ? r.computed_at : a),
    null
  );
  const ageHours = newest ? (Date.now() - Date.parse(newest)) / 3_600_000 : null;
  const stale = ageHours != null && ageHours > STALE_HOURS;
  const sample = rows[0];

  return (
    <div className="min-h-screen bg-[#0f0f0f] px-6 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-1 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Scanner scorecard</h1>
          <Link href="/backtest/inflection-engine" className="text-xs text-[#707070] hover:text-white">
            inflection engine backtest →
          </Link>
        </div>
        <p className="mb-6 text-sm text-[#a0a0a0]">
          Forward returns of persisted signals measured against SPY over the same holding
          window. One observation per <strong className="text-[#d0d0d0]">episode</strong> — the
          session a ticker enters a state — not per scan row.
        </p>

        {rows.length === 0 ? (
          <Empty />
        ) : (
          <>
            <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3 text-xs text-[#a0a0a0]">
              <span>
                Signals{" "}
                <span className="text-[#d0d0d0]">
                  {sample?.sample_start_date} → {sample?.sample_end_date}
                </span>
              </span>
              <span>
                Engine <span className="text-[#d0d0d0]">v{sample?.scanner_version ?? "—"}</span>
              </span>
              <span>
                Computed{" "}
                <span className={stale ? "text-amber-400" : "text-[#d0d0d0]"}>
                  {newest ? new Date(newest).toISOString().slice(0, 16).replace("T", " ") : "—"} UTC
                  {ageHours != null && ` (${Math.round(ageHours)}h ago)`}
                </span>
              </span>
              {stale && (
                <span className="text-amber-400">
                  ⚠ nightly cron has not landed — this is history, not last night
                </span>
              )}
            </div>

            {scanners.map((s) => {
              const mine = rows.filter((r) => r.scanner === s);
              return (
                <section key={s} className="mb-10">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#d0d0d0]">
                    {s}
                  </h2>
                  <TierTable rows={mine} />
                  <StateTable rows={mine} />
                </section>
              );
            })}

            <div className="rounded-lg border border-[#2a2a2a] bg-[#151515] px-4 py-3 text-xs leading-relaxed text-[#707070]">
              <strong className="text-[#a0a0a0]">Reading this.</strong> Excess is the headline;
              raw return and benchmark are shown so you can see which way the tape ran.
              Episodes far below the scan-row count means repeated names — compare against
              tickers. Confidence intervals are not shown and would be wider than the point
              estimates suggest: episodes sharing a date are correlated through market beta.
              A month of one regime is not grounds to re-tune scoring.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
