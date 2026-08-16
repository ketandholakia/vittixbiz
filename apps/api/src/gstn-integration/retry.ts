/**
 * Retry a flaky operation with exponential backoff and jitter.
 *
 * GSTN/GSP APIs are known to be flaky, so every adapter HTTP call goes
 * through this. No external dependency needed.
 */

export interface RetryOptions {
  /** Number of retries AFTER the first attempt (default 3 → up to 4 calls). */
  maxRetries?: number;
  /** Initial delay in ms (default 250). */
  baseDelayMs?: number;
  /** Upper bound for the backoff delay in ms (default 4000). */
  maxDelayMs?: number;
  /** Optional predicate to decide whether an error is retryable (default: all). */
  isRetryable?: (error: unknown) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 250,
    maxDelayMs = 4000,
    isRetryable = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || !isRetryable(error)) {
        break;
      }
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 100);
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }
  }

  throw lastError;
}