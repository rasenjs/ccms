import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { AppConfig, ProviderId, CopilotStatus } from '../../shared/types';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { BUILTIN_PROVIDER_COPILOT } from '../../shared/constants';
import { useTranslation } from 'react-i18next';

interface ProviderListProps {
  config: AppConfig;
  onSwitch: (provider: ProviderId) => void;
  onSelect: (provider: ProviderId) => void;
}

export function ProviderList({ config, onSwitch, onSelect }: ProviderListProps) {
  const { t } = useTranslation();
  const api = useElectronAPI();
  const [copilotStatus, setCopilotStatus] = useState<CopilotStatus | null>(null);
  const [badgeDataMap, setBadgeDataMap] = useState<Record<string, string | null>>({});

  useEffect(() => {
    // 获取 Copilot 状态
    const loadCopilotStatus = async () => {
      if (api?.copilot?.getStatus) {
        const status = await api.copilot.getStatus();
        setCopilotStatus(status);
      }
    };
    loadCopilotStatus();

    // 监听状态变化
    const interval = setInterval(loadCopilotStatus, 3000);
    return () => clearInterval(interval);
  }, [api]);

  useEffect(() => {
    let cancelled = false;

    const loadBadges = async () => {
      if (!api?.getProviderBadgeData) return;

      const entries = await Promise.all(
        config.providerOrder.map(async (providerId) => {
          try {
            const dataUrl = await api.getProviderBadgeData(providerId);
            return [providerId, dataUrl] as const;
          } catch {
            return [providerId, null] as const;
          }
        })
      );

      if (cancelled) return;
      const next: Record<string, string | null> = {};
      for (const [id, url] of entries) next[id] = url;
      setBadgeDataMap(next);
    };

    loadBadges();
    return () => {
      cancelled = true;
    };
  }, [api, config]);

  useEffect(() => {
    // 监听来自对话框的消息
    if (!api?.dialog?.onMessage) return;
    
    const unsubscribe = api.dialog.onMessage((data: any) => {
      if (data.action === 'provider-added') {
        // 刷新配置
        window.location.reload();
      } else if (data.action === 'script-saved') {
        // 可以显示保存成功提示
        console.log('Script saved for provider:', data.providerId);
      }
    });

    return () => unsubscribe();
  }, [api]);

  // 检查 provider 是否已正确配置
  const isProviderConfigured = (providerId: ProviderId): boolean => {
    const provider = config.providers[providerId];
    if (!provider) return false;
    
    if (providerId === BUILTIN_PROVIDER_COPILOT) {
      // Copilot 需要安装、运行、有 Token
      return copilotStatus?.installed && copilotStatus?.running && copilotStatus?.hasToken || false;
    }
    
    // 其他 provider 需要有 authToken
    return !!provider.authToken;
  };

  const getCopilotStatusText = () => {
    if (!copilotStatus) return '';
    const parts: string[] = [];
    if (!copilotStatus.installed) {
      parts.push(t('providerList.status.notInstalled'));
    } else if (copilotStatus.running) {
      parts.push(t('providerList.status.running'));
    } else {
      parts.push(t('providerList.status.notRunning'));
    }
    if (!copilotStatus.hasToken) {
      parts.push(t('providerList.status.unauthorized'));
    }
    return parts.length > 0 ? `(${parts.join(', ')})` : '';
  };

  const handleDeleteProvider = async (providerId: ProviderId, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (providerId === BUILTIN_PROVIDER_COPILOT) {
      await api.dialog.showError(t('providerList.deleteBuiltInCopilot'));
      return;
    }
    
    const provider = config.providers[providerId];
    
    // 二次确认（使用原生确认框）
    if (!confirm(t('providerList.confirmDelete', { name: provider?.name ?? providerId }))) {
      return;
    }
    
    api.deleteProvider?.(providerId).then(() => {
      window.location.reload();
    }).catch((err: unknown) => {
      alert(t('providerList.deleteFailed', { error: String(err) }));
    });
  };

  const getDisabledReason = (providerId: ProviderId): string | undefined => {
    const provider = config.providers[providerId];
    if (!provider) return t('providerList.reasons.configMissing');
    
    if (providerId === BUILTIN_PROVIDER_COPILOT) {
      if (!copilotStatus?.installed) return t('providerList.reasons.installCopilotApi');
      if (!copilotStatus?.hasToken) return t('providerList.reasons.githubAuth');
      if (!copilotStatus?.running) return t('providerList.reasons.startService');
    } else {
      if (!provider.authToken) return t('providerList.reasons.apiToken');
    }
    return undefined;
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {config.providerOrder.map((providerId: ProviderId) => {
          const provider = config.providers[providerId];
          if (!provider) return null;
          
          const isActive = config.currentProvider === providerId;
          const isCopilot = providerId === BUILTIN_PROVIDER_COPILOT;
          const isConfigured = isProviderConfigured(providerId);
          const disabledReason = getDisabledReason(providerId);
          
          return (
            <div 
              key={providerId} 
              className={`
                relative rounded-lg border p-4 transition-all
                ${isActive 
                  ? 'border-primary bg-primary/5 shadow-sm' 
                  : 'border-default bg-surface border-hover hover:shadow-sm'
                }
                ${!isConfigured ? 'opacity-75' : ''}
              `}
            >
              {!isCopilot && (
                <button 
                  onClick={(e) => handleDeleteProvider(providerId, e)}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded text-muted danger-hover transition-colors"
                  title={t('providerList.deleteTitle')}
                >
                  <X size={16} />
                </button>
              )}
              
              <div className="flex items-end justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-medium text-default truncate flex items-center gap-2">
                    {badgeDataMap[providerId] && (
                      <img
                        src={badgeDataMap[providerId] as string}
                        alt=""
                        className="h-5 w-5 rounded border border-default bg-surface object-contain"
                        draggable={false}
                      />
                    )}
                    <span className="truncate">{provider.name}</span>
                    {isCopilot && copilotStatus && (
                      <span className="ml-2 text-xs text-muted">
                        {getCopilotStatusText()}
                      </span>
                    )}
                  </h3>
                  <p className="mt-1 text-xs text-muted font-mono truncate">
                    {provider.baseUrl}
                  </p>
                  <p className="mt-1 text-xs text-secondary">
                    Sonnet: {provider.models.sonnet || <span className="text-muted">{t('providerList.notConfigured')}</span>}
                  </p>
                </div>
                
                <div className="flex gap-2 flex-shrink-0">
                  <button 
                    onClick={() => !isActive && isConfigured && onSwitch(providerId)}
                    disabled={isActive || !isConfigured}
                    title={isActive ? t('providerList.activeTitle') : disabledReason}
                    className={`
                      rounded-md px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap min-w-[100px]
                      ${isActive
                        ? 'bg-primary/20 text-primary cursor-default'
                        : isConfigured
                          ? 'bg-primary text-white hover:bg-primary/90'
                          : 'bg-muted text-muted cursor-not-allowed'
                      }
                    `}
                  >
                    {isActive ? t('providerList.inUse') : t('providerList.switchTo')}
                  </button>
                  <button 
                    onClick={() => onSelect(providerId)}
                    className="rounded-md border border-default bg-surface px-4 py-2 text-sm font-medium text-secondary bg-hover transition-colors whitespace-nowrap min-w-[80px]"
                  >
                    {t('providerList.configure')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
