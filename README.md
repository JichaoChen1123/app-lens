# AppLens · 软件透视

**让软件内部看得见。**

AppLens 是本地运行的软件分析工具箱，提供命令行和 MCP 两种入口。
用它查看应用的文件结构、模块依赖、接口与数据流，并保留可追溯的证据。

[快速开始](#windows-快速开始) · [连接 AI 助手](#连接-ai-助手) · [常见问题](#常见问题) · [下载 Release](https://github.com/JichaoChen1123/app-lens/releases/latest)

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

## 常见问题

<details>
<summary><strong>安装失败，先检查什么？</strong></summary>

先确认终端已经进入 `app-lens` 项目目录，并检查 Node.js 版本和架构：

```powershell
node --version
node -p process.arch
```

Windows 推荐使用 **Node.js 24.18.0 x64**，架构应显示 `x64`。确认环境正确后，可以重新运行 `install/install.ps1`。

如果卡在下载组件，或不方便从源码构建，可以改用 [Releases](https://github.com/JichaoChen1123/app-lens/releases/latest) 中的完整 `.tgz` 安装包，安装步骤见发布页。仍然失败时，请在 [Issues](https://github.com/JichaoChen1123/app-lens/issues) 附上执行的命令、完整报错和系统版本。

</details>

<details>
<summary><strong>AI 助手里找不到 AppLens，怎么办？</strong></summary>

Windows 安装脚本只负责安装和构建，**不会自动修改 AI 客户端的 MCP 配置**。请先按上方「连接 AI 助手」填写本机 Node 和脚本入口的绝对路径，再完全退出并重新打开客户端。

以 Codex 为例，可以在源码安装目录检查配置，并预览接入计划：

```powershell
.\install\applens.cmd doctor --client codex --format json
.\install\applens.cmd setup --client codex --skill=false --dry-run
```

`--dry-run` 只显示计划，不会完成接入；`doctor` 检查配置和运行条件，也不等于客户端已经建立连接。其他客户端的配置方式见 [安装与配置](docs/installation.md)。

</details>

<details>
<summary><strong>提示原生组件缺失、版本不匹配或校验失败，怎么办？</strong></summary>

Windows 分析需要配套的原生组件。请使用与当前 `package.json` 版本一致的 Release 附件；不要把不同版本的组件混用。

源码安装可以重新运行 `install/install.ps1`，由脚本下载并校验组件。也可以手动下载同版本的 `applens-windows-x64-native.zip`，将其中的 `manifest.json` 和 `rea-windows-x64.node` 放到 `native/windows/build/`，再检查：

```powershell
node scripts/verify-windows-native-artifact.mjs
```

完整 `.tgz` 包已经包含原生组件，正常情况下不需要再单独下载。版本与 SHA-256 校验应通过后再使用，不需要关闭校验来解决安装问题。

</details>

<details>
<summary><strong>安装后没有桌面图标，是没装成功吗？</strong></summary>

AppLens 目前是 **命令行工具和 MCP 服务**，没有独立的桌面图形界面。可以在终端运行命令，也可以把它接入支持 MCP 的 AI 助手。

源码安装后，运行 `.\install\applens.cmd --help` 查看命令；使用完整包按发布页安装后，对应入口是 `.\applens-local\node_modules\.bin\applens.cmd --help`。

</details>

<details>
<summary><strong>Windows、macOS 和 Linux 都能用吗？</strong></summary>

本页的安装步骤和发布的原生组件面向 **Windows 10/11 x64**。Linux、macOS 的核心逻辑有独立 CI 检查，但不代表所有功能都已在三个系统上完整验证。

Windows 原生组件不能用于其他系统；macOS 专用能力也不能直接在 Windows 上使用。与系统或外部引擎相关的功能，请先查看 [支持说明](docs/index.md) 和 `doctor` 返回的检查结果。

</details>

<details>
<summary><strong>必须安装 Ghidra、IDA 或其他分析工具吗？</strong></summary>

基础 JavaScript / Electron / ASAR 静态分析不需要先装 Ghidra。原生反编译、安卓分析、浏览器运行态分析等功能，则需要对应的引擎、运行环境或设备连接。

如果某个引擎不可用，可以单独检查，例如：

```powershell
.\install\applens.cmd doctor --provider ghidra --format json
```

某个可选引擎缺失，不代表所有分析功能都不可用。具体依赖见 [安装与配置](docs/installation.md)，Windows 的使用范围见 [Windows 使用与验证](docs/WINDOWS.md)。

</details>

<details>
<summary><strong>AppLens 收费吗？需要填模型 API Key 吗？</strong></summary>

AppLens 以 MIT 许可证开源，本身不收取使用费，也不提供模型额度。直接运行本地静态分析命令，不需要为了分析额外填写模型 API Key。

通过 MCP 让 AI 助手调用 AppLens 时，模型由你使用的 AI 客户端提供；账号、订阅或 API 费用按该客户端及服务商的规则计算。

</details>

<details>
<summary><strong>会修改被分析的文件，或者把内容上传吗？</strong></summary>

静态分析主要读取你指定的文件；运行程序、调试进程、操作设备等工具会执行实际动作，使用前需要确认目标和参数，不能把所有工具都理解成只读操作。

AppLens 在本地运行，但接入 AI 后，交给客户端的文件片段、路径和分析结果，可能会被客户端发送给模型服务。数据如何处理取决于所用客户端、模型服务和启用的工具，不等于所有内容都始终留在本机。

Windows 安装脚本不会自动修改 AI 客户端配置；使用 `setup` 接入时，可以先通过 `--dry-run` 查看计划。

</details>

<details>
<summary><strong>怎么更新到新版本？</strong></summary>

当前版本通过 GitHub Release 分发，请先查看 [最新发布](https://github.com/JichaoChen1123/app-lens/releases/latest)。

- **源码安装：**更新源码后，重新运行 `install/install.ps1`，安装与该版本匹配的组件和依赖。
- **完整包安装：**下载新版 `.tgz`，按发布页命令安装到原来的安装目录。

更新后重新启动 MCP 服务或 AI 客户端，让正在运行的进程加载新版文件。源码副本和本地 `.tgz` 安装不应按 npm 全局安装的方式执行 `applens update`。

</details>

<details>
<summary><strong>不再使用了，怎么卸载？</strong></summary>

先停止 AppLens 的 CLI / MCP 进程，并在 AI 客户端中移除手动添加的 AppLens MCP 条目。如果通过 `setup` 添加过集成，先用对应的 AppLens 启动入口执行 `uninstall`，清理由 AppLens 管理的配置与技能文件；源码安装的命令是 `.\install\applens.cmd uninstall`。这个命令不等于删除安装包本体。

使用发布页的本地 npm 安装方式时，可以在对应目录运行：

```powershell
npm uninstall --prefix .\applens-local --ignore-scripts --no-audit --no-fund @jichaochen1123/app-lens
```

源码安装则可以在停止相关进程后移除自己克隆的 `app-lens` 目录。

</details>

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
