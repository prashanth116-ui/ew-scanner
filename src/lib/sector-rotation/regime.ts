/**
 * Macro regime overlay for Sector Rotation.
 * Classifies market environment based on VIX, 10Y yield, and USD index.
 * SERVER-ONLY: Fetches data from Yahoo Finance.
 */

import "server-only";

import { fetchWithRetry } from "@/lib/yahoo-utils";
import { REGIME as REGIME_CFG } from "./config";

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
  /** Adaptive VIX bounds computed from 3-month 25th/75th percentiles */
  vixBounds: { low: number; high: number };
}

// Sector names match `displayName` from sector-universe.ts (GICS standard names)
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
    favored: ["Health Care", "Financials"],  // quality/diversification tilt — structurally defensive-growth
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
      vix - vix5dAgo > REGIME_CFG.VIX_SLOPE_THRESHOLD ? "rising" : vix - vix5dAgo < -REGIME_CFG.VIX_SLOPE_THRESHOLD ? "falling" : "flat";

    // Missing TNX/DXY data: default to 0 but track for confidence penalty.
    // yield10y=0 makes INFLATIONARY unreachable; dxy=0 makes dxyTrend="flat".
    const hasTnx = tnxCloses != null && tnxCloses.length > 0;
    const hasDxy = dxyCloses != null && dxyCloses.length > 0;
    const yield10y = hasTnx ? tnxCloses[tnxCloses.length - 1] : 0;

    const dxy = hasDxy ? dxyCloses[dxyCloses.length - 1] : 0;
    const dxy20dAgo = hasDxy ? dxyCloses[Math.max(0, dxyCloses.length - 21)] : 0;
    // Require at least 21 data points for a meaningful 20-day trend. With fewer
    // entries, dxy20dAgo is clamped to index 0, compressing a multi-week move into
    // a shorter window and potentially triggering false INFLATIONARY classification.
    const dxyTrend: "rising" | "falling" | "flat" =
      hasDxy && dxyCloses.length >= 21
        ? (dxy - dxy20dAgo > REGIME_CFG.DXY_TREND_THRESHOLD ? "rising" : dxy - dxy20dAgo < -REGIME_CFG.DXY_TREND_THRESHOLD ? "falling" : "flat")
        : "flat";

    // Adaptive VIX thresholds: use 25th/75th percentile of 3-month range
    // Falls back to static thresholds (18/25) when data is insufficient
    const sortedVix = [...vixCloses].sort((a, b) => a - b);
    const vixP25 = sortedVix[Math.floor(sortedVix.length * 0.25)] ?? REGIME_CFG.VIX_RISK_ON;
    const vixP75 = sortedVix[Math.floor(sortedVix.length * 0.75)] ?? REGIME_CFG.VIX_RISK_OFF;
    // Clamp adaptive thresholds to sensible bounds.
    // Guard against inversion: config ranges overlap (LOW_MAX=22, HIGH_MIN=20),
    // so when P25≈P75 (compressed VIX range), vixLow can equal or exceed vixHigh.
    // If inverted, fall back to static defaults to avoid undefined classification.
    let vixLow = Math.max(REGIME_CFG.VIX_ADAPTIVE_LOW_MIN, Math.min(REGIME_CFG.VIX_ADAPTIVE_LOW_MAX, vixP25));
    let vixHigh = Math.max(REGIME_CFG.VIX_ADAPTIVE_HIGH_MIN, Math.min(REGIME_CFG.VIX_ADAPTIVE_HIGH_MAX, vixP75));
    if (vixLow >= vixHigh) {
      vixLow = REGIME_CFG.VIX_RISK_ON;
      vixHigh = REGIME_CFG.VIX_RISK_OFF;
    }

    // Classify regime using adaptive thresholds.
    // INFLATIONARY checked before RISK_OFF so rising-VIX stagflation scenarios
    // aren't swallowed by the RISK_OFF branch — but only when VIX is within
    // adaptive bounds. During genuine market stress (VIX above adaptive high),
    // RISK_OFF takes priority to ensure defensive sector guidance.
    // VIX-rising only triggers RISK_OFF when VIX is at/above the adaptive
    // low — rising from very low levels (e.g. 13→16) is mean-reversion, not stress.
    let regime: MacroRegime;
    if (dxyTrend === "rising" && yield10y > REGIME_CFG.YIELD_INFLATIONARY && vix <= vixHigh) {
      regime = "INFLATIONARY";
    } else if (vix < vixLow && vixSlope !== "rising") {
      regime = "RISK_ON";
    } else if (vix > vixHigh || (vixSlope === "rising" && vix >= vixLow)) {
      regime = "RISK_OFF";
    } else {
      regime = "MIXED";
    }

    // Base confidence from VIX/yield/DXY clarity
    let regimeConfidence = 50;
    // Extreme VIX: well below 25th pctile or well above 75th pctile
    if (regime === "RISK_ON" && vix < vixLow * REGIME_CFG.VIX_EXTREME_LOW_MULT) regimeConfidence += REGIME_CFG.CONFIDENCE_BOOST_LARGE;
    else if (regime === "RISK_OFF" && vix > vixHigh * REGIME_CFG.VIX_EXTREME_HIGH_MULT) regimeConfidence += REGIME_CFG.CONFIDENCE_BOOST_LARGE;
    else if (regime === "INFLATIONARY" && yield10y > REGIME_CFG.YIELD_EXTREME) regimeConfidence += REGIME_CFG.CONFIDENCE_BOOST_SMALL;
    if (vixSlope === "rising" && regime === "RISK_OFF") regimeConfidence += REGIME_CFG.CONFIDENCE_BOOST_SMALL;
    if (vixSlope === "falling" && regime === "RISK_ON") regimeConfidence += REGIME_CFG.CONFIDENCE_BOOST_SMALL;
    // Confidence penalty when macro data is incomplete — classification is less reliable
    if (!hasTnx) regimeConfidence -= 5;
    if (!hasDxy) regimeConfidence -= 5;

    const sectorMap = REGIME_SECTOR_MAP[regime];
    const data: MacroRegimeData = {
      regime,
      regimeConfidence: Math.max(0, Math.min(100, regimeConfidence)),
      vix,
      vixSlope,
      yield10y,
      dxy,
      dxyTrend,
      favoredSectors: sectorMap.favored,
      avoidSectors: sectorMap.avoid,
      vixBounds: { low: vixLow, high: vixHigh },
    };

    _regimeCache = { data, ts: Date.now() };
    return data;
  } catch {
    return null;
  }
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
 * Enhance regime confidence and potentially upgrade classification
 * using cross-asset ETF trends (GLD, TLT).
 * Call after main calculation when cross-asset ROC data is available.
 */
export function enhanceRegimeWithCrossAsset(
  regime: MacroRegimeData,
  crossAssetROC: { gld?: number; tlt?: number }
): MacroRegimeData {
  let bonus = 0;
  let updatedRegime = regime.regime;

  // Track data availability — missing data (undefined) should NOT be treated as 0 (flat).
  // Missing GLD/TLT → false for all directional flags, preventing silent misclassification.
  const hasGld = crossAssetROC.gld !== undefined;
  const hasTlt = crossAssetROC.tlt !== undefined;
  const gldAccel = crossAssetROC.gld ?? 0;
  const tltAccel = crossAssetROC.tlt ?? 0;
  const gldRising = hasGld && gldAccel > REGIME_CFG.CROSS_ASSET_ACCEL;
  const gldFalling = hasGld && gldAccel < -REGIME_CFG.CROSS_ASSET_ACCEL;
  const tltRising = hasTlt && tltAccel > REGIME_CFG.CROSS_ASSET_ACCEL;
  const tltFalling = hasTlt && tltAccel < -REGIME_CFG.CROSS_ASSET_ACCEL;
  const gldStrongRising = hasGld && gldAccel > REGIME_CFG.CROSS_ASSET_STRONG_ACCEL;
  const tltStrongRising = hasTlt && tltAccel > REGIME_CFG.CROSS_ASSET_STRONG_ACCEL;

  switch (regime.regime) {
    case "RISK_OFF":
      if (gldRising || tltRising) bonus += 10;
      if (gldRising && tltRising) bonus += 5;
      // GLD rising + TLT falling = classic inflation signal (gold as inflation hedge,
      // bonds selling off on yield concerns). Upgrade RISK_OFF → INFLATIONARY.
      if (gldRising && tltFalling) {
        updatedRegime = "INFLATIONARY";
        bonus = 5;
      }
      break;
    case "RISK_ON":
      if (gldFalling && tltFalling) bonus += 10;
      // Strong safe-haven inflows contradict RISK_ON — downgrade to MIXED
      if (gldStrongRising && tltStrongRising) {
        updatedRegime = "MIXED";
        bonus = -10;
      }
      break;
    case "INFLATIONARY":
      if (gldRising && tltFalling) bonus += 10;
      break;
    case "MIXED":
      // Strong safe-haven inflows in MIXED → upgrade to RISK_OFF
      if (gldStrongRising && tltStrongRising) {
        updatedRegime = "RISK_OFF";
        bonus += 10;
      // Both safe havens falling in MIXED → upgrade to RISK_ON
      } else if (gldFalling && tltFalling && gldAccel < REGIME_CFG.CROSS_ASSET_STRONG_FALLING && tltAccel < REGIME_CFG.CROSS_ASSET_STRONG_FALLING) {
        updatedRegime = "RISK_ON";
        bonus += 5;
      }
      break;
  }

  const sectorMap = updatedRegime !== regime.regime ? REGIME_SECTOR_MAP[updatedRegime] : null;

  return {
    ...regime,
    regime: updatedRegime,
    regimeConfidence: Math.min(100, Math.max(0, regime.regimeConfidence + bonus)),
    ...(sectorMap ? { favoredSectors: sectorMap.favored, avoidSectors: sectorMap.avoid } : {}),
  };
}
