import { useState, useEffect, useCallback } from 'react';
import * as Label from '@radix-ui/react-label';
import { Copy, FileEdit, AlertCircle, RefreshCw, ImageUp, Trash2 } from 'lucide-react';
import type {
  ProviderId,
  ProviderConfig as ProviderConfigType,
  ModelItem,
  ModelRole,
  CopilotStatus,
} from '../../shared/types';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { BUILTIN_PROVIDER_COPILOT } from '../../shared/constants';
import { SearchableSelect } from './SearchableSelect';
import { useTranslation } from 'react-i18next';

interface ProviderConfigProps {
  provider: ProviderId;
  config: ProviderConfigType;
  onSave: () => void;
}

const MODEL_ROLES: ModelRole[] = ['opus', 'sonnet', 'haiku', 'subagent'];

export function ProviderConfig({ provider, config, onSave }: ProviderConfigProps) {
  const { t } = useTranslation();
  const api = useElectronAPI();
  const isCopilot = provider === BUILTIN_PROVIDER_COPILOT;

  const [badgeDataUrl, setBadgeDataUrl] = useState<string | null>(null);
  const [pendingBadge, setPendingBadge] = useState<
    { type: 'set'; srcPath: string; dataUrl: string } | { type: 'clear' } | null
  >(null);

  const [formData, setFormData] = useState({
    authToken: config.authToken,
    baseUrl: config.baseUrl,
    models: { ...config.models },
  });
  const [modelList, setModelList] = useState<ModelItem[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  // Copilot 专用状态
  const [copilotStatus, setCopilotStatus] = useState<CopilotStatus>({
    installed: false,
    running: false,
    hasToken: false,
    authInProgress: false,
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<{ code?: string; url?: string }>({});
  const [authError, setAuthError] = useState<string | null>(null);

  const hasToken = isCopilot ? copilotStatus.hasToken : !!formData.authToken;
  const copilotReady =
    isCopilot && copilotStatus.installed && copilotStatus.hasToken && copilotStatus.running;

  const checkCopilotStatus = useCallback(async () => {
    if (!api?.copilot?.getStatus) return;
    try {
      const newStatus = await api.copilot.getStatus();
      setCopilotStatus(newStatus);
      if (newStatus.authCode) {
        setAuthInfo({ code: newStatus.authCode, url: newStatus.authUrl });
      }
    } catch (error) {
      console.error('检查状态失败:', error);
    }
  }, [api]);

  useEffect(() => {
    if (!isCopilot || !api?.copilot?.onAuthProgress) return;
    api.copilot.onAuthProgress(
      (data: { deviceCode?: string; verificationUrl?: string; message?: string }) => {
        if (data.deviceCode) {
          setAuthInfo({ code: data.deviceCode, url: data.verificationUrl });
        }
        if (data.message?.includes('成功')) {
          setAuthInfo({});
          setAuthError(null); // 清除错误
          setActionLoading(null); // 授权成功，清除 loading 状态
          checkCopilotStatus();
        } else if (data.message?.includes('失败') || data.message?.includes('出错')) {
          setActionLoading(null); // 授权失败或出错，清除 loading 状态
        }
      }
    );
    return () => api.copilot.removeAllListeners();
  }, [api, isCopilot, checkCopilotStatus]);

  useEffect(() => {
    if (isCopilot) {
      checkCopilotStatus();
      const interval = setInterval(checkCopilotStatus, authInfo.code ? 2000 : 5000);
      return () => clearInterval(interval);
    } else if (hasToken) {
      fetchModels();
    }
  }, [isCopilot, hasToken, authInfo.code, checkCopilotStatus]);

  useEffect(() => {
    if (copilotReady) fetchModels();
  }, [copilotReady]);

  const fetchModels = async () => {
    if (!hasToken) return;
    if (isCopilot && !copilotReady) return;

    setLoadingModels(true);
    setFetchError(null);
    try {
      const models = await api.getModels(provider, formData.authToken || undefined);
      // 去重：使用 Map 按 id 去重，保留第一次出现的模型
      const uniqueModels = Array.from(new Map(models.map((m) => [m.id, m])).values());
      setModelList(uniqueModels);
    } catch (error: any) {
      setFetchError(error?.message || t('providerConfig.models.fetchFailed'));
    } finally {
      setLoadingModels(false);
    }
  };

  const handleModelChange = (role: ModelRole, value: string) => {
    setFormData((prev) => ({
      ...prev,
      models: { ...prev.models, [role]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateProvider(provider, formData);

      if (pendingBadge?.type === 'set') {
        const ok = await api.setProviderBadge(provider, pendingBadge.srcPath);
        if (!ok) {
          alert(t('providerConfig.badge.saveOkButSetFailed'));
          return;
        }
      }

      if (pendingBadge?.type === 'clear') {
        const ok = await api.clearProviderBadge(provider);
        if (!ok) {
          alert(t('providerConfig.badge.saveOkButClearFailed'));
          return;
        }
      }

      if (pendingBadge) {
        try {
          const url = await api.getProviderBadgeData(provider);
          setBadgeDataUrl(url);
        } catch {
          // ignore
        }
        setPendingBadge(null);
      }

      alert(t('providerConfig.save.success'));
      onSave();
    } catch (error) {
      alert(t('providerConfig.save.failed', { error: String(error) }));
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testConnection(provider, formData.authToken);
      setTestResult({
        success: result,
        message: result
          ? t('providerConfig.credentials.connectionSuccess')
          : t('providerConfig.credentials.connectionFailed'),
      });
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error?.message || t('providerConfig.credentials.connectionFailed'),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleInstall = async () => {
    if (!api?.copilot?.install) return;
    try {
      setActionLoading('install');
      await api.copilot.install();
      await checkCopilotStatus();
    } catch (error) {
      console.error('安装出错:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStart = async () => {
    if (!api?.copilot?.start) return;
    try {
      setActionLoading('start');
      const result = await api.copilot.start();
      if (result.success) {
        setFormData((prev) => ({ ...prev, baseUrl: 'http://localhost:4141/anthropic' }));
      }
      await checkCopilotStatus();
    } catch (error) {
      console.error('启动出错:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async () => {
    if (!api?.copilot?.stop) return;
    try {
      setActionLoading('stop');
      await api.copilot.stop();
      await checkCopilotStatus();
    } catch (error) {
      console.error('停止出错:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getCopilotServiceButton = () => {
    if (actionLoading === 'install')
      return {
        text: t('providerConfig.credentials.service.installing'),
        disabled: true,
        onClick: () => {},
        className: '',
      };
    if (actionLoading === 'start')
      return {
        text: t('providerConfig.credentials.service.starting'),
        disabled: true,
        onClick: () => {},
        className: '',
      };
    if (actionLoading === 'stop')
      return {
        text: t('providerConfig.credentials.service.stopping'),
        disabled: true,
        onClick: () => {},
        className: '',
      };
    if (copilotStatus.running)
      return {
        text: t('providerConfig.credentials.service.stop'),
        disabled: false,
        onClick: handleStop,
        className: 'danger',
      };
    if (!copilotStatus.installed)
      return {
        text: t('providerConfig.credentials.service.installAndStart'),
        disabled: false,
        onClick: handleInstallAndStart,
        className: '',
      };
    if (!copilotStatus.hasToken)
      return {
        text: t('providerConfig.credentials.service.start'),
        disabled: true,
        onClick: () => {},
        className: '',
      };
    return {
      text: t('providerConfig.credentials.service.start'),
      disabled: false,
      onClick: handleStart,
      className: '',
    };
  };

  const handleInstallAndStart = async () => {
    await handleInstall();
    setTimeout(async () => {
      const status = await api?.copilot?.getStatus?.();
      if (status?.installed) await handleStart();
    }, 1000);
  };

  const handleGetToken = async () => {
    if (!api?.copilot?.auth) return;
    try {
      setActionLoading('auth');
      setAuthInfo({});
      setAuthError(null); // 清除之前的错误
      const result = await api.copilot.auth();
      console.log('[ProviderConfig] auth result:', JSON.stringify(result, null, 2));

      if (result.success) {
        // Mac 上授权成功（命令等待完成）
        setAuthInfo({});
        await checkCopilotStatus();
        const token = await api.copilot.getToken();
        if (token) setFormData((prev) => ({ ...prev, authToken: token }));
      } else if (result.code && result.url && result.code.length > 0 && result.url.length > 0) {
        // Windows 上显示授权码后命令就退出了，需要保持等待状态
        console.log('[ProviderConfig] Got auth code, keeping loading state');
        setAuthInfo({ code: result.code, url: result.url });
        // 保持 loading 状态，等待 onAuthProgress 的成功/失败消息
        return; // 不执行 finally，保持 loading
      } else {
        console.log('[ProviderConfig] Auth failed:', result.message || 'Unknown error');
        // 显示错误信息
        if (
          result.message &&
          (result.message.includes('ECONNREFUSED') || result.message.includes('fetch failed'))
        ) {
          const errorMsg = '无法连接到 GitHub 服务器。可能需要配置网络代理或检查网络连接。';
          console.log('[ProviderConfig] Setting authError:', errorMsg);
          setAuthError(errorMsg);
        } else if (result.message) {
          // 移除 ANSI 颜色代码
          const cleanMessage = result.message.replace(/\x1B\[\d+m/g, '');
          console.log('[ProviderConfig] Setting authError:', cleanMessage);
          setAuthError(cleanMessage);
        } else {
          console.log('[ProviderConfig] Setting authError: 授权失败，请重试');
          setAuthError('授权失败，请重试');
        }
      }
    } catch (error) {
      console.error('授权出错:', error);
      setAuthError('授权过程出错: ' + (error as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const canConfigureModels = isCopilot ? copilotReady : hasToken;

  useEffect(() => {
    let cancelled = false;
    const loadBadge = async () => {
      if (!api?.getProviderBadgeData) return;
      try {
        const url = await api.getProviderBadgeData(provider);
        if (!cancelled) setBadgeDataUrl(url);
      } catch {
        if (!cancelled) setBadgeDataUrl(null);
      }
    };
    loadBadge();
    return () => {
      cancelled = true;
    };
  }, [api, provider]);

  useEffect(() => {
    setPendingBadge(null);
  }, [provider]);

  const effectiveBadgeDataUrl =
    pendingBadge?.type === 'set'
      ? pendingBadge.dataUrl
      : pendingBadge?.type === 'clear'
      ? null
      : badgeDataUrl;

  const handleChooseBadge = async () => {
    try {
      const picked = await api.pickProviderBadge();
      if (!picked) return;
      setPendingBadge({ type: 'set', srcPath: picked.srcPath, dataUrl: picked.dataUrl });
    } catch (e) {
      console.error('设置图标失败:', e);
      alert(t('providerConfig.badge.setFailed'));
    }
  };

  const handleClearBadge = async () => {
    try {
      setPendingBadge({ type: 'clear' });
    } catch (e) {
      console.error('清除图标失败:', e);
      alert(t('providerConfig.badge.clearFailed'));
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-default">
        {t('providerConfig.title', { name: config.name })}
      </h2>

      {/* 图标（用于托盘/ Dock） */}
      <div className="rounded-lg border border-default bg-surface p-3">
        <div className="flex items-center gap-3">
          {effectiveBadgeDataUrl ? (
            <img
              src={effectiveBadgeDataUrl}
              alt=""
              className="h-9 w-9 rounded border border-default bg-surface object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded border border-default bg-muted text-xs text-muted">
              {t('common.none')}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-medium text-default">
                {t('providerConfig.badge.label')}
              </h3>
              <span className="text-xs text-muted">
                {pendingBadge
                  ? t('providerConfig.badge.pending')
                  : effectiveBadgeDataUrl
                  ? t('providerConfig.badge.uploaded')
                  : t('providerConfig.badge.notUploaded')}
              </span>
            </div>
            <p className="truncate text-xs text-secondary">
              {t('providerConfig.badge.hint')
                .split('badge.png')
                .map((part, idx, arr) => (
                  <span key={idx}>
                    {part}
                    {idx < arr.length - 1 && (
                      <code className="rounded bg-muted px-1">badge.png</code>
                    )}
                  </span>
                ))}
            </p>
          </div>

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={handleChooseBadge}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white"
            >
              <ImageUp className="h-4 w-4" />
              {t('common.upload')}
            </button>
            <button
              type="button"
              onClick={handleClearBadge}
              disabled={!effectiveBadgeDataUrl && !pendingBadge}
              className="inline-flex items-center gap-2 rounded-md border border-default bg-surface bg-hover px-3 py-1.5 text-sm font-medium text-default disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {t('common.clear')}
            </button>
          </div>
        </div>
      </div>

      {/* 凭证配置 */}
      <div className="space-y-4 rounded-lg border border-default bg-surface p-4">
        <h3 className="text-base font-medium text-default">
          {isCopilot
            ? t('providerConfig.credentials.copilot')
            : t('providerConfig.credentials.normal')}
        </h3>

        {isCopilot ? (
          <>
            <div className="space-y-2">
              <Label.Root htmlFor="github-token" className="text-sm font-medium text-secondary">
                {t('providerConfig.credentials.githubTokenLabel')}
              </Label.Root>
              <div className="flex gap-2">
                <input
                  id="github-token"
                  type="password"
                  value={formData.authToken}
                  onChange={(e) => setFormData({ ...formData, authToken: e.target.value })}
                  placeholder={t('providerConfig.credentials.githubTokenPlaceholder')}
                  disabled={!copilotStatus.installed}
                  className="flex-1 rounded-md border border-default bg-surface px-3 py-2 text-sm text-default focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-muted disabled:text-muted"
                />
                <button
                  onClick={handleGetToken}
                  disabled={actionLoading === 'auth' || !copilotStatus.installed}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionLoading === 'auth'
                    ? t('providerConfig.credentials.getting')
                    : t('providerConfig.credentials.get')}
                </button>
              </div>
              {authError && (
                <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">授权失败</div>
                      <div className="mt-1 text-xs">{authError}</div>
                      {authError.includes('GitHub') && (
                        <div className="mt-2 space-y-1 text-xs">
                          <div>• 检查网络连接是否正常</div>
                          <div>• 如需代理，设置环境变量: HTTP_PROXY, HTTPS_PROXY</div>
                          <div>
                            • 或手动运行命令:{' '}
                            <code className="rounded bg-black/10 px-1">copilot-api auth</code>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {authInfo.code && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <div className="mb-2 flex min-w-0 items-center gap-2 text-secondary">
                  <span className="shrink-0">{t('providerConfig.credentials.openUrl')}</span>
                  <a
                    href={authInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-primary underline"
                  >
                    {authInfo.url}
                  </a>
                  <button
                    onClick={() => copyToClipboard(authInfo.url || '')}
                    className="shrink-0 rounded p-1 bg-hover transition-colors"
                    style={{ display: 'inline-flex' }}
                  >
                    <Copy size={14} className="text-secondary" />
                  </button>
                </div>
                <div className="flex min-w-0 items-center gap-2 text-secondary">
                  <span className="shrink-0">{t('providerConfig.credentials.code')}</span>
                  <strong className="min-w-0 flex-1 truncate font-mono">{authInfo.code}</strong>
                  <button
                    onClick={() => copyToClipboard(authInfo.code || '')}
                    className="shrink-0 rounded p-1 bg-hover transition-colors"
                    style={{ display: 'inline-flex' }}
                  >
                    <Copy size={14} className="text-secondary" />
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label.Root htmlFor="base-url" className="text-sm font-medium text-secondary">
                {t('providerConfig.credentials.baseUrlLabel')}
              </Label.Root>
              <div className="flex gap-2">
                <input
                  id="base-url"
                  type="text"
                  value={formData.baseUrl}
                  readOnly
                  className="flex-1 rounded-md border border-default bg-muted px-3 py-2 text-sm text-secondary"
                />
                <button
                  onClick={getCopilotServiceButton().onClick}
                  disabled={getCopilotServiceButton().disabled}
                  title={getCopilotServiceButton().text}
                  className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    getCopilotServiceButton().className === 'danger'
                      ? 'bg-danger hover:bg-danger/90'
                      : 'bg-primary hover:bg-primary/90'
                  }`}
                >
                  {getCopilotServiceButton().text}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label.Root htmlFor="api-token" className="text-sm font-medium text-secondary">
                {t('providerConfig.credentials.apiTokenLabel')}
              </Label.Root>
              <input
                id="api-token"
                type="password"
                value={formData.authToken}
                onChange={(e) => setFormData({ ...formData, authToken: e.target.value })}
                placeholder={t('providerConfig.credentials.apiTokenPlaceholder')}
                className="w-full rounded-md border border-default bg-surface px-3 py-2 text-sm text-default focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <Label.Root htmlFor="base-url-normal" className="text-sm font-medium text-secondary">
                {t('providerConfig.credentials.baseUrlLabel')}
              </Label.Root>
              <input
                id="base-url-normal"
                type="text"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                placeholder={t('providerConfig.credentials.baseUrlPlaceholder')}
                className="w-full rounded-md border border-default bg-surface px-3 py-2 text-sm text-default focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleTestConnection}
                disabled={testing || !formData.authToken}
                className="rounded-md border border-default bg-surface bg-hover px-4 py-2 text-sm font-medium text-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testing
                  ? t('providerConfig.credentials.testing')
                  : t('providerConfig.credentials.testConnection')}
              </button>
              {testResult !== null && (
                <span className={`text-sm ${testResult.success ? 'text-success' : 'text-danger'}`}>
                  {testResult.success ? '✓' : '✗'} {testResult.message}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* 模型配置 */}
      <div
        className={`space-y-4 rounded-lg border border-default bg-surface p-4 ${
          !canConfigureModels ? 'opacity-50' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-default">{t('providerConfig.models.title')}</h3>
          <div className="flex gap-2">
            <button
              onClick={fetchModels}
              disabled={loadingModels || !canConfigureModels}
              className="rounded-md p-2 text-secondary bg-hover disabled:cursor-not-allowed disabled:opacity-50"
              title={
                !canConfigureModels
                  ? isCopilot
                    ? t('providerConfig.models.needCopilotReady')
                    : t('providerConfig.models.needToken')
                  : t('providerConfig.models.refresh')
              }
            >
              <RefreshCw size={18} className={loadingModels ? 'animate-spin' : ''} />
            </button>
            {!isCopilot && (
              <button
                onClick={async () => {
                  await api.dialog.open({
                    id: 'edit-script',
                    route: 'edit-script',
                    width: 800,
                    height: 600,
                    title: t('providerConfig.models.editScriptWindowTitle', { name: config.name }),
                  });
                  setTimeout(() => {
                    api.dialog.sendToDialog({
                      providerId: provider,
                      providerName: config.name,
                    });
                  }, 100);
                }}
                className="rounded-md p-2 text-secondary bg-hover"
                title={t('providerConfig.models.editScript')}
              >
                <FileEdit size={18} />
              </button>
            )}
          </div>
        </div>

        {!canConfigureModels && (
          <div className="rounded-md bg-warning/10 p-3 text-sm text-warning flex items-center gap-2">
            <AlertCircle size={16} />
            <span>
              {isCopilot
                ? t('providerConfig.models.needCopilotReadyLong')
                : t('providerConfig.models.needTokenLong')}
            </span>
          </div>
        )}

        {fetchError && canConfigureModels && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{fetchError}</span>
          </div>
        )}

        {MODEL_ROLES.map((role) => {
          // 构建选项列表
          const options = modelList.map((model) => ({
            value: model.id,
            label: model.name || model.id,
          }));

          // 如果当前配置的模型不在列表中，添加到选项中
          const currentModel = formData.models[role];
          if (currentModel && !modelList.find((m) => m.id === currentModel)) {
            options.unshift({
              value: currentModel,
              label: t('providerConfig.models.currentConfigured', { id: currentModel }),
            });
          }

          const roleLabel = t(`providerConfig.models.roles.${role}.label`);
          const roleDesc = t(`providerConfig.models.roles.${role}.desc`);

          return (
            <SearchableSelect
              key={role}
              id={`model-${role}`}
              label={`${roleLabel} - ${roleDesc}`}
              value={formData.models[role] || ''}
              options={options}
              onChange={(value) => handleModelChange(role, value)}
              placeholder={t('providerConfig.models.placeholder')}
              disabled={!canConfigureModels}
            />
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? t('common.saving') : t('providerConfig.save.button')}
        </button>
      </div>
    </div>
  );
}
