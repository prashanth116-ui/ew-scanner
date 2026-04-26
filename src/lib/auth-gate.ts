/**
 * Server-side feature gating: check user tier + usage limits.
 * Used in API routes to enforce free/pro/unlimited limits.
 */

import { createClient } from "@/lib/supabase/server";
import { type Tier, type UsageKey, getLimitForKey } from "@/lib/tiers";

interface GateResult {
  allowed: boolean;
  tier: Tier;
  used: number;
  limit: number;
  userId?: string;
  reason?: string;
}

/**
 * Check if the current user is allowed to use a feature.
 * Returns { allowed, tier, used, limit } for the caller to act on.
 *
 * If Supabase is not configured or user is not logged in, falls back to
 * IP-based rate limiting (handled by the caller) and returns allowed=true
 * with tier="free".
 */
export async function checkFeatureGate(
  usageKey: UsageKey
): Promise<GateResult> {
  const supabase = await createClient();

  // If Supabase not configured, skip gating (let IP rate limit handle it)
  if (!supabase) {
    return { allowed: true, tier: "free", used: 0, limit: 0 };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not logged in — treat as free tier, let IP rate limit handle it
  if (!user) {
    return { allowed: true, tier: "free", used: 0, limit: 0 };
  }

  // Get user's subscription tier
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("user_id", user.id)
    .single();

  const tier: Tier = (sub?.tier as Tier) ?? "free";
  const limit = getLimitForKey(tier, usageKey);

  // Unlimited tier — always allowed
  if (!isFinite(limit)) {
    return { allowed: true, tier, used: 0, limit, userId: user.id };
  }

  // Determine period: daily for scans, monthly for everything else
  const now = new Date();
  const period =
    usageKey === "scans"
      ? now.toISOString().slice(0, 10) // YYYY-MM-DD
      : now.toISOString().slice(0, 7); // YYYY-MM

  // Get current usage
  const { data: usage } = await supabase
    .from("usage")
    .select("count")
    .eq("user_id", user.id)
    .eq("usage_key", usageKey)
    .eq("period", period)
    .single();

  const used = usage?.count ?? 0;

  if (used >= limit) {
    return {
      allowed: false,
      tier,
      used,
      limit,
      userId: user.id,
      reason: `${usageKey} limit reached (${used}/${limit})`,
    };
  }

  return { allowed: true, tier, used, limit, userId: user.id };
}

/**
 * Increment usage counter after a successful feature use.
 * Call this AFTER the feature completes successfully.
 */
export async function incrementUsage(
  userId: string,
  usageKey: UsageKey
): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;

  const now = new Date();
  const period =
    usageKey === "scans"
      ? now.toISOString().slice(0, 10)
      : now.toISOString().slice(0, 7);

  // Upsert: insert if new, increment if exists
  const { data: existing } = await supabase
    .from("usage")
    .select("id, count")
    .eq("user_id", userId)
    .eq("usage_key", usageKey)
    .eq("period", period)
    .single();

  if (existing) {
    await supabase
      .from("usage")
      .update({ count: existing.count + 1, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase.from("usage").insert({
      user_id: userId,
      usage_key: usageKey,
      period,
      count: 1,
    });
  }
}
