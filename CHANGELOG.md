# Changelog

All notable changes to the "npm-dependencies-updater" extension will be documented in this file.

## [0.2.0] - 2026-02-28

### Added

- `npmDeps.enabled` setting now actively controls extension behavior.
- Configuration change listener — settings take effect immediately without reload.
- Typed `DependencyCodeLens` subclass, eliminating unsafe `as any` casts.

### Improved

- Parallelized "Update All" command using `Promise.allSettled` for significant speed improvement.
- Uses abbreviated NPM registry metadata endpoint (`application/vnd.npm.install-v1+json`) for smaller responses.
- Type-safe `updates` array with proper `ParsedDependency` and `PackageVersionInfo` types.
- `getVersionRange` returns `undefined` instead of a zero-range fallback, preventing silent corruption.
- Fixed `zh-tw`/`zh-hk` locale falling back to non-existent messages (now correctly falls back to `zh-cn`).
- Updated `AGENTS.md` to reflect correct version and TypeScript target.

### Removed

- Removed `test-manual.js` compiled file from repository.

## [0.1.1] - 2026-02-14

### Fixed

- Fixed extension bundling issue where `jsonc-parser` was not correctly included.
- Fixed `lint-staged` configuration.

## [0.0.1] - 2026-02-13

- Initial release of NPM Dependencies Updater.
- Support for scanning `package.json` and checking version status.
- Support for one-click updates with risk detection (major/minor/patch).
- Status bar integration for dependency summary.
- Multi-language support (English/Chinese).
- NPM registry integration.
