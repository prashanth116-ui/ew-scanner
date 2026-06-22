/** Asset class for discovered tickers. */
export type AssetClass = "stock" | "crypto";

/** Source that discovered the ticker. */
export type DiscoverySource =
  | "polygon_movers"
  | "yahoo_gainers"
  | "coingecko_trending"
  | "coingecko_top_volume";

/** A ticker discovered by the discovery layer. Matches DB schema. */
export interface DiscoveredTicker {
  id?: string;
  symbol: string;
  name: string | null;
  asset_class: AssetClass;
  source: DiscoverySource;
  price_change_pct: number | null;
  volume: number | null;
  market_cap: number | null;
  price_at_discovery: number | null;
  discovered_at?: string;
  last_seen_at?: string;
  expires_at?: string;
}

/** Response shape from the discovery cron endpoint. */
export interface DiscoveryResult {
  discovered: number;
  upserted: number;
  purged: number;
  crypto: number;
  stocks: number;
  errors: string[];
}
