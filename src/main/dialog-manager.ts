import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';
const dialogWindows = new Map<string, BrowserWindow>();

interface DialogOptions {
  id: string;
  route: string;
  width?: number;
  height?: number;
  title?: string;
  resizable?: boolean;
  data?: any;
}

/**
 * 创建一个独立的对话框窗口
 */
export function createDialogWindow(options: DialogOptions): BrowserWindow {
  const {
    id,
    route,
    width = 400,
    height = 300,
    title = 'Dialog',
    resizable = false,
    data,
  } = options;

  // 如果已存在同 ID 的窗口，先关闭
  if (dialogWindows.has(id)) {
    const existingWindow = dialogWindows.get(id);
    existingWindow?.close();
    dialogWindows.delete(id);
  }

  const isMac = os.platform() === 'darwin';
  const parent = BrowserWindow.getAllWindows()[0]; // 获取主窗口作为父窗口

  const dialogWindow = new BrowserWindow({
    width,
    height,
    title,
    resizable,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    parent: parent || undefined,
    modal: true, // 模态窗口
    show: false,
    frame: false, // 使用自定义标题栏
    transparent: true, // 支持透明和圆角
    backgroundColor: '#00000000', // 透明背景
    titleBarStyle: undefined,
    autoHideMenuBar: true,
    hasShadow: true, // 添加阴影
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [
        `--dialog-id=${id}`,
        `--dialog-data=${JSON.stringify(data || {})}`,
      ],
    },
  });

  // 加载对应路由
  if (isDev) {
    dialogWindow.loadURL(`http://localhost:9527/#/dialog/${route}`);
  } else {
    dialogWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: `/dialog/${route}`,
    });
  }

  // 窗口准备好后显示
  dialogWindow.once('ready-to-show', () => {
    dialogWindow.show();
  });

  // 窗口关闭时清理
  dialogWindow.on('closed', () => {
    dialogWindows.delete(id);
  });

  dialogWindows.set(id, dialogWindow);
  return dialogWindow;
}

/**
 * 关闭指定 ID 的对话框
 */
export function closeDialogWindow(id: string): void {
  const dialogWindow = dialogWindows.get(id);
  if (dialogWindow && !dialogWindow.isDestroyed()) {
    dialogWindow.close();
  }
  dialogWindows.delete(id);
}

/**
 * 获取对话框窗口
 */
export function getDialogWindow(id: string): BrowserWindow | undefined {
  return dialogWindows.get(id);
}

/**
 * 设置 IPC 处理器
 */
export function setupDialogHandlers(): void {
  // 打开对话框
  ipcMain.handle('dialog:open', (_event, options: DialogOptions) => {
    createDialogWindow(options);
    return { success: true };
  });

  // 关闭对话框
  ipcMain.handle('dialog:close', (_event, id: string) => {
    closeDialogWindow(id);
    return { success: true };
  });

  // 对话框向主窗口发送数据
  ipcMain.on('dialog:send-to-main', (_event, data: any) => {
    const allWindows = BrowserWindow.getAllWindows();
    // 找到主窗口（通常是第一个非对话框窗口）
    const mainWindow = allWindows.find(win => {
      // 检查是否为对话框窗口
      for (const dialogWin of dialogWindows.values()) {
        if (dialogWin.id === win.id) return false;
      }
      return true;
    });
    if (mainWindow) {
      mainWindow.webContents.send('dialog:message', data);
    }
  });

  // 主窗口向对话框发送数据
  ipcMain.on('main:send-to-dialog', (_event, data: any) => {
    // 向所有对话框窗口发送消息
    for (const dialogWindow of dialogWindows.values()) {
      if (!dialogWindow.isDestroyed()) {
        dialogWindow.webContents.send('dialog:message', data);
      }
    }
  });
}
