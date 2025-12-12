import React, { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { useElectronAPI } from '../../hooks/useElectronAPI';
import { useTranslation } from 'react-i18next';

interface EditScriptDialogProps {
  data?: {
    providerId: string;
    providerName: string;
  };
}

const EditScriptDialog: React.FC<EditScriptDialogProps> = () => {
  const electronAPI = useElectronAPI();
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providerId, setProviderId] = useState('');
  const [providerName, setProviderName] = useState('');

  useEffect(() => {
    // 监听来自主窗口的数据
    const unsubscribe = electronAPI.dialog.onMessage(async (data: any) => {
      if (data.providerId) {
        setProviderId(data.providerId);
        setProviderName(data.providerName || data.providerId);
        
        // 加载脚本内容
        try {
          const scriptContent = await electronAPI.getScriptContent(data.providerId);
          setContent(scriptContent);
        } catch (error) {
          await electronAPI.dialog.showError(t('dialogs.editScript.loadingFailed', { error: String(error) }));
        } finally {
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    if (!providerId) return;
    
    setSaving(true);
    try {
      await electronAPI.saveScript(providerId, content);
      
      // 发送成功消息到主窗口
      electronAPI.dialog.sendToMain({ 
        action: 'script-saved',
        providerId 
      });
      
      // 关闭对话框
      await electronAPI.dialog.close('edit-script');
    } catch (error) {
      await electronAPI.dialog.showError(t('dialogs.editScript.saveFailed', { error: String(error) }));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    await electronAPI.dialog.close('edit-script');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 min-h-screen bg-default text-default">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-secondary">{t('dialogs.editScript.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-surface text-default rounded-lg overflow-hidden">
      {/* 固定顶部标题 - 可拖动区域 */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-default flex items-center justify-between select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <h2 className="text-base font-semibold">{t('dialogs.editScript.title', { name: providerName })}</h2>
        <button
          onClick={async () => {
            await electronAPI.openScriptEditor(providerId);
          }}
          className="px-3 py-1.5 text-sm bg-muted bg-hover rounded flex items-center gap-1.5 transition-colors select-none"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title={t('dialogs.editScript.openInVSCodeTitle')}
        >
          <ExternalLink size={14} />
          <span>{t('dialogs.editScript.openInVSCode')}</span>
        </button>
      </div>

      {/* 全屏幕编辑区 */}
      <div className="flex-1 overflow-hidden p-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-full px-3 py-2 font-mono text-sm border border-default bg-surface text-default rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder={t('dialogs.editScript.placeholder')}
        />
      </div>

      {/* 固定底部按钮 */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-default">
        <div className="flex justify-end gap-2">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium border border-default rounded-md bg-surface bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditScriptDialog;
