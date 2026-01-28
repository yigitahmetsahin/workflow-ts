/**
 * Base error class for all work-tree errors.
 * Extend this class to define custom errors for the library.
 *
 * This allows consumers to catch all library errors with:
 * ```typescript
 * try {
 *   await tree.run(data);
 * } catch (error) {
 *   if (error instanceof WorkTreeError) {
 *     // Handle any work-tree error
 *   }
 * }
 * ```
 */
export class WorkTreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkTreeError';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
