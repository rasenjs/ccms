// Provider ID 类型 - 改为字符串，支持用户自定义
export type ProviderId = string;

// 特殊的内置 Provider
export const BUILTIN_PROVIDER_COPILOT = 'copilot';

// 模型角色类型
export type ModelRole = 'opus' | 'sonnet' | 'haiku' | 'subagent';

// 模型配置
export interface ModelConfig {
  opus: string;
  sonnet: string;
  haiku: string;
  subagent: string;
}

// Provider 配置
export interface ProviderConfig {
  id: ProviderId;
  name: string;
  baseUrl: string;
  authToken: string;
  models: ModelConfig;
  // 注：脚本内容存储在独立文件夹中，不再存储在此配置中
}

// Claude Code settings.json 格式
export interface ClaudeSettings {
  env: {
    ANTHROPIC_AUTH_TOKEN: string;
    ANTHROPIC_BASE_URL: string;
    API_TIMEOUT_MS: string;
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: number;
    ANTHROPIC_DEFAULT_OPUS_MODEL: string;
    ANTHROPIC_DEFAULT_SONNET_MODEL: string;
    ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
    ANTHROPIC_SUBAGENT_MODEL: string;
  };
}

// 应用配置
export interface AppConfig {
  // UI 语言（仅用于应用自身 UI / tray，不影响 Claude 配置）
  language?: 'en' | 'zh';
  currentProvider: ProviderId;
  // Provider 列表（有序）
  providerOrder: ProviderId[];
  // Provider 配置映射
  providers: Record<ProviderId, ProviderConfig>;
  // Copilot 特殊配置
  copilot: CopilotConfig;
}

// Copilot 特殊配置
export interface CopilotConfig {
  installed: boolean;
  running: boolean;
  port: number;
  oauthTokenPath: string;
}

// Copilot 状态（用于 UI 显示）
export interface CopilotStatus {
  installed: boolean;
  running: boolean;
  hasToken: boolean;
  authInProgress: boolean;
  authCode?: string;
  authUrl?: string;
  authMessage?: string;
}

// 模型列表项（用于 API 拉取）
export interface ModelItem {
  id: string;
  name: string;
  description?: string;
}

// IPC 通信事件类型
export interface IpcEvents {
  // 配置相关
  'config:get': () => AppConfig;
  'config:set': (config: Partial<AppConfig>) => void;
  'config:switch-provider': (provider: ProviderId) => void;
  
  // Provider 相关
  'provider:get-models': (provider: ProviderId) => ModelItem[];
  'provider:update': (provider: ProviderId, config: Partial<ProviderConfig>) => void;
  'provider:add': (config: ProviderConfig) => void;
  'provider:delete': (provider: ProviderId) => void;
  'provider:get-script-content': (provider: ProviderId) => string;
  'provider:save-script': (provider: ProviderId, content: string) => void;
  'provider:open-script-editor': (provider: ProviderId) => void;
  'provider:badge:choose': (provider: ProviderId) => boolean;
  'provider:badge:clear': (provider: ProviderId) => boolean;
  'provider:badge:get': (provider: ProviderId) => string | null;
  'provider:badge:pick': () => { srcPath: string; dataUrl: string } | null;
  'provider:badge:set': (provider: ProviderId, srcPath: string) => boolean;
  
  // 对话框相关
  'dialog:show-input': (options: { title: string; message: string; defaultValue?: string; placeholder?: string }) => string | null;
  'dialog:show-error': (message: string) => void;
  
  // Copilot 相关
  'copilot:check-installed': () => boolean;
  'copilot:install': () => { success: boolean; output: string };
  'copilot:check-running': () => boolean;
  'copilot:start': () => { success: boolean; output: string };
  'copilot:stop': () => boolean;
  'copilot:auth': () => { success: boolean; code?: string; url?: string; message?: string };
  'copilot:check-token': () => boolean;
  'copilot:get-status': () => CopilotStatus;
  
  // 窗口相关
  'window:show': () => void;
  'window:hide': () => void;

  // DevTools（仅 dev 环境使用）
  'devtools:open': () => boolean;
}
