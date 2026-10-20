# Windows 使用与验证

AppLens 的 Windows 分析工作进程由原生组件管理私有目录、文件权限和 Job Object。
源码目录不会提交二进制；原生组件通过 Linux CI 交叉编译，并在 Windows CI 中实际加载和验收。

## 安装

运行install/install.ps1。默认下载与 package.json 版本匹配的 GitHub Release 原生组件，
核对包版本、平台、SHA-256 和 PE 架构，再安装锁定依赖并构建。所有产物保存在项目目录。
`-NativeArchive C:\Downloads\applens-windows-x64-native.zip` 可以使用已下载的同版本归档。
`-SkipDependencies` 用于已安装同一锁定依赖的环境。安装不注册 MCP、不安装全局软件。

原生组件的文件位置为 native/windows/build/manifest.json 与 rea-windows-x64.node。
内部文件名与协议保持稳定，产品命令为 applens。

## 验证

- `npm run verify:windows-native:artifact`：版本、哈希、ABI 和架构检查。
- `npm run verify:windows-native`：真实 NTFS 权限、进程归属、取消和资源清理。
- `npm run verify:windows:smoke`：包含空格和中文路径的应用，通过真实 CLI 与 MCP 分析，
  对比结果、检查证据留存及非法参数拒绝，并核对输入未被修改。
- `npm run test:windows`：领域与契约测试加 Windows 端到端验收。

自动生成的报告位于 .cache/windows-smoke-report.json；失败不会标记为成功。
GitHub Actions 保存独立的原生组件与验证报告。

## 常见问题

缺少 manifest.json：运行 install/install.ps1 或下载同版本原生组件，单独构建 TypeScript 不会生成它。
版本或哈希不匹配：使用同一 Release 的两个文件，不要混用。
macOS 工具不可用：选择跨平台静态分析或 Windows 支持的 Ghidra 工作流。
Ghidra 需要单独安装完整 JDK；AppLens 不自动安装分析引擎。
源码测试中依赖 POSIX 权限、符号链接或其他宿主工具的测试，不代表 Windows 功能已验证。
