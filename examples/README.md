# Examples

This folder contains practical examples of using `@yigitahmetsahin/work-tree`.

## Running Examples

Run any example with `npx tsx`:

```bash
npx tsx examples/minimal.ts
npx tsx examples/basic.ts
npx tsx examples/parallel.ts
npx tsx examples/conditional.ts
npx tsx examples/lifecycle-hooks.ts
npx tsx examples/error-handling.ts
npx tsx examples/retry.ts
npx tsx examples/timeout.ts
npx tsx examples/work-class.ts
npx tsx examples/tree-work.ts
npx tsx examples/sealed.ts
```

## Key API Pattern

All examples use the `Work.tree()` API for building and running workflows:

```typescript
import { Work, WorkStatus } from '@yigitahmetsahin/work-tree';

// Build a tree with serial and parallel steps
const tree = Work.tree('myTree')
  .addSerial({ name: 'step1', execute: async (ctx) => 'a' })
  .addSerial({
    name: 'step2',
    execute: async (ctx) => {
      // Access previous step's result
      const prev = ctx.workResults.get('step1').result;
      return prev + 'b';
    },
  })
  .addParallel([
    { name: 'parallel1', execute: async () => 'p1' },
    { name: 'parallel2', execute: async () => 'p2' },
  ]);

// Run the tree
const result = await tree.run({ userId: '123' });

// Check status
if (result.status === WorkStatus.Completed) {
  console.log('Success!');
  console.log(result.context.workResults.get('step2').result); // 'ab'
}
```

## WorkResult Pattern

`workResults.get()` returns a `WorkResult` object:

```typescript
const userResult = ctx.workResults.get('fetchUser');

// Access the actual value via .result
const user = userResult.result;

// Check execution status
if (userResult.status === WorkStatus.Completed) {
  console.log('User fetched:', userResult.result);
} else if (userResult.status === WorkStatus.Skipped) {
  console.log('User fetch was skipped');
} else if (userResult.status === WorkStatus.Failed) {
  console.log('Error:', userResult.error);
}
```

## Examples Overview

### 0. Minimal (`minimal.ts`)

The simplest possible example demonstrating:

- Building a tree with `Work.tree()`
- Adding serial steps
- Accessing results from previous steps
- Running and checking completion status

### 1. Basic (`basic.ts`)

Simple serial tree demonstrating:

- Sequential task execution
- Accessing results from previous steps via `.result`
- Type-safe result access

### 2. Parallel (`parallel.ts`)

Concurrent execution demonstrating:

- Running multiple tasks simultaneously with `addParallel()`
- Combining parallel results in a final serial step
- Time savings from parallel execution

### 3. Conditional (`conditional.ts`)

Skip-based execution demonstrating:

- `shouldRun` condition for optional steps
- Checking work status (completed vs skipped)
- Dynamic execution paths based on input
- Multiple scenarios with same tree

### 4. Lifecycle Hooks (`lifecycle-hooks.ts`)

Lifecycle hooks demonstrating:

- `onBefore` hook for setup before execution
- `onAfter` hook for cleanup after completion (success or failure)
- `setOnAfter()` method for full type inference on `workResults`
- Nested trees with their own hooks
- Transaction-like patterns (setup/commit/rollback)
- Conditional skip behavior (onAfter not called when skipped)

### 5. Error Handling (`error-handling.ts`)

Error handling demonstrating:

- `onError` callbacks for logging/alerting
- Tree failure states
- Accessing error details via `WorkResult.error`
- Error recovery patterns
- Using `WorkTreeError` base class to catch all library errors
- Using `TimeoutError` for type-safe timeout handling

### 6. Retry (`retry.ts`)

Retry mechanisms demonstrating:

- Simple retry count (`retry: 3`)
- Retry with fixed delay
- Exponential backoff with `backoff: 'exponential'`
- `shouldRetry` callback for conditional retry (e.g., only retry network errors)
- `onRetry` hook for logging/metrics before each retry
- Combining retry with `silenceError` for non-critical work
- Tracking attempts via `WorkResult.attempts`

### 7. Timeout (`timeout.ts`)

Timeout mechanisms demonstrating:

- Timeout hierarchy (tree → work → attempt)
- Simple work timeout (`timeout: 5000`) - wraps entire work including all retries
- Timeout with `onTimeout` callback for logging/cleanup
- Tree-level timeout for entire workflow
- Attempt timeout (`retry.attemptTimeout`) - per-attempt timeout that triggers retries
- Combining work timeout and attempt timeout for robust error handling
- Timeout with `silenceError` for non-critical work
- Timeout with `onError` for custom error handling
- Parallel works with individual timeouts
- Using `TimeoutError` class for type-safe error handling

### 8. Work Class (`work-class.ts`)

Standalone work definitions demonstrating:

- Defining reusable `Work` instances
- Using Work instances in `addSerial()` and `addParallel()`
- Mixing Work instances with inline definitions
- Reusing the same Work across multiple trees
- Conditional execution with Work class

### 9. Tree Work (`tree-work.ts`)

Nested tree-like structures demonstrating:

- Building tree structures with `addSerial()` and `addParallel()`
- Unlimited nesting depth with full type inference
- Accessing inner work results with autocomplete
- Nesting trees inside other trees
- Parent tracking for nested works
- Tree-level `shouldRun`, `onError`, and `silenceError`

### 10. Sealed (`sealed.ts`)

Sealing trees to prevent modifications:

- Simple `seal()` to lock the tree
- `seal(finalWork)` to add a final aggregation step
- `isSealed()` to check if tree is sealed
- `options` to access tree configuration (e.g., `failFast`)
- Running sealed trees
