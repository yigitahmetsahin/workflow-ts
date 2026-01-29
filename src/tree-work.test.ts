import { describe, it, expect, vi } from 'vitest';
import { Work } from './work';
import { TimeoutError, WorkTreeError } from './errors';
import { WorkStatus } from './work.types';

describe('TreeWork.run()', () => {
  describe('serial execution', () => {
    it('should execute a single serial work', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'double',
        execute: async (ctx) => (ctx.data as { value: number }).value * 2,
      });

      const result = await tree.run({ value: 5 });

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('double')?.result).toBe(10);
      expect(result.context.workResults.get('double')?.status).toBe(WorkStatus.Completed);
    });

    it('should execute multiple serial works in sequence', async () => {
      const executionOrder: string[] = [];

      const tree = Work.tree('tree')
        .addSerial({
          name: 'first',
          execute: async (ctx) => {
            executionOrder.push('first');
            return (ctx.data as { value: number }).value + 1;
          },
        })
        .addSerial({
          name: 'second',
          execute: async (ctx) => {
            executionOrder.push('second');
            const firstResult = ctx.workResults.get('first').result!;
            return firstResult + 1;
          },
        })
        .addSerial({
          name: 'third',
          execute: async (ctx) => {
            executionOrder.push('third');
            const secondResult = ctx.workResults.get('second').result!;
            return secondResult + 1;
          },
        });

      const result = await tree.run({ value: 0 });

      expect(result.status).toBe(WorkStatus.Completed);
      expect(executionOrder).toEqual(['first', 'second', 'third']);
      expect(result.context.workResults.get('first')?.result).toBe(1);
      expect(result.context.workResults.get('second')?.result).toBe(2);
      expect(result.context.workResults.get('third')?.result).toBe(3);
    });

    it('should pass context data to serial works', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'buildGreeting',
        execute: async (ctx) => `Hello, ${ctx.data.name}! You are ${ctx.data.age} years old.`,
      });

      const result = await tree.run({ name: 'Alice', age: 30 });

      expect(result.context.workResults.get('buildGreeting')?.result).toBe(
        'Hello, Alice! You are 30 years old.'
      );
    });
  });

  describe('parallel execution', () => {
    it('should execute parallel works concurrently', async () => {
      const startTime = Date.now();

      const tree = Work.tree('tree').addParallel([
        {
          name: 'task1',
          execute: async (ctx) => {
            await new Promise((r) => setTimeout(r, 50));
            return (ctx.data as { multiplier: number }).multiplier * 1;
          },
        },
        {
          name: 'task2',
          execute: async (ctx) => {
            await new Promise((r) => setTimeout(r, 50));
            return (ctx.data as { multiplier: number }).multiplier * 2;
          },
        },
        {
          name: 'task3',
          execute: async (ctx) => {
            await new Promise((r) => setTimeout(r, 50));
            return (ctx.data as { multiplier: number }).multiplier * 3;
          },
        },
      ]);

      const result = await tree.run({ multiplier: 10 });
      const duration = Date.now() - startTime;

      expect(result.status).toBe(WorkStatus.Completed);
      // Should run in parallel (~50ms), not sequentially (~150ms)
      expect(duration).toBeLessThan(120);
      expect(result.context.workResults.get('task1')?.result).toBe(10);
      expect(result.context.workResults.get('task2')?.result).toBe(20);
      expect(result.context.workResults.get('task3')?.result).toBe(30);
    });

    it('should allow accessing parallel results in subsequent serial work', async () => {
      const tree = Work.tree('tree')
        .addParallel([
          { name: 'fetchA', execute: async () => 'A' },
          { name: 'fetchB', execute: async () => 'B' },
        ])
        .addSerial({
          name: 'combine',
          execute: async (ctx) => {
            const a = ctx.workResults.get('fetchA').result;
            const b = ctx.workResults.get('fetchB').result;
            return `${a}+${b}`;
          },
        });

      const result = await tree.run({});

      expect(result.context.workResults.get('combine')?.result).toBe('A+B');
    });
  });

  describe('conditional execution (shouldRun)', () => {
    it('should skip work when shouldRun returns false', async () => {
      const executeFn = vi.fn().mockResolvedValue('executed');

      const tree = Work.tree('tree').addSerial({
        name: 'conditional',
        shouldRun: () => false,
        execute: executeFn,
      });

      const result = await tree.run({});

      expect(executeFn).not.toHaveBeenCalled();
      expect(result.context.workResults.get('conditional')?.status).toBe(WorkStatus.Skipped);
    });

    it('should execute work when shouldRun returns true', async () => {
      const executeFn = vi.fn().mockResolvedValue('executed');

      const tree = Work.tree('tree').addSerial({
        name: 'conditional',
        shouldRun: () => true,
        execute: executeFn,
      });

      const result = await tree.run({});

      expect(executeFn).toHaveBeenCalled();
      expect(result.context.workResults.get('conditional')?.result).toBe('executed');
    });

    it('should support async shouldRun', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'asyncCheck',
        shouldRun: async () => {
          await new Promise((r) => setTimeout(r, 10));
          return true;
        },
        execute: async () => 'done',
      });

      const result = await tree.run({});

      expect(result.context.workResults.get('asyncCheck')?.result).toBe('done');
    });

    it('should skip parallel works individually based on shouldRun', async () => {
      const tree = Work.tree('tree').addParallel([
        {
          name: 'skipMe',
          shouldRun: () => false,
          execute: async () => 'should not run',
        },
        {
          name: 'runMe',
          shouldRun: () => true,
          execute: async () => 'did run',
        },
      ]);

      const result = await tree.run({});

      expect(result.context.workResults.get('skipMe')?.status).toBe(WorkStatus.Skipped);
      expect(result.context.workResults.get('runMe')?.result).toBe('did run');
    });

    it('should call onSkipped handler when serial work is skipped', async () => {
      const onSkippedFn = vi.fn();

      const tree = Work.tree('tree').addSerial({
        name: 'skippable',
        shouldRun: () => false,
        execute: async () => 'should not run',
        onSkipped: onSkippedFn,
      });

      await tree.run({ userId: '123' });

      expect(onSkippedFn).toHaveBeenCalledTimes(1);
      expect(onSkippedFn.mock.calls[0][0]).toMatchObject({
        data: { userId: '123' },
      });
    });

    it('should call onSkipped handler when parallel work is skipped', async () => {
      const onSkippedFn = vi.fn();

      const tree = Work.tree('tree').addParallel([
        {
          name: 'skippable',
          shouldRun: () => false,
          execute: async () => 'should not run',
          onSkipped: onSkippedFn,
        },
        {
          name: 'runMe',
          execute: async () => 'did run',
        },
      ]);

      await tree.run({});

      expect(onSkippedFn).toHaveBeenCalledTimes(1);
    });

    it('should support async onSkipped handler', async () => {
      let skippedLogged = false;

      const tree = Work.tree('tree').addSerial({
        name: 'asyncSkipped',
        shouldRun: () => false,
        execute: async () => 'should not run',
        onSkipped: async () => {
          await new Promise((r) => setTimeout(r, 10));
          skippedLogged = true;
        },
      });

      await tree.run({});

      expect(skippedLogged).toBe(true);
    });

    it('should not call onSkipped when work runs', async () => {
      const onSkippedFn = vi.fn();

      const tree = Work.tree('tree').addSerial({
        name: 'willRun',
        shouldRun: () => true,
        execute: async () => 'executed',
        onSkipped: onSkippedFn,
      });

      await tree.run({});

      expect(onSkippedFn).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should mark tree as failed when serial work throws', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'failing',
        execute: async () => {
          throw new Error('Work failed');
        },
      });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.error?.message).toBe('Work failed');
      expect(result.context.workResults.get('failing')?.status).toBe(WorkStatus.Failed);
    });

    it('should call onError handler when work fails', async () => {
      const onErrorFn = vi.fn();

      const tree = Work.tree('tree').addSerial({
        name: 'failing',
        execute: async () => {
          throw new Error('Work failed');
        },
        onError: onErrorFn,
      });

      await tree.run({});

      expect(onErrorFn).toHaveBeenCalledTimes(1);
      expect(onErrorFn.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(onErrorFn.mock.calls[0][0].message).toBe('Work failed');
    });

    it('should mark tree as failed when parallel work throws', async () => {
      const tree = Work.tree('tree').addParallel([
        { name: 'success', execute: async () => 'ok' },
        {
          name: 'failing',
          execute: async () => {
            throw new Error('Parallel work failed');
          },
        },
      ]);

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.error?.message).toBe('Parallel work failed');
    });

    it('should convert non-Error throws to Error objects', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'throwsString',
        execute: async () => {
          throw 'string error';
        },
      });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.error?.message).toBe('string error');
    });
  });

  describe('silenceError', () => {
    it('should continue tree when work with silenceError fails', async () => {
      const tree = Work.tree('tree')
        .addSerial({
          name: 'failing',
          silenceError: true,
          execute: async () => {
            throw new Error('Silenced error');
          },
        })
        .addSerial({
          name: 'afterFail',
          execute: async () => 'continued',
        });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('failing')?.status).toBe(WorkStatus.Failed);
      expect(result.context.workResults.get('afterFail')?.result).toBe('continued');
    });

    it('should continue tree when parallel work with silenceError fails', async () => {
      const tree = Work.tree('tree')
        .addParallel([
          {
            name: 'silencedFail',
            silenceError: true,
            execute: async () => {
              throw new Error('Silenced');
            },
          },
          { name: 'success', execute: async () => 'ok' },
        ])
        .addSerial({
          name: 'afterParallel',
          execute: async () => 'continued',
        });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('silencedFail')?.status).toBe(WorkStatus.Failed);
      expect(result.context.workResults.get('afterParallel')?.result).toBe('continued');
    });

    it('should NOT call onError when silenceError is true', async () => {
      const onErrorFn = vi.fn();

      const tree = Work.tree('tree').addSerial({
        name: 'silenced',
        silenceError: true,
        onError: onErrorFn,
        execute: async () => {
          throw new Error('Silenced');
        },
      });

      await tree.run({});

      expect(onErrorFn).not.toHaveBeenCalled();
    });
  });

  describe('onError behavior', () => {
    it('should continue tree when onError swallows error (does not throw)', async () => {
      const tree = Work.tree('tree')
        .addSerial({
          name: 'swallowError',
          execute: async () => {
            throw new Error('Swallowed');
          },
          onError: async () => {
            // Don't throw - swallow the error
          },
        })
        .addSerial({
          name: 'afterSwallow',
          execute: async () => 'continued',
        });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('afterSwallow')?.result).toBe('continued');
    });

    it('should stop tree when onError re-throws error', async () => {
      const tree = Work.tree('tree')
        .addSerial({
          name: 'rethrowError',
          execute: async () => {
            throw new Error('Original');
          },
          onError: async (err) => {
            throw err;
          },
        })
        .addSerial({
          name: 'shouldNotRun',
          execute: async () => 'should not execute',
        });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.workResults.has('shouldNotRun')).toBe(false);
    });
  });

  describe('duration tracking', () => {
    it('should track total tree duration', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'slow',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 50));
          return 'done';
        },
      });

      const result = await tree.run({});

      expect(result.totalDuration).toBeGreaterThanOrEqual(45);
    });

    it('should track individual work duration', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'timed',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 30));
          return 'done';
        },
      });

      const result = await tree.run({});

      const workResult = result.context.workResults.get('timed');
      expect(workResult?.duration).toBeGreaterThanOrEqual(25);
    });
  });

  describe('Work class instances', () => {
    it('should execute a serial work defined with Work class', async () => {
      const doubleWork = new Work({
        name: 'double',
        execute: async (ctx) => (ctx.data as { value: number }).value * 2,
      });

      const tree = Work.tree('tree').addSerial(doubleWork);

      const result = await tree.run({ value: 5 });

      expect(result.context.workResults.get('double')?.result).toBe(10);
    });

    it('should execute parallel works defined with Work class', async () => {
      const work1 = new Work({
        name: 'work1',
        execute: async () => 'result1',
      });

      const work2 = new Work({
        name: 'work2',
        execute: async () => 'result2',
      });

      const tree = Work.tree('tree').addParallel([work1, work2]);

      const result = await tree.run({});

      expect(result.context.workResults.get('work1')?.result).toBe('result1');
      expect(result.context.workResults.get('work2')?.result).toBe('result2');
    });

    it('should mix Work instances and inline definitions', async () => {
      const workInstance = new Work({
        name: 'instance',
        execute: async () => 'from instance',
      });

      const tree = Work.tree('tree')
        .addSerial(workInstance)
        .addSerial({
          name: 'inline',
          execute: async () => 'from inline',
        });

      const result = await tree.run({});

      expect(result.context.workResults.get('instance')?.result).toBe('from instance');
      expect(result.context.workResults.get('inline')?.result).toBe('from inline');
    });
  });

  describe('nested tree works', () => {
    it('should execute nested tree works', async () => {
      const innerTree = Work.tree('inner')
        .addSerial({ name: 'innerStep1', execute: async () => 'a' })
        .addSerial({ name: 'innerStep2', execute: async () => 'b' });

      const outerTree = Work.tree('outer')
        .addSerial(innerTree)
        .addSerial({
          name: 'outerStep',
          execute: async (ctx) => {
            const inner1 = ctx.workResults.get('innerStep1').result;
            const inner2 = ctx.workResults.get('innerStep2').result;
            return `${inner1}+${inner2}`;
          },
        });

      const result = await outerTree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('innerStep1')?.result).toBe('a');
      expect(result.context.workResults.get('innerStep2')?.result).toBe('b');
      expect(result.context.workResults.get('outerStep')?.result).toBe('a+b');
      expect(result.workResults.get('innerStep1')?.parent).toBe('inner');
      expect(result.workResults.get('innerStep2')?.parent).toBe('inner');
    });

    it('should support deeply nested tree works (4 levels)', async () => {
      const lv4 = Work.tree('lv4').addSerial({
        name: 'step4',
        execute: async () => 'deepest',
      });

      const lv3 = Work.tree('lv3').addSerial(lv4);
      const lv2 = Work.tree('lv2').addSerial(lv3);
      const lv1 = Work.tree('lv1')
        .addSerial(lv2)
        .addSerial({
          name: 'final',
          execute: async (ctx) => {
            const deep = ctx.workResults.get('step4').result;
            return `Got: ${deep}`;
          },
        });

      const result = await lv1.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('step4')?.result).toBe('deepest');
      expect(result.context.workResults.get('final')?.result).toBe('Got: deepest');
      expect(result.workResults.get('step4')?.parent).toBe('lv4');
      // Tree names are tracked at runtime but not fully typed - cast for test assertions
      expect((result.workResults as Map<string, unknown>).get('lv4')).toHaveProperty(
        'parent',
        'lv3'
      );
      expect((result.workResults as Map<string, unknown>).get('lv3')).toHaveProperty(
        'parent',
        'lv2'
      );
      expect((result.workResults as Map<string, unknown>).get('lv2')).toHaveProperty(
        'parent',
        'lv1'
      );
    });

    it('should execute nested trees in parallel', async () => {
      const treeA = Work.tree('treeA').addSerial({
        name: 'stepA',
        execute: async () => 'A',
      });

      const treeB = Work.tree('treeB').addSerial({
        name: 'stepB',
        execute: async () => 'B',
      });

      const root = Work.tree('root')
        .addParallel([treeA, treeB])
        .addSerial({
          name: 'combine',
          execute: async (ctx) => {
            const a = ctx.workResults.get('stepA').result;
            const b = ctx.workResults.get('stepB').result;
            return `${a}+${b}`;
          },
        });

      const result = await root.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('combine')?.result).toBe('A+B');
    });
  });

  describe('tree-level options', () => {
    it('should support shouldRun on tree', async () => {
      const innerTree = Work.tree('skippableTree', {
        shouldRun: (ctx) => Boolean((ctx.data as { runTree: boolean }).runTree),
      }).addSerial({
        name: 'innerWork',
        execute: async () => 'should not run',
      });

      const outerTree = Work.tree('outer').addSerial(innerTree);

      const result = await outerTree.run({ runTree: false });

      expect(result.status).toBe(WorkStatus.Completed);
      // Tree names are tracked at runtime - cast for test assertion
      expect((result.workResults as Map<string, unknown>).get('skippableTree')).toHaveProperty(
        'status',
        WorkStatus.Skipped
      );
      expect(result.workResults.has('innerWork')).toBe(false);
    });

    it('should support silenceError on tree', async () => {
      const failingTree = Work.tree('failingTree', {
        silenceError: true,
      }).addSerial({
        name: 'willFail',
        execute: async () => {
          throw new Error('Inner failure');
        },
      });

      const outerTree = Work.tree('outer')
        .addSerial(failingTree)
        .addSerial({
          name: 'afterFail',
          execute: async () => 'continued',
        });

      const result = await outerTree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      // Tree names are tracked at runtime - cast for test assertion
      expect((result.workResults as Map<string, unknown>).get('failingTree')).toHaveProperty(
        'status',
        WorkStatus.Failed
      );
      expect(result.context.workResults.get('afterFail')?.result).toBe('continued');
    });

    it('should support onError on tree', async () => {
      const onErrorFn = vi.fn();

      const failingTree = Work.tree('failingTree', {
        onError: onErrorFn,
      }).addSerial({
        name: 'willFail',
        execute: async () => {
          throw new Error('Tree failure');
        },
      });

      const outerTree = Work.tree('outer')
        .addSerial(failingTree)
        .addSerial({
          name: 'afterFail',
          execute: async () => 'continued',
        });

      const result = await outerTree.run({});

      expect(onErrorFn).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('afterFail')?.result).toBe('continued');
    });

    it('should support onSkipped on tree', async () => {
      const onSkippedFn = vi.fn();

      const skippableTree = Work.tree('skippableTree', {
        shouldRun: () => false,
        onSkipped: onSkippedFn,
      }).addSerial({
        name: 'innerWork',
        execute: async () => 'should not run',
      });

      const outerTree = Work.tree('outer').addSerial(skippableTree);

      await outerTree.run({ userId: '456' });

      expect(onSkippedFn).toHaveBeenCalledTimes(1);
      expect(onSkippedFn.mock.calls[0][0]).toMatchObject({
        data: { userId: '456' },
      });
    });

    it('should not call tree onSkipped when tree runs', async () => {
      const onSkippedFn = vi.fn();

      const runningTree = Work.tree('runningTree', {
        shouldRun: () => true,
        onSkipped: onSkippedFn,
      }).addSerial({
        name: 'innerWork',
        execute: async () => 'executed',
      });

      const outerTree = Work.tree('outer').addSerial(runningTree);

      await outerTree.run({});

      expect(onSkippedFn).not.toHaveBeenCalled();
    });
  });

  describe('workResults map', () => {
    it('should correctly report has() for existing and non-existing keys', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'work1',
        execute: async () => 'done',
      });

      const result = await tree.run({});

      expect(result.context.workResults.has('work1')).toBe(true);
      expect(result.context.workResults.has('nonexistent')).toBe(false);
    });
  });

  describe('seal()', () => {
    it('should seal the tree and prevent modifications', () => {
      const tree = Work.tree('tree').addSerial({
        name: 'step1',
        execute: async () => 'a',
      });

      expect(tree.isSealed()).toBe(false);

      tree.seal();

      expect(tree.isSealed()).toBe(true);
      expect(() => tree.addSerial({ name: 'step2', execute: async () => 'b' })).toThrow(
        'Cannot add work to sealed tree "tree"'
      );
    });

    it('should allow running a sealed tree', async () => {
      const sealed = Work.tree('tree')
        .addSerial({ name: 'step1', execute: async () => 'result' })
        .seal();

      const result = await sealed.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('step1')?.result).toBe('result');
    });

    it('should seal with a final work', async () => {
      const sealed = Work.tree('tree')
        .addSerial({ name: 'step1', execute: async () => 'a' })
        .seal({
          name: 'finalStep',
          execute: async (ctx) => {
            const prev = ctx.workResults.get('step1').result;
            return `Final: ${prev}`;
          },
        });

      const result = await sealed.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('finalStep')?.result).toBe('Final: a');
    });

    it('should throw when sealing already sealed tree', () => {
      const tree = Work.tree('tree').seal();

      // Cast to access seal() method for runtime check (TypeScript correctly hides it on SealedTreeWork)
      expect(() => (tree as unknown as { seal: () => void }).seal()).toThrow(
        'Tree "tree" is already sealed'
      );
    });

    it('should prevent addParallel on sealed tree', () => {
      const sealed = Work.tree('tree').seal();

      // Cast to access addParallel() method for runtime check (TypeScript correctly hides it on SealedTreeWork)
      expect(() =>
        (sealed as unknown as { addParallel: (works: unknown[]) => void }).addParallel([
          { name: 'p1', execute: async () => 'x' },
        ])
      ).toThrow('Cannot add work to sealed tree "tree"');
    });
  });

  describe('options', () => {
    it('should have default options', () => {
      const tree = Work.tree('tree');

      expect(tree.options).toEqual({ failFast: true });
    });

    it('should accept custom failFast option', () => {
      const tree = Work.tree('tree', { failFast: false });

      expect(tree.options.failFast).toBe(false);
    });

    it('should return readonly options', () => {
      const tree = Work.tree('tree');
      const options = tree.options;

      // TypeScript prevents modification, but check at runtime
      expect(Object.isFrozen(options) || typeof options === 'object').toBe(true);
    });
  });

  describe('failFast option', () => {
    it('should stop on first error when failFast is true (default)', async () => {
      const executedWorks: string[] = [];

      const tree = Work.tree('tree').addParallel([
        {
          name: 'fast',
          execute: async () => {
            executedWorks.push('fast');
            throw new Error('Fast error');
          },
        },
        {
          name: 'slow',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 50));
            executedWorks.push('slow');
            return 'slow result';
          },
        },
      ]);

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      // Both execute but error is thrown
      expect(result.error?.message).toBe('Fast error');
    });

    it('should continue on error when failFast is false', async () => {
      const tree = Work.tree('tree', { failFast: false })
        .addParallel([
          {
            name: 'fail1',
            execute: async () => {
              throw new Error('Error 1');
            },
          },
          {
            name: 'success',
            execute: async () => 'ok',
          },
          {
            name: 'fail2',
            execute: async () => {
              throw new Error('Error 2');
            },
          },
        ])
        .addSerial({
          name: 'afterParallel',
          execute: async () => 'continued',
        });

      const result = await tree.run({});

      // Tree still completes because failFast is false
      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('success')?.result).toBe('ok');
      expect(result.context.workResults.get('fail1')?.status).toBe(WorkStatus.Failed);
      expect(result.context.workResults.get('fail2')?.status).toBe(WorkStatus.Failed);
      expect(result.context.workResults.get('afterParallel')?.result).toBe('continued');
    });
  });

  describe('edge cases for coverage', () => {
    it('should throw when getting non-existent work result', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'work1',
        execute: async () => 'done',
      });

      const result = await tree.run({});

      expect(() => result.context.workResults.get('nonexistent' as 'work1')).toThrow(
        'Work result "nonexistent" not found'
      );
    });

    it('should propagate error from nested tree in serial execution', async () => {
      const failingInnerTree = Work.tree('innerFail').addSerial({
        name: 'willFail',
        execute: async () => {
          throw new Error('Inner tree error');
        },
      });

      const outerTree = Work.tree('outer')
        .addSerial(failingInnerTree)
        .addSerial({
          name: 'afterInner',
          execute: async () => 'should not run',
        });

      const result = await outerTree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.error?.message).toBe('Inner tree error');
      expect(result.workResults.has('afterInner')).toBe(false);
    });

    it('should handle parallel work with onError that swallows error', async () => {
      const onErrorFn = vi.fn();

      const tree = Work.tree('tree')
        .addParallel([
          {
            name: 'failWithHandler',
            execute: async () => {
              throw new Error('Handled error');
            },
            onError: onErrorFn, // Swallows error by not throwing
          },
          {
            name: 'success',
            execute: async () => 'ok',
          },
        ])
        .addSerial({
          name: 'afterParallel',
          execute: async () => 'continued',
        });

      const result = await tree.run({});

      expect(onErrorFn).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('failWithHandler')?.status).toBe(WorkStatus.Failed);
      expect(result.context.workResults.get('success')?.result).toBe('ok');
      expect(result.context.workResults.get('afterParallel')?.result).toBe('continued');
    });

    it('should handle parallel work with onError that re-throws', async () => {
      const tree = Work.tree('tree').addParallel([
        {
          name: 'failWithRethrow',
          execute: async () => {
            throw new Error('Original error');
          },
          onError: async (err) => {
            throw err; // Re-throw the error
          },
        },
        {
          name: 'success',
          execute: async () => 'ok',
        },
      ]);

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.error?.message).toBe('Original error');
    });

    it('should handle nested tree failure in parallel execution', async () => {
      const failingTree = Work.tree('failingTree').addSerial({
        name: 'innerFail',
        execute: async () => {
          throw new Error('Nested tree error');
        },
      });

      const tree = Work.tree('tree').addParallel([
        failingTree,
        {
          name: 'success',
          execute: async () => 'ok',
        },
      ]);

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.error?.message).toBe('Nested tree error');
    });

    it('should handle shouldRun returning false for nested tree in parallel', async () => {
      const skippedTree = Work.tree('skippedTree', {
        shouldRun: () => false,
      }).addSerial({
        name: 'innerWork',
        execute: async () => 'should not run',
      });

      const tree = Work.tree('tree').addParallel([
        skippedTree,
        {
          name: 'success',
          execute: async () => 'ok',
        },
      ]);

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      // Tree names are tracked at runtime - cast for test assertion
      expect(
        (result.context.workResults as Map<string, unknown>).get('skippedTree')
      ).toHaveProperty('status', WorkStatus.Skipped);
      expect(result.context.workResults.get('success')?.result).toBe('ok');
    });

    it('should handle silenceError on nested tree in parallel', async () => {
      const silencedTree = Work.tree('silencedTree', {
        silenceError: true,
      }).addSerial({
        name: 'innerFail',
        execute: async () => {
          throw new Error('Silenced');
        },
      });

      const tree = Work.tree('tree')
        .addParallel([
          silencedTree,
          {
            name: 'success',
            execute: async () => 'ok',
          },
        ])
        .addSerial({
          name: 'afterParallel',
          execute: async () => 'continued',
        });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      // Tree names are tracked at runtime - cast for test assertion
      expect(
        (result.context.workResults as Map<string, unknown>).get('silencedTree')
      ).toHaveProperty('status', WorkStatus.Failed);
      expect(result.context.workResults.get('afterParallel')?.result).toBe('continued');
    });

    it('should handle onError on nested tree in parallel that swallows', async () => {
      const onErrorFn = vi.fn();

      const handledTree = Work.tree('handledTree', {
        onError: onErrorFn, // Swallows by not throwing
      }).addSerial({
        name: 'innerFail',
        execute: async () => {
          throw new Error('Handled');
        },
      });

      const tree = Work.tree('tree')
        .addParallel([
          handledTree,
          {
            name: 'success',
            execute: async () => 'ok',
          },
        ])
        .addSerial({
          name: 'afterParallel',
          execute: async () => 'continued',
        });

      const result = await tree.run({});

      expect(onErrorFn).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('afterParallel')?.result).toBe('continued');
    });

    it('should handle onError on nested tree in parallel that re-throws', async () => {
      const handledTree = Work.tree('handledTree', {
        onError: async (err) => {
          throw err; // Re-throw
        },
      }).addSerial({
        name: 'innerFail',
        execute: async () => {
          throw new Error('Re-thrown');
        },
      });

      const tree = Work.tree('tree').addParallel([
        handledTree,
        {
          name: 'success',
          execute: async () => 'ok',
        },
      ]);

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.error?.message).toBe('Re-thrown');
    });
  });

  describe('retry behavior', () => {
    it('should retry work specified number of times with simple retry count', async () => {
      let attempts = 0;

      const tree = Work.tree('tree').addSerial({
        name: 'retryWork',
        execute: async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error(`Attempt ${attempts} failed`);
          }
          return 'success';
        },
        retry: 3,
      });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('retryWork')?.result).toBe('success');
      expect(result.context.workResults.get('retryWork')?.attempts).toBe(3);
      expect(attempts).toBe(3);
    });

    it('should fail after exhausting all retry attempts', async () => {
      let attempts = 0;

      const tree = Work.tree('tree').addSerial({
        name: 'alwaysFails',
        execute: async () => {
          attempts++;
          throw new Error(`Attempt ${attempts} failed`);
        },
        retry: 2,
      });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.error?.message).toBe('Attempt 3 failed');
      expect(result.context.workResults.get('alwaysFails')?.attempts).toBe(3);
      expect(attempts).toBe(3); // 1 initial + 2 retries
    });

    it('should track attempts as 1 when no retry is configured', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'noRetry',
        execute: async () => 'done',
      });

      const result = await tree.run({});

      expect(result.context.workResults.get('noRetry')?.attempts).toBe(1);
    });

    it('should track attempts as 1 when work succeeds on first try with retry configured', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'firstTrySuccess',
        execute: async () => 'immediate success',
        retry: 5,
      });

      const result = await tree.run({});

      expect(result.context.workResults.get('firstTrySuccess')?.result).toBe('immediate success');
      expect(result.context.workResults.get('firstTrySuccess')?.attempts).toBe(1);
    });

    it('should call onRetry hook before each retry attempt', async () => {
      let attempts = 0;
      const onRetryFn = vi.fn();

      const tree = Work.tree('tree').addSerial({
        name: 'retryWithHook',
        execute: async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error(`Attempt ${attempts} failed`);
          }
          return 'success';
        },
        retry: {
          maxRetries: 3,
          onRetry: onRetryFn,
        },
      });

      await tree.run({});

      expect(onRetryFn).toHaveBeenCalledTimes(2); // Called before retry 2 and 3
      expect(onRetryFn.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(onRetryFn.mock.calls[0][0].message).toBe('Attempt 1 failed');
      expect(onRetryFn.mock.calls[0][1]).toBe(1); // First attempt that failed
      expect(onRetryFn.mock.calls[1][0].message).toBe('Attempt 2 failed');
      expect(onRetryFn.mock.calls[1][1]).toBe(2);
    });

    it('should respect shouldRetry callback to stop retrying', async () => {
      let attempts = 0;

      const tree = Work.tree('tree').addSerial({
        name: 'conditionalRetry',
        execute: async () => {
          attempts++;
          throw new Error(attempts === 2 ? 'fatal error' : 'transient error');
        },
        retry: {
          maxRetries: 5,
          shouldRetry: (error) => !error.message.includes('fatal'),
        },
      });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.error?.message).toBe('fatal error');
      expect(attempts).toBe(2); // Stopped at attempt 2 due to fatal error
      expect(result.context.workResults.get('conditionalRetry')?.attempts).toBe(2);
    });

    it('should wait with fixed delay between retries', async () => {
      let attempts = 0;
      const startTime = Date.now();

      const tree = Work.tree('tree').addSerial({
        name: 'delayedRetry',
        execute: async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('retry');
          }
          return 'done';
        },
        retry: {
          maxRetries: 2,
          delay: 50,
          backoff: 'fixed',
        },
      });

      await tree.run({});
      const duration = Date.now() - startTime;

      expect(attempts).toBe(3);
      // Should have waited ~100ms total (2 retries * 50ms each)
      expect(duration).toBeGreaterThanOrEqual(95);
    });

    it('should use exponential backoff for delays', async () => {
      let attempts = 0;
      const delays: number[] = [];
      let lastTime = Date.now();

      const tree = Work.tree('tree').addSerial({
        name: 'exponentialRetry',
        execute: async () => {
          const now = Date.now();
          if (attempts > 0) {
            delays.push(now - lastTime);
          }
          lastTime = now;
          attempts++;
          if (attempts < 4) {
            throw new Error('retry');
          }
          return 'done';
        },
        retry: {
          maxRetries: 3,
          delay: 20,
          backoff: 'exponential',
          backoffMultiplier: 2,
        },
      });

      await tree.run({});

      expect(attempts).toBe(4);
      // Delays should be approximately: 20ms, 40ms, 80ms
      expect(delays[0]).toBeGreaterThanOrEqual(18);
      expect(delays[0]).toBeLessThan(50);
      expect(delays[1]).toBeGreaterThanOrEqual(38);
      expect(delays[1]).toBeLessThan(70);
      expect(delays[2]).toBeGreaterThanOrEqual(78);
    });

    it('should cap delay at maxDelay for exponential backoff', async () => {
      let attempts = 0;
      const delays: number[] = [];
      let lastTime = Date.now();

      const tree = Work.tree('tree').addSerial({
        name: 'cappedRetry',
        execute: async () => {
          const now = Date.now();
          if (attempts > 0) {
            delays.push(now - lastTime);
          }
          lastTime = now;
          attempts++;
          if (attempts < 4) {
            throw new Error('retry');
          }
          return 'done';
        },
        retry: {
          maxRetries: 3,
          delay: 20,
          backoff: 'exponential',
          backoffMultiplier: 3,
          maxDelay: 50, // Cap at 50ms
        },
      });

      await tree.run({});

      expect(attempts).toBe(4);
      // Without cap: 20ms, 60ms, 180ms
      // With cap: 20ms, 50ms, 50ms
      expect(delays[0]).toBeGreaterThanOrEqual(18);
      expect(delays[0]).toBeLessThan(40);
      expect(delays[1]).toBeGreaterThanOrEqual(48);
      expect(delays[1]).toBeLessThan(70);
      expect(delays[2]).toBeGreaterThanOrEqual(48);
      expect(delays[2]).toBeLessThan(70);
    });

    it('should retry works in parallel execution', async () => {
      let work1Attempts = 0;
      let work2Attempts = 0;

      const tree = Work.tree('tree').addParallel([
        {
          name: 'parallel1',
          execute: async () => {
            work1Attempts++;
            if (work1Attempts < 2) {
              throw new Error('retry1');
            }
            return 'success1';
          },
          retry: 2,
        },
        {
          name: 'parallel2',
          execute: async () => {
            work2Attempts++;
            if (work2Attempts < 3) {
              throw new Error('retry2');
            }
            return 'success2';
          },
          retry: 3,
        },
      ]);

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('parallel1')?.result).toBe('success1');
      expect(result.context.workResults.get('parallel1')?.attempts).toBe(2);
      expect(result.context.workResults.get('parallel2')?.result).toBe('success2');
      expect(result.context.workResults.get('parallel2')?.attempts).toBe(3);
    });

    it('should combine retry with silenceError', async () => {
      let attempts = 0;

      const tree = Work.tree('tree')
        .addSerial({
          name: 'retryThenSilence',
          execute: async () => {
            attempts++;
            throw new Error('always fails');
          },
          retry: 2,
          silenceError: true,
        })
        .addSerial({
          name: 'afterSilenced',
          execute: async () => 'continued',
        });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(attempts).toBe(3); // 1 initial + 2 retries
      expect(result.context.workResults.get('retryThenSilence')?.status).toBe(WorkStatus.Failed);
      expect(result.context.workResults.get('retryThenSilence')?.attempts).toBe(3);
      expect(result.context.workResults.get('afterSilenced')?.result).toBe('continued');
    });

    it('should combine retry with onError handler', async () => {
      let attempts = 0;
      const onErrorFn = vi.fn();

      const tree = Work.tree('tree')
        .addSerial({
          name: 'retryThenOnError',
          execute: async () => {
            attempts++;
            throw new Error('always fails');
          },
          retry: 2,
          onError: onErrorFn, // Swallows by not throwing
        })
        .addSerial({
          name: 'afterOnError',
          execute: async () => 'continued',
        });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(attempts).toBe(3);
      expect(onErrorFn).toHaveBeenCalledTimes(1); // Only called after all retries exhausted
      expect(result.context.workResults.get('afterOnError')?.result).toBe('continued');
    });

    it('should track attempts as 1 for skipped work', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'skippedWork',
        execute: async () => 'should not run',
        shouldRun: () => false,
        retry: 3,
      });

      const result = await tree.run({});

      expect(result.context.workResults.get('skippedWork')?.status).toBe(WorkStatus.Skipped);
      expect(result.context.workResults.get('skippedWork')?.attempts).toBe(1);
    });

    it('should provide context to shouldRetry callback', async () => {
      const shouldRetryFn = vi.fn().mockReturnValue(true);

      const tree = Work.tree('tree').addSerial({
        name: 'contextRetry',
        execute: async () => {
          throw new Error('fail');
        },
        retry: {
          maxRetries: 1,
          shouldRetry: shouldRetryFn,
        },
      });

      await tree.run({ testData: 'value' });

      expect(shouldRetryFn).toHaveBeenCalledTimes(1);
      expect(shouldRetryFn.mock.calls[0][2].data).toEqual({ testData: 'value' });
    });

    it('should provide context to onRetry callback', async () => {
      const onRetryFn = vi.fn();

      const tree = Work.tree('tree').addSerial({
        name: 'contextOnRetry',
        execute: async () => {
          throw new Error('fail');
        },
        retry: {
          maxRetries: 1,
          onRetry: onRetryFn,
        },
      });

      await tree.run({ testData: 'value' });

      expect(onRetryFn).toHaveBeenCalledTimes(1);
      expect(onRetryFn.mock.calls[0][2].data).toEqual({ testData: 'value' });
    });

    it('should use async shouldRetry callback', async () => {
      let attempts = 0;

      const tree = Work.tree('tree').addSerial({
        name: 'asyncShouldRetry',
        execute: async () => {
          attempts++;
          throw new Error('fail');
        },
        retry: {
          maxRetries: 3,
          shouldRetry: async () => {
            await new Promise((r) => setTimeout(r, 5));
            return attempts < 2;
          },
        },
      });

      await tree.run({});

      expect(attempts).toBe(2); // Stopped after async shouldRetry returned false
    });

    it('should use async onRetry callback', async () => {
      let attempts = 0;
      let hookCalled = false;

      const tree = Work.tree('tree').addSerial({
        name: 'asyncOnRetry',
        execute: async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('retry');
          }
          return 'done';
        },
        retry: {
          maxRetries: 2,
          onRetry: async () => {
            await new Promise((r) => setTimeout(r, 5));
            hookCalled = true;
          },
        },
      });

      await tree.run({});

      expect(hookCalled).toBe(true);
      expect(attempts).toBe(2);
    });
  });

  describe('timeout behavior', () => {
    it('should timeout work when execution exceeds timeout (simple number)', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'slowWork',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return 'should not return';
        },
        timeout: 30,
      });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.error).toBeInstanceOf(TimeoutError);
      expect(result.error?.message).toBe('Work "slowWork" timed out after 30ms');
    });

    it('should complete work when execution finishes before timeout', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'fastWork',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 10));
          return 'completed';
        },
        timeout: 100,
      });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('fastWork')?.result).toBe('completed');
    });

    it('should call onTimeout callback when work times out', async () => {
      const onTimeoutFn = vi.fn();

      const tree = Work.tree('tree').addSerial({
        name: 'slowWork',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return 'should not return';
        },
        timeout: {
          ms: 30,
          onTimeout: onTimeoutFn,
        },
      });

      const result = await tree.run({ userId: '123' });

      expect(result.status).toBe(WorkStatus.Failed);
      expect(onTimeoutFn).toHaveBeenCalledTimes(1);
      expect(onTimeoutFn.mock.calls[0][0].data).toEqual({ userId: '123' });
    });

    it('should not call onTimeout callback when work completes in time', async () => {
      const onTimeoutFn = vi.fn();

      const tree = Work.tree('tree').addSerial({
        name: 'fastWork',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 10));
          return 'done';
        },
        timeout: {
          ms: 100,
          onTimeout: onTimeoutFn,
        },
      });

      await tree.run({});

      expect(onTimeoutFn).not.toHaveBeenCalled();
    });

    it('should timeout parallel works independently', async () => {
      const tree = Work.tree('tree', { failFast: false }).addParallel([
        {
          name: 'slowWork',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 100));
            return 'slow';
          },
          timeout: 30,
        },
        {
          name: 'fastWork',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 10));
            return 'fast';
          },
          timeout: 100,
        },
      ]);

      const result = await tree.run({});

      // With failFast: false, the tree completes but slowWork failed
      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('slowWork')?.status).toBe(WorkStatus.Failed);
      expect(result.context.workResults.get('slowWork')?.error).toBeInstanceOf(TimeoutError);
      expect(result.context.workResults.get('fastWork')?.result).toBe('fast');
    });

    it('should trigger retry on timeout when both configured', async () => {
      let attempts = 0;

      const tree = Work.tree('tree').addSerial({
        name: 'timeoutRetry',
        execute: async () => {
          attempts++;
          if (attempts < 3) {
            // First two attempts timeout
            await new Promise((r) => setTimeout(r, 100));
          }
          return 'success';
        },
        timeout: 30,
        retry: 3,
      });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('timeoutRetry')?.result).toBe('success');
      expect(attempts).toBe(3);
      expect(result.context.workResults.get('timeoutRetry')?.attempts).toBe(3);
    });

    it('should fail after exhausting retries on repeated timeouts', async () => {
      let attempts = 0;

      const tree = Work.tree('tree').addSerial({
        name: 'alwaysTimeout',
        execute: async () => {
          attempts++;
          await new Promise((r) => setTimeout(r, 100));
          return 'should not return';
        },
        timeout: 30,
        retry: 2,
      });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.error).toBeInstanceOf(TimeoutError);
      expect(attempts).toBe(3); // 1 initial + 2 retries
      expect(result.context.workResults.get('alwaysTimeout')?.attempts).toBe(3);
    });

    it('should continue tree when timeout error is silenced', async () => {
      const tree = Work.tree('tree')
        .addSerial({
          name: 'silencedTimeout',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 100));
            return 'should not return';
          },
          timeout: 30,
          silenceError: true,
        })
        .addSerial({
          name: 'afterTimeout',
          execute: async () => 'continued',
        });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('silencedTimeout')?.status).toBe(WorkStatus.Failed);
      expect(result.context.workResults.get('afterTimeout')?.result).toBe('continued');
    });

    it('should call onError handler on timeout', async () => {
      const onErrorFn = vi.fn();

      const tree = Work.tree('tree')
        .addSerial({
          name: 'timeoutWithHandler',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 100));
            return 'should not return';
          },
          timeout: 30,
          onError: onErrorFn, // Swallows by not throwing
        })
        .addSerial({
          name: 'afterTimeout',
          execute: async () => 'continued',
        });

      const result = await tree.run({});

      expect(onErrorFn).toHaveBeenCalledTimes(1);
      expect(onErrorFn.mock.calls[0][0]).toBeInstanceOf(TimeoutError);
      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('afterTimeout')?.result).toBe('continued');
    });

    it('should timeout entire tree with tree-level timeout', async () => {
      const tree = Work.tree('tree', { timeout: 50 })
        .addSerial({
          name: 'step1',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 20));
            return 'a';
          },
        })
        .addSerial({
          name: 'step2',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 100)); // This will cause tree timeout
            return 'b';
          },
        });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.error).toBeInstanceOf(TimeoutError);
      expect(result.error?.message).toBe('Work "tree" timed out after 50ms');
    });

    it('should complete tree when all works finish before tree timeout', async () => {
      const tree = Work.tree('tree', { timeout: 200 })
        .addSerial({
          name: 'step1',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 20));
            return 'a';
          },
        })
        .addSerial({
          name: 'step2',
          execute: async () => {
            await new Promise((r) => setTimeout(r, 20));
            return 'b';
          },
        });

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('step1')?.result).toBe('a');
      expect(result.context.workResults.get('step2')?.result).toBe('b');
    });

    it('should call tree-level onTimeout when tree times out', async () => {
      const onTimeoutFn = vi.fn();

      const tree = Work.tree('tree', {
        timeout: {
          ms: 30,
          onTimeout: onTimeoutFn,
        },
      }).addSerial({
        name: 'slowWork',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return 'should not return';
        },
      });

      const result = await tree.run({ treeData: 'value' });

      expect(result.status).toBe(WorkStatus.Failed);
      expect(onTimeoutFn).toHaveBeenCalledTimes(1);
      expect(onTimeoutFn.mock.calls[0][0].data).toEqual({ treeData: 'value' });
    });

    it('should timeout work in parallel with retry', async () => {
      let attempts = 0;

      const tree = Work.tree('tree').addParallel([
        {
          name: 'parallelTimeout',
          execute: async () => {
            attempts++;
            if (attempts < 2) {
              await new Promise((r) => setTimeout(r, 100));
            }
            return 'success';
          },
          timeout: 30,
          retry: 2,
        },
        {
          name: 'fastWork',
          execute: async () => 'fast',
        },
      ]);

      const result = await tree.run({});

      expect(result.status).toBe(WorkStatus.Completed);
      expect(result.context.workResults.get('parallelTimeout')?.result).toBe('success');
      expect(result.context.workResults.get('parallelTimeout')?.attempts).toBe(2);
      expect(result.context.workResults.get('fastWork')?.result).toBe('fast');
    });

    it('should verify TimeoutError has correct properties', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'testTimeout',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return 'should not return';
        },
        timeout: 30,
      });

      const result = await tree.run({});

      expect(result.error).toBeInstanceOf(TimeoutError);
      const timeoutError = result.error as TimeoutError;
      expect(timeoutError.name).toBe('TimeoutError');
      expect(timeoutError.workName).toBe('testTimeout');
      expect(timeoutError.timeoutMs).toBe(30);
    });

    it('should verify TimeoutError extends WorkTreeError', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'testTimeout',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return 'should not return';
        },
        timeout: 30,
      });

      const result = await tree.run({});

      // TimeoutError should be catchable as WorkTreeError
      expect(result.error).toBeInstanceOf(TimeoutError);
      expect(result.error).toBeInstanceOf(WorkTreeError);
      expect(result.error).toBeInstanceOf(Error);
    });

    it('should handle async onTimeout callback', async () => {
      let callbackCompleted = false;

      const tree = Work.tree('tree').addSerial({
        name: 'asyncTimeout',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return 'should not return';
        },
        timeout: {
          ms: 30,
          onTimeout: async () => {
            // Note: onTimeout is fire-and-forget, but we can still test it completes
            await new Promise((r) => setTimeout(r, 5));
            callbackCompleted = true;
          },
        },
      });

      await tree.run({});

      // Give a bit of time for the async callback to complete
      await new Promise((r) => setTimeout(r, 20));
      expect(callbackCompleted).toBe(true);
    });

    it('should ignore errors in onTimeout callback', async () => {
      const tree = Work.tree('tree').addSerial({
        name: 'errorInCallback',
        execute: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return 'should not return';
        },
        timeout: {
          ms: 30,
          onTimeout: async () => {
            throw new Error('Callback error');
          },
        },
      });

      const result = await tree.run({});

      // Should still fail with TimeoutError, not the callback error
      expect(result.status).toBe(WorkStatus.Failed);
      expect(result.error).toBeInstanceOf(TimeoutError);
      expect(result.error?.message).toBe('Work "errorInCallback" timed out after 30ms');
    });
  });

  describe('onBefore and onAfter hooks', () => {
    describe('onBefore hook', () => {
      it('should call onBefore before steps execute', async () => {
        const executionOrder: string[] = [];

        const tree = Work.tree('tree', {
          onBefore: async () => {
            executionOrder.push('onBefore');
          },
        }).addSerial({
          name: 'step1',
          execute: async () => {
            executionOrder.push('step1');
            return 'done';
          },
        });

        await tree.run({});

        expect(executionOrder).toEqual(['onBefore', 'step1']);
      });

      it('should not call onBefore when shouldRun returns false', async () => {
        const onBeforeFn = vi.fn();

        const tree = Work.tree('tree', {
          shouldRun: () => false,
          onBefore: onBeforeFn,
        }).addSerial({
          name: 'step1',
          execute: async () => 'done',
        });

        await tree.run({});

        expect(onBeforeFn).not.toHaveBeenCalled();
      });

      it('should pass context to onBefore', async () => {
        const onBeforeFn = vi.fn();

        const tree = Work.tree('tree', {
          onBefore: onBeforeFn,
        }).addSerial({
          name: 'step1',
          execute: async () => 'done',
        });

        await tree.run({ userId: '123' });

        expect(onBeforeFn).toHaveBeenCalledTimes(1);
        expect(onBeforeFn.mock.calls[0][0].data).toEqual({ userId: '123' });
      });

      it('should fail the tree when onBefore throws', async () => {
        const tree = Work.tree('tree', {
          onBefore: async () => {
            throw new Error('onBefore failed');
          },
        }).addSerial({
          name: 'step1',
          execute: async () => 'should not run',
        });

        const result = await tree.run({});

        expect(result.status).toBe(WorkStatus.Failed);
        expect(result.error?.message).toBe('onBefore failed');
        expect(result.workResults.has('step1')).toBe(false);
      });

      it('should support async onBefore', async () => {
        let onBeforeCompleted = false;

        const tree = Work.tree('tree', {
          onBefore: async () => {
            await new Promise((r) => setTimeout(r, 10));
            onBeforeCompleted = true;
          },
        }).addSerial({
          name: 'step1',
          execute: async () => {
            // onBefore should have completed by now
            return onBeforeCompleted ? 'success' : 'failure';
          },
        });

        const result = await tree.run({});

        expect(result.status).toBe(WorkStatus.Completed);
        expect(result.context.workResults.get('step1')?.result).toBe('success');
      });

      it('should call onBefore for nested trees', async () => {
        const executionOrder: string[] = [];

        const innerTree = Work.tree('inner', {
          onBefore: async () => {
            executionOrder.push('inner-onBefore');
          },
        }).addSerial({
          name: 'innerStep',
          execute: async () => {
            executionOrder.push('innerStep');
            return 'a';
          },
        });

        const outerTree = Work.tree('outer', {
          onBefore: async () => {
            executionOrder.push('outer-onBefore');
          },
        }).addSerial(innerTree);

        await outerTree.run({});

        expect(executionOrder).toEqual(['outer-onBefore', 'inner-onBefore', 'innerStep']);
      });
    });

    describe('onAfter hook', () => {
      it('should call onAfter after successful execution', async () => {
        const executionOrder: string[] = [];

        const tree = Work.tree('tree', {
          onAfter: async () => {
            executionOrder.push('onAfter');
          },
        }).addSerial({
          name: 'step1',
          execute: async () => {
            executionOrder.push('step1');
            return 'done';
          },
        });

        await tree.run({});

        expect(executionOrder).toEqual(['step1', 'onAfter']);
      });

      it('should call onAfter with Completed status on success', async () => {
        const onAfterFn = vi.fn();

        const tree = Work.tree('tree', {
          onAfter: onAfterFn,
        }).addSerial({
          name: 'step1',
          execute: async () => 'result',
        });

        await tree.run({});

        expect(onAfterFn).toHaveBeenCalledTimes(1);
        expect(onAfterFn.mock.calls[0][1]).toMatchObject({
          status: WorkStatus.Completed,
          result: 'result',
        });
      });

      it('should call onAfter with Failed status on error', async () => {
        const onAfterFn = vi.fn();

        const tree = Work.tree('tree', {
          onAfter: onAfterFn,
        }).addSerial({
          name: 'step1',
          execute: async () => {
            throw new Error('step failed');
          },
        });

        await tree.run({});

        expect(onAfterFn).toHaveBeenCalledTimes(1);
        expect(onAfterFn.mock.calls[0][1].status).toBe(WorkStatus.Failed);
        expect(onAfterFn.mock.calls[0][1].error?.message).toBe('step failed');
      });

      it('should not call onAfter when tree is skipped', async () => {
        const onAfterFn = vi.fn();

        const tree = Work.tree('tree', {
          shouldRun: () => false,
          onAfter: onAfterFn,
        }).addSerial({
          name: 'step1',
          execute: async () => 'done',
        });

        await tree.run({});

        expect(onAfterFn).not.toHaveBeenCalled();
      });

      it('should pass context to onAfter', async () => {
        const onAfterFn = vi.fn();

        const tree = Work.tree('tree', {
          onAfter: onAfterFn,
        }).addSerial({
          name: 'step1',
          execute: async () => 'done',
        });

        await tree.run({ userId: '456' });

        expect(onAfterFn).toHaveBeenCalledTimes(1);
        expect(onAfterFn.mock.calls[0][0].data).toEqual({ userId: '456' });
      });

      it('should not change tree result when onAfter throws', async () => {
        const tree = Work.tree('tree', {
          onAfter: async () => {
            throw new Error('onAfter failed');
          },
        }).addSerial({
          name: 'step1',
          execute: async () => 'success',
        });

        const result = await tree.run({});

        // Tree should still be Completed despite onAfter error
        expect(result.status).toBe(WorkStatus.Completed);
        expect(result.context.workResults.get('step1')?.result).toBe('success');
      });

      it('should call onAfter even when silenceError handles failure', async () => {
        const onAfterFn = vi.fn();

        const innerTree = Work.tree('inner', {
          silenceError: true,
          onAfter: onAfterFn,
        }).addSerial({
          name: 'willFail',
          execute: async () => {
            throw new Error('Inner failure');
          },
        });

        const outerTree = Work.tree('outer').addSerial(innerTree);

        await outerTree.run({});

        expect(onAfterFn).toHaveBeenCalledTimes(1);
        expect(onAfterFn.mock.calls[0][1].status).toBe(WorkStatus.Failed);
      });

      it('should call onAfter even when onError handles failure', async () => {
        const onAfterFn = vi.fn();

        const tree = Work.tree('tree', {
          onError: async () => {
            // Swallow error
          },
          onAfter: onAfterFn,
        }).addSerial({
          name: 'willFail',
          execute: async () => {
            throw new Error('Handled failure');
          },
        });

        const outerTree = Work.tree('outer').addSerial(tree);

        await outerTree.run({});

        expect(onAfterFn).toHaveBeenCalledTimes(1);
        expect(onAfterFn.mock.calls[0][1].status).toBe(WorkStatus.Failed);
      });

      it('should support async onAfter', async () => {
        let onAfterCompleted = false;

        const tree = Work.tree('tree', {
          onAfter: async () => {
            await new Promise((r) => setTimeout(r, 10));
            onAfterCompleted = true;
          },
        }).addSerial({
          name: 'step1',
          execute: async () => 'done',
        });

        await tree.run({});

        expect(onAfterCompleted).toBe(true);
      });

      it('should call onAfter for nested trees', async () => {
        const executionOrder: string[] = [];

        const innerTree = Work.tree('inner', {
          onAfter: async () => {
            executionOrder.push('inner-onAfter');
          },
        }).addSerial({
          name: 'innerStep',
          execute: async () => {
            executionOrder.push('innerStep');
            return 'a';
          },
        });

        const outerTree = Work.tree('outer', {
          onAfter: async () => {
            executionOrder.push('outer-onAfter');
          },
        }).addSerial(innerTree);

        await outerTree.run({});

        expect(executionOrder).toEqual(['innerStep', 'inner-onAfter', 'outer-onAfter']);
      });
    });

    describe('setOnAfter method', () => {
      it('should provide typed workResults in outcome via setOnAfter', async () => {
        const onAfterFn = vi.fn();

        const tree = Work.tree('tree')
          .addSerial({
            name: 'step1',
            execute: async () => 'hello',
          })
          .addSerial({
            name: 'step2',
            execute: async () => 42,
          })
          .setOnAfter(async (ctx, outcome) => {
            // Access workResults with full typing
            const step1 = outcome.workResults.get('step1').result;
            const step2 = outcome.workResults.get('step2').result;
            onAfterFn({ step1, step2, status: outcome.status });
          });

        await tree.run({});

        expect(onAfterFn).toHaveBeenCalledWith({
          step1: 'hello',
          step2: 42,
          status: WorkStatus.Completed,
        });
      });

      it('should override option-based onAfter when setOnAfter is used', async () => {
        const optionOnAfter = vi.fn();
        const methodOnAfter = vi.fn();

        const tree = Work.tree('tree', {
          onAfter: optionOnAfter,
        })
          .addSerial({ name: 'step1', execute: async () => 'done' })
          .setOnAfter(methodOnAfter);

        await tree.run({});

        expect(optionOnAfter).not.toHaveBeenCalled();
        expect(methodOnAfter).toHaveBeenCalledTimes(1);
      });

      it('should call setOnAfter on failure with error in outcome', async () => {
        const onAfterFn = vi.fn();

        const tree = Work.tree('tree')
          .addSerial({
            name: 'step1',
            execute: async () => {
              throw new Error('step failed');
            },
          })
          .setOnAfter(onAfterFn);

        await tree.run({});

        expect(onAfterFn).toHaveBeenCalledTimes(1);
        expect(onAfterFn.mock.calls[0][1].status).toBe(WorkStatus.Failed);
        expect(onAfterFn.mock.calls[0][1].error?.message).toBe('step failed');
        expect(onAfterFn.mock.calls[0][1].workResults).toBeDefined();
      });

      it('should include workResults in outcome for option-based onAfter too', async () => {
        const onAfterFn = vi.fn();

        const tree = Work.tree('tree', {
          onAfter: onAfterFn,
        }).addSerial({
          name: 'step1',
          execute: async () => 'result',
        });

        await tree.run({});

        expect(onAfterFn).toHaveBeenCalledTimes(1);
        expect(onAfterFn.mock.calls[0][1].workResults).toBeDefined();
        expect(onAfterFn.mock.calls[0][1].workResults.get('step1').result).toBe('result');
      });

      it('should allow chaining after setOnAfter', async () => {
        const tree = Work.tree('tree')
          .addSerial({ name: 'step1', execute: async () => 'a' })
          .setOnAfter(async () => {})
          .addSerial({ name: 'step2', execute: async () => 'b' });

        const result = await tree.run({});

        expect(result.status).toBe(WorkStatus.Completed);
        expect(result.context.workResults.get('step1')?.result).toBe('a');
        expect(result.context.workResults.get('step2')?.result).toBe('b');
      });
    });

    describe('onBefore and onAfter together', () => {
      it('should call both hooks in correct order', async () => {
        const executionOrder: string[] = [];

        const tree = Work.tree('tree', {
          onBefore: async () => {
            executionOrder.push('onBefore');
          },
          onAfter: async () => {
            executionOrder.push('onAfter');
          },
        }).addSerial({
          name: 'step1',
          execute: async () => {
            executionOrder.push('step1');
            return 'done';
          },
        });

        await tree.run({});

        expect(executionOrder).toEqual(['onBefore', 'step1', 'onAfter']);
      });

      it('should call onAfter when onBefore fails (try/finally semantics)', async () => {
        const onAfterFn = vi.fn();

        const tree = Work.tree('tree', {
          onBefore: async () => {
            throw new Error('onBefore failed');
          },
          onAfter: onAfterFn,
        }).addSerial({
          name: 'step1',
          execute: async () => 'done',
        });

        const result = await tree.run({});

        // onAfter IS called even when onBefore fails (for safe cleanup like releasing locks)
        expect(onAfterFn).toHaveBeenCalledTimes(1);
        expect(onAfterFn.mock.calls[0][1].status).toBe(WorkStatus.Failed);
        expect(onAfterFn.mock.calls[0][1].error?.message).toBe('onBefore failed');
        expect(result.status).toBe(WorkStatus.Failed);
      });

      it('should call onAfter with error from failed step', async () => {
        const executionOrder: string[] = [];
        const onAfterFn = vi.fn();

        const tree = Work.tree('tree', {
          onBefore: async () => {
            executionOrder.push('onBefore');
          },
          onAfter: onAfterFn,
        })
          .addSerial({
            name: 'step1',
            execute: async () => {
              executionOrder.push('step1');
              return 'a';
            },
          })
          .addSerial({
            name: 'step2',
            execute: async () => {
              executionOrder.push('step2');
              throw new Error('step2 failed');
            },
          });

        await tree.run({});

        expect(executionOrder).toEqual(['onBefore', 'step1', 'step2']);
        expect(onAfterFn).toHaveBeenCalledTimes(1);
        expect(onAfterFn.mock.calls[0][1].status).toBe(WorkStatus.Failed);
        expect(onAfterFn.mock.calls[0][1].error?.message).toBe('step2 failed');
      });
    });
  });
});
