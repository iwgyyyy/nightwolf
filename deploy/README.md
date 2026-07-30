# 部署

前后端同域跑在一台服务器上：Caddy 终止 TLS，`/` 出前端静态资源，`/api` 反代到容器里的 WebSocket 服务。

```
浏览器 ──443──> Caddy ──┬── /      → /srv/nightwolf/dist
                        └── /api   → 127.0.0.1:9000 (docker)
```

## 一次性初始化

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 2. Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# 3. 目录
mkdir -p /srv/nightwolf/dist
```

把本目录的 `docker-compose.yml`、`deploy.sh` 放到 `/srv/nightwolf/`，`Caddyfile` 放到 `/etc/caddy/`：

```bash
chmod +x /srv/nightwolf/deploy.sh
systemctl reload caddy
```

## 服务器上的 `/srv/nightwolf/.env`

这个文件不进仓库，手动创建。它同时被 compose 用作变量插值和容器环境变量：

```bash
# 镜像地址（CI 推的是 latest）
IMAGE=registry.cn-shenzhen.aliyuncs.com/<命名空间>/nightwolf-server:latest

# 管理员凭证 —— 唯一存放密码的地方
ADMIN_USERNAME=你的用户名
ADMIN_PASSWORD=一个足够强的密码

# 可选：让 token 独立于密码轮换
# TOKEN_SECRET=$(openssl rand -base64 32)
```

```bash
chmod 600 /srv/nightwolf/.env
```

## 登录 ACR

服务器要能拉私有镜像：

```bash
docker login registry.cn-shenzhen.aliyuncs.com -u <用户名>
```

## SSH 密钥

两把，用途分开：

- **你自己登录**：`~/.ssh/id_ed25519.pub`
- **CI 部署**：`~/.ssh/nightwolf_deploy.pub`，在 `authorized_keys` 里限制成只能跑部署脚本

```
command="/srv/nightwolf/deploy.sh",no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding ssh-ed25519 AAAA... github-actions-nightwolf
```

这样即使 GitHub Secrets 泄露，拿到的也只是"触发一次部署"的权限，登不进 shell。

## GitHub Secrets

| 名称 | 值 |
|---|---|
| `ACR_REGISTRY` | `registry.cn-shenzhen.aliyuncs.com` |
| `ACR_NAMESPACE` | ACR 命名空间 |
| `ACR_USERNAME` / `ACR_PASSWORD` | ACR 访问凭证 |
| `SSH_HOST` / `SSH_USER` | 服务器地址与用户 |
| `SSH_PRIVATE_KEY` | `pbcopy < ~/.ssh/nightwolf_deploy` |
| `VITE_WS_URL` | `wss://你的域名/api` |

## 重要约束

**服务只能单实例。** 房间状态在进程内存里，扩副本会导致玩家被路由到不认识这个房间的实例。

**重启会中断所有进行中的对局。** `deploy.sh` 会先查 `/health` 的 `activeRooms` 并提示；要强制阻断就打开脚本里那行 `exit 1`。

## 排查

```bash
docker compose logs -f server          # 服务日志
curl -s http://127.0.0.1:9000/health   # 健康状态与房间数
journalctl -u caddy -f                 # TLS / 反代问题
```

WebSocket 连不上时，先确认 Caddy 拿到证书了（`journalctl -u caddy | grep certificate`），再确认容器端口只绑了回环（`docker ps` 应显示 `127.0.0.1:9000->9000`）。
