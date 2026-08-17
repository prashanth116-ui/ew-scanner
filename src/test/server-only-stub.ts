/**
 * No-op stand-in for the `server-only` package under Vitest.
 *
 * `server-only` throws on import outside a Server Component, which is exactly what it is
 * for — but it also makes server modules untestable. Aliasing it here lets the pure
 * scoring and market-structure functions be unit tested without weakening the guard in
 * application code, where the real package still resolves.
 */
export {};
