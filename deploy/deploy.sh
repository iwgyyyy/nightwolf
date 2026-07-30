#!/usr/bin/env bash
#
# 服务器端部署脚本，放在 /srv/nightwolf/deploy.sh。
# CI 通过 SSH 调用它，所以 authorized_keys 里可以用
#   command="/srv/nightwolf/deploy.sh",no-pty,no-port-forwarding ssh-ed25519 AAAA...
# 把部署密钥限制成只能干这一件事，登不进 shell。

set -euo pipefail

APP_DIR=/srv/nightwolf
cd "$APP_DIR"

echo "[deploy] 拉取镜像…"
docker compose pull

# 单实例、状态在内存：重启会掐断所有进行中的对局。
# 这里只提示，不阻断 —— 真要严格的话把下面的 exit 1 打开。
ACTIVE=$(curl -sf --max-time 3 http://127.0.0.1:9000/health | grep -o '"activeRooms":[0-9]*' | cut -d: -f2 || echo "0")
if [ "${ACTIVE:-0}" -gt 0 ]; then
  echo "[deploy] ⚠️  当前有 $ACTIVE 个房间在用，重启会中断对局"
  # exit 1
fi

echo "[deploy] 重启服务…"
docker compose up -d

echo "[deploy] 等待健康检查…"
for i in $(seq 1 30); do
  if curl -sf --max-time 2 http://127.0.0.1:9000/health >/dev/null; then
    echo "[deploy] ✅ 服务已就绪"
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 1
done

echo "[deploy] ❌ 健康检查超时，回看日志："
docker compose logs --tail 50 server
exit 1
