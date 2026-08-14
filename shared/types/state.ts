import type { Role } from "./role"
import type { NightActionRequest, NightActionResult } from "./action"

export type GamePhase =
  | "waiting"
  | "dealing"
  | "night"
  | "day"
  | "voting"
  | "result"

export type ActionStatus = "pending" | "completed" | "timedOut"

export type WinResult = "villagerWin" | "werewolfWin" | "tannerWin"

// ============================================================
// 房间设置
// ============================================================

export interface RoomSettings {
  /** 本局选定的角色列表（长度必须 = 玩家数 + 3） */
  roles: Role[]
  /** 讨论时间，单位：分钟 */
  discussionTime: number
  /** 夜晚操作时间，单位：秒（默认 30） */
  actionTime: number
  /** 投票时间，单位：秒（默认 30） */
  voteTime: number
}

// ============================================================
// 玩家公开信息
// ============================================================

export interface PlayerPublicInfo {
  playerId: string
  name: string
  isConnected: boolean
  /** 对局中主动退出（与掉线区分显示）；重新加入时由服务端覆盖清除 */
  hasQuit?: boolean
}

// ============================================================
// 投票记录
// ============================================================

export interface Vote {
  voterId: string
  /** null 表示弃票 */
  targetId: string | null
}

// ============================================================
// 夜晚操作日志（用于结算回放）
// ============================================================

export type ActionType =
  | "viewWerewolves" // 爪牙查看狼人
  | "werewolfConfirm" // 狼人互相确认
  | "viewOneCenter" // 独狼查看一张桌面牌
  | "viewOnePlayer" // 预言家查看一名玩家
  | "viewTwoCenter" // 预言家查看两张桌面牌
  | "swapWithPlayer" // 强盗与玩家交换
  | "swapTwoPlayers" // 捣蛋鬼交换两名玩家
  | "swapWithCenter" // 酒鬼与桌面牌交换
  | "viewSelf" // 失眠者查看自己

export interface CardChange {
  /** playerId 或 "center_0"/"center_1"/"center_2" */
  targetId: string
  fromRole: Role
  toRole: Role
}

export interface NightAction {
  order: number
  actorId: string
  actorRole: Role
  actionType: ActionType
  status: ActionStatus
  selectedTargets: string[]
  revealedRoles?: Record<string, Role>
  cardChanges?: CardChange[]
}

// ============================================================
// 结算数据
// ============================================================

export interface ResultData {
  votes: Vote[]
  eliminatedPlayerIds: string[]
  /** 所有玩家最终身份 { playerId: Role } */
  finalRoles: Record<string, Role>
  /** 桌面 3 张牌的最终身份 */
  centerCards: Role[]
  nightActions: NightAction[]
  winner: WinResult
}

// ============================================================
// 公共房间状态（所有玩家可读，Host 可写）
// ============================================================

export interface PublicRoomState {
  roomId: string
  hostId: string
  gamePhase: GamePhase
  settings: RoomSettings
  players: PlayerPublicInfo[]
  /** 当前夜晚唤醒到第几步（从 0 开始，null 表示不在夜晚阶段） */
  currentNightStep: number | null
  /** 当前阶段开始时间（ISO 8601） */
  phaseStartedAt: string
  /**
   * 当前阶段结束时间（倒计时用，ISO 8601）。
   * null 表示"尚未开始计时"——服务端正在等各端语音播报完成。
   */
  phaseEndsAt: string | null
  /**
   * 语音播报对齐标识。每次进入需要播报的新阶段/步骤时由服务端换新值，
   * 客户端播完后回 narration_ack 带上它；服务端等齐才设 phaseEndsAt 开始倒计时。
   */
  narrationCueId: string | null
  /** 当前阶段已提交操作的玩家 ID */
  submittedPlayerIds: string[]
  /** 结算阶段写入 */
  resultData: ResultData | null
}

// ============================================================
// 玩家私有状态（仅对应玩家可读）
// ============================================================

export interface PrivatePlayerState {
  playerId: string
  originalRole: Role
  currentRole: Role
  nightActionRequest: NightActionRequest | null
  nightActionResult: NightActionResult | null
}

// ============================================================
// Host 权威状态（仅 Host 可读写）
// ============================================================

export interface HostGameState {
  /** 所有玩家当前身份（会被强盗/捣蛋鬼/酒鬼修改） */
  allPlayerRoles: Record<string, Role>
  /** 所有玩家**初始**身份（决定夜晚唤醒顺序，永不修改） */
  originalRoles: Record<string, Role>
  /** 3 张桌面牌（会被酒鬼修改） */
  centerCards: Role[]
  /**
   * 发牌时的**初始**桌面牌（永不修改）。
   * 夜晚步骤列表必须基于初始牌池（originalRoles + 初始底牌）计算：
   * 若用被酒鬼换过的 centerCards，步骤会缩短/错位——既吞掉排序靠后
   * 角色（如失眠者）的行动，也从"步骤消失"泄露酒鬼摸走了哪张牌。
   */
  initialCenterCards: Role[]
  /** 完整夜晚操作日志 */
  nightActions: NightAction[]
  /** 当前夜晚进行到第几步（buildNightSteps 的下标） */
  nightStepIndex: number
  /** 各玩家本阶段操作状态 */
  playerActionStatus: Record<string, ActionStatus>
  /** 投票阶段累积的投票（隐私：不进入 publicState） */
  votes: Vote[]
}
