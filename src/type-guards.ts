import type { WorkInput, ITreeWorkDefinition } from './work.types';

/**
 * Type guard to check if a work input is a tree work definition
 */
export function isTreeWorkDefinition<
  TName extends string,
  TData,
  TAvailableWorkResults extends Record<string, unknown>,
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: WorkInput<TName, TData, any, TAvailableWorkResults>
): input is ITreeWorkDefinition<TName, TData, TAvailableWorkResults> {
  return input && typeof input === 'object' && '_isTree' in input && input._isTree === true;
}
