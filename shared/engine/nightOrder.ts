import type { Role } from "../types"
import { ROLE_META } from "../types"

/**
 * 夜晚操作角色的固定顺序（PRD §4.3）：
 *   狼人 → 爪牙 → 预言家 → 强盗 → 捣蛋鬼 → 酒鬼 → 失眠者
 *
 * 注意：狼人在爪牙之前。
 * 本函数返回本局中实际存在夜晚操作的角色列表（去重 + 过滤不在本局的）。
 */
const NIGHT_ROLE_SEQUENCE: Role[] = [
  "werewolf",
  "minion",
  "seer",
  "robber",
  "troublemaker",
  "drunk",
  "insomniac",
]

/**
 * 计算本局夜晚唤醒步骤列表。
 * 输入：本局配置的**全部角色池**（玩家手牌 + 桌面 3 张牌，长度 = 玩家数 + 3）
 * 输出：按夜晚顺序排列的角色列表，每个角色仅出现一次
 *
 * 只要某角色在池中，就会生成对应步骤——即使该角色最终进了桌面、没人抽到。
 * 这是刻意的：统一节奏避免玩家通过"哪些角色被念到"反推谁抽到了什么。
 */
export function buildNightSteps(allRoles: Role[]): Role[] {
  const present = new Set(allRoles)
  return NIGHT_ROLE_SEQUENCE.filter((role) => present.has(role))
}

/**
 * 获取某角色在 NIGHT_ROLE_SEQUENCE 中的位置，用于排序。
 */
export function nightOrderOf(role: Role): number {
  return ROLE_META[role].nightOrder ?? Number.POSITIVE_INFINITY
}
