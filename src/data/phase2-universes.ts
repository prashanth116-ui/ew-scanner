/**
 * Phase 2 Wave Scanner universes — Futures + re-export existing equity universes.
 */

import { UNIVERSES, type TickerInfo } from "./ew-universes";

export const FUTURES_UNIVERSE: TickerInfo[] = [
  // Equity Index Futures
  { symbol: "ES=F", name: "E-mini S&P 500", sector: "Equity Index" },
  { symbol: "NQ=F", name: "E-mini Nasdaq 100", sector: "Equity Index" },
  { symbol: "YM=F", name: "E-mini Dow", sector: "Equity Index" },
  { symbol: "RTY=F", name: "E-mini Russell 2000", sector: "Equity Index" },
  { symbol: "MES=F", name: "Micro E-mini S&P 500", sector: "Equity Index" },
  { symbol: "MNQ=F", name: "Micro E-mini Nasdaq 100", sector: "Equity Index" },
  // Metals
  { symbol: "GC=F", name: "Gold", sector: "Metals" },
  { symbol: "SI=F", name: "Silver", sector: "Metals" },
  // Energy
  { symbol: "CL=F", name: "Crude Oil WTI", sector: "Energy" },
  { symbol: "NG=F", name: "Natural Gas", sector: "Energy" },
  // Bonds
  { symbol: "ZB=F", name: "30-Year T-Bond", sector: "Bonds" },
  { symbol: "ZN=F", name: "10-Year T-Note", sector: "Bonds" },
  // Currencies
  { symbol: "6E=F", name: "Euro FX", sector: "Currencies" },
  { symbol: "6J=F", name: "Japanese Yen", sector: "Currencies" },
  // Crypto
  { symbol: "BTC=F", name: "Bitcoin CME", sector: "Crypto" },
  { symbol: "ETH=F", name: "Ether CME", sector: "Crypto" },
];

/** All Wave Scanner universes — Futures first, then all existing equity universes. */
export const WAVE_UNIVERSES: Record<string, TickerInfo[]> = {
  Futures: FUTURES_UNIVERSE,
  ...UNIVERSES,
};

export type WaveUniverseKey = keyof typeof WAVE_UNIVERSES;
export const WAVE_UNIVERSE_KEYS = Object.keys(WAVE_UNIVERSES) as WaveUniverseKey[];
