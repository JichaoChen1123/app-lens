#!/bin/bash
{
# 截断保护：整个脚本包在这对花括号里。用 `curl ... | bash` 安装时，
# 如果下载中途断开，bash 会因为缺少结尾的 `}` 直接报语法错误，
# 而不会只执行半个脚本。
set -euo pipefail

# ---------------------------------------------------------------------------
# 软件透视 AppLens 一键安装程序（仅支持 Apple 芯片的 Mac）
#
# 设计原则：
# - 不依赖、也不改动电脑上已有的 Node.js / npm / Homebrew / nvm。
#   软件透视自带一份专用的 Node.js，全部装在 ~/.applens 里。
# - 不需要 sudo，不需要管理员密码，不需要 Xcode。
# - 优先使用国内镜像（npmmirror），失败再试官方源。
# - 可以重复运行：再运行一次就是"修复/更新"。
# ---------------------------------------------------------------------------

PACKAGE="@jichaochen1123/app-lens"
RELEASE_BASE="${CHAICHAI_RELEASE_BASE:-https://github.com/JichaoChen1123/app-lens/releases}"
# 是否从 npm 安装。只有维护者确实在 npm 上发布了 @jichaochen1123/app-lens 才打开，
# 否则别人抢注同名包时，学生可能装到别人的程序。scripts/release.sh 发布到 npm 后会自动改成 true。
NPM_ENABLED="false"
# 安装包的国内加速地址：jsDelivr 提供 GitHub 仓库 releases 分支里的文件。
PACKAGE_MIRRORS="${CHAICHAI_PACKAGE_MIRRORS:-https://cdn.jsdelivr.net/gh/JichaoChen1123/app-lens@releases https://fastly.jsdelivr.net/gh/JichaoChen1123/app-lens@releases}"
APP_HOME="${CHAICHAI_HOME:-${HOME}/.applens}"

# 软件透视专用 Node.js。校验值来自 nodejs.org 官方 SHASUMS256.txt，
# 镜像下载的文件必须与之完全一致才会被使用。
NODE_MODERN_VERSION="24.18.0"
NODE_MODERN_SHA_ARM64="e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1"
# Node.js 24 需要 macOS 13.5+；更老的系统（例如还停在 macOS 11/12 的 M1 电脑）改用 Node.js 22。
NODE_LEGACY_VERSION="22.23.2"
NODE_LEGACY_SHA_ARM64="61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6"

NODE_MIRRORS="${CHAICHAI_NODE_MIRROR:-https://cdn.npmmirror.com/binaries/node https://nodejs.org/dist}"
NPM_REGISTRIES="${CHAICHAI_REGISTRY:-https://registry.npmmirror.com https://registry.npmjs.org}"

PROFILE_BEGIN="# >>> applens >>>"
PROFILE_END="# <<< applens <<<"

version=""
from_file=""
run_setup=true
assume_yes=false
dry_run=false
LOG=""
TMP_ROOT=""

# ---------- 输出 ----------
if [ -t 1 ]; then
  BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  BOLD=""; GREEN=""; YELLOW=""; RED=""; DIM=""; RESET=""
fi
say() { printf '%s\n' "$*"; }
step() { printf '\n%s【第 %s 步 / 共 5 步】%s%s\n' "${BOLD}" "$1" "$2" "${RESET}"; }
ok() { printf '  %s✓%s %s\n' "${GREEN}" "${RESET}" "$*"; }
note() { printf '  %s!%s %s\n' "${YELLOW}" "${RESET}" "$*"; }
info() { printf '  %s%s%s\n' "${DIM}" "$*" "${RESET}"; }

fail() {
  printf '\n%s✗ 安装没有完成：%s%s\n' "${RED}" "$1" "${RESET}" >&2
  if [ -n "${2:-}" ]; then printf '  怎么办：%s\n' "$2" >&2; fi
  if [ -n "${LOG}" ] && [ -f "${LOG}" ]; then
    printf '  详细记录在：%s\n' "${LOG}" >&2
    printf '  如果自己解决不了，把这个文件发给老师。\n' >&2
  fi
  exit 1
}

cleanup() {
  if [ -n "${TMP_ROOT}" ] && [ -d "${TMP_ROOT}" ]; then rm -rf "${TMP_ROOT}"; fi
}
trap cleanup EXIT
# 任何意外出错都给出中文提示和日志位置，而不是只留下一句英文报错。
set -E
trap 'fail "安装过程在第 ${LINENO} 行意外出错。" "重新运行一次安装命令；还不行就把安装记录发给老师。"' ERR
trap 'fail "安装被中断了。" "重新运行一次安装命令即可。"' INT TERM

usage() {
  cat <<'EOF'
软件透视 AppLens 安装程序（Apple 芯片的 Mac）

用法：bash install.sh [选项]

选项：
  --version 版本号   安装指定版本（默认安装最新版）
  --from 文件.tgz    使用本地安装包（老师发给你的 @jichaochen1123/app-lens-x.y.z.tgz）
  --no-setup         只安装，不接入 AI 工具（之后可运行 applens setup）
  --yes              接入 AI 工具时不再询问，直接确认
  --dry-run          只显示将要做什么，不做任何改动
  --help             显示这段说明

环境变量：
  CHAICHAI_HOME        安装目录（默认 ~/.applens）
  CHAICHAI_REGISTRY    npm 源，可写多个，用空格分开
  CHAICHAI_NODE_MIRROR Node.js 下载源，可写多个，用空格分开
  CHAICHAI_PACKAGE_MIRRORS  安装包备用下载地址，可写多个，用空格分开
EOF
}

# ---------- 工具函数 ----------
has_proxy() {
  [ -n "${http_proxy:-}${https_proxy:-}${HTTP_PROXY:-}${HTTPS_PROXY:-}${ALL_PROXY:-}${all_proxy:-}" ]
}

# 下载文件：先按电脑当前的网络设置下载；如果设置了代理且失败，再绕过代理试一次。
fetch() {
  local url="$1" out="$2" progress="-sS"
  # 在终端窗口里显示进度条；输出被重定向时保持安静
  if [ -t 2 ]; then progress="--progress-bar"; fi
  if curl -fL --connect-timeout 20 --retry 2 --retry-delay 2 --max-time 1200 \
    "${progress}" -o "${out}" "${url}"; then
    return 0
  fi
  if has_proxy; then
    note "通过代理下载失败，改为直接连接再试一次……"
    curl -fL --connect-timeout 20 --retry 2 --retry-delay 2 --max-time 1200 \
      --noproxy '*' "${progress}" -o "${out}" "${url}" && return 0
  fi
  return 1
}

sha256_of() { shasum -a 256 "$1" | awk '{print $1}'; }

# version_at_least 13.4.1 13 5  表示判断 13.4.1 是否 >= 13.5
version_at_least() {
  local major minor
  major="$(printf '%s' "$1" | cut -d. -f1)"
  minor="$(printf '%s' "$1" | cut -d. -f2)"
  case "${major}" in ''|*[!0-9]*) major=0 ;; esac
  case "${minor}" in ''|*[!0-9]*) minor=0 ;; esac
  [ "${major}" -gt "$2" ] || { [ "${major}" -eq "$2" ] && [ "${minor}" -ge "$3" ]; }
}

# 用干净的环境运行软件透视自带的 npm：
# 忽略电脑上可能装错/配错的 npm 配置、NODE_OPTIONS、npm_config_* 等。
run_npm() {
  local use_proxy="$1"; shift
  local -a proxy_env=()
  if [ "${use_proxy}" = true ]; then
    local name
    for name in http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy NO_PROXY no_proxy; do
      if [ -n "${!name:-}" ]; then proxy_env+=("${name}=${!name}"); fi
    done
  fi
  # 学校或公司网络可能要求自定义证书，保留这些设置
  for name in NODE_EXTRA_CA_CERTS SSL_CERT_FILE SSL_CERT_DIR; do
    if [ -n "${!name:-}" ]; then proxy_env+=("${name}=${!name}"); fi
  done
  env -i \
    HOME="${HOME}" USER="${USER:-}" LANG="en_US.UTF-8" TMPDIR="${TMPDIR:-/tmp}" \
    PATH="${APP_HOME}/node/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    NPM_CONFIG_USERCONFIG="${APP_HOME}/npmrc" \
    NPM_CONFIG_GLOBALCONFIG="${APP_HOME}/npmrc-global" \
    ${proxy_env[@]+"${proxy_env[@]}"} \
    "${APP_HOME}/node/bin/node" "${APP_HOME}/node/lib/node_modules/npm/bin/npm-cli.js" "$@"
}

# 单引号转义，用于把路径安全地写进启动脚本
shell_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

# ---------- 第 1 步：检查电脑 ----------
check_computer() {
  step 1 "检查你的电脑"

  [ "$(uname -s)" = "Darwin" ] || fail "软件透视只支持苹果电脑（Apple 芯片的 Mac）。"
  [ "$(id -u)" != "0" ] || fail "请不要用 sudo 或管理员身份运行安装命令。" "去掉命令前面的 sudo，直接运行。"
  command -v curl >/dev/null 2>&1 || fail "找不到 curl。" "这是 macOS 自带的工具，请检查系统是否完整。"

  # 用硬件信息判断芯片，避免"用 Rosetta 打开的终端"把 Apple 芯片误报成 Intel。
  if [ "$(sysctl -in hw.optional.arm64 2>/dev/null || echo 0)" != "1" ]; then
    fail "软件透视只支持 Apple 芯片（M1、M2、M3、M4 等）的 Mac，这台电脑是 Intel 芯片。" "查看芯片：点屏幕左上角苹果图标 → 关于本机 → 看「芯片」一栏。"
  fi
  NODE_ARCH="arm64"
  ok "芯片：Apple 芯片（M 系列）"

  macos_version="$(sw_vers -productVersion 2>/dev/null || echo 0)"
  if version_at_least "${macos_version}" 13 5; then
    NODE_VERSION="${NODE_MODERN_VERSION}"; NODE_SHA="${NODE_MODERN_SHA_ARM64}"
  elif version_at_least "${macos_version}" 11 0; then
    NODE_VERSION="${NODE_LEGACY_VERSION}"; NODE_SHA="${NODE_LEGACY_SHA_ARM64}"
    note "你的系统是 macOS ${macos_version}，比较老，将使用兼容版组件。个别新功能可能用不了。"
  else
    fail "你的系统版本是 macOS ${macos_version}，太老了。" "软件透视需要 macOS 11（Big Sur）或更新的系统。请先在「系统设置 → 软件更新」里升级。"
  fi
  ok "系统：macOS ${macos_version}"

  mkdir -p "${APP_HOME}" 2>/dev/null || fail "无法创建文件夹 ${APP_HOME}。" "检查你的用户文件夹是否可以写入。"
  [ -w "${APP_HOME}" ] || fail "文件夹 ${APP_HOME} 没有写入权限。" "可能以前用 sudo 装过。在终端运行：sudo chown -R \"${USER}\" \"${APP_HOME}\"，然后重新安装。"
  : >"${APP_HOME}/.applens-install" 2>/dev/null || true
  LOG="${APP_HOME}/install.log"
  { printf '==== %s 安装开始 ====\n' "$(date)"; uname -a; sw_vers; } >>"${LOG}" 2>&1 || true

  local free_kb
  free_kb="$(df -Pk "${APP_HOME}" | awk 'NR==2 {print $4}')"
  if [ -n "${free_kb}" ] && [ "${free_kb}" -lt 1048576 ]; then
    fail "硬盘剩余空间不足 1GB。" "清理一些文件后再安装。"
  fi
  ok "硬盘空间足够"

  if has_proxy; then
    note "检测到你设置了网络代理。如果下载失败，安装程序会自动绕过代理再试。"
  fi

  TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/applens-install.XXXXXX")"
}

# ---------- 第 2 步：准备专用 Node.js ----------
install_node() {
  step 2 "准备软件透视专用的运行环境（不影响电脑上已有的软件）"
  local node_dir="${APP_HOME}/node"
  if [ -x "${node_dir}/bin/node" ] && [ -f "${node_dir}/lib/node_modules/npm/bin/npm-cli.js" ] &&
    [ "$("${node_dir}/bin/node" -v 2>/dev/null || true)" = "v${NODE_VERSION}" ]; then
    ok "运行环境已就绪（Node.js ${NODE_VERSION}），跳过下载"
    return
  fi

  local name="node-v${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz"
  local archive="${TMP_ROOT}/${name}" mirror downloaded=false
  for mirror in ${NODE_MIRRORS}; do
    info "正在下载：${mirror}/v${NODE_VERSION}/${name}"
    if fetch "${mirror}/v${NODE_VERSION}/${name}" "${archive}"; then
      if [ "$(sha256_of "${archive}")" = "${NODE_SHA}" ]; then
        downloaded=true; break
      fi
      note "下载的文件校验不通过（可能下载不完整），换一个源再试……"
      echo "checksum mismatch from ${mirror}" >>"${LOG}"
    else
      note "这个下载源暂时连不上，换一个源再试……"
    fi
  done
  [ "${downloaded}" = true ] || fail "运行环境下载失败。" "检查网络是否正常（能否打开网页），然后重新运行安装命令。"

  mkdir -p "${TMP_ROOT}/node"
  tar -xzf "${archive}" -C "${TMP_ROOT}/node" --strip-components 1 >>"${LOG}" 2>&1 || fail "解压运行环境失败。" "重新运行安装命令。"
  "${TMP_ROOT}/node/bin/node" -v >>"${LOG}" 2>&1 || fail "运行环境无法在这台电脑上启动。" "把安装记录发给老师。"

  rm -rf "${node_dir}.old"
  if [ -e "${node_dir}" ]; then mv "${node_dir}" "${node_dir}.old"; fi
  mv "${TMP_ROOT}/node" "${node_dir}"
  rm -rf "${node_dir}.old"
  ok "运行环境已就绪（Node.js ${NODE_VERSION}）"
}

# ---------- 第 3 步：安装软件透视 ----------
write_npm_config() {
  cat >"${APP_HOME}/npmrc" <<EOF
# 软件透视专用的 npm 设置（由安装程序生成，重新安装时会覆盖）
registry=$1
prefix=${APP_HOME}/app
cache=${APP_HOME}/npm-cache
fund=false
audit=false
update-notifier=false
fetch-retries=3
fetch-timeout=120000
EOF
  : >"${APP_HOME}/npmrc-global"
}

# 用软件透视自带的 npm 安装 $1（包名@版本，或本地安装包路径）。依赖从国内镜像下载。
npm_install_spec() {
  local spec="$1" registry attempt use_proxy
  for registry in ${NPM_REGISTRIES}; do
    write_npm_config "${registry}"
    for attempt in proxy direct; do
      if [ "${attempt}" = proxy ]; then
        use_proxy=true
        info "正在从 ${registry} 安装（大约需要 1～3 分钟）……"
      else
        has_proxy || continue
        use_proxy=false
        note "通过代理安装失败，改为直接连接再试一次……"
      fi
      if run_npm "${use_proxy}" install --global --ignore-scripts --no-audit --no-fund \
        --loglevel=error "${spec}" >>"${LOG}" 2>&1; then
        return 0
      fi
      echo "npm install failed via ${registry} (${attempt})" >>"${LOG}"
    done
    note "这个下载源安装失败，换一个源再试……"
  done
  return 1
}

install_package() {
  step 3 "下载并安装软件透视"
  local spec installed=false
  if [ -n "${from_file}" ]; then
    [ -f "${from_file}" ] || fail "找不到安装包：${from_file}"
    spec="$(cd "$(dirname "${from_file}")" && pwd)/$(basename "${from_file}")"
    info "使用本地安装包：${spec}"
    npm_install_spec "${spec}" && installed=true
  else
    if [ "${NPM_ENABLED}" = true ]; then
      npm_install_spec "${PACKAGE}@${version:-latest}" && installed=true
    fi
    if [ "${installed}" != true ]; then
      # 没有从 npm 装上时，先走 jsDelivr 加速，再直接从 GitHub Releases 下载。
      local file="${PACKAGE}.tgz" url archive="${TMP_ROOT}/${PACKAGE}.tgz"
      local -a urls=()
      if [ -n "${version}" ]; then file="${PACKAGE}-${version}.tgz"; fi
      for url in ${PACKAGE_MIRRORS}; do urls+=("${url}/${file}"); done
      if [ -n "${version}" ]; then
        urls+=("${RELEASE_BASE}/download/v${version}/${PACKAGE}.tgz")
      else
        urls+=("${RELEASE_BASE}/latest/download/${PACKAGE}.tgz")
      fi
      if [ "${NPM_ENABLED}" = true ]; then note "改为直接下载安装包……"; fi
      for url in "${urls[@]}"; do
        info "正在下载：${url}"
        if fetch "${url}" "${archive}" && fetch "${url}.sha256" "${archive}.sha256"; then
          # 安装包旁边有一份 SHA-256 指纹，必须一致才使用
          if [ "$(sha256_of "${archive}")" = "$(awk '{print $1; exit}' "${archive}.sha256")" ] &&
            tar -tzf "${archive}" >/dev/null 2>&1; then
            npm_install_spec "${archive}" && installed=true
            break
          fi
          note "下载的安装包校验不通过（可能下载不完整），换一个地址再试……"
          echo "package checksum mismatch from ${url}" >>"${LOG}"
          continue
        fi
        note "这个下载地址暂时不可用，换一个再试……"
      done
    fi
  fi
  [ "${installed}" = true ] || fail "软件透视安装失败。" "检查网络后重新运行安装命令。"

  ENTRY="${APP_HOME}/app/lib/node_modules/${PACKAGE}/scripts/rea.mjs"
  [ -f "${ENTRY}" ] || fail "安装结果不完整（找不到程序入口）。" "重新运行安装命令。"
  ok "软件透视已安装"
}

# ---------- 第 4 步：设置 applens 命令 ----------
write_launcher() {
  local launcher="${APP_HOME}/bin/applens" home_q update_line=""
  home_q="$(shell_quote "${APP_HOME}")"
  if [ "${NPM_ENABLED}" != true ]; then
    # 没有发布到 npm 时，applens update 不去 npm 上找同名包，而是提示重新运行安装命令。
    update_line="REA_UPDATE_INSTRUCTIONS='软件透视由安装程序管理。更新方法：重新运行一次安装命令（见 https://github.com/JichaoChen1123/app-lens ）。'
export REA_UPDATE_INSTRUCTIONS"
  fi
  mkdir -p "${APP_HOME}/bin"
  cat >"${launcher}.tmp" <<EOF
#!/bin/sh
# 软件透视 AppLens 启动器（由安装程序生成，请勿手动修改）。
# 它总是使用软件透视自带的 Node.js，所以不受电脑上其他软件的影响。
CHAICHAI_HOME=${home_q}
unset NODE_OPTIONS NODE_PATH
PATH="\${CHAICHAI_HOME}/node/bin:\${CHAICHAI_HOME}/bin:\${PATH}"
NPM_CONFIG_USERCONFIG="\${CHAICHAI_HOME}/npmrc"
NPM_CONFIG_GLOBALCONFIG="\${CHAICHAI_HOME}/npmrc-global"
REA_REGISTRATION_LAUNCHER="\${CHAICHAI_HOME}/bin/applens"
export PATH NPM_CONFIG_USERCONFIG NPM_CONFIG_GLOBALCONFIG REA_REGISTRATION_LAUNCHER
${update_line}
exec "\${CHAICHAI_HOME}/node/bin/node" "\${CHAICHAI_HOME}/app/lib/node_modules/${PACKAGE}/scripts/rea.mjs" "\$@"
EOF
  chmod 755 "${launcher}.tmp"
  mv "${launcher}.tmp" "${launcher}"
  LAUNCHER="${launcher}"
}

add_to_profile() {
  local file="$1" path_line
  if [ "${APP_HOME}" = "${HOME}/.applens" ]; then
    # shellcheck disable=SC2016
    path_line='export PATH="${HOME}/.applens/bin:${PATH}"'
  else
    path_line="export PATH=$(shell_quote "${APP_HOME}/bin"):\"\${PATH}\""
  fi
  if [ -f "${file}" ] && grep -qF "${PROFILE_BEGIN}" "${file}"; then
    return 0
  fi
  if [ -e "${file}" ] && [ ! -w "${file}" ]; then
    note "无法修改 ${file}（没有写入权限），已跳过。"
    return 0
  fi
  if [ -f "${file}" ] && [ ! -e "${file}.applens-backup" ]; then
    cp -p "${file}" "${file}.applens-backup" 2>/dev/null || true
  fi
  {
    printf '\n%s\n' "${PROFILE_BEGIN}"
    printf '%s\n' "# 软件透视 AppLens：让终端能找到 applens 命令（卸载时会自动删除这几行）"
    printf '%s\n' "${path_line}"
    printf '%s\n' "${PROFILE_END}"
  } >>"${file}"
  info "已更新 ${file}"
}

setup_command() {
  step 4 "设置 applens 命令"
  write_launcher
  local installed_version
  installed_version="$("${LAUNCHER}" --version 2>>"${LOG}" | tail -n 1 || true)"
  [ -n "${installed_version}" ] || fail "软件透视装好了，但启动测试没有通过。" "重新运行安装命令；还不行就把安装记录发给老师。"
  ok "启动测试通过（版本 ${installed_version}）"

  add_to_profile "${HOME}/.zprofile"
  add_to_profile "${HOME}/.zshrc"
  if [ -f "${HOME}/.bash_profile" ] || [ "${SHELL:-}" = "/bin/bash" ]; then
    add_to_profile "${HOME}/.bash_profile"
  fi
  ok "以后打开新的终端窗口，就可以直接输入 applens 了"
}

# ---------- 第 5 步：接入 AI 工具 ----------
# 从 setup 的 JSON 结果里提取信息。用法：setup_json_query 模式 <<< JSON
#   planned   计划接入的 AI 工具名称
#   detected  电脑上找到的 AI 工具名称
#   aligned   已经正确接入的 AI 工具名称
#   pending   找到了但没有正确接入的 AI 工具名称
#   actions   计划执行的所有操作（包括更新技能文件）
setup_json_query() {
  "${APP_HOME}/node/bin/node" -e '
    const mode = process.argv[1];
    let s = "";
    process.stdin.on("data", (c) => (s += c)).on("end", () => {
      let result;
      try { result = JSON.parse(s); } catch { process.exit(1); }
      const states = result.clientStates || [];
      const label = (id) =>
        (states.find((state) => state.client.name === id) || { client: { displayName: id } })
          .client.displayName;
      const registrations = ((result.doctor || {}).identity || {}).registrations || [];
      const detected = states.filter((state) => state.detected && state.client.format !== "unsupported")
        .map((state) => state.client.name);
      const aligned = registrations.filter((r) => r.state === "aligned").map((r) => r.client);
      const names = {
        planned: (result.plannedActions || [])
          .filter((action) => action.kind === "configure_client")
          .map((action) => action.label),
        detected: detected.map(label),
        aligned: aligned.filter((id) => detected.includes(id)).map(label),
        pending: detected.filter((id) => !aligned.includes(id)).map(label),
        actions: (result.plannedActions || []).map((action) => action.id),
      }[mode] || [];
      process.stdout.write([...new Set(names)].join("、"));
    });' "$1"
}

connect_agents() {
  step 5 "接入你的 AI 工具"
  if [ "${run_setup}" != true ]; then
    note "已按要求跳过。以后想接入时，运行：applens setup"
    return
  fi

  local plan planned detected actions
  plan="$("${LAUNCHER}" setup --all-detected --dry-run --format json 2>>"${LOG}" || true)"
  if ! setup_json_query actions <<<"${plan}" >/dev/null 2>>"${LOG}"; then
    printf '%s\n' "${plan}" >>"${LOG}"
    note "检查 AI 工具时出了点问题，这一步先跳过。之后可以运行：applens setup"
    return
  fi
  planned="$(setup_json_query planned <<<"${plan}" 2>>"${LOG}" || true)"
  detected="$(setup_json_query detected <<<"${plan}" 2>>"${LOG}" || true)"
  actions="$(setup_json_query actions <<<"${plan}" 2>>"${LOG}" || true)"

  if [ -z "${detected}" ]; then
    note "没有在你的电脑上找到支持的 AI 工具（比如 Codex、Claude Code、Cursor、Trae）。"
    say "    先安装一个 AI 工具，然后在终端运行：applens setup"
    return
  fi
  if [ -z "${actions}" ]; then
    ok "这些 AI 工具已经接入软件透视了：${detected}"
    AGENTS_CONNECTED="${detected}"
    return
  fi

  if [ -n "${planned}" ]; then
    say "  找到这些 AI 工具：${BOLD}${planned}${RESET}"
  else
    say "  软件透视需要更新已接入的 AI 工具里的说明文件：${BOLD}${detected}${RESET}"
  fi
  say "  软件透视会把自己接入它们。修改前会自动备份它们的配置文件，原有设置不会丢失。"
  if [ "${assume_yes}" != true ]; then
    if ! { : </dev/tty; } 2>/dev/null; then
      note "当前没法确认，已跳过。之后可运行：applens setup"
      return
    fi
    local answer=""
    printf '  是否继续？直接按回车表示"是"，输入 n 再回车表示"否"：'
    read -r answer </dev/tty || answer="n"
    case "${answer}" in
      n|N|no|NO|否) note "已跳过。之后想接入时，运行：applens setup"; return ;;
    esac
  fi

  # setup 在缺少 Ghidra 等可选引擎时也会返回非 0，所以逐个检查接入结果。
  local result aligned pending
  result="$("${LAUNCHER}" setup --all-detected --yes --format json 2>>"${LOG}" || true)"
  printf '%s\n' "${result}" >>"${LOG}"
  aligned="$(setup_json_query aligned <<<"${result}" 2>>"${LOG}" || true)"
  pending="$(setup_json_query pending <<<"${result}" 2>>"${LOG}" || true)"
  if [ -n "${aligned}" ]; then
    ok "已接入：${aligned}"
    AGENTS_CONNECTED="${aligned}"
  fi
  if [ -n "${pending}" ]; then
    note "这些 AI 工具没有接入成功：${pending}。可以稍后运行 applens setup 再试，或把安装记录发给老师。"
  fi
}

# ---------- 主流程 ----------
main() {
  # 电脑上残留的 Node.js 启动参数可能让专用 Node.js 无法启动，一律不用。
  unset NODE_OPTIONS NODE_PATH
  while [ $# -gt 0 ]; do
    case "$1" in
      --version) [ $# -ge 2 ] || fail "--version 后面要写版本号。"; version="$2"; shift 2 ;;
      --from) [ $# -ge 2 ] || fail "--from 后面要写安装包路径。"; from_file="$2"; shift 2 ;;
      --no-setup|--no-prompt) run_setup=false; shift ;;
      --yes|-y) assume_yes=true; shift ;;
      --dry-run) dry_run=true; shift ;;
      --help|-h) usage; exit 0 ;;
      *) fail "不认识的选项：$1" "运行 bash install.sh --help 查看用法。" ;;
    esac
  done

  if [ -n "${version}" ] && ! [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    fail "版本号格式不对：${version}" "例如：--version 1.0.0"
  fi

  say ""
  say "${BOLD}软件透视 AppLens 安装程序${RESET}"
  say "所有文件都会装在：${APP_HOME}"

  if [ "${dry_run}" = true ]; then
    say ""
    say "（演练模式，不做任何改动）将要做的事："
    say "  1. 检查芯片（需要 Apple 芯片）、系统版本、硬盘空间"
    say "  2. 下载软件透视专用的 Node.js 到 ${APP_HOME}/node"
    say "  3. 安装 ${from_file:-${PACKAGE}@${version:-latest}} 到 ${APP_HOME}/app"
    say "  4. 创建 ${APP_HOME}/bin/applens，并把它加入 ~/.zprofile 和 ~/.zshrc 的 PATH"
    if [ "${run_setup}" = true ]; then
      say "  5. 询问后，把软件透视接入电脑上找到的 AI 工具"
    else
      say "  5. 跳过接入 AI 工具"
    fi
    exit 0
  fi

  AGENTS_CONNECTED=""
  check_computer
  install_node
  install_package
  setup_command
  connect_agents
  printf '==== %s 安装完成 ====\n' "$(date)" >>"${LOG}"

  say ""
  say "${GREEN}${BOLD}🎉 安装完成！${RESET}"
  say ""
  say "接下来："
  say "  1. 关掉这个终端窗口，重新打开一个（让 applens 命令生效）。"
  if [ -n "${AGENTS_CONNECTED}" ]; then
    say "  2. 把 ${AGENTS_CONNECTED} 完全退出再重新打开，让它们加载软件透视。"
  else
    say "  2. 装好 AI 工具（比如 Codex）后，在终端运行：applens setup"
  fi
  say "  3. 在 AI 工具里试着说：「用软件透视帮我看看 /System/Applications/Calculator.app 是什么」"
  say ""
  say "常用命令："
  say "  applens doctor    检查软件透视是否正常"
  if [ "${NPM_ENABLED}" = true ]; then
    say "  applens update    更新到最新版（也可以重新运行安装命令）"
  else
    say "  更新软件透视：重新运行一次安装命令即可"
  fi
  say "  applens setup     重新接入 AI 工具"
  say "  遇到问题时，重新运行一次安装命令，通常就能修好。"
}

main "$@"
}
