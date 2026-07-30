import type { Role, Vote } from "../types"

/**
 * 根据投票记录 + 最终身份计算出局玩家。
 *
 * 规则（PRD §4.6）：
 *   1. 票数最多的玩家出局（平票则均出局）
 *   2. 全弃票或完全平票 → 无人出局
 *   3. 猎人被出局时，其投票目标也一起出局（猎人弃票不带走）
 *
 * 注意：弃票（targetId = null）不参与任何玩家的票数统计。
 */
export function computeEliminated(
  votes: Vote[],
  finalRoles: Record<string, Role>,
): string[] {
  // 1. 统计每个被投对象的票数
  const tally = new Map<string, number>()
  for (const { targetId } of votes) {
    if (targetId === null) continue
    tally.set(targetId, (tally.get(targetId) ?? 0) + 1)
  }

  // 2. 没人被投 → 无人出局
  if (tally.size === 0) return []

  const max = Math.max(...tally.values())

  // 3. 每个人都被投了一票且票数相同 → 完全平均，无人出局
  //    条件：所有候选人票数相同 + 候选人数 = 投票总数
  const totalEffectiveVotes = [...tally.values()].reduce((a, b) => a + b, 0)
  const allSame = [...tally.values()].every((v) => v === max)
  if (allSame && tally.size === totalEffectiveVotes && max === 1) {
    return []
  }

  // 4. 最高票的玩家（可能多个）
  const eliminated = new Set<string>()
  for (const [id, count] of tally.entries()) {
    if (count === max) eliminated.add(id)
  }

  // 5. 猎人被出局 → 带走其投票目标
  for (const id of [...eliminated]) {
    if (finalRoles[id] === "hunter") {
      const vote = votes.find((v) => v.voterId === id)
      if (vote?.targetId) eliminated.add(vote.targetId)
    }
  }

  return [...eliminated]
}
