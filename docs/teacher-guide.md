# 老师手册：发布和维护软件透视

这份手册写给维护软件透视的老师。学生只需要看首页的 [README](../README.md)。

## 软件透视是怎么送到学生电脑上的

```text
你的 GitHub 仓库 ─┬─ main 分支：代码和 install/install.sh ───────┐
                  ├─ releases 分支：安装包 @jichaochen1123/app-lens.tgz ┼─ jsDelivr 国内加速 ─▶ 学生电脑
                  └─ Releases 页面：安装包（备用）─────────┘
```

- 学生运行的安装命令先下载 `install.sh`，再从国内镜像下载软件透视专用的 Node.js 和依赖。
- 软件透视本身的安装包按顺序从这几个地方下载：jsDelivr 加速 → GitHub Releases。
- **npm 是可选的。** 以后能注册 npm 并发布的话，`npm run release` 会自动让安装程序改为优先从 npm 国内镜像安装，速度更快。
- 没有在 npm 上发布时，安装程序**不会**去 npm 上找 `@jichaochen1123/app-lens`。这样别人抢注同名包，学生也不会装错。

## 第一次发布（只做一次）

发布前，使用 `gh auth status` 检查当前登录账号，并确认该账号有目标仓库的写入权限。随后可以运行：

```bash
gh repo create JichaoChen1123/app-lens --public --source . --push
bash scripts/pack-release.sh /tmp/applens-1.0.0      # 打包，并模拟学生安装一遍
gh release create v1.0.0 /tmp/applens-1.0.0/@jichaochen1123/app-lens.tgz /tmp/applens-1.0.0/@jichaochen1123/app-lens.tgz.sha256 \
  --title "软件透视 1.0.0" --notes "第一个版本"
# releases 分支（给 jsDelivr 国内加速用）
mkdir /tmp/applens-releases && cp /tmp/applens-1.0.0/@jichaochen1123/app-lens*.tgz* /tmp/applens-releases/
git -C /tmp/applens-releases init -b releases && git -C /tmp/applens-releases add -A
git -C /tmp/applens-releases commit -m "release 1.0.0"
git -C /tmp/applens-releases push -f https://github.com/JichaoChen1123/app-lens.git releases
```

做完后，自己在终端运行一遍 README 里的安装命令，确认能装好。

**以后想发布到 npm 时：** 注册 npm 账号，运行 `npm login --registry=https://registry.npmjs.org`，然后执行一次 `npm run release`。

## 发布更新

改完代码并提交后，运行：

```bash
npm run release            # 小更新：1.0.0 → 1.0.1
npm run release -- minor   # 加了新功能：1.0.1 → 1.1.0
```

这个命令会按顺序：检查代码 → 升级版本号 → 打包并**模拟学生安装一遍** → 全部通过后才提交、推送、上传安装包（Releases 和 releases 分支，都带 SHA-256 指纹）→ 发布到 npm（已登录时）→ 刷新 jsDelivr 缓存。中途任何一步失败，都还没有发布任何东西，修好后重新运行即可。

学生**重新运行一次安装命令**就能更新到最新版。发布到 npm 以后，学生也可以运行 `applens update`。

## 学生安装失败时

1. 先让学生把安装命令**重新运行一次**。安装程序可以重复运行，会自动修复。
2. 还不行，让学生把 `~/.applens/install.log` 发给你。常见情况：

| 记录里看到的              | 原因                 | 怎么办                                                     |
| ------------------------- | -------------------- | ---------------------------------------------------------- |
| `checksum mismatch`       | 下载的文件不完整     | 换个网络重试                                               |
| `ETIMEDOUT`、`ECONNRESET` | 网络不通             | 关掉代理/VPN，或换个网络重试                               |
| `E404`                    | npm 上还没有这个版本 | 检查 npm 是否发布成功、镜像是否已同步                      |
| `EACCES`                  | 某个文件夹没有权限   | 让学生运行：`sudo chown -R "$USER" ~/.applens`，再重新安装 |

3. **学校网络完全打不开 GitHub 时**：把项目里的 `install/install.sh` 文件直接发给学生（微信或网盘都行），让学生运行 `bash ~/Downloads/install.sh`。
4. **npm 也连不上时**：先在你的电脑上运行 `npm pack`，得到 `@jichaochen1123/app-lens-x.y.z.tgz`。把它和 `install.sh` 一起发给学生，让学生运行：

   ```bash
   bash ~/Downloads/install.sh --from ~/Downloads/@jichaochen1123/app-lens-x.y.z.tgz
   ```

   注意：这种方式仍然需要从国内镜像下载 Node.js 和少量依赖。

## 安装程序做了什么

| 位置                      | 内容                                                                            |
| ------------------------- | ------------------------------------------------------------------------------- |
| `~/.applens/node/`        | 软件透视专用的 Node.js（Node 24；macOS 13.5 以下用 Node 22）。只支持 Apple 芯片 |
| `~/.applens/app/`         | 软件透视程序本体                                                                |
| `~/.applens/bin/applens`  | 启动器。AI 工具通过它启动软件透视                                               |
| `~/.applens/npmrc`        | 软件透视专用的 npm 设置（国内镜像）                                             |
| `~/.applens/install.log`  | 安装记录                                                                        |
| `~/.zprofile`、`~/.zshrc` | 各加 4 行，把 `~/.applens/bin` 加入 PATH。修改前有备份（`.applens-backup`）     |
| 各 AI 工具的配置文件      | 加入名为 `applens` 的 MCP 服务器。修改前有备份（`.applens.backup`）             |

安装程序不使用 sudo，也不会安装或修改 Homebrew、系统 Node.js、nvm、Java 等其他软件。
