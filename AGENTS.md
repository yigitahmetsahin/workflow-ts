# AGENTS.md

## Project Overview

A TypeScript workflow engine library supporting serial and parallel work execution with full type inference. Published to npm as `@yigitahmetsahin/work-tree`.

## Setup Commands

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Lint, format, and type-check (auto-fixes issues)
npm run lint

# Check only (no auto-fix, used in CI)
npm run lint:check
```

## Code Style

- TypeScript strict mode enabled
- Use `const` assertions for type inference in workflow definitions
- Prefer async/await over raw promises
- Use descriptive names for work definitions (e.g., `fetchUser`, `processData`)
- Keep execute functions focused on a single responsibility

### Interface vs Type Convention

- **Use `interface`** for contracts that will be implemented by classes (e.g., `IWorkDefinition`, `ITreeWorkDefinition`, `IWorkResultsMap`, `IRunnableTreeWork`)
- **Use `type`** for data structures, return types, and type aliases that are not implemented (e.g., `WorkResult`, `TreeResult`, `WorkflowContext`, `SealedTreeWork`, `WorkBehaviorOptions`, `TreeWorkStep`)
- **Use enums** for status values (e.g., `enum WorkStatus { Completed = 'completed', Failed = 'failed', Skipped = 'skipped' }`)

This distinction helps clarify intent: interfaces define behavior contracts, types define data shapes. Enums provide type safety and prevent `@typescript-eslint/no-unsafe-enum-comparison` errors in consuming projects.

### Type File Policy (STRICT)

**All types MUST be defined in type files.** Do NOT define types directly in class files or implementation files.

Type files:

- `work.types.ts` - Core types (WorkResult, WorkStatus, IWorkDefinition, etc.)
- `tree-work.types.ts` - TreeWork-specific types that reference the TreeWork class

**Note on circular dependencies:** Types that reference the `TreeWork` class (like `ExtractTreeAccumulated`, `WorksToRecord`) are in `tree-work.types.ts` using `import type` which TypeScript handles specially - it's erased at compile time, avoiding runtime circular dependencies.

This policy ensures:

- Single source of truth for type definitions
- Easier navigation and maintenance
- Clear separation between types and implementation

### File Organization Policy (STRICT)

**One class per file.** Each class should have its own dedicated file.

- `work.ts` - `Work` class only
- `tree-work.ts` - `TreeWork` class only

**Error classes go in `src/errors/`.** All errors extend `WorkTreeError`:

- `errors/base-error.ts` - `WorkTreeError` base class
- `errors/timeout-error.ts` - `TimeoutError` (extends `WorkTreeError`)
- `errors/index.ts` - Re-exports all errors

**Helper functions go in `src/helpers/`.** Internal helper functions (not part of public API):

- `helpers/sleep.ts` - Sleep utility
- `helpers/retry.ts` - Retry normalization and delay calculation
- `helpers/timeout.ts` - Timeout normalization and execution
- `helpers/index.ts` - Re-exports all helpers

**Utility functions go in `src/utils/`.** Public utility functions (exported in public API):

- `utils/work-utils.ts` - Work-related utilities (`isTreeWorkDefinition`, `getWorkDefinition`)
- `utils/index.ts` - Re-exports all utilities

## Project Structure

```
src/
├── index.ts              # Public exports
├── work.ts               # Work class (leaf work)
├── tree-work.ts          # TreeWork class (tree work with serial/parallel)
├── work.types.ts         # Core type definitions
├── tree-work.types.ts    # TreeWork-specific types (uses import type)
├── work-results-map.ts   # Internal WorkResultsMap implementation
├── errors/               # Error classes (exported)
│   ├── index.ts          # Re-exports all errors
│   ├── base-error.ts     # WorkTreeError base class
│   └── timeout-error.ts  # TimeoutError
├── helpers/              # Internal helper functions (not exported)
│   ├── index.ts          # Re-exports all helpers
│   ├── sleep.ts          # Sleep utility
│   ├── retry.ts          # Retry helpers
│   └── timeout.ts        # Timeout helpers
├── utils/                # Public utility functions (exported)
│   ├── index.ts          # Re-exports all utilities
│   └── work-utils.ts     # Work-related utilities
├── work.test.ts          # Unit tests for Work class (Vitest)
└── tree-work.test.ts     # Unit tests for TreeWork (Vitest)
```

## Testing Instructions

- Run `npm test` before committing any changes
- All tests must pass before merging
- Add tests for any new features or bug fixes
- Tests use Vitest framework
- For timing-related tests, use tolerances (e.g., `toBeGreaterThanOrEqual(45)` instead of exact `50`) to account for CI variance

### Test-Driven Development (TDD)

**Always use TDD when implementing new features or fixing bugs:**

1. **Write tests first** - Write tests that define the expected behavior before writing implementation code
2. **Run tests to see them fail** - Verify the tests fail as expected (red phase)
3. **Implement the feature** - Write the minimum code needed to make tests pass (green phase)
4. **Refactor if needed** - Clean up the code while keeping tests passing (refactor phase)

Benefits of TDD:

- Forces clear understanding of requirements before coding
- Ensures test coverage for new functionality
- Produces more modular, testable code
- Documents expected behavior through tests

Example workflow:

```bash
# 1. Write failing tests
npm test  # Tests fail ❌

# 2. Implement feature
# ... write code ...

# 3. Verify tests pass
npm test  # Tests pass ✅

# 4. Refactor and verify
npm test  # Still passing ✅
```

## Pre-Commit Checklist

Before committing any changes, **ALWAYS run**:

```bash
npm run lint
```

This automatically:

1. Formats all files with Prettier
2. Fixes ESLint issues
3. Runs TypeScript type checking

All errors must be resolved before committing. The formatted files will be staged automatically.

## Editor Setup

This project includes VS Code settings (`.vscode/settings.json`) that:

- Auto-format on save with Prettier
- Auto-fix ESLint issues on save

Install the [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) and [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) VS Code extensions for the best experience.

## Build System

- Uses `tsup` for building ESM, CJS, and DTS outputs
- Output goes to `dist/` folder
- Build command: `npm run build`

## Release Process (Automated)

This project uses **Release Please** bot for automated releases:

1. Use conventional commits:
   - `feat:` → minor version bump (new features)
   - `fix:` → patch version bump (bug fixes)
   - `feat!:` or `BREAKING CHANGE:` → major version bump
   - `docs:`, `chore:`, `refactor:` → no release

2. Bot automatically opens/updates a release PR on each push to main

3. Merging the release PR:
   - Generates GitHub release with auto-generated changelog
   - Publishes to npm with OIDC provenance

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Examples:

- `feat: add retry mechanism for failed works`
- `fix: handle null values in parallel execution`
- `docs: update README with new examples`

## Key Types

```typescript
// Build a tree with serial and parallel steps
const tree = Work.tree('myTree')
  .addSerial({ name: 'step1', execute: async (ctx) => value })
  .addParallel([
    { name: 'parallel1', execute: async (ctx) => value1 },
    { name: 'parallel2', execute: async (ctx) => value2 },
  ])
  .addSerial({
    name: 'step2',
    execute: async (ctx) => {
      // Access previous work results
      const step1 = ctx.workResults.get('step1').result;
      return step1;
    },
  });

// Standalone Work instances (reusable)
const myWork = new Work({
  name: 'myWork',
  execute: async (ctx) => value,
  shouldRun: (ctx) => true, // optional
  onBefore: (ctx) => console.log('Starting work...'), // optional - called before execute
  onAfter: (ctx, outcome) => console.log(`Done: ${outcome.status}`), // optional - called after execute
  onError: (error, ctx) => {}, // optional
  onSkipped: (ctx) => {}, // optional - called when shouldRun returns false
  silenceError: true, // optional - don't fail tree on error
  retry: 3, // optional - retry up to 3 times on failure
  timeout: 5000, // optional - timeout for entire work (including all retries)
});

// Retry with full configuration
const retryWork = new Work({
  name: 'retryWork',
  execute: async (ctx) => fetchData(),
  retry: {
    maxRetries: 5,
    delay: 1000, // 1 second initial delay
    backoff: 'exponential', // 'fixed' | 'exponential'
    backoffMultiplier: 2, // delay grows: 1s, 2s, 4s...
    maxDelay: 30000, // cap at 30 seconds
    attemptTimeout: 5000, // optional - timeout for each individual attempt
    shouldRetry: (error, attempt, ctx) => !error.message.includes('401'),
    onRetry: (error, attempt, ctx) => console.log(`Retry ${attempt}...`),
  },
});

// Timeout with full configuration
const timeoutWork = new Work({
  name: 'timeoutWork',
  execute: async (ctx) => slowOperation(),
  timeout: {
    ms: 10000, // 10 second timeout for entire work
    onTimeout: (ctx) => console.log('Operation timed out'), // optional callback
  },
});

// Timeout hierarchy: work timeout wraps all retries, attemptTimeout per attempt
const timeoutRetryWork = new Work({
  name: 'timeoutRetry',
  execute: async (ctx) => unreliableService(),
  timeout: 30000, // 30s total for all attempts combined
  retry: {
    maxRetries: 3,
    attemptTimeout: 5000, // 5s per individual attempt - triggers retry on timeout
  },
});

// Use Work instances in trees
const tree2 = Work.tree('tree2').addSerial(myWork).addParallel([work1, work2]);

// Nested trees
const innerTree = Work.tree('inner').addSerial({
  name: 'innerStep',
  execute: async () => 'a',
});

const outerTree = Work.tree('outer')
  .addSerial(innerTree)
  .addSerial({
    name: 'afterInner',
    execute: async (ctx) => {
      // Access inner tree's work results!
      const inner = ctx.workResults.get('innerStep').result;
      return inner;
    },
  });

// Tree-level options
const conditionalTree = Work.tree('conditional', {
  failFast: true, // Stop on first error (default: true)
  shouldRun: (ctx) => ctx.data.isEnabled, // Skip entire tree
  silenceError: true, // Don't fail parent on error
  onBefore: (ctx) => console.log('Starting tree...'), // Called before steps
  onAfter: (ctx, outcome) => console.log(`Done: ${outcome.status}`), // Called after completion
  onError: (error, ctx) => {}, // Handle tree errors
  onSkipped: (ctx) => {}, // Called when tree is skipped
  timeout: 60000, // Timeout entire tree after 60 seconds
}).addSerial({ name: 'work', execute: async () => 'result' });

// Lifecycle hooks with full example
const treeWithHooks = Work.tree('withHooks', {
  onBefore: async (ctx) => {
    // Called after shouldRun passes, before steps execute
    console.log('Tree starting with data:', ctx.data);
  },
  onAfter: async (ctx, outcome) => {
    // Called after steps complete (success or failure)
    // outcome: { status, result?, error?, workResults }
    if (outcome.status === WorkStatus.Completed) {
      console.log('Tree completed with result:', outcome.result);
    } else {
      console.log('Tree failed with error:', outcome.error?.message);
    }
  },
})
  .addSerial({ name: 'step1', execute: async () => 'a' })
  .addSerial({ name: 'step2', execute: async () => 'b' });

// For full type inference on workResults, use setOnAfter() method
const treeWithTypedOnAfter = Work.tree('typed')
  .addSerial({ name: 'fetchUser', execute: async () => ({ id: 1, name: 'John' }) })
  .addSerial({ name: 'fetchOrders', execute: async () => [{ orderId: 100 }] })
  .setOnAfter(async (ctx, outcome) => {
    // ✅ Full type inference!
    const user = outcome.workResults.get('fetchUser').result; // { id: number, name: string }
    const orders = outcome.workResults.get('fetchOrders').result; // Array<{ orderId: number }>
    console.log(`User ${user?.name} has ${orders?.length} orders`);
  });

// Seal tree to prevent modifications
const sealed = tree.seal();
// sealed.addSerial(...) // TypeScript error - no such method

// Seal with final work
const sealedWithFinal = tree.seal({
  name: 'finalize',
  execute: async (ctx) => 'done',
});

// Check tree state
tree.isSealed(); // boolean
tree.options; // { failFast: boolean }

// Run tree directly
const result = await tree.run(initialData);

// Access results - workResults.get() returns WorkResult, not raw value
const step1Result = result.context.workResults.get('step1');
console.log(step1Result.status); // WorkStatus.Completed | WorkStatus.Failed | WorkStatus.Skipped
console.log(step1Result.result); // the actual return value
console.log(step1Result.duration); // execution time in ms
console.log(step1Result.parent); // parent tree name (if nested), or undefined
console.log(step1Result.attempts); // total attempts (1 = no retries, 2+ = retried)

// Check tree status
if (result.status === WorkStatus.Completed) {
  console.log('Success!', result.totalDuration);
} else {
  console.log('Failed:', result.error);
}
```

## Documentation & Testing Requirements

When making code changes, **ALWAYS keep the following up to date**:

1. **Unit Tests** (`src/tree-work.test.ts`)
   - Add tests for new features or bug fixes
   - Update existing tests when API changes

2. **Documentation**
   - `README.md` - User-facing documentation and API examples
   - `AGENTS.md` - Developer/agent instructions and key types
   - `examples/README.md` - Examples overview

3. **Examples** (`examples/*.ts`)
   - Update to reflect current API usage
   - Ensure all examples are runnable and correct

Documentation, tests, and examples should be updated **in the same PR** as the code changes, not as a follow-up.

## Branching Policy

**CRITICAL: ALWAYS start a NEW branch from `main` for EVERY change.** Never reuse or add commits to an existing branch, even if it seems related. Each task/fix/feature gets its own fresh branch.

- **Each feature or fix requires a separate branch** - never push multiple unrelated changes to the same branch
- **NEVER use an existing branch** - always run `git checkout main && git pull && git checkout -b <new-branch>` before starting any work
- Branch naming convention:
  - Features: `feat/<short-description>` (e.g., `feat/retry-mechanism`)
  - Bug fixes: `fix/<short-description>` (e.g., `fix/null-handling`)
  - Refactors: `refactor/<short-description>`
  - Docs: `docs/<short-description>` (e.g., `docs/update-readme`)
- **One PR per feature/fix** - do not combine unrelated changes in a single PR
- Always start branches from the latest `main`
- After a PR is merged, start a new branch for the next change - do not reuse merged branches
- If you find yourself on an existing branch that isn't `main`, switch to `main` first before starting a new branch

## Important Notes

- Do NOT manually bump version in `package.json` - Release Please handles this
- Do NOT make tags manually - Release Please handles them
- The `dist/` folder is gitignored but included in npm package
- npm publishing uses GitHub OIDC trusted publishing (no tokens needed)
- **ALWAYS run `npm install` after adding/updating dependencies** to update `package-lock.json`
