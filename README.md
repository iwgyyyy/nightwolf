# 一夜狼人杀 · Web 版

月夜村落主题的多人 Web 狼人杀。分享一个链接就能和朋友开黑，桌面/手机/微信浏览器通用。

> 🌐 [English README](docs/README.en.md)

![tech stack](https://img.shields.io/badge/Vite-8-646cff) ![tech stack](https://img.shields.io/badge/React-19-61dafb) ![tech stack](https://img.shields.io/badge/TypeScript-6-3178c6) ![tech stack](https://img.shields.io/badge/three.js-r185-000000) ![tech stack](https://img.shields.io/badge/Tailwind-4-06b6d4)

> [!NOTE]
> 房间语音已内置（自建 LiveKit SFU）：进房自动建连，白天自由讨论、天黑强制静音，无需微信/Discord 等第三方语音。
>
> "天黑请闭眼 / 狼人请睁眼"引导语为真人录音（缺失时回退浏览器 TTS），在 iOS 微信内置浏览器、设备静音等场景可能无声——不影响游戏流程（顶部角色文字照常引导）。

## 功能亮点

- **完整的一夜狼人杀规则**：狼人、爪牙、预言家、强盗、捣蛋鬼、酒鬼、失眠者、猎人、皮匠、村民共 10 种角色
- **3D 圆桌场景**：three.js 实时渲染的夜晚村落桌面，看牌/换牌/翻牌全程 3D 动画
- **内置房间语音**：LiveKit SFU 架构（10 人房无压力），阶段联动——天黑自动禁麦、天亮自动开麦；名签实时显示讲话声波/闭麦角标
- **语音播报**：真人录音的 "{角色}请睁眼/闭眼" 引导语，服务端下发 cue、各端本地播放
- **服务端权威**：发牌、夜晚结算、计票全在服务端，客户端只收得到自己有权看的投影，F12 也偷不到牌
- **管理员房间**：创建房间需凭证（服务端校验 + HMAC token）；分享链接一键加入
- **断线恢复**：WebSocket 自动重连，Host 断线全房暂停、重连恢复
- **响应式 + PWA**：桌面和手机两套布局，可"添加到主屏"

## 技术栈

| 层次 | 技术 |
|------|------|
| 构建 | Vite 8 + Bun |
| UI | React 19（开启 React Compiler）+ Tailwind CSS v4 + shadcn/ui |
| 3D | three.js + @react-three/fiber + drei |
| 状态 | Zustand + Immer |
| 动画 | Motion（Framer Motion）+ R3F 帧循环 |
| 路由 | React Router v7（SPA 模式）|
| 语音 | LiveKit（自建 SFU）+ coturn（UDP 受限网络兜底）|
| 同步 | WebSocket，服务端权威投影下发 |
| 后端 | Bun 原生 TS，Docker 单容器部署，Caddy 终止 TLS |
| 测试 | Vitest（覆盖游戏引擎与同步层）|

## 快速开始

### 后端（先起）

```bash
cd server
bun install
cp .env.example .env    # 填入 ADMIN_USERNAME / ADMIN_PASSWORD
bun run dev             # ws://localhost:9000
```

### 前端

```bash
bun install
cp .env.example .env.local   # VITE_WS_URL=/api，经 vite 代理转到 localhost:9000
bun run dev
```

默认 `http://localhost:5173`，启动时终端会打印局域网地址（如 `http://192.168.x.x:5173`）供手机访问。

> 本地开发不配 `LIVEKIT_*` 时，房间语音显示"暂不可用"，游戏流程不受影响；要联调语音见 [`deploy/README.md`](deploy/README.md) 的 LiveKit 一节。

### 多人测试

- 同浏览器：开多个**匿名窗口**访问 dev server，各窗口独立 `playerId`
- 跨设备：手机连同一 WiFi 打开终端打印的 `http://192.168.x.x:5173`（注意语音需要 HTTPS 上下文，局域网 IP 访问时语音不可用）
- macOS 防火墙首次会弹框请求允许 Bun 接受入站，点"允许"

## 项目结构

```
shared/                  # 前后端共用
├── engine/              # 纯函数游戏引擎（发牌/夜晚/投票/胜负，可单测）
├── protocol.ts          # WebSocket 消息协议
└── types/

server/                  # 服务端权威游戏服务（Bun）
└── src/
    ├── index.ts         # Bun.serve + 消息分发
    ├── room.ts          # 房间存储与按连接投影下发
    ├── game.ts          # 对局流程驱动
    ├── auth.ts          # 管理员 HMAC token + 限速
    └── voice.ts         # LiveKit 语音凭证签发

src/                     # 前端
├── scene/               # three.js 3D 场景（圆桌、卡牌、座位名签）
├── services/            # VoiceService（LiveKit）/ NarrationService（播报）等
├── sync/                # WebSocket 客户端（心跳 + 重连）
├── stores/              # Zustand stores
├── hooks/
├── routes/              # home / lobby / game
└── components/          # 业务组件 + shadcn/ui 原语

deploy/                  # 部署编排源（Caddyfile、docker-compose、LiveKit/coturn 配置样例）
```

## 游戏流程

```
Waiting → Dealing → Night (n 步) → Day → Voting → Result → Waiting（再来一局）
```

- **夜晚唤醒**基于初始身份（originalRoles），每个配置到池中的角色都会被念到（即使没人抽到，保持节奏一致防止信息泄露）
- **结算翻牌**基于最终身份（allPlayerRoles，经历所有夜晚换牌后的状态）
- **语音阶段规则**：天黑全员强制禁麦并锁定，天亮解锁并自动开麦
- **Host 断线**：服务端自动设 `isPaused=true`，所有客户端显示暂停遮罩；Host 重连自动恢复

## 常用命令

```bash
bun run dev       # 启动 dev server
bun run lint      # ESLint 检查
bun run test      # 运行 Vitest
bun run build     # 生产构建（tsc -b + vite build）
bun run preview   # 预览生产构建
```

## 部署

单服务器自托管：Caddy 终止 TLS，`/` 出前端静态资源，`/api` 反代游戏服务（Docker），`/livekit` 反代语音 SFU 信令；push main 触发 GitHub Actions 构建并 rsync 部署。完整步骤见 [`deploy/README.md`](deploy/README.md)。

**约束**：游戏服务必须单实例（房间状态在进程内存），重启会中断进行中的对局。

## 文档

- [`docs/PRD.md`](docs/PRD.md) — 产品需求 / 游戏规则 / 网络协议
- [`docs/plans/`](docs/plans/) — 实现阶段笔记
- [`server/README.md`](server/README.md) — 服务端架构、可见性模型与协议
- [`deploy/README.md`](deploy/README.md) — 服务器部署（Caddy / Docker / LiveKit / coturn / CI）

## License

个人项目。
