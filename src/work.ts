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

  /** Optional: if true, errors won't stop the workflow (result will be undefined) */
  readonly silenceError?: boolean;

  constructor(definition: IWorkDefinition<TName, TData, TResult, TAvailableWorkResults>) {
    this.name = definition.name;
    this.execute = definition.execute;
    this.shouldRun = definition.shouldRun;
    this.onError = definition.onError;
    this.silenceError = definition.silenceError;
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
