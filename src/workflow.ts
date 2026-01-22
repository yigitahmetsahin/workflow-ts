import {
  IWorkflowContext,
  IWorkflowResult,
  IWorkResultsMap,
  WorkflowStatus,
  IWorkflowWork,
  IWorkDefinition,
  IWorkResult,
  WorkStatus,
} from './workflow.types';

/**
 * Internal implementation of IWorkResultsMap using a Map
 */
class WorkResultsMap<
  TWorkResults extends Record<string, unknown>,
> implements IWorkResultsMap<TWorkResults> {
  private map = new Map<keyof TWorkResults, unknown>();

  get<K extends keyof TWorkResults>(name: K): TWorkResults[K] | undefined {
    return this.map.get(name) as TWorkResults[K] | undefined;
  }

  set<K extends keyof TWorkResults>(name: K, value: TWorkResults[K]): void {
    this.map.set(name, value);
  }

  has(name: keyof TWorkResults): boolean {
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
 *       const isValid = ctx.workResults.get('validate');     // boolean | undefined
 *       const orders = ctx.workResults.get('fetchOrders');   // Order[] | undefined
 *       const profile = ctx.workResults.get('fetchProfile'); // Profile | undefined
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
> {
  private works: IWorkflowWork[] = [];

  /**
   * Add a serial work to the workflow.
   * The work name and result type are automatically inferred.
   */
  serial<TName extends string, TResult>(
    work: IWorkDefinition<TName, TData, TResult, TWorkResults>
  ): Workflow<TData, TWorkResults & { [K in TName]: TResult }> {
    this.works.push({
      type: 'serial',
      works: [work],
    });
    return this as unknown as Workflow<TData, TWorkResults & { [K in TName]: TResult }>;
  }

  /**
   * Add parallel works to the workflow.
   * All work names and result types are automatically inferred.
   */
  parallel<
    const TParallelWorks extends readonly IWorkDefinition<string, TData, unknown, TWorkResults>[],
  >(works: TParallelWorks): Workflow<TData, TWorkResults & ParallelWorksToRecord<TParallelWorks>> {
    this.works.push({
      type: 'parallel',
      works: works as unknown as IWorkDefinition<string, TData, unknown, TWorkResults>[],
    });
    return this as unknown as Workflow<TData, TWorkResults & ParallelWorksToRecord<TParallelWorks>>;
  }

  /**
   * Execute the workflow with initial data
   */
  async run(initialData: TData): Promise<IWorkflowResult<TData, TWorkResults>> {
    const startTime = Date.now();
    const context: IWorkflowContext<TData, TWorkResults> = {
      data: initialData,
      workResults: new WorkResultsMap<TWorkResults>(),
    };
    const workResults = new Map<keyof TWorkResults, IWorkResult>();

    try {
      for (const workGroup of this.works) {
        if (workGroup.type === 'serial') {
          await this.executeWork(workGroup.works[0], context, workResults);
        } else {
          await this.executeParallelWorks(workGroup.works, context, workResults);
        }
      }

      return {
        status: WorkflowStatus.COMPLETED,
        context,
        workResults,
        totalDuration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: WorkflowStatus.FAILED,
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
    workResults: Map<keyof TWorkResults, IWorkResult>
  ): Promise<void> {
    const workStartTime = Date.now();

    // Check if work should run
    if (work.shouldRun) {
      const shouldRun = await work.shouldRun(context);
      if (!shouldRun) {
        workResults.set(work.name as keyof TWorkResults, {
          status: WorkStatus.SKIPPED,
          duration: Date.now() - workStartTime,
        });
        return;
      }
    }

    try {
      const result = await work.execute(context);

      // Store result in context for subsequent works
      context.workResults.set(work.name as keyof TWorkResults, result);

      workResults.set(work.name as keyof TWorkResults, {
        status: WorkStatus.COMPLETED,
        result,
        duration: Date.now() - workStartTime,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      workResults.set(work.name as keyof TWorkResults, {
        status: WorkStatus.FAILED,
        error: err,
        duration: Date.now() - workStartTime,
      });

      // Call error handler if provided
      if (work.onError) {
        await work.onError(err, context);
      }

      // Re-throw to stop workflow execution
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
    workResults: Map<keyof TWorkResults, IWorkResult>
  ): Promise<void> {
    const promises = works.map(async (work) => {
      const workStartTime = Date.now();

      // Check if work should run
      if (work.shouldRun) {
        const shouldRun = await work.shouldRun(context);
        if (!shouldRun) {
          workResults.set(work.name as keyof TWorkResults, {
            status: WorkStatus.SKIPPED,
            duration: Date.now() - workStartTime,
          });
          return { work, skipped: true };
        }
      }

      try {
        const result = await work.execute(context);
        return { work, result, startTime: workStartTime };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return { work, error: err, startTime: workStartTime };
      }
    });

    const results = await Promise.all(promises);

    // Process results and check for errors
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors: { work: IWorkDefinition<string, TData, any, any>; error: Error }[] = [];

    for (const result of results) {
      if ('skipped' in result && result.skipped) {
        continue;
      }

      const duration = Date.now() - result.startTime!;

      if ('error' in result && result.error) {
        workResults.set(result.work.name as keyof TWorkResults, {
          status: WorkStatus.FAILED,
          error: result.error,
          duration,
        });
        errors.push({ work: result.work, error: result.error });
      } else {
        context.workResults.set(result.work.name as keyof TWorkResults, result.result);
        workResults.set(result.work.name as keyof TWorkResults, {
          status: WorkStatus.COMPLETED,
          result: result.result,
          duration,
        });
      }
    }

    // Handle errors after all parallel works complete
    if (errors.length > 0) {
      // Call error handlers
      for (const { work, error } of errors) {
        if (work.onError) {
          await work.onError(error, context);
        }
      }

      // Throw the first error to stop workflow
      throw errors[0].error;
    }
  }
}

/**
 * Helper type to extract work results from parallel works array
 * Uses Extract to preserve the specific type for each work name
 */
type ParallelWorksToRecord<
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
