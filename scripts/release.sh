#!/bin/bash
# 发布软件透视新版本（在 macOS 上运行）。
# 用法：npm run release -- [patch|minor|major]   （默认 patch，例如 1.0.0 → 1.0.1）
#
# 顺序：检查 → 升级版本号 → 打包并模拟安装 → 全部通过后才提交、推送和上传。
# 中途失败时什么都还没有发布，修好后重新运行即可。
set -euo pipefail
cd "$(dirname "$0")/.."

bump="${1:-patch}"
case "${bump}" in patch|minor|major) ;; *) echo "用法：npm run release -- [patch|minor|major]" >&2; exit 1 ;; esac

repo="JichaoChen1123/app-lens"
fail() { echo "发布停止：$1" >&2; exit 1; }

command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 || fail "还没有登录 GitHub。请先运行：gh auth login"
[ -n "$(git config user.name)" ] && [ -n "$(git config user.email)" ] ||
  fail "git 还没有设置名字和邮箱。请运行：git config --global user.name 你的名字"
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || fail "请先切换到 main 分支：git switch main"
[ -z "$(git status --porcelain)" ] || fail "还有没提交的改动。请先提交：git add -A && git commit -m \"说明\""
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] ||
  fail "本地和 GitHub 上的代码不一致。请先运行 git pull 或 git push。"

publish_npm=true
npm whoami --registry=https://registry.npmjs.org >/dev/null 2>&1 || {
  publish_npm=false
  echo "提示：没有登录 npm，这次只发布到 GitHub（学生仍可正常安装）。"
}

echo "1/5 检查代码……"
npm run check:fast
npm run test:fast

echo "2/5 升级版本号（${bump}）……"
previous="$(node -p 'require("./package.json").version')"
npm version "${bump}" --no-git-tag-version >/dev/null
npm run metadata:generate >/dev/null
version="$(node -p 'require("./package.json").version')"
# 文档里的示例安装命令写的是确切版本号，一起更新
sed -i '' "s/@jichaochen1123/app-lens@${previous}/@jichaochen1123/app-lens@${version}/g" docs/installation.md
restore_version() {
  echo "已撤销版本号改动。" >&2
  git checkout -- package.json package-lock.json src/generatedPackageMetadata.ts docs/installation.md
}
trap 'restore_version' ERR

workdir="$(mktemp -d)"
echo "3/5 打包并模拟安装……"
bash scripts/pack-release.sh "${workdir}"
trap - ERR

echo "4/5 提交并上传 v${version}……"
git add package.json package-lock.json src/generatedPackageMetadata.ts docs/installation.md
git commit -q -m "chore: release ${version}"
git push -q origin main
gh release create "v${version}" \
  "${workdir}/@jichaochen1123/app-lens.tgz" "${workdir}/@jichaochen1123/app-lens.tgz.sha256" \
  --target "$(git rev-parse HEAD)" --title "软件透视 ${version}" --notes "安装或更新方法见 README。"

# releases 分支：给 jsDelivr 国内加速用，只放安装包和指纹文件
releases_dir="${workdir}/releases-branch"
mkdir -p "${releases_dir}"
cp "${workdir}"/@jichaochen1123/app-lens*.tgz "${workdir}"/@jichaochen1123/app-lens*.tgz.sha256 "${releases_dir}/"
git -C "${releases_dir}" init -q -b releases
git -C "${releases_dir}" add -A
git -C "${releases_dir}" commit -q -m "release ${version}"
git -C "${releases_dir}" push -q -f "https://github.com/${repo}.git" releases

if [ "${publish_npm}" = true ]; then
  echo "5/5 发布 @jichaochen1123/app-lens@${version} 到 npm……"
  npm publish "${workdir}/@jichaochen1123/app-lens-${version}.tgz" --registry=https://registry.npmjs.org --access public
  curl -fsS -X PUT "https://registry-direct.npmmirror.com/-/package/@jichaochen1123/app-lens/syncs" >/dev/null ||
    echo "  （通知国内镜像失败也没关系，镜像通常会在 10 分钟内自动同步）"
  if grep -q '^NPM_ENABLED="false"$' install/install.sh; then
    # 已经真正发布到 npm，让安装程序以后优先从 npm 国内镜像安装
    sed -i '' 's/^NPM_ENABLED="false"$/NPM_ENABLED="true"/' install/install.sh
    git add install/install.sh
    git commit -q -m "chore: install from npm"
    git push -q origin main
  fi
else
  echo "5/5 跳过 npm（未登录）"
fi

# 刷新 jsDelivr 缓存，让学生马上拿到新的安装程序和安装包
for path in "@main/install/install.sh" "@main/install/uninstall.sh" "@releases/@jichaochen1123/app-lens.tgz" "@releases/@jichaochen1123/app-lens.tgz.sha256"; do
  curl -fsS "https://purge.jsdelivr.net/gh/${repo}${path}" >/dev/null ||
    echo "  （刷新 ${path} 的缓存失败也没关系，最多 12 小时后自动更新）"
done

rm -rf "${workdir:?}"
echo
echo "完成：软件透视 ${version} 已发布。学生重新运行安装命令即可更新。"
