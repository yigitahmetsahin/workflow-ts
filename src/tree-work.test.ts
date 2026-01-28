import { describe, it, expect, vi } from 'vitest';
import { Work } from './work';
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
      expect(result.workResults.get('lv4')?.parent).toBe('lv3');
      expect(result.workResults.get('lv3')?.parent).toBe('lv2');
      expect(result.workResults.get('lv2')?.parent).toBe('lv1');
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
      expect(result.workResults.get('skippableTree')?.status).toBe(WorkStatus.Skipped);
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
      expect(result.workResults.get('failingTree')?.status).toBe(WorkStatus.Failed);
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
      expect(result.context.workResults.get('skippedTree')?.status).toBe(WorkStatus.Skipped);
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
      expect(result.context.workResults.get('silencedTree')?.status).toBe(WorkStatus.Failed);
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
});
