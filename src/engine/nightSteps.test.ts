import { describe, it, expect } from "vitest"
import {
  buildNightActionRequest,
  getActorsForStep,
  isAllNightStepsDone,
  isCurrentStepComplete,
  nightStepsFor,
} from "./nightSteps"
import { buildNightSteps } from "./nightOrder"
import type {
  HostGameState,
  PublicRoomState,
  Role,
} from "@/types"

function makeHost(overrides: Partial<HostGameState> = {}): HostGameState {
  return {
    allPlayerRoles: {},
    originalRoles: {},
    centerCards: ["villager", "villager", "villager"],
    nightActions: [],
    nightStepIndex: 0,
    playerActionStatus: {},
    votes: [],
    ...overrides,
  }
}

function makePublic(overrides: Partial<PublicRoomState> = {}): PublicRoomState {
  return {
    roomId: "ABCDEF",
    hostId: "p1",
    gamePhase: "night",
    settings: {
      roles: [],
      discussionTime: 5,
      actionTime: 30,
      voteTime: 30,
    },
    players: [],
    currentNightStep: 0,
    phaseStartedAt: new Date().toISOString(),
    phaseEndsAt: null,
    isPaused: false,
    pauseRemainingSeconds: null,
    submittedPlayerIds: [],
    resultData: null,
    ...overrides,
  }
}

const ROLES: Role[] = [
  "werewolf",
  "minion",
  "seer",
  "robber",
  "troublemaker",
  "drunk",
  "insomniac",
]

describe("nightStepsFor", () => {
  it("返回按夜晚顺序的本局存在角色", () => {
    const host = makeHost({
      originalRoles: { p1: "seer", p2: "werewolf", p3: "robber" },
    })
    expect(nightStepsFor(host)).toEqual(["werewolf", "seer", "robber"])
  })

  it("与客户端 buildNightSteps(settings.roles) 顺序完全一致（防止顶部文本和语音不符）", () => {
    // 模拟一个 2狼+1强盗+1预言家+2村民+1捣蛋鬼 的配置（7 张）
    const settingsRoles: Role[] = [
      "werewolf",
      "werewolf",
      "robber",
      "seer",
      "villager",
      "villager",
      "troublemaker",
    ]
    // Host 视角：玩家拿到 4 张，桌面 3 张
    const host = makeHost({
      originalRoles: {
        p1: "werewolf",
        p2: "werewolf",
        p3: "robber",
        p4: "seer",
      },
      centerCards: ["villager", "villager", "troublemaker"],
    })
    const hostSteps = nightStepsFor(host)
    const clientSteps = buildNightSteps(settingsRoles)
    expect(hostSteps).toEqual(clientSteps)
    expect(hostSteps).toEqual([
      "werewolf",
      "seer",
      "robber",
      "troublemaker",
    ])
  })

  it("所有夜晚角色都在时的完整顺序", () => {
    const host = makeHost({
      originalRoles: {
        p1: "werewolf",
        p2: "minion",
        p3: "seer",
        p4: "robber",
        p5: "troublemaker",
        p6: "drunk",
        p7: "insomniac",
      },
    })
    expect(nightStepsFor(host)).toEqual(ROLES)
  })
})

describe("getActorsForStep", () => {
  it("多狼返回所有狼人 ids", () => {
    const host = makeHost({
      originalRoles: { p1: "werewolf", p2: "werewolf", p3: "seer" },
    })
    expect(getActorsForStep("werewolf", host).sort()).toEqual(["p1", "p2"])
  })

  it("其他角色返回单一玩家", () => {
    const host = makeHost({
      originalRoles: { p1: "werewolf", p2: "seer" },
    })
    expect(getActorsForStep("seer", host)).toEqual(["p2"])
  })

  it("基于 originalRoles 而非当前身份（即使强盗换了牌）", () => {
    const host = makeHost({
      originalRoles: { p1: "robber", p2: "werewolf" },
      allPlayerRoles: { p1: "werewolf", p2: "robber" }, // 强盗换过
    })
    // 夜晚"强盗"步骤仍是 p1 行动
    expect(getActorsForStep("robber", host)).toEqual(["p1"])
  })
})

describe("buildNightActionRequest", () => {
  it("爪牙请求包含所有狼人", () => {
    const host = makeHost({
      originalRoles: { p1: "minion", p2: "werewolf", p3: "werewolf" },
      allPlayerRoles: { p1: "minion", p2: "werewolf", p3: "werewolf" },
    })
    const pub = makePublic({
      players: ["p1", "p2", "p3"].map((id) => ({
        playerId: id,
        name: id,
        isConnected: true,
      })),
    })
    const req = buildNightActionRequest("p1", "minion", pub, host)
    expect(req).toEqual({
      kind: "minionView",
      werewolfPlayers: ["p2", "p3"],
    })
  })

  it("多狼返回 werewolfConfirm 含其他狼人", () => {
    const host = makeHost({
      originalRoles: { p1: "werewolf", p2: "werewolf", p3: "seer" },
      allPlayerRoles: { p1: "werewolf", p2: "werewolf", p3: "seer" },
    })
    const pub = makePublic()
    const req = buildNightActionRequest("p1", "werewolf", pub, host)
    expect(req).toEqual({
      kind: "werewolfConfirm",
      otherWerewolves: ["p2"],
    })
  })

  it("独狼返回 loneWerewolf 可跳过", () => {
    const host = makeHost({
      originalRoles: { p1: "werewolf", p2: "seer" },
    })
    const pub = makePublic()
    const req = buildNightActionRequest("p1", "werewolf", pub, host)
    expect(req).toEqual({
      kind: "loneWerewolf",
      centerCardIndices: [0, 1, 2],
      canSkip: true,
    })
  })

  it("预言家返回二选一请求（不含自己）", () => {
    const host = makeHost({
      originalRoles: { p1: "seer", p2: "werewolf", p3: "villager" },
    })
    const pub = makePublic({
      players: ["p1", "p2", "p3"].map((id) => ({
        playerId: id,
        name: id,
        isConnected: true,
      })),
    })
    const req = buildNightActionRequest("p1", "seer", pub, host)
    expect(req).toEqual({
      kind: "seerChoice",
      playerTargets: ["p2", "p3"],
      centerCardIndices: [0, 1, 2],
    })
  })

  it("强盗/捣蛋鬼 playerTargets 排除自己", () => {
    const host = makeHost({
      originalRoles: { p1: "robber", p2: "werewolf", p3: "villager" },
    })
    const pub = makePublic({
      players: ["p1", "p2", "p3"].map((id) => ({
        playerId: id,
        name: id,
        isConnected: true,
      })),
    })
    expect(buildNightActionRequest("p1", "robber", pub, host)).toEqual({
      kind: "robberSwap",
      playerTargets: ["p2", "p3"],
    })
  })

  it("酒鬼只返回桌面牌下标", () => {
    const host = makeHost({
      originalRoles: { p1: "drunk" },
    })
    const pub = makePublic()
    expect(buildNightActionRequest("p1", "drunk", pub, host)).toEqual({
      kind: "drunkSwap",
      centerCardIndices: [0, 1, 2],
    })
  })

  it("失眠者返回 insomniacView", () => {
    const host = makeHost({ originalRoles: { p1: "insomniac" } })
    const pub = makePublic()
    expect(buildNightActionRequest("p1", "insomniac", pub, host)).toEqual({
      kind: "insomniacView",
    })
  })

  it("actor 初始身份与 stepRole 不匹配时返回 null", () => {
    const host = makeHost({ originalRoles: { p1: "villager" } })
    const pub = makePublic()
    expect(buildNightActionRequest("p1", "seer", pub, host)).toBeNull()
  })
})

describe("isCurrentStepComplete / isAllNightStepsDone", () => {
  it("多狼都提交后当前步骤完成", () => {
    const host = makeHost({
      originalRoles: { p1: "werewolf", p2: "werewolf", p3: "seer" },
      nightStepIndex: 0,
    })
    const pub = makePublic({ submittedPlayerIds: ["p1", "p2"] })
    expect(isCurrentStepComplete(pub, host)).toBe(true)
  })

  it("多狼只一个提交时未完成", () => {
    const host = makeHost({
      originalRoles: { p1: "werewolf", p2: "werewolf" },
      nightStepIndex: 0,
    })
    const pub = makePublic({ submittedPlayerIds: ["p1"] })
    expect(isCurrentStepComplete(pub, host)).toBe(false)
  })

  it("索引越界算完成", () => {
    const host = makeHost({
      originalRoles: { p1: "werewolf" },
      nightStepIndex: 5,
    })
    expect(isAllNightStepsDone(host)).toBe(true)
  })
})
