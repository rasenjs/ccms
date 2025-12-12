import { spawn, exec, execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
// Trigger recompilation
import { EventEmitter } from 'events';
import type { CopilotStatus } from '../../shared/types';

const COPILOT_API_PORT = 4141;

// 跨平台配置目录
const getConfigDir = () => {
  const platform = os.platform();
  if (platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Local');
  }
  return path.join(os.homedir(), '.local', 'share');
};

const OAUTH_TOKEN_PATH = path.join(getConfigDir(), 'copilot-api', 'github_token');
const CLAUDE_CONFIG_DIR = path.join(os.homedir(), '.claude');

// 状态缓存，避免过于频繁的检查
const STATUS_CACHE_TTL = 2000; // 2秒缓存

export class CopilotManager extends EventEmitter {
  private serviceProcess: ReturnType<typeof spawn> | null = null;
  private currentAuthStatus: Partial<CopilotStatus> = {};
  private lastRunningCheck: { time: number; result: boolean } | null = null;

  constructor() {
    super();
  }

  /**
   * 获取当前授权状态
   */
  getCurrentAuthStatus(): Partial<CopilotStatus> {
    return this.currentAuthStatus;
  }

  /**
   * 检查 copilot-api 是否已安装
   */
  checkInstalled(): boolean {
    try {
      const isWindows = os.platform() === 'win32';

      if (isWindows) {
        // Windows: 使用 npm list -g 检查
        try {
          const result = execSync('npm list -g copilot-api --depth=0', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          const isInstalled = result.includes('copilot-api@');
          console.log(`[Copilot] checkInstalled (npm): ${isInstalled}`);
          return isInstalled;
        } catch {
          // npm list 失败说明没安装
          console.log('[Copilot] checkInstalled (npm): false');
          return false;
        }
      } else {
        // Unix/macOS: 使用 which
        const fullPath = process.env.PATH || '';
        const additionalPaths = ':/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin';

        const result = execSync('which copilot-api', {
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: fullPath + additionalPaths,
          },
          shell: '/bin/bash',
        });

        const isInstalled = result.trim().length > 0;
        console.log(`[Copilot] checkInstalled (which): ${isInstalled}, path: ${result.trim()}`);
        return isInstalled;
      }
    } catch (error) {
      console.log('[Copilot] checkInstalled: false, error:', error);
      return false;
    }
  }

  /**
   * 安装 copilot-api，返回安装过程输出并发送事件
   */
  async install(): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      let output = '';
      let timeout: NodeJS.Timeout;
      let hasResolved = false;

      const safeResolve = (result: { success: boolean; output: string }) => {
        if (!hasResolved) {
          hasResolved = true;
          clearTimeout(timeout);
          resolve(result);
        }
      };

      this.emit('install-output', '正在安装 copilot-api...\n');
      console.log('[Copilot] 开始安装 copilot-api');

      // 设置 60 秒超时
      timeout = setTimeout(() => {
        console.log('[Copilot] 安装超时');
        this.emit('install-output', '\n❌ 安装超时（60秒）\n');
        safeResolve({ success: false, output: output + '\n安装超时' });
      }, 60000);

      // 使用完整的 shell 环境
      const isWindows = os.platform() === 'win32';
      const shell = isWindows ? true : '/bin/bash';
      const command = 'npm install -g copilot-api';

      // 确保 PATH 包含常见的 npm 安装路径
      const fullPath = process.env.PATH || '';
      const additionalPaths = isWindows ? '' : ':/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin';

      console.log('[Copilot] 执行命令:', command);
      console.log('[Copilot] PATH:', fullPath + additionalPaths);

      const installProcess = spawn(command, [], {
        shell: shell,
        env: {
          ...process.env,
          PATH: fullPath + additionalPaths,
          HOME: os.homedir(),
        },
      });

      // 如果进程启动失败
      if (!installProcess.pid) {
        console.error('[Copilot] 进程启动失败');
        this.emit('install-output', '\n❌ 无法启动安装进程\n');
        safeResolve({ success: false, output: '无法启动安装进程' });
        return;
      }

      console.log('[Copilot] 安装进程 PID:', installProcess.pid);

      installProcess.stdout?.on('data', (data) => {
        const line = data.toString();
        output += line;
        console.log('[Copilot Install]', line.trim());
        this.emit('install-output', line);
      });

      installProcess.stderr?.on('data', (data) => {
        const line = data.toString();
        output += line;
        console.error('[Copilot Install Error]', line.trim());
        this.emit('install-output', line);
      });

      installProcess.on('error', (error) => {
        const errorMsg = `启动安装进程失败: ${error.message}\n`;
        console.error('[Copilot]', errorMsg);
        this.emit('install-output', `\n❌ ${errorMsg}`);
        safeResolve({ success: false, output: output + errorMsg });
      });

      installProcess.on('close', (code) => {
        console.log(`[Copilot] 安装进程退出，代码: ${code}, 输出长度: ${output.length}`);

        if (code === 0) {
          this.emit('install-output', '\n✅ 安装成功\n');
          // 验证安装
          setTimeout(() => {
            const installed = this.checkInstalled();
            console.log(`[Copilot] 验证安装结果: ${installed}`);
            if (!installed) {
              this.emit(
                'install-output',
                '\n⚠️  警告：安装成功但无法检测到 copilot-api，可能需要重启应用\n'
              );
            }
          }, 1000);
          safeResolve({ success: true, output: output || '安装成功' });
        } else {
          const failMsg = output.length > 0 ? output : '安装失败（无输出）';
          this.emit('install-output', '\n❌ 安装失败\n');
          safeResolve({ success: false, output: failMsg });
        }
      });
    });
  }

  /**
   * 检查 copilot-api 服务是否正在运行
   * 使用缓存和多种方式确保检测准确
   */
  async checkRunning(): Promise<boolean> {
    // 检查缓存
    const now = Date.now();
    if (this.lastRunningCheck && now - this.lastRunningCheck.time < STATUS_CACHE_TTL) {
      return this.lastRunningCheck.result;
    }

    // 首先尝试 HTTP 请求
    let result = await this.checkRunningViaHttp();

    // HTTP 失败时，尝试检查进程
    if (!result) {
      result = this.checkRunningViaProcess();
    }

    // 更新缓存
    this.lastRunningCheck = { time: now, result };

    return result;
  }

  /**
   * 清除运行状态缓存（在启动/停止服务后调用）
   */
  clearRunningCache(): void {
    this.lastRunningCheck = null;
  }

  private async checkRunningViaHttp(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: COPILOT_API_PORT,
          path: '/v1/models', // 使用更可靠的端点
          method: 'GET',
          timeout: 2000, // 减少超时时间到2秒
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            // 检查响应是否有效（有数据且状态码正常）
            const isValid = res.statusCode === 200 && data.length > 0;
            console.log(
              `[Copilot] HTTP检查: status=${res.statusCode}, hasData=${
                data.length > 0
              }, isValid=${isValid}`
            );
            resolve(isValid);
          });
        }
      );

      req.on('error', (err) => {
        console.log(`[Copilot] HTTP检查失败: ${err.message}`);
        resolve(false);
      });

      req.on('timeout', () => {
        console.log('[Copilot] HTTP检查超时');
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  private checkRunningViaProcess(): boolean {
    try {
      const platform = os.platform();

      if (platform === 'win32') {
        // Windows: 使用 netstat 查找占用 4141 端口的进程
        // 使用 spawnSync 避免 execSync 在退出码非零时抛出异常
        const result = spawnSync('netstat', ['-ano'], {
          encoding: 'utf-8',
          shell: true,
          windowsHide: true,
        });

        if (result.error) {
          console.log('[Copilot] 进程检查失败:', result.error.message);
          return false;
        }

        const output = result.stdout || '';
        // 查找监听 4141 端口的行
        const lines = output.split('\n');
        const isRunning = lines.some(
          (line) => line.includes(`:${COPILOT_API_PORT}`) && line.includes('LISTENING')
        );

        console.log(`[Copilot] 进程检查 (netstat): ${isRunning}`);
        return isRunning;
      } else {
        // Unix/macOS: 使用 pgrep
        const command = 'pgrep -f "copilot-api" 2>/dev/null || true';
        const result = execSync(command, { encoding: 'utf-8' });
        const isRunning = result.trim().length > 0;
        console.log(`[Copilot] 进程检查 (pgrep): ${isRunning}`);
        return isRunning;
      }
    } catch (error) {
      // 命令执行失败（通常是因为没有找到匹配的进程），这是正常的
      console.log('[Copilot] 进程检查: 未找到运行中的进程');
      return false;
    }
  }

  /**
   * 检查 OAuth token 是否存在且有效
   */
  checkToken(): boolean {
    if (!fs.existsSync(OAUTH_TOKEN_PATH)) {
      return false;
    }
    try {
      const token = fs.readFileSync(OAUTH_TOKEN_PATH, 'utf-8').trim();
      // Token 应该是一个非空字符串，通常长度较长
      return token.length > 10;
    } catch {
      return false;
    }
  }

  /**
   * 清除 OAuth token（用于重新认证或调试）
   */
  clearToken(): boolean {
    try {
      if (fs.existsSync(OAUTH_TOKEN_PATH)) {
        fs.unlinkSync(OAUTH_TOKEN_PATH);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取 OAuth token
   */
  getToken(): string | null {
    if (this.checkToken()) {
      return fs.readFileSync(OAUTH_TOKEN_PATH, 'utf-8').trim();
    }
    return null;
  }

  /**
   * 运行 OAuth 认证流程，实时返回授权码和 URL，并发送事件
   */
  async runAuthWithProgress(): Promise<{
    success: boolean;
    code?: string;
    url?: string;
    message: string;
  }> {
    return new Promise((resolve) => {
      this.currentAuthStatus = {
        authInProgress: true,
        authMessage: '正在启动认证流程...',
      };

      this.emit('auth-output', '正在启动认证流程...\n');

      // 继承系统代理环境变量，并尝试从 Windows 系统代理设置中读取
      const env = {
        ...process.env,
      };

      // 调试：输出当前平台和代理环境变量状态
      console.log('[Copilot] 平台:', os.platform());
      console.log('[Copilot] HTTP_PROXY:', env.HTTP_PROXY || '(未设置)');
      console.log('[Copilot] HTTPS_PROXY:', env.HTTPS_PROXY || '(未设置)');

      // Windows 上尝试读取系统代理
      if (os.platform() === 'win32' && !env.HTTP_PROXY && !env.HTTPS_PROXY) {
        console.log('[Copilot] 开始检测系统代理...');
        try {
          const proxyResult = execSync('netsh winhttp show proxy', { encoding: 'utf-8' });
          console.log('[Copilot] netsh 输出:', proxyResult);

          // 解析代理服务器地址，使用更通用的正则匹配 IP:端口 或 域名:端口
          // 匹配格式：127.0.0.1:7890 或 proxy.example.com:8080
          const proxyMatch =
            proxyResult.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+)/i) ||
            proxyResult.match(/([a-z0-9][-a-z0-9.]*[a-z0-9]:\d+)/i);

          if (proxyMatch && proxyMatch[1]) {
            const proxy = `http://${proxyMatch[1]}`;
            env.HTTP_PROXY = proxy;
            env.HTTPS_PROXY = proxy;
            // 同时设置小写变量（某些工具会使用小写）
            env.http_proxy = proxy;
            env.https_proxy = proxy;
            console.log(`[Copilot] 使用系统代理: ${proxy}`);
            this.emit('auth-output', `使用系统代理: ${proxy}\n`);
          } else {
            console.log('[Copilot] 未找到代理配置（直接访问）');
          }
        } catch (error) {
          console.log('[Copilot] 无法读取系统代理设置:', error);
        }
      } else {
        console.log('[Copilot] 跳过系统代理检测（平台不匹配或已有代理环境变量）');
      }

      // 调试：确认环境变量已设置
      console.log('[Copilot] 最终环境变量 HTTP_PROXY:', env.HTTP_PROXY || '(未设置)');
      console.log('[Copilot] 最终环境变量 HTTPS_PROXY:', env.HTTPS_PROXY || '(未设置)');

      const authProcess = spawn('copilot-api', ['auth'], {
        shell: true,
        env: env,
      });

      let output = '';
      let authCode = '';
      let authUrl = '';

      const processOutput = (data: string) => {
        output += data;
        this.emit('auth-output', data);

        // 解析授权码，格式如: "434E-15C2"
        const codeMatch = data.match(/["']?([A-Z0-9]{4}-[A-Z0-9]{4})["']?/);
        if (codeMatch) {
          authCode = codeMatch[1];
          this.currentAuthStatus.authCode = authCode;
        }

        // 解析 URL
        const urlMatch = data.match(/(https:\/\/github\.com\/login\/device)/);
        if (urlMatch) {
          authUrl = urlMatch[1];
          this.currentAuthStatus.authUrl = authUrl;
        }

        // 更新状态消息并发送事件
        if (authCode && authUrl) {
          this.currentAuthStatus.authMessage = `请在浏览器中打开 ${authUrl} 并输入代码: ${authCode}`;
          this.emit('auth-progress', {
            deviceCode: authCode,
            verificationUrl: authUrl,
            message: this.currentAuthStatus.authMessage,
          });
        } else if (data.includes('Not logged in')) {
          this.currentAuthStatus.authMessage = '未登录，正在获取新的访问令牌...';
          this.emit('auth-progress', { message: this.currentAuthStatus.authMessage });
        } else if (data.includes('Please enter')) {
          this.currentAuthStatus.authMessage = data.trim();
          this.emit('auth-progress', { message: this.currentAuthStatus.authMessage });
        }
      };

      authProcess.stdout?.on('data', (data) => {
        processOutput(data.toString());
      });

      authProcess.stderr?.on('data', (data) => {
        processOutput(data.toString());
      });

      authProcess.on('close', async (code) => {
        this.currentAuthStatus.authInProgress = false;

        if (code === 0) {
          // 授权进程正常退出，等待 token 文件写入并重试检查
          this.emit('auth-output', '\n正在验证授权结果...\n');
          console.log('[Copilot] 授权进程退出，开始检查 token 文件');

          let tokenExists = false;
          const maxRetries = 10; // 最多重试 10 次
          const retryDelay = 500; // 每次延迟 500ms

          for (let i = 0; i < maxRetries; i++) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            tokenExists = this.checkToken();
            console.log(`[Copilot] Token 检查 (${i + 1}/${maxRetries}): ${tokenExists}`);

            if (tokenExists) {
              break;
            }
          }

          if (tokenExists) {
            this.currentAuthStatus.authMessage = '认证成功！';
            this.emit('auth-output', '\n✅ 认证成功！\n');
            this.emit('auth-progress', { message: '认证成功！' });
            resolve({
              success: true,
              code: authCode,
              url: authUrl,
              message: '认证成功！',
            });
          } else {
            this.currentAuthStatus.authMessage = '认证完成但未找到 token 文件，请重试';
            this.emit('auth-output', '\n⚠️ 未找到 token 文件\n');
            this.emit('auth-progress', { message: '认证失败，请重试' });
            resolve({
              success: false,
              code: authCode,
              url: authUrl,
              message: '未找到 token 文件',
            });
          }
        } else {
          this.currentAuthStatus.authMessage = '认证失败，请重试';
          this.emit('auth-output', '\n❌ 认证失败\n');
          this.emit('auth-progress', { message: '认证失败，请重试' });
          resolve({
            success: false,
            code: authCode,
            url: authUrl,
            message: output || '认证失败',
          });
        }
      });

      authProcess.on('error', (error) => {
        this.currentAuthStatus.authInProgress = false;
        this.currentAuthStatus.authMessage = `认证出错: ${error.message}`;
        this.emit('auth-output', `\n❌ 认证出错: ${error.message}\n`);
        this.emit('auth-progress', { message: this.currentAuthStatus.authMessage });
        resolve({
          success: false,
          message: `认证出错: ${error.message}`,
        });
      });
    });
  }

  /**
   * 启动 copilot-api 服务，返回启动过程输出
   */
  async start(): Promise<{ success: boolean; output: string }> {
    console.log('[Copilot] 开始启动服务流程');

    // 清除旧的进程引用
    if (this.serviceProcess) {
      console.log('[Copilot] 清除旧的进程引用');
      this.serviceProcess = null;
    }

    // 检查是否已在运行
    if (await this.checkRunning()) {
      console.log('[Copilot] 服务已在运行');
      return { success: true, output: 'Copilot API 服务已在运行' };
    }

    // 检查是否安装
    if (!this.checkInstalled()) {
      console.log('[Copilot] copilot-api 未安装');
      return { success: false, output: '请先安装 copilot-api' };
    }

    // 检查 token
    if (!this.checkToken()) {
      console.log('[Copilot] 未找到 GitHub token');
      return { success: false, output: '请先完成 GitHub 认证' };
    }

    const token = this.getToken();
    if (!token) {
      console.log('[Copilot] Token 读取失败');
      return { success: false, output: 'Token 读取失败' };
    }

    // 确保日志目录存在
    if (!fs.existsSync(CLAUDE_CONFIG_DIR)) {
      fs.mkdirSync(CLAUDE_CONFIG_DIR, { recursive: true });
    }

    // 启动服务
    return new Promise((resolve) => {
      const logPath = path.join(CLAUDE_CONFIG_DIR, 'copilot-api.log');

      this.emit('start-output', '正在启动 copilot-api 服务...\n');
      console.log('[Copilot] 启动命令: copilot-api start --github-token [REDACTED]');

      // 不使用 detached，让进程保持在父进程控制下
      this.serviceProcess = spawn('copilot-api', ['start', '--github-token', token], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: {
          ...process.env,
          PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',
          HOME: os.homedir(),
        },
      });

      // 将输出写入日志文件
      const logStream = fs.createWriteStream(logPath, { flags: 'a' });
      let hasOutput = false;

      this.serviceProcess.stdout?.on('data', (data) => {
        hasOutput = true;
        const line = data.toString();
        logStream.write(line);
        console.log('[Copilot Service]', line.trim());
        this.emit('start-output', line);
      });

      this.serviceProcess.stderr?.on('data', (data) => {
        hasOutput = true;
        const line = data.toString();
        logStream.write(line);
        console.error('[Copilot Service Error]', line.trim());
        this.emit('start-output', line);
      });

      this.serviceProcess.on('error', (error) => {
        logStream.end();
        console.error('[Copilot] 启动进程错误:', error);
        this.emit('start-output', `\n❌ 启动失败: ${error.message}\n`);
        // 清除缓存
        this.clearRunningCache();
        resolve({ success: false, output: `启动失败: ${error.message}` });
      });

      this.serviceProcess.on('exit', (code, signal) => {
        console.log(`[Copilot] 服务进程退出: code=${code}, signal=${signal}`);
        // 清除进程引用
        this.serviceProcess = null;
        // 清除运行状态缓存
        this.clearRunningCache();

        if (code !== 0 && code !== null) {
          console.error('[Copilot] 服务异常退出');
          this.emit('start-output', `\n⚠️ 服务异常退出: code=${code}\n`);
        }
      });

      // 等待服务启动
      let attempts = 0;
      const maxAttempts = 15; // 15秒，给服务更多启动时间
      let output = '正在启动服务...\n';
      let consecutiveSuccess = 0; // 连续成功次数
      const requiredSuccess = 2; // 需要连续成功2次才认为服务稳定

      const checkInterval = setInterval(async () => {
        attempts++;
        console.log(
          `[Copilot] 检查服务状态 (${attempts}/${maxAttempts}, 连续成功: ${consecutiveSuccess}/${requiredSuccess})`
        );

        // 启动时只信任 HTTP 检测，避免误判旧进程
        const isRunning = await this.checkRunningViaHttp();

        if (isRunning) {
          consecutiveSuccess++;
          console.log(`[Copilot] 服务响应正常 (${consecutiveSuccess}/${requiredSuccess})`);

          // 需要连续成功多次才认为服务真正稳定
          if (consecutiveSuccess >= requiredSuccess) {
            clearInterval(checkInterval);
            logStream.end();
            const successMsg = '✅ 服务启动成功，可以访问 http://localhost:4141\n';
            console.log('[Copilot]', successMsg);
            this.emit('start-output', successMsg);
            resolve({ success: true, output: output + successMsg });
          }
        } else {
          // 重置连续成功计数
          if (consecutiveSuccess > 0) {
            console.log(`[Copilot] 服务响应失败，重置计数`);
            consecutiveSuccess = 0;
          }

          if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            logStream.end();
            // 清除缓存，确保状态正确
            this.clearRunningCache();
            const failMsg = hasOutput
              ? `⚠️ 服务启动超时，请检查日志: ${logPath}\n`
              : `❌ 服务无输出，可能启动失败。请检查:\n1. GitHub Token 是否有效\n2. 是否有 Copilot 订阅\n3. 日志: ${logPath}\n`;
            console.error('[Copilot]', failMsg);
            this.emit('start-output', failMsg);
            resolve({ success: false, output: output + failMsg });
          }
        }
      }, 1000);
    });
  }

  /**
   * 停止 copilot-api 服务
   */
  async stop(): Promise<boolean> {
    console.log('[Copilot] 开始停止服务');

    // 如果有本地进程引用，先尝试杀死它
    if (this.serviceProcess && this.serviceProcess.pid) {
      console.log('[Copilot] 正在终止本地进程:', this.serviceProcess.pid);
      try {
        this.serviceProcess.kill('SIGTERM');
        // 等待进程退出
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('[Copilot] 终止本地进程失败:', error);
      }
      this.serviceProcess = null;
    }

    return new Promise((resolve) => {
      const platform = os.platform();

      if (platform === 'win32') {
        // Windows: 先找到占用端口的 PID，然后终止
        try {
          const netstatResult = execSync(`netstat -ano | findstr :${COPILOT_API_PORT}`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });

          // 提取 PID（最后一列）
          const lines = netstatResult.split('\n').filter((line) => line.includes('LISTENING'));
          const pids = new Set<string>();

          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && /^\d+$/.test(pid)) {
              pids.add(pid);
            }
          }

          if (pids.size > 0) {
            console.log('[Copilot] 找到进程 PID:', Array.from(pids).join(', '));

            // 终止所有找到的进程
            for (const pid of pids) {
              try {
                execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                console.log(`[Copilot] 已终止进程 ${pid}`);
              } catch (error) {
                console.log(`[Copilot] 终止进程 ${pid} 失败:`, error);
              }
            }
          } else {
            console.log('[Copilot] 未找到占用端口的进程');
          }
        } catch (error) {
          console.log('[Copilot] 查找进程失败（服务可能未运行）:', error);
        }

        // 清除缓存并返回
        this.clearRunningCache();
        setTimeout(() => {
          console.log('[Copilot] 服务停止完成');
          resolve(true);
        }, 1500);
      } else {
        // Unix/macOS: 使用 pkill
        exec('pkill -f "copilot-api start"', (error) => {
          if (error) {
            console.log('[Copilot] 停止命令执行出错（可能服务未运行）:', error.message);
          } else {
            console.log('[Copilot] 停止命令执行成功');
          }

          // 清除缓存
          this.clearRunningCache();

          setTimeout(() => {
            console.log('[Copilot] 服务停止完成');
            resolve(true);
          }, 1500);
        });
      }
    });
  }

  /**
   * 获取完整服务状态信息
   */
  async getStatus(): Promise<CopilotStatus> {
    const [installed, running, hasToken] = await Promise.all([
      Promise.resolve(this.checkInstalled()),
      this.checkRunning(),
      Promise.resolve(this.checkToken()),
    ]);

    return {
      installed,
      running,
      hasToken,
      authInProgress: this.currentAuthStatus.authInProgress || false,
      authCode: this.currentAuthStatus.authCode,
      authUrl: this.currentAuthStatus.authUrl,
      authMessage: this.currentAuthStatus.authMessage,
    };
  }
}
