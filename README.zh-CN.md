# NPM 依赖更新器 (NPM Dependencies Updater)

针对 `package.json` 的智能版本管理工具，支持一键更新和破坏性变更检测。

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/cookabc.npm-dependencies-updater)](https://marketplace.visualstudio.com/items?itemName=cookabc.npm-dependencies-updater)
[![Visual Studio Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/cookabc.npm-dependencies-updater)](https://marketplace.visualstudio.com/items?itemName=cookabc.npm-dependencies-updater)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ 功能特性

- 🔍 **智能版本检测** - 自动扫描 `package.json` 文件并显示实时的版本状态。
- 🎯 **风险分析** - 通过图标清晰区分安全更新（补丁/次要版本）和风险更新（主要版本）。
- 🖱️ **一键更新** - 点击 CodeLens 提示即可立即更新依赖。
- ⚠️ **安全确认** - 在执行批量更新时，通过智能模态对话框处理主要版本风险。
- 📊 **状态栏集成** - 在 VS Code 状态栏中实时显示可更新包的汇总信息。
- 🌍 **多语言支持** - 完美支持英文和中文。
- 💾 **智能缓存** - 高效缓存 NPM 注册表数据，确保流畅、非阻塞的用户体验。
- 🔗 **NPM 集成** - 提供快速链接，直接在 npmjs.com 上查看包详情。

## 🚀 安装

1. 打开 VS Code
2. 进入扩展视图 (Ctrl+Shift+X)
3. 搜索 "NPM Dependencies Updater"
4. 点击安装

或者通过命令行安装：
```bash
code --install-extension cookabc.npm-dependencies-updater
```

## 🚀 使用方法

1. 打开任意 `package.json` 文件。
2. 扩展将自动显示每个依赖的状态：
   - `✓ Up to date` - 包已经是最新版本。
   - `$(sync~spin) Checking...` - 正在从 NPM 获取信息。
   - `$(arrow-up) Update to X.X.X` - 有安全更新可用（点击更新）。
   - `$(warning) Update to X.X.X Major` - 主要版本更新（请谨慎操作）。
3. 使用状态栏汇总查看项目的整体健康状况。
4. 点击状态栏更新通知或使用命令面板批量更新安全包。

## ⚙️ 配置项

| 设置项 | 默认值 | 描述 |
|---------|---------|-------------|
| `npmDeps.enabled` | `true` | 启用/禁用扩展 |
| `npmDeps.showPrerelease` | `false` | 是否包含预发布版本 |
| `npmDeps.cacheTTLMinutes` | `60` | 缓存过期时间（分钟） |
| `npmDeps.registryUrl` | `https://registry.npmjs.org` | 自定义 NPM 注册表地址 |

## 🏗️ 项目结构

```
src/
├── core/           # 核心业务逻辑
│   ├── cache.ts           # 缓存管理
│   ├── packageJsonParser.ts # package.json 解析
│   └── versionResolver.ts # 版本风险分析与解析
├── providers/      # 服务提供者
│   ├── codeLensProvider.ts # CodeLens 提供者
│   ├── npmClient.ts       # NPM API 客户端
│   └── versionService.ts  # 版本服务
├── utils/          # 工具函数
│   └── statusBar.ts      # 状态栏管理
├── types/          # 类型定义
│   └── index.ts
└── extension.ts    # 扩展入口文件
```

## 🛠️ 开发指南

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 运行测试
npm test
```

## 📄 许可证

基于 MIT 许可证开源。详见 [LICENSE](LICENSE) 文件。
