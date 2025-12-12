// Type-only declarations for the shared layer.
//
// IMPORTANT:
// - Keep this file type-only (.d.ts) so preload can `import type` without causing JS emission.
// - Runtime constants live in `src/shared/constants.ts`.

export type ProviderId = string;

export type ModelRole = 'opus' | 'sonnet' | 'haiku' | 'subagent';

export interface ModelConfig {
  opus: string;
  sonnet: string;
  haiku: string;
  subagent: string;
}

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  baseUrl: string;
  authToken: string;
  models: ModelConfig;
}

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

export interface AppConfig {
  // UI 语言（仅用于应用自身 UI / tray，不影响 Claude 配置）
  language?: 'en' | 'zh';
  currentProvider: ProviderId;
  providerOrder: ProviderId[];
  providers: Record<ProviderId, ProviderConfig>;
  copilot: CopilotConfig;
}

export interface CopilotConfig {
  installed: boolean;
  running: boolean;
  port: number;
  oauthTokenPath: string;
}

export interface CopilotStatus {
  installed: boolean;
  running: boolean;
  hasToken: boolean;
  authInProgress: boolean;
  authCode?: string;
  authUrl?: string;
  authMessage?: string;
}

export interface ModelItem {
  id: string;
  name: string;
  description?: string;
}

export interface IpcEvents {
  'config:get': () => AppConfig;
  'config:set': (config: Partial<AppConfig>) => void;
  'config:switch-provider': (provider: ProviderId) => void;

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

  'dialog:show-input': (options: { title: string; message: string; defaultValue?: string; placeholder?: string }) => string | null;
  'dialog:show-error': (message: string) => void;

  'copilot:check-installed': () => boolean;
  'copilot:install': () => { success: boolean; output: string };
  'copilot:check-running': () => boolean;
  'copilot:start': () => { success: boolean; output: string };
  'copilot:stop': () => boolean;
  'copilot:auth': () => { success: boolean; code?: string; url?: string; message?: string };
  'copilot:check-token': () => boolean;
  'copilot:get-status': () => CopilotStatus;

  'window:show': () => void;
  'window:hide': () => void;

  'devtools:open': () => boolean;
}
