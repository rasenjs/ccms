import { useState, useEffect, useCallback } from 'react';
import { Copy } from 'lucide-react';
import { useElectronAPI } from '../hooks/useElectronAPI';
import type { CopilotStatus } from '../../shared/types';
import { useTranslation } from 'react-i18next';

export function CopilotPanel() {
  const api = useElectronAPI();
  const { t } = useTranslation();
  const [status, setStatus] = useState<CopilotStatus>({
    installed: false,
    running: false,
    hasToken: false,
    authInProgress: false,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<{
    code?: string;
    url?: string;
  }>({});

  const checkStatus = useCallback(async () => {
    if (!api?.copilot?.getStatus) return;
    try {
      setLoading(true);
      const newStatus = await api.copilot.getStatus();
      setStatus(newStatus);
      if (newStatus.authCode) {
        setAuthInfo({
          code: newStatus.authCode,
          url: newStatus.authUrl,
        });
      }
    } catch (error) {
      console.error('检查状态失败:', error);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // 监听来自主进程的事件
  useEffect(() => {
    if (!api?.copilot?.onAuthProgress) return;

    // 监听授权进度
    api.copilot.onAuthProgress((data) => {
      if (data.deviceCode) {
        setAuthInfo({
          code: data.deviceCode,
          url: data.verificationUrl,
        });
      }
      // 认证成功后清除授权码并刷新状态
      if (data.message?.includes('成功')) {
        setAuthInfo({});
        checkStatus();
      }
    });

    // 清理
    return () => {
      api.copilot.removeAllListeners();
    };
  }, [api, checkStatus]);

  useEffect(() => {
    checkStatus();
    // 根据状态调整检查频率：
    // - 有授权码时: 2秒（等待用户完成授权）
    // - 正在执行操作: 1秒（实时更新）
    // - 正常情况: 5秒
    const interval = authInfo.code ? 2000 : actionLoading ? 1000 : 5000;
    const timer = setInterval(checkStatus, interval);
    return () => clearInterval(timer);
  }, [checkStatus, authInfo.code, actionLoading]);

  const handleInstall = async () => {
    if (!api?.copilot?.install) return;
    try {
      setActionLoading('install');
      const result = await api.copilot.install();
      if (result.success) {
        await checkStatus();
      }
    } catch (error) {
      console.error('安装出错:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAuth = async () => {
    if (!api?.copilot?.auth) return;
    try {
      setActionLoading('auth');
      setAuthInfo({});

      const result = await api.copilot.auth();

      if (result.success) {
        setAuthInfo({});
        await checkStatus();
      }
    } catch (error) {
      console.error('认证出错:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearToken = async () => {
    if (!api?.copilot?.clearToken) return;
    try {
      setActionLoading('clear');
      await api.copilot.clearToken();
      await checkStatus();
    } catch (error) {
      console.error('清除认证出错:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStart = async () => {
    if (!api?.copilot?.start) return;
    try {
      setActionLoading('start');
      const result = await api.copilot.start();
      // 立即检查一次
      await checkStatus();

      // 启动后持续检查状态，确保视图更新
      if (result.success) {
        // 每隔1秒检查一次，共检查5次
        for (let i = 0; i < 5; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await checkStatus();
        }
      }
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
      // 等待1秒后检查状态
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await checkStatus();
    } catch (error) {
      console.error('停止出错:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading && !status.installed) {
    return (
      <div className="copilot-panel loading">
        <div className="spinner"></div>
        <p>{t('copilotPanel.loading')}</p>
      </div>
    );
  }

  return (
    <div className="copilot-panel">
      <h2>{t('copilotPanel.title')}</h2>
      <p className="description">{t('copilotPanel.description')}</p>

      {/* 操作区域 */}
      <div className="actions-section">
        {/* 安装 */}
        <div
          className={`rounded-lg border p-4 ${
            status.installed ? 'border-success/30 bg-success/5' : 'border-default bg-surface'
          }`}
        >
          <h4 className="mb-3 text-base font-medium text-default">
            {t('copilotPanel.actions.install.title')}
          </h4>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-secondary">
              {status.installed
                ? t('copilotPanel.actions.install.descInstalled')
                : t('copilotPanel.actions.install.descNotInstalled')}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {status.installed ? (
                <span className="status-tag success">
                  {t('copilotPanel.actions.install.statusInstalled')}
                </span>
              ) : (
                <button
                  className="btn-action"
                  onClick={handleInstall}
                  disabled={actionLoading === 'install'}
                >
                  {actionLoading === 'install'
                    ? t('copilotPanel.actions.install.installing')
                    : t('copilotPanel.actions.install.install')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 认证 */}
        <div
          className={`rounded-lg border p-4 ${!status.installed ? 'opacity-50' : ''} ${
            status.hasToken && !authInfo.code
              ? 'border-success/30 bg-success/5'
              : 'border-default bg-surface'
          }`}
        >
          <h4 className="mb-3 text-base font-medium text-default">
            {t('copilotPanel.actions.auth.title')}
          </h4>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              {authInfo.code ? (
                <div className="auth-inline">
                  <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <span className="shrink-0">{t('copilotPanel.actions.auth.open')}</span>
                    <a
                      href={authInfo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-primary underline"
                    >
                      {authInfo.url}
                    </a>
                    <button
                      className="btn-icon shrink-0"
                      onClick={() => copyToClipboard(authInfo.url || '')}
                      title={t('copilotPanel.actions.auth.copyLink')}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden">
                    <span className="shrink-0">{t('copilotPanel.actions.auth.enterCode')}</span>
                    <strong className="min-w-0 flex-1 truncate">{authInfo.code}</strong>
                    <button
                      className="btn-icon shrink-0"
                      onClick={() => copyToClipboard(authInfo.code || '')}
                      title={t('copilotPanel.actions.auth.copyCode')}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="action-desc">
                  {status.hasToken
                    ? t('copilotPanel.actions.auth.descAuthed')
                    : t('copilotPanel.actions.auth.descNeedAuth')}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {status.installed && !status.hasToken && !authInfo.code && (
                <button
                  className="btn-action"
                  onClick={handleAuth}
                  disabled={actionLoading === 'auth'}
                >
                  {actionLoading === 'auth'
                    ? t('copilotPanel.actions.auth.authing')
                    : t('copilotPanel.actions.auth.startAuth')}
                </button>
              )}
              {authInfo.code && (
                <span className="status-tag warning">{t('copilotPanel.actions.auth.waiting')}</span>
              )}
              {status.hasToken && !authInfo.code && (
                <div className="action-btn-group">
                  <span className="status-tag success">
                    {t('copilotPanel.actions.auth.authed')}
                  </span>
                  <button
                    className="btn-action btn-secondary-action"
                    onClick={handleAuth}
                    disabled={actionLoading === 'auth'}
                  >
                    {actionLoading === 'auth' ? '...' : t('copilotPanel.actions.auth.reauth')}
                  </button>
                  <button
                    className="btn-action btn-danger-action"
                    onClick={handleClearToken}
                    disabled={actionLoading === 'clear'}
                    title={t('copilotPanel.actions.auth.clearTitle')}
                  >
                    {actionLoading === 'clear' ? '...' : t('common.clear')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 服务控制 */}
        <div
          className={`rounded-lg border p-4 ${
            !status.hasToken || authInfo.code ? 'opacity-50' : ''
          } ${status.running ? 'border-success/30 bg-success/5' : 'border-default bg-surface'}`}
        >
          <h4 className="mb-3 text-base font-medium text-default">
            {t('copilotPanel.actions.service.title')}
          </h4>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-secondary">
              {status.running
                ? t('copilotPanel.actions.service.descRunning')
                : authInfo.code
                ? t('copilotPanel.actions.service.descNeedAuthFirst')
                : t('copilotPanel.actions.service.descStart')}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {status.hasToken &&
                !authInfo.code &&
                (status.running ? (
                  <div className="action-btn-group">
                    <span className="status-tag success">
                      {t('copilotPanel.actions.service.running')}
                    </span>
                    <button
                      className="btn-action btn-danger-action"
                      onClick={handleStop}
                      disabled={actionLoading === 'stop'}
                    >
                      {actionLoading === 'stop'
                        ? t('copilotPanel.actions.service.stopping')
                        : t('copilotPanel.actions.service.stop')}
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-action"
                    onClick={handleStart}
                    disabled={actionLoading === 'start'}
                  >
                    {actionLoading === 'start'
                      ? t('copilotPanel.actions.service.starting')
                      : t('copilotPanel.actions.service.startService')}
                  </button>
                ))}
              {(!status.hasToken || authInfo.code) && (
                <span className="status-tag disabled">
                  {t('copilotPanel.actions.service.notReady')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 说明信息 */}
      <div className="info-section">
        <h3>{t('copilotPanel.info.title')}</h3>
        <ul>
          <li>{t('copilotPanel.info.item1')}</li>
          <li>{t('copilotPanel.info.item2')}</li>
          <li>
            {t('copilotPanel.info.logs')} <code>~/.claude/copilot-api.log</code>
          </li>
          <li>
            {t('copilotPanel.info.oauthToken')} <code>~/.local/share/copilot-api/github_token</code>
          </li>
          <li>
            {t('copilotPanel.info.serviceUrl')} <code>http://localhost:4141</code>
          </li>
        </ul>
      </div>
    </div>
  );
}
