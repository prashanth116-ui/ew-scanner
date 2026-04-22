/** Lightweight structured error logging. */

export function logError(
  context: string,
  error: unknown,
  metadata?: Record<string, unknown>
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    context,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...metadata,
  };
  console.error("[EW-ERROR]", JSON.stringify(entry));
}
