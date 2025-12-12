# Changelog



# [0.2.0](/compare/v0.1.1...v0.2.0) (2025-12-12)


### Bug Fixes

* **windows:** improve dialog styling and taskbar behavior a07bbad


### Features

* 导出 applyProviderIcons 函数并优化托盘图标交互逻辑 539b366

# Changelog



## 0.1.1 (2025-12-12)

# 更新日志

## 2025-12-11 - 重大架构重构

### 修复的问题

- ❌ **修复 prompt() 错误**:
  - 问题：Electron 渲染进程不支持 `prompt()` 函数
  - 解决：创建自定义 InputDialog 组件，通过 React 状态管理多步对话框

### 核心改动

#### 1. 存储结构重构

**之前**: 所有脚本存储在 `~/.config/cc-model-switcher/scripts/` 目录

```
scripts/
├── copilot.js
├── kimi.js
├── glm.js
└── ...
```

**现在**: 每个 provider 拥有独立文件夹

```
providers/
├── copilot/
│   └── script.js
├── my-provider/
│   └── script.js
└── ...
```

#### 2. Provider 创建流程

**之前**:

1. 使用 `prompt()` 输入信息 ❌
2. 手动创建脚本文件
3. 在"脚本目录"中编辑

**现在**:

1. 点击"新增 Provider"按钮
2. 通过对话框输入 ID、名称、Base URL
3. 系统自动创建 provider 文件夹和默认脚本
4. 在配置页面点击"✏️ 编辑脚本"按钮打开编辑器

#### 3. 脚本管理

**移除功能**:

- ❌ "脚本目录"按钮（列表页）
- ❌ 脚本文件名显示

**新增功能**:

- ✅ "✏️ 编辑脚本"按钮（配置页）
- ✅ 直接打开对应 provider 的 `script.js` 文件
- ✅ 自动创建默认脚本模板

#### 4. 文件结构变化

**类型定义** (`src/shared/types.ts`):

```typescript
// 移除了 modelFetchScript 字段
interface ProviderConfig {
  id: ProviderId;
  name: string;
  baseUrl: string;
  authToken: string;
  models: ModelConfig;
  // modelFetchScript?: string;  // ❌ 已移除
}

// 新增对话框相关 IPC 事件
interface IpcEvents {
  'provider:get-script-content': (provider: ProviderId) => string;
  'provider:save-script': (provider: ProviderId, content: string) => void;
  'provider:open-script-editor': (provider: ProviderId) => void;
  'dialog:show-input': (options: {...}) => string | null;
  'dialog:show-error': (message: string) => void;
}
```

**脚本加载器** (`src/main/providers/script-loader.ts`):

```typescript
// 新增函数
ensureProvidersDir(): void
getProviderDir(providerId): string
ensureProviderDir(providerId): void
getProviderScript(providerId): string
saveProviderScript(providerId, content): void

// 签名变更
executeModelScript(
  providerId: ProviderId,  // 之前: scriptName: string
  config: ProviderConfig
): Promise<ModelItem[]>
```

**主进程** (`src/main/index.ts`):

```typescript
// 新增 IPC 处理器
ipcMain.handle('provider:get-script-content', ...)
ipcMain.handle('provider:save-script', ...)
ipcMain.handle('provider:open-script-editor', ...)
ipcMain.handle('dialog:show-input', ...)
ipcMain.handle('dialog:show-error', ...)
```

**UI 组件**:

- `src/renderer/components/InputDialog.tsx` - 新增自定义输入对话框组件
- `src/renderer/components/ProviderList.tsx` - 移除"脚本目录"按钮，添加多步对话框
- `src/renderer/components/ProviderConfig.tsx` - 添加"编辑脚本"按钮

**样式** (`src/renderer/styles/index.css`):

```css
/* 新增对话框样式 */
.dialog-overlay {
  ...;
}
.dialog-content {
  ...;
}
.dialog-buttons {
  ...;
}
```

### 使用指南

#### 创建新的 Provider

1. 打开应用
2. 点击"➕ 新增 Provider"
3. 输入 Provider ID（如 `my-provider`）
4. 输入显示名称（如 `我的模型提供者`）
5. 输入 API Base URL（如 `https://api.example.com`）
6. 系统自动创建文件夹：`~/.config/cc-model-switcher/providers/my-provider/`
7. 自动生成默认脚本：`script.js`

#### 编辑模型列表脚本

1. 进入 Provider 配置页面
2. 点击"✏️ 编辑脚本"按钮
3. 使用系统默认编辑器打开 `script.js`
4. 编辑脚本实现自定义模型列表获取逻辑
5. 保存文件后，应用会在下次拉取模型列表时使用新脚本

#### 脚本示例

默认生成的脚本模板：

```javascript
/**
 * 模型列表获取脚本
 *
 * 此脚本会在沙箱环境中执行，可以访问以下变量：
 * - config: { id, name, baseUrl, authToken }
 * - fetchJson(url, headers): 发送 HTTP GET 请求
 * - console: { log, error }
 *
 * 脚本应该返回模型列表数组：
 * [{ id: 'model-id', name: 'Model Name', description: '...' }]
 */

// 示例：从 API 获取模型列表
const response = await fetchJson(`${config.baseUrl}/v1/models`, {
  Authorization: `Bearer ${config.authToken}`,
});

// 返回模型列表
return response.data.map((model) => ({
  id: model.id,
  name: model.name,
  description: model.description,
}));
```

### 迁移说明

如果你之前有旧版本的配置：

1. 旧的 `scripts/` 目录下的文件不会自动迁移
2. 需要手动将脚本内容复制到新的 provider 文件夹中
3. 或者删除旧 provider 重新创建

### 技术细节

- **对话框实现**: 使用 React state 管理多步输入流程，避免使用不支持的 `prompt()`
- **脚本隔离**: 每个 provider 的脚本独立存储，便于管理和备份
- **安全性**: 脚本仍然在 Node.js vm 沙箱中执行，限制了可访问的 API
- **向后兼容**: 保留了 `getScriptsDir()` 函数，返回新的 `providers/` 目录
