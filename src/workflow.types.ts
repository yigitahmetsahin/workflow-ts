/**
 * Work Status
 */
export enum WorkStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/**
 * Workflow Status
 */
export enum WorkflowStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
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
 * Type-safe map for work results with automatic type inference
 */
export interface IWorkResultsMap<
  TWorkResults extends Record<string, unknown> = Record<string, unknown>,
> {
  get<K extends keyof TWorkResults>(name: K): TWorkResults[K] | undefined;
  set<K extends keyof TWorkResults>(name: K, value: TWorkResults[K]): void;
  has(name: keyof TWorkResults): boolean;
}

/**
 * Result of a single work execution
 */
export interface IWorkResult<TResult = unknown> {
  status: WorkStatus;
  result?: TResult;
  error?: Error;
  duration: number;
}

/**
 * Definition of a work with inferred name and result type
 */
export interface IWorkDefinition<
  TName extends string,
  TData = Record<string, unknown>,
  TResult = unknown,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Unique name for the work */
  name: TName;
  /** Execute function - receives context and returns result */
  execute: (context: IWorkflowContext<TData, TAvailableWorkResults>) => Promise<TResult>;
  /** Optional: condition to determine if work should run */
  shouldRun?: (
    context: IWorkflowContext<TData, TAvailableWorkResults>
  ) => boolean | Promise<boolean>;
  /** Optional: called when work fails */
  onError?: (
    error: Error,
    context: IWorkflowContext<TData, TAvailableWorkResults>
  ) => void | Promise<void>;
}

/**
 * Internal work representation
 */
export interface IWorkflowWork {
  type: 'serial' | 'parallel';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  works: IWorkDefinition<string, any, any, any>[];
}

/**
 * Result of workflow execution
 */
export interface IWorkflowResult<
  TData = Record<string, unknown>,
  TWorkResults extends Record<string, unknown> = Record<string, unknown>,
> {
  status: WorkflowStatus;
  context: IWorkflowContext<TData, TWorkResults>;
  workResults: Map<keyof TWorkResults, IWorkResult>;
  totalDuration: number;
  error?: Error;
}
