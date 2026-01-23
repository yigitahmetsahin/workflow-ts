# AGENTS.md

## Project Overview

A TypeScript workflow engine library supporting serial and parallel work execution with full type inference. Published to npm as `@yigitahmetsahin/workflow-ts`.

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

# Lint (ESLint + TypeScript)
npm run lint

# Fix lint issues
npm run lint:fix

# Format code (Prettier)
npm run format

# Check formatting
npm run format:check
```

## Code Style

- TypeScript strict mode enabled
- Use `const` assertions for type inference in workflow definitions
- Prefer async/await over raw promises
- Use descriptive names for work definitions (e.g., `fetchUser`, `processData`)
- Keep execute functions focused on a single responsibility

## Project Structure

```
src/
├── index.ts           # Public exports
├── work.ts            # Work class for standalone work definitions
├── workflow.ts        # Core Workflow class implementation
├── workflow.types.ts  # Type definitions
└── workflow.test.ts   # Unit tests (Vitest)
```

## Testing Instructions

- Run `npm test` before committing any changes
- All tests must pass before merging
- Add tests for any new features or bug fixes
- Tests use Vitest framework
- For timing-related tests, use tolerances (e.g., `toBeGreaterThanOrEqual(45)` instead of exact `50`) to account for CI variance

## Pre-PR Checklist

Before sending any pull request, **ALWAYS run**:

```bash
npm run lint
```

This runs both ESLint and TypeScript type checking. All lint errors must be resolved before submitting a PR.

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

2. Bot automatically creates/updates a release PR on each push to main

3. Merging the release PR:
   - Creates GitHub release with auto-generated changelog
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
// Option 1: Inline work definitions
// Options: { failFast?: boolean }
const workflow = new Workflow<TData>() // or new Workflow<TData>({ failFast: false })
  .serial({ name: 'step1', execute: async (ctx) => value })
  .parallel([
    { name: 'parallel1', execute: async (ctx) => value1 },
    { name: 'parallel2', execute: async (ctx) => value2 },
  ]);

// Option 2: Standalone Work instances (reusable)
const myWork = new Work({
  name: 'myWork',
  execute: async (ctx) => value,
  shouldRun: (ctx) => true, // optional
  onError: (error, ctx) => {}, // optional
  silenceError: true, // optional - don't fail workflow on error
});

const workflow2 = new Workflow<TData>()
  .serial(myWork) // Work instance
  .parallel([work1, work2]); // Work instances or inline definitions can be mixed

// Run workflow
const result = await workflow.run(initialData);

// Access results - workResults.get() returns IWorkResult, not raw value
const step1Result = result.context.workResults.get('step1');
console.log(step1Result.status); // 'completed' | 'failed' | 'skipped'
console.log(step1Result.result); // the actual return value
console.log(step1Result.duration); // execution time in ms

// Option 3: Seal workflow to prevent modifications
const sealed: ISealedWorkflow<TData, TWorkResults> = workflow.seal();
// sealed.serial(...) - TypeScript error! Method doesn't exist
// sealed.parallel(...) - TypeScript error! Method doesn't exist
await sealed.run(initialData); // Only run() is available
```

## Documentation & Testing Requirements

When making code changes, **ALWAYS keep the following up to date**:

1. **Unit Tests** (`src/workflow.test.ts`)
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

## Important Notes

- Do NOT manually bump version in `package.json` - Release Please handles this
- Do NOT create tags manually - Release Please creates them
- The `dist/` folder is gitignored but included in npm package
- npm publishing uses GitHub OIDC trusted publishing (no tokens needed)
- **ALWAYS run `npm install` after adding/updating dependencies** to update `package-lock.json`
