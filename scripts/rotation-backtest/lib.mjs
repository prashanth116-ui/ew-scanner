/**
 * Shared helpers for the rotation entry-screen backtest.
 * Plain ESM, no build step: run the numbered scripts with `node` in order.
 */
import { readFileSync, existsSync } from "node:fs";

export const BARS_DIR = new URL("./data/bars/", import.meta.url);
export const DATA = (name) => new URL(`./data/${name}`, import.meta.url);

const cache = new Map();
const safe = (s) => s.replace(/[^A-Za-z0-9]/g, "_");

/** Load a cached daily series. Returns null if 2-fetch-bars.mjs never got it. */
export function bars(sym) {
  if (cache.has(sym)) return cache.get(sym);
  const f = new URL(`${safe(sym)}.json`, BARS_DIR);
  let v = null;
  if (existsSync(f)) {
    v = JSON.parse(readFileSync(f, "utf8"));
    // Yahoo timestamps are UTC; render them in local time so the date strings
    // line up with the ones the app's rotation tracker produces.
    v.d = v.t.map((ts) => {
      const dt = new Date(ts * 1000);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    });
    v.idxByDate = new Map(v.d.map((x, i) => [x, i]));
  }
  cache.set(sym, v);
  return v;
}

export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const pct = (a) => (a.length ? `${(mean(a) * 100).toFixed(1)}%` : " n/a");
export const sma = (c, i, n) => (i - n + 1 < 0 ? null : mean(c.slice(i - n + 1, i + 1)));
export const smaSeries = (a, p) => a.map((_, i) => (i < p - 1 ? null : mean(a.slice(i - p + 1, i + 1))));

export function atrPct(b, i, n = 14) {
  if (i - n < 0) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) {
    s += Math.max(b.h[k] - b.l[k], Math.abs(b.h[k] - b.c[k - 1]), Math.abs(b.l[k] - b.c[k - 1]));
  }
  return (s / n / b.c[i]) * 100;
}

/**
 * Threshold to be in the top `keepTop` of a basket. INCLUSIVE boundary, matching
 * topFractionCut() in src/lib/sector-rotation/entry-screen.ts — six values at
 * keepTop 0.5 admit four, not three. Keep the two in step or the backtest stops
 * describing the shipped rule.
 */
export function topFractionCut(values, keepTop) {
  const s = values.filter(Number.isFinite).sort((a, b) => b - a);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.floor(s.length * keepTop))];
}

/** Wilson score interval — the right one for small-n win rates. */
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
