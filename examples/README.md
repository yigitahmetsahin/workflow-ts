# Examples

This folder contains practical examples of using `@yigitahmetsahin/workflow-ts`.

## Running Examples

First, build the library and install dependencies:

```bash
npm install
npm run build
```

Then run any example with `npx tsx`:

```bash
npx tsx examples/basic.ts
npx tsx examples/parallel.ts
npx tsx examples/conditional.ts
npx tsx examples/error-handling.ts
```

## Examples Overview

### 1. Basic (`basic.ts`)

Simple serial workflow demonstrating:

- Sequential task execution
- Accessing results from previous steps
- Type-safe result access

### 2. Parallel (`parallel.ts`)

Concurrent execution demonstrating:

- Running multiple tasks simultaneously
- Combining parallel results in a final step
- Time savings from parallel execution

### 3. Conditional (`conditional.ts`)

Skip-based workflow demonstrating:

- `shouldRun` condition for optional steps
- Dynamic workflow paths based on input
- Multiple scenarios with same workflow

### 4. Error Handling (`error-handling.ts`)

Error handling demonstrating:

- `onError` callbacks for logging/alerting
- Workflow failure states
- Error recovery patterns
