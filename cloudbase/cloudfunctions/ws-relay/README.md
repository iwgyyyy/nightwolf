# ws-relay — 一夜狼人杀 WebSocket 中继服务

无状态 relay（相对的，状态在内存中；游戏结束即清除）。

## 本地开发

```bash
# 1. 安装依赖（只首次）
npm install

# 2. 复制环境变量模板并填入管理员凭证
cp .env.example .env
# 然后编辑 .env，改为你自己的 ADMIN_USERNAME / ADMIN_PASSWORD

# 3. 启动（Node 原生 --env-file 加载 .env，需要 Node ≥ 20.6）
npm run dev
```

默认监听 `ws://localhost:9000`。`.env` 已在根 `.gitignore` 中，不会被提交。

前端连接：在项目根 `.env.local` 加一行

```
VITE_WS_URL=ws://localhost:9000
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 监听端口 | `9000` |
| `ADMIN_USERNAME` | 管理员用户名（创建房间必填） | 空（空时拒绝所有 `create_room`） |
| `ADMIN_PASSWORD` | 管理员密码 | 空 |

## 部署到 CloudBase

1. 通过控制台 / CLI 创建 HTTP 云函数（协议类型 `WS`），单实例（MinNum=1, MaxNum=1）
2. 在**函数环境变量**中配置 `ADMIN_USERNAME` / `ADMIN_PASSWORD`
3. 创建网关访问路径
4. 访问地址形如 `wss://{envId}.api.tcloudbasegateway.com/v1/functions/ws-relay?webfn=true`

## 协议摘要

所有消息 JSON 结构 `{ type, data }`。

### Client → Server

| type | data |
|------|------|
| `create_room` | `{ requestId, hostId, settings, adminCredentials: { username, password } }` |
| `join_room` | `{ roomId, player: { playerId, name, isConnected } }` |
| `leave_room` | `{ roomId, playerId }` |
| `delete_room` | `{ roomId }` |
| `update_public_state` | `{ roomId, state }` |
| `update_private_state` | `{ roomId, playerId, state }` |
| `update_host_state` | `{ roomId, state }` |
| `submit_action` | `{ roomId, playerId, action }` |
| `ping` | `{}` |

### Server → Client

| type | data |
|------|------|
| `room_created` | `{ requestId, roomId }` |
| `public_state` | `{ state }` |
| `private_state` | `{ playerId, state }` |
| `host_state` | `{ state }` |
| `player_action` | `{ playerId, action }` |
| `room_deleted` | `{ roomId }` |
| `error` | `{ code, message }` |
| `pong` | `{}` |

### 错误码（`error.code`）

- `INVALID_ARGUMENT` — 请求字段缺失或非法
- `UNAUTHORIZED` — 凭证无效 / 非 host 尝试解散
- `ROOM_NOT_FOUND` — 房间不存在
- `GAME_IN_PROGRESS` — 游戏进行中，新玩家不能加入
- `ROOM_FULL` — 房间已满（10 人）
