#!/usr/bin/env bash
# CI 部署密钥的准入网关。authorized_keys 里用 command="..." 强制执行本脚本，
# 客户端真正想跑的命令在 $SSH_ORIGINAL_COMMAND 里，这里只放行三类：
#   1. rsync 前端产物到 /srv/nightwolf/dist/
#   2. rsync 后端构建上下文到 /srv/nightwolf/build/
#   3. 执行部署脚本
# 其余一律拒绝 —— 即使 GitHub Secrets 泄露也开不了 shell。
set -euo pipefail

CMD="${SSH_ORIGINAL_COMMAND:-}"

case "$CMD" in
  # rsync 服务端模式，且目标目录必须是 dist/ 或 build/
  "rsync --server "*" /srv/nightwolf/dist/"|"rsync --server "*" /srv/nightwolf/dist")
    exec $CMD
    ;;
  "rsync --server "*" /srv/nightwolf/build/"|"rsync --server "*" /srv/nightwolf/build")
    exec $CMD
    ;;
  ""|"/srv/nightwolf/deploy.sh")
    exec /srv/nightwolf/deploy.sh
    ;;
  *)
    echo "拒绝执行: $CMD" >&2
    exit 1
    ;;
esac
