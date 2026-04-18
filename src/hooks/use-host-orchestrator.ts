import { useEffect } from "react"
import { toast } from "sonner"
import { getSyncService } from "@/sync"
import { useGameStore } from "@/stores/gameStore"
import {
  buildPlayAgainStates,
  buildStartGameStates,
  handleConfirmIdentity,
  markPhase,
  StartGameError,
} from "@/engine/orchestrator"
import { applyNightAction, applyTimeoutAction } from "@/engine/nightActions"
import {
  buildNightActionRequest,
  getActorsForStep,
  nightStepsFor,
} from "@/engine/nightSteps"
import { computeEliminated } from "@/engine/voting"
import { judgeWin } from "@/engine/winJudge"
import { getNarrationService } from "@/services/NarrationService"
import type {
  ActionType,
  HostGameState,
  NightAction,
  PlayerAction,
  PrivatePlayerState,
  PublicRoomState,
  ResultData,
  Role,
  Vote,
} from "@/types"

// 夜晚步骤 / 白天讨论 / 投票的定时推进。模块级单例：整个应用只会有一个 Host。
let nightStepTimer: ReturnType<typeof setTimeout> | null = null
let dayTimer: ReturnType<typeof setTimeout> | null = null
let voteTimer: ReturnType<typeof setTimeout> | null = null

function clearNightStepTimer(): void {
  if (nightStepTimer) {
    clearTimeout(nightStepTimer)
    nightStepTimer = null
  }
}

function clearDayTimer(): void {
  if (dayTimer) {
    clearTimeout(dayTimer)
    dayTimer = null
  }
}

function clearVoteTimer(): void {
  if (voteTimer) {
    clearTimeout(voteTimer)
    voteTimer = null
  }
}

function clearAllPhaseTimers(): void {
  clearNightStepTimer()
  clearDayTimer()
  clearVoteTimer()
}

/** 步骤超时推进时，为未提交 actor 生成的 NightAction.actionType 默认值 */
const TIMEOUT_ACTION_TYPE: Record<Role, ActionType | null> = {
  werewolf: "werewolfConfirm",
  minion: "viewWerewolves",
  seer: "viewOnePlayer",
  robber: "swapWithPlayer",
  troublemaker: "swapTwoPlayers",
  drunk: "swapWithCenter",
  insomniac: "viewSelf",
  villager: null,
  hunter: null,
  tanner: null,
}

interface UseHostOrchestratorOptions {
  roomId: string | undefined
  /** 本设备是否是 Host */
  isHost: boolean
}

/**
 * 仅 Host 设备运行：监听 store.pendingHostAction，调用 engine，广播新状态。
 */
export function useHostOrchestrator({
  roomId,
  isHost,
}: UseHostOrchestratorOptions) {
  useEffect(() => {
    if (!roomId || !isHost) return

    // 一次性"恢复 timer"：Host 刷新页面 / 重连后，根据当前 publicState 的
    // phase + phaseEndsAt 按剩余时间重建对应阶段的 setTimeout；已完成阶段立即推进。
    let recovered = false
    const tryRecover = (ps: PublicRoomState | null) => {
      if (recovered || !ps) return
      recovered = true
      recoverPhaseTimer(roomId, ps)
    }
    tryRecover(useGameStore.getState().publicState)

    const unsub = useGameStore.subscribe((state, prev) => {
      // 首次 publicState 到达触发恢复
      if (!recovered && state.publicState && !prev.publicState) {
        tryRecover(state.publicState)
      }
      if (
        state.pendingHostAction &&
        state.pendingHostAction !== prev.pendingHostAction
      ) {
        void dispatchAction(
          roomId,
          state.pendingHostAction.playerId,
          state.pendingHostAction.action,
        )
        useGameStore.getState().setPendingHostAction(null)
      }
    })

    return () => {
      clearAllPhaseTimers()
      unsub()
    }
  }, [roomId, isHost])
}

/**
 * 根据 publicState 的 phase/phaseEndsAt 恢复对应阶段的定时器。
 * Host 刷新页面或重连后调用；若 phaseEndsAt 已过期则立即推进到下一阶段。
 */
function recoverPhaseTimer(roomId: string, ps: PublicRoomState): void {
  if (!ps.phaseEndsAt) return // 未在计时（waiting / dealing 刚进入的瞬间）
  const remainingMs = Math.max(
    0,
    new Date(ps.phaseEndsAt).getTime() - Date.now(),
  )

  switch (ps.gamePhase) {
    case "night": {
      const stepIndex = ps.currentNightStep ?? 0
      clearNightStepTimer()
      nightStepTimer = setTimeout(() => {
        nightStepTimer = null
        void advanceNightStep(roomId, stepIndex)
      }, remainingMs)
      return
    }
    case "day": {
      clearDayTimer()
      dayTimer = setTimeout(() => {
        dayTimer = null
        void enterVotingPhase(roomId)
      }, remainingMs)
      return
    }
    case "voting": {
      clearVoteTimer()
      voteTimer = setTimeout(() => {
        voteTimer = null
        void finalizeVoting(roomId)
      }, remainingMs)
      return
    }
    default:
      return // dealing / waiting / result：不需要 timer
  }
}

// ============================================================
// 主分发
// ============================================================

async function dispatchAction(
  roomId: string,
  playerId: string,
  action: PlayerAction,
): Promise<void> {
  const sync = getSyncService()
  const store = useGameStore.getState()
  const ps = store.publicState
  if (!ps) return

  switch (action.kind) {
    case "confirmIdentity":
      return handleConfirm(roomId, playerId, ps)
    case "updateProfile": {
      const nextPlayers = ps.players.map((p) =>
        p.playerId === playerId ? { ...p, name: action.name } : p,
      )
      await sync.updatePublicState(roomId, { ...ps, players: nextPlayers })
      return
    }
    case "nightAction":
      return handleNightSubmission(roomId, playerId, action.submission, ps)
    case "vote":
      return handleVoteSubmission(roomId, playerId, action.targetId, ps)
  }
}

// ============================================================
// 确认身份（dealing → night 过渡）
// ============================================================

async function handleConfirm(
  roomId: string,
  playerId: string,
  ps: PublicRoomState,
): Promise<void> {
  const sync = getSyncService()
  const { publicState: next, allConfirmed } = handleConfirmIdentity(ps, playerId)
  if (allConfirmed) {
    // 切 UI 到 night + step=0（非 Host 客户端同步通过 useNarrationSync 本地播"天黑+狼人睁眼"）
    const nightBase: PublicRoomState = {
      ...next,
      gamePhase: "night",
      phaseStartedAt: new Date().toISOString(),
      phaseEndsAt: null, // 由 enterNightStep 在 Host 端 narrate 完成后再设
      currentNightStep: 0,
      submittedPlayerIds: [],
    }
    await sync.updatePublicState(roomId, nightBase)
    // hook 在每台设备本地 speak；Host 自己只需要等本机队列清空
    await getNarrationService().waitIdle()
    await enterNightStep(roomId, 0, nightBase)
  } else if (next !== ps) {
    await sync.updatePublicState(roomId, next)
  }
}

// ============================================================
// 夜晚步骤：进入 / 推进
// ============================================================

/**
 * 把游戏推进到指定夜晚步骤：
 *   - stepIndex 在范围内：分发 requests 给该步骤的 actors，**固定等 actionTime 后**推进
 *   - stepIndex 越界：所有步骤完成，进入 day
 *
 * 即使本步骤没有玩家抽到该角色（actors 为空），也要等满 actionTime 才前进，
 * 保持节奏一致以免泄露"谁抽到了什么"。
 */
async function enterNightStep(
  roomId: string,
  stepIndex: number,
  basePublic: PublicRoomState,
): Promise<void> {
  clearNightStepTimer()

  const sync = getSyncService()
  const store = useGameStore.getState()
  const hostState = store.hostState
  if (!hostState) {
    toast.error("Host 状态缺失")
    return
  }

  const steps = nightStepsFor(hostState)

  // 所有步骤完成 → 切到白天
  if (stepIndex >= steps.length) {
    await enterDayPhase(roomId, basePublic)
    return
  }

  const stepRole = steps[stepIndex]
  const actors = getActorsForStep(stepRole, hostState)

  // 1. 推进 step（UI 立刻切换角色提示），phaseEndsAt=null 倒计时暂停
  const newHost: HostGameState = { ...hostState, nightStepIndex: stepIndex }
  await sync.updateHostState(roomId, newHost)

  const publicStepStart: PublicRoomState = {
    ...basePublic,
    gamePhase: "night",
    currentNightStep: stepIndex,
    submittedPlayerIds: [],
    phaseStartedAt: new Date().toISOString(),
    phaseEndsAt: null,
  }
  await sync.updatePublicState(roomId, publicStepStart)

  // 2. 每台设备的 hook 收到 step 变化后本地播"闭眼+睁眼"；Host 等本机队列清空
  await getNarrationService().waitIdle()

  // 3. 启动倒计时 + 发 NightActionRequest
  const newPublic: PublicRoomState = {
    ...publicStepStart,
    phaseStartedAt: new Date().toISOString(),
    phaseEndsAt: new Date(
      Date.now() + basePublic.settings.actionTime * 1000,
    ).toISOString(),
  }
  await sync.updatePublicState(roomId, newPublic)

  // 为每个 actor 写入 NightActionRequest
  await Promise.all(
    actors.map(async (actorId) => {
      const request = buildNightActionRequest(
        actorId,
        stepRole,
        newPublic,
        newHost,
      )
      if (!request) return
      const priv: PrivatePlayerState = {
        playerId: actorId,
        originalRole: newHost.originalRoles[actorId],
        currentRole: newHost.allPlayerRoles[actorId],
        nightActionRequest: request,
        nightActionResult: null,
      }
      await sync.updatePrivateState(roomId, actorId, priv)
    }),
  )

  // 安排定时推进（无论 actors 是否为空）
  const actionTimeMs = Math.max(newPublic.settings.actionTime, 1) * 1000
  nightStepTimer = setTimeout(() => {
    nightStepTimer = null
    void advanceNightStep(roomId, stepIndex)
  }, actionTimeMs)
}

/**
 * 定时器到期：对未提交的 actor 应用超时动作，然后推进到下一步。
 * 幂等：如果当前 stepIndex 已被推进过，跳过。
 */
async function advanceNightStep(
  roomId: string,
  expectedStepIndex: number,
): Promise<void> {
  const sync = getSyncService()
  const store = useGameStore.getState()
  const ps = store.publicState
  const hostState = store.hostState
  if (!ps || !hostState) return
  if (ps.gamePhase !== "night") return
  if (hostState.nightStepIndex !== expectedStepIndex) return

  const steps = nightStepsFor(hostState)
  const stepRole = steps[expectedStepIndex]
  let state = hostState

  if (stepRole) {
    const actors = getActorsForStep(stepRole, hostState)
    const pending = actors.filter(
      (id) => !ps.submittedPlayerIds.includes(id),
    )
    const actionType = TIMEOUT_ACTION_TYPE[stepRole]
    if (actionType) {
      for (const actorId of pending) {
        state = applyTimeoutAction(state, actorId, actionType)
        const priv: PrivatePlayerState = {
          playerId: actorId,
          originalRole: state.originalRoles[actorId],
          currentRole: state.allPlayerRoles[actorId],
          nightActionRequest: null,
          nightActionResult: null,
        }
        await sync.updatePrivateState(roomId, actorId, priv)
      }
    }
    if (state !== hostState) {
      await sync.updateHostState(roomId, state)
    }
  }

  // "X 请闭眼" 由 hook 在 step 切换后和"Y 请睁眼"串行播报，Host 直接推进下一步
  await enterNightStep(roomId, expectedStepIndex + 1, ps)
}

// ============================================================
// 夜晚操作提交
// ============================================================

async function handleNightSubmission(
  roomId: string,
  playerId: string,
  submission: Extract<PlayerAction, { kind: "nightAction" }>["submission"],
  ps: PublicRoomState,
): Promise<void> {
  const sync = getSyncService()
  const hostState = useGameStore.getState().hostState
  if (!hostState) return
  if (ps.gamePhase !== "night") return

  // 应用到 engine
  const { state: newHost, result } = applyNightAction(
    hostState,
    playerId,
    submission,
  )

  // 发起者的 privateState：写入 result，清 request
  const actorPriv: PrivatePlayerState = {
    playerId,
    originalRole: newHost.originalRoles[playerId],
    currentRole: newHost.allPlayerRoles[playerId],
    nightActionRequest: null,
    nightActionResult: result,
  }

  // 被影响的其他玩家（身份被换）：同步 currentRole
  const lastAction = newHost.nightActions[newHost.nightActions.length - 1]
  const affectedOthers = getAffectedPlayerIds(lastAction).filter(
    (id) => id !== playerId,
  )

  await sync.updateHostState(roomId, newHost)
  await sync.updatePrivateState(roomId, playerId, actorPriv)
  await Promise.all(
    affectedOthers.map((id) => {
      const priv: PrivatePlayerState = {
        playerId: id,
        originalRole: newHost.originalRoles[id],
        currentRole: newHost.allPlayerRoles[id],
        nightActionRequest: null,
        nightActionResult: null,
      }
      return sync.updatePrivateState(roomId, id, priv)
    }),
  )

  // 更新 public.submittedPlayerIds（不主动推进步骤，等定时器到期）
  const submittedIds = ps.submittedPlayerIds.includes(playerId)
    ? ps.submittedPlayerIds
    : [...ps.submittedPlayerIds, playerId]
  const newPublic: PublicRoomState = { ...ps, submittedPlayerIds: submittedIds }
  await sync.updatePublicState(roomId, newPublic)
}

function getAffectedPlayerIds(action: NightAction | undefined): string[] {
  if (!action?.cardChanges) return []
  return action.cardChanges
    .map((c) => c.targetId)
    .filter((id) => !id.startsWith("center_"))
}

// ============================================================
// Day / Voting / Result 流转
// ============================================================

/**
 * 进入白天讨论：先切 phase=day, timer=null（让语音 "天亮了" 同步播），
 * 等本机 narrate 完再开 discussionTime 倒计时；Host 可通过 `hostEndDay` 提前结束。
 */
async function enterDayPhase(
  roomId: string,
  basePublic: PublicRoomState,
): Promise<void> {
  clearAllPhaseTimers()
  const sync = getSyncService()
  const dayBase: PublicRoomState = {
    ...markPhase(basePublic, "day"),
    currentNightStep: null,
    submittedPlayerIds: [],
    resultData: null,
  }
  await sync.updatePublicState(roomId, dayBase)
  await getNarrationService().waitIdle()

  const durationMs = basePublic.settings.discussionTime * 60 * 1000
  const dayWithTimer: PublicRoomState = {
    ...dayBase,
    phaseStartedAt: new Date().toISOString(),
    phaseEndsAt: new Date(Date.now() + durationMs).toISOString(),
  }
  await sync.updatePublicState(roomId, dayWithTimer)
  dayTimer = setTimeout(() => {
    dayTimer = null
    void enterVotingPhase(roomId)
  }, durationMs)
}

/** Host 点"提前结束讨论"按钮调用 */
export async function hostEndDay(roomId: string): Promise<void> {
  const ps = useGameStore.getState().publicState
  if (!ps || ps.gamePhase !== "day") return
  clearDayTimer()
  await enterVotingPhase(roomId)
}

/**
 * 进入投票阶段：重置 hostState.votes；开 voteTime 倒计时；到期或全员投票 → finalize
 */
async function enterVotingPhase(roomId: string): Promise<void> {
  clearAllPhaseTimers()
  const sync = getSyncService()
  const store = useGameStore.getState()
  const ps = store.publicState
  const hostState = store.hostState
  if (!ps || !hostState) return

  const resetHost: HostGameState = { ...hostState, votes: [] }
  await sync.updateHostState(roomId, resetHost)

  const durationMs = ps.settings.voteTime * 1000
  const votingPublic: PublicRoomState = {
    ...markPhase(ps, "voting", ps.settings.voteTime),
    submittedPlayerIds: [],
    currentNightStep: null,
  }
  await sync.updatePublicState(roomId, votingPublic)

  voteTimer = setTimeout(() => {
    voteTimer = null
    void finalizeVoting(roomId)
  }, durationMs)
}

async function handleVoteSubmission(
  roomId: string,
  playerId: string,
  targetId: string | null,
  ps: PublicRoomState,
): Promise<void> {
  if (ps.gamePhase !== "voting") return
  const sync = getSyncService()
  const store = useGameStore.getState()
  const hostState = store.hostState
  if (!hostState) return

  // 若该玩家已投过，覆盖原值（允许改票直到最终结算）
  const newVotes: Vote[] = [
    ...hostState.votes.filter((v) => v.voterId !== playerId),
    { voterId: playerId, targetId },
  ]
  const newHost: HostGameState = { ...hostState, votes: newVotes }
  await sync.updateHostState(roomId, newHost)

  const submittedIds = ps.submittedPlayerIds.includes(playerId)
    ? ps.submittedPlayerIds
    : [...ps.submittedPlayerIds, playerId]
  const newPublic: PublicRoomState = { ...ps, submittedPlayerIds: submittedIds }
  await sync.updatePublicState(roomId, newPublic)

  // 所有玩家都投过 → 立即 finalize
  if (submittedIds.length >= ps.players.length) {
    clearVoteTimer()
    await finalizeVoting(roomId)
  }
}

/** 计票 + 胜负 → 写 ResultData 切 result 阶段 */
async function finalizeVoting(roomId: string): Promise<void> {
  clearAllPhaseTimers()
  const sync = getSyncService()
  const store = useGameStore.getState()
  const ps = store.publicState
  const hostState = store.hostState
  if (!ps || !hostState) return
  if (ps.gamePhase !== "voting") return

  // 未投票的玩家记为弃票
  const submittedSet = new Set(hostState.votes.map((v) => v.voterId))
  const abstainVotes: Vote[] = ps.players
    .filter((p) => !submittedSet.has(p.playerId))
    .map((p) => ({ voterId: p.playerId, targetId: null }))
  const allVotes: Vote[] = [...hostState.votes, ...abstainVotes]

  const eliminated = computeEliminated(allVotes, hostState.allPlayerRoles)
  const winner = judgeWin(eliminated, hostState.allPlayerRoles)

  const result: ResultData = {
    votes: allVotes,
    eliminatedPlayerIds: eliminated,
    finalRoles: { ...hostState.allPlayerRoles },
    centerCards: [...hostState.centerCards],
    nightActions: [...hostState.nightActions],
    winner,
  }

  const resultPublic: PublicRoomState = {
    ...markPhase(ps, "result"),
    submittedPlayerIds: [],
    currentNightStep: null,
    resultData: result,
  }
  await sync.updatePublicState(roomId, resultPublic)

  // 结算阶段也把 hostState.allPlayerRoles 通过 private state 揭示给每个玩家，
  // 让他们看到"最终身份"（而非只看自己）——这是结算面板展示的基础
  await Promise.all(
    ps.players.map((p) => {
      const priv: PrivatePlayerState = {
        playerId: p.playerId,
        originalRole: hostState.originalRoles[p.playerId],
        currentRole: hostState.allPlayerRoles[p.playerId],
        nightActionRequest: null,
        nightActionResult: null,
      }
      return sync.updatePrivateState(roomId, p.playerId, priv)
    }),
  )
}

// ============================================================
// Host 主动触发：开始游戏 / 再来一局
// ============================================================

export async function hostStartGame(roomId: string): Promise<void> {
  const store = useGameStore.getState()
  const ps = store.publicState
  if (!ps) {
    toast.error("房间状态未就绪")
    return
  }

  try {
    const { publicState, hostState, privateStates } = buildStartGameStates(ps)
    await broadcastGameStart(roomId, publicState, hostState, privateStates)
  } catch (err) {
    if (err instanceof StartGameError) {
      toast.error(err.message)
    } else {
      toast.error("开始游戏失败")
    }
  }
}

export async function hostPlayAgain(roomId: string): Promise<void> {
  clearAllPhaseTimers()
  const store = useGameStore.getState()
  const ps = store.publicState
  if (!ps) return
  const { publicState } = buildPlayAgainStates(ps)
  await getSyncService().updatePublicState(roomId, publicState)
}

async function broadcastGameStart(
  roomId: string,
  publicState: PublicRoomState,
  hostState: HostGameState,
  privateStates: Record<string, PrivatePlayerState>,
): Promise<void> {
  const sync = getSyncService()
  await sync.updatePublicState(roomId, publicState)
  await sync.updateHostState(roomId, hostState)
  await Promise.all(
    Object.entries(privateStates).map(([playerId, state]) =>
      sync.updatePrivateState(roomId, playerId, state),
    ),
  )
}
