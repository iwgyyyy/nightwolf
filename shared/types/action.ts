import type { Role } from "./role"

// ============================================================
// 夜晚操作请求（服务端/Host 下发给玩家客户端，渲染操作界面）
// ============================================================

export type NightActionRequest =
  | { kind: "minionView"; werewolfPlayers: string[] }
  | { kind: "werewolfConfirm"; otherWerewolves: string[] }
  | { kind: "loneWerewolf"; centerCardIndices: number[]; canSkip: true }
  | {
      kind: "seerChoice"
      playerTargets: string[]
      centerCardIndices: number[]
    }
  | { kind: "robberSwap"; playerTargets: string[] }
  | { kind: "troublemakerSwap"; playerTargets: string[] }
  | { kind: "drunkSwap"; centerCardIndices: number[] }
  | { kind: "insomniacView" }

// ============================================================
// 夜晚操作提交（玩家客户端提交回服务端/Host）
// ============================================================

export type NightActionSubmission =
  | { kind: "minionConfirm" }
  | { kind: "werewolfConfirm" }
  | { kind: "loneWerewolfView"; centerIndex: number }
  | { kind: "loneWerewolfSkip" }
  | { kind: "seerViewPlayer"; playerId: string }
  | { kind: "seerViewCenter"; indices: [number, number] }
  | { kind: "robberSwap"; targetId: string }
  | { kind: "troublemakerSwap"; targetIds: [string, string] }
  | { kind: "drunkSwap"; centerIndex: number }
  | { kind: "insomniacConfirm" }

// ============================================================
// 夜晚操作结果（Host 返回给玩家客户端）
// ============================================================

export type NightActionResult =
  | { kind: "rolesRevealed"; roles: Record<string, Role> }
  | { kind: "swapResult"; newRole: Role }
  | { kind: "noResult" }

// ============================================================
// 玩家可提交的所有动作
// ============================================================

export type PlayerAction =
  | { kind: "confirmIdentity" }
  | { kind: "nightAction"; submission: NightActionSubmission }
  /**
   * 夜晚行动完成后主动结束自己的回合。
   * 本步骤所有行动者都结束时服务端提前推进（submittedPlayerIds 本就公开
   * "谁已行动"，提前推进不引入新的信息泄露）。
   */
  | { kind: "endNightTurn" }
  | { kind: "vote"; targetId: string | null }
  | { kind: "updateProfile"; name: string }
