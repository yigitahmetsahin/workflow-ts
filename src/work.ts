import {
  IWorkDefinition,
  TreeWorkFactoryOptions,
  WorkflowContext,
  RetryConfig,
  TimeoutConfig,
  WorkOutcome,
} from './work.types';
import { TreeWork } from './tree-work';

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

  /** Optional: called before work execution starts (after shouldRun passes) */
  readonly onBefore?: (
    context: WorkflowContext<TData, TAvailableWorkResults>
  ) => void | Promise<void>;

  /** Optional: called after work execution completes (success or failure) */
  readonly onAfter?: (
    context: WorkflowContext<TData, TAvailableWorkResults>,
    outcome: WorkOutcome<TAvailableWorkResults>
  ) => void | Promise<void>;

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

  /** Optional: timeout configuration - milliseconds or full options */
  readonly timeout?: TimeoutConfig<TData, TAvailableWorkResults>;

  constructor(definition: IWorkDefinition<TName, TData, TResult, TAvailableWorkResults>) {
    this.name = definition.name;
    this.execute = definition.execute;
    this.shouldRun = definition.shouldRun;
    this.onBefore = definition.onBefore;
    this.onAfter = definition.onAfter;
    this.onError = definition.onError;
    this.onSkipped = definition.onSkipped;
    this.silenceError = definition.silenceError;
    this.retry = definition.retry;
    this.timeout = definition.timeout;
  }

  /**
   * Build a tree work that can contain nested serial/parallel works.
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
