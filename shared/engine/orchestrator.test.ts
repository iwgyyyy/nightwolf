import { describe, it, expect } from "vitest"
import {
  buildStartGameStates,
  StartGameError,
  handleConfirmIdentity,
  validateLobbyStart,
  buildPlayAgainStates,
  countRoles,
} from "./orchestrator"
import type { PlayerPublicInfo, PublicRoomState, Role } from "../types"

function makePublic(overrides: Partial<PublicRoomState> = {}): PublicRoomState {
  return {
    roomId: "ABCDEF",
    hostId: "p1",
    gamePhase: "waiting",
    settings: {
      roles: [],
      discussionTime: 5,
      actionTime: 30,
      voteTime: 30,
    },
    players: [],
    currentNightStep: null,
    phaseStartedAt: new Date().toISOString(),
    phaseEndsAt: null,
    narrationCueId: null,
    submittedPlayerIds: [],
    resultData: null,
    ...overrides,
  }
}

function player(id: string, name: string): PlayerPublicInfo {
  return { playerId: id, name, isConnected: true }
}

describe("buildStartGameStates", () => {
  it("3 人局：正确分配角色 + 3 张桌面牌", () => {
    const players = [
      player("p1", "A"),
      player("p2", "B"),
      player("p3", "C"),
    ]
    const roles: Role[] = [
      "werewolf",
      "seer",
      "villager",
      "robber",
      "tanner",
      "villager",
    ]
    const state = makePublic({
      players,
      settings: {
        roles,
        discussionTime: 5,
        actionTime: 30,
        voteTime: 30,
      },
    })

    const result = buildStartGameStates(state)

    expect(result.publicState.gamePhase).toBe("dealing")
    expect(result.publicState.phaseEndsAt).toBeTruthy()
    expect(Object.keys(result.hostState.allPlayerRoles)).toHaveLength(3)
    expect(result.hostState.centerCards).toHaveLength(3)
    expect(Object.keys(result.privateStates)).toHaveLength(3)
    for (const p of players) {
      const priv = result.privateStates[p.playerId]
      expect(priv.originalRole).toBe(priv.currentRole)
      expect(priv.nightActionRequest).toBeNull()
    }
  })

  it("角色数不匹配抛 ROLE_COUNT_MISMATCH", () => {
    const state = makePublic({
      players: [player("p1", "A"), player("p2", "B"), player("p3", "C")],
      settings: {
        roles: ["werewolf", "seer", "villager"], // 需要 6 张
        discussionTime: 5,
        actionTime: 30,
        voteTime: 30,
      },
    })
    expect(() => buildStartGameStates(state)).toThrow(StartGameError)
    try {
      buildStartGameStates(state)
    } catch (err) {
      expect((err as StartGameError).code).toBe("ROLE_COUNT_MISMATCH")
    }
  })

  it("少于 3 人抛 NOT_ENOUGH_PLAYERS", () => {
    const state = makePublic({
      players: [player("p1", "A"), player("p2", "B")],
      settings: {
        roles: ["werewolf", "seer", "villager", "robber", "tanner"],
        discussionTime: 5,
        actionTime: 30,
        voteTime: 30,
      },
    })
    expect(() => buildStartGameStates(state)).toThrow(/至少需要/)
  })

  it("非 waiting 阶段抛 BAD_PHASE", () => {
    const state = makePublic({ gamePhase: "night" })
    expect(() => buildStartGameStates(state)).toThrow(/当前阶段/)
  })
})

describe("handleConfirmIdentity", () => {
  it("提交后进入 submittedPlayerIds，未全部确认 allConfirmed=false", () => {
    const state = makePublic({
      gamePhase: "dealing",
      players: [player("p1", "A"), player("p2", "B")],
    })
    const { publicState, allConfirmed } = handleConfirmIdentity(state, "p1")
    expect(publicState.submittedPlayerIds).toEqual(["p1"])
    expect(allConfirmed).toBe(false)
  })

  it("所有在线玩家确认后 allConfirmed=true", () => {
    const state = makePublic({
      gamePhase: "dealing",
      players: [player("p1", "A"), player("p2", "B")],
      submittedPlayerIds: ["p1"],
    })
    const { allConfirmed } = handleConfirmIdentity(state, "p2")
    expect(allConfirmed).toBe(true)
  })

  it("非 dealing 阶段是 noop", () => {
    const state = makePublic({ gamePhase: "night" })
    const { publicState } = handleConfirmIdentity(state, "p1")
    expect(publicState).toBe(state)
  })

  it("重复提交幂等", () => {
    const state = makePublic({
      gamePhase: "dealing",
      players: [player("p1", "A")],
      submittedPlayerIds: ["p1"],
    })
    const { publicState } = handleConfirmIdentity(state, "p1")
    expect(publicState.submittedPlayerIds).toEqual(["p1"])
  })
})

describe("validateLobbyStart", () => {
  it("合法：3 人 + 6 张牌", () => {
    const v = validateLobbyStart(
      [player("p1", "A"), player("p2", "B"), player("p3", "C")],
      {
        roles: ["werewolf", "seer", "villager", "robber", "tanner", "villager"],
        discussionTime: 5,
        actionTime: 30,
        voteTime: 30,
      },
    )
    expect(v.canStart).toBe(true)
  })

  it("少于 3 人", () => {
    const v = validateLobbyStart(
      [player("p1", "A")],
      { roles: [], discussionTime: 5, actionTime: 30, voteTime: 30 },
    )
    expect(v.canStart).toBe(false)
  })

  it("角色数不匹配", () => {
    const v = validateLobbyStart(
      [player("p1", "A"), player("p2", "B"), player("p3", "C")],
      {
        roles: ["werewolf", "seer"],
        discussionTime: 5,
        actionTime: 30,
        voteTime: 30,
      },
    )
    expect(v.canStart).toBe(false)
    expect(v.reason).toContain("6")
  })
})

describe("buildPlayAgainStates", () => {
  it("重置为 waiting + 清空游戏数据", () => {
    const state = makePublic({
      gamePhase: "result",
      submittedPlayerIds: ["p1", "p2"],
      resultData: {
        votes: [],
        eliminatedPlayerIds: [],
        finalRoles: {},
        centerCards: [],
        nightActions: [],
        winner: "villagerWin",
      },
    })
    const { publicState } = buildPlayAgainStates(state)
    expect(publicState.gamePhase).toBe("waiting")
    expect(publicState.submittedPlayerIds).toEqual([])
    expect(publicState.resultData).toBeNull()
  })
})

describe("countRoles", () => {
  it("统计各角色数量", () => {
    expect(
      countRoles(["werewolf", "werewolf", "seer", "villager"]),
    ).toMatchObject({ werewolf: 2, seer: 1, villager: 1 })
  })
})
