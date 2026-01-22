# @yigitahmetsahin/workflow-ts

A simple, extensible TypeScript workflow engine supporting serial and parallel work execution with full type inference.

[![npm version](https://badge.fury.io/js/%40yigitahmetsahin%2Fworkflow-ts.svg)](https://www.npmjs.com/package/@yigitahmetsahin/workflow-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🔄 **Serial & Parallel Execution** - Chain work items sequentially or run them concurrently
- 🎯 **Full Type Inference** - Work names and result types are automatically inferred
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
import { Workflow, WorkflowStatus } from '@yigitahmetsahin/workflow-ts';

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
      const orders = ctx.workResults.get('fetchOrders');   // { id: number }[] | undefined
      const profile = ctx.workResults.get('fetchProfile'); // { name: string; email: string } | undefined
      return { orderCount: orders?.length ?? 0, userName: profile?.name };
    },
  });

const result = await workflow.run({ userId: 'user-123' });

if (result.status === WorkflowStatus.COMPLETED) {
  console.log('Workflow completed in', result.totalDuration, 'ms');
  console.log('Final result:', result.context.workResults.get('process'));
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
  name: 'workName',           // Unique name for this work
  execute: async (ctx) => {   // Async function that performs the work
    return result;            // Return value becomes available to subsequent works
  },
  shouldRun: (ctx) => true,   // Optional: condition to skip this work
  onError: (error, ctx) => {  // Optional: error handler
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

### `.run(initialData)`

Execute the workflow with initial data.

```typescript
const result = await workflow.run({ userId: '123' });
```

### Result Object

```typescript
interface IWorkflowResult {
  status: WorkflowStatus;        // 'completed' | 'failed'
  context: {
    data: TData;                 // Initial data passed to run()
    workResults: IWorkResultsMap; // Type-safe map of work results
  };
  workResults: Map<string, IWorkResult>; // Detailed results per work
  totalDuration: number;         // Total execution time in ms
  error?: Error;                 // Error if workflow failed
}
```

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

## License

MIT
