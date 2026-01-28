/**
 * TreeWork-specific types that require referencing the TreeWork class.
 *
 * These types use `import type` to avoid runtime circular dependency.
 * TypeScript handles type-only imports specially, erasing them at compile time.
 */

import type { TreeWork } from './tree-work';
import type { WorkInput, UnionToIntersection, ExtractWorkResult } from './work.types';

/**
 * Extracts the accumulated type parameter from a TreeWork.
 * This allows nested tree's inner works to be accessible in the outer tree.
 *
 * @internal - Used for addParallel type inference
 */
export type ExtractTreeAccumulated<TWork> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TWork extends TreeWork<any, any, any, infer A>
    ? A
    : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      {};

/**
 * Converts an array of parallel works to a record of their result types.
 * Also extracts inner works from nested TreeWorks for type inference.
 *
 * @internal - Used for addParallel type inference
 */
export type WorksToRecord<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TParallelWorks extends readonly WorkInput<string, any, any, any>[],
> = UnionToIntersection<
  {
    [K in keyof TParallelWorks]: ExtractWorkResult<TParallelWorks[K]> &
      ExtractTreeAccumulated<TParallelWorks[K]>;
  }[number]
>;
