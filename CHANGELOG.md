# Changelog

All notable changes to this project will be documented in this file.

This changelog is automatically managed by [Release Please](https://github.com/googleapis/release-please).

## [6.4.2](https://github.com/yigitahmetsahin/work-tree/compare/v6.4.1...v6.4.2) (2026-01-28)


### Refactoring

* update wording throughout codebase ([063a0b8](https://github.com/yigitahmetsahin/work-tree/commit/063a0b823939ab39b80b2e8e22587266d478a274))

## [6.4.1](https://github.com/yigitahmetsahin/work-tree/compare/v6.4.0...v6.4.1) (2026-01-28)


### Refactoring

* reorganize codebase with dedicated folders for helpers, utils, and errors ([3329f6d](https://github.com/yigitahmetsahin/work-tree/commit/3329f6db25ab86285d6f058986fa7e9bd766b310))

## [6.4.0](https://github.com/yigitahmetsahin/work-tree/compare/v6.3.0...v6.4.0) (2026-01-28)


### Features

* add timeout support for works and trees ([2b5319c](https://github.com/yigitahmetsahin/work-tree/commit/2b5319cbe77ad8acd9026e955d6b9674dc1a4591))

## [6.3.0](https://github.com/yigitahmetsahin/work-tree/compare/v6.2.0...v6.3.0) (2026-01-28)


### Features

* add retry mechanism for failed works ([d55729e](https://github.com/yigitahmetsahin/work-tree/commit/d55729e0a8afa53155aabf7dcf7d387d79d19f5c))

## [6.2.0](https://github.com/yigitahmetsahin/work-tree/compare/v6.1.2...v6.2.0) (2026-01-28)


### Features

* add onSkipped hook for conditional work execution ([27551e7](https://github.com/yigitahmetsahin/work-tree/commit/27551e721625623094be5df22e2f21680cba0569))

## [6.1.2](https://github.com/yigitahmetsahin/work-tree/compare/v6.1.1...v6.1.2) (2026-01-26)


### Bug Fixes

* use unique symbol brand for SealedTreeWork to enforce nominal typing ([f6c98d6](https://github.com/yigitahmetsahin/work-tree/commit/f6c98d6ee76718d19a57281ca2e9cde0145c7e13))

## [6.1.1](https://github.com/yigitahmetsahin/work-tree/compare/v6.1.0...v6.1.1) (2026-01-25)


### Bug Fixes

* preserve workResults inference when using Work.tree&lt;TData&gt;() ([6998181](https://github.com/yigitahmetsahin/work-tree/commit/69981814c9117eb7f7087e500d8653fe4fe606a0))

## [6.1.0](https://github.com/yigitahmetsahin/work-tree/compare/v6.0.0...v6.1.0) (2026-01-25)


### Features

* **examples:** add minimal quick-start example ([1f2fff2](https://github.com/yigitahmetsahin/work-tree/commit/1f2fff2aba2c6ad9d923c884822188ccf1e6102c))

## [6.0.0](https://github.com/yigitahmetsahin/work-tree/compare/v5.2.0...v6.0.0) (2026-01-25)


### ⚠ BREAKING CHANGES

* This is a major API redesign.

### Features

* unify Work and TreeWork API, remove Workflow class ([2357464](https://github.com/yigitahmetsahin/work-tree/commit/235746476fbc30405e65e116c945cd5b1e8cfb6a))

## [5.2.0](https://github.com/yigitahmetsahin/work-tree/compare/v5.1.0...v5.2.0) (2026-01-25)


### Features

* add nested workflow groups with 5-level type inference ([7124579](https://github.com/yigitahmetsahin/work-tree/commit/712457956cedee604cf12c28871b2eb5dc770713))

## [5.1.0](https://github.com/yigitahmetsahin/work-tree/compare/v5.0.0...v5.1.0) (2026-01-25)


### Features

* always call onError immediately regardless of failFast ([a33d2b7](https://github.com/yigitahmetsahin/work-tree/commit/a33d2b71568f9f98c436d27722e7915dd3cde0b2))

## [5.0.0](https://github.com/yigitahmetsahin/work-tree/compare/v4.1.0...v5.0.0) (2026-01-25)


### ⚠ BREAKING CHANGES

* onError is no longer called when silenceError is true. If you relied on onError being called for silenced errors, remove silenceError and handle continuation in onError by not throwing.

### Features

* let onError control workflow continuation ([e31fbbe](https://github.com/yigitahmetsahin/work-tree/commit/e31fbbe1968ce366c15bc2faf763e67c5c469432))

## [4.1.0](https://github.com/yigitahmetsahin/work-tree/compare/v4.0.0...v4.1.0) (2026-01-25)


### Features

* call onError immediately in parallel works when failFast is true ([90e83ee](https://github.com/yigitahmetsahin/work-tree/commit/90e83eedc41cc18c2c27793cbeedf1abb061cfff))

## [4.0.0](https://github.com/yigitahmetsahin/work-tree/compare/v3.4.6...v4.0.0) (2026-01-24)


### ⚠ BREAKING CHANGES

* Status values are now enum members instead of string literals. Consumers should update comparisons from:   result.status === 'completed'

### Features

* convert WorkStatus and WorkflowStatus to enums ([934608a](https://github.com/yigitahmetsahin/work-tree/commit/934608ab385b7dc966b4edcac0b0fc69703359d8))

## [3.4.6](https://github.com/yigitahmetsahin/work-tree/compare/v3.4.5...v3.4.6) (2026-01-24)


### Refactoring

* rename type aliases to remove I prefix ([00b3fc3](https://github.com/yigitahmetsahin/work-tree/commit/00b3fc3ce855e3bd2d2adfc2b9c3c2f07dd984dd))

## [3.4.5](https://github.com/yigitahmetsahin/work-tree/compare/v3.4.4...v3.4.5) (2026-01-24)


### Bug Fixes

* use default semver versioning for release-please ([b74f2c7](https://github.com/yigitahmetsahin/work-tree/commit/b74f2c7e88ec8e1bc261b416b38576f2e7c0dd4c))

## [3.4.4](https://github.com/yigitahmetsahin/work-tree/compare/v3.4.3...v3.4.4) (2026-01-24)


### Features

* implement seal() with final work execution ([bb2ec36](https://github.com/yigitahmetsahin/work-tree/commit/bb2ec36ded1d099270a478507e5d48186ab27098))

## [3.4.3](https://github.com/yigitahmetsahin/work-tree/compare/v3.4.2...v3.4.3) (2026-01-24)


### Refactoring

* use types instead of interfaces for data structures and string unions for enums ([231a316](https://github.com/yigitahmetsahin/work-tree/commit/231a316f1600defe2bf0aec526f7f325d3fece02))

## [3.4.2](https://github.com/yigitahmetsahin/work-tree/compare/v3.4.1...v3.4.2) (2026-01-23)


### Refactoring

* simplify seal API and add works/options access ([9298101](https://github.com/yigitahmetsahin/work-tree/commit/9298101c38cfaba3dc41665f9faf71acf2554d9e))

## [3.4.1](https://github.com/yigitahmetsahin/work-tree/compare/v3.4.0...v3.4.1) (2026-01-23)


### Bug Fixes

* use release-please manifest mode to read config ([b4f2a55](https://github.com/yigitahmetsahin/work-tree/commit/b4f2a554da494e6f570337a9ae6ecd96a03b6c90))
* use v{version} tag format for release-please ([6b30461](https://github.com/yigitahmetsahin/work-tree/commit/6b3046188346b9018411119d72fec77b09490007))


### Refactoring

* remove unnecessary type casts in workflow execution ([41c926a](https://github.com/yigitahmetsahin/work-tree/commit/41c926a04fb40c80f033b691ca4f74566cf18849))

## [3.4.0](https://github.com/yigitahmetsahin/work-tree/compare/v3.3.0...v3.4.0) (2026-01-23)


### Features

* expose ISealingWorkDefinition type for sealing workflows ([49ccaaf](https://github.com/yigitahmetsahin/work-tree/commit/49ccaafb7e9e03a6a2f2dbe904b78d1483f592a6))

## [3.3.0](https://github.com/yigitahmetsahin/work-tree/compare/v3.2.0...v3.3.0) (2026-01-23)


### Features

* add seal method to workflow ([b60b00a](https://github.com/yigitahmetsahin/work-tree/commit/b60b00ac969947db4343aca02b5f4b052000eef8))

## [3.2.0](https://github.com/yigitahmetsahin/work-tree/compare/v3.1.0...v3.2.0) (2026-01-22)


### Features

* add failFast option to Workflow constructor ([e794622](https://github.com/yigitahmetsahin/work-tree/commit/e794622f1176419ee6e3503eba44c691ced1c811))
* add silenceError option to Workflow constructor ([b4083a6](https://github.com/yigitahmetsahin/work-tree/commit/b4083a6d861b690a4fe4f2123657d3c3c674db93))

## [3.1.0](https://github.com/yigitahmetsahin/work-tree/compare/v3.0.0...v3.1.0) (2026-01-22)


### Features

* add silenceError option to continue workflow on work failure ([44537de](https://github.com/yigitahmetsahin/work-tree/commit/44537de06b7cf300e123fa991c138e2af1a9e8f5))

## [3.0.0](https://github.com/yigitahmetsahin/work-tree/compare/v2.1.0...v3.0.0) (2026-01-22)


### ⚠ BREAKING CHANGES

* WorkGroup, isWorkGroup, WORK_GROUP_SYMBOL, when(), and getAny() have been removed. Use chained .serial() and .parallel() calls.

### Features

* add getAny() for non-chained workflow building ([96d717b](https://github.com/yigitahmetsahin/work-tree/commit/96d717b247aeb4a0aa18924febb9b65051da54af))
* add WorkGroup for dynamic parallel work building ([8220c7c](https://github.com/yigitahmetsahin/work-tree/commit/8220c7c72f3c44bbaee247b966b6000052ecc437))
* simplify API to chaining-only workflow building ([6c92fda](https://github.com/yigitahmetsahin/work-tree/commit/6c92fda42e6ccf56b7c6d08dab7b55955f0045e2))


### Bug Fixes

* use chained workflow methods to preserve type inference ([090f702](https://github.com/yigitahmetsahin/work-tree/commit/090f7025bb0397025a5d4327de83ef11dbc8f830))

## [2.1.0](https://github.com/yigitahmetsahin/work-tree/compare/v2.0.0...v2.1.0) (2026-01-22)


### Features

* add Work class for standalone work definitions ([24dcae4](https://github.com/yigitahmetsahin/work-tree/commit/24dcae4a82b7bc5d8b5fda2c63851830afd476ac))

## [2.0.0](https://github.com/yigitahmetsahin/work-tree/compare/v1.2.1...v2.0.0) (2026-01-22)


### ⚠ BREAKING CHANGES

* ctx.workResults.get() now returns IWorkResult<T> instead of T. Access the value via .result property: ctx.workResults.get('name').result

### Features

* workResults.get returns IWorkResult instead of raw value ([9067ca0](https://github.com/yigitahmetsahin/work-tree/commit/9067ca071a0f3878ad5d87de42ad0a0c92c3d16a))


### Bug Fixes

* resolve TypeScript errors in conditional example ([9f87e4e](https://github.com/yigitahmetsahin/work-tree/commit/9f87e4eb6fff26937277f512e8a2567c8c0bdeb5))

## [1.2.1](https://github.com/yigitahmetsahin/work-tree/compare/v1.2.0...v1.2.1) (2026-01-22)


### Bug Fixes

* correct examples to use relative imports and proper API ([4125ee0](https://github.com/yigitahmetsahin/work-tree/commit/4125ee03acc9d14c416478071d183f79454461b3))
* suppress necessary any type warnings with eslint comments ([acd8f72](https://github.com/yigitahmetsahin/work-tree/commit/acd8f7292e6d05c0b8a1ab9701b9847ac246edaf))

## [1.2.0](https://github.com/yigitahmetsahin/work-tree/compare/v1.1.1...v1.2.0) (2026-01-22)


### Features

* add ESLint and Prettier ([7b88fa5](https://github.com/yigitahmetsahin/work-tree/commit/7b88fa57ca54f4b90ac7fe482c28d49cd14e70a4))

## [1.1.1](https://github.com/yigitahmetsahin/work-tree/compare/v1.1.0...v1.1.1) (2026-01-22)


### Bug Fixes

* update dependencies and documentation ([34fdb5a](https://github.com/yigitahmetsahin/work-tree/commit/34fdb5a4a8ff17ce8c0906549dacb2a329fa1afb))

## [1.1.0](https://github.com/yigitahmetsahin/work-tree/compare/v1.0.6...v1.1.0) (2026-01-22)

### Features

* add release-please bot for automated releases ([a5c37bf](https://github.com/yigitahmetsahin/work-tree/commit/a5c37bfccbbd161642eed7c02fcfd21a2c9bf29b))
* fully automate releases on version bump ([58bd9e1](https://github.com/yigitahmetsahin/work-tree/commit/58bd9e132c08b64903435d8073a4a3331e6fe61c))
* use Node 24 and trigger release on tag push ([2e0a385](https://github.com/yigitahmetsahin/work-tree/commit/2e0a3854a77377f06968d9e29852c6e4ec02c100))
* use release-please for automated releases ([37a66ed](https://github.com/yigitahmetsahin/work-tree/commit/37a66ed50d6116cf2eb790c71d7f379e7ffad638))

### Bug Fixes

* revert to simpler auto-release without bot ([11987af](https://github.com/yigitahmetsahin/work-tree/commit/11987af9b3ef903d51e42b280f79df9e40dbc740))

## [1.0.6](https://github.com/yigitahmetsahin/work-tree/compare/v1.0.5...v1.0.6) (2026-01-22)

### Bug Fixes

* update npm to latest in CI for OIDC trusted publishing support

## [1.0.5](https://github.com/yigitahmetsahin/work-tree/compare/v1.0.4...v1.0.5) (2026-01-22)

### Bug Fixes

* fixed OIDC workflow - removed registry-url to allow automatic OIDC auth

## [1.0.4](https://github.com/yigitahmetsahin/work-tree/compare/v1.0.3...v1.0.4) (2026-01-22)

### Bug Fixes

* added NODE_AUTH_TOKEN for npm publish authentication

## [1.0.3](https://github.com/yigitahmetsahin/work-tree/compare/v1.0.2...v1.0.3) (2026-01-22)

### Bug Fixes

* updated release workflow for npm OIDC publishing with provenance

## [1.0.2](https://github.com/yigitahmetsahin/work-tree/compare/v1.0.1...v1.0.2) (2026-01-22)

### Bug Fixes

* fixed flaky timing tests in CI by adding tolerance for timer resolution variance

## [1.0.1](https://github.com/yigitahmetsahin/work-tree/compare/v1.0.0...v1.0.1) (2026-01-22)

### Features

* GitHub Actions CI workflow for automated testing
* GitHub Actions release workflow with npm Trusted Publishers (OIDC)
* comprehensive unit tests with Vitest

### Miscellaneous

* added CHANGELOG.md for tracking version history
* restructured project as npm library with proper exports (ESM + CJS)

## [1.0.0](https://github.com/yigitahmetsahin/work-tree/releases/tag/v1.0.0) (2026-01-22)

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
