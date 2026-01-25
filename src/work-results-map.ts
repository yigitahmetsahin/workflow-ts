import type { IWorkResultsMap } from './workflow.types';
import type { WorkResult } from './work.types';

/**
 * Internal implementation of IWorkResultsMap using a Map
 */
export class WorkResultsMap<
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
