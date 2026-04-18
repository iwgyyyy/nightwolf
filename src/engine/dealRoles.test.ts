import { describe, it, expect } from "vitest"
import { dealRoles } from "./dealRoles"
import type { Role } from "@/types"

describe("dealRoles", () => {
  const identityShuffle = <T>(arr: T[]): T[] => [...arr]

  it("每个玩家拿到一张牌，剩 3 张桌面牌", () => {
    const playerIds = ["p1", "p2", "p3"]
    const roles: Role[] = [
      "werewolf",
      "werewolf",
      "seer",
      "robber",
      "villager",
      "villager",
    ]
    const { playerRoles, centerCards } = dealRoles(
      playerIds,
      roles,
      identityShuffle,
    )

    expect(Object.keys(playerRoles)).toHaveLength(3)
    expect(centerCards).toHaveLength(3)
  })

  it("角色数不匹配时抛出", () => {
    expect(() =>
      dealRoles(["p1", "p2"], ["werewolf", "seer", "villager"]),
    ).toThrow(/角色数不匹配/)
  })

  it("所有角色都被分配，无重复、无遗漏", () => {
    const playerIds = ["p1", "p2"]
    const roles: Role[] = [
      "werewolf",
      "seer",
      "villager",
      "robber",
      "tanner",
    ]
    const { playerRoles, centerCards } = dealRoles(
      playerIds,
      roles,
      identityShuffle,
    )
    const allDealt = [...Object.values(playerRoles), ...centerCards]
    expect(allDealt.sort()).toEqual([...roles].sort())
  })

  it("identityShuffle 下：前 N 张分给玩家，后 3 张为桌面", () => {
    const playerIds = ["p1", "p2"]
    const roles: Role[] = [
      "werewolf",
      "seer",
      "villager",
      "robber",
      "tanner",
    ]
    const { playerRoles, centerCards } = dealRoles(
      playerIds,
      roles,
      identityShuffle,
    )
    expect(playerRoles.p1).toBe("werewolf")
    expect(playerRoles.p2).toBe("seer")
    expect(centerCards).toEqual(["villager", "robber", "tanner"])
  })

  it("不修改原 roles 数组", () => {
    const roles: Role[] = [
      "werewolf",
      "seer",
      "villager",
      "robber",
      "tanner",
    ]
    const copy = [...roles]
    dealRoles(["p1", "p2"], roles, identityShuffle)
    expect(roles).toEqual(copy)
  })
})
