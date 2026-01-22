import { describe, it, expect, vi } from 'vitest';
import { Workflow } from './workflow';
import { WorkflowStatus, WorkStatus } from './workflow.types';

describe('Workflow', () => {
  describe('serial execution', () => {
    it('should execute a single serial work', async () => {
      const workflow = new Workflow<{ value: number }>().serial({
        name: 'double',
        execute: async (ctx) => ctx.data.value * 2,
      });

      const result = await workflow.run({ value: 5 });

      expect(result.status).toBe(WorkflowStatus.COMPLETED);
      expect(result.context.workResults.get('double')).toBe(10);
      expect(result.workResults.get('double')?.status).toBe(WorkStatus.COMPLETED);
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
            const firstResult = ctx.workResults.get('first')!;
            return firstResult + 1;
          },
        })
        .serial({
          name: 'third',
          execute: async (ctx) => {
            executionOrder.push('third');
            const secondResult = ctx.workResults.get('second')!;
            return secondResult + 1;
          },
        });

      const result = await workflow.run({ value: 0 });

      expect(result.status).toBe(WorkflowStatus.COMPLETED);
      expect(executionOrder).toEqual(['first', 'second', 'third']);
      expect(result.context.workResults.get('first')).toBe(1);
      expect(result.context.workResults.get('second')).toBe(2);
      expect(result.context.workResults.get('third')).toBe(3);
    });

    it('should pass context data to serial works', async () => {
      const workflow = new Workflow<{ name: string; age: number }>().serial({
        name: 'createGreeting',
        execute: async (ctx) => `Hello, ${ctx.data.name}! You are ${ctx.data.age} years old.`,
      });

      const result = await workflow.run({ name: 'Alice', age: 30 });

      expect(result.context.workResults.get('createGreeting')).toBe(
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

      expect(result.status).toBe(WorkflowStatus.COMPLETED);
      expect(result.context.workResults.get('task1')).toBe(10);
      expect(result.context.workResults.get('task2')).toBe(20);
      expect(result.context.workResults.get('task3')).toBe(30);
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
            const addResult = ctx.workResults.get('add')!;
            const multiplyResult = ctx.workResults.get('multiply')!;
            return { sum: addResult, product: multiplyResult };
          },
        });

      const result = await workflow.run({ base: 5 });

      expect(result.context.workResults.get('combine')).toEqual({
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

      expect(result.status).toBe(WorkflowStatus.COMPLETED);
      expect(executeFn).not.toHaveBeenCalled();
      expect(result.workResults.get('conditional')?.status).toBe(WorkStatus.SKIPPED);
      expect(result.context.workResults.get('conditional')).toBeUndefined();
    });

    it('should execute work when shouldRun returns true', async () => {
      const executeFn = vi.fn().mockResolvedValue('executed');

      const workflow = new Workflow<{ skip: boolean }>().serial({
        name: 'conditional',
        shouldRun: (ctx) => !ctx.data.skip,
        execute: executeFn,
      });

      const result = await workflow.run({ skip: false });

      expect(result.status).toBe(WorkflowStatus.COMPLETED);
      expect(executeFn).toHaveBeenCalled();
      expect(result.workResults.get('conditional')?.status).toBe(WorkStatus.COMPLETED);
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
      expect(skipResult.workResults.get('asyncConditional')?.status).toBe(WorkStatus.SKIPPED);

      const runResult = await workflow.run({ shouldRun: true });
      expect(runResult.workResults.get('asyncConditional')?.status).toBe(WorkStatus.COMPLETED);
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

      expect(result.workResults.get('first')?.status).toBe(WorkStatus.SKIPPED);
      expect(result.workResults.get('second')?.status).toBe(WorkStatus.COMPLETED);
      expect(result.context.workResults.get('second')).toBe('second result');
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

      expect(result.status).toBe(WorkflowStatus.FAILED);
      expect(result.error?.message).toBe('Something went wrong');
      expect(result.workResults.get('willFail')?.status).toBe(WorkStatus.FAILED);
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

      expect(result.status).toBe(WorkflowStatus.FAILED);
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

      expect(result.status).toBe(WorkflowStatus.FAILED);
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
            const doubled = ctx.workResults.get('double')!;
            const tripled = ctx.workResults.get('triple')!;
            return doubled + tripled;
          },
        });

      const result = await workflow.run({ input: 10 });

      expect(result.status).toBe(WorkflowStatus.COMPLETED);
      expect(result.context.workResults.get('validate')).toBe(true);
      expect(result.context.workResults.get('double')).toBe(20);
      expect(result.context.workResults.get('triple')).toBe(30);
      expect(result.context.workResults.get('sum')).toBe(50);
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

      const user = result.context.workResults.get('fetchUser');
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(result.context.workResults.has('notExists' as any)).toBe(false);
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
            // Manually set a value
            ctx.workResults.set('first', 'modified value');
            return ctx.workResults.get('first');
          },
        });

      const result = await workflow.run({});

      expect(result.context.workResults.get('first')).toBe('modified value');
      expect(result.context.workResults.get('second')).toBe('modified value');
    });
  });
});
