import {
  IWorkflowContext,
  WorkflowResult,
  WorkflowWork,
  IWorkflow,
  SealedWorkflow,
  SealingWorkDefinition,
  WorkflowOptions,
  ParallelWorksToRecord,
  WorkflowStatus,
} from './workflow.types';
import {
  IWorkDefinition,
  WorkResult,
  WorkStatus,
  ParallelInput,
  IGroupWorkDefinition,
} from './work.types';
import { WorkInput, getWorkDefinition } from './work';
import { WorkResultsMap } from './work-results-map';
import { isGroupWorkDefinition } from './type-guards';

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
   * Accepts an array of work definitions, Work instances, or group work definitions.
   * All work names and result types are automatically inferred.
   * @throws Error if the workflow is sealed
   *
   * @example
   * ```typescript
   * // Regular parallel works
   * workflow.parallel([
   *   { name: 'work1', execute: async () => 'result1' },
   *   { name: 'work2', execute: async () => 123 },
   * ]);
   *
   * // With nested groups
   * workflow.parallel([
   *   {
   *     name: 'addressGroup',
   *     serial: [
   *       { name: 'fetchAddress', execute: async () => address },
   *       { name: 'validateAddress', execute: async () => validated },
   *     ],
   *   },
   *   { name: 'fetchHistory', execute: async () => history },
   * ]);
   * ```
   */
  parallel<
    const TParallelWorks extends readonly ParallelInput<string, TData, unknown, TWorkResults>[],
  >(works: TParallelWorks): Workflow<TData, TWorkResults & ParallelWorksToRecord<TParallelWorks>> {
    if (this._sealed) {
      throw new Error('Cannot add work to a sealed workflow');
    }
    this._works.push({
      type: 'parallel',
      works: works.map((w) => {
        if (isGroupWorkDefinition(w)) {
          return w;
        }
        return getWorkDefinition(w as WorkInput<string, TData, unknown, TWorkResults>);
      }),
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
            // Serial works are always regular work definitions (not groups)

            await this.executeWork(
              workGroup.works[0] as IWorkDefinition<string, TData, any, any>,
              context,
              workResults
            );
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
    works: (IWorkDefinition<string, TData, any, any> | IGroupWorkDefinition<string, TData, any>)[],
    context: IWorkflowContext<TData, TWorkResults>,
    workResults: Map<keyof TWorkResults, WorkResult>
  ): Promise<void> {
    // Helper to store failed result
    const storeFailedResult = (name: string, err: Error, duration: number, parent?: string) => {
      const failedResult: WorkResult = {
        status: WorkStatus.Failed,
        error: err,
        duration,
        parent,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.workResults.set(name as keyof TWorkResults, failedResult as any);
      workResults.set(name as keyof TWorkResults, failedResult);
    };

    const promises = works.map(async (work) => {
      const workStartTime = Date.now();

      // Check if this is a group work
      if (isGroupWorkDefinition(work)) {
        return this.executeGroupWork(work, context, workResults, workStartTime);
      }

      // Regular work execution
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
          return { name: work.name, skipped: true };
        }
      }

      try {
        const result = await work.execute(context);
        return { name: work.name, result, startTime: workStartTime };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const duration = Date.now() - workStartTime;

        // If silenceError is true, store result and continue (no onError call)
        if (work.silenceError) {
          storeFailedResult(work.name, err, duration);
          return { name: work.name, handled: true };
        }

        // If onError exists, call it immediately
        // If onError throws, propagate. If it doesn't throw, error is handled.
        if (work.onError) {
          try {
            await work.onError(err, context);
            // onError didn't throw - error is handled
            storeFailedResult(work.name, err, duration);
            return { name: work.name, handled: true };
          } catch {
            // onError threw - propagate the error
            return { name: work.name, error: err, startTime: workStartTime };
          }
        }

        // No onError - propagate the error
        return { name: work.name, error: err, startTime: workStartTime };
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
        context.workResults.set(result.name as keyof TWorkResults, failedResult as any);
        workResults.set(result.name as keyof TWorkResults, failedResult);
        errors.push(result.error);
      } else {
        // Success
        const completedResult: WorkResult = {
          status: WorkStatus.Completed,
          result: result.result,
          duration,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.workResults.set(result.name as keyof TWorkResults, completedResult as any);
        workResults.set(result.name as keyof TWorkResults, completedResult);
      }
    }

    // Throw the first error to stop workflow
    if (errors.length > 0) {
      throw errors[0];
    }
  }

  /**
   * Execute a group work (serial or parallel inner works)
   */
  private async executeGroupWork(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    group: IGroupWorkDefinition<string, TData, any>,
    context: IWorkflowContext<TData, TWorkResults>,
    workResults: Map<keyof TWorkResults, WorkResult>,
    groupStartTime: number
  ): Promise<{
    name: string;
    result?: unknown;
    error?: Error;
    skipped?: boolean;
    handled?: boolean;
    startTime: number;
  }> {
    // Check if group should run
    if (group.shouldRun) {
      const shouldRun = await group.shouldRun(context);
      if (!shouldRun) {
        const skippedResult: WorkResult = {
          status: WorkStatus.Skipped,
          duration: Date.now() - groupStartTime,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.workResults.set(group.name as keyof TWorkResults, skippedResult as any);
        workResults.set(group.name as keyof TWorkResults, skippedResult);
        return { name: group.name, skipped: true, startTime: groupStartTime };
      }
    }

    const innerWorks = group.serial || group.parallel || [];
    const isSerial = !!group.serial;

    try {
      let groupResult: unknown;

      if (isSerial) {
        // Execute inner works serially
        groupResult = await this.executeSerialGroup(innerWorks, context, workResults, group.name);
      } else {
        // Execute inner works in parallel
        groupResult = await this.executeParallelGroup(innerWorks, context, workResults, group.name);
      }

      // Store group result
      const completedResult: WorkResult = {
        status: WorkStatus.Completed,
        result: groupResult,
        duration: Date.now() - groupStartTime,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.workResults.set(group.name as keyof TWorkResults, completedResult as any);
      workResults.set(group.name as keyof TWorkResults, completedResult);

      return { name: group.name, result: groupResult, startTime: groupStartTime };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - groupStartTime;

      // Store failed result for the group
      const failedResult: WorkResult = {
        status: WorkStatus.Failed,
        error: err,
        duration,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.workResults.set(group.name as keyof TWorkResults, failedResult as any);
      workResults.set(group.name as keyof TWorkResults, failedResult);

      // If silenceError is true, don't propagate
      if (group.silenceError) {
        return { name: group.name, handled: true, startTime: groupStartTime };
      }

      // If onError exists, call it
      if (group.onError) {
        try {
          await group.onError(err, context);
          // onError didn't throw - error is handled
          return { name: group.name, handled: true, startTime: groupStartTime };
        } catch {
          // onError threw - propagate the error
          return { name: group.name, error: err, startTime: groupStartTime };
        }
      }

      // No error handling - propagate
      return { name: group.name, error: err, startTime: groupStartTime };
    }
  }

  /**
   * Execute inner works of a group serially
   * Returns the result of the last work
   */
  private async executeSerialGroup(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    works: readonly ParallelInput<string, TData, any, any>[],
    context: IWorkflowContext<TData, TWorkResults>,
    workResults: Map<keyof TWorkResults, WorkResult>,
    parentName: string
  ): Promise<unknown> {
    let lastResult: unknown;

    for (const work of works) {
      if (isGroupWorkDefinition(work)) {
        // Nested group
        const groupStartTime = Date.now();
        const result = await this.executeGroupWork(work, context, workResults, groupStartTime);
        // Set parent for the nested group
        const groupWorkResult = workResults.get(work.name as keyof TWorkResults);
        if (groupWorkResult) {
          groupWorkResult.parent = parentName;
        }
        if (result.error) {
          throw result.error;
        }
        lastResult = result.result;
      } else {
        // Regular work
        await this.executeWorkWithParent(
          work as IWorkDefinition<string, TData, unknown, TWorkResults>,
          context,
          workResults,
          parentName
        );
        const workResult = context.workResults.get(work.name as keyof TWorkResults);
        if (workResult.status === WorkStatus.Failed && !work.silenceError) {
          throw workResult.error;
        }
        lastResult = workResult.result;
      }
    }

    return lastResult;
  }

  /**
   * Execute inner works of a group in parallel
   * Returns an object mapping work names to their results
   */
  private async executeParallelGroup(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    works: readonly ParallelInput<string, TData, any, any>[],
    context: IWorkflowContext<TData, TWorkResults>,
    workResults: Map<keyof TWorkResults, WorkResult>,
    parentName: string
  ): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};
    const errors: Error[] = [];

    const promises = works.map(async (work) => {
      const workStartTime = Date.now();

      if (isGroupWorkDefinition(work)) {
        // Nested group
        const result = await this.executeGroupWork(work, context, workResults, workStartTime);
        // Set parent for the nested group
        const groupWorkResult = workResults.get(work.name as keyof TWorkResults);
        if (groupWorkResult) {
          groupWorkResult.parent = parentName;
        }
        return result;
      }

      // Regular work - execute with parent tracking
      const workDef = work as IWorkDefinition<string, TData, unknown, TWorkResults>;

      // Check if work should run
      if (workDef.shouldRun) {
        const shouldRun = await workDef.shouldRun(context);
        if (!shouldRun) {
          const skippedResult: WorkResult = {
            status: WorkStatus.Skipped,
            duration: Date.now() - workStartTime,
            parent: parentName,
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context.workResults.set(workDef.name as keyof TWorkResults, skippedResult as any);
          workResults.set(workDef.name as keyof TWorkResults, skippedResult);
          return { name: workDef.name, skipped: true, startTime: workStartTime };
        }
      }

      try {
        const result = await workDef.execute(context);
        const completedResult: WorkResult = {
          status: WorkStatus.Completed,
          result,
          duration: Date.now() - workStartTime,
          parent: parentName,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.workResults.set(workDef.name as keyof TWorkResults, completedResult as any);
        workResults.set(workDef.name as keyof TWorkResults, completedResult);
        return { name: workDef.name, result, startTime: workStartTime };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const duration = Date.now() - workStartTime;

        const failedResult: WorkResult = {
          status: WorkStatus.Failed,
          error: err,
          duration,
          parent: parentName,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.workResults.set(workDef.name as keyof TWorkResults, failedResult as any);
        workResults.set(workDef.name as keyof TWorkResults, failedResult);

        // Handle error based on work settings
        if (workDef.silenceError) {
          return { name: workDef.name, handled: true, startTime: workStartTime };
        }

        if (workDef.onError) {
          try {
            await workDef.onError(err, context);
            return { name: workDef.name, handled: true, startTime: workStartTime };
          } catch {
            return { name: workDef.name, error: err, startTime: workStartTime };
          }
        }

        return { name: workDef.name, error: err, startTime: workStartTime };
      }
    });

    const parallelResults = await Promise.all(promises);

    // Collect results and errors
    for (const result of parallelResults) {
      if ('error' in result && result.error) {
        errors.push(result.error);
      } else if (
        !('skipped' in result && result.skipped) &&
        !('handled' in result && result.handled)
      ) {
        results[result.name] = result.result;
      }
    }

    if (errors.length > 0) {
      throw errors[0];
    }

    return results;
  }

  /**
   * Execute a single work with parent tracking
   */
  private async executeWorkWithParent(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    work: IWorkDefinition<string, TData, any, any>,
    context: IWorkflowContext<TData, TWorkResults>,
    workResults: Map<keyof TWorkResults, WorkResult>,
    parentName: string
  ): Promise<void> {
    const workStartTime = Date.now();

    // Check if work should run
    if (work.shouldRun) {
      const shouldRun = await work.shouldRun(context);
      if (!shouldRun) {
        const skippedResult: WorkResult = {
          status: WorkStatus.Skipped,
          duration: Date.now() - workStartTime,
          parent: parentName,
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
        parent: parentName,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.workResults.set(work.name as keyof TWorkResults, workResult as any);
      workResults.set(work.name as keyof TWorkResults, workResult);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      const failedResult: WorkResult = {
        status: WorkStatus.Failed,
        error: err,
        duration: Date.now() - workStartTime,
        parent: parentName,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.workResults.set(work.name as keyof TWorkResults, failedResult as any);
      workResults.set(work.name as keyof TWorkResults, failedResult);

      // If silenceError is true, don't throw
      if (work.silenceError) {
        return;
      }

      // If onError handler exists, let it decide
      if (work.onError) {
        await work.onError(err, context);
        return;
      }

      // No handling - throw
      throw err;
    }
  }
}
