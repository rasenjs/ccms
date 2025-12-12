#!/usr/bin/env node
/**
 * Claude Code Model Switcher - CLI 工具
 * 用于无显示屏的服务器环境
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { INITIAL_PROVIDERS } from '../shared/presets';
import type { ProviderConfig, ClaudeSettings } from '../shared/types';

const CLAUDE_CONFIG_DIR = path.join(os.homedir(), '.claude');
const CLAUDE_SETTINGS_FILE = path.join(CLAUDE_CONFIG_DIR, 'settings.json');

// 跨平台配置目录
const getConfigBaseDir = () => {
  const platform = os.platform();
  if (platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Roaming');
  }
  return path.join(os.homedir(), '.config');
};

const CONFIG_DIR = path.join(getConfigBaseDir(), 'cc-models-provider-switcher');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message: string) {
  console.error(`${colors.red}✗ ${message}${colors.reset}`);
}

function success(message: string) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function info(message: string) {
  console.log(`${colors.blue}ℹ ${message}${colors.reset}`);
}

// 确保配置目录存在
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(CLAUDE_CONFIG_DIR)) {
    fs.mkdirSync(CLAUDE_CONFIG_DIR, { recursive: true });
  }
}

// 读取配置
function loadConfig(): { currentProvider: string; providers: Record<string, ProviderConfig> } {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {
      currentProvider: 'kimi',
      providers: INITIAL_PROVIDERS as Record<string, ProviderConfig>,
    };
  }
  
  const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
  const config = JSON.parse(content);
  return {
    currentProvider: config.currentProvider || 'kimi',
    providers: config.providers || INITIAL_PROVIDERS,
  };
}

// 保存配置
function saveConfig(config: { currentProvider: string; providers: Record<string, ProviderConfig> }) {
  ensureConfigDir();
  const fullConfig = {
    currentProvider: config.currentProvider,
    providerOrder: Object.keys(config.providers),
    providers: config.providers,
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
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(fullConfig, null, 2));
}

// 切换 Provider
function switchProvider(providerId: string) {
  const config = loadConfig();
  
  if (!config.providers[providerId]) {
    error(`Provider '${providerId}' 不存在`);
    process.exit(1);
  }
  
  const provider = config.providers[providerId];
  
  // 生成 Claude settings.json
  const claudeSettings: ClaudeSettings = {
    env: {
      ANTHROPIC_AUTH_TOKEN: provider.authToken,
      ANTHROPIC_BASE_URL: provider.baseUrl,
      API_TIMEOUT_MS: '3000000',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
      ANTHROPIC_DEFAULT_OPUS_MODEL: provider.models.opus,
      ANTHROPIC_DEFAULT_SONNET_MODEL: provider.models.sonnet,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: provider.models.haiku,
      ANTHROPIC_SUBAGENT_MODEL: provider.models.subagent,
    },
  };
  
  // 备份当前配置
  if (fs.existsSync(CLAUDE_SETTINGS_FILE)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(CLAUDE_CONFIG_DIR, `settings.json.backup.${timestamp}`);
    fs.copyFileSync(CLAUDE_SETTINGS_FILE, backupPath);
    info(`已备份当前配置到: ${backupPath}`);
  }
  
  // 写入新配置
  ensureConfigDir();
  fs.writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(claudeSettings, null, 2));
  
  // 清除会话缓存
  const sessionEnvDir = path.join(CLAUDE_CONFIG_DIR, 'session-env');
  if (fs.existsSync(sessionEnvDir)) {
    fs.rmSync(sessionEnvDir, { recursive: true, force: true });
  }
  
  // 更新配置
  config.currentProvider = providerId;
  saveConfig(config);
  
  success(`已切换到: ${provider.name} (${providerId})`);
  info(`Base URL: ${provider.baseUrl}`);
  info(`Sonnet Model: ${provider.models.sonnet}`);
}

// 列出所有 Provider
function listProviders() {
  const config = loadConfig();
  
  log('\n可用的 Provider:', 'bright');
  log('─'.repeat(80), 'cyan');
  
  Object.entries(config.providers).forEach(([id, provider]) => {
    const isCurrent = id === config.currentProvider;
    const prefix = isCurrent ? '▶' : ' ';
    const color = isCurrent ? 'green' : 'reset';
    
    log(`${prefix} ${id.padEnd(15)} ${provider.name}`, color);
    log(`  ${''.padEnd(15)} Base URL: ${provider.baseUrl}`, 'cyan');
    log(`  ${''.padEnd(15)} Sonnet: ${provider.models.sonnet}`, 'cyan');
  });
  
  log('─'.repeat(80), 'cyan');
  log(`\n当前使用: ${colors.green}${config.currentProvider}${colors.reset}\n`);
}

// 显示当前配置
function showCurrent() {
  const config = loadConfig();
  const provider = config.providers[config.currentProvider];
  
  if (!provider) {
    error('未找到当前 Provider 配置');
    process.exit(1);
  }
  
  log('\n当前配置:', 'bright');
  log('─'.repeat(80), 'cyan');
  log(`Provider: ${config.currentProvider}`, 'green');
  log(`名称: ${provider.name}`);
  log(`Base URL: ${provider.baseUrl}`);
  log(`Auth Token: ${provider.authToken ? provider.authToken.substring(0, 10) + '...' : '(未设置)'}`);
  log('\n模型配置:', 'yellow');
  log(`  Opus: ${provider.models.opus}`);
  log(`  Sonnet: ${provider.models.sonnet}`);
  log(`  Haiku: ${provider.models.haiku}`);
  log(`  Subagent: ${provider.models.subagent}`);
  log('─'.repeat(80), 'cyan');
  log('');
}

// 显示帮助
function showHelp() {
  log('\nClaude Code Model Switcher - CLI', 'bright');
  log('用于无显示屏服务器环境的命令行工具\n', 'cyan');
  
  log('用法:', 'yellow');
  log('  cc-switcher <命令> [参数]\n');
  
  log('命令:', 'yellow');
  log('  list, ls           列出所有可用的 Provider');
  log('  switch <id>        切换到指定的 Provider');
  log('  current, show      显示当前配置');
  log('  help, -h, --help   显示帮助信息\n');
  
  log('示例:', 'yellow');
  log('  cc-switcher list');
  log('  cc-switcher switch kimi');
  log('  cc-switcher current\n');
  
  log('支持的 Provider ID:', 'yellow');
  Object.entries(INITIAL_PROVIDERS).forEach(([id, provider]) => {
    log(`  ${id.padEnd(12)} - ${provider.name}`);
  });
  log('');
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command || command === 'help' || command === '-h' || command === '--help') {
    showHelp();
    return;
  }
  
  try {
    switch (command) {
      case 'list':
      case 'ls':
        listProviders();
        break;
        
      case 'switch':
        if (!args[1]) {
          error('请指定 Provider ID');
          log('用法: cc-switcher switch <id>');
          process.exit(1);
        }
        switchProvider(args[1]);
        break;
        
      case 'current':
      case 'show':
        showCurrent();
        break;
        
      default:
        error(`未知命令: ${command}`);
        log('运行 "cc-switcher help" 查看帮助');
        process.exit(1);
    }
  } catch (err) {
    error(`执行失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
