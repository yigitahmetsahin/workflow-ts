import type { ParallelInput, IGroupWorkDefinition } from './work.types';

/**
 * Type guard to check if a parallel input is a group work definition
 */
export function isGroupWorkDefinition<
  TName extends string,
  TData,
  TAvailableWorkResults extends Record<string, unknown>,
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: ParallelInput<TName, TData, any, TAvailableWorkResults>
): input is IGroupWorkDefinition<TName, TData, TAvailableWorkResults> {
  return 'serial' in input || 'parallel' in input;
}
