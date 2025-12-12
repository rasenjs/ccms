import { useState, useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Languages, Monitor, Moon, Sun, X } from 'lucide-react';
import { ProviderList } from './components/ProviderList';
import { ProviderConfig } from './components/ProviderConfig';
import AddProviderDialog from './components/dialogs/AddProviderDialog';
import EditScriptDialog from './components/dialogs/EditScriptDialog';
import type { AppConfig, ProviderId } from '../shared/types';
import { useElectronAPI } from './hooks/useElectronAPI';
import { useTranslation } from 'react-i18next';
import type { ThemePreference } from './theme';
import { applyThemePreference, loadThemePreference, saveThemePreference } from './theme';

type TabType = 'providers' | 'config';

function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('providers');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [loading, setLoading] = useState(true);
  const [themePref, setThemePref] = useState<ThemePreference>(() => loadThemePreference());
  const api = useElectronAPI();

  const isDev = import.meta.env.DEV;

  const getNormalizedUiLang = (): 'zh' | 'en' =>
    (i18n.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';

  // 检查当前路由是否为对话框路由
  const dialogRoute = window.location.hash.replace('#/', '');
  const isDialog = dialogRoute.startsWith('dialog/');

  console.log('Current route:', window.location.hash, 'dialogRoute:', dialogRoute, 'isDialog:', isDialog);

  // 如果是对话框路由，渲染对应的对话框组件
  if (isDialog) {
    const dialogType = dialogRoute.replace('dialog/', '');
    console.log('Rendering dialog:', dialogType);
    
    if (dialogType === 'add-provider') {
      return <AddProviderDialog />;
    }
    
    if (dialogType === 'edit-script') {
      return <EditScriptDialog />;
    }
    
    return null;
  }

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async (options?: { preserveSelectedProvider?: boolean }) => {
    try {
      setLoading(true);
      const appConfig = await api.getConfig();
      setConfig(appConfig);

      // Sync UI language from config (best-effort)
      const configLang = appConfig.language;
      const normalizedLang = (i18n.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
      if (configLang === 'zh' || configLang === 'en') {
        if (configLang !== normalizedLang) {
          await i18n.changeLanguage(configLang);
          try {
            localStorage.setItem('ccms.language', configLang);
          } catch {
            // ignore
          }
        }
      } else {
        // Persist current detected language if config doesn't have it yet
        try {
          await api.setConfig({ language: normalizedLang });
        } catch {
          // ignore
        }
      }

      const preserve = options?.preserveSelectedProvider;
      if (!preserve) {
        setSelectedProvider(appConfig.currentProvider);
        return;
      }

      // Preserve current selection if it still exists; otherwise fall back.
      setSelectedProvider(prevSelected => {
        if (prevSelected && appConfig.providers[prevSelected]) return prevSelected;
        return appConfig.currentProvider;
      });
    } catch (error) {
      console.error('加载配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchProvider = async (provider: ProviderId) => {
    try {
      await api.switchProvider(provider);
      // 只更新当前 provider，不重新加载整个配置（避免闪烁）
      setConfig(prev => prev ? { ...prev, currentProvider: provider } : null);
      setSelectedProvider(provider);
    } catch (error) {
      console.error('切换 Provider 失败:', error);
      alert(t('app.switchFailed', { error: String(error) }));
    }
  };

  const handleSelectProvider = (provider: ProviderId) => {
    setSelectedProvider(provider);
    setActiveTab('config');
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-default">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-sm text-secondary">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex h-screen items-center justify-center bg-default">
        <div className="text-center">
          <p className="mb-4 text-secondary">{t('app.configLoadFailed')}</p>
          <button 
            onClick={() => loadConfig()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-default">
      {/* 自定义标题栏 */}
      <div className="flex h-[52px] select-none items-center justify-between bg-gradient-to-r from-purple-600 to-indigo-600 px-4 pl-[85px] text-white">
        <div className="titlebar-drag flex flex-1 items-center">
          <span className="text-[13px] font-medium opacity-95">{t('app.title')}</span>
        </div>
        <div className="titlebar-no-drag flex items-center gap-2">
          <div className="relative group h-8 w-8">
            <div
              className="flex h-8 w-8 items-center justify-center rounded transition-colors group-hover:bg-white/20 group-active:bg-white/30"
              title={`${t('app.theme')}: ${t(`app.themes.${themePref}`)}`}
            >
              {themePref === 'dark' ? <Moon size={16} /> : themePref === 'light' ? <Sun size={16} /> : <Monitor size={16} />}
            </div>
            <select
              aria-label={t('app.theme')}
              className="absolute inset-0 h-8 w-8 cursor-pointer opacity-0"
              value={themePref}
              onChange={(e) => {
                const next = (e.target.value === 'light' || e.target.value === 'dark' || e.target.value === 'system'
                  ? e.target.value
                  : 'system') as ThemePreference;
                setThemePref(next);
                applyThemePreference(next);
                saveThemePreference(next);
              }}
            >
              <option value="system">{t('app.themes.system')}</option>
              <option value="light">{t('app.themes.light')}</option>
              <option value="dark">{t('app.themes.dark')}</option>
            </select>
          </div>
          <div className="relative group h-8 w-8">
            <div
              className="flex h-8 w-8 items-center justify-center rounded transition-colors group-hover:bg-white/20 group-active:bg-white/30"
              title={`${t('app.language')}: ${t(`app.languages.${getNormalizedUiLang()}`)}`}
            >
              <Languages size={16} />
            </div>
            <select
              aria-label={t('app.language')}
              className="absolute inset-0 h-8 w-8 cursor-pointer opacity-0"
              value={getNormalizedUiLang()}
              onChange={async (e) => {
                const lang = (e.target.value === 'zh' ? 'zh' : 'en') as 'zh' | 'en';
                await i18n.changeLanguage(lang);
                try {
                  localStorage.setItem('ccms.language', lang);
                } catch {
                  // ignore
                }
                try {
                  await api.setConfig({ language: lang });
                } catch {
                  // ignore
                }
              }}
            >
              <option value="en">{t('app.languages.en')}</option>
              <option value="zh">{t('app.languages.zh')}</option>
            </select>
          </div>
          {isDev && (
            <button
              type="button"
              className="flex h-8 items-center justify-center rounded px-2 text-xs font-medium transition-colors hover:bg-white/20 active:bg-white/30"
              onClick={() => api.devtools?.open?.()}
              title={t('app.devtools')}
            >
              {t('app.devtools')}
            </button>
          )}
          <button
            className="flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-white/20 active:bg-white/30"
            onClick={() => api.hideWindow()}
            title={t('common.cancel')}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <Tabs.Root value={activeTab} onValueChange={(value) => setActiveTab(value as TabType)} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-default bg-surface px-4">
          <Tabs.List className="flex gap-1">
            <Tabs.Trigger 
              value="providers"
              className="relative px-4 py-3 text-sm font-medium text-secondary transition-colors hover:text-default data-[state=active]:text-primary data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary"
            >
              {t('app.tabs.providers')}
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="config"
              className="relative px-4 py-3 text-sm font-medium text-secondary transition-colors hover:text-default data-[state=active]:text-primary data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary"
            >
              {t('app.tabs.config')}
            </Tabs.Trigger>
          </Tabs.List>
          
          <div className="flex items-center gap-3">
            {activeTab === 'providers' && (
              <button 
                onClick={async () => {
                  await api.dialog.open({
                    id: 'add-provider',
                    route: 'add-provider',
                    width: 500,
                    height: 400,
                  });
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
              >
                {t('app.addProvider')}
              </button>
            )}
          </div>
        </div>

        <Tabs.Content value="providers" className="flex-1 overflow-auto p-4">
          <ProviderList
            config={config}
            onSwitch={handleSwitchProvider}
            onSelect={handleSelectProvider}
          />
        </Tabs.Content>

        <Tabs.Content value="config" className="flex-1 overflow-auto p-4">
          {selectedProvider && (
            <ProviderConfig
              provider={selectedProvider}
              config={config.providers[selectedProvider]}
              onSave={() => loadConfig({ preserveSelectedProvider: true })}
            />
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

export default App;
