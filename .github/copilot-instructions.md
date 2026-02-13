# Copilot Instructions

## Build & Test Commands

```bash
npm run compile        # TypeScript → out/
npm run watch          # Auto-recompile on changes
npm test               # Run all tests
npm run lint           # ESLint

# Run a single test file
npx mocha --require ts-node/register src/test/unit/parser.test.ts

# Run tests matching a pattern
npx mocha --require ts-node/register --grep "pattern" 'src/test/**/*.test.ts'
```

## Architecture

This is a VS Code extension that shows inline CodeLens hints on `package.json` files, displaying version status and enabling one-click updates.

### Data Flow

1. **Activation** (`extension.ts`): Registers a `CodeLensProvider` and `HoverProvider` for `json` and `jsonc` language IDs, plus commands (`npmDeps.updateVersion`, `npmDeps.updateAllVersions`, `npmDeps.showUpToDate`, `npmDeps.openOnNpm`).
2. **Parsing** (`core/packageJsonParser.ts`): Uses `jsonc-parser` to extract dependencies while maintaining range information for updates.
3. **Version Resolution** (`providers/versionService.ts`): Orchestrates cache → NPM fetch → version resolution. Cache is an in-memory Map with configurable TTL.
4. **NPM Client** (`providers/npmClient.ts`): Fetches metadata from configurable registry URL (default `https://registry.npmjs.org`).
5. **Risk Analysis** (`core/versionResolver.ts`): Classifies updates as patch/minor/major. Major updates trigger a confirmation dialog.
6. **CodeLens Rendering** (`providers/codeLensProvider.ts`): Returns placeholder "Checking..." CodeLens items instantly, then resolves each asynchronously via background fetches and UI refresh events.
7. **Status Bar Integration** (`utils/statusBar.ts`): Provides real-time feedback on total update counts and project health.

### Key Types

All interfaces are in `types/index.ts`: `ParsedDependency`, `VersionInfo`, `VersionAnalysis`, `ExtensionConfig`.

## Conventions

- **Configuration namespace**: All VS Code settings use the `npmDeps.` prefix.
- **Commands namespace**: All commands use `npmDeps.` prefix.
- **i18n**: All user-facing commands and configurations are localized via `package.nls.json` and `package.nls.zh-cn.json`.
- **Error handling**: Async operations use try-catch with graceful degradation — failed packages are skipped, never crash the extension.
- **File support**: Supports standard `package.json` and comments in `package.json` (via `jsonc` mode).
- **Testing**: Mocha + Chai for unit tests. Tests live in `src/test/unit/`.
