/**
 * 预设的 Provider 配置和脚本模板
 */

import type { ProviderConfig } from './types';

// ==================== Provider 默认配置 ====================

export const DEFAULT_COPILOT_CONFIG: ProviderConfig = {
  id: 'copilot',
  name: 'GitHub Copilot',
  baseUrl: 'http://localhost:4141',
  authToken: 'copilot_dummy_token',
  models: {
    opus: 'claude-sonnet-4',
    sonnet: 'claude-sonnet-4',
    haiku: 'gpt-4o-mini',
    subagent: 'gpt-4o-mini',
  },
};

export const DEFAULT_KIMI_CONFIG: ProviderConfig = {
  id: 'kimi',
  name: 'Kimi (Moonshot)',
  baseUrl: 'https://api.moonshot.cn/anthropic',
  authToken: '',
  models: {
    opus: 'moonshot-v1-128k',
    sonnet: 'moonshot-v1-32k',
    haiku: 'moonshot-v1-8k',
    subagent: 'moonshot-v1-8k',
  },
};

export const DEFAULT_GLM_CONFIG: ProviderConfig = {
  id: 'glm',
  name: 'GLM (智谱)',
  baseUrl: 'https://open.bigmodel.cn/api/anthropic',
  authToken: '',
  models: {
    opus: 'glm-4-plus',
    sonnet: 'glm-4-0520',
    haiku: 'glm-4-air',
    subagent: 'glm-4-flash',
  },
};

export const DEFAULT_ANTHROPIC_CONFIG: ProviderConfig = {
  id: 'anthropic',
  name: 'Anthropic 官方',
  baseUrl: 'https://api.anthropic.com',
  authToken: '',
  models: {
    opus: 'claude-opus-4-20250514',
    sonnet: 'claude-sonnet-4-20250514',
    haiku: 'claude-3-5-haiku-20241022',
    subagent: 'claude-3-5-haiku-20241022',
  },
};

export const DEFAULT_DEEPSEEK_CONFIG: ProviderConfig = {
  id: 'deepseek',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/anthropic',
  authToken: '',
  models: {
    opus: 'deepseek-reasoner',
    sonnet: 'deepseek-chat',
    haiku: 'deepseek-chat',
    subagent: 'deepseek-chat',
  },
};

export const DEFAULT_SILICON_FLOW_CONFIG: ProviderConfig = {
  id: 'silicon-flow',
  name: 'Silicon Flow',
  baseUrl: 'https://api.siliconflow.cn/anthropic',
  authToken: '',
  models: {
    opus: 'claude-3-5-sonnet-20241022',
    sonnet: 'claude-3-5-sonnet-20241022',
    haiku: 'claude-3-5-haiku-20241022',
    subagent: 'claude-3-5-haiku-20241022',
  },
};

// 初始默认配置（包含预设的 provider）
export const INITIAL_PROVIDERS: Record<string, ProviderConfig> = {
  copilot: DEFAULT_COPILOT_CONFIG,
  kimi: DEFAULT_KIMI_CONFIG,
  glm: DEFAULT_GLM_CONFIG,
  anthropic: DEFAULT_ANTHROPIC_CONFIG,
  deepseek: DEFAULT_DEEPSEEK_CONFIG,
  'silicon-flow': DEFAULT_SILICON_FLOW_CONFIG,
};

// ==================== 脚本模板 ====================

/**
 * Kimi 脚本模板
 */
export const KIMI_SCRIPT = `/**
 * Kimi 模型列表获取脚本
 * API 文档: https://platform.moonshot.cn/docs/api-reference
 */

console.log('[Kimi] 开始执行脚本');
console.log('[Kimi] baseUrl:', config.baseUrl);

try {
  // 去掉 baseUrl 中的 /anthropic 后缀（如果有）
  let apiBase = config.baseUrl.replace(/\\/anthropic\\/?$/, '');
  const url = \`\${apiBase}/v1/models\`;
  
  console.log('[Kimi] 请求 URL:', url);
  
  const response = await fetchJson(url, {
    'Authorization': \`Bearer \${config.authToken}\`
  });
  
  console.log('[Kimi] 收到响应:', typeof response, response ? 'data' in response : 'no data');
  
  if (response && response.data && Array.isArray(response.data)) {
    const models = response.data.map(model => ({
      id: model.id,
      name: model.id,
      description: model.owned_by || 'Moonshot',
    }));
    console.log('[Kimi] 成功获取', models.length, '个模型');
    return models;
  }
  
  console.error('[Kimi] API 返回格式不正确');
  return [];
} catch (error) {
  console.error('[Kimi] 捕获错误:', error.message || error);
  return [];
}
`;

/**
 * GLM 脚本模板
 */
export const GLM_SCRIPT = `/**
 * 智谱 GLM 模型列表获取脚本
 * API 文档: https://open.bigmodel.cn/dev/api
 */

console.log('[GLM] 开始执行脚本');
console.log('[GLM] baseUrl:', config.baseUrl);

try {
  // GLM 的模型列表 API 在 /api/paas/v4/models
  const url = 'https://open.bigmodel.cn/api/paas/v4/models';
  
  console.log('[GLM] 请求 URL:', url);
  
  const response = await fetchJson(url, {
    'Authorization': \`Bearer \${config.authToken}\`
  });
  
  console.log('[GLM] 收到响应:', typeof response, response ? 'data' in response : 'no data');
  
  if (response && response.data && Array.isArray(response.data)) {
    const models = response.data.map(model => ({
      id: model.id,
      name: model.id,
      description: model.owned_by || '智谱',
    }));
    console.log('[GLM] 成功获取', models.length, '个模型');
    return models;
  }
  
  console.error('[GLM] API 返回格式不正确');
  return [];
} catch (error) {
  console.error('[GLM] 捕获错误:', error.message || error);
  return [];
}
`;

/**
 * Anthropic 官方脚本模板
 */
export const ANTHROPIC_SCRIPT = `/**
 * Anthropic 官方模型列表获取脚本
 * API 文档: https://docs.anthropic.com/en/api/models
 */

console.log('[Anthropic] 开始执行脚本');
console.log('[Anthropic] baseUrl:', config.baseUrl);

try {
  const url = \`\${config.baseUrl}/v1/models\`;
  console.log('[Anthropic] 请求 URL:', url);
  
  const response = await fetchJson(url, {
    'x-api-key': config.authToken,
    'anthropic-version': '2023-06-01'
  });
  
  console.log('[Anthropic] 收到响应:', typeof response, response ? 'data' in response : 'no data');
  
  if (response && response.data && Array.isArray(response.data)) {
    const models = response.data.map(model => ({
      id: model.id,
      name: model.display_name || model.id,
      description: model.description || '',
    }));
    console.log('[Anthropic] 成功获取', models.length, '个模型');
    return models;
  }
  
  console.error('[Anthropic] API 返回格式不正确');
  return [];
} catch (error) {
  console.error('[Anthropic] 捕获错误:', error.message || error);
  return [];
}
`;

/**
 * DeepSeek 脚本模板
 */
export const DEEPSEEK_SCRIPT = `/**
 * DeepSeek 模型列表获取脚本
 * API 文档: https://platform.deepseek.com/api-docs/
 */

console.log('[DeepSeek] 开始执行脚本');
console.log('[DeepSeek] baseUrl:', config.baseUrl);

try {
  // 去掉 baseUrl 中的 /anthropic 后缀（如果有）
  let apiBase = config.baseUrl.replace(/\\/anthropic\\/?$/, '');
  const url = \`\${apiBase}/v1/models\`;
  
  console.log('[DeepSeek] 请求 URL:', url);
  
  const response = await fetchJson(url, {
    'Authorization': \`Bearer \${config.authToken}\`
  });
  
  console.log('[DeepSeek] 收到响应:', typeof response, response ? 'data' in response : 'no data');
  
  if (response && response.data && Array.isArray(response.data)) {
    const models = response.data.map(model => ({
      id: model.id,
      name: model.id,
      description: model.owned_by || 'DeepSeek',
    }));
    console.log('[DeepSeek] 成功获取', models.length, '个模型');
    return models;
  }
  
  console.error('[DeepSeek] API 返回格式不正确');
  return [];
} catch (error) {
  console.error('[DeepSeek] 捕获错误:', error.message || error);
  return [];
}
`;

/**
 * Silicon Flow 脚本模板
 */
export const SILICON_FLOW_SCRIPT = `/**
 * Silicon Flow 模型列表获取脚本
 * Silicon Flow 直接支持 Anthropic API
 * API 文档: https://docs.siliconflow.cn/
 */

console.log('[Silicon Flow] 开始执行脚本');
console.log('[Silicon Flow] baseUrl:', config.baseUrl);

try {
  // 去掉 baseUrl 中的 /anthropic 后缀（如果有）
  let apiBase = config.baseUrl.replace(/\\/anthropic\\/?$/, '');
  const url = \`\${apiBase}/v1/models\`;
  
  console.log('[Silicon Flow] 请求 URL:', url);
  
  const response = await fetchJson(url, {
    'Authorization': \`Bearer \${config.authToken}\`
  });
  
  console.log('[Silicon Flow] 收到响应:', typeof response, response ? 'data' in response : 'no data');
  
  if (response && response.data && Array.isArray(response.data)) {
    const models = response.data.map(model => ({
      id: model.id,
      name: model.id,
      description: model.owned_by || 'Silicon Flow',
    }));
    console.log('[Silicon Flow] 成功获取', models.length, '个模型');
    return models;
  }
  
  console.error('[Silicon Flow] API 返回格式不正确');
  return [];
} catch (error) {
  console.error('[Silicon Flow] 捕获错误:', error.message || error);
  return [];
}
`;

/**
 * Copilot 专用脚本
 */
export const COPILOT_SCRIPT = `/**
 * GitHub Copilot 模型列表获取脚本
 * 注意：Copilot 使用内置的模型获取逻辑，此脚本不会被执行
 */

// Copilot 使用内置逻辑，不需要用户编写脚本
return [];
`;

/**
 * 默认通用脚本模板（用于新建的 provider）
 */
export const DEFAULT_SCRIPT = `/**
 * 模型列表获取脚本
 * 
 * 可用变量:
 * - config: { id, name, baseUrl, authToken, models }
 * - fetchJson(url, headers): 发送 HTTP GET 请求
 * 
 * 返回格式:
 * [
 *   { id: 'model-id', name: '模型名称', description: '描述（可选）' },
 *   ...
 * ]
 */

try {
  const url = \`\${config.baseUrl}/v1/models\`;
  const response = await fetchJson(url, {
    'Authorization': \`Bearer \${config.authToken}\`
  });
  
  if (response && response.data && Array.isArray(response.data)) {
    return response.data.map(model => ({
      id: model.id,
      name: model.id,
      description: model.owned_by || '',
    }));
  }
  
  return [];
} catch (error) {
  console.error('获取模型列表失败:', error.message || error);
  return [];
}
`;

/**
 * 获取指定 provider 的脚本模板
 */
export function getScriptTemplate(providerId: string): string {
  switch (providerId) {
    case 'kimi':
    case 'moonshot':
      return KIMI_SCRIPT;
    case 'glm':
    case 'zhipu':
      return GLM_SCRIPT;
    case 'anthropic':
      return ANTHROPIC_SCRIPT;
    case 'deepseek':
      return DEEPSEEK_SCRIPT;
    case 'silicon-flow':
    case 'siliconflow':
      return SILICON_FLOW_SCRIPT;
    case 'copilot':
      return COPILOT_SCRIPT;
    default:
      return DEFAULT_SCRIPT;
  }
}

/**
 * 获取指定 provider 的默认配置
 */
export function getDefaultProviderConfig(providerId: string): ProviderConfig | null {
  const configMap: Record<string, ProviderConfig> = {
    'kimi': DEFAULT_KIMI_CONFIG,
    'glm': DEFAULT_GLM_CONFIG,
    'anthropic': DEFAULT_ANTHROPIC_CONFIG,
    'deepseek': DEFAULT_DEEPSEEK_CONFIG,
    'silicon-flow': DEFAULT_SILICON_FLOW_CONFIG,
    'copilot': DEFAULT_COPILOT_CONFIG,
  };
  return configMap[providerId] || null;
}
