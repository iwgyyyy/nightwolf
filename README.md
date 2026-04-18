# 一夜狼人杀 · Web 版

月夜村落主题的多人 Web 狼人杀。分享一个链接就能和朋友开黑，桌面/手机/微信浏览器通用。

> 🌐 [English README](docs/README.en.md)

![tech stack](https://img.shields.io/badge/Vite-8-646cff) ![tech stack](https://img.shields.io/badge/React-19-61dafb) ![tech stack](https://img.shields.io/badge/TypeScript-6-3178c6) ![tech stack](https://img.shields.io/badge/Tailwind-4-06b6d4)

> [!IMPORTANT]
> **玩家之间的语音交流请自备第三方工具**（微信语音通话、Discord、QQ、腾讯会议等）。本项目只负责游戏状态同步和规则引擎，**不内置语音聊天**，白天讨论阶段需要你们自己开语音。
>
> 游戏内置的"天黑请闭眼 / 狼人请睁眼"引导语使用浏览器原生 Web Speech API 本地播报，在 **iOS 微信内置浏览器、部分未装中文 TTS 的 Android 机型、设备静音**时可能无声——这是浏览器限制，不影响游戏流程（顶部角色文字 + 圆桌指示照常引导）。

## 功能亮点

- **完整的一夜狼人杀规则**：狼人、爪牙、预言家、强盗、捣蛋鬼、酒鬼、失眠者、猎人、皮匠、村民共 10 种角色
- **沉浸式圆桌**：夜晚所有玩家围坐圆桌，闭眼时漂浮动画 + 遮罩；换牌/看牌全程动画
- **语音播报**：所有设备本地播放 "{角色}请睁眼/闭眼" 引导语，基于 Web Speech API
- **管理员房间**：创建房间需凭证；分享链接一键加入
- **跨设备同步**：WebSocket relay 保证状态一致，断线自动重连 + 暂停/恢复
- **响应式**：桌面和手机两套布局，圆桌尺寸和交互自适应
- **PWA**：可"添加到主屏"

## 技术栈

| 层次 | 技术 |
|------|------|
| 构建 | Vite 8 + Bun |
| UI | React 19（开启 React Compiler）+ Tailwind CSS v4 + shadcn/ui |
| 状态 | Zustand + Immer + use-immer |
| 动画 | Framer Motion + CSS 3D transform |
| 路由 | React Router v7（SPA 模式）|
| 表单 | react-hook-form + zod + Field |
| 同步 | WebSocket（生产） / BroadcastChannel（同浏览器多 tab 开发）|
| 后端 | Node.js + ws，部署为 CloudBase HTTP Function |
| 测试 | Vitest（92 个单元测试覆盖 engine 和 sync）|

## 快速开始

### 前端

```bash
# 安装依赖
bun install

# 复制环境变量模板并填入管理员凭证
cp .env.example .env.local
# 编辑 .env.local：VITE_ADMIN_USERNAME / VITE_ADMIN_PASSWORD
# 如果要联调 WebSocket，取消注释并填入 VITE_WS_URL

# 启动 dev server（监听所有网卡，局域网内手机可直接访问）
bun run dev
```

默认 `http://localhost:5173`，启动时终端会打印局域网地址（如 `http://192.168.x.x:5173`）供手机访问。

若 `.env.local` 没有设 `VITE_WS_URL`，会自动使用 `InMemorySyncService`（同浏览器多 tab 互相通信，适合单机开发）。

### 后端（WebSocket relay）

在另一个终端启动：

```bash
cd cloudbase/cloudfunctions/ws-relay
npm install
cp .env.example .env
# 编辑 .env：ADMIN_USERNAME / ADMIN_PASSWORD 要和前端保持一致
npm run dev
```

监听 `ws://localhost:9000`。前端 `.env.local` 设置 `VITE_WS_URL=ws://localhost:9000`（代码会自动把 hostname 替换成访问页面的 host，所以手机端无需改配置）。

### 多人测试

- 同浏览器：开多个**匿名窗口**访问 dev server，各窗口独立 `playerId`
- 跨设备：手机连同一 WiFi 扫码或打开终端打印的 `http://192.168.x.x:5173`
- macOS 防火墙首次会弹框请求允许 Node/Bun 接受入站，点"允许"

## 项目结构

```
src/
├── engine/              # 纯函数游戏引擎（可单测）
│   ├── dealRoles.ts     # 发牌
│   ├── nightOrder.ts    # 夜晚唤醒顺序
│   ├── nightActions.ts  # 各角色操作处理
│   ├── voting.ts        # 投票 / 出局计算
│   ├── winJudge.ts      # 胜负判定
│   └── orchestrator.ts  # 游戏开始 / 再来一局
├── sync/                # 同步层
│   ├── GameSyncService.ts    # 抽象接口
│   ├── InMemorySyncService.ts # 开发用
│   ├── WebSocketSyncService.ts # 生产
│   └── WebSocketConnection.ts  # 心跳 + 重连
├── stores/              # Zustand stores
├── hooks/               # 自定义 hooks
├── services/            # TTS / Identicon / 房间 ID
├── routes/              # 路由页面
│   ├── home/
│   ├── lobby/
│   └── game/
│       └── components/  # 五个阶段子屏
├── components/
│   ├── game/            # 自研业务组件（Card、PlayerTable、CardSwap 等）
│   ├── ui/              # shadcn/ui 原语
│   └── icons/
└── types/

cloudbase/
└── cloudfunctions/
    └── ws-relay/        # WebSocket 中继后端

public/
├── manifest.webmanifest
├── icon.svg
├── icon-192.png
└── icon-512.png
```

## 游戏流程

```
Waiting → Dealing → Night (n 步) → Day → Voting → Result → Waiting（再来一局）
```

- **夜晚唤醒**基于初始身份（originalRoles），每个配置到池中的角色都会被念到（即使没人抽到，保持节奏一致防止信息泄露）
- **结算翻牌**基于最终身份（allPlayerRoles，经历所有夜晚换牌后的状态）
- **Host 断线**：后端自动设 `isPaused=true`，所有客户端显示暂停遮罩；Host 重连自动恢复
- **Host 刷新**：重新 mount 时根据 `phaseEndsAt` 恢复对应阶段定时器

## 常用命令

```bash
bun run dev       # 启动 dev server
bun run lint      # ESLint 检查
bun run test      # 运行 Vitest
bun run build     # 生产构建
bun run preview   # 预览生产构建
```

## 部署

- **前端**：`bun run build`，把 `dist/` 上传到 CloudBase 静态托管（或 Vercel、Netlify 等）
- **后端**：见 `cloudbase/cloudfunctions/ws-relay/README.md`，部署为 CloudBase HTTP Function（WS 协议，单实例）
- 生产环境记得在 `.env.production` 或部署平台配置 `VITE_WS_URL=wss://...`，以及 ws-relay 的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 环境变量

## 文档

- [`docs/PRD.md`](docs/PRD.md) — 产品需求 / 游戏规则 / 网络协议
- [`docs/plans/`](docs/plans/) — 实现阶段笔记
- [`cloudbase/cloudfunctions/ws-relay/README.md`](cloudbase/cloudfunctions/ws-relay/README.md) — 后端协议和部署

## License

个人项目。
