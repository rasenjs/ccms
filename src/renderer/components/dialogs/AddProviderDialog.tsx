import React, { useState } from 'react';
import * as Label from '@radix-ui/react-label';
import { useElectronAPI } from '../../hooks/useElectronAPI';
import { useTranslation } from 'react-i18next';

const AddProviderDialog: React.FC = () => {
  const electronAPI = useElectronAPI();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name || !id || !baseUrl) {
      await electronAPI.dialog.showError(t('dialogs.addProvider.required'));
      return;
    }

    setLoading(true);
    try {
      await electronAPI.addProvider({
        id,
        name,
        baseUrl,
        authToken: '',
        models: {
          opus: '',
          sonnet: '',
          haiku: '',
          subagent: '',
        },
      });
      
      // 发送成功消息到主窗口
      electronAPI.dialog.sendToMain({ 
        action: 'provider-added',
        provider: { id, name, baseUrl }
      });
      
      // 关闭对话框
      await electronAPI.dialog.close('add-provider');
    } catch (error) {
      await electronAPI.dialog.showError(t('dialogs.addProvider.failed', { error: String(error) }));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    await electronAPI.dialog.close('add-provider');
  };

  return (
    <div className="flex flex-col h-screen bg-surface text-default rounded-lg overflow-hidden">
      {/* 固定顶部标题 - 可拖动区域 */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-default select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <h2 className="text-base font-semibold">{t('dialogs.addProvider.title')}</h2>
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="max-w-md mx-auto space-y-3">
              <div className="space-y-2">
                <Label.Root htmlFor="provider-name" className="text-sm font-medium">
                  {t('dialogs.addProvider.name')} <span className="text-red-500">*</span>
                </Label.Root>
                <input
                  id="provider-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('dialogs.addProvider.namePlaceholder')}
                  className="w-full px-3 py-2 border border-default rounded-md bg-surface text-default focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <Label.Root htmlFor="provider-id" className="text-sm font-medium">
                  {t('dialogs.addProvider.id')} <span className="text-red-500">*</span>
                </Label.Root>
                <input
                  id="provider-id"
                  type="text"
                  value={id}
                  onChange={(e) => setId(e.target.value.toLowerCase())}
                  placeholder={t('dialogs.addProvider.idPlaceholder')}
                  className="w-full px-3 py-2 border border-default rounded-md bg-surface text-default focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-muted">{t('dialogs.addProvider.idHint')}</p>
              </div>

              <div className="space-y-2">
                <Label.Root htmlFor="base-url" className="text-sm font-medium">
                  {t('dialogs.addProvider.baseUrl')} <span className="text-red-500">*</span>
                </Label.Root>
                <input
                  id="base-url"
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  className="w-full px-3 py-2 border border-default rounded-md bg-surface text-default focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 固定底部按钮 */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-default">
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancel}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium border border-default rounded-md bg-surface bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('dialogs.addProvider.adding') : t('dialogs.addProvider.add')}
              </button>
            </div>
          </div>
        </div>
      );
    };

export default AddProviderDialog;
