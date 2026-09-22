/**
 * Spend guardrails for the three Anthropic-billed routes.
 *
 * `/api/deep`, `/api/label` and `/api/prerun/ai-score` each cost real credits per call,
 * and as of 2026-09-22 all three guards in front of them leaked:
 *
 *   - `checkOriginAuth()` authorises on an `Origin` matching the host or a `Referer` merely
 *     CONTAINING it. Both are attacker-controlled: it is CSRF protection, not authentication.
 *   - `checkFeatureGate()` returns `allowed: true` with no `userId` when nobody is signed in,
 *     so the per-tier monthly ceilings bind only signed-in accounts.
 *   - `rateLimit()` is a module-scope Map, so on Vercel "10/min per IP" is really 10/min per
 *     lambda instance, and `getClientKey()` buckets every header-less caller under a shared
 *     "127.0.0.1".
 *
 * The missing primitive was never a tighter per-IP limit — it was a ceiling on the total,
 * independent of who is calling or how many instances are warm. That is what this adds.
 *
 * Anonymous access is capped rather than blocked: the app has no registered users, so
 * requiring auth would close the product to everyone. A separate, smaller anonymous budget
 * bounds the blast radius while leaving the demo path open.
 *
 * KV-backed when `KV_REST_API_URL` is set; otherwise it degrades to the same per-instance
 * counters as before and says so in the logs, because a silent downgrade of a spend control
 * is worse than no spend control.
 */

import "server-only";
import { rateLimit } from "@/lib/rate-limit";

const int = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
};

/** Total billable model calls per UTC day across all three routes. */
export const AI_DAILY_CAP = int(process.env.AI_DAILY_CALL_CAP, 400);
/** Of that total, the most anonymous callers may consume. */
export const AI_ANON_DAILY_CAP = int(process.env.AI_ANON_DAILY_CALL_CAP, 60);

const DAY_TTL_SECONDS = 172_800; // 2 days — outlives the counter it guards
const MINUTE_TTL_SECONDS = 120;

export interface BudgetDecision {
  allowed: boolean;
  /** HTTP status to return when denied. */
  status: number;
  reason?: string;
  /** Seconds, for a Retry-After header. */
  retryAfter?: number;
}

const ALLOW: BudgetDecision = { allowed: true, status: 200 };

/**
 * Client identity for rate limiting. Unlike `getClientKey()` this returns null rather than
 * collapsing header-less callers into one shared bucket — on a billable route, "I cannot
 * tell who this is" must not be a cheaper path than being identifiable.
 */
function strictClientKey(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim();
  if (ip) return ip;
  const real = request.headers.get("x-real-ip")?.trim();
  return real || null;
}

let warnedNoKv = false;

async function kvClient() {
  if (!process.env.KV_REST_API_URL) {
    if (!warnedNoKv) {
      warnedNoKv = true;
      console.warn(
        "[ai-budget] KV_REST_API_URL unset — spend caps are per-instance only and will NOT hold across lambdas"
      );
    }
    return null;
  }
  try {
    const { kv } = await import("@vercel/kv");
    return kv;
  } catch {
    return null;
  }
}

/** Per-instance fallback counters, used only when KV is unavailable. */
const localDaily = new Map<string, number>();

function localIncr(key: string, by: number): number {
  const next = (localDaily.get(key) ?? 0) + by;
  localDaily.set(key, next);
  // Keys are date-stamped; drop anything not from today so the map can't grow unbounded.
  const today = key.slice(key.lastIndexOf(":") + 1);
  for (const k of localDaily.keys()) {
    if (!k.endsWith(today)) localDaily.delete(k);
  }
  return next;
}

export interface BudgetOptions {
  /** Route name, for the per-client bucket. */
  route: string;
  /** Per-client calls per minute. */
  perMinute: number;
  /** True when a signed-in user was resolved — those are already bound by tier limits. */
  identified: boolean;
  /**
   * Billable model calls this request will make. `/api/label` fans one HTTP request out to
   * one Haiku call per 25 candidates, so counting requests there would undercount spend.
   */
  units?: number;
}

/**
 * Check and consume budget for one billable request.
 * Counters are incremented on the way in; a denied request has already been counted, which
 * is the safe direction for a spend control.
 */
export async function checkAiBudget(
  request: Request,
  opts: BudgetOptions
): Promise<BudgetDecision> {
  const units = Math.max(1, opts.units ?? 1);
  const clientKey = strictClientKey(request);
  if (!clientKey) {
    return {
      allowed: false,
      status: 400,
      reason: "Unable to identify client",
    };
  }

  const day = new Date().toISOString().slice(0, 10);
  const minute = Math.floor(Date.now() / 60_000);
  const kv = await kvClient();

  if (!kv) {
    // Degraded: per-instance only. Still better than nothing, and the warning above fired.
    const rl = rateLimit(`${opts.route}:${clientKey}`, opts.perMinute, 60_000);
    if (!rl.allowed) {
      return { allowed: false, status: 429, reason: "Rate limit exceeded", retryAfter: rl.retryAfter };
    }
    if (localIncr(`ai:day:${day}`, units) > AI_DAILY_CAP) {
      return { allowed: false, status: 429, reason: "Daily AI budget reached", retryAfter: 3600 };
    }
    if (!opts.identified && localIncr(`ai:anon:${day}`, units) > AI_ANON_DAILY_CAP) {
      return { allowed: false, status: 429, reason: "Daily anonymous AI budget reached", retryAfter: 3600 };
    }
    return ALLOW;
  }

  try {
    const rlKey = `ai:rl:${opts.route}:${clientKey}:${minute}`;
    const hits = await kv.incr(rlKey);
    if (hits === 1) await kv.expire(rlKey, MINUTE_TTL_SECONDS);
    if (hits > opts.perMinute) {
      return { allowed: false, status: 429, reason: "Rate limit exceeded", retryAfter: 60 };
    }

    if (!opts.identified) {
      const anonKey = `ai:anon:${day}`;
      const anon = await kv.incrby(anonKey, units);
      if (anon === units) await kv.expire(anonKey, DAY_TTL_SECONDS);
      if (anon > AI_ANON_DAILY_CAP) {
        return {
          allowed: false,
          status: 429,
          reason: "Daily anonymous AI budget reached",
          retryAfter: 3600,
        };
      }
    }

    const dayKey = `ai:day:${day}`;
    const total = await kv.incrby(dayKey, units);
    if (total === units) await kv.expire(dayKey, DAY_TTL_SECONDS);
    if (total > AI_DAILY_CAP) {
      return {
        allowed: false,
        status: 429,
        reason: "Daily AI budget reached",
        retryAfter: 3600,
      };
    }

    return ALLOW;
  } catch (err) {
    // A KV outage must not become an open door: fall back to the per-instance path rather
    // than allowing unbounded spend.
    console.error("[ai-budget] KV error, falling back to per-instance counters:", err);
    const rl = rateLimit(`${opts.route}:${clientKey}`, opts.perMinute, 60_000);
    if (!rl.allowed) {
      return { allowed: false, status: 429, reason: "Rate limit exceeded", retryAfter: rl.retryAfter };
    }
    if (localIncr(`ai:day:${day}`, units) > AI_DAILY_CAP) {
      return { allowed: false, status: 429, reason: "Daily AI budget reached", retryAfter: 3600 };
    }
    return ALLOW;
  }
}

/** Today's consumption, for diagnostics. Returns null when KV is unavailable. */
export async function readAiSpend(): Promise<{ total: number; anonymous: number } | null> {
  const kv = await kvClient();
  if (!kv) return null;
  const day = new Date().toISOString().slice(0, 10);
  try {
    const [total, anonymous] = await Promise.all([
      kv.get<number>(`ai:day:${day}`),
      kv.get<number>(`ai:anon:${day}`),
    ]);
    return { total: total ?? 0, anonymous: anonymous ?? 0 };
  } catch {
    return null;
  }
}
