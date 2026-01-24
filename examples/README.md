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
npx tsx examples/sealed.ts
```

## Key API Pattern

All examples use the `WorkResult` pattern for accessing work results:

```typescript
// workResults.get() returns WorkResult with status, result, duration
const userResult = ctx.workResults.get('fetchUser');

// Access the actual value via .result
const user = userResult.result;

// Or directly chain
const user = ctx.workResults.get('fetchUser').result;

// Check execution status
if (userResult.status === 'completed') {
  console.log('User fetched:', userResult.result);
} else if (userResult.status === 'skipped') {
  console.log('User fetch was skipped');
}
```

## Sealing Workflows

Use `.seal()` to prevent further modifications to a workflow:

```typescript
// Seal a workflow to expose name, works, options, isSealed(), and run()
const sealed = new Workflow<{ userId: string }>()
  .serial({ name: 'validate', execute: async (ctx) => true })
  .seal();

sealed.name; // 'seal'
sealed.works; // readonly array of work definitions
sealed.options; // { failFast: true }
sealed.isSealed(); // true
await sealed.run({ userId: '123' }); // OK

// sealed.serial(...) // TypeScript error! Method doesn't exist
// sealed.parallel(...) // TypeScript error! Method doesn't exist
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
- Accessing error details via `WorkResult.error`
- Error recovery patterns

### 5. Work Class (`work-class.ts`)

Standalone work definitions demonstrating:

- Defining reusable `Work` instances
- Using Work instances in `.serial()` and `.parallel()`
- Mixing Work instances with inline definitions
- Reusing the same Work across multiple workflows
- Conditional execution with Work class

### 6. Sealed (`sealed.ts`)

Immutable workflow pattern demonstrating:

- Using `.seal()` to prevent modifications
- Factory functions that return `ISealedWorkflow`
- Type-safe workflow distribution
- Reusing sealed workflows with different data
