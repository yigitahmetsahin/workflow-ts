import type {
  WorkResult,
  IWorkDefinition,
  IGroupWorkDefinition,
  ParallelInput,
} from './work.types';

/**
 * Workflow Status
 */
export enum WorkflowStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
}

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
 * Context passed between workflow works
 * TData is the type of shared data between works
 * TWorkResults is a record mapping work names to their result types
 */
export interface IWorkflowContext<
  TData = Record<string, unknown>,
  TWorkResults extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Shared data between works */
  data: TData;
  /** Work-specific results keyed by work name with inferred types */
  workResults: IWorkResultsMap<TWorkResults>;
}

/**
 * Internal work representation
 */
export type WorkflowWork = {
  type: 'serial' | 'parallel';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  works: (IWorkDefinition<string, any, any, any> | IGroupWorkDefinition<string, any, any>)[];
};

/**
 * Result of workflow execution
 */
export type WorkflowResult<
  TData = Record<string, unknown>,
  TWorkResults extends Record<string, unknown> = Record<string, unknown>,
> = {
  status: WorkflowStatus;
  context: IWorkflowContext<TData, TWorkResults>;
  workResults: Map<keyof TWorkResults, WorkResult>;
  totalDuration: number;
  error?: Error;
};

/**
 * Interface for the Workflow class.
 * Defines all methods available on a workflow before sealing.
 */
export interface IWorkflow<
  TData = Record<string, unknown>,
  TWorkResults extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * The list of works in the workflow (readonly)
   */
  readonly works: readonly WorkflowWork[];

  /**
   * The workflow options (readonly)
   */
  readonly options: Readonly<Required<WorkflowOptions>>;

  /**
   * Add a serial work to the workflow
   */
  serial<TName extends string, TResult>(
    work: IWorkDefinition<TName, TData, TResult, TWorkResults>
  ): IWorkflow<TData, TWorkResults & { [K in TName]: TResult }>;

  /**
   * Add parallel works to the workflow
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parallel(works: readonly IWorkDefinition<string, TData, any, TWorkResults>[]): IWorkflow<
    TData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;

  /**
   * Seal the workflow to prevent further modifications
   */
  seal(): SealedWorkflow<TData, TWorkResults>;
  seal<TName extends string, TResult>(
    sealingWork: SealingWorkDefinition<TName, TData, TWorkResults, TResult>
  ): SealedWorkflow<TData, TWorkResults & { [K in TName]: TResult }>;

  /**
   * Check if the workflow is sealed
   */
  isSealed(): boolean;

  /**
   * Execute the workflow with initial data
   */
  run(initialData: TData): Promise<WorkflowResult<TData, TWorkResults>>;
}

/**
 * A work definition for sealing a workflow.
 * Same as IWorkDefinition - reuses the interface for consistency.
 */
export type SealingWorkDefinition<
  TName extends string,
  TData = Record<string, unknown>,
  TWorkResults extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown,
> = IWorkDefinition<TName, TData, TResult, TWorkResults>;

/**
 * A sealed workflow that can only be executed, not modified.
 * Use workflow.seal() to create a sealed workflow.
 * Picks `works`, `options`, `isSealed`, and `run` from IWorkflow, adds `name: 'seal'`.
 */
export type SealedWorkflow<
  TData = Record<string, unknown>,
  TWorkResults extends Record<string, unknown> = Record<string, unknown>,
> = Pick<IWorkflow<TData, TWorkResults>, 'works' | 'options' | 'isSealed' | 'run'> & {
  readonly name: 'seal';
};

/**
 * Options for configuring workflow behavior
 */
export type WorkflowOptions = {
  /**
   * Whether to stop execution immediately when a work fails.
   * - true: Stop on first failure (default)
   * - false: Continue executing remaining works, fail at the end if any work failed
   * @default true
   */
  failFast?: boolean;
};

/**
 * Helper type to extract the result type from a parallel input (work or group)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExtractParallelInputResult<T extends ParallelInput<string, any, any, any>> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends IWorkDefinition<string, any, infer R, any>
    ? R
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      T extends IGroupWorkDefinition<string, any, any>
      ? T['serial'] extends readonly unknown[]
        ? // Serial group result is the last work's result type (simplified to unknown for now)
          unknown
        : T['parallel'] extends readonly unknown[]
          ? // Parallel group result is object mapping names to results (simplified to unknown for now)
            unknown
          : never
      : never;

// ============================================================================
// Type inference for nested groups - supports up to 5 levels of nesting
// ============================================================================

/**
 * Extract inner works array from a group (serial or parallel)
 */

type GetInnerWorks<T> =
  T extends IGroupWorkDefinition<string, any, any>
    ? T['serial'] extends readonly (infer U)[]
      ? U
      : T['parallel'] extends readonly (infer U2)[]
        ? U2
        : never
    : never;

/**
 * Extract name from any input (work or group)
 */
type GetName<T> = T extends { name: infer N extends string } ? N : never;

/**
 * Extract result type from a work definition
 */

type GetWorkResult<T, K extends string> =
  T extends IWorkDefinition<K, any, infer R, any> ? R : never;

// --- Level 0: Direct inputs ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NamesL0<T extends ParallelInput<string, any, any, any>> = GetName<T>;

// --- Level 1: Inside first level of groups ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NamesL1<T extends ParallelInput<string, any, any, any>> = GetName<GetInnerWorks<T>>;

// --- Level 2: Inside second level of groups ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NamesL2<T extends ParallelInput<string, any, any, any>> = GetName<
  GetInnerWorks<GetInnerWorks<T>>
>;

// --- Level 3: Inside third level of groups ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NamesL3<T extends ParallelInput<string, any, any, any>> = GetName<
  GetInnerWorks<GetInnerWorks<GetInnerWorks<T>>>
>;

// --- Level 4: Inside fourth level of groups ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NamesL4<T extends ParallelInput<string, any, any, any>> = GetName<
  GetInnerWorks<GetInnerWorks<GetInnerWorks<GetInnerWorks<T>>>>
>;

/**
 * Extract all names from a parallel input (up to 5 levels deep)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtractAllNames<T extends ParallelInput<string, any, any, any>> =
  | NamesL0<T>
  | NamesL1<T>
  | NamesL2<T>
  | NamesL3<T>
  | NamesL4<T>;

// --- Result type lookups at each level ---

// Level 0: Direct input
type ResultL0<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends ParallelInput<string, any, any, any>,
  K extends string,
> = GetWorkResult<T, K>;

// Level 1: Inside groups
type ResultL1<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends ParallelInput<string, any, any, any>,
  K extends string,
> = GetWorkResult<GetInnerWorks<T>, K>;

// Level 2: Inside nested groups
type ResultL2<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends ParallelInput<string, any, any, any>,
  K extends string,
> = GetWorkResult<GetInnerWorks<GetInnerWorks<T>>, K>;

// Level 3: Inside deeply nested groups
type ResultL3<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends ParallelInput<string, any, any, any>,
  K extends string,
> = GetWorkResult<GetInnerWorks<GetInnerWorks<GetInnerWorks<T>>>, K>;

// Level 4: Inside very deeply nested groups
type ResultL4<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends ParallelInput<string, any, any, any>,
  K extends string,
> = GetWorkResult<GetInnerWorks<GetInnerWorks<GetInnerWorks<GetInnerWorks<T>>>>, K>;

/**
 * Find result type for a name across all levels (up to 5 levels deep)
 * Returns the first non-never match, or unknown for groups
 */
type FindResultType<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends ParallelInput<string, any, any, any>,
  K extends string,
> =
  ResultL0<T, K> extends never
    ? ResultL1<T, K> extends never
      ? ResultL2<T, K> extends never
        ? ResultL3<T, K> extends never
          ? ResultL4<T, K> extends never
            ? unknown // Must be a group name
            : ResultL4<T, K>
          : ResultL3<T, K>
        : ResultL2<T, K>
      : ResultL1<T, K>
    : ResultL0<T, K>;

/**
 * Helper type to extract work results from parallel works array.
 * Supports up to 5 levels of nesting:
 * - Level 0: Direct works in .parallel([...])
 * - Level 1: Works inside groups
 * - Level 2: Works inside groups inside groups
 * - Level 3: Works inside groups inside groups inside groups
 * - Level 4: Works inside groups inside groups inside groups inside groups
 *
 * All work names and their result types are fully inferred.
 * Group names are inferred with unknown result type.
 */
export type ParallelWorksToRecord<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends readonly ParallelInput<string, any, any, any>[],
> = {
  [K in ExtractAllNames<T[number]>]: FindResultType<T[number], K>;
};
