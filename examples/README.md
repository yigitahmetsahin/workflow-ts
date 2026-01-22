# Examples

This folder contains practical examples of using `@yigitahmetsahin/workflow-ts`.

## Running Examples

Run any example with `npx tsx`:

```bash
npx tsx examples/basic.ts
npx tsx examples/parallel.ts
npx tsx examples/conditional.ts
npx tsx examples/error-handling.ts
npx tsx examples/work-class.ts
```

## Key API Pattern

All examples use the `IWorkResult` pattern for accessing work results:

```typescript
// workResults.get() returns IWorkResult with status, result, duration
const userResult = ctx.workResults.get('fetchUser');

// Access the actual value via .result
const user = userResult.result;

// Or directly chain
const user = ctx.workResults.get('fetchUser').result;

// Check execution status
if (userResult.status === WorkStatus.COMPLETED) {
  console.log('User fetched:', userResult.result);
} else if (userResult.status === WorkStatus.SKIPPED) {
  console.log('User fetch was skipped');
}
```

## Examples Overview

### 1. Basic (`basic.ts`)

Simple serial workflow demonstrating:

- Sequential task execution
- Accessing results from previous steps via `.result`
- Type-safe result access

### 2. Parallel (`parallel.ts`)

Concurrent execution demonstrating:

- Running multiple tasks simultaneously
- Combining parallel results in a final step
- Time savings from parallel execution

### 3. Conditional (`conditional.ts`)

Skip-based workflow demonstrating:

- `shouldRun` condition for optional steps
- Checking work status (completed vs skipped)
- Dynamic workflow paths based on input
- Multiple scenarios with same workflow

### 4. Error Handling (`error-handling.ts`)

Error handling demonstrating:

- `onError` callbacks for logging/alerting
- Workflow failure states
- Accessing error details via `IWorkResult.error`
- Error recovery patterns

### 5. Work Class (`work-class.ts`)

Standalone work definitions demonstrating:

- Defining reusable `Work` instances
- Using Work instances in `.serial()` and `.parallel()`
- Mixing Work instances with inline definitions
- Reusing the same Work across multiple workflows
- Conditional execution with Work class
