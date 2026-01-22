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
// Core workflow creation
const workflow = new Workflow<TData>()
  .serial({ name: 'step1', execute: async (data, results) => value })
  .parallel([
    { name: 'parallel1', execute: async (data, results) => value1 },
    { name: 'parallel2', execute: async (data, results) => value2 },
  ]);

// Run workflow
const result = await workflow.run(initialData);
// result.results contains typed results: { step1, parallel1, parallel2 }
```

## Important Notes

- Do NOT manually bump version in `package.json` - Release Please handles this
- Do NOT create tags manually - Release Please creates them
- The `dist/` folder is gitignored but included in npm package
- npm publishing uses GitHub OIDC trusted publishing (no tokens needed)
- **ALWAYS run `npm install` after adding/updating dependencies** to update `package-lock.json`