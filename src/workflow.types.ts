/**
 * Work Status
 */
export type WorkStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Workflow Status
 */
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';

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
  /** Get a work result with compile-time type checking */
  get<K extends keyof TWorkResults>(name: K): WorkResult<TWorkResults[K]>;
  set<K extends keyof TWorkResults>(name: K, value: WorkResult<TWorkResults[K]>): void;
  /** Check if a work result exists */
  has(name: string): boolean;
}

/**
 * Result of a single work execution
 */
export type WorkResult<TResult = unknown> = {
  status: WorkStatus;
  result?: TResult;
  error?: Error;
  duration: number;
};

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
  /** Optional: if true, errors won't stop the workflow (result will be undefined) */
  silenceError?: boolean;
}

/**
 * Internal work representation
 */
export type WorkflowWork = {
  type: 'serial' | 'parallel';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  works: IWorkDefinition<string, any, any, any>[];
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
  seal(): ISealedWorkflow<TData, TWorkResults>;
  seal<TResult>(
    sealingWork: ISealingWorkDefinition<TData, TWorkResults, TResult>
  ): ISealedWorkflow<TData, TWorkResults>;

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
 * Similar to IWorkDefinition but without 'name'.
 */
export type ISealingWorkDefinition<
  TData = Record<string, unknown>,
  TWorkResults extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown,
> = Omit<IWorkDefinition<'seal', TData, TResult, TWorkResults>, 'name'>;

/**
 * A sealed workflow that can only be executed, not modified.
 * Use workflow.seal() to create a sealed workflow.
 * Picks `works`, `options`, `isSealed`, and `run` from IWorkflow, adds `name: 'seal'`.
 */
export type ISealedWorkflow<
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
 * Helper type to extract work results from parallel works array.
 * Since Work implements IWorkDefinition, we can use Extract directly.
 */
export type ParallelWorksToRecord<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends readonly IWorkDefinition<string, any, any, any>[],
> = {
  [K in T[number]['name']]: Extract<
    T[number],
    { name: K }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  > extends IWorkDefinition<string, any, infer R, any>
    ? R
    : never;
};
