# Changelog

All notable changes to this project will be documented in this file.

This changelog is automatically managed by [Release Please](https://github.com/googleapis/release-please).

## [1.2.0](https://github.com/yigitahmetsahin/workflow-ts/compare/v1.1.1...v1.2.0) (2026-01-22)


### Features

* add ESLint and Prettier ([7b88fa5](https://github.com/yigitahmetsahin/workflow-ts/commit/7b88fa57ca54f4b90ac7fe482c28d49cd14e70a4))

## [1.1.1](https://github.com/yigitahmetsahin/workflow-ts/compare/v1.1.0...v1.1.1) (2026-01-22)


### Bug Fixes

* update dependencies and documentation ([34fdb5a](https://github.com/yigitahmetsahin/workflow-ts/commit/34fdb5a4a8ff17ce8c0906549dacb2a329fa1afb))

## [1.1.0](https://github.com/yigitahmetsahin/workflow-ts/compare/v1.0.6...v1.1.0) (2026-01-22)

### Features

* add release-please bot for automated releases ([a5c37bf](https://github.com/yigitahmetsahin/workflow-ts/commit/a5c37bfccbbd161642eed7c02fcfd21a2c9bf29b))
* fully automate releases on version bump ([58bd9e1](https://github.com/yigitahmetsahin/workflow-ts/commit/58bd9e132c08b64903435d8073a4a3331e6fe61c))
* use Node 24 and trigger release on tag push ([2e0a385](https://github.com/yigitahmetsahin/workflow-ts/commit/2e0a3854a77377f06968d9e29852c6e4ec02c100))
* use release-please for automated releases ([37a66ed](https://github.com/yigitahmetsahin/workflow-ts/commit/37a66ed50d6116cf2eb790c71d7f379e7ffad638))

### Bug Fixes

* revert to simpler auto-release without bot ([11987af](https://github.com/yigitahmetsahin/workflow-ts/commit/11987af9b3ef903d51e42b280f79df9e40dbc740))

## [1.0.6](https://github.com/yigitahmetsahin/workflow-ts/compare/v1.0.5...v1.0.6) (2026-01-22)

### Bug Fixes

* update npm to latest in CI for OIDC trusted publishing support

## [1.0.5](https://github.com/yigitahmetsahin/workflow-ts/compare/v1.0.4...v1.0.5) (2026-01-22)

### Bug Fixes

* fixed OIDC workflow - removed registry-url to allow automatic OIDC auth

## [1.0.4](https://github.com/yigitahmetsahin/workflow-ts/compare/v1.0.3...v1.0.4) (2026-01-22)

### Bug Fixes

* added NODE_AUTH_TOKEN for npm publish authentication

## [1.0.3](https://github.com/yigitahmetsahin/workflow-ts/compare/v1.0.2...v1.0.3) (2026-01-22)

### Bug Fixes

* updated release workflow for npm OIDC publishing with provenance

## [1.0.2](https://github.com/yigitahmetsahin/workflow-ts/compare/v1.0.1...v1.0.2) (2026-01-22)

### Bug Fixes

* fixed flaky timing tests in CI by adding tolerance for timer resolution variance

## [1.0.1](https://github.com/yigitahmetsahin/workflow-ts/compare/v1.0.0...v1.0.1) (2026-01-22)

### Features

* GitHub Actions CI workflow for automated testing
* GitHub Actions release workflow with npm Trusted Publishers (OIDC)
* comprehensive unit tests with Vitest

### Miscellaneous

* added CHANGELOG.md for tracking version history
* restructured project as npm library with proper exports (ESM + CJS)

## [1.0.0](https://github.com/yigitahmetsahin/workflow-ts/releases/tag/v1.0.0) (2026-01-22)

### Features

* initial release
* `Workflow` class with fluent API for building workflows
* serial work execution with `.serial()` method
* parallel work execution with `.parallel()` method
* full TypeScript type inference for work names and results
* conditional execution with `shouldRun` option
* error handling with `onError` callbacks
* execution timing and duration tracking
* `WorkflowStatus` and `WorkStatus` enums
* type-safe `IWorkResultsMap` for accessing work results
