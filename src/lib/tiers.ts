/** Feature tier definitions and limit checks. */

export type Tier = "free" | "pro" | "unlimited";

export interface TierLimits {
  /** AI deep analyses per month */
  deepAnalyses: number;
  /** AI batch label calls per month */
  labelBatches: number;
  /** Pre-run AI scores per month */
  aiScores: number;
  /** Scans per day */
  scansPerDay: number;
  /** Max watchlists */
  watchlists: number;
  /** Max items per watchlist */
  watchlistItems: number;
  /** Max saved scans */
  savedScans: number;
  /** Can export data */
  canExport: boolean;
  /** Price in cents (0 = free) */
  priceCents: number;
  /** Stripe price ID (set via env) */
  stripePriceEnv?: string;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    deepAnalyses: 3,
    labelBatches: 1,
    aiScores: 5,
    scansPerDay: 5,
    watchlists: 1,
    watchlistItems: 20,
    savedScans: 3,
    canExport: false,
    priceCents: 0,
  },
  pro: {
    deepAnalyses: 50,
    labelBatches: 10,
    aiScores: 50,
    scansPerDay: 50,
    watchlists: 10,
    watchlistItems: 100,
    savedScans: 50,
    canExport: true,
    priceCents: 2900,
    stripePriceEnv: "STRIPE_PRO_PRICE_ID",
  },
  unlimited: {
    deepAnalyses: Infinity,
    labelBatches: Infinity,
    aiScores: Infinity,
    scansPerDay: Infinity,
    watchlists: Infinity,
    watchlistItems: Infinity,
    savedScans: Infinity,
    canExport: true,
    priceCents: 9900,
    stripePriceEnv: "STRIPE_UNLIMITED_PRICE_ID",
  },
};

export type UsageKey =
  | "deep_analyses"
  | "label_batches"
  | "ai_scores"
  | "scans";

/** Map usage key to the corresponding tier limit field. */
export function getLimitForKey(tier: Tier, key: UsageKey): number {
  const limits = TIER_LIMITS[tier];
  switch (key) {
    case "deep_analyses":
      return limits.deepAnalyses;
    case "label_batches":
      return limits.labelBatches;
    case "ai_scores":
      return limits.aiScores;
    case "scans":
      return limits.scansPerDay;
  }
}

/** Human-friendly tier labels. */
export const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  pro: "Pro",
  unlimited: "Unlimited",
};
