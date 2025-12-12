# Contributing to Claude Code Model Switcher

感谢您考虑为本项目做出贡献！

## 如何贡献

### 报告 Bug

如果您发现了 bug，请通过 [GitHub Issues](https://github.com/yourusername/cc-models-provider-switcher/issues) 提交，并包含：

- 清晰的标题和描述
- 重现步骤
- 预期行为和实际行为
- 您的环境信息（操作系统、Node.js 版本等）
- 相关的错误日志或截图

### 提出新功能

如果您有新功能的想法：

1. 先检查 [Issues](https://github.com/yourusername/cc-models-provider-switcher/issues) 中是否已有类似建议
2. 创建新 Issue 描述您的想法，包括：
   - 功能描述
   - 使用场景
   - 可能的实现方案

### 提交代码

1. **Fork 仓库**并克隆到本地

   ```bash
   git clone https://github.com/yourusername/cc-models-provider-switcher.git
   ```

2. **创建新分支**

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **安装依赖**

   ```bash
   npm install
   ```

4. **进行修改**并确保：

   - 代码符合项目风格
   - 添加必要的测试
   - 更新相关文档

5. **提交更改**

   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

   提交信息格式：

   - `feat:` 新功能
   - `fix:` 修复 bug
   - `docs:` 文档更新
   - `style:` 代码格式调整
   - `refactor:` 代码重构
   - `test:` 测试相关
   - `chore:` 构建/工具相关

6. **推送到您的 Fork**

   ```bash
   git push origin feature/your-feature-name
   ```

7. **创建 Pull Request**
   - 在 GitHub 上打开 PR
   - 清楚描述您的更改
   - 链接相关 Issue

## 开发指南

### 代码风格

- 使用 TypeScript strict 模式
- 遵循 ESLint 配置
- 使用有意义的变量和函数名
- 添加必要的注释

### 测试

运行测试前：

```bash
npm run typecheck  # TypeScript 类型检查
npm run lint       # 代码风格检查
```

### 调试

开发模式运行应用：

```bash
npm run dev
```

## 行为准则

- 尊重所有贡献者
- 建设性地讨论问题
- 专注于问题本身，而非个人
- 欢迎新手贡献

## 问题？

如有任何疑问，请通过 [Issues](https://github.com/yourusername/cc-models-provider-switcher/issues) 或邮件联系维护者。

感谢您的贡献！🎉
