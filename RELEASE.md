# 打包和发布指南

## 打包桌面应用

### macOS

```bash
# 编译并打包
npm run package

# 生成的文件在 dist/ 目录：
# - Claude Code Model Switcher-1.0.0-arm64.dmg  (182MB, DMG 安装包)
# - Claude Code Model Switcher-1.0.0-arm64-mac.zip  (175MB, ZIP 压缩包)
```

### 跨平台打包

如需打包其他平台，修改 package.json 中的 build 配置：

```json
"build": {
  "mac": { ... },
  "win": {
    "target": ["nsis", "portable"]
  },
  "linux": {
    "target": ["AppImage", "deb"]
  }
}
```

然后运行：

```bash
npm run package -- --mac --win --linux
```

## CLI 工具

### 编译 CLI

```bash
npm run build:cli
```

生成文件：`dist/cli/index.js`

### 本地测试

```bash
# 查看帮助
node dist/cli/index.js help

# 列出所有 provider
node dist/cli/index.js list

# 切换 provider
node dist/cli/index.js switch kimi

# 显示当前配置
node dist/cli/index.js current
```

### 全局安装

```bash
# 方式 1: npm link（开发环境）
npm run build:cli
npm link

# 使用
ccms list
ccms switch kimi

# 方式 2: 发布到 npm
npm publish

# 安装
npm install -g cc-model-switcher
```

### 无 npm 环境使用

将编译后的文件复制到服务器：

```bash
# 复制文件
scp -r dist/cli user@server:/opt/ccms/

# 在服务器上创建软链接
sudo ln -s /opt/ccms/cli/index.js /usr/local/bin/ccms
sudo chmod +x /opt/ccms/cli/index.js

# 使用
ccms list
```

## CLI 命令说明

### 列出所有 Provider

```bash
ccms list
# 或
ccms ls
```

显示所有可用的 Provider，当前激活的会有 ▶ 标记。

### 切换 Provider

```bash
ccms switch <provider-id>
```

示例：

```bash
ccms switch kimi
ccms switch glm
ccms switch deepseek
```

切换后会：

1. 备份当前配置到 `~/.claude/settings.json.backup.{timestamp}`
2. 更新 `~/.claude/settings.json`
3. 清除会话缓存 `~/.claude/session-env/`

### 显示当前配置

```bash
ccms current
# 或
ccms show
```

显示当前激活的 Provider 详细信息。

## 发布清单

### 桌面应用

- [x] macOS DMG (已生成)
- [ ] Windows NSIS 安装包
- [ ] Linux AppImage

### CLI 工具

- [x] 编译成功
- [x] 本地测试通过
- [ ] npm 发布
- [ ] 独立分发包

### 文档

- [ ] README 更新
- [ ] 使用文档
- [ ] CHANGELOG

## 配置文件位置

- 桌面应用配置：`~/.config/cc-model-switcher/config.json`
- Claude Code 配置：`~/.claude/settings.json`
- 配置备份：`~/.claude/settings.json.backup.*`
- Provider 脚本：`~/.config/cc-model-switcher/providers/{id}/script.js`

## 注意事项

1. **权限问题**：CLI 工具需要写入 `~/.claude/settings.json`，确保有权限
2. **Copilot 特殊性**：切换到 Copilot 需要先安装 `copilot-api` 并认证
3. **Token 安全**：配置文件包含 API Token，注意保护
4. **会话缓存**：切换后会自动清除 Claude Code 会话缓存
