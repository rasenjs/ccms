import { contextBridge, ipcRenderer } from 'electron';
import type { ProviderId, ProviderConfig, AppConfig, ModelItem, CopilotStatus } from '../shared/types';

// 暴露给渲染进程的 API
const electronAPI = {
  // 配置相关
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  setConfig: (config: Partial<AppConfig>): Promise<void> => ipcRenderer.invoke('config:set', config),
  switchProvider: (provider: ProviderId): Promise<boolean> => ipcRenderer.invoke('config:switch-provider', provider),

  // Provider 相关
  getModels: (provider: ProviderId, token?: string): Promise<ModelItem[]> => 
    ipcRenderer.invoke('provider:get-models', provider, token),
  updateProvider: (provider: ProviderId, config: Partial<ProviderConfig>): Promise<void> => 
    ipcRenderer.invoke('provider:update', provider, config),
  addProvider: (config: ProviderConfig): Promise<void> => 
    ipcRenderer.invoke('provider:add', config),
  deleteProvider: (provider: ProviderId): Promise<boolean> => 
    ipcRenderer.invoke('provider:delete', provider),
  getScriptPath: (): Promise<string> => 
    ipcRenderer.invoke('provider:get-script-path'),
  getScriptContent: (provider: ProviderId): Promise<string> =>
    ipcRenderer.invoke('provider:get-script-content', provider),
  saveScript: (provider: ProviderId, content: string): Promise<void> =>
    ipcRenderer.invoke('provider:save-script', provider, content),
  openScriptEditor: (provider: ProviderId): Promise<void> =>
    ipcRenderer.invoke('provider:open-script-editor', provider),
  testConnection: (provider: ProviderId, token?: string): Promise<boolean> => 
    ipcRenderer.invoke('provider:test-connection', provider, token),

  // Provider 图标（badge）
  chooseProviderBadge: (provider: ProviderId): Promise<boolean> =>
    ipcRenderer.invoke('provider:badge:choose', provider),
  pickProviderBadge: (): Promise<{ srcPath: string; dataUrl: string } | null> =>
    ipcRenderer.invoke('provider:badge:pick'),
  setProviderBadge: (provider: ProviderId, srcPath: string): Promise<boolean> =>
    ipcRenderer.invoke('provider:badge:set', provider, srcPath),
  clearProviderBadge: (provider: ProviderId): Promise<boolean> =>
    ipcRenderer.invoke('provider:badge:clear', provider),
  getProviderBadgeData: (provider: ProviderId): Promise<string | null> =>
    ipcRenderer.invoke('provider:badge:get', provider),

  // 对话框相关
  dialog: {
    showInput: (options: { title: string; message: string; defaultValue?: string; placeholder?: string }): Promise<string | null> =>
      ipcRenderer.invoke('dialog:show-input', options),
    showError: (message: string): Promise<void> =>
      ipcRenderer.invoke('dialog:show-error', message),
    
    // 对话框窗口管理
    open: (options: { 
      id: string; 
      route: string; 
      width?: number; 
      height?: number; 
      title?: string; 
      data?: any 
    }): Promise<void> =>
      ipcRenderer.invoke('dialog:open', options),
    close: (id: string): Promise<void> =>
      ipcRenderer.invoke('dialog:close', id),
    sendToMain: (data: any): void =>
      ipcRenderer.send('dialog:send-to-main', data),
    sendToDialog: (data: any): void =>
      ipcRenderer.send('main:send-to-dialog', data),
    onMessage: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('dialog:message', handler);
      return () => ipcRenderer.removeListener('dialog:message', handler);
    },
  },

  // Copilot 相关
  copilot: {
    checkInstalled: (): Promise<boolean> => ipcRenderer.invoke('copilot:check-installed'),
    install: (): Promise<{ success: boolean; output: string }> => ipcRenderer.invoke('copilot:install'),
    checkRunning: (): Promise<boolean> => ipcRenderer.invoke('copilot:check-running'),
    start: (): Promise<{ success: boolean; output: string }> => ipcRenderer.invoke('copilot:start'),
    stop: (): Promise<boolean> => ipcRenderer.invoke('copilot:stop'),
    auth: (): Promise<{ success: boolean; code?: string; url?: string; message: string }> => 
      ipcRenderer.invoke('copilot:auth'),
    checkToken: (): Promise<boolean> => ipcRenderer.invoke('copilot:check-token'),
    getToken: (): Promise<string | null> => ipcRenderer.invoke('copilot:get-token'),
    clearToken: (): Promise<boolean> => ipcRenderer.invoke('copilot:clear-token'),
    getStatus: (): Promise<CopilotStatus> => ipcRenderer.invoke('copilot:get-status'),
    // 事件监听
    onAuthProgress: (callback: (data: { deviceCode?: string; verificationUrl?: string; message?: string }) => void) => {
      ipcRenderer.on('copilot:auth-progress', (_event, data) => callback(data));
    },
    onOutput: (callback: (line: string) => void) => {
      ipcRenderer.on('copilot:output', (_event, line) => callback(line));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('copilot:auth-progress');
      ipcRenderer.removeAllListeners('copilot:output');
    },
  },

  // 窗口相关
  showWindow: (): Promise<void> => ipcRenderer.invoke('window:show'),
  hideWindow: (): Promise<void> => ipcRenderer.invoke('window:hide'),

  // DevTools（仅 dev 环境使用）
  devtools: {
    open: (): Promise<boolean> => ipcRenderer.invoke('devtools:open'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// 类型声明
export type ElectronAPI = typeof electronAPI;
