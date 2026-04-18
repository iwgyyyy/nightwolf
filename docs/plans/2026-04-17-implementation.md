# 一夜狼人杀 Web 版 — 实现计划

> 日期：2026-04-17
> 关联文档：[PRD](../PRD.md)

## Context

**为什么要这个计划：** 项目 `nightwolf-web` 是 Vite 8 + React 19 + Tailwind 4 + shadcn 的干净脚手架，仅有 `button` 一个 shadcn 组件，`App.tsx` 为空。PRD 已完成（`docs/PRD.md`），明确了游戏规则、数据模型、网络协议、动画策略、状态管理策略。现在需要一份结构化的实现计划，指导从零开始搭建一个可玩的 Web 多人狼人杀。

**已确认的关键决策：**
- 视觉风格：**月夜村落 Moonlit Village**（夜蓝底 + 烛光金 + 羊皮纸）
- 路由：**React Router v7**
- 实现顺序：**WebSocket 优先**（先把后端 relay + 客户端 sync 层跑通，再做 UI）

**预期成果：** 一个可以在浏览器分享链接开黑的 Web 版一夜狼人杀，支持手机/PC/微信浏览器，部署在 CloudBase。

---

## 视觉设计方案（Moonlit Village）

### 配色（oklch + CSS vars，替换 `src/index.css` 默认调色板）

```css
/* 核心色板 */
--night-900: oklch(0.14 0.04 265)   /* 深夜靛青，主背景 */
--night-800: oklch(0.20 0.04 265)   /* 卡牌外壳、面板背景 */
--night-700: oklch(0.28 0.04 265)   /* 分隔线、次级背景 */
--parchment: oklch(0.93 0.04 85)    /* 羊皮纸卡面 */
--parchment-dim: oklch(0.82 0.05 85)/* 卡背/禁用态 */
--candle-500: oklch(0.78 0.13 75)   /* 烛光金，主 accent */
--candle-400: oklch(0.85 0.12 78)   /* 高亮态 */
--candle-600: oklch(0.65 0.13 70)   /* 按下态 */
--blood-500: oklch(0.58 0.17 25)    /* 狼人/出局 */
--sage-500: oklch(0.62 0.08 145)    /* 村民阵营提示 */
--moon-100: oklch(0.97 0.01 260)    /* 月光白，纯文本 */
--ink-900: oklch(0.20 0.02 40)      /* 羊皮纸上的墨色文字 */
```

**映射到 shadcn 变量：**
- `--background` → `--night-900`
- `--foreground` → `--moon-100`
- `--card` → `--night-800`（玩家座位、面板）；羊皮纸卡牌自定义 `.card-parchment` 工具类
- `--primary` → `--candle-500`
- `--destructive` → `--blood-500`
- `--accent` → `--candle-500`
- `--border` → `oklch(1 0 0 / 8%)`（半透明白）

深色为默认态（游戏主色），不做亮色切换（夜晚主题不需要）。

### 字体

| 用途 | 字体 | 载入方式 |
|------|------|----------|
| 英文 Display（标题、角色名） | **Fraunces Variable** | `bun add @fontsource-variable/fraunces` |
| 英文 Body（UI 文本、按钮） | **Geist Variable**（已装） | 已载入 |
| 中文 Display（标题、角色名） | **LXGW WenKai 霞鹜文楷** | `bun add lxgw-wenkai-screen-webfont` |
| 中文 Body | 系统中文字体栈（回退） | CSS font-family 声明 |

在 `@theme inline` 中追加：
```css
--font-display: 'Fraunces Variable', 'LXGW WenKai Screen', serif;
--font-sans: 'Geist Variable', 'LXGW WenKai Screen', system-ui, sans-serif;
```

### 视觉细节

- **卡牌**：圆角 `12px`，羊皮纸 bg + 淡淡噪点纹理，边缘细微阴影
- **玩家座位**：圆形头像（Identicon）+ 下方名字标签，未在线时降到 `opacity: 0.4` + 灰度
- **夜晚等待态**：整体叠一层靛青遮罩 + 月亮图标漂浮（淡入淡出呼吸）
- **倒计时环**：SVG stroke-dasharray，烛光金，最后 5s 变红脉冲
- **噪点/颗粒**：全局 `body::after` 叠一层极淡的 grain 纹理
- **装饰元素**：页眉月相图标，首页大标题拆字散落效果

---

## 架构总览

### 分层

```
┌──────────────────────────────────────────────────────┐
│  Views (React Components + Framer Motion)            │
│    - routes/* + components/game/*                     │
│    - 只订阅 store，不直接调用 network                  │
├──────────────────────────────────────────────────────┤
│  State (Zustand + immer middleware)                  │
│    - gameStore: public/private/host + connection      │
│    - uiStore: 本地 UI 态                              │
├──────────────────────────────────────────────────────┤
│  Game Engine (纯函数 TS 模块)                         │
│    - 发牌、夜晚操作处理、胜负判定                       │
│    - Host 端逻辑，输入 state → 输出 new state          │
├──────────────────────────────────────────────────────┤
│  Sync Layer (GameSyncService 接口)                   │
│    - WebSocketSyncService (生产)                     │
│    - InMemorySyncService (开发/测试)                  │
├──────────────────────────────────────────────────────┤
│  Transport (WSConnection + Message Protocol)         │
│    - 连接管理、心跳、重连、编解码                       │
└──────────────────────────────────────────────────────┘
```

### 目录结构

```
nightwolf-web/
├── cloudbase/
│   └── cloudfunctions/
│       └── ws-relay/
│           ├── index.js         # Node.js + ws 中继
│           ├── package.json
│           └── scf_bootstrap
├── docs/
│   ├── PRD.md                    # 需求文档
│   └── plans/                    # 各阶段实现计划
├── src/
│   ├── main.tsx
│   ├── App.tsx                   # 路由树
│   ├── index.css                 # 全局主题 + @utility
│   ├── routes/                   # 路由页面
│   │   ├── home/
│   │   ├── lobby/
│   │   └── game/
│   ├── components/
│   │   ├── ui/                   # shadcn 原语
│   │   ├── game/                 # 自研游戏业务组件
│   │   └── icons/                # 自定义 SVG
│   ├── engine/                   # 纯函数游戏引擎
│   ├── sync/                     # 网络同步层
│   ├── stores/                   # Zustand stores
│   ├── services/                 # TTS / WakeLock / Identicon
│   ├── hooks/                    # 自定义 hooks
│   ├── types/                    # TypeScript 类型
│   ├── config/                   # 环境配置
│   └── lib/                      # cn() 等工具
└── package.json
```

---

## 分阶段实现顺序（WebSocket 优先）

### Phase 0 — 基础配置
- 应用 Moonlit Village 主题（改 `src/index.css`）
- 装字体包：`@fontsource-variable/fraunces`、`lxgw-wenkai-screen-webfont`
- 装核心依赖：`react-router` v7、`zustand`、`immer`、`use-immer`、`framer-motion`、`dayjs`、`uuid`、`es-toolkit`
- 装 shadcn 基础组件：`dialog`、`input`、`label`、`checkbox`、`slider`、`select`、`sonner`、`tooltip`、`field`、`sheet`、`alert-dialog`
- 修正 `src/App.tsx` 路由树
- 主题视觉 smoke test

### Phase 1 — 核心类型 + 游戏引擎（纯函数，可单测）
- `types/role.ts`、`state.ts`、`action.ts`
- `engine/nightOrder.ts`：`[werewolf, minion, seer, robber, troublemaker, drunk, insomniac]`
- `engine/dealRoles.ts`：打乱角色池，分配给玩家 + 3 张桌面牌
- `engine/nightActions.ts`：按 `NightActionSubmission` 计算新 `HostGameState`
- `engine/voting.ts`：投票计数 + 出局（含猎人带走）
- `engine/winJudge.ts`：PRD §4.6 五级胜负判定

验证：每个引擎模块写 `.test.ts`（Vitest），覆盖典型流程。

### Phase 2 — GameSyncService 抽象 + InMemory 实现
- 定义 `GameSyncService` 协议
- `InMemorySyncService`：用 `BroadcastChannel` 在同浏览器多 tab 间广播
- `MockClock` 让测试控制时间

### Phase 3 — Zustand store + 流程编排
- `gameStore`：`publicState`/`privateState`/`hostState`/`playerId`/`connectionStatus`
- `useGameSync(roomId)`：订阅 sync service → 写 store
- **Host 端引擎协调**：监听 `onActionReceived` → 调用 engine → 广播新状态
- `use-local-player.ts`：localStorage UUID

### Phase 4 — UI 基础原语 + 游戏组件骨架
- `Card`（翻面 + 羊皮纸材质）
- `PlayerSeat`、`PlayerTable`（环形布局）
- `CountdownRing`（SVG 进度环）
- `RoleBadge`、`PhaseTransition`
- `/debug` 路由展示静态 gallery

### Phase 5 — Home / Lobby / Game 页面骨架
- `HomePage`：名字 + 创建/加入（react-hook-form + zod）
- `LobbyPage`：玩家列表 + 角色勾选 + 时间配置（`useImmer` 本地 draft）
- `GamePage`：按 `gamePhase` 分派到五个子屏

### Phase 6 — 五个子屏 + NightActionPanel 分发
- Dealing / Night（按角色分子面板）/ Day / Voting / Result
- 夜晚回放日志逐条展示

### Phase 7 — WebSocket 传输层 + CloudBase 后端
- 后端：Node.js + ws relay（PRD §6.3 协议），`requestId` 机制、Host 断线检测
- 客户端 `WSMessage`、`WebSocketConnection`、`WebSocketSyncService`
- 本地联调：`node ws-relay/index.js` + `VITE_WS_URL=ws://localhost:9000`
- 部署 CloudBase HTTP Function

### Phase 8 — 语音播报 + Wake Lock
- `WebSpeechNarrationService`（Promise 包装）
- Host 端 phase 切换 effect 中串行 `await narrate(...)`
- `use-wake-lock.ts`

### Phase 9 — 动画/视觉打磨
- 卡牌翻面、换牌飞行、阶段过场、结算翻牌、胜负光晕

### Phase 10 — 边界与收尾
- Host 断线暂停 UI、重连恢复、移动端适配、PWA、部署

---

## 关键文件改动清单

### 新建

| 路径 | 职责 |
|------|------|
| `src/types/role.ts` `state.ts` `action.ts` `index.ts` | 共享类型 |
| `src/engine/*.ts` | 纯函数游戏引擎（5 个模块） |
| `src/sync/GameSyncService.ts` | 抽象接口 |
| `src/sync/InMemorySyncService.ts` | 开发实现 |
| `src/sync/WSMessage.ts` | 协议编解码 |
| `src/sync/WebSocketConnection.ts` | 连接管理 |
| `src/sync/WebSocketSyncService.ts` | WS 实现 |
| `src/stores/gameStore.ts` | Zustand + immer store |
| `src/stores/uiStore.ts` | UI 本地态 |
| `src/services/NarrationService.ts` | TTS |
| `src/services/WakeLockService.ts` | 屏幕唤醒 |
| `src/services/identicon.ts` | 头像算法 |
| `src/hooks/use-*.ts` | 自定义 hooks |
| `src/routes/**/*.tsx` | 路由页面 |
| `src/components/game/*.tsx` | 游戏业务组件 |
| `src/components/icons/*.tsx` | 自定义 SVG 图标 |
| `src/config/cloudbase.ts` | 环境配置 |
| `cloudbase/cloudfunctions/ws-relay/*` | 后端 relay |

### 修改

| 路径 | 改动 |
|------|------|
| `src/index.css` | Moonlit Village 主题变量 + `@utility` 工具类 |
| `src/App.tsx` | 装配 React Router 路由树 |
| `package.json` | 追加依赖 |

---

## 可复用现有资产

- `src/lib/utils.ts::cn()` — 所有组件样式拼接都用它
- `src/components/ui/button.tsx` — 已安装，全站 Button 入口
- Tailwind v4 `@theme inline` — 已配置，替换颜色变量即可
- React Compiler 已接入 — 不需要手动 memo 普通组件

---

## 验证方案

### 单元测试（Phase 1/2 必做）
- `engine/dealRoles.test.ts`：角色数 = 玩家数 + 3，桌面牌恰好 3 张
- `engine/nightActions.test.ts`：各角色操作前后的 role 映射正确
- `engine/winJudge.test.ts`：五种胜负优先级各一 case
- `engine/voting.test.ts`：平票、全弃票、猎人带走目标

### 端到端手工验证（Phase 5+）
- 开 2 个浏览器 tab，InMemory + BroadcastChannel
- 完整流程：创建 → 加入 → 配置 → 发牌 → 夜晚 → 讨论 → 投票 → 结算 → 再来一局
- 验证私有信息不泄漏

### WebSocket 联调（Phase 7）
- 本地起 relay + 前端指向本地 URL
- 断网模拟验证指数退避重连

### 部署验证（Phase 10）
- iOS Safari、Android Chrome、微信浏览器真机测试
- wake lock、TTS、WebSocket 全平台跑通

---

## 风险与开放问题

1. **微信浏览器 TTS 兼容性**：iOS 微信内 `speechSynthesis` 可能静音，退化为无语音兜底
2. **CloudBase HTTP Function 长连接超时**：若 < 1h，转 CloudRun 或客户端主动周期重连
3. **shadcn `radix-nova` 风格**与 Moonlit Village 兼容：可能部分组件需要重写样式
4. **React Compiler 与 Zustand selector**：观察是否过度重渲染
