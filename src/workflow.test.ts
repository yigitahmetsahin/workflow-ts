import { describe, it, expect, vi } from 'vitest';
import { Workflow } from './workflow';
import { Work } from './work';
import { ISealedWorkflow } from './workflow.types';

describe('Workflow', () => {
  describe('serial execution', () => {
    it('should execute a single serial work', async () => {
      const workflow = new Workflow<{ value: number }>().serial({
        name: 'double',
        execute: async (ctx) => ctx.data.value * 2,
      });

      const result = await workflow.run({ value: 5 });

      expect(result.status).toBe('completed');
      expect(result.context.workResults.get('double')?.result).toBe(10);
      expect(result.context.workResults.get('double')?.status).toBe('completed');
      expect(result.workResults.get('double')?.status).toBe('completed');
      expect(result.workResults.get('double')?.result).toBe(10);
    });

    it('should execute multiple serial works in sequence', async () => {
      const executionOrder: string[] = [];

      const workflow = new Workflow<{ value: number }>()
        .serial({
          name: 'first',
          execute: async (ctx) => {
            executionOrder.push('first');
            return ctx.data.value + 1;
          },
        })
        .serial({
          name: 'second',
          execute: async (ctx) => {
            executionOrder.push('second');
            const firstResult = ctx.workResults.get('first')!.result!;
            return firstResult + 1;
          },
        })
        .serial({
          name: 'third',
          execute: async (ctx) => {
            executionOrder.push('third');
            const secondResult = ctx.workResults.get('second')!.result!;
            return secondResult + 1;
          },
        });

      const result = await workflow.run({ value: 0 });

      expect(result.status).toBe('completed');
      expect(executionOrder).toEqual(['first', 'second', 'third']);
      expect(result.context.workResults.get('first')?.result).toBe(1);
      expect(result.context.workResults.get('second')?.result).toBe(2);
      expect(result.context.workResults.get('third')?.result).toBe(3);
    });

    it('should pass context data to serial works', async () => {
      const workflow = new Workflow<{ name: string; age: number }>().serial({
        name: 'buildGreeting',
        execute: async (ctx) => `Hello, ${ctx.data.name}! You are ${ctx.data.age} years old.`,
      });

      const result = await workflow.run({ name: 'Alice', age: 30 });

      expect(result.context.workResults.get('buildGreeting')?.result).toBe(
        'Hello, Alice! You are 30 years old.'
      );
    });
  });

  describe('parallel execution', () => {
    it('should execute parallel works concurrently', async () => {
      const startTime = Date.now();

      const workflow = new Workflow<{ multiplier: number }>().parallel([
        {
          name: 'task1',
          execute: async (ctx) => {
            await new Promise((r) => setTimeout(r, 50));
            return ctx.data.multiplier * 1;
          },
        },
        {
          name: 'task2',
          execute: async (ctx) => {
            await new Promise((r) => setTimeout(r, 50));
            return ctx.data.multiplier * 2;
          },
        },
        {
          name: 'task3',
          execute: async (ctx) => {
            await new Promise((r) => setTimeout(r, 50));
            return ctx.data.multiplier * 3;
          },
        },
      ]);

      const result = await workflow.run({ multiplier: 10 });
      const duration = Date.now() - startTime;

      expect(result.status).toBe('completed');
      expect(result.context.workResults.get('task1')?.result).toBe(10);
      expect(result.context.workResults.get('task2')?.result).toBe(20);
      expect(result.context.workResults.get('task3')?.result).toBe(30);
      // Should run in parallel, so total time should be ~50ms, not 150ms
      expect(duration).toBeLessThan(120);
    });

    it('should allow accessing parallel results in subsequent serial work', async () => {
      const workflow = new Workflow<{ base: number }>()
        .parallel([
          {
            name: 'add',
            execute: async (ctx) => ctx.data.base + 10,
          },
          {
            name: 'multiply',
            execute: async (ctx) => ctx.data.base * 10,
          },
        ])
        .serial({
          name: 'combine',
          execute: async (ctx) => {
            const addResult = ctx.workResults.get('add')!.result!;
            const multiplyResult = ctx.workResults.get('multiply')!.result!;
            return { sum: addResult, product: multiplyResult };
          },
        });

      const result = await workflow.run({ base: 5 });

      expect(result.context.workResults.get('combine')?.result).toEqual({
        sum: 15,
        product: 50,
      });
    });
  });

  describe('conditional execution (shouldRun)', () => {
    it('should skip work when shouldRun returns false', async () => {
      const executeFn = vi.fn().mockResolvedValue('executed');

      const workflow = new Workflow<{ skip: boolean }>().serial({
        name: 'conditional',
        shouldRun: (ctx) => !ctx.data.skip,
        execute: executeFn,
      });

      const result = await workflow.run({ skip: true });

      expect(result.status).toBe('completed');
      expect(executeFn).not.toHaveBeenCalled();
      expect(result.workResults.get('conditional')?.status).toBe('skipped');
      expect(result.context.workResults.get('conditional').status).toBe('skipped');
      expect(result.context.workResults.get('conditional').result).toBeUndefined();
    });

    it('should execute work when shouldRun returns true', async () => {
      const executeFn = vi.fn().mockResolvedValue('executed');

      const workflow = new Workflow<{ skip: boolean }>().serial({
        name: 'conditional',
        shouldRun: (ctx) => !ctx.data.skip,
        execute: executeFn,
      });

      const result = await workflow.run({ skip: false });

      expect(result.status).toBe('completed');
      expect(executeFn).toHaveBeenCalled();
      expect(result.workResults.get('conditional')?.status).toBe('completed');
    });

    it('should support async shouldRun', async () => {
      const workflow = new Workflow<{ shouldRun: boolean }>().serial({
        name: 'asyncConditional',
        shouldRun: async (ctx) => {
          await new Promise((r) => setTimeout(r, 10));
          return ctx.data.shouldRun;
        },
        execute: async () => 'result',
      });

      const skipResult = await workflow.run({ shouldRun: false });
      expect(skipResult.workResults.get('asyncConditional')?.status).toBe('skipped');

      const runResult = await workflow.run({ shouldRun: true });
      expect(runResult.workResults.get('asyncConditional')?.status).toBe('completed');
    });

    it('should skip parallel works individually based on shouldRun', async () => {
      const workflow = new Workflow<{ skipFirst: boolean }>().parallel([
        {
          name: 'first',
          shouldRun: (ctx) => !ctx.data.skipFirst,
          execute: async () => 'first result',
        },
        {
          name: 'second',
          execute: async () => 'second result',
        },
      ]);

      const result = await workflow.run({ skipFirst: true });

      expect(result.workResults.get('first')?.status).toBe('skipped');
      expect(result.workResults.get('second')?.status).toBe('completed');
      expect(result.context.workResults.get('second')?.result).toBe('second result');
    });
  });

  describe('error handling', () => {
    it('should mark workflow as failed when serial work throws', async () => {
      const workflow = new Workflow()
        .serial({
          name: 'willFail',
          execute: async () => {
            throw new Error('Something went wrong');
          },
        })
        .serial({
          name: 'shouldNotRun',
          execute: async () => 'should not reach here',
        });

      const result = await workflow.run({});

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('Something went wrong');
      expect(result.workResults.get('willFail')?.status).toBe('failed');
      expect(result.workResults.has('shouldNotRun')).toBe(false);
    });

    it('should call onError handler when work fails', async () => {
      const onErrorFn = vi.fn();

      const workflow = new Workflow<{ data: string }>().serial({
        name: 'failing',
        execute: async () => {
          throw new Error('Test error');
        },
        onError: onErrorFn,
      });

      await workflow.run({ data: 'test' });

      expect(onErrorFn).toHaveBeenCalledTimes(1);
      expect(onErrorFn).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ data: { data: 'test' } })
      );
    });

    it('should mark workflow as failed when parallel work throws', async () => {
      const workflow = new Workflow().parallel([
        {
          name: 'success',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 10));
            return 'success';
          },
        },
        {
          name: 'failure',
          execute: async () => {
            throw new Error('Parallel failure');
          },
        },
      ]);

      const result = await workflow.run({});

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('Parallel failure');
    });

    it('should call all onError handlers for failed parallel works', async () => {
      const onError1 = vi.fn();
      const onError2 = vi.fn();

      const workflow = new Workflow().parallel([
        {
          name: 'fail1',
          execute: async () => {
            throw new Error('Error 1');
          },
          onError: onError1,
        },
        {
          name: 'fail2',
          execute: async () => {
            throw new Error('Error 2');
          },
          onError: onError2,
        },
      ]);

      await workflow.run({});

      expect(onError1).toHaveBeenCalled();
      expect(onError2).toHaveBeenCalled();
    });

    it('should convert non-Error throws to Error objects', async () => {
      const workflow = new Workflow().serial({
        name: 'throwString',
        execute: async () => {
          throw 'string error';
        },
      });

      const result = await workflow.run({});

      expect(result.status).toBe('failed');
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('string error');
    });
  });

  describe('timing and duration', () => {
    it('should track total workflow duration', async () => {
      const workflow = new Workflow().serial({
        name: 'slow',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 50));
          return 'done';
        },
      });

      const result = await workflow.run({});

      // Allow small tolerance for timer resolution variance in CI
      expect(result.totalDuration).toBeGreaterThanOrEqual(45);
      expect(result.totalDuration).toBeLessThan(200);
    });

    it('should track individual work duration', async () => {
      const workflow = new Workflow().serial({
        name: 'timed',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 30));
          return 'done';
        },
      });

      const result = await workflow.run({});

      const workResult = result.workResults.get('timed');
      // Allow small tolerance for timer resolution variance in CI
      expect(workResult?.duration).toBeGreaterThanOrEqual(25);
      expect(workResult?.duration).toBeLessThan(150);
    });
  });

  describe('complex workflows', () => {
    it('should handle mixed serial and parallel works', async () => {
      const workflow = new Workflow<{ input: number }>()
        .serial({
          name: 'validate',
          execute: async (ctx) => ctx.data.input > 0,
        })
        .parallel([
          {
            name: 'double',
            execute: async (ctx) => ctx.data.input * 2,
          },
          {
            name: 'triple',
            execute: async (ctx) => ctx.data.input * 3,
          },
        ])
        .serial({
          name: 'sum',
          execute: async (ctx) => {
            const doubled = ctx.workResults.get('double')!.result!;
            const tripled = ctx.workResults.get('triple')!.result!;
            return doubled + tripled;
          },
        });

      const result = await workflow.run({ input: 10 });

      expect(result.status).toBe('completed');
      expect(result.context.workResults.get('validate')?.result).toBe(true);
      expect(result.context.workResults.get('double')?.result).toBe(20);
      expect(result.context.workResults.get('triple')?.result).toBe(30);
      expect(result.context.workResults.get('sum')?.result).toBe(50);
    });

    it('should support returning complex objects', async () => {
      interface User {
        id: string;
        name: string;
        email: string;
      }

      const workflow = new Workflow<{ userId: string }>().serial({
        name: 'fetchUser',
        execute: async (ctx): Promise<User> => ({
          id: ctx.data.userId,
          name: 'Test User',
          email: 'test@example.com',
        }),
      });

      const result = await workflow.run({ userId: 'user-123' });

      const user = result.context.workResults.get('fetchUser')?.result;
      expect(user).toEqual({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
      });
    });
  });

  describe('workResults map', () => {
    it('should correctly report has() for existing and non-existing keys', async () => {
      const workflow = new Workflow().serial({
        name: 'exists',
        execute: async () => 'value',
      });

      const result = await workflow.run({});

      expect(result.context.workResults.has('exists')).toBe(true);
      expect(result.context.workResults.has('notExists')).toBe(false);
    });

    it('should allow setting and getting results', async () => {
      const workflow = new Workflow()
        .serial({
          name: 'first',
          execute: async () => 'first value',
        })
        .serial({
          name: 'second',
          execute: async (ctx) => {
            // Manually set a value (must provide WorkResult)
            ctx.workResults.set('first', {
              status: 'completed',
              result: 'modified value',
              duration: 0,
            });
            return ctx.workResults.get('first')?.result;
          },
        });

      const result = await workflow.run({});

      expect(result.context.workResults.get('first')?.result).toBe('modified value');
      expect(result.context.workResults.get('second')?.result).toBe('modified value');
    });
  });

  describe('Work class', () => {
    it('should execute a serial work defined with Work class', async () => {
      const doubleWork = new Work({
        name: 'double',
        execute: async (ctx: { data: { value: number } }) => ctx.data.value * 2,
      });

      const workflow = new Workflow<{ value: number }>().serial(doubleWork);

      const result = await workflow.run({ value: 5 });

      expect(result.status).toBe('completed');
      expect(result.context.workResults.get('double')?.result).toBe(10);
    });

    it('should execute parallel works defined with Work class', async () => {
      const addWork = new Work({
        name: 'add',
        execute: async (ctx: { data: { base: number } }) => ctx.data.base + 10,
      });

      const multiplyWork = new Work({
        name: 'multiply',
        execute: async (ctx: { data: { base: number } }) => ctx.data.base * 10,
      });

      const workflow = new Workflow<{ base: number }>().parallel([addWork, multiplyWork]);

      const result = await workflow.run({ base: 5 });

      expect(result.status).toBe('completed');
      expect(result.context.workResults.get('add')?.result).toBe(15);
      expect(result.context.workResults.get('multiply')?.result).toBe(50);
    });

    it('should mix Work instances and inline definitions', async () => {
      const validateWork = new Work({
        name: 'validate',
        execute: async (ctx: { data: { input: number } }) => ctx.data.input > 0,
      });

      const workflow = new Workflow<{ input: number }>()
        .serial(validateWork)
        .parallel([
          new Work({
            name: 'double',
            execute: async (ctx) => ctx.data.input * 2,
          }),
          {
            name: 'triple',
            execute: async (ctx) => ctx.data.input * 3,
          },
        ])
        .serial({
          name: 'sum',
          execute: async (ctx) => {
            const doubled = ctx.workResults.get('double')!.result!;
            const tripled = ctx.workResults.get('triple')!.result!;
            return doubled + tripled;
          },
        });

      const result = await workflow.run({ input: 10 });

      expect(result.status).toBe('completed');
      expect(result.context.workResults.get('validate')?.result).toBe(true);
      expect(result.context.workResults.get('double')?.result).toBe(20);
      expect(result.context.workResults.get('triple')?.result).toBe(30);
      expect(result.context.workResults.get('sum')?.result).toBe(50);
    });

    it('should support shouldRun with Work class', async () => {
      const executeFn = vi.fn().mockResolvedValue('executed');

      const conditionalWork = new Work({
        name: 'conditional',
        shouldRun: (ctx: { data: { skip: boolean } }) => !ctx.data.skip,
        execute: executeFn,
      });

      const workflow = new Workflow<{ skip: boolean }>().serial(conditionalWork);

      const result = await workflow.run({ skip: true });

      expect(result.status).toBe('completed');
      expect(executeFn).not.toHaveBeenCalled();
      expect(result.workResults.get('conditional')?.status).toBe('skipped');
    });

    it('should support onError with Work class', async () => {
      const onErrorFn = vi.fn();

      const failingWork = new Work({
        name: 'failing',
        execute: async () => {
          throw new Error('Test error');
        },
        onError: onErrorFn,
      });

      const workflow = new Workflow<{ data: string }>().serial(failingWork);

      await workflow.run({ data: 'test' });

      expect(onErrorFn).toHaveBeenCalledTimes(1);
      expect(onErrorFn).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ data: { data: 'test' } })
      );
    });

    it('should allow reusing Work instances across multiple workflows', async () => {
      const sharedWork = new Work({
        name: 'shared',
        execute: async (ctx: { data: { value: number } }) => ctx.data.value * 2,
      });

      const workflow1 = new Workflow<{ value: number }>().serial(sharedWork);
      const workflow2 = new Workflow<{ value: number }>().serial(sharedWork);

      const result1 = await workflow1.run({ value: 5 });
      const result2 = await workflow2.run({ value: 10 });

      expect(result1.context.workResults.get('shared')?.result).toBe(10);
      expect(result2.context.workResults.get('shared')?.result).toBe(20);
    });
  });

  describe('silenceError', () => {
    it('should continue workflow when serial work with silenceError fails', async () => {
      const workflow = new Workflow<{ value: number }>()
        .serial({ name: 'first', execute: async (ctx) => ctx.data.value })
        .serial({
          name: 'failing',
          execute: async () => {
            throw new Error('Silent failure');
          },
          silenceError: true,
        })
        .serial({
          name: 'last',
          execute: async () => 'completed',
        });

      const result = await workflow.run({ value: 5 });

      expect(result.status).toBe('completed');
      expect(result.context.workResults.get('first')?.result).toBe(5);
      expect(result.context.workResults.get('failing')?.status).toBe('failed');
      expect(result.context.workResults.get('failing')?.error?.message).toBe('Silent failure');
      expect(result.context.workResults.get('last')?.result).toBe('completed');
    });

    it('should continue workflow when parallel work with silenceError fails', async () => {
      const workflow = new Workflow<{ value: number }>()
        .parallel([
          { name: 'success', execute: async (ctx) => ctx.data.value * 2 },
          {
            name: 'failing',
            execute: async () => {
              throw new Error('Silent parallel failure');
            },
            silenceError: true,
          },
        ])
        .serial({ name: 'last', execute: async () => 'completed' });

      const result = await workflow.run({ value: 5 });

      expect(result.status).toBe('completed');
      expect(result.context.workResults.get('success')?.result).toBe(10);
      expect(result.context.workResults.get('failing')?.status).toBe('failed');
      expect(result.context.workResults.get('failing')?.error?.message).toBe(
        'Silent parallel failure'
      );
      expect(result.context.workResults.get('last')?.result).toBe('completed');
    });

    it('should still fail workflow when non-silenced work fails alongside silenced one', async () => {
      const workflow = new Workflow<{ value: number }>().parallel([
        {
          name: 'silenced',
          execute: async () => {
            throw new Error('Silenced error');
          },
          silenceError: true,
        },
        {
          name: 'notSilenced',
          execute: async () => {
            throw new Error('Not silenced error');
          },
        },
      ]);

      const result = await workflow.run({ value: 5 });

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('Not silenced error');
    });

    it('should call onError even when silenceError is true', async () => {
      const onErrorFn = vi.fn();

      const workflow = new Workflow<{ value: number }>().serial({
        name: 'failing',
        execute: async () => {
          throw new Error('Error with handler');
        },
        silenceError: true,
        onError: onErrorFn,
      });

      const result = await workflow.run({ value: 5 });

      expect(result.status).toBe('completed');
      expect(onErrorFn).toHaveBeenCalledTimes(1);
      expect(onErrorFn).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));
    });

    it('should allow accessing silenced error in subsequent work', async () => {
      const workflow = new Workflow<{ value: number }>()
        .serial({
          name: 'failing',
          execute: async () => {
            throw new Error('Check me later');
          },
          silenceError: true,
        })
        .serial({
          name: 'checker',
          execute: async (ctx) => {
            const failedResult = ctx.workResults.get('failing');
            return {
              wasFailed: failedResult.status === 'failed',
              errorMessage: failedResult.error?.message,
            };
          },
        });

      const result = await workflow.run({ value: 5 });

      expect(result.status).toBe('completed');
      expect(result.context.workResults.get('checker')?.result).toEqual({
        wasFailed: true,
        errorMessage: 'Check me later',
      });
    });
  });

  describe('failFast option', () => {
    it('should stop on first error by default (failFast: true)', async () => {
      const executionOrder: string[] = [];

      const workflow = new Workflow<{ value: number }>()
        .serial({
          name: 'first',
          execute: async () => {
            executionOrder.push('first');
            return 'ok';
          },
        })
        .serial({
          name: 'failing',
          execute: async () => {
            executionOrder.push('failing');
            throw new Error('Stop here');
          },
        })
        .serial({
          name: 'never',
          execute: async () => {
            executionOrder.push('never');
            return 'should not run';
          },
        });

      const result = await workflow.run({ value: 5 });

      expect(result.status).toBe('failed');
      expect(executionOrder).toEqual(['first', 'failing']);
      expect(result.context.workResults.has('never')).toBe(false);
    });

    it('should continue execution when failFast: false', async () => {
      const executionOrder: string[] = [];

      const workflow = new Workflow<{ value: number }>({ failFast: false })
        .serial({
          name: 'first',
          execute: async () => {
            executionOrder.push('first');
            return 'ok';
          },
        })
        .serial({
          name: 'failing',
          execute: async () => {
            executionOrder.push('failing');
            throw new Error('Continue anyway');
          },
        })
        .serial({
          name: 'last',
          execute: async () => {
            executionOrder.push('last');
            return 'completed';
          },
        });

      const result = await workflow.run({ value: 5 });

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('Continue anyway');
      expect(executionOrder).toEqual(['first', 'failing', 'last']);
      expect(result.context.workResults.get('first')?.result).toBe('ok');
      expect(result.context.workResults.get('failing')?.status).toBe('failed');
      expect(result.context.workResults.get('last')?.result).toBe('completed');
    });

    it('should collect first error when multiple works fail with failFast: false', async () => {
      const workflow = new Workflow<{ value: number }>({ failFast: false })
        .serial({
          name: 'fail1',
          execute: async () => {
            throw new Error('First error');
          },
        })
        .serial({
          name: 'fail2',
          execute: async () => {
            throw new Error('Second error');
          },
        });

      const result = await workflow.run({ value: 5 });

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('First error');
      expect(result.context.workResults.get('fail1')?.status).toBe('failed');
      expect(result.context.workResults.get('fail2')?.status).toBe('failed');
    });

    it('should complete successfully if no errors with failFast: false', async () => {
      const workflow = new Workflow<{ value: number }>({ failFast: false })
        .serial({ name: 'work1', execute: async () => 'result1' })
        .serial({ name: 'work2', execute: async () => 'result2' });

      const result = await workflow.run({ value: 5 });

      expect(result.status).toBe('completed');
      expect(result.context.workResults.get('work1')?.result).toBe('result1');
      expect(result.context.workResults.get('work2')?.result).toBe('result2');
    });

    it('should work with parallel execution and failFast: false', async () => {
      const executionOrder: string[] = [];

      const workflow = new Workflow<{ value: number }>({ failFast: false })
        .parallel([
          {
            name: 'p1',
            execute: async () => {
              executionOrder.push('p1');
              throw new Error('Parallel error');
            },
          },
          {
            name: 'p2',
            execute: async () => {
              executionOrder.push('p2');
              return 'p2 done';
            },
          },
        ])
        .serial({
          name: 'after',
          execute: async () => {
            executionOrder.push('after');
            return 'after done';
          },
        });

      const result = await workflow.run({ value: 5 });

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('Parallel error');
      expect(executionOrder).toContain('p1');
      expect(executionOrder).toContain('p2');
      expect(executionOrder).toContain('after');
      expect(result.context.workResults.get('after')?.result).toBe('after done');
    });

    it('should combine failFast: false with work-level silenceError', async () => {
      const executionOrder: string[] = [];

      const workflow = new Workflow<{ value: number }>({ failFast: false })
        .serial({
          name: 'fail1',
          execute: async () => {
            executionOrder.push('fail1');
            throw new Error('Silenced');
          },
          silenceError: true,
        })
        .serial({
          name: 'fail2',
          execute: async () => {
            executionOrder.push('fail2');
            throw new Error('Also silenced');
          },
          silenceError: true,
        })
        .serial({
          name: 'last',
          execute: async () => {
            executionOrder.push('last');
            return 'done';
          },
        });

      const result = await workflow.run({ value: 5 });

      // silenceError on each work means errors are silenced, so workflow completes
      expect(result.status).toBe('completed');
      expect(executionOrder).toEqual(['fail1', 'fail2', 'last']);
    });
  });

  describe('seal', () => {
    it('should return a sealed workflow that can be executed', async () => {
      const sealed = new Workflow<{ value: number }>()
        .serial({
          name: 'double',
          execute: async (ctx) => ctx.data.value * 2,
        })
        .seal();

      const result = await sealed.run({ value: 5 });

      expect(result.status).toBe('completed');
      expect(result.context.workResults.get('double')?.result).toBe(10);
    });

    it('should preserve workflow type information in sealed workflow', async () => {
      const sealed = new Workflow<{ input: number }>()
        .serial({
          name: 'step1',
          execute: async (ctx) => ctx.data.input + 1,
        })
        .parallel([
          { name: 'double', execute: async (ctx) => ctx.data.input * 2 },
          { name: 'triple', execute: async (ctx) => ctx.data.input * 3 },
        ])
        .seal();

      const result = await sealed.run({ input: 10 });

      expect(result.status).toBe('completed');
      expect(result.context.workResults.get('step1')?.result).toBe(11);
      expect(result.context.workResults.get('double')?.result).toBe(20);
      expect(result.context.workResults.get('triple')?.result).toBe(30);
    });

    it('should return type assignable to ISealedWorkflow', () => {
      const sealed: ISealedWorkflow<{ value: number }, { double: number }> = new Workflow<{
        value: number;
      }>()
        .serial({
          name: 'double',
          execute: async (ctx) => ctx.data.value * 2,
        })
        .seal();

      // Type check: sealed should only have run method
      expect(typeof sealed.run).toBe('function');
    });

    it('should work with Work class instances', async () => {
      const doubleWork = new Work({
        name: 'double',
        execute: async (ctx: { data: { value: number } }) => ctx.data.value * 2,
      });

      const sealed = new Workflow<{ value: number }>().serial(doubleWork).seal();

      const result = await sealed.run({ value: 7 });

      expect(result.status).toBe('completed');
      expect(result.context.workResults.get('double')?.result).toBe(14);
    });

    it('should return true for isSealed() after sealing', () => {
      const workflow = new Workflow<{ value: number }>().serial({
        name: 'double',
        execute: async (ctx) => ctx.data.value * 2,
      });

      expect(workflow.isSealed()).toBe(false);

      const sealed = workflow.seal();

      expect(sealed.isSealed()).toBe(true);
      expect(workflow.isSealed()).toBe(true); // Same instance
    });

    it('should not have serial method on sealed workflow', () => {
      const workflow = new Workflow<{ value: number }>()
        .serial({
          name: 'first',
          execute: async (ctx) => ctx.data.value,
        })
        .seal();

      // @ts-expect-error - serial doesn't exist on ISealedWorkflow
      expect(workflow.serial).toBeUndefined();
    });

    it('should not have parallel method on sealed workflow', () => {
      const workflow = new Workflow<{ value: number }>()
        .serial({
          name: 'first',
          execute: async (ctx) => ctx.data.value,
        })
        .seal();

      // @ts-expect-error - parallel doesn't exist on ISealedWorkflow
      expect(workflow.parallel).toBeUndefined();
    });
  });
});
