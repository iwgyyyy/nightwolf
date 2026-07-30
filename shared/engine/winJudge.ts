import type { Role, WinResult } from "../types"

/**
 * 胜负判定（PRD §4.6 优先级）：
 *
 *   1. 被投出者中有皮匠                       → tannerWin
 *   2. 被投出者中有狼人                       → villagerWin
 *   3. 有人被投出但没狼人被投出               → werewolfWin
 *   4. 无人被投出，场上有狼人                 → werewolfWin
 *   5. 无人被投出，场上没狼人（都在桌面牌里）→ villagerWin
 *
 * "场上有狼人"指玩家的**最终身份牌**是狼人。
 * 爪牙不算"狼人被投出"，但爪牙属于狼人阵营（狼人赢时爪牙也赢）。
 */
export function judgeWin(
  eliminatedPlayerIds: string[],
  finalRoles: Record<string, Role>,
): WinResult {
  const eliminatedRoles = eliminatedPlayerIds.map((id) => finalRoles[id])

  // 1. 皮匠被投出
  if (eliminatedRoles.includes("tanner")) return "tannerWin"

  // 2. 狼人被投出
  if (eliminatedRoles.includes("werewolf")) return "villagerWin"

  // 有人被投出（但不是狼人/皮匠）
  if (eliminatedPlayerIds.length > 0) return "werewolfWin"

  // 无人被投出
  const anyWerewolfOnTable = Object.values(finalRoles).includes("werewolf")
  return anyWerewolfOnTable ? "werewolfWin" : "villagerWin"
}
