import {
  IWorkDefinition,
  ITreeWorkDefinition,
  IRunnableTreeWork,
  TreeWorkOptions,
  TreeWorkFactoryOptions,
  TreeWorkStep,
  WorkInput,
  WorkflowContext,
  WorkResult,
  WorkStatus,
  TreeResult,
  TreeRunOptions,
  SealedTreeWork,
  RetryConfig,
  RetryOptions,
} from './work.types';
import { WorkResultsMap } from './work-results-map';
import { isTreeWorkDefinition } from './type-guards';

/**
 * Helper type that only creates a record if the key is a literal string.
 * If K is the wide 'string' type, returns empty object to avoid index signatures.
 * This prevents { [x: string]: unknown } from polluting accumulated types.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type MaybeRecord<K extends string, V> = string extends K ? {} : { [P in K]: V };

/**
 * Normalized retry options with all defaults filled in
 */
type NormalizedRetryOptions = {
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
 * Normalize retry config to full options with defaults
 */
function normalizeRetryConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  retry: RetryConfig<any, any> | undefined
): NormalizedRetryOptions | null {
  if (retry === undefined) {
    return null;
  }

  if (typeof retry === 'number') {
    return {
      maxRetries: retry,
      delay: 0,
      backoff: 'fixed',
      backoffMultiplier: 2,
      maxDelay: Infinity,
    };
  }

  return {
    maxRetries: retry.maxRetries,
    delay: retry.delay ?? 0,
    backoff: retry.backoff ?? 'fixed',
    backoffMultiplier: retry.backoffMultiplier ?? 2,
    maxDelay: retry.maxDelay ?? Infinity,
    shouldRetry: retry.shouldRetry,
    onRetry: retry.onRetry,
  };
}

/**
 * Calculate delay for a given retry attempt
 * @param options Normalized retry options
 * @param attempt Current attempt number (1-indexed, so attempt 1 is after first failure)
 */
function calculateRetryDelay(options: NormalizedRetryOptions, attempt: number): number {
  if (options.delay === 0) {
    return 0;
  }

  let delay: number;
  if (options.backoff === 'exponential') {
    // For exponential: delay * multiplier^(attempt-1)
    // attempt 1: delay * 1, attempt 2: delay * multiplier, attempt 3: delay * multiplier^2
    delay = options.delay * Math.pow(options.backoffMultiplier, attempt - 1);
  } else {
    delay = options.delay;
  }

  return Math.min(delay, options.maxDelay);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A standalone leaf Work unit that can be added to workflows.
 * Implements IWorkDefinition so it can be used anywhere a work definition is expected.
 *
 * For tree structures (nested serial/parallel), use `Work.tree()`.
 *
 * @example
 * ```typescript
 * // Leaf work with execute
 * const fetchUser = new Work({
 *   name: 'fetchUser',
 *   execute: async (ctx) => {
 *     return { id: ctx.data.userId, name: 'John' };
 *   },
 * });
 *
 * // Tree work (no execute, has addSerial/addParallel)
 * const dataCollection = Work.tree<UserData>({ name: 'dataCollection' })
 *   .addSerial({ name: 'step1', execute: async () => 'a' })
 *   .addSerial({ name: 'step2', execute: async () => 'b' })
 *   .addParallel([
 *     { name: 'parallel1', execute: async () => 1 },
 *     { name: 'parallel2', execute: async () => 2 },
 *   ]);
 *
 * // Use in workflow
 * const workflow = new Workflow<UserData>()
 *   .serial(fetchUser)
 *   .serial(dataCollection);
 * ```
 */
export class Work<
  TName extends string,
  TData = Record<string, unknown>,
  TResult = unknown,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> implements IWorkDefinition<TName, TData, TResult, TAvailableWorkResults> {
  /** Unique name for the work */
  readonly name: TName;

  /** Execute function - receives context and returns result */
  readonly execute: (context: WorkflowContext<TData, TAvailableWorkResults>) => Promise<TResult>;

  /** Optional: condition to determine if work should run */
  readonly shouldRun?: (
    context: WorkflowContext<TData, TAvailableWorkResults>
  ) => boolean | Promise<boolean>;

  /** Optional: called when work fails */
  readonly onError?: (
    error: Error,
    context: WorkflowContext<TData, TAvailableWorkResults>
  ) => void | Promise<void>;

  /** Optional: called when work is skipped (shouldRun returns false) */
  readonly onSkipped?: (
    context: WorkflowContext<TData, TAvailableWorkResults>
  ) => void | Promise<void>;

  /** Optional: if true, errors won't stop the workflow (result will be undefined) */
  readonly silenceError?: boolean;

  /** Optional: retry configuration - number of retries or full options */
  readonly retry?: RetryConfig<TData, TAvailableWorkResults>;

  constructor(definition: IWorkDefinition<TName, TData, TResult, TAvailableWorkResults>) {
    this.name = definition.name;
    this.execute = definition.execute;
    this.shouldRun = definition.shouldRun;
    this.onError = definition.onError;
    this.onSkipped = definition.onSkipped;
    this.silenceError = definition.silenceError;
    this.retry = definition.retry;
  }

  /**
   * Create a tree work that can contain nested serial/parallel works.
   * Tree works don't have an execute function - they execute their children.
   *
   * @example
   * ```typescript
   * // Simple tree
   * const tree = Work.tree('dataCollection')
   *   .addSerial({ name: 'fetchProfile', execute: async () => profile })
   *   .addParallel([
   *     { name: 'fetchOrders', execute: async () => orders },
   *     { name: 'fetchHistory', execute: async () => history },
   *   ]);
   *
   * // With typed data
   * interface UserData { userId: string }
   * const typedTree = Work.tree<UserData>('myTree')
   *   .addSerial({
   *     name: 'step1',
   *     execute: async (ctx) => ctx.data.userId, // ✅ typed
   *   });
   *
   * // With options
   * const treeWithOptions = Work.tree('myTree', { failFast: false });
   * ```
   */
  static tree<TData = Record<string, unknown>>(
    name: string,
    options?: TreeWorkFactoryOptions<TData>
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  ): TreeWork<string, TData, {}, {}> {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    return new TreeWork<string, TData, {}, {}>({ name, ...options });
  }
}

/**
 * A tree work that contains nested serial/parallel steps.
 * Created using `Work.tree('treeName')`.
 *
 * Tree works execute their children in the order they were added:
 * - `addSerial(work)` adds a single work to execute in sequence
 * - `addParallel([works])` adds works to execute concurrently
 *
 * @example
 * ```typescript
 * const tree = Work.tree('dataCollection')
 *   .addSerial({ name: 'fetchProfile', execute: async () => profile })
 *   .addSerial({ name: 'validate', execute: async (ctx) => {
 *     // ✅ Autocomplete for 'fetchProfile'!
 *     const profile = ctx.workResults.get('fetchProfile').result;
 *     return validated;
 *   }})
 *   .addParallel([
 *     { name: 'fetchOrders', execute: async () => orders },
 *     { name: 'fetchHistory', execute: async () => history },
 *   ]);
 *
 * // Execution order:
 * // 1. fetchProfile (serial)
 * // 2. validate (serial)
 * // 3. fetchOrders + fetchHistory (parallel)
 * ```
 */
export class TreeWork<
  TName extends string,
  TData = Record<string, unknown>,
  TBase extends Record<string, unknown> = Record<string, unknown>,
  TAccumulated extends Record<string, unknown> = NonNullable<unknown>,
>
  implements
    ITreeWorkDefinition<TName, TData, TBase & TAccumulated>,
    IRunnableTreeWork<TData, TBase & TAccumulated & MaybeRecord<TName, unknown>>
{
  /** Unique name for the tree work */
  readonly name: TName;

  /** Internal marker to identify tree works */
  readonly _isTree = true as const;

  /** Steps to execute (in order) - mutable during building */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _steps: TreeWorkStep<TData, any>[] = [];

  /** Runtime options */
  private _options: Required<TreeRunOptions>;

  /** Whether the tree is sealed */
  private _sealed = false;

  /** Optional: condition to determine if tree work should run */
  readonly shouldRun?: (context: WorkflowContext<TData, TBase>) => boolean | Promise<boolean>;

  /** Optional: called when tree work fails */
  readonly onError?: (error: Error, context: WorkflowContext<TData, TBase>) => void | Promise<void>;

  /** Optional: called when tree work is skipped (shouldRun returns false) */
  readonly onSkipped?: (context: WorkflowContext<TData, TBase>) => void | Promise<void>;

  /** Optional: if true, errors won't stop the workflow */
  readonly silenceError?: boolean;

  constructor(options: TreeWorkOptions<TName, TData, TBase>) {
    this.name = options.name;
    this.shouldRun = options.shouldRun;
    this.onError = options.onError;
    this.onSkipped = options.onSkipped;
    this.silenceError = options.silenceError;
    this._options = {
      failFast: options.failFast ?? true,
    };
  }

  /**
   * Get the steps (readonly)
   */
  get steps(): readonly TreeWorkStep<TData, TBase & TAccumulated>[] {
    return this._steps;
  }

  /**
   * Get the tree options (readonly)
   */
  get options(): Readonly<Required<TreeRunOptions>> {
    return this._options;
  }

  /**
   * Check if the tree is sealed (cannot be modified)
   */
  isSealed(): boolean {
    return this._sealed;
  }

  /**
   * Add a work to execute serially (in sequence with previous steps).
   * The work can be either a leaf work definition or another tree work.
   * Previous sibling results are available via ctx.workResults.get().
   * If adding a tree work, its inner works are also available for autocomplete.
   *
   * @param work - The work or tree work to add
   * @returns this for chaining with updated type inference
   *
   * @example
   * ```typescript
   * tree
   *   .addSerial({ name: 'step1', execute: async () => 'a' })
   *   .addSerial({ name: 'step2', execute: async (ctx) => {
   *     // ✅ 'step1' autocompletes!
   *     const prev = ctx.workResults.get('step1').result;
   *     return 'b';
   *   }});
   *
   * // Nested trees: inner works are also accessible
   * const inner = Work.tree('inner')
   *   .addSerial({ name: 'innerStep', execute: async () => 'x' });
   * tree.addSerial(inner).addSerial({
   *   name: 'after',
   *   execute: async (ctx) => {
   *     ctx.workResults.get('innerStep'); // ✅ Autocompletes!
   *   }
   * });
   * ```
   */
  // Overload for leaf work definitions
  addSerial<const TWorkName extends string, TWorkResult>(
    work: IWorkDefinition<TWorkName, TData, TWorkResult, TBase & TAccumulated>
  ): TreeWork<TName, TData, TBase, TAccumulated & { [K in TWorkName]: TWorkResult }>;
  // Overload for nested tree works
  // Uses MaybeRecord to avoid index signatures when tree names are generic 'string'
  addSerial<
    const TTreeName extends string,
    TTreeBase extends Record<string, unknown>,
    TTreeAccumulated extends Record<string, unknown>,
  >(
    work: TreeWork<TTreeName, TData, TTreeBase, TTreeAccumulated>
  ): TreeWork<
    TName,
    TData,
    TBase,
    TAccumulated & MaybeRecord<TTreeName, unknown> & TTreeAccumulated
  >;
  // Implementation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addSerial(work: any): any {
    if (this._sealed) {
      throw new Error(`Cannot add work to sealed tree "${this.name}"`);
    }
    this._steps.push({
      type: 'serial',
      work,
    });
    return this;
  }

  /**
   * Add works to execute in parallel (concurrently).
   * All works in the array run at the same time.
   * Supports mixing leaf works and nested tree works.
   *
   * @param works - Array of works or tree works to run in parallel
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * tree.addParallel([
   *   { name: 'fetchA', execute: async () => 'a' },
   *   { name: 'fetchB', execute: async () => 'b' },
   * ]);
   * // Executes: fetchA + fetchB concurrently
   *
   * // With nested trees:
   * const innerTree = Work.tree('inner')
   *   .addSerial({ name: 'innerStep', execute: async () => 'x' });
   * tree.addParallel([innerTree, { name: 'other', execute: async () => 'y' }]);
   * ```
   */
  addParallel<const TParallelWorks extends readonly ParallelWorkInput<TData>[]>(
    works: TParallelWorks
  ): TreeWork<TName, TData, TBase, TAccumulated & WorksToRecord<TParallelWorks>> {
    if (this._sealed) {
      throw new Error(`Cannot add work to sealed tree "${this.name}"`);
    }
    this._steps.push({
      type: 'parallel',
      works,
    });
    return this as unknown as TreeWork<
      TName,
      TData,
      TBase,
      TAccumulated & WorksToRecord<TParallelWorks>
    >;
  }

  /**
   * Seal the tree to prevent further modifications.
   * Optionally accepts a final work to execute after all previous works.
   *
   * @param finalWork - Optional final work to add before sealing
   * @returns A sealed tree that can only be run, not modified
   * @throws Error if the tree is already sealed
   *
   * @example
   * ```typescript
   * // Simple seal
   * const sealed = tree.seal();
   * // sealed.addSerial(...) // TypeScript error - method doesn't exist
   * await sealed.run(data);
   *
   * // Seal with final work
   * const sealedWithFinal = tree.seal({
   *   name: 'finalize',
   *   execute: async (ctx) => {
   *     const prev = ctx.workResults.get('step1').result;
   *     return `Final: ${prev}`;
   *   },
   * });
   * ```
   */
  seal(): SealedTreeWork<TData, TBase & TAccumulated & MaybeRecord<TName, unknown>>;
  seal<TFinalName extends string, TFinalResult>(
    finalWork: IWorkDefinition<TFinalName, TData, TFinalResult, TBase & TAccumulated>
  ): SealedTreeWork<
    TData,
    TBase & TAccumulated & { [K in TFinalName]: TFinalResult } & MaybeRecord<TName, unknown>
  >;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seal(finalWork?: any): any {
    if (this._sealed) {
      throw new Error(`Tree "${this.name}" is already sealed`);
    }

    if (finalWork) {
      this._steps.push({
        type: 'serial',
        work: finalWork,
      });
    }

    this._sealed = true;
    // Cast to SealedTreeWork with the unique symbol brand
    return this as unknown as SealedTreeWork<
      TData,
      TBase & TAccumulated & MaybeRecord<TName, unknown>
    >;
  }

  /**
   * Execute the tree work with the given data.
   *
   * @param data - The initial data to pass to the tree
   * @returns The result of the tree execution
   *
   * @example
   * ```typescript
   * const tree = Work.tree('dataCollection')
   *   .addSerial({ name: 'step1', execute: async () => 'a' })
   *   .addSerial({ name: 'step2', execute: async (ctx) => {
   *     const prev = ctx.workResults.get('step1').result;
   *     return 'b';
   *   }});
   *
   * const result = await tree.run({ userId: '123' });
   * console.log(result.status); // 'completed'
   * console.log(result.workResults.get('step1')?.result); // 'a'
   * ```
   */
  async run(
    data: TData
  ): Promise<TreeResult<TData, TBase & TAccumulated & MaybeRecord<TName, unknown>>> {
    const startTime = Date.now();
    const workResults = new Map<string, WorkResult>();
    const workResultsMap = new WorkResultsMap<TBase & TAccumulated & MaybeRecord<TName, unknown>>(
      workResults
    );

    const context: WorkflowContext<TData, TBase & TAccumulated & MaybeRecord<TName, unknown>> = {
      data,
      workResults: workResultsMap,
    };

    try {
      // Execute this tree
      const result = await this._executeTree(this, context, workResults, startTime);

      if (result.error) {
        return {
          status: WorkStatus.Failed,
          context,
          workResults: workResults as Map<
            keyof (TBase & TAccumulated & MaybeRecord<TName, unknown>),
            WorkResult
          >,
          totalDuration: Date.now() - startTime,
          error: result.error,
        };
      }

      return {
        status: WorkStatus.Completed,
        context,
        workResults: workResults as Map<
          keyof (TBase & TAccumulated & MaybeRecord<TName, unknown>),
          WorkResult
        >,
        totalDuration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: WorkStatus.Failed,
        context,
        workResults: workResults as Map<
          keyof (TBase & TAccumulated & MaybeRecord<TName, unknown>),
          WorkResult
        >,
        totalDuration: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Execute a tree work (internal implementation)
   */

  private async _executeTree(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tree: ITreeWorkDefinition<string, TData, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: WorkflowContext<TData, any>,
    workResults: Map<string, WorkResult>,
    treeStartTime: number,
    parentName?: string
  ): Promise<{
    name: string;
    result?: unknown;
    error?: Error;
    skipped?: boolean;
    handled?: boolean;
  }> {
    // Check if tree should run
    if (tree.shouldRun) {
      const shouldRun = await tree.shouldRun(context);
      if (!shouldRun) {
        const skippedResult: WorkResult = {
          status: WorkStatus.Skipped,
          duration: Date.now() - treeStartTime,
          parent: parentName,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.workResults.set(tree.name as any, skippedResult as any);
        workResults.set(tree.name, skippedResult);
        // Call onSkipped handler if provided
        if (tree.onSkipped) {
          await tree.onSkipped(context);
        }
        return { name: tree.name, skipped: true };
      }
    }

    try {
      let lastResult: unknown;

      // Execute steps in order
      for (const step of tree.steps) {
        if (step.type === 'serial') {
          lastResult = await this._executeNestedWork(step.work, context, workResults, tree.name);
        } else {
          lastResult = await this._executeParallelNestedWorks(
            step.works,
            context,
            workResults,
            tree.name
          );
        }
      }

      // Store tree result
      const completedResult: WorkResult = {
        status: WorkStatus.Completed,
        result: lastResult,
        duration: Date.now() - treeStartTime,
        parent: parentName,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.workResults.set(tree.name as any, completedResult as any);
      workResults.set(tree.name, completedResult);

      return { name: tree.name, result: lastResult };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - treeStartTime;

      const failedResult: WorkResult = {
        status: WorkStatus.Failed,
        error: err,
        duration,
        parent: parentName,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.workResults.set(tree.name as any, failedResult as any);
      workResults.set(tree.name, failedResult);

      if (tree.silenceError) {
        return { name: tree.name, handled: true };
      }

      if (tree.onError) {
        try {
          await tree.onError(err, context);
          return { name: tree.name, handled: true };
        } catch {
          return { name: tree.name, error: err };
        }
      }

      return { name: tree.name, error: err };
    }
  }

  /**
   * Execute a nested work (leaf or tree)
   */
  private async _executeNestedWork(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    work: WorkInput<string, TData, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: WorkflowContext<TData, any>,
    workResults: Map<string, WorkResult>,
    parentName: string
  ): Promise<unknown> {
    const workStartTime = Date.now();

    if (isTreeWorkDefinition(work)) {
      const result = await this._executeTree(work, context, workResults, workStartTime, parentName);
      if (result.error) {
        throw result.error;
      }
      return result.result;
    }

    // Regular leaf work - _executeLeafWork throws if error should propagate
    // If it returns normally, the work completed or error was handled (via onError or silenceError)
    await this._executeLeafWork(
      work as IWorkDefinition<string, TData, unknown, Record<string, unknown>>,
      context,
      workResults,
      parentName
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workResult = context.workResults.get(work.name as any);
    return workResult.result;
  }

  /**
   * Execute multiple nested works in parallel with retry support
   */
  private async _executeParallelNestedWorks(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    works: readonly WorkInput<string, TData, any, any>[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: WorkflowContext<TData, any>,
    workResults: Map<string, WorkResult>,
    parentName: string
  ): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};
    const errors: Error[] = [];

    const promises = works.map(async (work) => {
      const workStartTime = Date.now();

      if (isTreeWorkDefinition(work)) {
        const result = await this._executeTree(
          work,
          context,
          workResults,
          workStartTime,
          parentName
        );
        return result;
      }

      // Regular leaf work
      const workDef = work as IWorkDefinition<string, TData, unknown, Record<string, unknown>>;

      if (workDef.shouldRun) {
        const shouldRun = await workDef.shouldRun(context);
        if (!shouldRun) {
          const skippedResult: WorkResult = {
            status: WorkStatus.Skipped,
            duration: Date.now() - workStartTime,
            parent: parentName,
            attempts: 1,
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context.workResults.set(workDef.name as any, skippedResult as any);
          workResults.set(workDef.name, skippedResult);
          // Call onSkipped handler if provided
          if (workDef.onSkipped) {
            await workDef.onSkipped(context);
          }
          return { name: workDef.name, skipped: true };
        }
      }

      // Retry logic for parallel works
      const retryOptions = normalizeRetryConfig(workDef.retry);
      const maxAttempts = retryOptions ? retryOptions.maxRetries + 1 : 1;
      let lastError: Error | null = null;
      let attempt = 0;

      while (attempt < maxAttempts) {
        attempt++;

        try {
          const result = await workDef.execute(context);
          const completedResult: WorkResult = {
            status: WorkStatus.Completed,
            result,
            duration: Date.now() - workStartTime,
            parent: parentName,
            attempts: attempt,
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context.workResults.set(workDef.name as any, completedResult as any);
          workResults.set(workDef.name, completedResult);
          return { name: workDef.name, result };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Check if we should retry
          const isLastAttempt = attempt >= maxAttempts;
          if (!isLastAttempt && retryOptions) {
            // Check shouldRetry callback if provided
            if (retryOptions.shouldRetry) {
              const shouldRetry = await retryOptions.shouldRetry(lastError, attempt, context);
              if (!shouldRetry) {
                break; // Stop retrying
              }
            }

            // Call onRetry hook before the retry
            if (retryOptions.onRetry) {
              await retryOptions.onRetry(lastError, attempt, context);
            }

            // Calculate and wait for delay
            const delay = calculateRetryDelay(retryOptions, attempt);
            if (delay > 0) {
              await sleep(delay);
            }
          }
        }
      }

      // All attempts failed
      const err = lastError!;
      const duration = Date.now() - workStartTime;

      const failedResult: WorkResult = {
        status: WorkStatus.Failed,
        error: err,
        duration,
        parent: parentName,
        attempts: attempt,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.workResults.set(workDef.name as any, failedResult as any);
      workResults.set(workDef.name, failedResult);

      if (workDef.silenceError) {
        return { name: workDef.name, handled: true };
      }

      if (workDef.onError) {
        try {
          await workDef.onError(err, context);
          return { name: workDef.name, handled: true };
        } catch {
          return { name: workDef.name, error: err };
        }
      }

      return { name: workDef.name, error: err };
    });

    const parallelResults = await Promise.all(promises);

    for (const result of parallelResults) {
      if (('skipped' in result && result.skipped) || ('handled' in result && result.handled)) {
        continue;
      }
      if ('error' in result && result.error) {
        errors.push(result.error);
      } else if ('result' in result) {
        results[result.name] = result.result;
      }
    }

    // Only throw if failFast is enabled
    if (errors.length > 0 && this._options.failFast) {
      throw errors[0];
    }

    return results;
  }

  /**
   * Execute a single leaf work with parent tracking and retry support
   */
  private async _executeLeafWork(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    work: IWorkDefinition<string, TData, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: WorkflowContext<TData, any>,
    workResults: Map<string, WorkResult>,
    parentName: string
  ): Promise<void> {
    const workStartTime = Date.now();

    if (work.shouldRun) {
      const shouldRun = await work.shouldRun(context);
      if (!shouldRun) {
        const skippedResult: WorkResult = {
          status: WorkStatus.Skipped,
          duration: Date.now() - workStartTime,
          parent: parentName,
          attempts: 1,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.workResults.set(work.name as any, skippedResult as any);
        workResults.set(work.name, skippedResult);
        // Call onSkipped handler if provided
        if (work.onSkipped) {
          await work.onSkipped(context);
        }
        return;
      }
    }

    const retryOptions = normalizeRetryConfig(work.retry);
    const maxAttempts = retryOptions ? retryOptions.maxRetries + 1 : 1;
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        const result = await work.execute(context);
        const completedResult: WorkResult = {
          status: WorkStatus.Completed,
          result,
          duration: Date.now() - workStartTime,
          parent: parentName,
          attempts: attempt,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.workResults.set(work.name as any, completedResult as any);
        workResults.set(work.name, completedResult);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        const isLastAttempt = attempt >= maxAttempts;
        if (!isLastAttempt && retryOptions) {
          // Check shouldRetry callback if provided
          if (retryOptions.shouldRetry) {
            const shouldRetry = await retryOptions.shouldRetry(lastError, attempt, context);
            if (!shouldRetry) {
              break; // Stop retrying
            }
          }

          // Call onRetry hook before the retry
          if (retryOptions.onRetry) {
            await retryOptions.onRetry(lastError, attempt, context);
          }

          // Calculate and wait for delay
          const delay = calculateRetryDelay(retryOptions, attempt);
          if (delay > 0) {
            await sleep(delay);
          }
        }
      }
    }

    // All attempts failed
    const err = lastError!;
    const failedResult: WorkResult = {
      status: WorkStatus.Failed,
      error: err,
      duration: Date.now() - workStartTime,
      parent: parentName,
      attempts: attempt,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context.workResults.set(work.name as any, failedResult as any);
    workResults.set(work.name, failedResult);

    if (work.silenceError) {
      return;
    }

    if (work.onError) {
      await work.onError(err, context);
      return;
    }

    throw err;
  }
}

/**
 * Input type for parallel works - accepts works with any available results
 * This is more permissive than WorkInput to allow nested trees with their own accumulated types
 */

type ParallelWorkInput<TData> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | IWorkDefinition<string, TData, unknown, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | TreeWork<string, TData, any, any>;

/**
 * Helper type to extract the result type from a work (name -> result mapping)
 * Uses MaybeRecord to avoid index signatures when tree names are generic 'string'
 */

type ExtractWorkResult<TWork> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TWork extends IWorkDefinition<infer N, any, infer R, any>
    ? { [K in N]: R }
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      TWork extends TreeWork<infer N, any, any, any>
      ? MaybeRecord<N, unknown>
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        TWork extends ITreeWorkDefinition<infer N, any, any>
        ? MaybeRecord<N, unknown>
        : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
          {};

/**
 * Helper type to extract accumulated inner works from a TreeWork
 * This allows nested tree's inner works to be accessible in outer tree
 */

type ExtractTreeAccumulated<TWork> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TWork extends TreeWork<any, any, any, infer A>
    ? A
    : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      {};

/**
 * Helper type to convert an array of works to a record of their results
 * Also extracts inner works from nested TreeWorks
 */
type WorksToRecord<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TParallelWorks extends readonly WorkInput<string, any, any, any>[],
> = UnionToIntersection<
  {
    [K in keyof TParallelWorks]: ExtractWorkResult<TParallelWorks[K]> &
      ExtractTreeAccumulated<TParallelWorks[K]>;
  }[number]
>;

/**
 * Helper type to convert union to intersection
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

/**
 * Helper to get the work definition from a WorkInput.
 * Works for both Work instances and inline definitions.
 */
export function getWorkDefinition<
  TName extends string,
  TData,
  TResult,
  TAvailableWorkResults extends Record<string, unknown>,
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any
):
  | IWorkDefinition<TName, TData, TResult, TAvailableWorkResults>
  | ITreeWorkDefinition<TName, TData, TAvailableWorkResults> {
  return input;
}
