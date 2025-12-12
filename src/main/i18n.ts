type MainLang = 'en' | 'zh';

type MainI18nDict = Record<string, string>;

type Vars = Record<string, string | number | boolean | null | undefined>;

const dict: Record<MainLang, MainI18nDict> = {
  en: {
    'tray.tooltip': 'Claude Code Model Switcher',
    'tray.current': 'Current: {{name}}',
    'tray.switchProvider': 'Switch provider',
    'tray.configure': 'Configure...',
    'tray.quit': 'Quit',
    'tray.notConfiguredSuffix': ' (Not configured)',

    'providers.presets.copilot': 'GitHub Copilot',
    'providers.presets.kimi': 'Kimi (Moonshot)',
    'providers.presets.glm': 'GLM (Zhipu)',
    'providers.presets.anthropic': 'Anthropic',
    'providers.presets.deepseek': 'DeepSeek',
    'providers.presets.silicon-flow': 'Silicon Flow',

    'dialog.selectIconTitle': 'Select icon (PNG)',
    'dialog.errorTitle': 'Error',
    'dialog.ok': 'OK',
    'dialog.cancel': 'Cancel',

    'errors.copilotStartFailed': 'Failed to start copilot-api service',
    'copilot.models.startServiceHint': 'Start Copilot service to fetch full list',
  },
  zh: {
    'tray.tooltip': 'Claude Code Model Switcher',
    'tray.current': '当前: {{name}}',
    'tray.switchProvider': '切换模型来源',
    'tray.configure': '配置...',
    'tray.quit': '退出',
    'tray.notConfiguredSuffix': ' (未配置)',

    'providers.presets.copilot': 'GitHub Copilot',
    'providers.presets.kimi': 'Kimi (Moonshot)',
    'providers.presets.glm': 'GLM (智谱)',
    'providers.presets.anthropic': 'Anthropic 官方',
    'providers.presets.deepseek': 'DeepSeek',
    'providers.presets.silicon-flow': 'Silicon Flow',

    'dialog.selectIconTitle': '选择图标（PNG）',
    'dialog.errorTitle': '错误',
    'dialog.ok': '确定',
    'dialog.cancel': '取消',

    'errors.copilotStartFailed': '无法启动 copilot-api 服务',
    'copilot.models.startServiceHint': '启动 Copilot 服务后可获取完整列表',
  },
};

function normalizeLang(locale: string | undefined | null): MainLang {
  const lower = (locale ?? '').toLowerCase();
  return lower.startsWith('zh') ? 'zh' : 'en';
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function getRaw(locale: string | undefined | null, key: string): string | undefined {
  const lang = normalizeLang(locale);
  return dict[lang][key] ?? dict.en[key];
}

export function tMain(locale: string | undefined | null, key: string, vars?: Vars): string {
  const value = getRaw(locale, key) ?? key;
  return interpolate(value, vars);
}

export function tMainMaybe(locale: string | undefined | null, key: string, vars?: Vars): string | undefined {
  const value = getRaw(locale, key);
  if (!value) return undefined;
  return interpolate(value, vars);
}

export function tProviderName(locale: string | undefined | null, providerId: string, fallbackName: string): string {
  return tMainMaybe(locale, `providers.presets.${providerId}`) ?? fallbackName;
}
