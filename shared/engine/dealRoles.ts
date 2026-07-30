import { shuffle } from "es-toolkit/array"
import type { Role } from "../types"

/** 发牌结果 */
export interface DealResult {
  /** 每个玩家分配到的角色 */
  playerRoles: Record<string, Role>
  /** 3 张桌面牌，下标 0/1/2 */
  centerCards: Role[]
}

/**
 * 随机洗牌并把角色分配给玩家 + 3 张桌面牌。
 *
 * 前提条件：`roles.length === playerIds.length + 3`（由调用方保证，PRD §4.1）
 *
 * 可传入 `shuffleFn` 做测试时的确定性洗牌。
 */
export function dealRoles(
  playerIds: string[],
  roles: Role[],
  shuffleFn: (input: Role[]) => Role[] = shuffle,
): DealResult {
  if (roles.length !== playerIds.length + 3) {
    throw new Error(
      `角色数不匹配：需要 ${playerIds.length + 3} 张，实际 ${roles.length} 张`,
    )
  }

  const shuffled = shuffleFn([...roles])
  const playerRoles: Record<string, Role> = {}
  for (let i = 0; i < playerIds.length; i++) {
    playerRoles[playerIds[i]] = shuffled[i]
  }
  const centerCards = shuffled.slice(playerIds.length)
  return { playerRoles, centerCards }
}
