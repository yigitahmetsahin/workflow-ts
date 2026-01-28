/**
 * =============================================================================
 * IMPORTANT: All types MUST be defined in this file (work.types.ts)
 * =============================================================================
 *
 * This file is the single source of truth for all type definitions in the
 * work-tree library. Do NOT define types directly in work.ts or other files.
 *
 * Guidelines:
 * - Use `interface` for contracts implemented by classes (IWorkDefinition, etc.)
 * - Use `type` for data structures and type aliases (WorkResult, TreeResult, etc.)
 * - Use `enum` for status values (WorkStatus)
 *
 * Internal helper types (MaybeRecord, UnionToIntersection, etc.) also belong here.
 * =============================================================================
 */

/**
 * Work Status
 */
export enum WorkStatus {
  Completed = 'completed',
  Failed = 'failed',
  Skipped = 'skipped',
}

/**
 * Result of a single work execution
 */
export type WorkResult<TResult = unknown> = {
  status: WorkStatus;
  result?: TResult;
  error?: Error;
  duration: number;
  /** Parent work name, if this work is nested inside a tree work */
  parent?: string;
  /** Total number of attempts (1 = no retries, 2+ = retried) */
  attempts?: number;
};

/**
 * Type-safe map for work results with automatic type inference
 */
export interface IWorkResultsMap<
  TWorkResults extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Get a work result with compile-time type checking */
  get<K extends keyof TWorkResults>(name: K): WorkResult<TWorkResults[K]>;
  set<K extends keyof TWorkResults>(name: K, value: WorkResult<TWorkResults[K]>): void;
  /** Check if a work result exists */
  has(name: string): boolean;
}

/**
 * Context passed to work execute functions
 */
export type WorkflowContext<
  TData = Record<string, unknown>,
  TWorkResults extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Shared data between works */
  data: TData;
  /** Work-specific results keyed by work name with inferred types */
  workResults: IWorkResultsMap<TWorkResults>;
};

/**
 * Result of tree execution
 */
export type TreeResult<
  TData = Record<string, unknown>,
  TWorkResults extends Record<string, unknown> = Record<string, unknown>,
> = {
  status: WorkStatus;
  context: WorkflowContext<TData, TWorkResults>;
  workResults: Map<keyof TWorkResults, WorkResult>;
  totalDuration: number;
  error?: Error;
};

// ============================================================================
// Unified Work Types
// ============================================================================

/**
 * Full retry configuration options
 */
export type RetryOptions<
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Maximum number of retry attempts (not including the initial attempt) */
  maxRetries: number;
  /** Delay between retries in milliseconds (default: 0) */
  delay?: number;
  /** Backoff strategy: 'fixed' keeps delay constant, 'exponential' multiplies delay each retry (default: 'fixed') */
  backoff?: 'fixed' | 'exponential';
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Maximum delay cap in milliseconds for exponential backoff (default: Infinity) */
  maxDelay?: number;
  /** Optional: determine if a retry should be attempted based on the error */
  shouldRetry?: (
    error: Error,
    attempt: number,
    context: WorkflowContext<TData, TAvailableWorkResults>
  ) => boolean | Promise<boolean>;
  /** Optional: called before each retry attempt */
  onRetry?: (
    error: Error,
    attempt: number,
    context: WorkflowContext<TData, TAvailableWorkResults>
  ) => void | Promise<void>;
};

/**
 * Retry configuration - either a simple retry count or full options
 */
export type RetryConfig<
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> = number | RetryOptions<TData, TAvailableWorkResults>;

/**
 * Full timeout configuration options
 */
export type TimeoutOptions<
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Timeout duration in milliseconds */
  ms: number;
  /** Optional: called when timeout occurs (before error is thrown) */
  onTimeout?: (context: WorkflowContext<TData, TAvailableWorkResults>) => void | Promise<void>;
};

/**
 * Timeout configuration - either a simple timeout in milliseconds or full options
 */
export type TimeoutConfig<
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> = number | TimeoutOptions<TData, TAvailableWorkResults>;

/**
 * Common behavior options for works and trees (shouldRun, onError, onSkipped, silenceError, retry, timeout)
 */
export type WorkBehaviorOptions<
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Optional: condition to determine if work should run */
  shouldRun?: (
    context: WorkflowContext<TData, TAvailableWorkResults>
  ) => boolean | Promise<boolean>;
  /** Optional: called when work fails */
  onError?: (
    error: Error,
    context: WorkflowContext<TData, TAvailableWorkResults>
  ) => void | Promise<void>;
  /** Optional: called when work is skipped (shouldRun returns false) */
  onSkipped?: (context: WorkflowContext<TData, TAvailableWorkResults>) => void | Promise<void>;
  /** Optional: if true, errors won't stop the workflow */
  silenceError?: boolean;
  /** Optional: retry configuration - number of retries or full options */
  retry?: RetryConfig<TData, TAvailableWorkResults>;
  /** Optional: timeout configuration - milliseconds or full options */
  timeout?: TimeoutConfig<TData, TAvailableWorkResults>;
};

/**
 * Input type for parallel/serial - can be a leaf work or tree work
 */
export type WorkInput<
  TName extends string,
  TData = Record<string, unknown>,
  TResult = unknown,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> =
  | IWorkDefinition<TName, TData, TResult, TAvailableWorkResults>
  | ITreeWorkDefinition<TName, TData, TAvailableWorkResults>;

/**
 * Definition of a leaf work with inferred name and result type.
 * Leaf works have `execute` and cannot have tree structure.
 */
export interface IWorkDefinition<
  TName extends string,
  TData = Record<string, unknown>,
  TResult = unknown,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> extends WorkBehaviorOptions<TData, TAvailableWorkResults> {
  /** Unique name for the work */
  name: TName;
  /** Execute function - receives context and returns result */
  execute: (context: WorkflowContext<TData, TAvailableWorkResults>) => Promise<TResult>;
}

/**
 * Internal step in a tree work - either a serial step or a parallel step
 */
export type TreeWorkStep<
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> =
  | {
      type: 'serial';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      work: WorkInput<string, TData, any, TAvailableWorkResults>;
    }
  | {
      type: 'parallel';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      works: readonly WorkInput<string, TData, any, TAvailableWorkResults>[];
    };

/**
 * Definition of a tree work - contains nested works that execute as a unit.
 * Tree works have steps (serial/parallel) instead of execute.
 * Built using `Work.tree('treeName').addSerial(...).addParallel(...)`.
 */
export interface ITreeWorkDefinition<
  TName extends string,
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> extends WorkBehaviorOptions<TData, TAvailableWorkResults> {
  /** Unique name for the tree work */
  name: TName;
  /** Steps to execute (in order) */
  steps: readonly TreeWorkStep<TData, TAvailableWorkResults>[];
  /** Internal marker to identify tree works */
  readonly _isTree: true;
}

/**
 * Runtime options for tree execution
 */
export type TreeRunOptions = {
  /** If true (default), stop execution on first error. If false, collect all errors. */
  failFast?: boolean;
};

/**
 * Options for Work.tree() factory (excludes name, which is passed separately)
 */
export type TreeWorkFactoryOptions<
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> = TreeRunOptions & WorkBehaviorOptions<TData, TAvailableWorkResults>;

/**
 * Options for building a tree work (internal, includes name)
 */
export type TreeWorkOptions<
  TName extends string,
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> = TreeWorkFactoryOptions<TData, TAvailableWorkResults> & {
  /** Unique name for the tree work */
  name: TName;
};

/**
 * Common interface for runnable tree works (both sealed and unsealed).
 * TreeWork implements this interface.
 */
export interface IRunnableTreeWork<
  TData = Record<string, unknown>,
  TWorkResults extends Record<string, unknown> = Record<string, unknown>,
> {
  /** The tree name */
  readonly name: string;
  /** The tree options */
  readonly options: Readonly<Required<TreeRunOptions>>;
  /** Check if the tree is sealed */
  isSealed(): boolean;
  /** Execute the tree */
  run(data: TData): Promise<TreeResult<TData, TWorkResults>>;
}

/**
 * Unique symbol brand for sealed tree works.
 * This produces a nominal type that cannot be accidentally satisfied.
 */
declare const SEALED_BRAND: unique symbol;

/**
 * A sealed tree work that cannot be modified.
 * Has run() but no addSerial() or addParallel() methods.
 * Uses a unique symbol brand to ensure only trees that have been
 * explicitly sealed can satisfy this type.
 */
export type SealedTreeWork<
  TData = Record<string, unknown>,
  TWorkResults extends Record<string, unknown> = Record<string, unknown>,
> = IRunnableTreeWork<TData, TWorkResults> & {
  readonly [SEALED_BRAND]: true;
};

// ============================================================================
// Internal Helper Types
// ============================================================================

/**
 * Helper type that only produces a record if the key is a literal string.
 * If K is the wide 'string' type, returns empty object to avoid index signatures.
 * This prevents { [x: string]: unknown } from polluting accumulated types.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type MaybeRecord<K extends string, V> = string extends K ? {} : { [P in K]: V };

/**
 * Normalized retry options with all defaults filled in (internal use)
 */
export type NormalizedRetryOptions = {
  maxRetries: number;
  delay: number;
  backoff: 'fixed' | 'exponential';
  backoffMultiplier: number;
  maxDelay: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shouldRetry?: RetryOptions<any, any>['shouldRetry'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRetry?: RetryOptions<any, any>['onRetry'];
};

/**
 * Normalized timeout options with all defaults filled in (internal use)
 */
export type NormalizedTimeoutOptions = {
  ms: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTimeout?: TimeoutOptions<any, any>['onTimeout'];
};

/**
 * Input type for parallel works - accepts works with any available results.
 * This is more permissive than WorkInput to allow nested trees with their own accumulated types.
 */
export type ParallelWorkInput<TData> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | IWorkDefinition<string, TData, unknown, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | ITreeWorkDefinition<string, TData, any>;

/**
 * Helper type to convert union to intersection
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

/**
 * Helper type to extract the result type from a work (name -> result mapping).
 * Uses MaybeRecord to avoid index signatures when tree names are generic 'string'.
 */
export type ExtractWorkResult<TWork> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TWork extends IWorkDefinition<infer N, any, infer R, any>
    ? { [K in N]: R }
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      TWork extends ITreeWorkDefinition<infer N, any, any>
      ? MaybeRecord<N, unknown>
      : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        {};

/**
 * Helper type to extract accumulated inner works from a TreeWork.
 * This allows nested tree's inner works to be accessible in outer tree.
 * Note: This type uses TreeWork from work.ts, so it must be defined there
 * to avoid circular imports. Re-exported here for convenience.
 */
// TreeWork-specific type defined in work.ts due to circular dependency
