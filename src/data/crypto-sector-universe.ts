/**
 * Crypto sector universe — 10 narrative-driven categories.
 * Reuses SectorDefinition/SectorStock from equity sector-universe.
 * The `etf` field stores the proxy token symbol (e.g., "ETH-USD").
 */

import type { SectorDefinition, SectorStock } from "./sector-universe";

export const CRYPTO_BENCHMARK = "BTC-USD";

export const CRYPTO_UNIVERSE: SectorDefinition[] = [
  {
    id: "layer-1",
    displayName: "Layer 1",
    etf: "ETH-USD",
    description: "Base layer blockchains — settlement and consensus",
    stocks: [
      { symbol: "ETH-USD", name: "Ethereum" },
      { symbol: "SOL-USD", name: "Solana" },
      { symbol: "ADA-USD", name: "Cardano" },
      { symbol: "AVAX-USD", name: "Avalanche" },
      { symbol: "DOT-USD", name: "Polkadot" },
      { symbol: "NEAR-USD", name: "NEAR Protocol" },
      { symbol: "APT-USD", name: "Aptos" },
      { symbol: "SUI-USD", name: "Sui" },
      { symbol: "ATOM-USD", name: "Cosmos" },
      { symbol: "TON11419-USD", name: "Toncoin" },
      { symbol: "HBAR-USD", name: "Hedera" },
      { symbol: "ICP-USD", name: "Internet Computer" },
      { symbol: "ALGO-USD", name: "Algorand" },
      { symbol: "SEI-USD", name: "Sei" },
      { symbol: "FTM-USD", name: "Fantom" },
    ],
  },
  {
    id: "layer-2",
    displayName: "Layer 2 & Scaling",
    etf: "MATIC-USD",
    description: "Scaling solutions and rollups",
    stocks: [
      { symbol: "MATIC-USD", name: "Polygon" },
      { symbol: "ARB11841-USD", name: "Arbitrum" },
      { symbol: "OP-USD", name: "Optimism" },
      { symbol: "MNT27075-USD", name: "Mantle" },
      { symbol: "IMX-USD", name: "Immutable" },
      { symbol: "STRK-USD", name: "Starknet" },
      { symbol: "METIS-USD", name: "Metis" },
    ],
  },
  {
    id: "defi",
    displayName: "DeFi",
    etf: "UNI7083-USD",
    description: "Decentralized finance — lending, DEX, derivatives",
    stocks: [
      { symbol: "UNI7083-USD", name: "Uniswap" },
      { symbol: "AAVE-USD", name: "Aave" },
      { symbol: "MKR-USD", name: "Maker" },
      { symbol: "CRV-USD", name: "Curve DAO" },
      { symbol: "LDO-USD", name: "Lido DAO" },
      { symbol: "SNX-USD", name: "Synthetix" },
      { symbol: "DYDX-USD", name: "dYdX" },
      { symbol: "COMP-USD", name: "Compound" },
      { symbol: "SUSHI-USD", name: "SushiSwap" },
      { symbol: "CAKE-USD", name: "PancakeSwap" },
      { symbol: "1INCH-USD", name: "1inch" },
      { symbol: "JUP-USD", name: "Jupiter" },
      { symbol: "RAY-USD", name: "Raydium" },
      { symbol: "PENDLE-USD", name: "Pendle" },
    ],
  },
  {
    id: "ai-compute",
    displayName: "AI & Compute",
    etf: "RENDER-USD",
    description: "AI, GPU compute, decentralized intelligence",
    stocks: [
      { symbol: "RENDER-USD", name: "Render" },
      { symbol: "FET-USD", name: "Fetch.ai" },
      { symbol: "TAO22974-USD", name: "Bittensor" },
      { symbol: "AKT-USD", name: "Akash Network" },
      { symbol: "AR-USD", name: "Arweave" },
      { symbol: "THETA-USD", name: "Theta Network" },
      { symbol: "GRT6719-USD", name: "The Graph" },
    ],
  },
  {
    id: "rwa",
    displayName: "Real-World Assets",
    etf: "ONDO-USD",
    description: "Tokenized real-world assets and yield",
    stocks: [
      { symbol: "ONDO-USD", name: "Ondo Finance" },
      { symbol: "MKR-USD", name: "Maker" },
      { symbol: "LINK-USD", name: "Chainlink" },
      { symbol: "PENDLE-USD", name: "Pendle" },
      { symbol: "CFG-USD", name: "Centrifuge" },
    ],
  },
  {
    id: "depin",
    displayName: "DePin",
    etf: "FIL-USD",
    description: "Decentralized physical infrastructure networks",
    stocks: [
      { symbol: "FIL-USD", name: "Filecoin" },
      { symbol: "RENDER-USD", name: "Render" },
      { symbol: "HNT-USD", name: "Helium" },
      { symbol: "AKT-USD", name: "Akash Network" },
      { symbol: "AR-USD", name: "Arweave" },
      { symbol: "IOTX-USD", name: "IoTeX" },
    ],
  },
  {
    id: "meme",
    displayName: "Memecoins",
    etf: "DOGE-USD",
    description: "Community-driven meme tokens",
    stocks: [
      { symbol: "DOGE-USD", name: "Dogecoin" },
      { symbol: "SHIB-USD", name: "Shiba Inu" },
      { symbol: "PEPE24478-USD", name: "Pepe" },
      { symbol: "WIF-USD", name: "dogwifhat" },
      { symbol: "BONK-USD", name: "Bonk" },
      { symbol: "FLOKI-USD", name: "Floki" },
    ],
  },
  {
    id: "gaming",
    displayName: "Gaming & Metaverse",
    etf: "IMX-USD",
    description: "Blockchain gaming, metaverse, and NFT platforms",
    stocks: [
      { symbol: "IMX-USD", name: "Immutable" },
      { symbol: "AXS-USD", name: "Axie Infinity" },
      { symbol: "SAND-USD", name: "The Sandbox" },
      { symbol: "MANA-USD", name: "Decentraland" },
      { symbol: "GALA-USD", name: "Gala" },
      { symbol: "ILV-USD", name: "Illuvium" },
      { symbol: "ENJ-USD", name: "Enjin Coin" },
      { symbol: "RONIN-USD", name: "Ronin" },
    ],
  },
  {
    id: "exchange",
    displayName: "Exchange Tokens",
    etf: "BNB-USD",
    description: "Centralized exchange native tokens",
    stocks: [
      { symbol: "BNB-USD", name: "BNB" },
      { symbol: "CRO-USD", name: "Cronos" },
      { symbol: "OKB-USD", name: "OKB" },
      { symbol: "LEO-USD", name: "UNUS SED LEO" },
      { symbol: "KCS-USD", name: "KuCoin Token" },
    ],
  },
  {
    id: "infra",
    displayName: "Infrastructure",
    etf: "LINK-USD",
    description: "Oracles, indexing, storage, and middleware",
    stocks: [
      { symbol: "LINK-USD", name: "Chainlink" },
      { symbol: "GRT6719-USD", name: "The Graph" },
      { symbol: "FIL-USD", name: "Filecoin" },
      { symbol: "PYTH-USD", name: "Pyth Network" },
      { symbol: "ENS-USD", name: "Ethereum Name Service" },
    ],
  },
];

// ── Lookup helpers ──

const _symbolToSector = new Map<string, SectorDefinition>();
for (const sector of CRYPTO_UNIVERSE) {
  for (const stock of sector.stocks) {
    // First mapping wins (some tokens appear in multiple sectors)
    if (!_symbolToSector.has(stock.symbol)) {
      _symbolToSector.set(stock.symbol, sector);
    }
  }
}

export function getCryptoSectorForSymbol(symbol: string): string {
  return _symbolToSector.get(symbol)?.displayName ?? "Other";
}

export function getCryptoSectorProxyForSymbol(symbol: string): string | null {
  return _symbolToSector.get(symbol)?.etf ?? null;
}

export function getAllCryptoSymbols(): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const sector of CRYPTO_UNIVERSE) {
    for (const stock of sector.stocks) {
      if (!seen.has(stock.symbol)) {
        seen.add(stock.symbol);
        result.push(stock.symbol);
      }
    }
  }
  return result.sort();
}

export function getCryptoSectorDefinitions(): SectorDefinition[] {
  return CRYPTO_UNIVERSE;
}
