# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

如果您发现安全漏洞，请**不要**通过公开 Issue 报告。

请通过以下方式私密报告：

1. 发送邮件至：[your.email@example.com]
2. 或通过 GitHub Security Advisories

您的报告应包含：

- 漏洞描述
- 重现步骤
- 可能的影响
- 建议的修复方案（如果有）

我们将在 **48 小时内**回复您的报告，并在 **7 天内**提供修复计划。

## Security Best Practices

使用本应用时，请注意：

- **API Token**: 应用使用 electron-store 加密存储，但请勿在不信任的设备上使用
- **配置文件**: `~/.claude/settings.json` 包含明文 token，请保护好文件权限
- **Copilot Token**: OAuth token 存储在 `~/.local/share/copilot-api/github_token`

建议：

```bash
# macOS/Linux: 设置配置目录权限
chmod 700 ~/.config/cc-models-provider-switcher
chmod 600 ~/.claude/settings.json
```

## Known Issues

- Windows 下进程终止可能影响其他 Node.js 进程
- Copilot OAuth token 未加密存储（由 copilot-api 管理）

我们正在积极改进这些问题。
