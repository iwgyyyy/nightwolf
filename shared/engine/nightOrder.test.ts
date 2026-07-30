import { describe, it, expect } from "vitest"
import { buildNightSteps } from "./nightOrder"

describe("buildNightSteps", () => {
  it("按固定顺序返回本局存在的夜晚角色", () => {
    expect(buildNightSteps(["werewolf", "seer", "robber"])).toEqual([
      "werewolf",
      "seer",
      "robber",
    ])
  })

  it("狼人在爪牙之前", () => {
    expect(buildNightSteps(["minion", "werewolf"])).toEqual([
      "werewolf",
      "minion",
    ])
  })

  it("没有夜晚操作的角色（村民/猎人/皮匠）不生成步骤", () => {
    expect(buildNightSteps(["villager", "hunter", "tanner"])).toEqual([])
  })

  it("多狼只生成一步（狼人共用同一次唤醒）", () => {
    expect(buildNightSteps(["werewolf", "werewolf", "seer"])).toEqual([
      "werewolf",
      "seer",
    ])
  })

  it("完整 7 步：所有夜晚角色都在池中时", () => {
    expect(
      buildNightSteps([
        "werewolf",
        "minion",
        "seer",
        "robber",
        "troublemaker",
        "drunk",
        "insomniac",
      ]),
    ).toEqual([
      "werewolf",
      "minion",
      "seer",
      "robber",
      "troublemaker",
      "drunk",
      "insomniac",
    ])
  })

  it("角色仅在桌面（未被玩家抽到）仍然生成步骤", () => {
    // 玩家都是村民，桌面里有预言家和强盗 → 仍然念"预言家请睁眼"等
    expect(
      buildNightSteps(["villager", "villager", "villager", "seer", "robber", "villager"]),
    ).toEqual(["seer", "robber"])
  })
})
