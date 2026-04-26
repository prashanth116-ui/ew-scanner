import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { type Tier, TIER_LIMITS } from "@/lib/tiers";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ tier: "free", limits: TIER_LIMITS.free, usage: {} });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ tier: "free", limits: TIER_LIMITS.free, usage: {} });
  }

  // Get subscription
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier, cancel_at_period_end, current_period_end")
    .eq("user_id", user.id)
    .single();

  const tier: Tier = (sub?.tier as Tier) ?? "free";

  // Get current month usage
  const now = new Date();
  const monthPeriod = now.toISOString().slice(0, 7);
  const dayPeriod = now.toISOString().slice(0, 10);

  const { data: monthlyUsage } = await supabase
    .from("usage")
    .select("usage_key, count")
    .eq("user_id", user.id)
    .eq("period", monthPeriod);

  const { data: dailyUsage } = await supabase
    .from("usage")
    .select("usage_key, count")
    .eq("user_id", user.id)
    .eq("period", dayPeriod);

  const usage: Record<string, number> = {};
  for (const row of monthlyUsage ?? []) {
    usage[row.usage_key] = row.count;
  }
  for (const row of dailyUsage ?? []) {
    usage[row.usage_key] = row.count;
  }

  return NextResponse.json({
    tier,
    limits: TIER_LIMITS[tier],
    usage,
    cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
    periodEnd: sub?.current_period_end ?? null,
  });
}
