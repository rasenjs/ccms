# Claude Code Model Switcher

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey.svg)

一个基于 Electron 的系统托盘应用，用于快速切换 Claude Code 的模型配置。

[功能特性](#功能特性) •
[安装使用](#安装使用) •
[CLI 工具](#cli-工具) •
[开发指南](#开发指南)

</div>

---

## 功能特性

### 🚀 一键切换模型来源

- 系统托盘菜单快速切换不同 Provider（Kimi、GLM、Anthropic、DeepSeek、Copilot）
- 自动更新 `~/.claude/settings.json` 配置文件
- 切换时自动备份和清除会话缓存
- 托盘图标显示当前激活状态

### 🎯 灵活配置模型

- 支持配置四种模型角色：**Opus**、**Sonnet**、**Haiku**、**Subagent**
- **API 自动拉取**：从各 Provider API 获取最新可用模型列表
- 下拉选择或手动输入模型 ID
- 每个 Provider 独立保存配置，支持预设模板

### 🔐 安全凭证管理

- 加密存储各 Provider 的 API Token
- 支持配置 Base URL、超时时间等参数
- 内置连接测试功能验证凭证有效性

### 🤖 Copilot 深度集成

- **一键安装管理**：自动检测并安装 `copilot-api`
- **服务管理**：启动/停止代理服务，实时状态监控
- **OAuth 认证**：简化 GitHub 认证流程
- Token 自动管理和状态显示

---

## 支持的 Provider

| Provider      | 名称           | Base URL                                 | 特点                  |
| ------------- | -------------- | ---------------------------------------- | --------------------- |
| **Kimi K2**   | Moonshot AI    | `https://api.moonshot.cn/anthropic`      | 支持长上下文          |
| **GLM**       | 智谱 AI        | `https://open.bigmodel.cn/api/anthropic` | 国内高速访问          |
| **Anthropic** | Claude 官方    | `https://api.anthropic.com`              | 原生支持              |
| **DeepSeek**  | DeepSeek V3    | `https://api.deepseek.com/anthropic`     | 经济实惠              |
| **Copilot**   | GitHub Copilot | `http://localhost:4141`                  | 通过 copilot-api 代理 |

---

## 安装使用

### 🖥️ 桌面应用

#### 下载安装

从 [Releases](https://github.com/yourusername/cc-models-provider-switcher/releases) 页面下载对应平台的安装包：

| 平台        | 文件格式             | 说明                            |
| ----------- | -------------------- | ------------------------------- |
| **macOS**   | `.dmg`               | 双击安装，拖拽到 Applications   |
| **Windows** | `.exe`               | 双击运行安装程序                |
| **Linux**   | `.AppImage` / `.deb` | AppImage 添加执行权限后直接运行 |

#### 首次使用

1. **启动应用**：安装后在系统托盘找到图标
2. **添加 Provider**：点击"管理 Providers" → "添加 Provider"
3. **配置凭证**：
   ```
   - 输入 Provider ID（如 kimi）
   - 填写 API Token
   - 设置 Base URL（自动添加 /anthropic 后缀）
   ```
4. **拉取模型列表**：点击"从 API 拉取模型列表"
5. **选择模型**：为 Opus/Sonnet/Haiku/Subagent 选择合适的模型
6. **保存并切换**：保存配置后，在托盘菜单中切换到该 Provider

#### 日常使用

- **快速切换**：托盘菜单 → 选择 Provider
- **查看状态**：托盘菜单会标记当前激活的 Provider（✓）
- **编辑配置**：管理 Providers → 选择 Provider → 点击配置图标
- **查看脚本**：点击"编辑脚本"查看/修改模型获取逻辑

---

## CLI 工具

专为**无 GUI 的服务器环境**设计的命令行工具，与桌面应用共享配置。

### 📦 安装

```bash
# 方式一：全局安装（推荐）
npm install -g cc-models-provider-switcher

# 方式二：手动安装（从源码）
git clone https://github.com/yourusername/cc-models-provider-switcher.git
cd cc-models-provider-switcher
npm install
npm run build:cli
npm link
```

### 🎮 命令

```bash
# 查看帮助
cc-switcher help

# 列出所有 Provider（标记当前激活）
cc-switcher list
# 或
cc-switcher ls

# 切换到指定 Provider
cc-switcher switch <provider-id>

# 显示当前配置详情
cc-switcher current
# 或
cc-switcher show
```

### 💡 使用示例

```bash
# 查看所有可用 Provider
$ cc-switcher list
Available Providers:
  ▶ kimi         - Kimi K2
    glm          - 智谱 GLM
    anthropic    - Anthropic 官方
    deepseek     - DeepSeek V3
    copilot      - GitHub Copilot

# 切换到 GLM
$ cc-switcher switch glm
✓ Switched to provider: glm
  Config: ~/.claude/settings.json
  Backup: ~/.claude/settings.json.backup.2025-12-11T10-30-00-000Z

# 查看当前配置
$ cc-switcher current
Current Provider: glm (智谱 GLM)

Configuration:
  Base URL: https://open.bigmodel.cn/api/anthropic
  Token: eabe***b770
  Models:
    Opus:     glm-4-plus
    Sonnet:   glm-4-flash
    Haiku:    glm-4-flash
    Subagent: glm-4-flash
```

### 🔧 配置位置

| 平台            | 配置目录                                 |
| --------------- | ---------------------------------------- |
| **macOS/Linux** | `~/.config/cc-models-provider-switcher/` |
| **Windows**     | `%APPDATA%\cc-models-provider-switcher\` |

CLI 工具会读取桌面应用的配置，反之亦然。你可以在桌面应用中添加 Provider，然后在服务器上用 CLI 切换。

---

## 开发指南

### 🛠️ 环境要求

- **Node.js** >= 20
- **npm** >= 9

### 📥 克隆项目

```bash
git clone https://github.com/yourusername/cc-models-provider-switcher.git
cd cc-models-provider-switcher
npm install
```

### 🚀 开发模式

```bash
# 启动开发服务器（热重载）
npm run dev

# 单独编译主进程（TypeScript 监听模式）
npm run dev:main

# 单独编译渲染进程（Vite 开发服务器）
npm run dev:renderer
```

访问 `http://localhost:5173` 查看渲染进程，主进程会自动在 Electron 中运行。

### 🔨 构建

```bash
# 编译所有代码
npm run build

# 单独编译主进程
npm run build:main

# 单独编译渲染进程
npm run build:renderer

# 编译 CLI 工具
npm run build:cli

# 类型检查
npm run typecheck

# 代码检查
npm run lint
```

### 📦 打包应用

```bash
# 打包当前平台
npm run package

# 打包指定平台
npm run package -- --mac     # macOS
npm run package -- --win     # Windows
npm run package -- --linux   # Linux
```

输出目录：`dist/`

### 🧪 测试 CLI

```bash
# 编译 CLI
npm run build:cli

# 直接运行（无需安装）
node dist/cli/cli/index.js list
node dist/cli/cli/index.js switch kimi
node dist/cli/cli/index.js current
```

---

## 项目结构

```
cc-models-provider-switcher/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 主入口，IPC 通信
│   │   ├── tray.ts              # 系统托盘管理
│   │   ├── config.ts            # 配置读写，Provider 切换
│   │   ├── preload.ts           # 预加载脚本，安全桥接
│   │   └── providers/
│   │       ├── copilot.ts       # Copilot 服务管理
│   │       ├── model-fetcher.ts # API 模型列表拉取
│   │       └── script-loader.ts # 脚本沙盒执行
│   ├── renderer/                # React 渲染进程
│   │   ├── App.tsx              # 根组件
│   │   ├── main.tsx             # React 入口
│   │   ├── index.html           # HTML 模板
│   │   ├── components/
│   │   │   ├── ProviderList.tsx    # Provider 列表
│   │   │   ├── ProviderConfig.tsx  # Provider 配置面板
│   │   │   ├── CopilotPanel.tsx    # Copilot 管理
│   │   │   └── InputDialog.tsx     # 输入对话框
│   │   ├── hooks/
│   │   │   └── useElectronAPI.ts   # Electron API Hook
│   │   └── styles/
│   │       └── index.css           # 全局样式
│   ├── cli/                     # CLI 工具
│   │   └── index.ts             # CLI 入口，命令处理
│   └── shared/                  # 共享代码
│       ├── types.ts             # TypeScript 类型定义
│       └── presets.ts           # 预设配置和脚本模板
├── assets/                      # 应用图标
│   ├── icon.icns               # macOS 图标
│   ├── icon.ico                # Windows 图标
│   └── icon.png                # Linux 图标
├── .github/
│   └── workflows/
│       ├── build.yml           # 自动构建和发布
│       └── lint.yml            # 代码检查
├── dist/                        # 构建输出（gitignore）
├── package.json                 # 项目配置
├── tsconfig.json                # TypeScript 配置
├── tsconfig.main.json           # 主进程 TS 配置
├── tsconfig.cli.json            # CLI TS 配置
├── vite.config.ts               # Vite 配置
└── README.md                    # 本文档
```

---

## 配置说明

### Claude Settings 文件

应用会修改 `~/.claude/settings.json`，注入以下环境变量：

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your-api-token",
    "ANTHROPIC_BASE_URL": "https://api.provider.com/anthropic",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "model-opus",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "model-sonnet",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "model-haiku",
    "ANTHROPIC_SUBAGENT_MODEL": "model-subagent"
  }
}
```

### 自动备份

每次切换 Provider 时，当前配置会自动备份到：

```
~/.claude/settings.json.backup.<ISO-timestamp>
```

### 会话缓存清理

切换后会自动清除 `~/.claude/session-env/` 中的缓存文件。

---

## 跨平台支持

| 功能        | macOS       | Linux       | Windows     | 说明                   |
| ----------- | ----------- | ----------- | ----------- | ---------------------- |
| 桌面应用    | ✅          | ✅          | ✅          | 完全支持               |
| CLI 工具    | ✅          | ✅          | ✅          | 完全支持               |
| 配置目录    | `~/.config` | `~/.config` | `%APPDATA%` | 自动适配               |
| Copilot API | ✅          | ✅          | ⚠️          | Windows 进程管理有限制 |

详见 [CROSS_PLATFORM_CHANGES.md](./CROSS_PLATFORM_CHANGES.md)

---

## 常见问题

### Q: 如何获取 API Token？

- **Kimi**: https://platform.moonshot.cn/console/api-keys
- **GLM**: https://open.bigmodel.cn/usercenter/apikeys
- **Anthropic**: https://console.anthropic.com/settings/keys
- **DeepSeek**: https://platform.deepseek.com/api_keys
- **Copilot**: 使用应用内的 OAuth 认证

### Q: 切换后 Claude Code 不生效？

1. 确认 `~/.claude/settings.json` 已更新
2. 重启 Claude Code 应用或 VS Code
3. 检查 Provider 配置中的 Base URL 是否正确

### Q: Copilot 服务启动失败？

1. 确认已安装 `copilot-api`：`npm install -g copilot-api`
2. 检查端口 4141 是否被占用
3. 完成 GitHub OAuth 认证
4. 查看应用日志获取详细错误信息

### Q: CLI 工具找不到配置？

确保至少运行过一次桌面应用并添加了 Provider。CLI 和桌面应用共享配置目录。

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

---

## 许可证

[MIT License](./LICENSE)

---

## 致谢

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [React](https://react.dev/) - UI 框架
- [Vite](https://vitejs.dev/) - 构建工具
- [copilot-api](https://github.com/aaamoon/copilot-gpt4-service) - Copilot 代理服务

---

<div align="center">

**[⬆ 回到顶部](#claude-code-model-switcher)**

Made with ❤️ by developers, for developers

</div>
