import { IWorkDefinition, IWorkflowContext } from './workflow.types';

/**
 * A standalone Work unit that can be added to workflows.
 * Implements IWorkDefinition so it can be used anywhere a work definition is expected.
 *
 * @example
 * ```typescript
 * const fetchUser = new Work({
 *   name: 'fetchUser',
 *   execute: async (ctx) => {
 *     return { id: ctx.data.userId, name: 'John' };
 *   },
 * });
 *
 * const workflow = new Workflow<{ userId: string }>()
 *   .serial(fetchUser)
 *   .parallel([work1, work2]);
 * ```
 */

/** Symbol to identify WorkGroup instances */
export const WORK_GROUP_SYMBOL = Symbol('WorkGroup');
export class Work<
  TName extends string,
  TData = Record<string, unknown>,
  TResult = unknown,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> implements IWorkDefinition<TName, TData, TResult, TAvailableWorkResults> {
  /** Unique name for the work */
  readonly name: TName;

  /** Execute function - receives context and returns result */
  readonly execute: (context: IWorkflowContext<TData, TAvailableWorkResults>) => Promise<TResult>;

  /** Optional: condition to determine if work should run */
  readonly shouldRun?: (
    context: IWorkflowContext<TData, TAvailableWorkResults>
  ) => boolean | Promise<boolean>;

  /** Optional: called when work fails */
  readonly onError?: (
    error: Error,
    context: IWorkflowContext<TData, TAvailableWorkResults>
  ) => void | Promise<void>;

  constructor(definition: IWorkDefinition<TName, TData, TResult, TAvailableWorkResults>) {
    this.name = definition.name;
    this.execute = definition.execute;
    this.shouldRun = definition.shouldRun;
    this.onError = definition.onError;
  }
}

/**
 * Type that accepts a work definition (either inline object or Work instance).
 * Since Work implements IWorkDefinition, this is simply IWorkDefinition.
 */
export type WorkInput<
  TName extends string,
  TData = Record<string, unknown>,
  TResult = unknown,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> = IWorkDefinition<TName, TData, TResult, TAvailableWorkResults>;

/**
 * Helper to get the work definition from a WorkInput.
 * Since Work implements IWorkDefinition, this simply returns the input.
 */
export function getWorkDefinition<
  TName extends string,
  TData,
  TResult,
  TAvailableWorkResults extends Record<string, unknown>,
>(
  input: WorkInput<TName, TData, TResult, TAvailableWorkResults>
): IWorkDefinition<TName, TData, TResult, TAvailableWorkResults> {
  return input;
}

/**
 * A group of works that can be dynamically built and passed to parallel().
 * Useful for conditionally adding works before execution.
 *
 * @example
 * ```typescript
 * const group = new WorkGroup<{ userId: string }>();
 *
 * group.addWork({
 *   name: 'fetchUser',
 *   execute: async (ctx) => ({ id: ctx.data.userId }),
 * });
 *
 * if (needsOrders) {
 *   group.addWork({
 *     name: 'fetchOrders',
 *     execute: async (ctx) => [{ id: 1 }],
 *   });
 * }
 *
 * const workflow = new Workflow<{ userId: string }>()
 *   .parallel(group);
 * ```
 */
export class WorkGroup<
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
  TWorkResults extends Record<string, unknown> = NonNullable<unknown>,
> {
  /** Symbol to identify WorkGroup instances */
  readonly [WORK_GROUP_SYMBOL] = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private works: IWorkDefinition<string, TData, any, TAvailableWorkResults>[] = [];

  /**
   * Add a work to the group.
   * Returns a new type with the work's result type included.
   *
   * @example
   * ```typescript
   * const group = new WorkGroup<MyData>()
   *   .addWork({ name: 'work1', execute: async () => 'result1' })
   *   .addWork({ name: 'work2', execute: async () => 123 });
   * ```
   */
  addWork<TName extends string, TResult>(
    work: WorkInput<TName, TData, TResult, TAvailableWorkResults>
  ): WorkGroup<TData, TAvailableWorkResults, TWorkResults & { [K in TName]: TResult }> {
    this.works.push(
      getWorkDefinition(work) as IWorkDefinition<string, TData, TResult, TAvailableWorkResults>
    );
    return this as unknown as WorkGroup<
      TData,
      TAvailableWorkResults,
      TWorkResults & { [K in TName]: TResult }
    >;
  }

  /**
   * Get the works in this group.
   * @internal Used by Workflow to extract works for execution.
   */
  getWorks(): IWorkDefinition<string, TData, unknown, TAvailableWorkResults>[] {
    return this.works;
  }

  /**
   * Check if the group has any works.
   */
  isEmpty(): boolean {
    return this.works.length === 0;
  }

  /**
   * Get the number of works in the group.
   */
  get length(): number {
    return this.works.length;
  }
}

/**
 * Type guard to check if a value is a WorkGroup instance.
 */
export function isWorkGroup<TData, TAvailableWorkResults extends Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
): value is WorkGroup<TData, TAvailableWorkResults, Record<string, unknown>> {
  return value != null && typeof value === 'object' && WORK_GROUP_SYMBOL in value;
}
