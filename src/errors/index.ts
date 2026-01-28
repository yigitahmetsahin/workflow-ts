/**
 * Error classes for work-tree
 *
 * All errors extend WorkTreeError, allowing consumers to catch
 * all library errors with a single catch block if needed.
 */

export { WorkTreeError } from './base-error';
export { TimeoutError } from './timeout-error';
