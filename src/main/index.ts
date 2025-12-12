import { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { createTray, updateTrayMenu } from './tray.js';
import { ConfigManager } from './config.js';
import { CopilotManager } from './providers/copilot.js';
import { ModelFetcher } from './providers/model-fetcher.js';
import { setupDialogHandlers } from './dialog-manager.js';
import {
  ensureProvidersDir,
  getScriptsDir,
  getProviderScript,
  saveProviderScript,
  getProviderDir,
  ensureProviderDir,
} from './providers/script-loader.js';
import type { ProviderId, ProviderConfig } from '../shared/types';
import { BUILTIN_PROVIDER_COPILOT } from '../shared/constants.js';
import { buildHiDpiNativeImage, getProviderBadgePath } from './icon-composer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let configManager: ConfigManager;
let copilotManager: CopilotManager;
let modelFetcher: ModelFetcher;

const isDev = process.env.NODE_ENV === 'development';

function resolveProviderBadge(providerId: ProviderId): string | null {
  try {
    ensureProvidersDir();
    const providerDir = getProviderDir(providerId);
    return getProviderBadgePath(providerDir);
  } catch {
    return null;
  }
}

export function applyProviderIcons(providerId: ProviderId) {
  const assetsPath = getAssetsPath();
  const base1x = path.join(assetsPath, 'icon.png');
  const base2x = path.join(assetsPath, 'icon@1024.png');
  const badge = resolveProviderBadge(providerId);

  // 1) macOS Dock icon（当窗口显示时设置）
  if (process.platform === 'darwin') {
    try {
      if (fs.existsSync(base1x) && fs.existsSync(base2x)) {
        const img = buildHiDpiNativeImage({
          base1x,
          base2x,
          badge,
          compose: badge
            ? {
                badgeSizeRatio: 0.28,
                marginRatio: 0.06,
                placement: 'bottom-right',
              }
            : undefined,
        });
        if (!img.isEmpty()) app.dock.setIcon(img);
      } else if (fs.existsSync(base1x)) {
        const img = nativeImage.createFromPath(base1x);
        if (!img.isEmpty()) app.dock.setIcon(img);
      }
    } catch {
      // ignore
    }
  }

  // 2) Windows taskbar overlay icon (best-effort)
  if (process.platform === 'win32') {
    try {
      // NOTE: overlay icon only shows when the window is in taskbar.
      if (mainWindow && badge && fs.existsSync(badge)) {
        const overlay = nativeImage.createFromPath(badge);
        if (!overlay.isEmpty()) {
          mainWindow.setOverlayIcon(overlay, `Provider: ${providerId}`);
        }
      }
    } catch {
      // ignore
    }
  }

  // 3) Non-mac window icon (best-effort)
  if (process.platform !== 'darwin') {
    try {
      if (mainWindow && fs.existsSync(base1x)) {
        const winIcon = nativeImage.createFromPath(base1x);
        if (!winIcon.isEmpty()) mainWindow.setIcon(winIcon);
      }
    } catch {
      // ignore
    }
  }
}

function getAssetsPath() {
  const candidates: string[] = [];

  // 1) Dev: start from current working directory
  candidates.push(path.resolve(process.cwd(), 'assets'));

  // 2) Packaged: extraResources -> {resourcesPath}/assets
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'assets'));
  }

  // 3) Fallbacks based on compiled location
  candidates.push(path.resolve(__dirname, '../../assets'));
  candidates.push(path.resolve(__dirname, '../../../assets'));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }

  // Last resort
  return path.resolve(process.cwd(), 'assets');
}

function applyDevIcons() {
  const assetsPath = getAssetsPath();
  const appIconPng = path.join(assetsPath, 'icon.png');

  // macOS: show app icon in Dock during dev (packaged apps already have icns).
  if (process.platform === 'darwin') {
    try {
      if (!fs.existsSync(appIconPng)) {
        console.warn('[Main] Dock icon not found:', appIconPng);
        return;
      }
      const img = nativeImage.createFromPath(appIconPng);
      if (!img.isEmpty()) {
        app.dock.setIcon(img);
        console.log('[Main] Dock icon set:', appIconPng);
      } else {
        console.warn('[Main] Dock icon image is empty:', appIconPng);
      }
    } catch {
      // ignore
    }
  }
}

function createWindow() {
  const isMac = os.platform() === 'darwin';
  const assetsPath = getAssetsPath();
  const windowIcon = path.join(assetsPath, 'icon.png');

  mainWindow = new BrowserWindow({
    width: 560,
    height: 685,
    minWidth: 560,
    minHeight: 600,
    maxWidth: 560,
    maxHeight: 800,
    show: false,
    frame: false, // 所有平台都使用自定义标题栏
    titleBarStyle: isMac ? 'hiddenInset' : 'default', // macOS 隐藏标题栏但保留红绿灯
    trafficLightPosition: isMac ? { x: 15, y: 15 } : undefined, // macOS 红绿灯位置
    resizable: true,
    skipTaskbar: false, // 显示任务栏图标
    ...(isMac ? {} : { icon: windowIcon }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // ---- Dev-only diagnostics: make renderer issues visible even without DevTools ----
  if (isDev) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      // level: 0=log,1=warn,2=error,3=debug
      const tag = ['log', 'warn', 'error', 'debug'][level] ?? String(level);
      console.log(`[Renderer:${tag}] ${message} (${sourceId}:${line})`);
    });

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('[Main] Renderer process gone:', details);
    });

    mainWindow.webContents.on('unresponsive', () => {
      console.error('[Main] Renderer became unresponsive');
    });

    mainWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL) => {
        console.error('[Main] did-fail-load:', { errorCode, errorDescription, validatedURL });
      }
    );

    mainWindow.webContents.on(
      'did-fail-provisional-load',
      (_event, errorCode, errorDescription, validatedURL) => {
        console.error('[Main] did-fail-provisional-load:', {
          errorCode,
          errorDescription,
          validatedURL,
        });
      }
    );
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:9527');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Windows: 启动时保持隐藏，通过托盘点击显示
  // macOS: 通过 activate 事件显示（见下方）
  mainWindow.on('ready-to-show', () => {
    // 不自动显示，等待用户点击托盘
  });

  // 关闭时最小化到托盘（标准行为）
  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIpcHandlers() {
  // 设置对话框处理器
  setupDialogHandlers();

  // DevTools（仅用于开发调试；renderer 按钮触发）
  ipcMain.handle('devtools:open', () => {
    try {
      if (!mainWindow) return false;
      mainWindow.webContents.openDevTools({ mode: 'detach', activate: true });
      return true;
    } catch (e) {
      console.error('[Main] Failed to open DevTools:', e);
      return false;
    }
  });

  // 配置相关
  ipcMain.handle('config:get', () => {
    return configManager.getConfig();
  });

  ipcMain.handle('config:set', (_event, config) => {
    configManager.setConfig(config);
    updateTrayMenu(configManager);
  });

  ipcMain.handle('config:switch-provider', async (_event, provider: ProviderId) => {
    // 如果切换到 Copilot，需要先启动服务
    if (provider === BUILTIN_PROVIDER_COPILOT) {
      const isRunning = await copilotManager.checkRunning();
      if (!isRunning) {
        const result = await copilotManager.start();
        if (!result.success) {
          throw new Error('无法启动 copilot-api 服务');
        }
      }
    }

    await configManager.switchProvider(provider);
    updateTrayMenu(configManager);

    // Update Dock/taskbar icons (best-effort)
    applyProviderIcons(provider);
    return true;
  });

  // Provider 相关
  ipcMain.handle('provider:get-models', async (_event, provider: ProviderId, token?: string) => {
    const providerConfig = configManager.getProviderConfig(provider);
    if (!providerConfig) {
      return [];
    }
    // 如果提供了 token，使用提供的 token，否则使用配置的 token
    const configWithToken = token ? { ...providerConfig, authToken: token } : providerConfig;
    return modelFetcher.fetchModels(provider, configWithToken);
  });

  ipcMain.handle(
    'provider:update',
    (_event, provider: ProviderId, config: Partial<ProviderConfig>) => {
      configManager.updateProviderConfig(provider, config);
      updateTrayMenu(configManager);
    }
  );

  ipcMain.handle('provider:badge:choose', async (_event, provider: ProviderId) => {
    if (!mainWindow) return false;

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择图标（PNG）',
      properties: ['openFile'],
      filters: [{ name: 'PNG Images', extensions: ['png'] }],
    });

    if (result.canceled || result.filePaths.length === 0) return false;

    try {
      ensureProvidersDir();
      const providerDir = getProviderDir(provider);
      fs.mkdirSync(providerDir, { recursive: true });

      const srcPath = result.filePaths[0];
      const destPath = path.join(providerDir, 'badge.png');
      fs.copyFileSync(srcPath, destPath);

      // Refresh menu (labels etc)
      updateTrayMenu(configManager);

      // Refresh only if active
      const current = configManager.getConfig().currentProvider;
      if (current === provider) {
        applyProviderIcons(provider);
      }
      return true;
    } catch (e) {
      console.error('[Main] 设置图标失败:', e);
      return false;
    }
  });

  ipcMain.handle('provider:badge:pick', async () => {
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择图标（PNG）',
      properties: ['openFile'],
      filters: [{ name: 'PNG Images', extensions: ['png'] }],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    const srcPath = result.filePaths[0];

    try {
      const buf = fs.readFileSync(srcPath);
      const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
      return { srcPath, dataUrl };
    } catch (e) {
      console.error('[Main] 读取选择的图标失败:', e);
      return null;
    }
  });

  ipcMain.handle('provider:badge:set', async (_event, provider: ProviderId, srcPath: string) => {
    try {
      if (!srcPath || typeof srcPath !== 'string') return false;
      if (!fs.existsSync(srcPath)) return false;
      if (path.extname(srcPath).toLowerCase() !== '.png') return false;

      ensureProvidersDir();
      const providerDir = getProviderDir(provider);
      fs.mkdirSync(providerDir, { recursive: true });

      const destPath = path.join(providerDir, 'badge.png');
      fs.copyFileSync(srcPath, destPath);

      updateTrayMenu(configManager);
      const current = configManager.getConfig().currentProvider;
      if (current === provider) {
        applyProviderIcons(provider);
      }

      return true;
    } catch (e) {
      console.error('[Main] 保存图标失败:', e);
      return false;
    }
  });

  ipcMain.handle('provider:badge:clear', async (_event, provider: ProviderId) => {
    try {
      ensureProvidersDir();
      const providerDir = getProviderDir(provider);
      const badgePath = path.join(providerDir, 'badge.png');
      if (fs.existsSync(badgePath)) {
        fs.unlinkSync(badgePath);
      }

      updateTrayMenu(configManager);

      const current = configManager.getConfig().currentProvider;
      if (current === provider) {
        applyProviderIcons(provider);
      }
      return true;
    } catch (e) {
      console.error('[Main] 清除图标失败:', e);
      return false;
    }
  });

  ipcMain.handle('provider:badge:get', async (_event, provider: ProviderId) => {
    try {
      const badgePath = resolveProviderBadge(provider);
      if (!badgePath) return null;
      if (!fs.existsSync(badgePath)) return null;

      const buf = fs.readFileSync(badgePath);
      return `data:image/png;base64,${buf.toString('base64')}`;
    } catch (e) {
      console.error('[Main] 获取图标失败:', e);
      return null;
    }
  });

  ipcMain.handle('provider:add', (_event, config: ProviderConfig) => {
    configManager.addProvider(config);
    updateTrayMenu(configManager);
  });

  ipcMain.handle('provider:delete', (_event, provider: ProviderId) => {
    const result = configManager.deleteProvider(provider);
    updateTrayMenu(configManager);
    return result;
  });

  ipcMain.handle('provider:get-script-path', () => {
    return getScriptsDir();
  });

  ipcMain.handle('provider:get-script-content', (_event, provider: ProviderId) => {
    return getProviderScript(provider);
  });

  ipcMain.handle('provider:save-script', (_event, provider: ProviderId, content: string) => {
    saveProviderScript(provider, content);
  });

  ipcMain.handle('provider:open-script-editor', (_event, provider: ProviderId) => {
    ensureProviderDir(provider);
    const scriptPath = path.join(getProviderDir(provider), 'script.js');

    // 尝试使用 VSCode 打开，如果失败则使用系统默认编辑器
    const isWindows = os.platform() === 'win32';
    const codeCommand = isWindows ? 'code.cmd' : 'code';

    exec(`${codeCommand} "${scriptPath}"`, (error: Error | null) => {
      if (error) {
        // VSCode 不可用，使用系统默认编辑器
        shell.openPath(scriptPath);
      }
    });
  });

  // 对话框相关
  ipcMain.handle(
    'dialog:show-input',
    async (
      _event,
      options: { title: string; message: string; defaultValue?: string; placeholder?: string }
    ) => {
      if (!mainWindow) return null;

      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['OK', 'Cancel'],
        defaultId: 0,
        title: options.title,
        message: options.message,
        detail: options.placeholder,
      });

      if (result.response === 1) {
        return null; // Cancel
      }

      // 简单的输入对话框实现，返回默认值
      // 注：Electron 原生不支持输入对话框，需要在渲染进程中使用 HTML 输入
      return options.defaultValue || '';
    }
  );

  ipcMain.handle('dialog:show-error', async (_event, message: string) => {
    if (!mainWindow) return;
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: '错误',
      message,
    });
  });

  ipcMain.handle(
    'provider:test-connection',
    async (_event, provider: ProviderId, token?: string) => {
      const providerConfig = configManager.getProviderConfig(provider);
      if (!providerConfig) {
        return false;
      }
      const configWithToken = token ? { ...providerConfig, authToken: token } : providerConfig;
      return modelFetcher.testConnection(provider, configWithToken);
    }
  );

  // Copilot 相关
  ipcMain.handle('copilot:check-installed', () => {
    return copilotManager.checkInstalled();
  });

  ipcMain.handle('copilot:install', async () => {
    return copilotManager.install();
  });

  ipcMain.handle('copilot:check-running', async () => {
    return copilotManager.checkRunning();
  });

  ipcMain.handle('copilot:start', async () => {
    return copilotManager.start();
  });

  ipcMain.handle('copilot:stop', async () => {
    return copilotManager.stop();
  });

  ipcMain.handle('copilot:auth', async () => {
    return copilotManager.runAuthWithProgress();
  });

  ipcMain.handle('copilot:auth-in-terminal', () => {
    // 在系统终端中打开授权命令
    const isWindows = os.platform() === 'win32';
    const command = isWindows
      ? `start cmd /k "copilot-api auth && pause"`
      : `open -a Terminal.app -n --args bash -c "copilot-api auth; read -p 'Press Enter to close...'"`;

    exec(command, (error) => {
      if (error) {
        console.error('[Main] 打开终端失败:', error);
      }
    });

    return true;
  });

  ipcMain.handle('copilot:check-token', () => {
    return copilotManager.checkToken();
  });

  ipcMain.handle('copilot:get-token', () => {
    return copilotManager.getToken();
  });

  ipcMain.handle('copilot:clear-token', () => {
    return copilotManager.clearToken();
  });

  ipcMain.handle('copilot:get-status', async () => {
    return copilotManager.getStatus();
  });

  // Copilot 事件监听（转发到渲染进程）
  copilotManager.on(
    'auth-progress',
    (data: { deviceCode?: string; verificationUrl?: string; message?: string }) => {
      mainWindow?.webContents.send('copilot:auth-progress', data);
    }
  );

  copilotManager.on('auth-output', (line: string) => {
    mainWindow?.webContents.send('copilot:output', line);
  });

  copilotManager.on('install-output', (line: string) => {
    mainWindow?.webContents.send('copilot:output', line);
  });

  copilotManager.on('start-output', (line: string) => {
    mainWindow?.webContents.send('copilot:output', line);
  });

  // 窗口相关
  ipcMain.handle('window:show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  ipcMain.handle('window:hide', () => {
    mainWindow?.hide();
  });
}

app.whenReady().then(async () => {
  // 确保 providers 目录存在
  ensureProvidersDir();

  // 初始化管理器
  configManager = new ConfigManager();
  copilotManager = new CopilotManager();
  modelFetcher = new ModelFetcher();

  // macOS: 启动时不隐藏 Dock，让窗口保持正常行为
  // Dock 会在窗口首次隐藏后才隐藏

  // 创建窗口和托盘
  createWindow();

  // 设置初始 Dock/任务栏图标
  const initialProvider = configManager.getConfig().currentProvider;
  applyProviderIcons(initialProvider);

  createTray(configManager, mainWindow, copilotManager, applyProviderIcons);

  // 设置 IPC 处理器
  setupIpcHandlers();

  // 自动启动 Copilot API（只要已安装且有 token，就自动启动服务保持就绪）
  const config = configManager.getConfig();
  console.log('[Main] 当前 Provider:', config.currentProvider);

  const copilotInstalled = copilotManager.checkInstalled();
  const hasToken = copilotManager.checkToken();
  console.log('[Main] Copilot 安装状态:', copilotInstalled, ', Token 状态:', hasToken);

  if (copilotInstalled && hasToken) {
    console.log('[Main] Copilot 已安装且已授权，尝试自动启动服务...');
    // 延迟启动，避免启动时竞争
    setTimeout(async () => {
      const isRunning = await copilotManager.checkRunning();
      console.log('[Main] Copilot 服务运行状态:', isRunning);
      if (!isRunning) {
        console.log('[Main] 开始自动启动 Copilot 服务');
        copilotManager.start().catch((err) => {
          console.error('[Main] 自动启动 Copilot 失败:', err);
        });
      } else {
        console.log('[Main] Copilot 服务已在运行');
      }
    }, 1000);
  } else {
    console.log('[Main] Copilot 未就绪（未安装或未授权），跳过自动启动');
  }

  app.on('activate', () => {
    // macOS: 点击 Dock 图标时显示窗口
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS 上保持应用运行
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // 退出前清理
  mainWindow?.removeAllListeners('close');
  mainWindow?.close();
});
