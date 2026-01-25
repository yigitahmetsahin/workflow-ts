/**
 * Work Status
 */
export enum WorkStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Skipped = 'skipped',
}

/**
 * Result of a single work execution
 */
export type WorkResult<TResult = unknown> = {
  status: WorkStatus;
  result?: TResult;
  error?: Error;
  duration: number;
  /** Parent group work name, if this work is part of a group */
  parent?: string;
};

// Forward declaration for circular reference

export type ParallelInput<
  TName extends string,
  TData = Record<string, unknown>,
  TResult = unknown,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> =
  | IWorkDefinition<TName, TData, TResult, TAvailableWorkResults>
  | IGroupWorkDefinition<TName, TData, TAvailableWorkResults>;

/**
 * Definition of a work with inferred name and result type
 * Works have `execute` and cannot have `serial`/`parallel` (those are for groups)
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
  /** Not allowed - works have execute, not serial (use groups for nesting) */
  serial?: never;
  /** Not allowed - works have execute, not parallel (use groups for nesting) */
  parallel?: never;
}

/**
 * Base properties shared by all group work definitions
 * Groups have serial/parallel, not execute (that's for works)
 */
interface IGroupWorkBase<
  TName extends string,
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Unique name for the group */
  name: TName;
  /** Not allowed - groups have serial/parallel, not execute (use works for execute) */
  execute?: never;
  /** Optional: condition to determine if group should run */
  shouldRun?: (
    context: IWorkflowContext<TData, TAvailableWorkResults>
  ) => boolean | Promise<boolean>;
  /** Optional: called when group fails */
  onError?: (
    error: Error,
    context: IWorkflowContext<TData, TAvailableWorkResults>
  ) => void | Promise<void>;
  /** Optional: if true, errors won't stop the workflow */
  silenceError?: boolean;
}

/**
 * Serial group - inner works execute in sequence
 */
interface ISerialGroupWorkDefinition<
  TName extends string,
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> extends IGroupWorkBase<TName, TData, TAvailableWorkResults> {
  /** Inner works to execute serially */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serial: readonly ParallelInput<string, TData, any, TAvailableWorkResults>[];
  /** Not allowed when serial is used */
  parallel?: never;
}

/**
 * Parallel group - inner works execute concurrently
 */
interface IParallelGroupWorkDefinition<
  TName extends string,
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> extends IGroupWorkBase<TName, TData, TAvailableWorkResults> {
  /** Not allowed when parallel is used */
  serial?: never;
  /** Inner works to execute in parallel */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parallel: readonly ParallelInput<string, TData, any, TAvailableWorkResults>[];
}

/**
 * Group work definition - contains nested works that execute as a unit
 * Must have either serial OR parallel (mutually exclusive, enforced at type level)
 */
export type IGroupWorkDefinition<
  TName extends string,
  TData = Record<string, unknown>,
  TAvailableWorkResults extends Record<string, unknown> = Record<string, unknown>,
> =
  | ISerialGroupWorkDefinition<TName, TData, TAvailableWorkResults>
  | IParallelGroupWorkDefinition<TName, TData, TAvailableWorkResults>;

// Import context type (will be defined in workflow.types.ts)
import type { IWorkflowContext } from './workflow.types';
