import {
  IWorkDefinition,
  ITreeWorkDefinition,
  IRunnableTreeWork,
  TreeWorkOptions,
  TreeWorkStep,
  WorkInput,
  WorkflowContext,
  WorkResult,
  WorkStatus,
  TreeResult,
  TreeRunOptions,
  SealedTreeWork,
  TimeoutConfig,
  MaybeRecord,
  ParallelWorkInput,
  WorkOutcome,
} from './work.types';
import type { WorksToRecord } from './tree-work.types';
import { WorkResultsMap } from './work-results-map';
import { isTreeWorkDefinition } from './utils';
import {
  normalizeRetryConfig,
  calculateRetryDelay,
  normalizeTimeoutConfig,
  executeWithTimeout,
  sleep,
} from './helpers';

/**
 * A tree work that contains nested serial/parallel steps.
 * Built using `Work.tree('treeName')`.
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

  /** Optional: called before tree work execution starts (after shouldRun passes) */
  readonly onBefore?: (context: WorkflowContext<TData, TBase>) => void | Promise<void>;

  /**
   * Optional: called after tree work execution completes (success or failure)
   * Note: This uses TBase types only. For full type inference, use the .onAfter() method.
   */
  readonly onAfter?: (
    context: WorkflowContext<TData, TBase>,
    outcome: WorkOutcome<TBase>
  ) => void | Promise<void>;

  /**
   * Internal: stores the onAfter callback set via the .onAfter() method
   * This version has access to the full accumulated types.
   */
  private _onAfterMethod?: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: WorkflowContext<TData, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outcome: WorkOutcome<any>
  ) => void | Promise<void>;

  /** Optional: called when tree work fails */
  readonly onError?: (error: Error, context: WorkflowContext<TData, TBase>) => void | Promise<void>;

  /** Optional: called when tree work is skipped (shouldRun returns false) */
  readonly onSkipped?: (context: WorkflowContext<TData, TBase>) => void | Promise<void>;

  /** Optional: if true, errors won't stop the workflow */
  readonly silenceError?: boolean;

  /** Optional: timeout configuration - milliseconds or full options */
  readonly timeout?: TimeoutConfig<TData, TBase>;

  constructor(options: TreeWorkOptions<TName, TData, TBase>) {
    this.name = options.name;
    this.shouldRun = options.shouldRun;
    this.onBefore = options.onBefore;
    this.onAfter = options.onAfter;
    this.onError = options.onError;
    this.onSkipped = options.onSkipped;
    this.silenceError = options.silenceError;
    this.timeout = options.timeout;
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
   * Set the onAfter hook with full type inference for accumulated work results.
   * This method version provides better type inference than the constructor option.
   *
   * @param callback - Called after tree execution completes (success or failure)
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * const tree = Work.tree('myTree')
   *   .addSerial({ name: 'step1', execute: async () => 'hello' })
   *   .addSerial({ name: 'step2', execute: async () => 42 })
   *   .onAfter(async (ctx, outcome) => {
   *     // ✅ Full type inference!
   *     const step1 = outcome.workResults.get('step1').result; // string
   *     const step2 = outcome.workResults.get('step2').result; // number
   *     console.log(`Completed with status: ${outcome.status}`);
   *   });
   * ```
   */
  setOnAfter(
    callback: (
      context: WorkflowContext<TData, TBase & TAccumulated>,
      outcome: WorkOutcome<TBase & TAccumulated>
    ) => void | Promise<void>
  ): this {
    this._onAfterMethod = callback;
    return this;
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

    // Normalize tree-level timeout
    const timeoutOptions = normalizeTimeoutConfig(this.timeout);

    try {
      // Execute this tree (with timeout if configured)
      const executeTree = () => this._executeTree(this, context, workResults, startTime);
      const result = await executeWithTimeout(executeTree, this.name, timeoutOptions, context);

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
        // Note: onAfter is NOT called when tree is skipped
        return { name: tree.name, skipped: true };
      }
    }

    // Call onBefore hook if provided (after shouldRun passes)
    if (tree.onBefore) {
      try {
        await tree.onBefore(context);
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

        // Call onAfter even when onBefore fails (try/finally semantics for safe cleanup)
        const onAfterCallback =
          tree === this && this._onAfterMethod ? this._onAfterMethod : tree.onAfter;
        if (onAfterCallback) {
          try {
            const outcome: WorkOutcome<TBase & TAccumulated> = {
              status: WorkStatus.Failed,
              error: err,
              workResults: context.workResults,
            };
            await onAfterCallback(context, outcome);
          } catch {
            // onAfter errors are silently ignored
          }
        }

        return { name: tree.name, error: err };
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

      // Call onAfter hook if provided (on success)
      // Use method-based callback if set (for this tree), otherwise use option-based
      const onAfterCallback =
        tree === this && this._onAfterMethod ? this._onAfterMethod : tree.onAfter;
      if (onAfterCallback) {
        try {
          const outcome: WorkOutcome<TBase & TAccumulated> = {
            status: WorkStatus.Completed,
            result: lastResult,
            workResults: context.workResults,
          };
          await onAfterCallback(context, outcome);
        } catch {
          // onAfter errors are silently ignored - they don't affect tree result
        }
      }

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

      // Call onAfter hook if provided (on failure, before error handling)
      // Use method-based callback if set (for this tree), otherwise use option-based
      const onAfterCallback =
        tree === this && this._onAfterMethod ? this._onAfterMethod : tree.onAfter;
      if (onAfterCallback) {
        try {
          const outcome: WorkOutcome<TBase & TAccumulated> = {
            status: WorkStatus.Failed,
            error: err,
            workResults: context.workResults,
          };
          await onAfterCallback(context, outcome);
        } catch {
          // onAfter errors are silently ignored - they don't affect tree result
        }
      }

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
      const timeoutOptions = normalizeTimeoutConfig(workDef.timeout);
      const maxAttempts = retryOptions ? retryOptions.maxRetries + 1 : 1;
      let lastError: Error | null = null;
      let attempt = 0;

      while (attempt < maxAttempts) {
        attempt++;

        try {
          const result = await executeWithTimeout(
            () => workDef.execute(context),
            workDef.name,
            timeoutOptions,
            context
          );
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
    const timeoutOptions = normalizeTimeoutConfig(work.timeout);
    const maxAttempts = retryOptions ? retryOptions.maxRetries + 1 : 1;
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        const result = await executeWithTimeout(
          () => work.execute(context),
          work.name,
          timeoutOptions,
          context
        );
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
