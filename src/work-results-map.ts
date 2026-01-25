import type { IWorkResultsMap, WorkResult } from './work.types';

/**
 * Internal implementation of IWorkResultsMap using a Map
 */
export class WorkResultsMap<
  TWorkResults extends Record<string, unknown>,
> implements IWorkResultsMap<TWorkResults> {
  constructor(private map: Map<string, WorkResult<unknown>> = new Map()) {}

  get<K extends keyof TWorkResults>(name: K): WorkResult<TWorkResults[K]> {
    const result = this.map.get(name as string);
    if (!result) {
      throw new Error(
        `Work result "${String(name)}" not found. This work may not have executed yet.`
      );
    }
    return result as WorkResult<TWorkResults[K]>;
  }

  set<K extends keyof TWorkResults>(name: K, value: WorkResult<TWorkResults[K]>): void {
    this.map.set(name as string, value);
  }

  has<K extends keyof TWorkResults>(name: K): boolean {
    return this.map.has(name as string);
  }
}
