/**
 * Turning thrown values into messages a user can act on.
 *
 * Generic catch blocks that report "could not reach the server" for every
 * failure hid the real cause of several bugs during development -- the SDK
 * throws on HTTP errors, and those messages were being replaced with a
 * misleading connection error. Prefer the real message; fall back to the
 * generic wording only when there genuinely isn't one.
 */

const OFFLINE = 'Could not reach the server. Check your connection and try again.';

/** True for a real transport failure, as opposed to an HTTP error response. */
function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'TypeError' &&
    /failed to fetch|networkerror|load failed/i.test(error.message)
  );
}

export function describeError(error: unknown, context?: string): string {
  if (isNetworkFailure(error)) return OFFLINE;

  if (error && typeof error === 'object') {
    const o = error as Record<string, unknown>;
    const nested = (o.body ?? o.error ?? o.response ?? {}) as Record<string, unknown>;
    const message =
      typeof nested.message === 'string'
        ? nested.message
        : typeof o.message === 'string'
          ? o.message
          : undefined;
    const status = typeof o.status === 'number' ? o.status : undefined;

    if (message) {
      const cleaned = message.replace(/^\[[^\]]+\]\s*/, '');
      return context ? `${context}: ${cleaned}` : cleaned;
    }
    if (status) return `${context ?? 'Request failed'} (HTTP ${status})`;
  }

  if (typeof error === 'string' && error.length > 0) return error;
  return OFFLINE;
}
