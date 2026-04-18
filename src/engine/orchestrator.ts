/**
 * Host 端游戏流程编排。
 *
 * 所有函数都是**纯函数**：输入旧 state → 输出新 state。
 * 实际的广播副作用由 `useHostOrchestrator` hook 或
 * `orchestrateStartGame` 等 thin wrapper 调用 `GameSyncService` 完成。
 */

import type {
  ActionStatus,
  GamePhase,
  HostGameState,
  PlayerPublicInfo,
  PrivatePlayerState,
  PublicRoomState,
  Role,
  RoomSettings,
} from "@/types"
import { dealRoles } from "./dealRoles"

// ============================================================
// 开始游戏：校验 + 发牌 + 构建初始 state
// ============================================================

export interface StartGameResult {
  publicState: PublicRoomState
  hostState: HostGameState
  privateStates: Record<string, PrivatePlayerState>
}

export class StartGameError extends Error {
  readonly code:
    | "NOT_HOST"
    | "BAD_PHASE"
    | "NOT_ENOUGH_PLAYERS"
    | "ROLE_COUNT_MISMATCH"

  constructor(
    message: string,
    code:
      | "NOT_HOST"
      | "BAD_PHASE"
      | "NOT_ENOUGH_PLAYERS"
      | "ROLE_COUNT_MISMATCH",
  ) {
    super(message)
    this.name = "StartGameError"
    this.code = code
  }
}

/**
 * 把房间从 waiting 推进到 dealing。
 *
 * 前提条件：
 *   - 调用方是 Host（上层判断）
 *   - gamePhase === "waiting"
 *   - players.length >= 3
 *   - settings.roles.length === players.length + 3
 */
export function buildStartGameStates(
  currentPublic: PublicRoomState,
): StartGameResult {
  if (currentPublic.gamePhase !== "waiting") {
    throw new StartGameError(
      `当前阶段 ${currentPublic.gamePhase}，无法开始游戏`,
      "BAD_PHASE",
    )
  }
  const players = currentPublic.players
  if (players.length < 3) {
    throw new StartGameError(
      `至少需要 3 名玩家，当前 ${players.length} 人`,
      "NOT_ENOUGH_PLAYERS",
    )
  }
  const roles = currentPublic.settings.roles
  if (roles.length !== players.length + 3) {
    throw new StartGameError(
      `角色数 ${roles.length} 不等于 玩家数 ${players.length} + 3`,
      "ROLE_COUNT_MISMATCH",
    )
  }

  // 发牌
  const { playerRoles, centerCards } = dealRoles(
    players.map((p) => p.playerId),
    roles,
  )

  const now = new Date().toISOString()

  // 公共状态：进入 dealing，60s 后自动推进
  const publicState: PublicRoomState = {
    ...currentPublic,
    gamePhase: "dealing",
    phaseStartedAt: now,
    phaseEndsAt: new Date(Date.now() + DEALING_TIMEOUT_MS).toISOString(),
    currentNightStep: null,
    submittedPlayerIds: [],
    resultData: null,
    isPaused: false,
    pauseRemainingSeconds: null,
  }

  // Host 权威状态
  const hostState: HostGameState = {
    allPlayerRoles: { ...playerRoles },
    originalRoles: { ...playerRoles },
    centerCards: [...centerCards],
    nightActions: [],
    nightStepIndex: 0,
    playerActionStatus: Object.fromEntries(
      players.map((p) => [p.playerId, "pending" as ActionStatus]),
    ),
    votes: [],
  }

  // 每个玩家的私有状态
  const privateStates: Record<string, PrivatePlayerState> = {}
  for (const p of players) {
    const role = playerRoles[p.playerId]
    privateStates[p.playerId] = {
      playerId: p.playerId,
      originalRole: role,
      currentRole: role,
      nightActionRequest: null,
      nightActionResult: null,
    }
  }

  return { publicState, hostState, privateStates }
}

/** 发牌阶段默认 60s 超时（PRD §4.2） */
export const DEALING_TIMEOUT_MS = 60 * 1000

// ============================================================
// 玩家确认身份（dealing 阶段）
// ============================================================

export interface ConfirmIdentityResult {
  publicState: PublicRoomState
  /** 若所有玩家都已确认，下一步应该推进到 night（true 时，上层调 advanceToNight） */
  allConfirmed: boolean
}

/**
 * 玩家点击"已确认身份"。
 * 副作用：更新 submittedPlayerIds。
 * 如果所有在线玩家都已 confirmed，返回 allConfirmed=true 让上层触发 advanceToNight。
 */
export function handleConfirmIdentity(
  currentPublic: PublicRoomState,
  playerId: string,
): ConfirmIdentityResult {
  if (currentPublic.gamePhase !== "dealing") {
    return { publicState: currentPublic, allConfirmed: false }
  }
  if (currentPublic.submittedPlayerIds.includes(playerId)) {
    // 已提交过，幂等
    return {
      publicState: currentPublic,
      allConfirmed: isAllConfirmed(currentPublic),
    }
  }

  const nextSubmitted = [...currentPublic.submittedPlayerIds, playerId]
  const nextPublic: PublicRoomState = {
    ...currentPublic,
    submittedPlayerIds: nextSubmitted,
  }
  return {
    publicState: nextPublic,
    allConfirmed: isAllConfirmedWith(nextPublic, nextSubmitted),
  }
}

function isAllConfirmed(state: PublicRoomState): boolean {
  return isAllConfirmedWith(state, state.submittedPlayerIds)
}

function isAllConfirmedWith(
  state: PublicRoomState,
  submitted: string[],
): boolean {
  const online = state.players.filter((p) => p.isConnected)
  return online.every((p) => submitted.includes(p.playerId))
}

// ============================================================
// 再来一局（result → waiting）
// ============================================================

/**
 * 重置为 waiting 阶段，保留房间和玩家，清除游戏数据。
 */
export function buildPlayAgainStates(
  currentPublic: PublicRoomState,
): { publicState: PublicRoomState } {
  const nextPublic: PublicRoomState = {
    ...currentPublic,
    gamePhase: "waiting",
    phaseStartedAt: new Date().toISOString(),
    phaseEndsAt: null,
    currentNightStep: null,
    submittedPlayerIds: [],
    resultData: null,
    isPaused: false,
    pauseRemainingSeconds: null,
  }
  return { publicState: nextPublic }
}

// ============================================================
// 阶段切换工具函数（保留给后续扩展使用）
// ============================================================

export function markPhase(
  state: PublicRoomState,
  phase: GamePhase,
  durationSeconds?: number,
): PublicRoomState {
  return {
    ...state,
    gamePhase: phase,
    phaseStartedAt: new Date().toISOString(),
    phaseEndsAt: durationSeconds
      ? new Date(Date.now() + durationSeconds * 1000).toISOString()
      : null,
  }
}

// ============================================================
// 配置校验（Lobby 阶段）
// ============================================================

export interface LobbyValidation {
  canStart: boolean
  reason?: string
}

export function validateLobbyStart(
  players: PlayerPublicInfo[],
  settings: RoomSettings,
): LobbyValidation {
  if (players.length < 3) return { canStart: false, reason: "至少需要 3 名玩家" }
  if (players.length > 10) return { canStart: false, reason: "最多 10 名玩家" }
  const required = players.length + 3
  if (settings.roles.length !== required) {
    return {
      canStart: false,
      reason: `需要选择 ${required} 张角色牌（当前 ${settings.roles.length} 张）`,
    }
  }
  return { canStart: true }
}

/** 按 Role 统计当前选择数量 */
export function countRoles(roles: Role[]): Record<Role, number> {
  const counts = {} as Record<Role, number>
  for (const r of roles) counts[r] = (counts[r] ?? 0) + 1
  return counts
}
