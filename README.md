# AppLens · 软件透视

**让软件内部看得见。**

AppLens 是本地运行的软件分析工具箱，提供命令行和 MCP 两种入口。
用它查看应用的文件结构、模块依赖、接口与数据流，并保留可追溯的证据。

## 能做什么

- 静态分析 JavaScript / Electron 目录与 ASAR，梳理模块和跨进程通信。
- 读取 .NET 程序集、类型、方法、调用关系和 Windows PE 资源。
- 对接 Ghidra / Hopper / IDA、浏览器、安卓等分析工具；具体功能需要对应环境。
- 追踪功能、比较版本、导入导出证据，明确结果的范围与未知项。
- 通过 MCP 接入支持该协议的 AI 助手；AppLens 本身不提供模型额度。

## Windows 快速开始

需要 Windows 10/11 x64、NTFS 磁盘和 Node.js **24.18.0**（含 npm）。
无需为了基础 JavaScript 分析安装 C++ 编译器或 Ghidra。

```powershell
git clone https://github.com/JichaoChen1123/app-lens.git
cd app-lens
powershell -NoProfile -ExecutionPolicy Bypass -File .\install\install.ps1
.\install\applens.cmd --help
.\install\applens.cmd analyze-javascript-application "C:\Your App" --json
```

安装脚本下载已发布的 Windows 原生组件，验证 SHA-256 与版本，安装锁定依赖并构建。
它不会修改 AI 助手配置，不会安装 Node、Java 或分析引擎。
已有源码和依赖的开发者可以手动下载同版本 Release 的
`applens-windows-x64-native.zip`，解压到 `native/windows/build/`，然后执行：

```powershell
npm ci --ignore-scripts --registry=https://registry.npmjs.org
npm run build:cached
npm run verify:windows:smoke
```

## 连接 AI 助手

在 MCP 客户端中填写本机 Node 和源码入口的绝对路径：

```json
{
  "mcpServers": {
    "applens": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\tools\\app-lens\\scripts\\rea.mjs", "mcp"]
    }
  }
}
```

也可以先查看配置计划，再决定是否应用：

```powershell
.\install\applens.cmd setup --client codex --skill=false --dry-run
```

## 支持边界

Windows 已建立独立的原生组件构建、打包及验收链路。
JavaScript 分析是否可用，以 `npm run verify:windows:smoke` 的实际结果为准。
macOS 专用能力不会在 Windows 上伪装可用。原生反编译需要自备 Ghidra 等工具；
不承诺将任意软件恢复为原始源码，也不把静态推断当作运行事实。

- [安装与配置](docs/installation.md)
- [命令与证据](docs/cli.md)
- [Windows 使用与验证](docs/WINDOWS.md)
- [验证记录](docs/VALIDATION.md)
- [完整文档](docs/index.md)

## 项目目录

```text
app-lens/
├─ src/          核心功能与接口
├─ tests/        测试与验证样例
├─ install/      安装、卸载与 Windows 启动入口
├─ config/       辅助检查配置
├─ docs/         使用、架构和版本文档
├─ scripts/      构建与维护工具
├─ native/       Windows 原生组件源码
├─ bridge/       外部分析引擎桥接
├─ experiments/  实验与性能验证
├─ third_party/  第三方集成材料
└─ licenses/     版权、来源和第三方许可
```

贡献指南和安全报告方式在 `.github/`。根目录保留 Node / TypeScript 工具自动发现的配置。

## 开发

```powershell
npm run build:cached
npm run check:fast
npm run test:fast
npm run test:windows
```

CI 分别验证 Linux / macOS 核心逻辑、Windows 实际分析流程与原生资源边界。
尚未发布到 npm；请使用源码安装或 GitHub Release，避免安装同名第三方包。

## 许可

[MIT](LICENSE) · [版权与来源记录](licenses/COPYRIGHT_NOTICE.md) · [第三方许可](licenses/THIRD_PARTY_NOTICES.md)。
仅分析你拥有或获准分析的软件。
