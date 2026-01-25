import {
  IWorkflowContext,
  WorkflowResult,
  IWorkResultsMap,
  WorkflowWork,
  IWorkDefinition,
  WorkResult,
  IWorkflow,
  SealedWorkflow,
  SealingWorkDefinition,
  WorkflowOptions,
  ParallelWorksToRecord,
  WorkStatus,
  WorkflowStatus,
} from './workflow.types';
import { WorkInput, getWorkDefinition } from './work';

/**
 * Internal implementation of IWorkResultsMap using a Map
 */
class WorkResultsMap<
  TWorkResults extends Record<string, unknown>,
> implements IWorkResultsMap<TWorkResults> {
  private map = new Map<keyof TWorkResults, WorkResult<unknown>>();

  get<K extends keyof TWorkResults>(name: K): WorkResult<TWorkResults[K]> {
    const result = this.map.get(name);
    if (!result) {
      throw new Error(
        `Work result "${String(name)}" not found. This work may not have executed yet.`
      );
    }
    return result as WorkResult<TWorkResults[K]>;
  }

  set<K extends keyof TWorkResults>(name: K, value: WorkResult<TWorkResults[K]>): void {
    this.map.set(name, value);
  }

  has<K extends keyof TWorkResults>(name: K): boolean {
    return this.map.has(name);
  }
}

/**
 * A simple, extensible workflow engine that supports serial and parallel work execution.
 * Work names and result types are automatically inferred from the workflow definition.
 *
 * @example
 * ```typescript
 * const workflow = new Workflow<{ userId: string }>()
 *   .serial({
 *     name: 'validate',
 *     execute: async (ctx) => true, // returns boolean
 *   })
 *   .parallel([
 *     {
 *       name: 'fetchOrders',
 *       execute: async (ctx) => [{ id: 1 }], // returns Order[]
 *     },
 *     {
 *       name: 'fetchProfile',
 *       execute: async (ctx) => ({ name: 'John' }), // returns Profile
 *     },
 *   ])
 *   .serial({
 *     name: 'process',
 *     execute: async (ctx) => {
 *       // ✅ Autocomplete for names AND types are inferred!
 *       const isValid = ctx.workResults.get('validate').result;     // boolean | undefined
 *       const orders = ctx.workResults.get('fetchOrders').result;   // Order[] | undefined
 *       const profile = ctx.workResults.get('fetchProfile').result; // Profile | undefined
 *       return { orders, profile };
 *     },
 *   });
 *
 * const result = await workflow.run({ userId: '123' });
 * ```
 */
export class Workflow<
  TData = Record<string, unknown>,
  TWorkResults extends Record<string, unknown> = NonNullable<unknown>,
> implements IWorkflow<TData, TWorkResults> {
  private _works: WorkflowWork[] = [];
  private _options: Required<WorkflowOptions>;
  private _sealed = false;

  constructor(options: WorkflowOptions = {}) {
    this._options = { failFast: true, ...options };
  }

  /**
   * The list of works in the workflow (readonly)
   */
  get works(): readonly WorkflowWork[] {
    return this._works;
  }

  /**
   * The workflow options (readonly)
   */
  get options(): Readonly<Required<WorkflowOptions>> {
    return this._options;
  }

  /**
   * Check if the workflow is sealed
   */
  isSealed(): boolean {
    return this._sealed;
  }

  /**
   * Add a serial work to the workflow.
   * Accepts either an inline work definition or a Work instance.
   * The work name and result type are automatically inferred.
   * @throws Error if the workflow is sealed
   */
  serial<TName extends string, TResult>(
    work: WorkInput<TName, TData, TResult, TWorkResults>
  ): Workflow<TData, TWorkResults & { [K in TName]: TResult }> {
    if (this._sealed) {
      throw new Error('Cannot add work to a sealed workflow');
    }
    this._works.push({
      type: 'serial',
      works: [getWorkDefinition(work)],
    });
    return this as Workflow<TData, TWorkResults & { [K in TName]: TResult }>;
  }

  /**
   * Add parallel works to the workflow.
   * Accepts an array of work definitions or Work instances.
   * All work names and result types are automatically inferred.
   * @throws Error if the workflow is sealed
   *
   * @example
   * ```typescript
   * workflow.parallel([
   *   { name: 'work1', execute: async () => 'result1' },
   *   { name: 'work2', execute: async () => 123 },
   * ]);
   * ```
   */
  parallel<const TParallelWorks extends readonly WorkInput<string, TData, unknown, TWorkResults>[]>(
    works: TParallelWorks
  ): Workflow<TData, TWorkResults & ParallelWorksToRecord<TParallelWorks>> {
    if (this._sealed) {
      throw new Error('Cannot add work to a sealed workflow');
    }
    this._works.push({
      type: 'parallel',
      works: works.map((w) => getWorkDefinition(w)),
    });
    return this as Workflow<TData, TWorkResults & ParallelWorksToRecord<TParallelWorks>>;
  }

  /**
   * Seal the workflow to prevent further modifications.
   * Returns a SealedWorkflow that can only be executed with run().
   *
   * @example
   * ```typescript
   * const sealed = new Workflow<{ userId: string }>()
   *   .serial({ name: 'step1', execute: async () => 'result' })
   *   .seal();
   *
   * sealed.name; // 'seal'
   * sealed.isSealed(); // true
   * await sealed.run({ userId: '123' }); // OK
   *
   * // TypeScript prevents modifications:
   * // sealed.serial(...) // Error: Property 'serial' does not exist
   * ```
   */
  seal(): SealedWorkflow<TData, TWorkResults>;
  seal<TName extends string, TResult>(
    sealingWork: SealingWorkDefinition<TName, TData, TWorkResults, TResult>
  ): SealedWorkflow<TData, TWorkResults & { [K in TName]: TResult }>;
  seal<TName extends string, TResult>(
    sealingWork?: SealingWorkDefinition<TName, TData, TWorkResults, TResult>
  ): SealedWorkflow<TData, TWorkResults & { [K in TName]: TResult }> {
    // If sealingWork is provided, add it as a final serial work
    if (sealingWork) {
      this._works.push({
        type: 'serial',
        works: [sealingWork],
      });
    }
    this._sealed = true;
    return {
      name: 'seal',
      works: this._works,
      options: this._options,
      isSealed: () => this._sealed,
      run: this.run.bind(this),
    } as SealedWorkflow<TData, TWorkResults & { [K in TName]: TResult }>;
  }

  /**
   * Execute the workflow with initial data
   */
  async run(initialData: TData): Promise<WorkflowResult<TData, TWorkResults>> {
    const startTime = Date.now();
    const context: IWorkflowContext<TData, TWorkResults> = {
      data: initialData,
      workResults: new WorkResultsMap<TWorkResults>(),
    };
    const workResults = new Map<keyof TWorkResults, WorkResult>();
    const collectedErrors: Error[] = [];

    try {
      for (const workGroup of this._works) {
        try {
          if (workGroup.type === 'serial') {
            await this.executeWork(workGroup.works[0], context, workResults);
          } else {
            await this.executeParallelWorks(workGroup.works, context, workResults);
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          if (this._options.failFast) {
            throw err;
          }
          collectedErrors.push(err);
        }
      }

      // If failFast is false, check for collected errors
      if (collectedErrors.length > 0) {
        return {
          status: WorkflowStatus.Failed,
          context,
          workResults,
          totalDuration: Date.now() - startTime,
          error: collectedErrors[0],
        };
      }

      return {
        status: WorkflowStatus.Completed,
        context,
        workResults,
        totalDuration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: WorkflowStatus.Failed,
        context,
        workResults,
        totalDuration: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Execute a single work
   */
  private async executeWork(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    work: IWorkDefinition<string, TData, any, any>,
    context: IWorkflowContext<TData, TWorkResults>,
    workResults: Map<keyof TWorkResults, WorkResult>
  ): Promise<void> {
    const workStartTime = Date.now();

    // Check if work should run
    if (work.shouldRun) {
      const shouldRun = await work.shouldRun(context);
      if (!shouldRun) {
        const skippedResult: WorkResult = {
          status: WorkStatus.Skipped,
          duration: Date.now() - workStartTime,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.workResults.set(work.name as keyof TWorkResults, skippedResult as any);
        workResults.set(work.name as keyof TWorkResults, skippedResult);
        return;
      }
    }

    try {
      const result = await work.execute(context);

      const workResult: WorkResult = {
        status: WorkStatus.Completed,
        result,
        duration: Date.now() - workStartTime,
      };

      // Store result in context for subsequent works
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.workResults.set(work.name as keyof TWorkResults, workResult as any);
      workResults.set(work.name as keyof TWorkResults, workResult);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      const failedResult: WorkResult = {
        status: WorkStatus.Failed,
        error: err,
        duration: Date.now() - workStartTime,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.workResults.set(work.name as keyof TWorkResults, failedResult as any);
      workResults.set(work.name as keyof TWorkResults, failedResult);

      // If silenceError is true, don't call onError, just continue
      if (work.silenceError) {
        return;
      }

      // If onError handler exists, let it decide whether to propagate the error
      if (work.onError) {
        // If onError throws, propagate. If it doesn't throw, swallow the error.
        await work.onError(err, context);
        return;
      }

      // No onError handler and silenceError is false - throw to stop workflow
      throw err;
    }
  }

  /**
   * Execute multiple works in parallel
   */
  private async executeParallelWorks(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    works: IWorkDefinition<string, TData, any, any>[],
    context: IWorkflowContext<TData, TWorkResults>,
    workResults: Map<keyof TWorkResults, WorkResult>
  ): Promise<void> {
    // Helper to store failed result
    const storeFailedResult = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      work: IWorkDefinition<string, TData, any, any>,
      err: Error,
      duration: number
    ) => {
      const failedResult: WorkResult = {
        status: WorkStatus.Failed,
        error: err,
        duration,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.workResults.set(work.name as keyof TWorkResults, failedResult as any);
      workResults.set(work.name as keyof TWorkResults, failedResult);
    };

    const promises = works.map(async (work) => {
      const workStartTime = Date.now();

      // Check if work should run
      if (work.shouldRun) {
        const shouldRun = await work.shouldRun(context);
        if (!shouldRun) {
          const skippedResult: WorkResult = {
            status: WorkStatus.Skipped,
            duration: Date.now() - workStartTime,
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context.workResults.set(work.name as keyof TWorkResults, skippedResult as any);
          workResults.set(work.name as keyof TWorkResults, skippedResult);
          return { work, skipped: true };
        }
      }

      try {
        const result = await work.execute(context);
        return { work, result, startTime: workStartTime };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const duration = Date.now() - workStartTime;

        // If silenceError is true, store result and continue (no onError call)
        if (work.silenceError) {
          storeFailedResult(work, err, duration);
          return { work, handled: true };
        }

        // If onError exists, call it immediately
        // If onError throws, propagate. If it doesn't throw, error is handled.
        if (work.onError) {
          try {
            await work.onError(err, context);
            // onError didn't throw - error is handled
            storeFailedResult(work, err, duration);
            return { work, handled: true };
          } catch {
            // onError threw - propagate the error
            return { work, error: err, startTime: workStartTime };
          }
        }

        // No onError - propagate the error
        return { work, error: err, startTime: workStartTime };
      }
    });

    const results = await Promise.all(promises);

    // Process results and collect errors to propagate

    const errors: Error[] = [];

    for (const result of results) {
      // Skip handled cases (skipped or error handled by silenceError/onError)
      if (('skipped' in result && result.skipped) || ('handled' in result && result.handled)) {
        continue;
      }

      const duration = Date.now() - result.startTime!;

      if ('error' in result && result.error) {
        // Error that should propagate - store result and track error
        const failedResult: WorkResult = {
          status: WorkStatus.Failed,
          error: result.error,
          duration,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.workResults.set(result.work.name as keyof TWorkResults, failedResult as any);
        workResults.set(result.work.name as keyof TWorkResults, failedResult);
        errors.push(result.error);
      } else {
        // Success
        const completedResult: WorkResult = {
          status: WorkStatus.Completed,
          result: result.result,
          duration,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.workResults.set(result.work.name as keyof TWorkResults, completedResult as any);
        workResults.set(result.work.name as keyof TWorkResults, completedResult);
      }
    }

    // Throw the first error to stop workflow
    if (errors.length > 0) {
      throw errors[0];
    }
  }
}
