/**
 * Curated list of upcoming crypto events.
 * Manually maintained — update periodically with known protocol upgrades,
 * ETF deadlines, halvings, and major unlocks.
 */

export interface CryptoEvent {
  date: string; // ISO date YYYY-MM-DD
  title: string;
  category: "upgrade" | "unlock" | "etf" | "halving" | "macro" | "fork";
  impact: "high" | "medium" | "low";
  affectedTokens: string[]; // e.g., ["ETH-USD", "SOL-USD"]
  description: string;
}

export const CRYPTO_EVENTS: CryptoEvent[] = [
  // ── Halvings ──
  {
    date: "2028-04-15",
    title: "Bitcoin Halving (est.)",
    category: "halving",
    impact: "high",
    affectedTokens: ["BTC-USD"],
    description:
      "Block reward halves from 3.125 to 1.5625 BTC. Historically triggers multi-month rallies. Exact date depends on block height ~1,050,000.",
  },

  // ── Protocol Upgrades ──
  {
    date: "2026-09-01",
    title: "Ethereum Pectra Upgrade (est.)",
    category: "upgrade",
    impact: "high",
    affectedTokens: ["ETH-USD"],
    description:
      "Combined Prague/Electra upgrade. Includes EIP-7702 account abstraction, EIP-7251 validator consolidation, and PeerDAS for blob scaling.",
  },
  {
    date: "2026-08-01",
    title: "Solana Firedancer Mainnet (est.)",
    category: "upgrade",
    impact: "high",
    affectedTokens: ["SOL-USD"],
    description:
      "Jump Crypto's independent validator client. Aims to dramatically increase Solana throughput and network resilience.",
  },

  // ── Token Unlocks ──
  {
    date: "2026-07-15",
    title: "ARB Token Unlock",
    category: "unlock",
    impact: "medium",
    affectedTokens: ["ARB11841-USD"],
    description:
      "Scheduled Arbitrum team and investor token unlock. Can create sell pressure if large relative to daily volume.",
  },
  {
    date: "2026-08-01",
    title: "OP Token Unlock",
    category: "unlock",
    impact: "medium",
    affectedTokens: ["OP-USD"],
    description:
      "Optimism ecosystem and team token unlock. Monitor unlock size relative to circulating supply.",
  },

  // ── ETF Milestones ──
  {
    date: "2026-07-01",
    title: "SOL ETF Decision Window",
    category: "etf",
    impact: "high",
    affectedTokens: ["SOL-USD"],
    description:
      "SEC decision window for Solana spot ETF applications. Approval would significantly expand institutional access.",
  },
  {
    date: "2026-09-15",
    title: "Ethereum ETF Staking Decision",
    category: "etf",
    impact: "medium",
    affectedTokens: ["ETH-USD"],
    description:
      "Expected SEC decision on allowing staking for spot Ethereum ETFs. Would increase ETH ETF yield attractiveness.",
  },
];

/**
 * BTC halving countdown utility.
 * Next halving estimated at block 1,050,000 (~April 2028).
 * Blocks are mined ~every 10 minutes.
 */
export function getBtcHalvingCountdown(): {
  estimatedDate: string;
  daysAway: number;
  blockTarget: number;
} {
  const halvingDate = new Date("2028-04-15T00:00:00Z");
  const now = new Date();
  const daysAway = Math.max(
    0,
    Math.ceil((halvingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  return {
    estimatedDate: "2028-04-15",
    daysAway,
    blockTarget: 1_050_000,
  };
}
