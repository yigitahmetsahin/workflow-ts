# @yigitahmetsahin/workflow-ts

A simple, extensible TypeScript workflow engine supporting serial and parallel work execution with full type inference.

[![npm version](https://img.shields.io/npm/v/@yigitahmetsahin/workflow-ts.svg)](https://www.npmjs.com/package/@yigitahmetsahin/workflow-ts)
[![npm downloads](https://img.shields.io/npm/dm/@yigitahmetsahin/workflow-ts.svg)](https://www.npmjs.com/package/@yigitahmetsahin/workflow-ts)
[![CI](https://github.com/yigitahmetsahin/workflow-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/yigitahmetsahin/workflow-ts/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/node/v/@yigitahmetsahin/workflow-ts.svg)](https://nodejs.org/)

## Features

- 🔄 **Serial & Parallel Execution** - Chain work items sequentially or run them concurrently
- 🎯 **Full Type Inference** - Work names and result types are automatically inferred
- 🧩 **Standalone Work Definitions** - Define works as reusable `Work` instances
- ⏭️ **Conditional Execution** - Skip work items based on runtime conditions
- 🛡️ **Error Handling** - Built-in error callbacks and workflow failure states
- 📊 **Execution Tracking** - Duration tracking for individual works and total workflow
- 🪶 **Zero Dependencies** - Lightweight with no external runtime dependencies

## Installation

```bash
npm install @yigitahmetsahin/workflow-ts
```

```bash
yarn add @yigitahmetsahin/workflow-ts
```

```bash
pnpm add @yigitahmetsahin/workflow-ts
```

## Quick Start

```typescript
import { Workflow, Work, WorkflowStatus } from '@yigitahmetsahin/workflow-ts';

// Option 1: Define works inline
const workflow = new Workflow<{ userId: string }>()
  .serial({
    name: 'validate',
    execute: async (ctx) => ctx.data.userId.length > 0,
  })
  .parallel([
    {
      name: 'fetchOrders',
      execute: async (ctx) => [{ id: 1 }, { id: 2 }],
    },
    {
      name: 'fetchProfile',
      execute: async (ctx) => ({ name: 'John', email: 'john@example.com' }),
    },
  ])
  .serial({
    name: 'process',
    execute: async (ctx) => {
      // ✅ Types are automatically inferred!
      // workResults.get() returns IWorkResult with status, result, duration
      const orders = ctx.workResults.get('fetchOrders').result; // { id: number }[]
      const profile = ctx.workResults.get('fetchProfile').result; // { name: string; email: string }
      return { orderCount: orders?.length ?? 0, userName: profile?.name };
    },
  });

// Option 2: Define works as reusable Work instances
const validateUser = new Work({
  name: 'validate',
  execute: async (ctx) => ctx.data.userId.length > 0,
});

const fetchOrders = new Work({
  name: 'fetchOrders',
  execute: async (ctx) => [{ id: 1 }, { id: 2 }],
});

const workflow2 = new Workflow<{ userId: string }>().serial(validateUser).parallel([fetchOrders]);

const result = await workflow.run({ userId: 'user-123' });

if (result.status === WorkflowStatus.COMPLETED) {
  console.log('Workflow completed in', result.totalDuration, 'ms');
  console.log('Final result:', result.context.workResults.get('process').result);
}
```

## API Reference

### `Workflow<TData>`

Create a new workflow with optional initial data type.

```typescript
const workflow = new Workflow<{ userId: string }>();
```

### `.serial(work)`

Add a serial (sequential) work to the workflow.

```typescript
workflow.serial({
  name: 'workName', // Unique name for this work
  execute: async (ctx) => {
    // Async function that performs the work
    return result; // Return value becomes available to subsequent works
  },
  shouldRun: (ctx) => true, // Optional: condition to skip this work
  onError: (error, ctx) => {
    // Optional: error handler
    console.error(error);
  },
});
```

### `.parallel(works)`

Add parallel works that execute concurrently.

```typescript
workflow.parallel([
  { name: 'task1', execute: async (ctx) => result1 },
  { name: 'task2', execute: async (ctx) => result2 },
  { name: 'task3', execute: async (ctx) => result3 },
]);
```

### `Work` Class

Define standalone, reusable work units using the `Work` class:

```typescript
import { Work, Workflow } from '@yigitahmetsahin/workflow-ts';

// Define works as standalone units
const fetchUser = new Work({
  name: 'fetchUser',
  execute: async (ctx) => {
    const response = await fetch(`/api/users/${ctx.data.userId}`);
    return response.json();
  },
});

const fetchOrders = new Work({
  name: 'fetchOrders',
  execute: async (ctx) => {
    const response = await fetch(`/api/orders?userId=${ctx.data.userId}`);
    return response.json();
  },
});

// Use them in workflows
const workflow = new Workflow<{ userId: string }>()
  .serial(fetchUser)
  .parallel([fetchOrders, anotherWork]);
```

Works can be mixed with inline definitions:

```typescript
workflow
  .serial(fetchUser) // Work instance
  .parallel([
    fetchOrders, // Work instance
    {
      // Inline definition
      name: 'fetchProfile',
      execute: async (ctx) => ({ name: 'John' }),
    },
  ]);
```

The `Work` class supports all the same options as inline definitions:

```typescript
const conditionalWork = new Work({
  name: 'conditionalTask',
  execute: async (ctx) => 'result',
  shouldRun: (ctx) => ctx.data.enabled, // Optional condition
  onError: (error, ctx) => console.error(error), // Optional error handler
  silenceError: true, // Optional: don't fail workflow on error
});
```

### Error Silencing

Use `silenceError: true` to allow a work to fail without stopping the workflow. The error is still recorded and accessible:

```typescript
const workflow = new Workflow<{ userId: string }>()
  .serial({
    name: 'fetchOptionalData',
    execute: async () => {
      throw new Error('Service unavailable');
    },
    silenceError: true, // Won't stop the workflow
    onError: (err) => console.warn('Optional fetch failed:', err.message),
  })
  .serial({
    name: 'continue',
    execute: async (ctx) => {
      // Check if previous work failed
      const optionalResult = ctx.workResults.get('fetchOptionalData');
      if (optionalResult.status === WorkStatus.FAILED) {
        return { data: null, error: optionalResult.error?.message };
      }
      return { data: optionalResult.result };
    },
  });

const result = await workflow.run({ userId: '123' });
// result.status === WorkflowStatus.COMPLETED (workflow continues despite error)
```

You can also set `silenceError` at the workflow level as a default for all works:

```typescript
// All works will have silenceError: true by default
const workflow = new Workflow<{ userId: string }>({ silenceError: true })
  .serial({
    name: 'work1',
    execute: async () => {
      throw new Error('Ignored');
    },
  })
  .serial({
    name: 'work2',
    execute: async () => {
      throw new Error('Also ignored');
    },
  })
  .serial({ name: 'final', execute: async () => 'completed' });

// Individual works can override the workflow default
const mixedWorkflow = new Workflow<{ userId: string }>({ silenceError: true })
  .serial({
    name: 'optional',
    execute: async () => {
      throw new Error('Silenced');
    },
  })
  .serial({
    name: 'critical',
    execute: async () => {
      throw new Error('Must fail');
    },
    silenceError: false, // Override: this error WILL fail the workflow
  });
```

### `.run(initialData)`

Execute the workflow with initial data.

```typescript
const result = await workflow.run({ userId: '123' });
```

### Result Object

```typescript
interface IWorkflowResult {
  status: WorkflowStatus; // 'completed' | 'failed'
  context: {
    data: TData; // Initial data passed to run()
    workResults: IWorkResultsMap; // Type-safe map of work results
  };
  workResults: Map<string, IWorkResult>; // Detailed results per work
  totalDuration: number; // Total execution time in ms
  error?: Error; // Error if workflow failed
}

// Each work result contains execution details
interface IWorkResult<T> {
  status: WorkStatus; // 'completed' | 'failed' | 'skipped'
  result?: T; // The return value from execute()
  error?: Error; // Error if work failed
  duration: number; // Execution time in ms
}
```

### Accessing Work Results

`ctx.workResults.get()` returns an `IWorkResult` object, not the raw value:

```typescript
// Get the full work result with metadata
const workResult = ctx.workResults.get('fetchUser');
console.log(workResult.status); // 'completed' | 'failed' | 'skipped'
console.log(workResult.duration); // execution time in ms

// Get just the return value
const user = ctx.workResults.get('fetchUser').result;

// Check status before accessing result
if (workResult.status === WorkStatus.COMPLETED) {
  console.log('User:', workResult.result);
}
```

> **Note:** `workResults.get()` throws an error if called for a work that hasn't executed yet. Use `workResults.has()` to check if a result exists.

## Conditional Execution

Skip works based on runtime conditions:

```typescript
workflow.serial({
  name: 'sendEmail',
  shouldRun: (ctx) => ctx.data.sendNotifications,
  execute: async (ctx) => {
    await sendEmail(ctx.data.email);
    return { sent: true };
  },
});
```

Skipped works are still accessible via `workResults.get()` with `status: 'skipped'`:

```typescript
const emailResult = ctx.workResults.get('sendEmail');
if (emailResult.status === WorkStatus.SKIPPED) {
  console.log('Email was skipped');
} else if (emailResult.status === WorkStatus.COMPLETED) {
  console.log('Email sent:', emailResult.result);
}
```

## Error Handling

Handle errors at the work level:

```typescript
workflow.serial({
  name: 'riskyOperation',
  execute: async (ctx) => {
    if (Math.random() < 0.5) throw new Error('Random failure');
    return 'success';
  },
  onError: async (error, ctx) => {
    await logError(error, ctx.data);
    // Error will still propagate and fail the workflow
  },
});
```

## Behavior Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Workflow.run()                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                        ┌─────────────────────────┐
                        │   Initialize Context    │
                        │   { data, workResults } │
                        └─────────────────────────┘
                                      │
                                      ▼
                        ┌─────────────────────────┐
                        │   For each work item    │◄─────────────────┐
                        └─────────────────────────┘                  │
                                      │                              │
                          ┌───────────┴───────────┐                  │
                          ▼                       ▼                  │
                    ┌──────────┐           ┌────────────┐            │
                    │  Serial  │           │  Parallel  │            │
                    └──────────┘           └────────────┘            │
                          │                       │                  │
                          ▼                       ▼                  │
                ┌──────────────────┐   ┌────────────────────┐        │
                │   shouldRun()?   │   │  For each work in  │        │
                └──────────────────┘   │      parallel      │        │
                    │           │      └────────────────────┘        │
                   Yes          No              │                    │
                    │           │      ┌────────┼────────┐           │
                    ▼           ▼      ▼        ▼        ▼           │
            ┌───────────┐  ┌────────┐ ┌──┐    ┌──┐    ┌──┐           │
            │ execute() │  │ SKIP   │ │W1│    │W2│    │W3│           │
            └───────────┘  └────────┘ └──┘    └──┘    └──┘           │
                    │                   │       │       │            │
                    ▼                   └───────┴───────┘            │
            ┌───────────────┐                   │                    │
            │ Store result  │                   ▼                    │
            │ in context    │       ┌─────────────────────┐          │
            └───────────────┘       │  Promise.all()      │          │
                    │               │  (concurrent exec)  │          │
                    │               └─────────────────────┘          │
                    ▼                          │                     │
            ┌───────────────┐       ┌─────────────────────┐          │
            │    Success    │       │  Collect results    │          │
            └───────────────┘       │  Check for errors   │          │
                    │               └─────────────────────┘          │
                    │                          │                     │
                    └──────────────┬───────────┘                     │
                                   │                                 │
                                   ▼                                 │
                         ┌─────────────────┐                         │
                         │  More works?    │─────────Yes─────────────┘
                         └─────────────────┘
                                   │
                                  No
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │      Return Result          │
                    │  { status, workResults,     │
                    │    context, totalDuration } │
                    └─────────────────────────────┘
```

## Execution Timeline

```
Time ──────────────────────────────────────────────────────────────────►

     ┌──────────────┐
     │   validate   │
     │   (serial)   │
     └──────────────┘
                     ┌──────────────┐
                     │ fetchOrders  │
                     │  (parallel)  ├──────────┐
                     └──────────────┘          │
                     ┌──────────────┐          │ concurrent
                     │ fetchProfile │          │
                     │  (parallel)  ├──────────┘
                     └──────────────┘
                                    ┌──────────────┐
                                    │   process    │
                                    │   (serial)   │
                                    └──────────────┘
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build the library
npm run build

# Type check
npm run lint
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` for new features (minor version bump)
   - `fix:` for bug fixes (patch version bump)
   - `feat!:` or `BREAKING CHANGE:` for breaking changes (major version bump)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

This project uses [Release Please](https://github.com/googleapis/release-please) for automated releases. When your PR is merged:

- A release PR is automatically created/updated
- Merging the release PR publishes to npm with provenance

## License

MIT
