import { describe, it, expect, vi } from 'vitest';
import { Work, getWorkDefinition } from './work';
import { IWorkflowContext } from './workflow.types';

describe('Work', () => {
  describe('constructor', () => {
    it('should assign name and execute from definition', () => {
      const executeFn = vi.fn().mockResolvedValue('result');

      const work = new Work({
        name: 'testWork',
        execute: executeFn,
      });

      expect(work.name).toBe('testWork');
      expect(work.execute).toBe(executeFn);
    });

    it('should assign all optional properties from definition', () => {
      const executeFn = vi.fn().mockResolvedValue('result');
      const shouldRunFn = vi.fn().mockReturnValue(true);
      const onErrorFn = vi.fn();

      const work = new Work({
        name: 'fullWork',
        execute: executeFn,
        shouldRun: shouldRunFn,
        onError: onErrorFn,
        silenceError: true,
      });

      expect(work.name).toBe('fullWork');
      expect(work.execute).toBe(executeFn);
      expect(work.shouldRun).toBe(shouldRunFn);
      expect(work.onError).toBe(onErrorFn);
      expect(work.silenceError).toBe(true);
    });

    it('should leave optional properties undefined when not provided', () => {
      const work = new Work({
        name: 'minimalWork',
        execute: async () => 'result',
      });

      expect(work.name).toBe('minimalWork');
      expect(work.shouldRun).toBeUndefined();
      expect(work.onError).toBeUndefined();
      expect(work.silenceError).toBeUndefined();
    });

    it('should set silenceError to false when explicitly provided', () => {
      const work = new Work({
        name: 'explicitSilence',
        execute: async () => 'result',
        silenceError: false,
      });

      expect(work.silenceError).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute the provided function with context', async () => {
      const work = new Work<'compute', { value: number }, number>({
        name: 'compute',
        execute: async (ctx) => ctx.data.value * 2,
      });

      const mockContext = {
        data: { value: 5 },
        workResults: {
          get: vi.fn(),
          set: vi.fn(),
          has: vi.fn(),
        },
      } as unknown as IWorkflowContext<{ value: number }, Record<string, unknown>>;

      const result = await work.execute(mockContext);

      expect(result).toBe(10);
    });

    it('should propagate errors from execute function', async () => {
      const work = new Work({
        name: 'failing',
        execute: async () => {
          throw new Error('Execution failed');
        },
      });

      const mockContext = {
        data: {},
        workResults: {
          get: vi.fn(),
          set: vi.fn(),
          has: vi.fn(),
        },
      } as unknown as IWorkflowContext<Record<string, unknown>, Record<string, unknown>>;

      await expect(work.execute(mockContext)).rejects.toThrow('Execution failed');
    });
  });

  describe('shouldRun', () => {
    it('should call shouldRun with context when provided', () => {
      const shouldRunFn = vi.fn().mockReturnValue(true);

      const work = new Work({
        name: 'conditional',
        execute: async () => 'result',
        shouldRun: shouldRunFn,
      });

      const mockContext = {
        data: { flag: true },
        workResults: {
          get: vi.fn(),
          set: vi.fn(),
          has: vi.fn(),
        },
      } as unknown as IWorkflowContext<{ flag: boolean }, Record<string, unknown>>;

      const result = work.shouldRun!(mockContext);

      expect(shouldRunFn).toHaveBeenCalledWith(mockContext);
      expect(result).toBe(true);
    });

    it('should support async shouldRun', async () => {
      const work = new Work({
        name: 'asyncConditional',
        execute: async () => 'result',
        shouldRun: async (ctx: IWorkflowContext<{ delay: number }>) => {
          await new Promise((resolve) => setTimeout(resolve, ctx.data.delay));
          return true;
        },
      });

      const mockContext = {
        data: { delay: 10 },
        workResults: {
          get: vi.fn(),
          set: vi.fn(),
          has: vi.fn(),
        },
      } as unknown as IWorkflowContext<{ delay: number }, Record<string, unknown>>;

      const result = await work.shouldRun!(mockContext);

      expect(result).toBe(true);
    });
  });

  describe('onError', () => {
    it('should call onError with error and context when provided', () => {
      const onErrorFn = vi.fn();

      const work = new Work({
        name: 'errorHandler',
        execute: async () => 'result',
        onError: onErrorFn,
      });

      const error = new Error('Test error');
      const mockContext = {
        data: { id: 123 },
        workResults: {
          get: vi.fn(),
          set: vi.fn(),
          has: vi.fn(),
        },
      } as unknown as IWorkflowContext<{ id: number }, Record<string, unknown>>;

      work.onError!(error, mockContext);

      expect(onErrorFn).toHaveBeenCalledWith(error, mockContext);
    });

    it('should support async onError', async () => {
      let errorLogged = false;

      const work = new Work({
        name: 'asyncErrorHandler',
        execute: async () => 'result',
        onError: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          errorLogged = true;
        },
      });

      const error = new Error('Test error');
      const mockContext = {
        data: {},
        workResults: {
          get: vi.fn(),
          set: vi.fn(),
          has: vi.fn(),
        },
      } as unknown as IWorkflowContext<Record<string, unknown>, Record<string, unknown>>;

      await work.onError!(error, mockContext);

      expect(errorLogged).toBe(true);
    });
  });

  describe('implements IWorkDefinition', () => {
    it('should be usable where IWorkDefinition is expected', () => {
      const work = new Work({
        name: 'typedWork',
        execute: async () => 'result',
      });

      // This function accepts IWorkDefinition - Work should be compatible
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acceptsWorkDefinition = (def: { name: string; execute: any }) => def.name;

      expect(acceptsWorkDefinition(work)).toBe('typedWork');
    });

    it('should preserve type inference for name', () => {
      const work = new Work({
        name: 'specificName' as const,
        execute: async () => 'result',
      });

      // TypeScript should infer the literal type 'specificName'
      const name: 'specificName' = work.name;
      expect(name).toBe('specificName');
    });

    it('should preserve type inference for result', async () => {
      const work = new Work({
        name: 'typedResult',
        execute: async () => ({ id: 1, name: 'test' }),
      });

      const mockContext = {
        data: {},
        workResults: {
          get: vi.fn(),
          set: vi.fn(),
          has: vi.fn(),
        },
      } as unknown as IWorkflowContext<Record<string, unknown>, Record<string, unknown>>;

      const result = await work.execute(mockContext);

      // Result should be typed as { id: number, name: string }
      expect(result.id).toBe(1);
      expect(result.name).toBe('test');
    });
  });

  describe('readonly properties', () => {
    it('should have readonly name property', () => {
      const work = new Work({
        name: 'readonly',
        execute: async () => 'result',
      });

      // TypeScript prevents: work.name = 'newName';
      // At runtime, attempting to assign would fail in strict mode
      expect(work.name).toBe('readonly');
    });
  });
});

describe('getWorkDefinition', () => {
  it('should return the input as-is for inline definition', () => {
    const definition = {
      name: 'inline' as const,
      execute: async () => 'result',
    };

    const result = getWorkDefinition(definition);

    expect(result).toBe(definition);
  });

  it('should return the Work instance as-is', () => {
    const work = new Work({
      name: 'workInstance',
      execute: async () => 'result',
    });

    const result = getWorkDefinition(work);

    expect(result).toBe(work);
  });

  it('should preserve all properties from definition', () => {
    const shouldRunFn = vi.fn();
    const onErrorFn = vi.fn();

    const definition = {
      name: 'full' as const,
      execute: async () => 'result',
      shouldRun: shouldRunFn,
      onError: onErrorFn,
      silenceError: true,
    };

    const result = getWorkDefinition(definition);

    expect(result.name).toBe('full');
    expect(result.execute).toBe(definition.execute);
    expect(result.shouldRun).toBe(shouldRunFn);
    expect(result.onError).toBe(onErrorFn);
    expect(result.silenceError).toBe(true);
  });

  it('should work with Work instance having all properties', () => {
    const shouldRunFn = vi.fn();
    const onErrorFn = vi.fn();

    const work = new Work({
      name: 'fullWork',
      execute: async () => 'result',
      shouldRun: shouldRunFn,
      onError: onErrorFn,
      silenceError: true,
    });

    const result = getWorkDefinition(work);

    expect(result.name).toBe('fullWork');
    expect(result.shouldRun).toBe(shouldRunFn);
    expect(result.onError).toBe(onErrorFn);
    expect(result.silenceError).toBe(true);
  });
});
