# NPM Dependencies Updater

Smart version management for `package.json` with one-click updates and breaking change detection.

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/cookabc.npm-dependencies-updater)](https://marketplace.visualstudio.com/items?itemName=cookabc.npm-dependencies-updater)
[![Visual Studio Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/cookabc.npm-dependencies-updater)](https://marketplace.visualstudio.com/items?itemName=cookabc.npm-dependencies-updater)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- 🔍 **Smart Version Detection** - Automatically scans `package.json` files and displays real-time version status.
- 🎯 **Risk Analysis** - Distinguishes between safe updates (patch/minor) and risky updates (major versions) with clear icons.
- 🖱️ **One-Click Updates** - Click on CodeLens hints to update your dependencies instantly.
- ⚠️ **Safety Confirmation** - Intelligent modal dialogs when performing batch updates to handle major version risks.
- 📊 **Status Bar Integration** - Real-time summary of available updates in your VS Code status bar.
- 🌍 **Multi-language Support** - Full support for English and Chinese.
- 💾 **Smart Caching** - Efficiently caches NPM registry data to ensure a smooth, non-blocking experience.
- 🔗 **NPM Integration** - Quick links to view package details on npmjs.com.

## 🚀 Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "NPM Dependencies Updater"
4. Click Install

Or install from command line:
```bash
code --install-extension cookabc.npm-dependencies-updater
```

## 🚀 Usage

1. Open any `package.json` file.
2. The extension automatically shows status for each dependency:
   - `✓ Up to date` - Package is already at the latest version.
   - `$(sync~spin) Checking...` - Fetching information from NPM.
   - `$(arrow-up) Update to X.X.X` - Safe update available (click to update).
   - `$(warning) Update to X.X.X Major` - Major version update (use caution).
3. Use the Status Bar summary to see an overview of your project's health.
4. Click "Update All" in the status bar or command palette to batch update safe packages.

## ⚙️ Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `npmDeps.enabled` | `true` | Enable/disable the extension |
| `npmDeps.showPrerelease` | `false` | Include pre-release versions |
| `npmDeps.cacheTTLMinutes` | `60` | Cache TTL in minutes |
| `npmDeps.registryUrl` | `https://registry.npmjs.org` | Custom NPM registry URL |

## 🏗️ Project Structure

```
src/
├── core/           # Core business logic
│   ├── cache.ts           # Cache management
│   ├── packageJsonParser.ts # package.json parsing
│   └── versionResolver.ts # Version risk analysis & resolution
├── providers/      # Service providers
│   ├── codeLensProvider.ts # CodeLens provider
│   ├── npmClient.ts       # NPM API client
│   └── versionService.ts  # Version service
├── utils/          # Utility functions
│   └── statusBar.ts      # Status bar management
├── types/          # Type definitions
│   └── index.ts
└── extension.ts    # Extension entry point
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Run tests
npm test
```

## � Publishing

```bash
# Publish to both VS Code Marketplace and OpenVSX
./publish.sh all

# Publish to VS Code Marketplace only
./publish.sh vsx

# Publish to OpenVSX only
./publish.sh ovsx
```

**Prerequisites:** Azure DevOps Personal Access Token with Marketplace permissions. See [VS Code Publishing Docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) for setup details.

## �📄 License

MIT License. See [LICENSE](LICENSE) for details.
