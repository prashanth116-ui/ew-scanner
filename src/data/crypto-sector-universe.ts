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
    category: "gics_sector",
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
      { symbol: "S32684-USD", name: "Sonic" },
    ],
  },
  {
    id: "layer-2",
    displayName: "Layer 2 & Scaling",
    etf: "POL28321-USD",
    description: "Scaling solutions and rollups",
    category: "gics_sector",
    stocks: [
      { symbol: "POL28321-USD", name: "Polygon" },
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
    category: "gics_sector",
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
    category: "gics_sector",
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
    category: "gics_sector",
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
    category: "gics_sector",
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
    category: "gics_sector",
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
    category: "gics_sector",
    stocks: [
      { symbol: "IMX-USD", name: "Immutable" },
      { symbol: "AXS-USD", name: "Axie Infinity" },
      { symbol: "SAND-USD", name: "The Sandbox" },
      { symbol: "MANA-USD", name: "Decentraland" },
      { symbol: "GALA-USD", name: "Gala" },
      { symbol: "ILV-USD", name: "Illuvium" },
      { symbol: "ENJ-USD", name: "Enjin Coin" },
      { symbol: "RON14101-USD", name: "Ronin" },
    ],
  },
  {
    id: "exchange",
    displayName: "Exchange Tokens",
    etf: "BNB-USD",
    description: "Centralized exchange native tokens",
    category: "gics_sector",
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
    category: "gics_sector",
    stocks: [
      { symbol: "LINK-USD", name: "Chainlink" },
      { symbol: "GRT6719-USD", name: "The Graph" },
      { symbol: "FIL-USD", name: "Filecoin" },
      { symbol: "PYTH-USD", name: "Pyth Network" },
      { symbol: "ENS-USD", name: "Ethereum Name Service" },
    ],
  },
];

// ── Canonical sector ──

/**
 * Canonical basket for every token listed in 2+ baskets.
 *
 * Mirrors PRIMARY_SECTOR in sector-universe.ts and exists for the same reason:
 * a token's canonical basket decides which quadrant, composite, acceleration
 * and stealth read scores it, and leaving that to declaration order means
 * reordering CRYPTO_UNIVERSE silently rescores tokens. `findUnpinnedContestedCrypto()`
 * returns any overlap missing an entry here, and crypto-sector-universe.test.ts
 * fails the build when that list is non-empty.
 *
 * Rule of thumb, in order:
 *   1. A basket's proxy token (its `etf`) is pinned to that basket. Benchmarking
 *      a basket against a token scored under a different basket is incoherent.
 *   2. Otherwise, the basket whose narrative actually drives the token's price.
 *
 * Uncontested tokens are omitted — they resolve to their only basket.
 */
export const CRYPTO_PRIMARY_SECTOR: Record<string, string> = {
  // Proxy tokens — rule 1.
  "RENDER-USD": "ai-compute", // proxy of ai-compute (also listed in depin)
  "LINK-USD": "infra",        // proxy of infra (also listed in rwa)
  "FIL-USD": "depin",         // proxy of depin (also listed in infra)
  "IMX-USD": "gaming",        // proxy of gaming (also listed in layer-2)

  // Narrative calls — rule 2.
  "AKT-USD": "ai-compute",    // GPU leasing for AI, not generic physical infra
  "AR-USD": "depin",          // permanent storage runs on operator hardware
  "GRT6719-USD": "infra",     // indexing/query — named in the infra description
  "MKR-USD": "defi",          // RWA-backed balance sheet, but trades as DeFi
  "PENDLE-USD": "defi",       // yield tokenization is a DeFi primitive
};

// ── Lookup helpers ──

// Pinned tokens take their declared basket; everything else resolves to its only
// basket (or, defensively, the first basket that lists it).
const _symbolToSector = new Map<string, SectorDefinition>();
for (const sector of CRYPTO_UNIVERSE) {
  for (const stock of sector.stocks) {
    const pinned = CRYPTO_PRIMARY_SECTOR[stock.symbol];
    if (pinned !== undefined) {
      if (pinned === sector.id) _symbolToSector.set(stock.symbol, sector);
    } else if (!_symbolToSector.has(stock.symbol)) {
      _symbolToSector.set(stock.symbol, sector);
    }
  }
}

/**
 * Tokens listed in 2+ baskets with no CRYPTO_PRIMARY_SECTOR entry.
 * Non-empty means declaration order is deciding a canonical basket — pin it.
 */
export function findUnpinnedContestedCrypto(): { symbol: string; sectors: string[] }[] {
  const seen = new Map<string, string[]>();
  for (const sector of CRYPTO_UNIVERSE) {
    for (const stock of sector.stocks) {
      const list = seen.get(stock.symbol);
      if (list) list.push(sector.id);
      else seen.set(stock.symbol, [sector.id]);
    }
  }
  const unpinned: { symbol: string; sectors: string[] }[] = [];
  for (const [symbol, sectors] of seen) {
    if (sectors.length > 1 && CRYPTO_PRIMARY_SECTOR[symbol] === undefined) {
      unpinned.push({ symbol, sectors });
    }
  }
  return unpinned.sort((a, b) => a.symbol.localeCompare(b.symbol));
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
