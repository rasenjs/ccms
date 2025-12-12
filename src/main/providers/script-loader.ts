/**
 * 模型列表脚本加载器
 * 
 * 此模块负责管理 provider 的配置文件夹
 * 每个 provider 对应一个文件夹：~/.config/cc-model-switcher/providers/{providerId}/
 * 文件夹包含：
 *   - config.json: provider 配置
 *   - script.js: 模型列表获取脚本
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import vm from 'vm';
import https from 'https';
import http from 'http';
import type { ModelItem, ProviderConfig, ProviderId } from '../../shared/types';
import { 
  getScriptTemplate,
  getDefaultProviderConfig
} from '../../shared/presets.js';

// Providers 目录
// 跨平台配置目录
const getConfigBaseDir = () => {
  const platform = os.platform();
  if (platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Roaming');
  }
  return path.join(os.homedir(), '.config');
};

const APP_DIR_NAME = 'cc-model-switcher';
const LEGACY_APP_DIR_NAME = 'cc-models-provider-switcher';

const PROVIDERS_DIR = path.join(getConfigBaseDir(), APP_DIR_NAME, 'providers');
const LEGACY_PROVIDERS_DIR = path.join(getConfigBaseDir(), LEGACY_APP_DIR_NAME, 'providers');

function migrateLegacyProvidersDirIfNeeded(): void {
  try {
    if (!fs.existsSync(PROVIDERS_DIR) && fs.existsSync(LEGACY_PROVIDERS_DIR)) {
      const baseDir = getConfigBaseDir();
      const legacyRoot = path.join(baseDir, LEGACY_APP_DIR_NAME);
      const newRoot = path.join(baseDir, APP_DIR_NAME);
      fs.mkdirSync(path.dirname(newRoot), { recursive: true });
      fs.cpSync(legacyRoot, newRoot, { recursive: true });
    }
  } catch {
    // 静默忽略迁移失败
  }
}

/**
 * 确保 providers 目录存在
 */
export function ensureProvidersDir(): void {
  migrateLegacyProvidersDirIfNeeded();
  if (!fs.existsSync(PROVIDERS_DIR)) {
    fs.mkdirSync(PROVIDERS_DIR, { recursive: true });
  }
}

/**
 * 获取 provider 的文件夹路径
 */
export function getProviderDir(providerId: ProviderId): string {
  migrateLegacyProvidersDirIfNeeded();
  return path.join(PROVIDERS_DIR, providerId);
}

/**
 * 确保 provider 文件夹存在，并创建默认文件和配置
 */
export function ensureProviderDir(providerId: ProviderId): void {
  // Copilot 不使用脚本系统，跳过
  if (providerId === 'copilot') {
    return;
  }
  
  ensureProvidersDir();
  const providerDir = getProviderDir(providerId);
  
  if (!fs.existsSync(providerDir)) {
    fs.mkdirSync(providerDir, { recursive: true });
  }

  // 创建默认脚本（如果不存在）
  const scriptPath = path.join(providerDir, 'script.js');
  if (!fs.existsSync(scriptPath)) {
    const template = getScriptTemplate(providerId);
    fs.writeFileSync(scriptPath, template);
  }
  
  // 同时创建配置文件（如果不存在）- 将配置和脚本放在一起
  const configPath = path.join(providerDir, 'config.json');
  if (!fs.existsSync(configPath)) {
    const defaultConfig = getDefaultProviderConfig(providerId);
    if (defaultConfig) {
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    }
  }
}

/**
 * 强制更新预设 provider 的脚本（用于修复错误的脚本）
 */
export function forceUpdatePresetScript(providerId: ProviderId): void {
  const presetProviders = ['kimi', 'moonshot', 'glm', 'zhipu', 'anthropic', 'deepseek'];
  
  // Copilot 不使用脚本系统，跳过
  if (providerId === 'copilot') {
    return;
  }
  
  // 只更新预设的 provider
  if (!presetProviders.includes(providerId)) {
    return;
  }
  
  ensureProvidersDir();
  const providerDir = getProviderDir(providerId);
  
  if (!fs.existsSync(providerDir)) {
    fs.mkdirSync(providerDir, { recursive: true });
  }

  // 强制覆盖脚本文件
  const scriptPath = path.join(providerDir, 'script.js');
  const template = getScriptTemplate(providerId);
  fs.writeFileSync(scriptPath, template);
  console.log(`[Script Loader] 已强制更新 ${providerId} 的脚本`);
}

/**
 * 读取 provider 的脚本内容
 */
export function getProviderScript(providerId: ProviderId): string {
  ensureProviderDir(providerId);
  const scriptPath = path.join(getProviderDir(providerId), 'script.js');
  
  if (!fs.existsSync(scriptPath)) {
    return getScriptTemplate('default');
  }
  
  return fs.readFileSync(scriptPath, 'utf-8');
}

/**
 * 保存 provider 的脚本内容
 */
export function saveProviderScript(providerId: ProviderId, content: string): void {
  ensureProviderDir(providerId);
  const scriptPath = path.join(getProviderDir(providerId), 'script.js');
  fs.writeFileSync(scriptPath, content, 'utf-8');
}

/**
 * 获取脚本目录路径（废弃，改为获取 provider 目录）
 */
export function getScriptsDir(): string {
  ensureProvidersDir();
  return PROVIDERS_DIR;
}

/**
 * HTTP 请求辅助函数（提供给脚本使用）
 */
async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 10000,
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * 执行模型列表获取脚本
 * 
 * @param providerId Provider ID
 * @param config Provider 配置
 * @returns 模型列表
 */
export async function executeModelScript(
  providerId: ProviderId,
  config: ProviderConfig
): Promise<ModelItem[]> {
  ensureProviderDir(providerId);

  const scriptPath = path.join(getProviderDir(providerId), 'script.js');

  try {
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

    // 创建脚本上下文
    const context = {
      // Provider 配置信息
      config: {
        id: config.id,
        name: config.name,
        baseUrl: config.baseUrl,
        authToken: config.authToken,
      },
      // 辅助函数
      fetchJson,
      // 结果
      result: [] as ModelItem[],
      // Console（用于调试）
      console: {
        log: (...args: unknown[]) => console.log(`[${config.id}]`, ...args),
        error: (...args: unknown[]) => console.error(`[${config.id}]`, ...args),
      },
    };

    // 创建沙箱环境
    vm.createContext(context);

    // 执行脚本（包装成 async IIFE 并等待完成）
    const wrappedScript = `
      (async () => {
        ${scriptContent}
      })().then(r => { 
        if (r) result = r; 
        return true;
      }).catch(e => { 
        console.error('脚本执行错误:', e); 
        return false;
      });
    `;

    const script = new vm.Script(wrappedScript);
    const promise = script.runInContext(context);

    // 等待 Promise 完成（最多 10 秒）
    if (promise && typeof promise.then === 'function') {
      await Promise.race([
        promise,
        new Promise(resolve => setTimeout(resolve, 10000))
      ]);
    } else {
      // 如果不是 Promise，等待一段时间
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 返回结果
    console.log(`[${config.id}] 脚本执行完成，结果数量:`, Array.isArray(context.result) ? context.result.length : 0);
    return Array.isArray(context.result) ? context.result : [];
  } catch (error) {
    console.error(`执行脚本失败 [${scriptPath}]:`, error);
    return [];
  }
}
