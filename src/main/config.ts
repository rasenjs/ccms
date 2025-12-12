import Store from 'electron-store';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { 
  AppConfig, 
  ProviderId, 
  ProviderConfig, 
  ClaudeSettings 
} from '../shared/types';
import { BUILTIN_PROVIDER_COPILOT } from '../shared/constants.js';
import { INITIAL_PROVIDERS, DEFAULT_COPILOT_CONFIG } from '../shared/presets.js';
import { ensureProviderDir, forceUpdatePresetScript } from './providers/script-loader.js';

const CLAUDE_CONFIG_DIR = path.join(os.homedir(), '.claude');
const CLAUDE_SETTINGS_FILE = path.join(CLAUDE_CONFIG_DIR, 'settings.json');

interface StoreSchema {
  config: AppConfig;
}

export class ConfigManager {
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'cc-models-provider-switcher',
      defaults: {
        config: {
          language: 'en',
          currentProvider: 'copilot',
          providerOrder: ['copilot', 'kimi', 'glm', 'anthropic', 'deepseek', 'silicon-flow'],
          providers: { ...INITIAL_PROVIDERS },
          copilot: {
            installed: false,
            running: false,
            port: 4141,
            oauthTokenPath: path.join(
              os.platform() === 'win32' 
                ? path.join(os.homedir(), 'AppData', 'Local') 
                : path.join(os.homedir(), '.local', 'share'),
              'copilot-api', 'github_token'
            ),
          },
        },
      },
    });

    // 确保 Claude 配置目录存在
    this.ensureClaudeConfigDir();
    
    // 为所有预设 provider 创建脚本文件
    this.ensurePresetProviders();
    
    // 迁移旧配置
    this.migrateOldConfig();
  }

  private ensureClaudeConfigDir() {
    if (!fs.existsSync(CLAUDE_CONFIG_DIR)) {
      fs.mkdirSync(CLAUDE_CONFIG_DIR, { recursive: true });
    }
  }

  /**
   * 确保预设 provider 的脚本文件已创建
   */
  private ensurePresetProviders() {
    const config = this.getConfig();
    
    // 为所有已配置的 provider 创建文件夹和脚本
    for (const providerId of Object.keys(config.providers)) {
      // Copilot 使用内置逻辑，跳过脚本创建
      if (providerId === BUILTIN_PROVIDER_COPILOT) {
        continue;
      }
      
      // 其他 provider 只在不存在时创建
      ensureProviderDir(providerId);
    }
  }

  /**
   * 迁移旧配置格式(如果需要)
   */
  private migrateOldConfig() {
    const config = this.store.get('config');
    let hasChanges = false;

    // 确保有 language 字段
    if (!config.language) {
      (config as AppConfig).language = 'en';
      hasChanges = true;
    }
    
    // 检查是否有 providerOrder，如果没有则创建
    if (!config.providerOrder) {
      const providerOrder = Object.keys(config.providers);
      this.store.set('config.providerOrder', providerOrder);
      hasChanges = true;
    }
    
    // 确保 Copilot 总是存在
    if (!config.providers[BUILTIN_PROVIDER_COPILOT]) {
      config.providers[BUILTIN_PROVIDER_COPILOT] = DEFAULT_COPILOT_CONFIG;
      if (!config.providerOrder.includes(BUILTIN_PROVIDER_COPILOT)) {
        config.providerOrder.push(BUILTIN_PROVIDER_COPILOT);
      }
      hasChanges = true;
    }
    
    if (hasChanges) {
      this.store.set('config', config);
      console.log('[Config] 配置迁移完成');
    }
  }

  getConfig(): AppConfig {
    return this.store.get('config');
  }

  setConfig(config: Partial<AppConfig>) {
    const currentConfig = this.getConfig();
    this.store.set('config', { ...currentConfig, ...config });
  }

  getProviderConfig(provider: ProviderId): ProviderConfig | undefined {
    const config = this.getConfig();
    return config.providers[provider];
  }

  updateProviderConfig(provider: ProviderId, updates: Partial<ProviderConfig>) {
    const config = this.getConfig();
    if (config.providers[provider]) {
      config.providers[provider] = { ...config.providers[provider], ...updates };
      this.store.set('config', config);
    }
  }

  /**
   * 添加 Provider
   */
  addProvider(providerConfig: ProviderConfig): void {
    const config = this.getConfig();
    
    // 添加到 providers
    config.providers[providerConfig.id] = providerConfig;
    
    // 添加到 providerOrder（如果不存在）
    if (!config.providerOrder.includes(providerConfig.id)) {
      config.providerOrder.push(providerConfig.id);
    }
    
    this.store.set('config', config);
    
    // 确保 provider 文件夹和默认脚本已创建
    ensureProviderDir(providerConfig.id);
  }

  /**
   * 删除 Provider
   */
  deleteProvider(providerId: ProviderId): boolean {
    // 不允许删除 Copilot
    if (providerId === BUILTIN_PROVIDER_COPILOT) {
      return false;
    }
    
    const config = this.getConfig();
    
    // 如果当前选中的是要删除的 Provider，切换到 Copilot
    if (config.currentProvider === providerId) {
      config.currentProvider = BUILTIN_PROVIDER_COPILOT;
    }
    
    // 从 providers 中删除
    delete config.providers[providerId];
    
    // 从 providerOrder 中删除
    config.providerOrder = config.providerOrder.filter(id => id !== providerId);
    
    this.store.set('config', config);
    
    // 清理 provider 文件夹（可选，保留文件以防误删）
    // 用户可以手动删除 ~/.config/cc-models-provider-switcher/providers/{providerId}
    
    return true;
  }

  /**
   * 获取 Provider 列表（按顺序）
   */
  getProviderList(): ProviderConfig[] {
    const config = this.getConfig();
    return config.providerOrder
      .map(id => config.providers[id])
      .filter((p): p is ProviderConfig => !!p);
  }

  async switchProvider(provider: ProviderId): Promise<void> {
    const config = this.getConfig();
    const providerConfig = config.providers[provider];

    if (!providerConfig) {
      throw new Error(`Provider not found: ${provider}`);
    }

    // 生成 Claude settings.json（使用固定的默认值）
    const claudeSettings: ClaudeSettings = {
      env: {
        ANTHROPIC_AUTH_TOKEN: providerConfig.authToken,
        ANTHROPIC_BASE_URL: providerConfig.baseUrl,
        API_TIMEOUT_MS: '3000000',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
        ANTHROPIC_DEFAULT_OPUS_MODEL: providerConfig.models.opus,
        ANTHROPIC_DEFAULT_SONNET_MODEL: providerConfig.models.sonnet,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: providerConfig.models.haiku,
        ANTHROPIC_SUBAGENT_MODEL: providerConfig.models.subagent,
      },
    };

    // 备份当前配置
    await this.backupCurrentConfig();

    // 写入新配置
    fs.writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(claudeSettings, null, 2));

    // 清除会话缓存
    await this.clearSessionCache();

    // 更新当前 Provider
    config.currentProvider = provider;
    this.store.set('config', config);
  }

  private async backupCurrentConfig(): Promise<void> {
    if (fs.existsSync(CLAUDE_SETTINGS_FILE)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(CLAUDE_CONFIG_DIR, `settings.json.backup.${timestamp}`);
      fs.copyFileSync(CLAUDE_SETTINGS_FILE, backupPath);
    }
  }

  private async clearSessionCache(): Promise<void> {
    const sessionEnvDir = path.join(CLAUDE_CONFIG_DIR, 'session-env');
    if (fs.existsSync(sessionEnvDir)) {
      try {
        const files = fs.readdirSync(sessionEnvDir);
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(sessionEnvDir, file));
          } catch {
            // 静默忽略删除失败，可能被其他进程占用
          }
        }
      } catch {
        // 静默忽略目录读取失败
      }
    }
  }

  getCurrentClaudeSettings(): ClaudeSettings | null {
    if (fs.existsSync(CLAUDE_SETTINGS_FILE)) {
      const content = fs.readFileSync(CLAUDE_SETTINGS_FILE, 'utf-8');
      return JSON.parse(content);
    }
    return null;
  }

  getBackups(): string[] {
    const files = fs.readdirSync(CLAUDE_CONFIG_DIR);
    return files.filter((f: string) => f.startsWith('settings.json.backup.'));
  }

  restoreBackup(backupFileName: string): void {
    const backupPath = path.join(CLAUDE_CONFIG_DIR, backupFileName);
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, CLAUDE_SETTINGS_FILE);
    }
  }
}
