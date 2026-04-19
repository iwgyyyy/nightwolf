import { produce } from "immer"
import type {
  ActionType,
  CardChange,
  HostGameState,
  NightActionResult,
  NightActionSubmission,
  Role,
} from "@/types"

/** 桌面牌的虚拟 targetId：center_0 / center_1 / center_2 */
export function centerId(index: number): string {
  return `center_${index}`
}

export function isCenterId(id: string): boolean {
  return id.startsWith("center_")
}

export function centerIndex(id: string): number {
  return Number(id.slice("center_".length))
}

/**
 * 应用一个夜晚操作 submission，返回新的 HostGameState 和给操作者的反馈。
 *
 * 副作用：
 *   - 更新 allPlayerRoles / centerCards（强盗、捣蛋鬼、酒鬼的换牌）
 *   - 追加一条 NightAction 到日志
 *
 * 不处理：
 *   - 夜晚步骤推进（由上层逻辑控制）
 *   - 超时（由上层写入 `status: 'timedOut'` 时调用本函数的 timeout 分支）
 */
export function applyNightAction(
  state: HostGameState,
  actorId: string,
  submission: NightActionSubmission,
): { state: HostGameState; result: NightActionResult } {
  // 用"初始身份"分派；强盗等操作之后 allPlayerRoles 会被改写，不能用来决定 handler。
  const actorRole = state.originalRoles[actorId]
  if (!actorRole) {
    throw new Error(`玩家 ${actorId} 不存在`)
  }

  const order = state.nightActions.length + 1

  const [next, result] = handleSubmission(state, actorId, actorRole, order, submission)
  return { state: next, result }
}

/**
 * 记录一个"超时未操作"的 NightAction（不执行任何效果）。
 */
export function applyTimeoutAction(
  state: HostGameState,
  actorId: string,
  actionType: ActionType,
): HostGameState {
  const actorRole = state.allPlayerRoles[actorId]
  if (!actorRole) {
    throw new Error(`玩家 ${actorId} 不存在`)
  }

  return produce(state, (draft) => {
    draft.nightActions.push({
      order: draft.nightActions.length + 1,
      actorId,
      actorRole,
      actionType,
      status: "timedOut",
      selectedTargets: [],
    })
  })
}

// ============================================================
// 按 submission.kind 分派
// ============================================================

function handleSubmission(
  state: HostGameState,
  actorId: string,
  actorRole: Role,
  order: number,
  submission: NightActionSubmission,
): [HostGameState, NightActionResult] {
  switch (submission.kind) {
    case "minionConfirm":
      return minionConfirm(state, actorId, actorRole, order)

    case "werewolfConfirm":
      return werewolfConfirm(state, actorId, actorRole, order)

    case "loneWerewolfView":
      return loneWerewolfView(state, actorId, actorRole, order, submission.centerIndex)

    case "loneWerewolfSkip":
      return loneWerewolfSkip(state, actorId, actorRole, order)

    case "seerViewPlayer":
      return seerViewPlayer(state, actorId, actorRole, order, submission.playerId)

    case "seerViewCenter":
      return seerViewCenter(state, actorId, actorRole, order, submission.indices)

    case "robberSwap":
      return robberSwap(state, actorId, actorRole, order, submission.targetId)

    case "troublemakerSwap":
      return troublemakerSwap(state, actorId, actorRole, order, submission.targetIds)

    case "drunkSwap":
      return drunkSwap(state, actorId, actorRole, order, submission.centerIndex)

    case "insomniacConfirm":
      return insomniacConfirm(state, actorId, actorRole, order)
  }
}

// ============================================================
// 各角色逻辑
// ============================================================

function minionConfirm(
  state: HostGameState,
  actorId: string,
  actorRole: Role,
  order: number,
): [HostGameState, NightActionResult] {
  // 爪牙查看所有狼人身份
  const werewolfIds = Object.entries(state.allPlayerRoles)
    .filter(([, r]) => r === "werewolf")
    .map(([id]) => id)

  const revealed: Record<string, Role> = {}
  for (const id of werewolfIds) revealed[id] = "werewolf"

  const next = produce(state, (draft) => {
    draft.nightActions.push({
      order,
      actorId,
      actorRole,
      actionType: "viewWerewolves",
      status: "completed",
      selectedTargets: werewolfIds,
      revealedRoles: revealed,
    })
  })

  return [next, { kind: "rolesRevealed", roles: revealed }]
}

function werewolfConfirm(
  state: HostGameState,
  actorId: string,
  actorRole: Role,
  order: number,
): [HostGameState, NightActionResult] {
  // 多狼互认：展示其他狼人
  const otherWerewolves = Object.entries(state.allPlayerRoles)
    .filter(([id, r]) => r === "werewolf" && id !== actorId)
    .map(([id]) => id)

  const revealed: Record<string, Role> = {}
  for (const id of otherWerewolves) revealed[id] = "werewolf"

  const next = produce(state, (draft) => {
    draft.nightActions.push({
      order,
      actorId,
      actorRole,
      actionType: "werewolfConfirm",
      status: "completed",
      selectedTargets: otherWerewolves,
      revealedRoles: revealed,
    })
  })

  // 互认面板已经把队友 + RoleBadge 展示得很清楚，无需再弹一次翻牌
  return [next, { kind: "noResult" }]
}

function loneWerewolfView(
  state: HostGameState,
  actorId: string,
  actorRole: Role,
  order: number,
  index: number,
): [HostGameState, NightActionResult] {
  const role = state.centerCards[index]
  const revealed = { [centerId(index)]: role }

  const next = produce(state, (draft) => {
    draft.nightActions.push({
      order,
      actorId,
      actorRole,
      actionType: "viewOneCenter",
      status: "completed",
      selectedTargets: [centerId(index)],
      revealedRoles: revealed,
    })
  })

  return [next, { kind: "rolesRevealed", roles: revealed }]
}

function loneWerewolfSkip(
  state: HostGameState,
  actorId: string,
  actorRole: Role,
  order: number,
): [HostGameState, NightActionResult] {
  // 独狼选择不查看：记一条 skipped
  const next = produce(state, (draft) => {
    draft.nightActions.push({
      order,
      actorId,
      actorRole,
      actionType: "viewOneCenter",
      status: "completed",
      selectedTargets: [],
    })
  })
  return [next, { kind: "noResult" }]
}

function seerViewPlayer(
  state: HostGameState,
  actorId: string,
  actorRole: Role,
  order: number,
  targetId: string,
): [HostGameState, NightActionResult] {
  const role = state.allPlayerRoles[targetId]
  if (!role) throw new Error(`玩家 ${targetId} 不存在`)

  const revealed = { [targetId]: role }
  const next = produce(state, (draft) => {
    draft.nightActions.push({
      order,
      actorId,
      actorRole,
      actionType: "viewOnePlayer",
      status: "completed",
      selectedTargets: [targetId],
      revealedRoles: revealed,
    })
  })
  return [next, { kind: "rolesRevealed", roles: revealed }]
}

function seerViewCenter(
  state: HostGameState,
  actorId: string,
  actorRole: Role,
  order: number,
  indices: [number, number],
): [HostGameState, NightActionResult] {
  const revealed: Record<string, Role> = {}
  for (const idx of indices) revealed[centerId(idx)] = state.centerCards[idx]

  const next = produce(state, (draft) => {
    draft.nightActions.push({
      order,
      actorId,
      actorRole,
      actionType: "viewTwoCenter",
      status: "completed",
      selectedTargets: indices.map(centerId),
      revealedRoles: revealed,
    })
  })
  return [next, { kind: "rolesRevealed", roles: revealed }]
}

function robberSwap(
  state: HostGameState,
  actorId: string,
  actorRole: Role,
  order: number,
  targetId: string,
): [HostGameState, NightActionResult] {
  const actorCurrent = state.allPlayerRoles[actorId]
  const targetCurrent = state.allPlayerRoles[targetId]
  if (!targetCurrent) throw new Error(`目标 ${targetId} 不存在`)

  const changes: CardChange[] = [
    { targetId: actorId, fromRole: actorCurrent, toRole: targetCurrent },
    { targetId, fromRole: targetCurrent, toRole: actorCurrent },
  ]

  const next = produce(state, (draft) => {
    draft.allPlayerRoles[actorId] = targetCurrent
    draft.allPlayerRoles[targetId] = actorCurrent
    draft.nightActions.push({
      order,
      actorId,
      actorRole,
      actionType: "swapWithPlayer",
      status: "completed",
      selectedTargets: [targetId],
      cardChanges: changes,
    })
  })

  return [next, { kind: "swapResult", newRole: targetCurrent }]
}

function troublemakerSwap(
  state: HostGameState,
  actorId: string,
  actorRole: Role,
  order: number,
  targetIds: [string, string],
): [HostGameState, NightActionResult] {
  const [a, b] = targetIds
  if (a === b) throw new Error("捣蛋鬼必须选择两名不同的玩家")
  const roleA = state.allPlayerRoles[a]
  const roleB = state.allPlayerRoles[b]
  if (!roleA || !roleB) throw new Error(`目标玩家不存在`)

  const changes: CardChange[] = [
    { targetId: a, fromRole: roleA, toRole: roleB },
    { targetId: b, fromRole: roleB, toRole: roleA },
  ]

  const next = produce(state, (draft) => {
    draft.allPlayerRoles[a] = roleB
    draft.allPlayerRoles[b] = roleA
    draft.nightActions.push({
      order,
      actorId,
      actorRole,
      actionType: "swapTwoPlayers",
      status: "completed",
      selectedTargets: [a, b],
      cardChanges: changes,
    })
  })

  return [next, { kind: "noResult" }]
}

function drunkSwap(
  state: HostGameState,
  actorId: string,
  actorRole: Role,
  order: number,
  index: number,
): [HostGameState, NightActionResult] {
  const actorCurrent = state.allPlayerRoles[actorId]
  const centerCurrent = state.centerCards[index]

  const changes: CardChange[] = [
    { targetId: actorId, fromRole: actorCurrent, toRole: centerCurrent },
    { targetId: centerId(index), fromRole: centerCurrent, toRole: actorCurrent },
  ]

  const next = produce(state, (draft) => {
    draft.allPlayerRoles[actorId] = centerCurrent
    draft.centerCards[index] = actorCurrent
    draft.nightActions.push({
      order,
      actorId,
      actorRole,
      actionType: "swapWithCenter",
      status: "completed",
      selectedTargets: [centerId(index)],
      cardChanges: changes,
    })
  })

  return [next, { kind: "noResult" }]
}

function insomniacConfirm(
  state: HostGameState,
  actorId: string,
  actorRole: Role,
  order: number,
): [HostGameState, NightActionResult] {
  const currentRole = state.allPlayerRoles[actorId]
  const revealed = { [actorId]: currentRole }

  const next = produce(state, (draft) => {
    draft.nightActions.push({
      order,
      actorId,
      actorRole,
      actionType: "viewSelf",
      status: "completed",
      selectedTargets: [actorId],
      revealedRoles: revealed,
    })
  })
  return [next, { kind: "rolesRevealed", roles: revealed }]
}
