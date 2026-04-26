/** Shared API utilities: input validation, origin checks, ticker sanitization. */

const TICKER_RE = /^[A-Z0-9.]{1,10}$/;

/** Validate and sanitize a stock ticker symbol. Returns null if invalid. */
export function validateTicker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const ticker = raw.trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) return null;
  return ticker;
}

/** Validate an array of tickers. Returns sanitized array (invalid entries removed). */
export function validateTickers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => validateTicker(t))
    .filter((t): t is string => t !== null);
}

/** Sanitize a string for embedding in LLM prompts — prevents prompt injection. */
export function sanitizeForPrompt(raw: string, maxLen = 200): string {
  return raw.replace(/[^\w\s.,\-()/$%#@&!?:;'"+]/g, "").slice(0, maxLen);
}

/**
 * Check if request is from same origin (browser) or has valid API key.
 * Returns null if authorized, or a NextResponse if unauthorized.
 */
export function checkOriginAuth(
  request: Request,
  envKey?: string
): { authorized: boolean; reason?: string } {
  // Check for API key in Authorization header
  if (envKey) {
    const authHeader = request.headers.get("authorization");
    if (authHeader === `Bearer ${envKey}`) {
      return { authorized: true };
    }
  }

  // Check same-origin (browser requests)
  const origin = request.headers.get("origin") ?? "";
  const host = request.headers.get("host") ?? "";
  if (origin && host) {
    const isSameOrigin =
      origin === `https://${host}` || origin === `http://${host}`;
    if (isSameOrigin) return { authorized: true };
  }

  // Check referer as fallback (some browsers don't send origin on same-site)
  const referer = request.headers.get("referer") ?? "";
  if (referer && host && referer.includes(host)) {
    return { authorized: true };
  }

  // No origin/referer = server-side or curl — block unless API key provided
  if (!origin && !referer) {
    return { authorized: false, reason: "Missing origin header" };
  }

  return { authorized: false, reason: "Cross-origin request" };
}
