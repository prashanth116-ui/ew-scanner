import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Map Stripe price IDs to tier names. */
function tierForPrice(priceId: string): "pro" | "unlimited" | null {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === process.env.STRIPE_UNLIMITED_PRICE_ID) return "unlimited";
  return null;
}

/** Extract subscription data we need. Period end is on items in Stripe v22+. */
function getSubData(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  return {
    id: sub.id,
    status: sub.status,
    customer:
      typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    priceId: item?.price.id ?? "",
    periodEnd: item?.current_period_end ?? 0,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}

export async function POST(request: NextRequest) {
  if (!stripeKey || !webhookSecret || !supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey);
  const body = await request.text();
  const sig = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Use service role client to bypass RLS
  const supabase = createServerClient(supabaseUrl, supabaseServiceKey, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      if (!userId || !session.subscription) break;

      const subResponse = await stripe.subscriptions.retrieve(
        session.subscription as string
      );
      const sd = getSubData(subResponse as unknown as Stripe.Subscription);
      const tier = tierForPrice(sd.priceId);

      if (tier) {
        await supabase
          .from("subscriptions")
          .update({
            tier,
            stripe_subscription_id: sd.id,
            current_period_end: sd.periodEnd
              ? new Date(sd.periodEnd * 1000).toISOString()
              : null,
            cancel_at_period_end: sd.cancelAtPeriodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const sd = getSubData(subscription);

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", sd.customer)
        .single();

      if (!sub) break;

      if (sd.status === "canceled" || sd.status === "unpaid") {
        await supabase
          .from("subscriptions")
          .update({
            tier: "free",
            stripe_subscription_id: null,
            current_period_end: null,
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", sub.user_id);
      } else {
        const tier = tierForPrice(sd.priceId);

        if (tier) {
          await supabase
            .from("subscriptions")
            .update({
              tier,
              current_period_end: sd.periodEnd
                ? new Date(sd.periodEnd * 1000).toISOString()
                : null,
              cancel_at_period_end: sd.cancelAtPeriodEnd,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", sub.user_id);
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
