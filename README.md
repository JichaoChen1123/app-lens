# AppLens · 软件透视

**让软件内部看得见。**

AppLens 是本地运行的软件分析工具箱，提供命令行和 MCP 两种入口。
用它查看应用的文件结构、模块依赖、接口与数据流，并保留可追溯的证据。

[快速开始](#windows-快速开始) · [怎么用](#怎么用) · [能拆什么](#能拆什么) · [常用指令](#常用指令) · [连接 AI 助手](#连接-ai-助手) · [常见问题](#常见问题) · [下载 Release](https://github.com/JichaoChen1123/app-lens/releases/latest)

## 能拆什么

| 分析对象 | 可以查看什么 | 所需环境 |
| --- | --- | --- |
| JavaScript 项目、前端构建目录、ASAR | 模块、入口、静态依赖、调用与数据流线索 | 完成基础安装；Windows 使用配套原生组件 |
| Electron / JavaScript 桌面应用 | 页面与脚本、预加载、可识别的 IPC 和原生能力边界 | 静态分析无需 Ghidra；运行态观察需额外连接目标 |
| Windows EXE / DLL 的 PE 资源 | 资源目录、图标组关联、数据范围与哈希 | 不需要额外反编译引擎 |
| .NET 程序集 | 程序集身份、类型、方法签名、CIL 与声明的原生调用 | 静态元数据读取无需加载目标程序集 |
| Go 可执行文件 | 内嵌的编译器、模块与构建设置信息 | 支持的 ELF、PE 或薄 Mach-O 文件，无需运行目标 |
| Flutter APK | 构建标识、ABI、库摘要及支持布局下的部分 Dart AOT 结构 | 基础识别不需要反编译引擎；不等于恢复完整 Dart 源码 |
| 浏览器里打开的网站 | 页面、脚本、网络记录及静态代码线索 | 受支持的 Chromium 浏览器与可连接的调试端点 |
| Android APK | 包信息、权限声明、类、方法与引用 | JADX 引擎 JAR 与完整 JDK；设备操作另需 ADB 和明确目标 |
| 原生可执行文件的函数逻辑 | 反编译、调用关系、引用与函数级分析 | 配置适用的 Ghidra、Hopper 或 IDA；受系统与架构限制 |
| macOS / Apple 应用产物 | 支持格式的包结构、Mach-O、配置与资源 | 部分基础解析可独立使用；macOS 专用工具需在对应系统运行 |

同一个软件可能同时包含 Web 页面、原生库和多种资源，通常需要组合分析。
**识别文件格式、恢复静态结构和观察运行行为是不同层次**，结果会保留证据位置、覆盖范围和无法确认的部分。

外部引擎与平台配置见 [安装与配置](docs/installation.md)；
[Android 分析](docs/android-analysis.md)、[.NET 分析](docs/managed-code-analysis.md)、
[Flutter 构建识别](docs/flutter-analysis.md) 提供各自的使用范围。

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

## 怎么用

接入 MCP 并重新打开 AI 助手后，直接说明 **“用 AppLens”＋目标路径＋想弄清的问题**。
可以从整体结构开始，再追问某个功能；不需要先记住所有命令。

| 想弄清的问题 | 可以这样提问 |
| --- | --- |
| 软件有哪些组成部分 | 用 AppLens 检查 `C:\apps\Example`，整理程序入口、业务模块和依赖，说明各项判断的依据。 |
| 界面怎样调用后台 | 用 AppLens 分析 `C:\apps\Example\resources\app.asar`，追踪页面、预加载脚本和 IPC 之间的关系，标出未解析的动态调用。 |
| 一段功能逻辑在哪里 | 用 AppLens 查看 `C:\projects\demo`，定位输入校验和计算规则，给出相关文件、函数与代码位置。 |
| EXE 中有哪些资源 | 用 AppLens 检查 `C:\apps\Example\Example.exe` 的 PE 资源，列出资源类型、图标关联和文件摘要。 |
| Android 应用声明了什么权限 | 用 AppLens 检查 `C:\targets\Example.apk`，列出权限和主要组件；先确认 Android 分析环境可用。 |
| 两个版本有什么变化 | 用 AppLens 比较 `C:\targets\v1\app.asar` 与 `C:\targets\v2\app.asar`，区分文件变化、静态关系变化和仍需验证的行为差异。 |
| 整理一份能复查的报告 | 根据这次 AppLens 分析，按模块解释结构和功能，将直接证据、合理推断和未知项分开，并附出处。 |

一般会按这样的顺序推进：

```text
确认目标与环境 → 盘点文件和组件 → 选择相关代码或工具 → 追踪具体问题 → 整理结论与证据
```

拿到初步结果后，可以继续追问：

> 这个结论在哪个文件里？还有哪些条件没有确认？如果自己实现同类功能，可以怎样设计？

基础静态分析不执行目标代码。涉及启动程序、连接运行中的进程、浏览器或设备时，应先明确操作目标和范围。
源码恢复与功能实现建议也会区分：**能够解释同类功能怎样实现，不等于已经还原原软件全部源码。**

## 常用指令

以下命令在 **源码安装的 `app-lens` 根目录**执行。使用 Release 完整包按发布页安装时，
将 `.\install\applens.cmd` 换成对应的 `.\applens-local\node_modules\.bin\applens.cmd`。

| 命令 | 用途 |
| --- | --- |
| `.\install\applens.cmd --version` | 查看 AppLens 版本 |
| `.\install\applens.cmd --help` | 查看可用命令 |
| `.\install\applens.cmd doctor --client codex --format json` | 检查 Codex 注册信息和本机运行条件，不代替实际连接验证 |
| `.\install\applens.cmd providers --format json` | 查看分析引擎的配置与可用状态 |
| `.\install\applens.cmd capabilities --format json` | 查看能力与可能产生的操作影响 |
| `.\install\applens.cmd setup --client codex --skill=false --dry-run` | 预览 Codex 接入计划，不修改配置 |
| `.\install\applens.cmd setup --client codex --skill=false` | 按交互提示配置 Codex MCP 接入 |
| `.\install\applens.cmd analyze-javascript-application "C:\targets\app.asar" --format json` | 静态分析 JavaScript / Electron / ASAR |
| `.\install\applens.cmd inspect-pe-resources "C:\targets\Example.exe" --format json` | 检查 EXE / DLL 的 PE 资源 |
| `.\install\applens.cmd inspect-managed-artifact "C:\targets\Assembly.dll" --format json` | 查看 .NET 程序集身份和元数据概览 |

查看某条命令的参数，在它后面加 `--help`。例如，只分析包内指定脚本，并将结果保存为 JSON：

```powershell
.\install\applens.cmd analyze-javascript-application "C:\targets\app.asar" --help

.\install\applens.cmd analyze-javascript-application "C:\targets\app.asar" --source-path "main.js" --format json |
  Out-File -FilePath .\analysis.json -Encoding utf8
```

`--source-path` 必须使用包内实际存在的相对路径；选中的文件不包含隐式依赖。
更新步骤见下方 [常见问题](#常见问题)，按源码或 Release 安装方式操作。

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
