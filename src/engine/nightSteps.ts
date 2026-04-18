/**
 * 夜晚步骤编排相关的纯函数。
 *
 * 关键约束：
 *   - 唤醒顺序基于 `originalRoles`（初始发牌），不受强盗/酒鬼等交换影响
 *   - `allPlayerRoles`（当前身份）仅用于操作结果（例如爪牙查看"当前"的狼人）
 *   - 桌面 3 张牌对应虚拟 targetId center_0 / center_1 / center_2
 */

import type {
  HostGameState,
  NightActionRequest,
  PublicRoomState,
  Role,
} from "@/types"
import { buildNightSteps } from "./nightOrder"

/**
 * 取本局夜晚步骤列表（按固定顺序，过滤本局未配置的角色）。
 * 基于"配置的角色池" = 玩家手牌 + 桌面牌，而非仅玩家抽到的角色。
 */
export function nightStepsFor(hostState: HostGameState): Role[] {
  return buildNightSteps([
    ...Object.values(hostState.originalRoles),
    ...hostState.centerCards,
  ])
}

/**
 * 某个夜晚步骤中需要行动的玩家（按**初始身份**）。
 *   - 多狼：所有初始狼人
 *   - 其他角色：该初始身份的唯一持有者（列表只有一个元素）
 */
export function getActorsForStep(
  role: Role,
  hostState: HostGameState,
): string[] {
  return Object.entries(hostState.originalRoles)
    .filter(([, r]) => r === role)
    .map(([id]) => id)
}

/**
 * 构造发给某玩家的 NightActionRequest。
 * 返回 null 表示该玩家在当前步骤不需要操作。
 */
export function buildNightActionRequest(
  actorId: string,
  stepRole: Role,
  publicState: PublicRoomState,
  hostState: HostGameState,
): NightActionRequest | null {
  const originalRole = hostState.originalRoles[actorId]
  if (originalRole !== stepRole) return null

  const otherPlayerIds = publicState.players
    .map((p) => p.playerId)
    .filter((id) => id !== actorId)

  switch (stepRole) {
    case "minion": {
      // 爪牙查看所有狼人（基于**当前**身份，不过此时还没换过牌，等价于初始身份）
      const werewolfPlayers = Object.entries(hostState.allPlayerRoles)
        .filter(([, r]) => r === "werewolf")
        .map(([id]) => id)
      return { kind: "minionView", werewolfPlayers }
    }
    case "werewolf": {
      const werewolfIds = getActorsForStep("werewolf", hostState)
      const otherWerewolves = werewolfIds.filter((id) => id !== actorId)
      if (werewolfIds.length === 1) {
        // 独狼
        return {
          kind: "loneWerewolf",
          centerCardIndices: [0, 1, 2],
          canSkip: true,
        }
      }
      return { kind: "werewolfConfirm", otherWerewolves }
    }
    case "seer":
      return {
        kind: "seerChoice",
        playerTargets: otherPlayerIds,
        centerCardIndices: [0, 1, 2],
      }
    case "robber":
      return { kind: "robberSwap", playerTargets: otherPlayerIds }
    case "troublemaker":
      return { kind: "troublemakerSwap", playerTargets: otherPlayerIds }
    case "drunk":
      return { kind: "drunkSwap", centerCardIndices: [0, 1, 2] }
    case "insomniac":
      return { kind: "insomniacView" }
    default:
      return null
  }
}

/**
 * 判断当前夜晚步骤是否全部行动完成（对应 actors 都在 submittedPlayerIds 中）。
 */
export function isCurrentStepComplete(
  publicState: PublicRoomState,
  hostState: HostGameState,
): boolean {
  const steps = nightStepsFor(hostState)
  const stepRole = steps[hostState.nightStepIndex]
  if (!stepRole) return true // 已超出，当作完成
  const actors = getActorsForStep(stepRole, hostState)
  return actors.every((id) => publicState.submittedPlayerIds.includes(id))
}

/**
 * 所有夜晚步骤是否都已处理完（对应 nightStepIndex >= steps.length）。
 */
export function isAllNightStepsDone(hostState: HostGameState): boolean {
  return hostState.nightStepIndex >= nightStepsFor(hostState).length
}
