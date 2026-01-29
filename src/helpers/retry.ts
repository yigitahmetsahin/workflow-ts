import { RetryConfig, NormalizedRetryOptions } from '../work.types';

/**
 * Normalize retry config to full options with defaults
 */
export function normalizeRetryConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  retry: RetryConfig<any, any> | undefined
): NormalizedRetryOptions | null {
  if (retry === undefined) {
    return null;
  }

  if (typeof retry === 'number') {
    return {
      maxRetries: retry,
      delay: 0,
      backoff: 'fixed',
      backoffMultiplier: 2,
      maxDelay: Infinity,
    };
  }

  return {
    maxRetries: retry.maxRetries,
    delay: retry.delay ?? 0,
    backoff: retry.backoff ?? 'fixed',
    backoffMultiplier: retry.backoffMultiplier ?? 2,
    maxDelay: retry.maxDelay ?? Infinity,
    attemptTimeout: retry.attemptTimeout,
    shouldRetry: retry.shouldRetry,
    onRetry: retry.onRetry,
  };
}

/**
 * Calculate delay for a given retry attempt
 * @param options Normalized retry options
 * @param attempt Current attempt number (1-indexed, so attempt 1 is after first failure)
 */
export function calculateRetryDelay(options: NormalizedRetryOptions, attempt: number): number {
  if (options.delay === 0) {
    return 0;
  }

  let delay: number;
  if (options.backoff === 'exponential') {
    // For exponential: delay * multiplier^(attempt-1)
    // attempt 1: delay * 1, attempt 2: delay * multiplier, attempt 3: delay * multiplier^2
    delay = options.delay * Math.pow(options.backoffMultiplier, attempt - 1);
  } else {
    delay = options.delay;
  }

  return Math.min(delay, options.maxDelay);
}
