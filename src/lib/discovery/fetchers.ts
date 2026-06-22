/**
 * External API fetchers for ticker discovery.
 * CoinGecko (trending + top volume) and Polygon (stock movers).
 */

import "server-only";

import { fetchWithRetry } from "@/lib/yahoo-utils";
import type { DiscoveredTicker } from "./types";

// ── CoinGecko ID → Yahoo symbol mapping ──
// Top ~100 coins by market cap. Fallback: {SYMBOL}-USD

const COINGECKO_YAHOO_MAP: Record<string, string> = {
  bitcoin: "BTC-USD",
  ethereum: "ETH-USD",
  tether: "USDT-USD",
  binancecoin: "BNB-USD",
  solana: "SOL-USD",
  ripple: "XRP-USD",
  "usd-coin": "USDC-USD",
  "staked-ether": "STETH-USD",
  dogecoin: "DOGE-USD",
  cardano: "ADA-USD",
  tron: "TRX-USD",
  avalanche: "AVAX-USD",
  chainlink: "LINK-USD",
  "shiba-inu": "SHIB-USD",
  polkadot: "DOT-USD",
  "bitcoin-cash": "BCH-USD",
  dai: "DAI-USD",
  uniswap: "UNI7083-USD",
  litecoin: "LTC-USD",
  near: "NEAR-USD",
  polygon: "POL28321-USD",
  "internet-computer": "ICP-USD",
  pepe: "PEPE24478-USD",
  "leo-token": "LEO-USD",
  aptos: "APT-USD",
  "ethereum-classic": "ETC-USD",
  "render-token": "RENDER-USD",
  hedera: "HBAR-USD",
  cosmos: "ATOM-USD",
  filecoin: "FIL-USD",
  arbitrum: "ARB11841-USD",
  immutable: "IMX-USD",
  maker: "MKR-USD",
  optimism: "OP-USD",
  "the-graph": "GRT6719-USD",
  injective: "INJ-USD",
  theta: "THETA-USD",
  sui: "SUI-USD",
  sei: "SEI-USD",
  aave: "AAVE-USD",
  algorand: "ALGO-USD",
  "fetch-ai": "FET-USD",
  bittensor: "TAO22974-USD",
  mantle: "MNT27075-USD",
  fantom: "FTM-USD",
  "axie-infinity": "AXS-USD",
  ondo: "ONDO-USD",
  "the-sandbox": "SAND-USD",
  decentraland: "MANA-USD",
  bonk: "BONK-USD",
  floki: "FLOKI-USD",
  dogwifhat: "WIF-USD",
  gala: "GALA-USD",
  arweave: "AR-USD",
  "curve-dao-token": "CRV-USD",
  astar: "ASTR-USD",
  synthetix: "SNX-USD",
  "dydx-chain": "DYDX-USD",
  compound: "COMP-USD",
  sushi: "SUSHI-USD",
  pancakeswap: "CAKE-USD",
  "1inch": "1INCH-USD",
  jupiter: "JUP-USD",
  raydium: "RAY-USD",
  pendle: "PENDLE-USD",
  helium: "HNT-USD",
  akash: "AKT-USD",
  iotex: "IOTX-USD",
  "illuvium-2": "ILV-USD",
  "enjin-coin": "ENJ-USD",
  ronin: "RON14101-USD",
  "crypto-com-coin": "CRO-USD",
  okb: "OKB-USD",
  kucoin: "KCS-USD",
  pyth: "PYTH-USD",
  "ethereum-name-service": "ENS-USD",
  starknet: "STRKETH-USD",
  metis: "METIS-USD",
  centrifuge: "CFG-USD",
  "lido-dao": "LDO-USD",
  toncoin: "TON11419-USD",
  kaspa: "KAS-USD",
  "wrapped-bitcoin": "WBTC-USD",
  celestia: "TIA-USD",
  worldcoin: "WLD-USD",
  "first-digital-usd": "FDUSD-USD",
  whitebit: "WBT-USD",
  mantra: "OM-USD",
  pengu: "PENG-USD",
};

/** Map a CoinGecko coin ID + symbol to a Yahoo Finance symbol. */
export function coingeckoIdToYahoo(id: string, symbol: string): string {
  const mapped = COINGECKO_YAHOO_MAP[id];
  if (mapped) return mapped;
  // Fallback: uppercase symbol + -USD
  return `${symbol.toUpperCase()}-USD`;
}

// ── CoinGecko Trending ──

interface CoinGeckoTrendingResponse {
  coins?: Array<{
    item: {
      id: string;
      symbol: string;
      name: string;
      market_cap_rank?: number;
      data?: {
        price_change_percentage_24h?: Record<string, number>;
        total_volume?: string;
        market_cap?: string;
        price?: number;
      };
    };
  }>;
}

/** Fetch top 7 trending coins from CoinGecko (no API key needed). */
export async function fetchCoinGeckoTrending(): Promise<DiscoveredTicker[]> {
  const res = await fetchWithRetry(
    "https://api.coingecko.com/api/v3/search/trending",
    { headers: { accept: "application/json" } },
    { timeout: 10000, retries: 1, baseDelay: 2000 }
  );

  if (!res.ok) {
    throw new Error(`CoinGecko trending: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as CoinGeckoTrendingResponse;
  const coins = data.coins ?? [];

  return coins.slice(0, 7).map((c) => ({
    symbol: coingeckoIdToYahoo(c.item.id, c.item.symbol),
    name: c.item.name,
    asset_class: "crypto" as const,
    source: "coingecko_trending" as const,
    price_change_pct: c.item.data?.price_change_percentage_24h?.usd ?? null,
    volume: c.item.data?.total_volume
      ? parseInt(c.item.data.total_volume.replace(/[$,]/g, ""), 10) || null
      : null,
    market_cap: c.item.data?.market_cap
      ? parseInt(c.item.data.market_cap.replace(/[$,]/g, ""), 10) || null
      : null,
    price_at_discovery: c.item.data?.price ?? null,
  }));
}

// ── CoinGecko Top Volume (requires API key for /coins/markets with per_page > 100) ──

interface CoinGeckoMarketCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number | null;
}

/** Fetch top volume coins with >20% 24h price change. */
export async function fetchCoinGeckoTopVolume(
  apiKey?: string
): Promise<DiscoveredTicker[]> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey) {
    headers["x-cg-demo-api-key"] = apiKey;
  }

  const res = await fetchWithRetry(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=250&page=1&sparkline=false",
    { headers },
    { timeout: 15000, retries: 1, baseDelay: 3000 }
  );

  if (!res.ok) {
    throw new Error(`CoinGecko markets: ${res.status} ${res.statusText}`);
  }

  const coins = (await res.json()) as CoinGeckoMarketCoin[];

  return coins
    .filter(
      (c) =>
        c.price_change_percentage_24h != null &&
        Math.abs(c.price_change_percentage_24h) > 20
    )
    .map((c) => ({
      symbol: coingeckoIdToYahoo(c.id, c.symbol),
      name: c.name,
      asset_class: "crypto" as const,
      source: "coingecko_top_volume" as const,
      price_change_pct: c.price_change_percentage_24h,
      volume: c.total_volume ? Math.round(c.total_volume) : null,
      market_cap: c.market_cap ? Math.round(c.market_cap) : null,
      price_at_discovery: c.current_price,
    }));
}

// ── Yahoo Finance Gainers ──

interface YahooScreenerResponse {
  finance?: {
    result?: Array<{
      quotes?: Array<{
        symbol: string;
        shortName?: string;
        regularMarketChangePercent?: number;
        regularMarketVolume?: number;
        marketCap?: number;
        regularMarketPrice?: number;
      }>;
    }>;
  };
}

/** Fetch top stock gainers from Yahoo Finance screener (>10% change, no API key). */
export async function fetchYahooGainers(): Promise<DiscoveredTicker[]> {
  const res = await fetchWithRetry(
    "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=25",
    { headers: { accept: "application/json" } },
    { timeout: 10000, retries: 1, baseDelay: 2000 }
  );

  if (!res.ok) {
    throw new Error(`Yahoo gainers: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as YahooScreenerResponse;
  const quotes = data.finance?.result?.[0]?.quotes ?? [];

  return quotes
    .filter(
      (q) =>
        q.regularMarketChangePercent != null &&
        q.regularMarketChangePercent > 10 &&
        // Quality gates: filter out OTC, penny stocks, illiquid, micro-caps
        !q.symbol.includes(".") &&
        (q.regularMarketPrice == null || q.regularMarketPrice >= 2) &&
        (q.marketCap == null || q.marketCap >= 50_000_000) &&
        (q.regularMarketVolume == null || q.regularMarketVolume >= 100_000)
    )
    .map((q) => ({
      symbol: q.symbol,
      name: q.shortName ?? null,
      asset_class: "stock" as const,
      source: "yahoo_gainers" as const,
      price_change_pct:
        q.regularMarketChangePercent != null
          ? Math.round(q.regularMarketChangePercent * 100) / 100
          : null,
      volume: q.regularMarketVolume ? Math.round(q.regularMarketVolume) : null,
      market_cap: q.marketCap ? Math.round(q.marketCap) : null,
      price_at_discovery: q.regularMarketPrice ?? null,
    }));
}
