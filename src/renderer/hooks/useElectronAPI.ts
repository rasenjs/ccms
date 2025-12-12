import type { ProviderId, ProviderConfig, AppConfig, ModelItem, CopilotStatus } from '../../shared/types';

// Electron API 类型
export interface ElectronAPI {
  getConfig: () => Promise<AppConfig>;
  setConfig: (config: Partial<AppConfig>) => Promise<void>;
  switchProvider: (provider: ProviderId) => Promise<boolean>;
  getModels: (provider: ProviderId, token?: string) => Promise<ModelItem[]>;
  updateProvider: (provider: ProviderId, config: Partial<ProviderConfig>) => Promise<void>;
  addProvider: (config: ProviderConfig) => Promise<void>;
  deleteProvider: (provider: ProviderId) => Promise<boolean>;
  getScriptPath: () => Promise<string>;
  getScriptContent: (provider: ProviderId) => Promise<string>;
  saveScript: (provider: ProviderId, content: string) => Promise<void>;
  openScriptEditor: (provider: ProviderId) => Promise<void>;
  testConnection: (provider: ProviderId, token?: string) => Promise<boolean>;
  chooseProviderBadge: (provider: ProviderId) => Promise<boolean>;
  pickProviderBadge: () => Promise<{ srcPath: string; dataUrl: string } | null>;
  setProviderBadge: (provider: ProviderId, srcPath: string) => Promise<boolean>;
  clearProviderBadge: (provider: ProviderId) => Promise<boolean>;
  getProviderBadgeData: (provider: ProviderId) => Promise<string | null>;
  dialog: {
    showInput: (options: { title: string; message: string; defaultValue?: string; placeholder?: string }) => Promise<string | null>;
    showError: (message: string) => Promise<void>;
    open: (options: { 
      id: string;
      route: string;
      width?: number;
      height?: number;
      title?: string;
      data?: any;
    }) => Promise<void>;
    close: (id: string) => Promise<void>;
    sendToMain: (data: any) => void;
    sendToDialog: (data: any) => void;
    onMessage: (callback: (data: any) => void) => () => void;
  };
  copilot: {
    checkInstalled: () => Promise<boolean>;
    install: () => Promise<{ success: boolean; output: string }>;
    checkRunning: () => Promise<boolean>;
    start: () => Promise<{ success: boolean; output: string }>;
    stop: () => Promise<boolean>;
    auth: () => Promise<{ success: boolean; code?: string; url?: string; message: string }>;
    checkToken: () => Promise<boolean>;
    getToken: () => Promise<string | null>;
    clearToken: () => Promise<boolean>;
    getStatus: () => Promise<CopilotStatus>;
    onAuthProgress: (callback: (data: { deviceCode?: string; verificationUrl?: string; message?: string }) => void) => void;
    onOutput: (callback: (line: string) => void) => void;
    removeAllListeners: () => void;
  };
  showWindow: () => Promise<void>;
  hideWindow: () => Promise<void>;

  // DevTools（仅 dev 环境会提供）
  devtools?: {
    open: () => Promise<boolean>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export function useElectronAPI(): ElectronAPI {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return createMockAPI();
  }
  return window.electronAPI;
}

function createMockAPI(): ElectronAPI {
  return {
    getConfig: async () => ({
      currentProvider: 'copilot',
      providerOrder: ['copilot'],
      providers: {
        copilot: {
          id: 'copilot',
          name: 'GitHub Copilot',
          baseUrl: 'http://localhost:4141',
          authToken: 'copilot_dummy_token',
          models: { opus: 'claude-sonnet-4', sonnet: 'claude-sonnet-4', haiku: 'gpt-4o-mini', subagent: 'gpt-4o-mini' },
        },
      },
      copilot: {
        installed: false,
        running: false,
        port: 4141,
        oauthTokenPath: '',
      },
    }),
    setConfig: async () => {},
    switchProvider: async () => true,
    getModels: async () => [],
    updateProvider: async () => {},
    addProvider: async () => {},
    deleteProvider: async () => true,
    getScriptPath: async () => '~/.config/cc-model-switcher/providers',
    getScriptContent: async () => '// Default script',
    saveScript: async () => {},
    openScriptEditor: async () => {},
    testConnection: async () => true,
    chooseProviderBadge: async () => false,
    pickProviderBadge: async () => null,
    setProviderBadge: async () => false,
    clearProviderBadge: async () => false,
    getProviderBadgeData: async () => null,
    dialog: {
      showInput: async () => '',
      showError: async () => {},
      open: async () => {},
      close: async () => {},
      sendToMain: () => {},
      sendToDialog: () => {},
      onMessage: () => () => {},
    },
    copilot: {
      checkInstalled: async () => false,
      install: async () => ({ success: true, output: 'Mock install' }),
      checkRunning: async () => false,
      start: async () => ({ success: true, output: 'Mock start' }),
      stop: async () => true,
      auth: async () => ({ success: true, message: 'Mock auth' }),
      checkToken: async () => false,
      getToken: async () => null,
      clearToken: async () => true,
      getStatus: async () => ({
        installed: false,
        running: false,
        hasToken: false,
        authInProgress: false,
      }),
      onAuthProgress: () => {},
      onOutput: () => {},
      removeAllListeners: () => {},
    },
    showWindow: async () => {},
    hideWindow: async () => {},
    devtools: {
      open: async () => false,
    },
  };
}
