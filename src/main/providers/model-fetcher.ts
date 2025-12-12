/**
 * 模型列表获取器
 * 
 * 使用用户配置的脚本来获取模型列表
 */

import type { ProviderId, ProviderConfig, ModelItem } from '../../shared/types';
import { BUILTIN_PROVIDER_COPILOT } from '../../shared/constants.js';
import { executeModelScript, getScriptsDir, ensureProvidersDir } from './script-loader.js';
import https from 'https';
import http from 'http';

interface ModelListCache {
  [key: string]: {
    models: ModelItem[];
    timestamp: number;
  };
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 分钟缓存

export class ModelFetcher {
  private cache: ModelListCache = {};

  constructor() {
    // 确保 providers 目录存在
    ensureProvidersDir();
  }

  /**
   * 获取脚本目录路径
   */
  getScriptsDir(): string {
    return getScriptsDir();
  }

  /**
   * 内置的 Copilot 模型列表获取逻辑
   */
  private async fetchCopilotModels(): Promise<ModelItem[]> {
    console.log('[Copilot] 开始获取模型列表...');
    console.log('[Copilot] 请求 URL: http://localhost:4141/v1/models');
    
    try {
      const response = await this.fetchJson('http://localhost:4141/v1/models');
      
      console.log('[Copilot] 收到响应:', typeof response, response ? 'data' in response : 'no data');
      
      if (response && response.data && Array.isArray(response.data)) {
        const models = response.data.map((model: any) => ({
          id: model.id,
          name: model.id,
          description: model.owned_by || 'Copilot',
        }));
        console.log('[Copilot] 成功获取', models.length, '个模型');
        return models;
      }
      
      console.error('[Copilot] API 返回格式不正确');
    } catch (error: any) {
      console.error('[Copilot] 获取模型列表失败:', error.message);
      console.error('[Copilot] 错误详情:', error);
    }

    // 返回默认列表
    console.log('[Copilot] 使用默认模型列表');
    return [
      { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', description: '启动 Copilot 服务后可获取完整列表' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    ];
  }

  /**
   * HTTP 请求辅助函数
   */
  private async fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
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
   * 获取 Provider 的模型列表
   */
  async fetchModels(provider: ProviderId, config: ProviderConfig): Promise<ModelItem[]> {
    // 检查缓存
    const cacheKey = `${provider}-${config.baseUrl}`;
    const cached = this.cache[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.models;
    }

    let models: ModelItem[] = [];

    try {
      // Copilot 使用内置逻辑
      if (provider === BUILTIN_PROVIDER_COPILOT) {
        models = await this.fetchCopilotModels();
      } else {
        // 其他 provider 使用脚本加载器
        models = await executeModelScript(provider, config);
      }

      // 更新缓存
      if (models.length > 0) {
        this.cache[cacheKey] = {
          models,
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      console.error(`获取 ${provider} 模型列表失败:`, error);
      models = [];
    }

    return models;
  }

  /**
   * 测试连接
   */
  async testConnection(provider: ProviderId, config: ProviderConfig): Promise<boolean> {
    try {
      // 清除缓存以强制重新获取
      this.clearCache(provider);
      const models = await this.fetchModels(provider, config);
      return models.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(provider?: ProviderId) {
    if (provider) {
      Object.keys(this.cache).forEach((key) => {
        if (key.startsWith(provider)) {
          delete this.cache[key];
        }
      });
    } else {
      this.cache = {};
    }
  }
}
