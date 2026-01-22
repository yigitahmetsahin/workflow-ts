# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2026-01-22

### Added
- CHANGELOG.md for tracking version history
- GitHub Actions CI workflow for automated testing
- GitHub Actions release workflow with npm Trusted Publishers (OIDC)
- Comprehensive unit tests with Vitest

### Changed
- Restructured project as npm library with proper exports (ESM + CJS)

## [1.0.0] - 2026-01-22

### Added
- Initial release
- `Workflow` class with fluent API for building workflows
- Serial work execution with `.serial()` method
- Parallel work execution with `.parallel()` method
- Full TypeScript type inference for work names and results
- Conditional execution with `shouldRun` option
- Error handling with `onError` callbacks
- Execution timing and duration tracking
- `WorkflowStatus` and `WorkStatus` enums
- Type-safe `IWorkResultsMap` for accessing work results

[Unreleased]: https://github.com/yigitahmetsahin/workflow-ts/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/yigitahmetsahin/workflow-ts/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/yigitahmetsahin/workflow-ts/releases/tag/v1.0.0
