import { describe, it, expect } from "vitest"
import { applyNightAction, applyTimeoutAction } from "./nightActions"
import type { HostGameState, Role } from "@/types"

function makeState(overrides: Partial<HostGameState> = {}): HostGameState {
  const base: HostGameState = {
    allPlayerRoles: {},
    originalRoles: {},
    centerCards: ["villager", "villager", "villager"],
    nightActions: [],
    nightStepIndex: 0,
    playerActionStatus: {},
    votes: [],
  }
  const merged = { ...base, ...overrides }
  // 若没指定 originalRoles，默认和当前身份一致（多数测试用例下合理）
  if (!overrides.originalRoles) {
    merged.originalRoles = { ...merged.allPlayerRoles }
  }
  return merged
}

describe("applyNightAction", () => {
  describe("爪牙 minionConfirm", () => {
    it("展示所有狼人身份", () => {
      const state = makeState({
        allPlayerRoles: {
          p1: "minion",
          p2: "werewolf",
          p3: "werewolf",
          p4: "seer",
        },
      })
      const { state: next, result } = applyNightAction(state, "p1", {
        kind: "minionConfirm",
      })

      expect(result).toEqual({
        kind: "rolesRevealed",
        roles: { p2: "werewolf", p3: "werewolf" },
      })
      expect(next.nightActions).toHaveLength(1)
      expect(next.nightActions[0].actionType).toBe("viewWerewolves")
      expect(next.nightActions[0].status).toBe("completed")
    })

    it("本局没狼人时返回空 roles", () => {
      const state = makeState({
        allPlayerRoles: { p1: "minion", p2: "seer" },
      })
      const { result } = applyNightAction(state, "p1", { kind: "minionConfirm" })
      expect(result).toEqual({ kind: "rolesRevealed", roles: {} })
    })
  })

  describe("狼人互认 werewolfConfirm", () => {
    it("返回 noResult（互认面板已展示队友，无需再翻牌）", () => {
      const state = makeState({
        allPlayerRoles: { p1: "werewolf", p2: "werewolf", p3: "villager" },
      })
      const { state: next, result } = applyNightAction(state, "p1", {
        kind: "werewolfConfirm",
      })
      expect(result).toEqual({ kind: "noResult" })
      // 但审计记录里仍然保留 revealedRoles
      expect(next.nightActions[0]).toMatchObject({
        actionType: "werewolfConfirm",
        revealedRoles: { p2: "werewolf" },
      })
    })

    it("独狼时也返回 noResult", () => {
      const state = makeState({
        allPlayerRoles: { p1: "werewolf", p2: "villager" },
      })
      const { result } = applyNightAction(state, "p1", {
        kind: "werewolfConfirm",
      })
      expect(result).toEqual({ kind: "noResult" })
    })
  })

  describe("独狼 loneWerewolfView", () => {
    it("查看桌面牌但不改变", () => {
      const state = makeState({
        allPlayerRoles: { p1: "werewolf" },
        centerCards: ["tanner", "seer", "villager"],
      })
      const { state: next, result } = applyNightAction(state, "p1", {
        kind: "loneWerewolfView",
        centerIndex: 1,
      })
      expect(result).toEqual({
        kind: "rolesRevealed",
        roles: { center_1: "seer" },
      })
      expect(next.centerCards).toEqual(["tanner", "seer", "villager"])
    })
  })

  describe("预言家", () => {
    it("查看一名玩家", () => {
      const state = makeState({
        allPlayerRoles: { p1: "seer", p2: "werewolf" },
      })
      const { result } = applyNightAction(state, "p1", {
        kind: "seerViewPlayer",
        playerId: "p2",
      })
      expect(result).toEqual({
        kind: "rolesRevealed",
        roles: { p2: "werewolf" },
      })
    })

    it("查看两张桌面牌", () => {
      const state = makeState({
        allPlayerRoles: { p1: "seer" },
        centerCards: ["tanner", "seer", "werewolf"],
      })
      const { result } = applyNightAction(state, "p1", {
        kind: "seerViewCenter",
        indices: [0, 2],
      })
      expect(result).toEqual({
        kind: "rolesRevealed",
        roles: { center_0: "tanner", center_2: "werewolf" },
      })
    })
  })

  describe("强盗 robberSwap", () => {
    it("交换双方身份，返回新身份", () => {
      const state = makeState({
        allPlayerRoles: { p1: "robber", p2: "werewolf" },
      })
      const { state: next, result } = applyNightAction(state, "p1", {
        kind: "robberSwap",
        targetId: "p2",
      })
      expect(next.allPlayerRoles).toEqual({ p1: "werewolf", p2: "robber" })
      expect(result).toEqual({ kind: "swapResult", newRole: "werewolf" })
      const log = next.nightActions[0]
      expect(log.cardChanges).toHaveLength(2)
      expect(log.cardChanges![0]).toMatchObject({
        targetId: "p1",
        fromRole: "robber",
        toRole: "werewolf",
      })
    })
  })

  describe("捣蛋鬼 troublemakerSwap", () => {
    it("交换两个玩家的身份（不看）", () => {
      const state = makeState({
        allPlayerRoles: {
          p1: "troublemaker",
          p2: "werewolf",
          p3: "seer",
        },
      })
      const { state: next, result } = applyNightAction(state, "p1", {
        kind: "troublemakerSwap",
        targetIds: ["p2", "p3"],
      })
      expect(next.allPlayerRoles).toEqual({
        p1: "troublemaker",
        p2: "seer",
        p3: "werewolf",
      })
      expect(result).toEqual({ kind: "noResult" })
    })

    it("选同一个玩家抛错", () => {
      const state = makeState({
        allPlayerRoles: { p1: "troublemaker", p2: "werewolf" },
      })
      expect(() =>
        applyNightAction(state, "p1", {
          kind: "troublemakerSwap",
          targetIds: ["p2", "p2"],
        }),
      ).toThrow()
    })
  })

  describe("酒鬼 drunkSwap", () => {
    it("与桌面牌交换身份，不看", () => {
      const state = makeState({
        allPlayerRoles: { p1: "drunk" },
        centerCards: ["tanner", "seer", "werewolf"],
      })
      const { state: next, result } = applyNightAction(state, "p1", {
        kind: "drunkSwap",
        centerIndex: 2,
      })
      expect(next.allPlayerRoles.p1).toBe("werewolf")
      expect(next.centerCards[2]).toBe("drunk")
      expect(result).toEqual({ kind: "noResult" })
    })
  })

  describe("失眠者 insomniacConfirm", () => {
    it("查看自己的当前身份（可能已被交换）", () => {
      const state = makeState({
        allPlayerRoles: { p1: "werewolf" }, // 假设已被强盗换成狼人
      })
      const { result } = applyNightAction(state, "p1", {
        kind: "insomniacConfirm",
      })
      expect(result).toEqual({
        kind: "rolesRevealed",
        roles: { p1: "werewolf" },
      })
    })
  })

  describe("多步骤串联", () => {
    it("强盗 → 捣蛋鬼 → 失眠者 的真实链路", () => {
      // 初始：p1 强盗, p2 狼人, p3 失眠者, p4 捣蛋鬼
      let state: HostGameState = makeState({
        allPlayerRoles: {
          p1: "robber",
          p2: "werewolf",
          p3: "insomniac",
          p4: "troublemaker",
        },
      })

      // 强盗 p1 抢走狼人 p2
      state = applyNightAction(state, "p1", {
        kind: "robberSwap",
        targetId: "p2",
      }).state
      expect(state.allPlayerRoles).toMatchObject({
        p1: "werewolf",
        p2: "robber",
      })

      // 捣蛋鬼 p4 交换 p2 和 p3
      state = applyNightAction(state, "p4", {
        kind: "troublemakerSwap",
        targetIds: ["p2", "p3"],
      }).state
      expect(state.allPlayerRoles).toMatchObject({
        p2: "insomniac",
        p3: "robber",
      })

      // 失眠者 p3 看自己
      const { result } = applyNightAction(state, "p3", {
        kind: "insomniacConfirm",
      })
      expect(result).toEqual({
        kind: "rolesRevealed",
        roles: { p3: "robber" },
      })
    })
  })
})

describe("applyTimeoutAction", () => {
  it("写入 timedOut 日志，不改变 roles/centerCards", () => {
    const state = makeState({
      allPlayerRoles: { p1: "robber", p2: "seer" },
    })
    const next = applyTimeoutAction(state, "p1", "swapWithPlayer")
    expect(next.allPlayerRoles).toEqual({ p1: "robber", p2: "seer" })
    expect(next.nightActions[0]).toMatchObject({
      actorId: "p1",
      actorRole: "robber",
      actionType: "swapWithPlayer",
      status: "timedOut",
      selectedTargets: [],
    })
  })
})

describe("immutability", () => {
  it("原 state 不被修改", () => {
    const roles: Record<string, Role> = { p1: "robber", p2: "werewolf" }
    const state = makeState({ allPlayerRoles: roles })
    const snapshot = JSON.parse(JSON.stringify(state))
    applyNightAction(state, "p1", {
      kind: "robberSwap",
      targetId: "p2",
    })
    expect(state).toEqual(snapshot)
  })
})
