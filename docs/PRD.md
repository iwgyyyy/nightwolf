# 一夜狼人杀 Web 版 PRD

> 本文档是产品需求与开发思路说明，不是实现计划。用于统一产品认知、技术选型与交互规范。

---

## 1. 项目概述

**一夜狼人杀（One Night Ultimate Werewolf）** 的 Web 版实现，面向朋友间线上开黑场景。玩家通过浏览器打开链接即可加入房间，无需安装 App、无需注册登录。语音讨论使用外部工具（微信 / FaceTime / Discord 等），本产品只负责游戏状态同步与流程推进。

### 1.1 产品定位

- **受众**：朋友/同事之间 3-10 人的 party 游戏场景
- **核心价值**：发个链接就能玩，跨设备（手机 / PC / 微信内置浏览器）
- **信任模型**：朋友间游玩，不防客户端作弊
- **不做的事**：历史对局记录、排位、匹配、账号系统、内置语音

### 1.2 为什么从 iOS 迁移到 Web

1. **降低参与门槛**：分享链接 > 下载 App
2. **跨平台**：手机 / PC / 微信浏览器原生支持
3. **免审核**：无需 App Store，迭代更快
4. **国内体验**：配合 CloudBase 部署，延迟可控

---

## 2. 技术栈

| 层面 | 方案 | 说明 |
|------|------|------|
| 构建工具 | **Vite 8** | 纯 SPA，HMR 极快，产出静态文件 |
| 框架 | **React 19** | 配合 React Compiler 自动优化 |
| 语言 | **TypeScript** | 类型安全 |
| 运行时 / 包管理 | **Bun** | 已通过 `bun.lock` 锁定 |
| 路由 | **React Router** | 首页 / 房间页 / 游戏页 |
| 状态管理 | **Zustand** | 轻量，适合实时同步场景（待引入） |
| 样式 | **Tailwind CSS + shadcn/ui** | 快速搭建 UI（待引入） |
| 动画 | **Framer Motion + CSS 3D Transform** | 卡牌翻面、换牌飞行、呼吸动画 |
| 实时通信 | **原生 WebSocket API** | 封装为 React Hook |
| 语音播报 | **Web Speech API (`SpeechSynthesis`)** | 替代 iOS 的 `AVSpeechSynthesizer` |
| 防屏幕休眠 | **Screen Wake Lock API** | 游戏进行中保持屏幕常亮 |
| 打包形态 | **PWA**（可选后期） | 支持添加到桌面 / 主屏 |
| 图标 / 头像 | **Identicon 算法** | 玩家名称 → 对称像素头像 |
| 后端（实时同步） | **CloudBase HTTP Function + WebSocket Relay（Node.js + ws）** | 房间状态存内存，游戏结束即清除 |
| 部署 | **CloudBase 静态托管（前端）+ CloudBase 云函数（后端）** | 国内低延迟 |

### 2.1 为什么是 Vite 而不是 Next.js

- 游戏本质是**纯客户端状态 + WebSocket 驱动**，SSR/SSG/SEO 零收益
- 路由极简，不需要 file-based routing
- 部署链路：静态文件直接扔 CDN，一行命令
- Next.js 的核心卖点（SSR、API Routes、ISR、Edge Runtime）在本项目**一个都用不上**

### 2.2 为什么是 Framer Motion 而不是 PixiJS / Three.js

- 游戏交互本质是**卡牌翻面 + 玩家列表 + 倒计时 + 投票**，属于 UI 组件 + 轻动画
- Framer Motion + CSS 3D 覆盖 95% 场景
- 预留 **Lottie** 接入点（后期需要华丽效果，例如闭眼动画、胜负特效时再接入）
- Three.js 仅在需要"3D 牌桌视角"时才值得，MVP 阶段不做

---

## 3. 角色体系

### 3.1 基础包角色（10 个）

| 夜晚顺序 | 角色 | 英文 | 阵营 | 最大数量 | 夜晚操作 |
|-----------|------|------|------|----------|----------|
| - | 村民 | Villager | 村民 | 3 | 无 |
| - | 猎人 | Hunter | 村民 | 1 | 无（被投出时带走投票目标） |
| - | 皮匠 | Tanner | 独立 | 1 | 无（目标是让自己被投出） |
| 1 | 狼人 | Werewolf | 狼人 | 2 | 狼人互相确认；独狼可查看一张桌面牌 |
| 2 | 爪牙 | Minion | 狼人 | 1 | 查看谁是狼人（狼人不知道谁是爪牙） |
| 3 | 预言家 | Seer | 村民 | 1 | 查看一名玩家的身份 或 查看两张桌面牌 |
| 4 | 强盗 | Robber | 村民 | 1 | 与一名玩家交换身份牌，并查看换来的新牌 |
| 5 | 捣蛋鬼 | Troublemaker | 村民 | 1 | 交换两名其他玩家的身份牌（不看牌） |
| 6 | 酒鬼 | Drunk | 村民 | 1 | 将自己的牌与一张桌面牌交换（不看新牌） |
| 7 | 失眠者 | Insomniac | 村民 | 1 | 查看自己当前的身份牌（确认是否被换过） |

### 3.2 阵营

- **狼人阵营**：狼人、爪牙
- **村民阵营**：村民、猎人、预言家、强盗、捣蛋鬼、酒鬼、失眠者
- **独立阵营**：皮匠

---

## 4. 游戏流程状态机

```
房间配置 (waiting) → 发牌 (dealing) → 夜晚 (night) → 白天讨论 (day) → 投票 (voting) → 结算 (result)
```

### 4.1 房间配置（waiting）

**Host 操作：**
- 创建房间，系统生成房间 ID（6 位大写字母+数字，排除易混字符 `0/O/1/I/L`）
- 选择本局角色牌（手动勾选）
- 配置时间：讨论（3/5/8 分钟或自定义）、夜晚操作（默认 30s）、投票（默认 30s）
- 等待阶段可随时修改

**约束：**
- **角色总数必须 = 玩家数 + 3**
- 不满足时"开始游戏"按钮置灰，UI 实时显示当前/需要的角色数

**玩家操作：**
- 通过房间 ID 加入
- 随时修改自己的名称（直到游戏开始锁定）
- 头像根据名称自动生成（Identicon 算法）：SHA256 → 5x5 对称像素网格 → 前景色由 hash 前几字节决定（HSL 色相），背景浅灰

**开始条件：**
- 角色总数 = 玩家数 + 3 → Host 可点击"开始游戏"
- 游戏开始后锁定所有玩家名称和头像

### 4.2 发牌（dealing）

- 系统随机分配角色牌给每个玩家 + 3 张桌面牌
- 每个玩家只看到自己的初始身份
- 确认后标记为已确认
- **超时处理**：发牌后 60s 内未确认，自动视为已确认，游戏继续

### 4.3 夜晚阶段（night）

按固定顺序依次唤醒本局存在的角色（不存在的跳过）：

**唤醒顺序：狼人 → 爪牙 → 预言家 → 强盗 → 捣蛋鬼 → 酒鬼 → 失眠者**

每个角色操作时：
- 被唤醒玩家看到操作界面
- 其他玩家看到"等待中"界面
- 倒计时（`actionTime`，默认 30s）
- 玩家可点击"已完成"提前结束
- 超时视为放弃（记录为 `timedOut`）

**各角色操作细节：**

- **狼人**：多狼互认；独狼可选择查看 1 张桌面牌或跳过
- **爪牙**：展示所有狼人身份；若本局无狼人，提示"本局没有狼人"
- **预言家**：二选一 → 查看 1 名玩家身份 / 查看 2 张桌面牌（3 选 2）
- **强盗**：选择 1 名玩家交换身份，查看换来的新牌
- **捣蛋鬼**：选择 2 名玩家交换他们的牌（自己不看）
- **酒鬼**：选择 1 张桌面牌与自己交换（不看新牌）
- **失眠者**：展示自己当前身份牌（可能已被交换）

### 4.4 白天讨论（day）

- 倒计时开始（Host 设定的讨论时间）
- 玩家通过外部语音工具讨论
- Host 可"提前结束讨论"进入投票
- 倒计时结束自动进入投票

### 4.5 投票（voting）

- 所有玩家同时选择投票目标或弃票
- 倒计时（`voteTime`，默认 30s），超时视为弃票
- 所有人提交后（或倒计时结束）同时揭晓

### 4.6 结算（result）

**出局判定：**
1. 票数最多的玩家出局（平票则均出局）
2. 全弃票或完全平票则无人出局
3. 猎人被投票出局时，其投票目标也一起出局（猎人弃票则不带走任何人）

**胜负判定优先级（从高到低）：**

| 优先级 | 条件 | 结果 |
|--------|------|------|
| 1 | 被投出者中有皮匠（包括被猎人带走的情况） | 皮匠单独赢，其他所有人都输 |
| 2 | 被投出者中有狼人 | 村民阵营赢 |
| 3 | 有人被投出但没有狼人被投出 | 狼人阵营赢 |
| 4 | 无人被投出，场上有狼人 | 狼人阵营赢 |
| 5 | 无人被投出，场上没有狼人（都在桌面牌里） | 村民阵营赢 |

> "场上有狼人"指玩家的**最终身份牌**（经夜晚交换后），非初始身份牌。
> 爪牙属于狼人阵营，狼人赢时爪牙也赢；但爪牙被投出不算"狼人被投出"。

**结算展示顺序：**
1. 公布投票结果（谁投了谁、谁弃票、谁出局）
2. 翻开所有玩家的最终身份牌
3. 公布胜负结果
4. 夜晚操作日志回放（详细版）：
   - 按顺序展示每一步
   - 格式：`玩家名（当时身份）执行了什么操作`
   - 有身份变化时显示变化详情
   - 超时者：`玩家名（身份）操作超时，未执行任何效果`
   - 示例：`玩家1（强盗）将 玩家2（狼人）的牌抢夺过来，玩家1 变为狼人，玩家2 变为强盗`

**结算后：**
- Host 可"再来一局"（保留房间和玩家，清除游戏数据回到 waiting）
- Host 可"解散房间"（删除所有数据，玩家退回首页）

---

## 5. 数据模型

数据按可见性分三层：**公共（所有人可见）/ 私有（仅本人可见）/ Host 权威（仅 Host 可见）**。

### 5.1 Role

```ts
type Role =
  | 'werewolf' | 'minion' | 'seer' | 'robber'
  | 'troublemaker' | 'drunk' | 'insomniac'
  | 'hunter' | 'tanner' | 'villager';

interface RoleMeta {
  team: 'werewolf' | 'villager' | 'independent';
  nightOrder: number | null;  // null = 无夜晚操作
  maxCount: number;
  displayName: string;  // 中文名，用于 TTS
}
```

### 5.2 PublicRoomState（公共房间状态）

所有玩家可读，Host 可写。

```ts
type GamePhase = 'waiting' | 'dealing' | 'night' | 'day' | 'voting' | 'result';

interface RoomSettings {
  roles: Role[];
  discussionTime: number;  // 分钟
  actionTime: number;      // 秒，默认 30
  voteTime: number;        // 秒，默认 30
}

interface PlayerPublicInfo {
  playerId: string;
  name: string;            // 头像由名称自动生成，无需存储
  isConnected: boolean;
}

interface PublicRoomState {
  roomId: string;
  hostId: string;
  gamePhase: GamePhase;
  settings: RoomSettings;
  players: PlayerPublicInfo[];
  currentNightStep: number | null;      // 当前夜晚唤醒到第几步
  phaseStartedAt: string;               // ISO 8601
  phaseEndsAt: string | null;           // 倒计时用
  isPaused: boolean;                    // Host 断线时为 true
  pauseRemainingSeconds: number | null; // 暂停时剩余秒数
  submittedPlayerIds: string[];         // 当前阶段已提交玩家
  resultData: ResultData | null;        // 结算阶段写入
}

interface ResultData {
  votes: Vote[];
  eliminatedPlayerIds: string[];
  finalRoles: Record<string, Role>;
  centerCards: Role[];
  nightActions: NightAction[];
  winner: 'villagerWin' | 'werewolfWin' | 'tannerWin';
}

interface Vote {
  voterId: string;
  targetId: string | null;  // null = 弃票
}
```

### 5.3 PrivatePlayerState（玩家私有状态）

仅对应玩家可读，Host 可写。

```ts
interface PrivatePlayerState {
  playerId: string;
  originalRole: Role;
  currentRole: Role;
  nightActionRequest: NightActionRequest | null;
  nightActionResult: NightActionResult | null;
}
```

**NightActionRequest**（按角色分类，确保 UI 能精准渲染）：

```ts
type NightActionRequest =
  | { kind: 'minionView'; werewolfPlayers: string[] }
  | { kind: 'werewolfConfirm'; otherWerewolves: string[] }
  | { kind: 'loneWerewolf'; centerCardIndices: number[]; canSkip: true }
  | { kind: 'seerChoice'; playerTargets: string[]; centerCardIndices: number[] }
  | { kind: 'robberSwap'; playerTargets: string[] }
  | { kind: 'troublemakerSwap'; playerTargets: string[] }
  | { kind: 'drunkSwap'; centerCardIndices: number[] }
  | { kind: 'insomniacView' };
```

**NightActionSubmission**（玩家提交）：

```ts
type NightActionSubmission =
  | { kind: 'minionConfirm' }
  | { kind: 'werewolfConfirm' }
  | { kind: 'loneWerewolfView'; centerIndex: number }
  | { kind: 'loneWerewolfSkip' }
  | { kind: 'seerViewPlayer'; playerId: string }
  | { kind: 'seerViewCenter'; indices: [number, number] }
  | { kind: 'robberSwap'; targetId: string }
  | { kind: 'troublemakerSwap'; targetIds: [string, string] }
  | { kind: 'drunkSwap'; centerIndex: number }
  | { kind: 'insomniacConfirm' };
```

**NightActionResult**（操作后反馈）：

```ts
type NightActionResult =
  | { kind: 'rolesRevealed'; roles: Record<string, Role> }
  | { kind: 'swapResult'; newRole: Role }
  | { kind: 'noResult' };
```

### 5.4 HostGameState（Host 权威状态）

仅 Host 可读写，是游戏状态的唯一权威数据源。

```ts
type ActionStatus = 'pending' | 'completed' | 'timedOut';

interface HostGameState {
  allPlayerRoles: Record<string, Role>;       // 所有玩家当前身份
  centerCards: Role[];                         // 3 张桌面牌
  nightActions: NightAction[];                 // 完整夜晚操作日志
  nightStepIndex: number;                      // 当前夜晚进行到第几步
  playerActionStatus: Record<string, ActionStatus>;
}
```

### 5.5 NightAction（夜晚操作日志）

```ts
type ActionType =
  | 'viewWerewolves'    // 爪牙查看狼人
  | 'werewolfConfirm'   // 狼人互相确认
  | 'viewOneCenter'     // 独狼查看一张桌面牌
  | 'viewOnePlayer'     // 预言家查看一名玩家
  | 'viewTwoCenter'     // 预言家查看两张桌面牌
  | 'swapWithPlayer'    // 强盗与玩家交换
  | 'swapTwoPlayers'    // 捣蛋鬼交换两名玩家
  | 'swapWithCenter'    // 酒鬼与桌面牌交换
  | 'viewSelf';         // 失眠者查看自己

interface CardChange {
  targetId: string;           // playerId 或 center_0/1/2
  fromRole: Role;
  toRole: Role;
}

interface NightAction {
  order: number;
  actorId: string;
  actorRole: Role;
  actionType: ActionType;
  status: ActionStatus;
  selectedTargets: string[];
  revealedRoles?: Record<string, Role>;
  cardChanges?: CardChange[];
}
```

> 不在本局中的角色直接跳过，不生成 NightAction 记录。回放时也不展示。

### 5.6 PlayerAction（玩家提交的操作）

```ts
type PlayerAction =
  | { kind: 'confirmIdentity' }
  | { kind: 'nightAction'; submission: NightActionSubmission }
  | { kind: 'vote'; targetId: string | null }
  | { kind: 'updateProfile'; name: string };
```

---

## 6. 网络架构

### 6.1 抽象接口

所有网络通信通过 `GameSyncService` 接口，游戏逻辑不直接依赖 WebSocket 或任何 SDK。

```ts
interface GameSyncService {
  // 房间管理
  createRoom(hostId: string, settings: RoomSettings): Promise<string>;
  joinRoom(roomId: string, player: PlayerPublicInfo): Promise<void>;
  leaveRoom(roomId: string, playerId: string): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;

  // 公共状态
  updatePublicState(roomId: string, state: PublicRoomState): Promise<void>;
  onPublicStateChanged(roomId: string, callback: (state: PublicRoomState) => void): void;

  // 玩家私有状态
  updatePrivateState(roomId: string, playerId: string, state: PrivatePlayerState): Promise<void>;
  onPrivateStateChanged(roomId: string, playerId: string, callback: (state: PrivatePlayerState) => void): void;

  // Host 权威状态
  updateHostState(roomId: string, state: HostGameState): Promise<void>;
  onHostStateChanged(roomId: string, callback: (state: HostGameState) => void): void;

  // 玩家操作提交
  submitAction(roomId: string, playerId: string, action: PlayerAction): Promise<void>;
  onActionReceived(roomId: string, callback: (playerId: string, action: PlayerAction) => void): void;
}
```

预期实现：
- `WebSocketSyncService` — 生产环境，连接 CloudBase relay
- `InMemorySyncService` — 本地开发/单元测试

### 6.2 数据流向

```
玩家操作 → submitAction → Host 端处理 → 更新 HostGameState
                                       → 更新 PublicRoomState
                                       → 更新 PrivatePlayerState（目标玩家）
                                       ↓
                              所有玩家通过监听回调收到更新 → React 重新渲染
```

**关键约束：Host 是唯一的状态写入者**（除了玩家通过 submitAction 提交的输入），保证状态一致性。

### 6.3 WebSocket 消息协议

所有消息为 JSON：`{ "type": "<type>", "data": { ... } }`

**Client → Server：**

| type | data |
|------|------|
| `create_room` | `{ requestId, hostId, settings }` |
| `join_room` | `{ roomId, player }` |
| `leave_room` | `{ roomId, playerId }` |
| `delete_room` | `{ roomId }` |
| `update_public_state` | `{ roomId, state }` |
| `update_private_state` | `{ roomId, playerId, state }` |
| `update_host_state` | `{ roomId, state }` |
| `submit_action` | `{ roomId, playerId, action }` |
| `ping` | `{}` |

**Server → Client：**

| type | data |
|------|------|
| `room_created` | `{ requestId, roomId }` |
| `public_state` | `{ state }` |
| `private_state` | `{ playerId, state }` |
| `host_state` | `{ state }` |
| `player_action` | `{ playerId, action }` |
| `room_deleted` | `{ roomId }` |
| `error` | `{ message }` |
| `pong` | `{}` |

### 6.4 CloudBase 后端实现

- **形态**：CloudBase HTTP Function，协议类型 `WS`
- **运行时**：Node.js + `ws` 库
- **状态存储**：服务器内存（`Map<roomId, Room>`），游戏结束即清除
- **广播策略**：所有 `update_*` 消息包含发送者自身（与 Supabase `receiveOwnBroadcasts` 行为一致）
- **心跳**：服务端每 30s ping，客户端每 30s 发送 `ping`，防止网关超时断连
- **部署约束**：
  - **单实例**（`MinNum: 1, MaxNum: 1`），因为房间状态在内存中，无法水平扩展
  - 超时设置为最大值（若 HTTP Function 超时不足，考虑改用 **CloudRun**）

### 6.5 关键技术细节

1. **Date 序列化**：两端通过 ISO 8601 字符串传递
   - 服务端输出去毫秒格式：`2026-04-17T12:00:00Z`
   - 客户端用自定义 parser 同时支持带/不带毫秒两种格式

2. **请求-响应配对**：`createRoom` 用 `requestId` 关联 pending Promise，避免并发 `createRoom` 竞态

3. **Host 断线检测**：
   - 服务端 `ws.on('close')` 检测到 Host 断连 → 自动设置 `isPaused: true` 并广播
   - Host 重连（`join_room`）时自动取消暂停

4. **客户端重连**：指数退避（2^n 秒，上限 30s），最多 10 次；重连成功后自动重新发送 `join_room`

5. **缓存策略**：客户端缓存最新的 `public/private/host` state，新注册的回调立即用缓存回调一次，避免 UI 空态

---

## 7. 语音播报（Host 端）

### 7.1 产品需求

游戏阶段切换时播报（如"天黑请闭眼""狼人请睁眼"），增强沉浸感，模拟真人主持人。

**关键约束：语音仅在 Host 设备上播放**（Host 外放，其他玩家通过真人语音工具听到）。

### 7.2 技术方案

| iOS 原方案 | Web 新方案 |
|---|---|
| `AVSpeechSynthesizer` + `AVAudioSession` | `window.speechSynthesis` + `SpeechSynthesisUtterance` |
| `AVSpeechSynthesisVoice(language: "zh-CN")` | `utterance.lang = 'zh-CN'` |
| `AVAudioSession.Category.playback` | 无需特殊配置（浏览器自动处理） |
| Swift `async/await` + `CheckedContinuation` | `Promise` 包装 `onend` / `onerror` |

### 7.3 NarrationService 接口

```ts
interface NarrationService {
  speak(text: string): Promise<void>;  // 等待播报完成
  stop(): void;                         // 立即打断
  isSpeaking: boolean;
}
```

实现：
- `WebSpeechNarrationService` — 生产实现
- `MockNarrationService` — 测试用，记录 `spokenTexts` 数组

### 7.4 语音文本清单

**夜晚阶段：**

| 时机 | 语音文本 | 触发条件 |
|------|---------|----------|
| 夜晚开始 | "天黑请闭眼" | 进入 `.night` |
| 角色唤醒 | "{角色名}请睁眼" | `nightStep` 推进 |
| 角色结束 | "{角色名}请闭眼" | 步骤完成 |

**其他阶段：**

| 时机 | 语音文本 | 触发条件 |
|------|---------|----------|
| 天亮 | "天亮了，所有人请睁眼，开始讨论" | 进入 `.day` |
| 投票 | "讨论结束，请投票" | 进入 `.voting` |
| 结算 | "投票结束" | 进入 `.result` |

**补充规则：**
- 不在本局中的角色**不播报**（如本局无爪牙，不播"爪牙请睁眼/闭眼"）
- "请闭眼"在该角色操作完成后、下一个角色唤醒前播放
- 固定中文（`zh-CN`），语速 0.9-1.0（Web Speech 默认 1.0，略慢一点更清晰）

### 7.5 集成时机

在 `GameViewModel` / `useGameState` 的阶段切换逻辑中：

```
await narrate('天黑请闭眼');
await sleep(1000);
await narrate('狼人请睁眼');
// 播完后才设置 phaseEndsAt，开始操作倒计时
setPublicState({ ..., phaseEndsAt: Date.now() + actionTime * 1000 });
```

### 7.6 风险与兜底

1. **浏览器自动播放策略**：`speechSynthesis` 需要**用户手势**触发首次播放。解决方案：首页"创建房间"按钮点击时预热 TTS（播一段空白 utterance）
2. **后台 tab 暂停**：浏览器切换到后台 tab 时可能暂停 TTS。解决方案：`speak()` 加 10s 超时兜底，超时自动 resolve，防止整个夜晚流程卡死
3. **iOS Safari 特殊行为**：需要实测，必要时切换声音 preload 策略
4. **浏览器语音质量差异**：Chrome/Edge 的中文 TTS 较好，Safari 一般，Firefox 较差；允许用户选择系统 voice 作为后期优化

---

## 8. 界面结构

| 路由 | 组件 | 功能 |
|------|------|------|
| `/` | `HomePage` | 设置名称 / 创建房间 / 输入房间 ID 加入 |
| `/room/:roomId` | `LobbyPage` | 玩家列表 + Host 配置角色和时间 + 开始按钮 |
| `/room/:roomId/game` | `GamePage` | 发牌 / 夜晚 / 白天 / 投票 / 结算（内部子状态切换） |

**游戏页内部状态：**

1. **DealingScreen** — 展示自己的初始身份牌，点击确认（60s 超时自动确认）
2. **NightScreen** — 被唤醒时显示操作界面 / 未唤醒时显示"等待中" / 顶部倒计时
3. **DayScreen** — 倒计时显示 + Host 的"提前结束"按钮
4. **VotingScreen** — 选择投票目标或弃票 + 倒计时
5. **ResultScreen** — 投票结果 + 翻牌 + 胜负 + 夜晚回放 + "再来一局 / 解散房间"

**浮层/模态：**
- **HostOfflineOverlay** — Host 离线时全屏遮罩，提示等待重连
- **ConnectionLostToast** — 自己断网时顶部提示

---

## 9. 交互与动画方案

### 9.1 轻度动画原则

MVP 阶段只做关键视觉反馈，后续可拓展。

| 场景 | 实现 |
|------|------|
| **卡牌翻面**（看牌/翻开身份） | CSS `transform: rotateY(180deg)` + `backface-visibility: hidden` + Framer Motion 控制时机 |
| **换牌飞行**（强盗/捣蛋鬼/酒鬼） | `motion.div` + `animate={{ x, y }}` + 贝塞尔曲线 `transition`，两张牌同时沿弧线交换位置 |
| **围桌布局** | 三角函数计算 n 个玩家在圆上的坐标，`motion.div` 过渡位置 |
| **睁眼闭眼状态** | 玩家卡片整体变暗 + 透明度 0.4 + 轻微呼吸动画（`scale: [1, 1.02, 1]` 循环） |
| **倒计时** | 环形进度条（SVG `stroke-dasharray`） + 最后 5s 变红脉冲 |
| **阶段切换** | 全屏黑色 mask 渐入渐出 + 阶段标题淡入 |
| **投票揭晓** | 票数逐个从 0 计数到最终值 + 出局玩家红色脉冲 |
| **翻牌结算** | 依次翻开（错开 200ms），狼人牌红色光晕，皮匠金色光晕 |

### 9.2 后期可升级（非 MVP）

- **Lottie 资产**：闭眼动画、胜负爆炸特效、角色登场过场
- **PixiJS**：仅当需要胜负场景的粒子效果时引入
- **Three.js**：仅当做"3D 牌桌视角"升级时引入

### 9.3 响应式与移动端

- 首要目标是**手机竖屏 + 微信内置浏览器**
- 平板 / PC 横屏作为次要适配
- 使用 Tailwind 的响应式断点 + `env(safe-area-inset-*)` 适配刘海屏
- **Screen Wake Lock API**：进入游戏页自动申请，离开释放，防止玩家等待期间屏幕锁定

### 9.4 Identicon 头像算法

玩家头像由名称自动生成，无需手动上传：

```
1. name → SHA-256 hash
2. 取 hash 的前若干比特 → 5x5 对称网格（左侧 3 列生成，右侧 2 列镜像）
3. 取 hash 末尾 3 字节 → HSL 色相（饱和度/亮度固定）
4. 背景固定浅灰 (#f3f4f6)
```

名称变更时头像自动更新，无需额外操作。

---

## 10. 断线与异常处理

### 10.1 Host 断线 / 离开

- Host 是状态权威源，Host 离开时**整局游戏暂停**
- 所有玩家显示"Host 已离线，等待重连..."全屏遮罩
- Host 凭本地 UUID（localStorage）重新进入页面后自动恢复
- 不做 Host 迁移（朋友间游玩场景，Host 会回来）
- **暂停实现**：
  - Host 断线时服务端自动设置 `publicState.isPaused = true`，记录 `pauseRemainingSeconds`
  - Host 重连时取消暂停，用 `pauseRemainingSeconds` 恢复倒计时

### 10.2 普通玩家断线 / 离开

- **等待阶段**：标记为 `isConnected: false`，Host 可选择继续等待或踢出
- **游戏进行中（dealing/night/day/voting）**：
  - 玩家标记离线，游戏继续
  - 夜晚操作超时自动跳过
  - 投票超时视为弃票
  - 玩家重连后恢复到当前阶段

### 10.3 掉线重连

- 玩家凭本地 UUID（localStorage）重新加入同一房间
- 重连后从服务器同步当前状态
- 如果还在本玩家操作倒计时内，可继续操作

### 10.4 客户端 UUID 持久化

- 首次打开页面生成 UUID 存入 `localStorage`
- 后续所有操作都带该 UUID 作为 `playerId`
- 清除浏览器数据 = 失去当前身份，需要重新加入

---

## 11. 信息安全（信任模式）

- 每个玩家只能读取自己的 `PrivatePlayerState`
- 其他玩家的身份牌、夜晚操作对自己不可见
- 服务端 relay 在转发 `private_state` 时，**只广播给目标玩家**（而非全房间）
- 结算阶段由 Host 将完整数据写入 `publicState.resultData`，所有人可见
- **不防客户端破解**（信任模式，朋友间游玩）：前端理论上可通过 DevTools 查看 WebSocket 消息，但目标用户不会这样做

---

## 12. 生命周期与部署

### 12.1 游戏生命周期

- 游戏进行中：服务端内存保存状态
- 结算阶段：数据保留，供结算界面展示
- Host 操作：
  - "再来一局" → 清除游戏数据，保留房间和玩家，回到 waiting
  - "解散房间" → 服务端删除房间，所有玩家退回首页
- **不记录历史对局，不做数据持久化**
- 玩家 UUID 存 `localStorage`，浏览器不清数据则身份不变

### 12.2 部署方案

| 资源 | 方案 |
|------|------|
| 前端静态文件 | CloudBase 静态托管（免费额度够用） |
| WebSocket 后端 | CloudBase 云函数（HTTP Function + WS 协议） or CloudRun（若超时限制不满足） |
| 域名 | CloudBase 默认域名 或 自定义域名 |
| HTTPS | CloudBase 自动签发 |
| 监控 | CloudBase 控制台日志 |

**部署流程：**
1. `bun run build` → 产出 `dist/`
2. CloudBase CLI 上传 `dist/` 到静态托管
3. 部署云函数 `ws-relay`
4. 前端 `CloudBaseConfig.ts` 配置 `wss://{envId}.api.tcloudbasegateway.com/v1/functions/ws-relay`

---

## 13. 与 iOS 版本的差异对照

| 项 | iOS 原方案 | Web 新方案 |
|---|---|---|
| UI 框架 | SwiftUI | React 19 + Tailwind |
| 架构模式 | MVVM | Hooks + Zustand |
| 网络同步 | Supabase Realtime → CloudBase WS | CloudBase WS（直接上） |
| 语音 TTS | AVSpeechSynthesizer | Web Speech API |
| 头像生成 | Identicon（本地算法） | Identicon（TypeScript 重写） |
| 身份持久化 | UserDefaults | localStorage |
| 状态存储 | 内存 + Supabase | 内存 + CloudBase 服务端内存 |
| 动画 | SwiftUI 原生 | Framer Motion + CSS 3D |
| 防屏幕休眠 | iOS 原生 | Screen Wake Lock API |
| 部署 | App Store | CloudBase 静态托管 |

**数据模型、游戏规则、状态机、角色体系完全一致**，仅改变实现载体。

---

## 14. 开发优先级（非计划，只是思路）

优先级由高到低：

1. **核心数据模型 + 类型定义**（types + Zod schema 校验）
2. **GameSyncService 抽象接口 + InMemorySyncService**（本地可跑单机测试）
3. **UI 静态页面 + 路由**（首页/大厅/游戏页的 shell）
4. **游戏流程核心逻辑**（角色分配、夜晚操作处理、胜负判定）—— 可先本地单机全流程跑通
5. **WebSocket 层**（WSMessage 协议 + WebSocketConnection + WebSocketSyncService）
6. **CloudBase 后端**（relay server）+ 部署
7. **语音播报**
8. **动画与视觉打磨**
9. **边界情况**（断线重连、Host 迁移、异常处理）
10. **PWA + Wake Lock + 移动端适配**

---

## 附录：角色夜晚操作备忘

```
狼人（Werewolf）—— 多狼
  请求：展示 otherWerewolves 列表
  提交：werewolfConfirm
  效果：无

狼人（Werewolf）—— 独狼
  请求：可选 centerCardIndices: [0,1,2]，canSkip: true
  提交：loneWerewolfView(centerIndex) 或 loneWerewolfSkip
  效果：查看桌面牌（不改变）

爪牙（Minion）
  请求：展示 werewolfPlayers 列表（可能为空）
  提交：minionConfirm
  效果：无

预言家（Seer）
  请求：playerTargets + centerCardIndices（二选一）
  提交：seerViewPlayer(playerId) 或 seerViewCenter([i,j])
  效果：revealedRoles

强盗（Robber）
  请求：playerTargets
  提交：robberSwap(targetId)
  效果：交换 + newRole 反馈

捣蛋鬼（Troublemaker）
  请求：playerTargets（选 2 个）
  提交：troublemakerSwap([id1, id2])
  效果：交换（不看）

酒鬼（Drunk）
  请求：centerCardIndices（选 1 个）
  提交：drunkSwap(centerIndex)
  效果：与桌面牌交换（不看）

失眠者（Insomniac）
  请求：insomniacView
  提交：insomniacConfirm
  效果：展示 currentRole
```

---

*本文档定义了一夜狼人杀 Web 版的产品需求与技术方向。具体实现计划拆分到 `docs/plans/` 下按 task 推进。*
