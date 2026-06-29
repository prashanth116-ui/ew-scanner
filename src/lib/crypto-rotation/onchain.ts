/**
 * On-chain metrics stub for future integration.
 * Establishes type contracts for DeFiLlama, Glassnode, etc.
 * Currently returns null — gracefully degraded by all consumers.
 */

export interface OnChainMetrics {
  /** Total value locked across DeFi protocols */
  defiTVL?: { current: number; change7d: number };
  /** Total stablecoin supply (USDT + USDC + DAI + ...) */
  stablecoinSupply?: { current: number; change7d: number };
  /** Total DEX volume in last 24h (USD) */
  dexVolume24h?: number;
  /** Active addresses per chain */
  activeAddresses?: Record<string, number>;
  /** Net exchange flow (negative = outflow = bullish, positive = inflow = bearish) */
  netExchangeFlow?: { btc: number; eth: number };
  /** Timestamp of data */
  asOf?: string;
}

/**
 * Stub — returns null, ready for future API integration.
 * Consumers (brief, regime, etc.) accept optional OnChainMetrics
 * and use them when available, gracefully degrading when null.
 *
 * Future integration candidates:
 * - DeFiLlama API (TVL, DEX volume, stablecoin supply)
 * - Glassnode API (exchange flows, active addresses)
 * - CryptoQuant API (exchange reserves, miner flows)
 */
export async function fetchOnChainMetrics(): Promise<OnChainMetrics | null> {
  return null; // TODO: integrate DeFiLlama API
}
