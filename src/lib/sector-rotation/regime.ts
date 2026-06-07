/**
 * Macro regime overlay for Sector Rotation.
 * Classifies market environment based on VIX, 10Y yield, and USD index.
 * SERVER-ONLY: Fetches data from Yahoo Finance.
 */

import "server-only";

import { fetchWithRetry } from "@/lib/yahoo-utils";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type MacroRegime = "RISK_ON" | "RISK_OFF" | "INFLATIONARY" | "MIXED";

export interface MacroRegimeData {
  regime: MacroRegime;
  regimeConfidence: number; // 0-100, higher = more confirming signals
  vix: number;
  vixSlope: "rising" | "falling" | "flat";
  yield10y: number;
  dxy: number;
  dxyTrend: "rising" | "falling" | "flat";
  favoredSectors: string[];
  avoidSectors: string[];
}

const REGIME_SECTOR_MAP: Record<MacroRegime, { favored: string[]; avoid: string[] }> = {
  RISK_ON: {
    favored: ["Technology", "Consumer Discretionary", "Communication Services"],
    avoid: ["Utilities", "Consumer Staples"],
  },
  RISK_OFF: {
    favored: ["Utilities", "Consumer Staples", "Health Care"],
    avoid: ["Technology", "Consumer Discretionary", "Financials"],
  },
  INFLATIONARY: {
    favored: ["Energy", "Materials", "Financials"],
    avoid: ["Technology", "Consumer Discretionary", "Utilities"],
  },
  MIXED: {
    favored: [],
    avoid: [],
  },
};

// Module-level cache (10 min TTL)
let _regimeCache: { data: MacroRegimeData; ts: number } | null = null;
const REGIME_CACHE_TTL = 10 * 60 * 1000;

/**
 * Fetch macro regime classification.
 * Uses ^VIX, ^TNX (10Y yield), DX-Y.NYB (USD index).
 */
export async function fetchMacroRegime(): Promise<MacroRegimeData | null> {
  if (_regimeCache && Date.now() - _regimeCache.ts < REGIME_CACHE_TTL) {
    return _regimeCache.data;
  }

  try {
    const [vixData, tnxData, dxyData] = await Promise.allSettled([
      fetchSymbolData("^VIX", "3mo", "1d"),
      fetchSymbolData("^TNX", "3mo", "1d"),
      fetchSymbolData("DX-Y.NYB", "3mo", "1d"),
    ]);

    const vixCloses = vixData.status === "fulfilled" ? vixData.value : null;
    const tnxCloses = tnxData.status === "fulfilled" ? tnxData.value : null;
    const dxyCloses = dxyData.status === "fulfilled" ? dxyData.value : null;

    if (!vixCloses || vixCloses.length < 20) return null;

    const vix = vixCloses[vixCloses.length - 1];
    const vix5dAgo = vixCloses[Math.max(0, vixCloses.length - 6)];
    const vixSlope: "rising" | "falling" | "flat" =
      vix - vix5dAgo > 2 ? "rising" : vix - vix5dAgo < -2 ? "falling" : "flat";

    const yield10y = tnxCloses ? tnxCloses[tnxCloses.length - 1] : 0;

    const dxy = dxyCloses ? dxyCloses[dxyCloses.length - 1] : 0;
    const dxy20dAgo = dxyCloses ? dxyCloses[Math.max(0, dxyCloses.length - 21)] : 0;
    const dxyTrend: "rising" | "falling" | "flat" =
      dxy - dxy20dAgo > 1 ? "rising" : dxy - dxy20dAgo < -1 ? "falling" : "flat";

    // Classify regime
    let regime: MacroRegime;
    if (vix < 18 && vixSlope !== "rising") {
      regime = "RISK_ON";
    } else if (vix > 25 || vixSlope === "rising") {
      regime = "RISK_OFF";
    } else if (dxyTrend === "rising" && yield10y > 4.5) {
      regime = "INFLATIONARY";
    } else {
      regime = "MIXED";
    }

    // Base confidence from VIX/yield/DXY clarity
    let regimeConfidence = 50;
    if (regime === "RISK_ON" && vix < 14) regimeConfidence += 15;
    else if (regime === "RISK_OFF" && vix > 30) regimeConfidence += 15;
    else if (regime === "INFLATIONARY" && yield10y > 5) regimeConfidence += 10;
    if (vixSlope === "rising" && regime === "RISK_OFF") regimeConfidence += 10;
    if (vixSlope === "falling" && regime === "RISK_ON") regimeConfidence += 10;

    const sectorMap = REGIME_SECTOR_MAP[regime];
    const data: MacroRegimeData = {
      regime,
      regimeConfidence: Math.min(100, regimeConfidence),
      vix,
      vixSlope,
      yield10y,
      dxy,
      dxyTrend,
      favoredSectors: sectorMap.favored,
      avoidSectors: sectorMap.avoid,
    };

    _regimeCache = { data, ts: Date.now() };
    return data;
  } catch {
    return null;
  }
}

/**
 * Get regime score adjustment for a sector.
 * Aligned with regime → +5. Misaligned → -3.
 */
export function getRegimeAdjustment(
  sector: string,
  regime: MacroRegimeData
): number {
  if (regime.favoredSectors.includes(sector)) return 5;
  if (regime.avoidSectors.includes(sector)) return -3;
  return 0;
}

async function fetchSymbolData(
  symbol: string,
  range: string,
  interval: string
): Promise<number[]> {
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": UA },
  }, { timeout: 10000, retries: 1 });

  if (!res.ok) throw new Error(`Yahoo ${symbol}: ${res.status}`);
  const json = await res.json();

  const closes: (number | null)[] =
    json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  return closes.filter((c): c is number => c != null && c > 0);
}

/**
 * Enhance regime confidence using cross-asset ETF trends (GLD, TLT).
 * Call after main calculation when cross-asset ROC data is available.
 */
export function enhanceRegimeWithCrossAsset(
  regime: MacroRegimeData,
  crossAssetROC: { gld?: number; tlt?: number }
): MacroRegimeData {
  let bonus = 0;
  const gldRising = (crossAssetROC.gld ?? 0) > 2;
  const gldFalling = (crossAssetROC.gld ?? 0) < -2;
  const tltRising = (crossAssetROC.tlt ?? 0) > 2;
  const tltFalling = (crossAssetROC.tlt ?? 0) < -2;

  switch (regime.regime) {
    case "RISK_OFF":
      if (gldRising || tltRising) bonus += 10;
      if (gldRising && tltRising) bonus += 5;
      break;
    case "RISK_ON":
      if (gldFalling && tltFalling) bonus += 10;
      break;
    case "INFLATIONARY":
      if (gldRising && tltFalling) bonus += 10;
      break;
  }

  return {
    ...regime,
    regimeConfidence: Math.min(100, regime.regimeConfidence + bonus),
  };
}
