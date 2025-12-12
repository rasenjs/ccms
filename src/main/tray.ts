import { Tray, Menu, nativeImage, BrowserWindow, NativeImage, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ConfigManager } from './config.js';
import { CopilotManager } from './providers/copilot.js';
import type { ProviderId } from '../shared/types';
import { BUILTIN_PROVIDER_COPILOT } from '../shared/constants.js';
import { buildHiDpiNativeImage, getProviderBadgePath } from './icon-composer.js';
import { getProviderDir, ensureProvidersDir } from './providers/script-loader.js';
import { tMain } from './i18n.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray: Tray | null = null;
let configManagerRef: ConfigManager;
let copilotManagerRef: CopilotManager | null = null;
let mainWindowRef: BrowserWindow | null;
let menuUpdateInterval: NodeJS.Timeout | null = null;

export function createTray(configManager: ConfigManager, mainWindow: BrowserWindow | null, copilotManager?: CopilotManager) {
  configManagerRef = configManager;
  mainWindowRef = mainWindow;
  copilotManagerRef = copilotManager || null;

  // 创建托盘图标（支持按当前 Provider 叠加图标）
  const icon = buildTrayIconForCurrentProvider();

  // macOS: 标记为模板图标以适配深浅色模式
  if (process.platform === 'darwin') {
    try {
      icon.setTemplateImage(true);
    } catch {
      // ignore
    }
  }

  tray = new Tray(icon);
  tray.setToolTip(tMain(app.getLocale(), 'tray.tooltip'));

  updateTrayMenu(configManager);

  // 定期刷新菜单状态（每 5 秒）
  if (menuUpdateInterval) {
    clearInterval(menuUpdateInterval);
  }
  menuUpdateInterval = setInterval(() => {
    updateTrayMenu(configManager);
  }, 5000);

  tray.on('click', () => {
    mainWindowRef?.show();
    mainWindowRef?.focus();
  });
}

function resolveTrayIconPath2x() {
  const icon1x = resolveTrayIconPath();
  const icon2x = icon1x.replace(/\.png$/i, '@2x.png');
  return { icon1x, icon2x };
}

function buildTrayIconForCurrentProvider(): NativeImage {
  const { icon1x, icon2x } = resolveTrayIconPath2x();

  // Determine active provider (best-effort)
  const currentProvider = configManagerRef?.getConfig?.().currentProvider ?? null;

  // Badge file: ~/.config/cc-model-switcher/providers/{providerId}/badge.png
  let badgePath: string | null = null;
  if (currentProvider) {
    try {
      ensureProvidersDir();
      const providerDir = getProviderDir(currentProvider);
      badgePath = getProviderBadgePath(providerDir);
    } catch {
      badgePath = null;
    }
  }

  try {
    if (fs.existsSync(icon1x) && fs.existsSync(icon2x)) {
      const img = buildHiDpiNativeImage({
        base1x: icon1x,
        base2x: icon2x,
        badge: badgePath,
        compose: badgePath
          ? {
              mode: 'side-by-side',
              // Make tray item wider (click/highlight area) while keeping height.
              outputWidthRatio: 2.05,
              baseSizeRatio: 0.90,
              badgeSizeRatio: 0.90,
              gapRatio: 0.14,
              marginRatio: 0.06,
              placement: 'bottom-right',
            }
          : undefined,
      });

      if (!img.isEmpty()) return img;
    }

    const fallback = nativeImage.createFromPath(icon1x);
    return fallback.isEmpty() ? createDefaultIcon() : fallback;
  } catch {
    return createDefaultIcon();
  }
}

export function refreshTrayIcon() {
  if (!tray) return;
  const icon = buildTrayIconForCurrentProvider();
  if (process.platform === 'darwin') {
    try {
      icon.setTemplateImage(true);
    } catch {
      // ignore
    }
  }
  tray.setImage(icon);
}

function resolveTrayIconPath() {
  const candidates: string[] = [];

  // Dev: from cwd
  candidates.push(path.resolve(process.cwd(), 'assets', 'tray-icon.png'));

  // Packaged: extraResources
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'assets', 'tray-icon.png'));
  }

  // Fallbacks based on compiled location
  candidates.push(path.resolve(__dirname, '../../assets/tray-icon.png'));
  candidates.push(path.resolve(__dirname, '../../../assets/tray-icon.png'));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }

  return path.resolve(process.cwd(), 'assets', 'tray-icon.png');
}

function createDefaultIcon(): NativeImage {
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const cx = size / 2;
      const cy = size / 2;
      const r = size / 2 - 1;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      
      if (dist <= r) {
        canvas[idx] = 66;
        canvas[idx + 1] = 133;
        canvas[idx + 2] = 244;
        canvas[idx + 3] = 255;
      } else {
        canvas[idx] = 0;
        canvas[idx + 1] = 0;
        canvas[idx + 2] = 0;
        canvas[idx + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

/**
 * 检查 Provider 是否可用
 */
async function isProviderAvailable(providerId: ProviderId, config: ReturnType<ConfigManager['getConfig']>): Promise<boolean> {
  const providerConfig = config.providers[providerId];
  if (!providerConfig) return false;

  // Copilot 特殊检查
  if (providerId === BUILTIN_PROVIDER_COPILOT) {
    if (copilotManagerRef) {
      try {
        const status = await copilotManagerRef.getStatus();
        return status.installed && status.running && status.hasToken;
      } catch {
        return false;
      }
    }
    return false;
  }

  // 其他 Provider 检查是否有 Token
  return !!providerConfig.authToken;
}

export async function updateTrayMenu(configManager: ConfigManager) {
  if (!tray) return;

  const config = configManager.getConfig();
  const locale = config.language ?? app.getLocale();
  const currentProvider = config.currentProvider;
  const providerList = configManager.getProviderList();

  // Keep tooltip in sync with language
  tray.setToolTip(tMain(locale, 'tray.tooltip'));

  // 获取当前 Provider 名称
  const currentProviderConfig = config.providers[currentProvider];
  const currentProviderName = currentProviderConfig?.name || currentProvider;

  // 构建 Provider 菜单项
  const providerMenuItems = await Promise.all(
    providerList.map(async (provider) => {
      const isAvailable = await isProviderAvailable(provider.id, config);
      const isCurrent = currentProvider === provider.id;
      
      return {
        label: provider.name + (isAvailable ? '' : tMain(locale, 'tray.notConfiguredSuffix')),
        type: 'radio' as const,
        checked: isCurrent,
        enabled: isAvailable || isCurrent,
        click: async () => {
          if (!isAvailable && !isCurrent) return;
          try {
            await configManager.switchProvider(provider.id);
            updateTrayMenu(configManager);
          } catch (error) {
            console.error('切换 Provider 失败:', error);
          }
        },
      };
    })
  );

  const contextMenu = Menu.buildFromTemplate([
    {
      label: tMain(locale, 'tray.current', { name: currentProviderName }),
      enabled: false,
    },
    { type: 'separator' },
    {
      label: tMain(locale, 'tray.switchProvider'),
      submenu: providerMenuItems,
    },
    { type: 'separator' },
    {
      label: tMain(locale, 'tray.configure'),
      click: () => {
        mainWindowRef?.show();
        mainWindowRef?.focus();
      },
    },
    { type: 'separator' },
    {
      label: tMain(locale, 'tray.quit'),
      click: () => {
        tray?.destroy();
        process.exit(0);
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  // Keep tray icon in sync with current provider
  refreshTrayIcon();
}

export function destroyTray() {
  if (menuUpdateInterval) {
    clearInterval(menuUpdateInterval);
    menuUpdateInterval = null;
  }
  tray?.destroy();
  tray = null;
}
