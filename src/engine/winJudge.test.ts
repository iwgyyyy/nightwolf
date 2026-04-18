import { describe, it, expect } from "vitest"
import { judgeWin } from "./winJudge"
import type { Role } from "@/types"

describe("judgeWin", () => {
  it("优先级 1：被投出有皮匠 → tannerWin（即使也有狼人被投出）", () => {
    const finalRoles: Record<string, Role> = {
      p1: "tanner",
      p2: "werewolf",
      p3: "villager",
    }
    expect(judgeWin(["p1", "p2"], finalRoles)).toBe("tannerWin")
  })

  it("优先级 2：被投出有狼人 → villagerWin", () => {
    const finalRoles: Record<string, Role> = {
      p1: "werewolf",
      p2: "villager",
      p3: "seer",
    }
    expect(judgeWin(["p1"], finalRoles)).toBe("villagerWin")
  })

  it("优先级 3：有人被投出但没狼人/皮匠 → werewolfWin", () => {
    const finalRoles: Record<string, Role> = {
      p1: "villager",
      p2: "seer",
      p3: "werewolf",
    }
    expect(judgeWin(["p1"], finalRoles)).toBe("werewolfWin")
  })

  it("优先级 4：无人被投出但场上有狼人 → werewolfWin", () => {
    const finalRoles: Record<string, Role> = {
      p1: "werewolf",
      p2: "villager",
      p3: "seer",
    }
    expect(judgeWin([], finalRoles)).toBe("werewolfWin")
  })

  it("优先级 5：无人被投出且场上没狼人（都在桌面）→ villagerWin", () => {
    const finalRoles: Record<string, Role> = {
      p1: "villager",
      p2: "seer",
      p3: "robber",
    }
    expect(judgeWin([], finalRoles)).toBe("villagerWin")
  })

  it("爪牙被投出不算狼人被投出 → werewolfWin（如果没狼人被投）", () => {
    const finalRoles: Record<string, Role> = {
      p1: "minion",
      p2: "werewolf",
      p3: "seer",
    }
    // 只有爪牙 p1 被投出，没狼人被投出 → 按"有人被投出"走到优先级 3
    expect(judgeWin(["p1"], finalRoles)).toBe("werewolfWin")
  })

  it("猎人带走狼人 → villagerWin", () => {
    const finalRoles: Record<string, Role> = {
      p1: "hunter",
      p2: "werewolf",
      p3: "villager",
    }
    // 猎人 p1 被投出并带走狼人 p2
    expect(judgeWin(["p1", "p2"], finalRoles)).toBe("villagerWin")
  })

  it("猎人带走皮匠 → tannerWin（皮匠被投出优先级最高）", () => {
    const finalRoles: Record<string, Role> = {
      p1: "hunter",
      p2: "tanner",
      p3: "werewolf",
    }
    expect(judgeWin(["p1", "p2"], finalRoles)).toBe("tannerWin")
  })
})
