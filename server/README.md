# nightwolf-server — 服务端权威游戏服务

不是消息中继，是游戏本身。发牌、夜晚结算、计票、判胜负都在这里跑，客户端只负责渲染和上报意图。

## 为什么是服务端权威

狼人杀是隐藏信息博弈，"谁能看到什么"本身就是游戏规则的一部分。上一版把游戏引擎放在房主浏览器里，服务端只做广播，结果是：

- `host_state`（含所有人的身份牌、底牌）广播给了房间里每个人
- `private_state`（某人的身份）同样广播，靠客户端自觉过滤
- 三个 `update_*` 消息不校验发送者，任何玩家都能覆盖整局状态

前端过滤不是访问控制 —— 数据到了对方机器上，打开 F12 就能看见。所以引擎必须搬到服务端，由服务端按每个连接的权限投影下发。

## 可见性模型

| 数据 | 下发方式 |
|---|---|
| `publicState`（阶段、玩家列表、倒计时） | 广播，不含任何身份信息 |
| `privateState`（自己的牌、夜晚操作请求与结果） | **单播**给本人 |
| 机密（所有人身份、底牌、夜晚日志、票型） | **永不下发**，只存在于服务端内存 |
| `resultData`（最终身份、票型、胜负） | 结算时随 publicState 公开 —— 这是规则要求的揭示 |

房主没有特权视图：他和其他人收到的是同一种投影。

## 本地开发

```bash
bun install
cp .env.example .env    # 填入 ADMIN_USERNAME / ADMIN_PASSWORD
bun run dev             # Bun 自动加载 .env，--watch 热重载
```

默认监听 `ws://localhost:9000`。前端在仓库根 `.env.local` 配 `VITE_WS_URL=ws://localhost:9000`。

Bun 原生执行 TypeScript，没有构建步骤。游戏引擎从 `../shared/engine` 直接 import，与前端共用同一份代码。

## 协议

所有消息形如 `{ type, data }`，类型定义在 [`shared/protocol.ts`](../shared/protocol.ts)，前后端共用。

**上行一律不带 playerId** —— 身份由连接确定，避免冒充他人投票或提交操作。

### Client → Server

| type | data | 说明 |
|---|---|---|
| `admin_auth` | `{ username, password }` | 换取 token，密码仅此一次上行 |
| `create_room` | `{ requestId, token, hostId, settings }` | 需要有效 token |
| `join_room` | `{ roomId, player }` | 不需要凭证，任何人可加入 |
| `leave_room` | `{ roomId }` | |
| `player_action` | `{ roomId, action }` | 确认身份 / 夜晚操作 / 投票 / 改名 |
| `host_command` | `{ roomId, command }` | 开始游戏 / 改设置 / 结束讨论 / 再来一局 / 解散 |
| `ping` | `{}` | |

### Server → Client

| type | data |
|---|---|
| `admin_token` | `{ token, expiresAt }` |
| `room_created` | `{ requestId, roomId }` |
| `public_state` | `{ state }` |
| `private_state` | `{ state }` — 只含收件人自己那份 |
| `room_deleted` | `{ roomId }` |
| `error` | `{ code, message, requestId? }` |
| `pong` | `{}` |

错误码：`INVALID_ARGUMENT` `UNAUTHORIZED` `RATE_LIMITED` `ROOM_NOT_FOUND` `GAME_IN_PROGRESS` `ROOM_FULL`

## 管理员认证

密码只存在于服务端环境变量。客户端输入 → 服务端校验 → 签发 HMAC token（30 天）。

token 是**无状态签名**而非服务端存储的随机串，因为存内存的话每次部署重启就全失效了，30 天有效期名存实亡。代价是无法撤销单个 token —— 要全部失效就改 `TOKEN_SECRET` 或改密码。

连续 5 次失败会按来源 IP 锁定 1 分钟。

## 语音播报

服务端切换阶段/步骤时下发一个新的 `narrationCueId`，各客户端据此本地播报（真人录音，缺失时回退 TTS）。播报与倒计时**并行**：`phaseEndsAt` 在步骤开始时就已设定，服务端不等待任何回执。行动时间下限 20 秒，足够盖过最长的睁眼台词。

## 部署约束

**必须单实例。** 房间状态在进程内存里，多副本会让玩家被路由到不认识这个房间的实例。

**重启中断所有对局。** 部署前查 `GET /health` 的 `activeRooms`。

详见 [`deploy/README.md`](../deploy/README.md)。
