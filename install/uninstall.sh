#!/bin/bash
{
# 截断保护：整个脚本包在花括号里，下载不完整时不会执行半个脚本。
set -euo pipefail

# 软件透视 AppLens 卸载程序（macOS）
# 会做三件事：
#   1. 从 AI 工具（Codex 等）里移除软件透视的接入配置（其他配置原样保留）
#   2. 删除终端配置文件里安装程序加的那几行
#   3. 删除软件透视的安装目录（默认 ~/.applens）

APP_HOME="${CHAICHAI_HOME:-${HOME}/.applens}"
PROFILE_BEGIN="# >>> applens >>>"
PROFILE_END="# <<< applens <<<"
assume_yes=false

for argument in "$@"; do
  case "${argument}" in
    --yes|-y) assume_yes=true ;;
    --help|-h)
      printf '用法：bash uninstall.sh [--yes]\n  --yes  不再询问，直接卸载\n'
      exit 0 ;;
    *) printf '不认识的选项：%s\n' "${argument}" >&2; exit 1 ;;
  esac
done

printf '\n软件透视 AppLens 卸载程序\n'
printf '将要删除：%s\n' "${APP_HOME}"
printf '并从 AI 工具中移除软件透视的接入配置（其他设置不受影响）。\n'

if [ "${assume_yes}" != true ]; then
  if ! { : </dev/tty; } 2>/dev/null; then
    printf '当前没法确认。如果确定要卸载，请加上 --yes 再运行。\n' >&2
    exit 1
  fi
  printf '确定要卸载吗？输入 y 再回车表示"是"，直接回车表示"否"：'
  answer=""
  read -r answer </dev/tty || answer=""
  case "${answer}" in
    y|Y|yes|YES|是) ;;
    *) printf '已取消，什么都没有改动。\n'; exit 0 ;;
  esac
fi

# 先确认安装目录确实是软件透视的（安装程序会在里面放一个标记文件），再做任何改动。
MARKER=".applens-install"
resolved_home=""
if [ -d "${APP_HOME}" ]; then
  resolved_home="$(cd "${APP_HOME}" && pwd -P)"
  if [ ! -f "${resolved_home}/${MARKER}" ]; then
    printf '  ! %s 不像是软件透视的安装目录（缺少标记文件），为安全起见什么都没有改动。\n' "${resolved_home}" >&2
    exit 1
  fi
fi

# 1. 移除 AI 工具里的接入配置和技能文件
if [ -x "${APP_HOME}/bin/applens" ]; then
  if "${APP_HOME}/bin/applens" uninstall --purge-data >/dev/null 2>&1; then
    printf '  ✓ 已从 AI 工具中移除软件透视\n'
  else
    printf '  ! 有的 AI 工具配置没能自动清理。可以忽略，或手动删除其中名为 applens 的配置。\n'
  fi
fi

# 2. 删除终端配置文件里安装程序添加的那几行（先备份）
remove_block() {
  local file="$1"
  [ -f "${file}" ] || return 0
  grep -qF "${PROFILE_BEGIN}" "${file}" || return 0
  if [ ! -w "${file}" ]; then
    printf '  ! 无法修改 %s（没有写入权限），请手动删除其中 applens 相关的几行。\n' "${file}"
    return 0
  fi
  # 开始和结束标记都在、而且顺序正确时才修改，否则只提示，避免误删用户自己的设置。
  if ! awk -v begin="${PROFILE_BEGIN}" -v end="${PROFILE_END}" '
    $0 == begin { if (open) bad = 1; open = 1; next }
    $0 == end { if (!open) bad = 1; open = 0; seen = 1; next }
    END { exit (bad || open || !seen) ? 1 : 0 }
  ' "${file}"; then
    printf '  ! %s 里软件透视添加的几行被改动过，为安全起见没有自动删除。\n' "${file}"
    printf '    请用文本编辑器打开它，手动删除 applens 相关的几行。\n'
    return 0
  fi
  cp -p "${file}" "${file}.applens-uninstall-backup"
  awk -v begin="${PROFILE_BEGIN}" -v end="${PROFILE_END}" '
    $0 == begin { skipping = 1; next }
    $0 == end { skipping = 0; next }
    !skipping { print }
  ' "${file}.applens-uninstall-backup" >"${file}.applens-tmp"
  cat "${file}.applens-tmp" >"${file}"
  rm -f "${file}.applens-tmp"
  printf '  ✓ 已清理 %s\n' "${file}"
}
remove_block "${HOME}/.zprofile"
remove_block "${HOME}/.zshrc"
remove_block "${HOME}/.bash_profile"

# 3. 删除安装目录：只删除安装程序创建的内容
if [ -n "${resolved_home}" ]; then
  for entry in node node.old app bin npm-cache npmrc npmrc-global install.log "${MARKER}"; do
    rm -rf "${resolved_home:?}/${entry}"
  done
  if rmdir "${resolved_home}" 2>/dev/null; then
    printf '  ✓ 已删除 %s\n' "${resolved_home}"
  else
    printf '  ✓ 已删除软件透视的文件。%s 里还有其他文件，所以保留了这个文件夹。\n' "${resolved_home}"
  fi
fi

printf '\n卸载完成。重新打开终端后生效。\n'
}
