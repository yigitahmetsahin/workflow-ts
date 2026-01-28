import { WorkTreeError } from './base-error';

/**
 * Error thrown when a work execution times out
 */
export class TimeoutError extends WorkTreeError {
  /** The name of the work that timed out */
  readonly workName: string;
  /** The timeout duration in milliseconds */
  readonly timeoutMs: number;

  constructor(workName: string, timeoutMs: number) {
    super(`Work "${workName}" timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.workName = workName;
    this.timeoutMs = timeoutMs;
  }
}
