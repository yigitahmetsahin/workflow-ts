import { TimeoutConfig, NormalizedTimeoutOptions, WorkflowContext } from '../work.types';
import { TimeoutError } from '../errors';

/**
 * Normalize timeout config to full options with defaults
 */
export function normalizeTimeoutConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timeout: TimeoutConfig<any, any> | undefined
): NormalizedTimeoutOptions | null {
  if (timeout === undefined) {
    return null;
  }

  if (typeof timeout === 'number') {
    return { ms: timeout };
  }

  return {
    ms: timeout.ms,
    onTimeout: timeout.onTimeout,
  };
}

/**
 * Execute a function with a timeout
 * @param execute The function to execute
 * @param workName The name of the work (for error message)
 * @param timeoutConfig Normalized timeout configuration
 * @param context The workflow context (passed to onTimeout callback)
 * @returns The result of the execute function
 * @throws TimeoutError if the execution times out
 */
export async function executeWithTimeout<TResult>(
  execute: () => Promise<TResult>,
  workName: string,
  timeoutConfig: NormalizedTimeoutOptions | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: WorkflowContext<any, any>
): Promise<TResult> {
  if (!timeoutConfig) {
    return execute();
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      // Fire onTimeout callback (don't await, fire-and-forget to not delay rejection)
      if (timeoutConfig.onTimeout) {
        Promise.resolve(timeoutConfig.onTimeout(context)).catch(() => {
          // Ignore errors in onTimeout callback
        });
      }
      reject(new TimeoutError(workName, timeoutConfig.ms));
    }, timeoutConfig.ms);
  });

  try {
    return await Promise.race([execute(), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
