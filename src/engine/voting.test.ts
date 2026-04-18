import { describe, it, expect } from "vitest"
import { computeEliminated } from "./voting"
import type { Role, Vote } from "@/types"

describe("computeEliminated", () => {
  it("单人最高票出局", () => {
    const votes: Vote[] = [
      { voterId: "p1", targetId: "p2" },
      { voterId: "p2", targetId: "p3" },
      { voterId: "p3", targetId: "p2" },
    ]
    const roles: Record<string, Role> = {
      p1: "villager",
      p2: "werewolf",
      p3: "seer",
    }
    expect(computeEliminated(votes, roles)).toEqual(["p2"])
  })

  it("平票时所有最高票同时出局", () => {
    const votes: Vote[] = [
      { voterId: "p1", targetId: "p2" },
      { voterId: "p2", targetId: "p1" },
      { voterId: "p3", targetId: "p2" },
      { voterId: "p4", targetId: "p1" },
    ]
    const roles: Record<string, Role> = {
      p1: "villager",
      p2: "werewolf",
      p3: "seer",
      p4: "villager",
    }
    expect(new Set(computeEliminated(votes, roles))).toEqual(
      new Set(["p1", "p2"]),
    )
  })

  it("全弃票：无人出局", () => {
    const votes: Vote[] = [
      { voterId: "p1", targetId: null },
      { voterId: "p2", targetId: null },
      { voterId: "p3", targetId: null },
    ]
    expect(computeEliminated(votes, { p1: "villager", p2: "seer", p3: "werewolf" })).toEqual([])
  })

  it("完全平均（每人各一票且全部被投）：无人出局", () => {
    // 3 个玩家各投一人，每人各收到一票
    const votes: Vote[] = [
      { voterId: "p1", targetId: "p2" },
      { voterId: "p2", targetId: "p3" },
      { voterId: "p3", targetId: "p1" },
    ]
    expect(
      computeEliminated(votes, { p1: "villager", p2: "seer", p3: "werewolf" }),
    ).toEqual([])
  })

  it("猎人被出局时带走投票目标", () => {
    const votes: Vote[] = [
      { voterId: "p1", targetId: "p2" }, // 猎人 p1 投 p2
      { voterId: "p2", targetId: "p1" },
      { voterId: "p3", targetId: "p1" },
    ]
    const roles: Record<string, Role> = {
      p1: "hunter",
      p2: "villager",
      p3: "seer",
    }
    // p1 最高票出局，猎人带走 p2
    expect(new Set(computeEliminated(votes, roles))).toEqual(
      new Set(["p1", "p2"]),
    )
  })

  it("猎人弃票 → 只自己出局，不带走任何人", () => {
    const votes: Vote[] = [
      { voterId: "p1", targetId: null }, // 猎人 p1 弃票
      { voterId: "p2", targetId: "p1" },
      { voterId: "p3", targetId: "p1" },
    ]
    const roles: Record<string, Role> = {
      p1: "hunter",
      p2: "villager",
      p3: "seer",
    }
    expect(computeEliminated(votes, roles)).toEqual(["p1"])
  })

  it("弃票不参与票数统计", () => {
    const votes: Vote[] = [
      { voterId: "p1", targetId: "p2" },
      { voterId: "p2", targetId: null },
      { voterId: "p3", targetId: "p2" },
    ]
    expect(
      computeEliminated(votes, { p1: "villager", p2: "werewolf", p3: "seer" }),
    ).toEqual(["p2"])
  })
})
