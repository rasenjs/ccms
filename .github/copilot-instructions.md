# Claude Code Model Switcher - Copilot Instructions

This is an Electron-based tray application for managing Claude Code model configurations.

## Project Overview

A desktop tray application that allows users to:
- Quickly switch between model providers (K2, GLM, Anthropic, DeepSeek, Copilot)
- Configure models for each provider (with API-based model list fetching)
- Manage API credentials for each provider
- Special Copilot integration with installation and credential management

## Core Features

### 1. 快速切换模型来源
- 系统托盘菜单一键切换不同 Provider
- 自动更新 `~/.claude/settings.json` 配置文件
- 切换时自动清除会话缓存
- 显示当前激活的 Provider 状态

### 2. 配置每个模型来源的模型
- 支持配置四种模型角色：Opus、Sonnet、Haiku、Subagent
- **从 API 拉取模型列表功能**：
  - 调用各 Provider 的 API 获取可用模型列表
  - 下拉选择或手动输入模型 ID
  - 缓存模型列表，支持刷新
- 每个 Provider 独立保存模型配置

### 3. 配置每个模型来源的凭证
- 安全存储各 Provider 的 API Token
- 支持配置 Base URL、超时时间等参数
- 凭证加密存储（使用 electron-store）
- 支持测试连接验证凭证有效性

### 4. Copilot 特殊功能
- **安装管理**：
  - 检测 copilot-api 是否已安装
  - 一键安装 copilot-api（npm install -g copilot-api）
- **服务管理**：
  - 启动/停止 copilot-api 代理服务
  - 检测服务运行状态
  - 自动在切换到 Copilot 时启动服务
- **OAuth 凭证管理**：
  - 检测 GitHub OAuth token 是否存在
  - 运行 OAuth 认证流程（copilot-api auth）
  - Token 存储路径：`~/.local/share/copilot-api/github_token`
  - 显示认证状态

## Tech Stack

- **Runtime**: Electron
- **Language**: TypeScript
- **UI Framework**: React
- **Build Tool**: Vite
- **Package Manager**: npm

## Project Structure

```
src/
├── main/              # Electron main process
│   ├── index.ts       # Main entry point
│   ├── tray.ts        # Tray menu management
│   ├── config.ts      # Configuration management
│   └── providers/     # Model provider implementations
├── renderer/          # React UI
│   ├── App.tsx        # Main React component
│   ├── components/    # UI components
│   └── hooks/         # React hooks
└── shared/            # Shared types and utilities
    └── types.ts       # TypeScript interfaces
```

## Development Guidelines

1. Use TypeScript strict mode
2. Follow React best practices
3. Keep main and renderer process communication clean via IPC
4. Store configurations in user data directory
5. Support multiple model providers with a plugin-like architecture

## Supported Providers

- **K2** - Kimi K2 (Moonshot API: https://api.moonshot.cn/anthropic)
- **GLM** - 智谱 GLM (https://open.bigmodel.cn/api/anthropic)
- **Anthropic** - Anthropic 官方 (https://api.anthropic.com)
- **DeepSeek** - DeepSeek V3 (https://api.deepseek.com/anthropic)
- **Copilot** - GitHub Copilot (通过 copilot-api 代理，需要特殊安装和 OAuth 认证)

## Environment Variables

每个 provider 配置以下环境变量：
- `ANTHROPIC_AUTH_TOKEN` - API 认证令牌
- `ANTHROPIC_BASE_URL` - API 基础 URL
- `API_TIMEOUT_MS` - API 超时时间
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` - 禁用非必要流量
- `ANTHROPIC_DEFAULT_OPUS_MODEL` - 默认 Opus 模型
- `ANTHROPIC_DEFAULT_SONNET_MODEL` - 默认 Sonnet 模型
- `ANTHROPIC_DEFAULT_HAIKU_MODEL` - 默认 Haiku 模型
- `ANTHROPIC_SUBAGENT_MODEL` - 子代理模型
