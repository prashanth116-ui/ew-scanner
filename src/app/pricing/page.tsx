"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TIER_LIMITS, TIER_LABELS, type Tier } from "@/lib/tiers";
import { Check, Loader2, Zap, Crown } from "lucide-react";
import Link from "next/link";

interface SubInfo {
  tier: Tier;
  limits: (typeof TIER_LIMITS)[Tier];
  usage: Record<string, number>;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
}

const features: {
  label: string;
  free: string;
  pro: string;
  unlimited: string;
}[] = [
  {
    label: "AI Deep Analysis",
    free: "3/month",
    pro: "50/month",
    unlimited: "Unlimited",
  },
  {
    label: "AI Batch Labels",
    free: "1/month",
    pro: "10/month",
    unlimited: "Unlimited",
  },
  {
    label: "AI Narrative Scores",
    free: "5/month",
    pro: "50/month",
    unlimited: "Unlimited",
  },
  {
    label: "Scans per day",
    free: "5",
    pro: "50",
    unlimited: "Unlimited",
  },
  {
    label: "Watchlists",
    free: "1 (20 items)",
    pro: "10 (100 items)",
    unlimited: "Unlimited",
  },
  {
    label: "Saved scans",
    free: "3",
    pro: "50",
    unlimited: "Unlimited",
  },
  {
    label: "Data export",
    free: "—",
    pro: "CSV",
    unlimited: "CSV",
  },
  {
    label: "All scanner modes",
    free: "All 4 scanners",
    pro: "All 4 scanners",
    unlimited: "All 4 scanners",
  },
];

export default function PricingPage() {
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    fetch("/api/user/subscription")
      .then((r) => r.json())
      .then((data) => {
        setSub(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCheckout = async (tier: "pro" | "unlimited") => {
    if (!supabase) {
      window.location.href = "/login";
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }

    setCheckoutLoading(tier);
    const priceId =
      tier === "pro"
        ? process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID
        : process.env.NEXT_PUBLIC_STRIPE_UNLIMITED_PRICE_ID;

    if (!priceId) {
      alert("Stripe pricing not configured yet. Coming soon!");
      setCheckoutLoading(null);
      return;
    }

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    });

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error ?? "Failed to create checkout session");
      setCheckoutLoading(null);
    }
  };

  const handlePortal = async () => {
    setCheckoutLoading("portal");
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error ?? "Failed to open portal");
      setCheckoutLoading(null);
    }
  };

  const currentTier = sub?.tier ?? "free";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Pricing</h1>
        <p className="mt-2 text-sm text-[#a0a0a0]">
          All scanners are free to use. Upgrade for more AI analyses and cloud
          features.
        </p>
      </div>

      {/* Current plan badge */}
      {!loading && sub && currentTier !== "free" && (
        <div className="mx-auto flex max-w-sm items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3">
          <div>
            <span className="text-sm text-[#a0a0a0]">Current plan: </span>
            <span className="font-medium text-white">
              {TIER_LABELS[currentTier]}
            </span>
            {sub.cancelAtPeriodEnd && (
              <span className="ml-2 text-xs text-yellow-400">
                Cancels{" "}
                {sub.periodEnd
                  ? new Date(sub.periodEnd).toLocaleDateString()
                  : "soon"}
              </span>
            )}
          </div>
          <button
            onClick={handlePortal}
            disabled={checkoutLoading === "portal"}
            className="text-xs text-[#5ba3e6] hover:underline disabled:opacity-50"
          >
            {checkoutLoading === "portal" ? "Loading..." : "Manage"}
          </button>
        </div>
      )}

      {/* Pricing cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Free */}
        <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-6">
          <h2 className="text-lg font-bold text-white">Free</h2>
          <p className="mt-1 text-2xl font-bold text-white">
            $0<span className="text-sm font-normal text-[#a0a0a0]">/mo</span>
          </p>
          <p className="mt-2 text-xs text-[#a0a0a0]">
            Get started with basic scanning
          </p>
          <div className="mt-4">
            {currentTier === "free" ? (
              <span className="block rounded-md border border-[#2a2a2a] px-4 py-2 text-center text-sm text-[#a0a0a0]">
                Current plan
              </span>
            ) : (
              <span className="block rounded-md border border-[#2a2a2a] px-4 py-2 text-center text-sm text-[#555]">
                —
              </span>
            )}
          </div>
        </div>

        {/* Pro */}
        <div className="relative rounded-lg border border-[#185FA5] bg-[#141414] p-6">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#185FA5] px-3 py-0.5 text-xs font-medium text-white">
            Popular
          </div>
          <h2 className="flex items-center gap-1.5 text-lg font-bold text-white">
            <Zap className="h-4 w-4 text-[#5ba3e6]" />
            Pro
          </h2>
          <p className="mt-1 text-2xl font-bold text-white">
            $29<span className="text-sm font-normal text-[#a0a0a0]">/mo</span>
          </p>
          <p className="mt-2 text-xs text-[#a0a0a0]">
            Full AI analysis + cloud features
          </p>
          <div className="mt-4">
            {currentTier === "pro" ? (
              <span className="block rounded-md border border-[#185FA5] px-4 py-2 text-center text-sm text-[#5ba3e6]">
                Current plan
              </span>
            ) : (
              <button
                onClick={() => handleCheckout("pro")}
                disabled={!!checkoutLoading || currentTier === "unlimited"}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a6dba] disabled:opacity-50"
              >
                {checkoutLoading === "pro" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {currentTier === "unlimited" ? "—" : "Upgrade to Pro"}
              </button>
            )}
          </div>
        </div>

        {/* Unlimited */}
        <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-6">
          <h2 className="flex items-center gap-1.5 text-lg font-bold text-white">
            <Crown className="h-4 w-4 text-yellow-400" />
            Unlimited
          </h2>
          <p className="mt-1 text-2xl font-bold text-white">
            $99<span className="text-sm font-normal text-[#a0a0a0]">/mo</span>
          </p>
          <p className="mt-2 text-xs text-[#a0a0a0]">
            No limits on anything
          </p>
          <div className="mt-4">
            {currentTier === "unlimited" ? (
              <span className="block rounded-md border border-[#2a2a2a] px-4 py-2 text-center text-sm text-[#5ba3e6]">
                Current plan
              </span>
            ) : (
              <button
                onClick={() => handleCheckout("unlimited")}
                disabled={!!checkoutLoading}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-sm font-medium text-white hover:bg-[#222] disabled:opacity-50"
              >
                {checkoutLoading === "unlimited" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Upgrade to Unlimited
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Feature comparison table */}
      <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a2a2a] bg-[#141414]">
              <th className="px-4 py-3 text-left font-medium text-[#a0a0a0]">
                Feature
              </th>
              <th className="px-4 py-3 text-center font-medium text-[#a0a0a0]">
                Free
              </th>
              <th className="px-4 py-3 text-center font-medium text-[#5ba3e6]">
                Pro
              </th>
              <th className="px-4 py-3 text-center font-medium text-yellow-400">
                Unlimited
              </th>
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr
                key={f.label}
                className="border-b border-[#1a1a1a] last:border-0"
              >
                <td className="px-4 py-2.5 text-white">{f.label}</td>
                <td className="px-4 py-2.5 text-center text-[#a0a0a0]">
                  {f.free}
                </td>
                <td className="px-4 py-2.5 text-center text-white">
                  {f.pro}
                </td>
                <td className="px-4 py-2.5 text-center text-white">
                  {f.unlimited}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Usage section for logged-in users */}
      {!loading && sub && sub.tier !== "free" && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-6">
          <h3 className="mb-4 text-sm font-medium text-white">
            Usage this period
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <UsageBar
              label="Deep analyses"
              used={sub.usage.deep_analyses ?? 0}
              limit={sub.limits.deepAnalyses}
            />
            <UsageBar
              label="Label batches"
              used={sub.usage.label_batches ?? 0}
              limit={sub.limits.labelBatches}
            />
            <UsageBar
              label="AI scores"
              used={sub.usage.ai_scores ?? 0}
              limit={sub.limits.aiScores}
            />
            <UsageBar
              label="Scans today"
              used={sub.usage.scans ?? 0}
              limit={sub.limits.scansPerDay}
            />
          </div>
        </div>
      )}

      {/* FAQ */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white">FAQ</h3>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-white">
              What happens when I hit a limit?
            </p>
            <p className="mt-1 text-[#a0a0a0]">
              You&apos;ll see a message indicating you&apos;ve reached your
              limit. Upgrade anytime to continue — your usage resets monthly.
            </p>
          </div>
          <div>
            <p className="font-medium text-white">Can I cancel anytime?</p>
            <p className="mt-1 text-[#a0a0a0]">
              Yes. Cancel through the billing portal. You keep access until the
              end of your billing period.
            </p>
          </div>
          <div>
            <p className="font-medium text-white">
              Are all scanners free to use?
            </p>
            <p className="mt-1 text-[#a0a0a0]">
              Yes — all four scanners (Elliott Wave, Squeeze, Pre-Run, and
              Sector Rotation) are always free. Paid plans unlock more
              AI-powered analyses and cloud features.
            </p>
          </div>
        </div>
      </div>

      {/* Legal links */}
      <div className="flex items-center justify-center gap-4 border-t border-[#2a2a2a] pt-6 text-xs text-[#555]">
        <Link href="/terms" className="hover:text-[#a0a0a0]">
          Terms of Service
        </Link>
        <Link href="/privacy" className="hover:text-[#a0a0a0]">
          Privacy Policy
        </Link>
        <Link href="/disclaimer" className="hover:text-[#a0a0a0]">
          Financial Disclaimer
        </Link>
      </div>
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = isFinite(limit) ? Math.min(100, (used / limit) * 100) : 0;
  const isUnlimited = !isFinite(limit);

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#a0a0a0]">{label}</span>
        <span className="text-white">
          {used}
          {isUnlimited ? "" : ` / ${limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="mt-1 h-1.5 rounded-full bg-[#2a2a2a]">
          <div
            className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-[#185FA5]"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {isUnlimited && (
        <div className="mt-1 flex items-center gap-1 text-xs text-[#555]">
          <Check className="h-3 w-3" />
          Unlimited
        </div>
      )}
    </div>
  );
}
