import { beforeEach, describe, expect, it } from "vitest"
import { InMemorySyncService } from "./InMemorySyncService"
import type { PlayerPublicInfo, RoomSettings } from "@/types"

const ADMIN = { username: "superadmin", password: "952738" }

const SETTINGS: RoomSettings = {
  roles: ["werewolf", "villager", "seer"],
  discussionTime: 5,
  actionTime: 30,
  voteTime: 30,
}

function player(id: string, name: string): PlayerPublicInfo {
  return { playerId: id, name, isConnected: true }
}

describe("InMemorySyncService", () => {
  let service: InMemorySyncService

  beforeEach(() => {
    // jsdom 某些版本的 localStorage.clear 有兼容问题，手工清理
    for (const key of Object.keys(localStorage)) {
      localStorage.removeItem(key)
    }
    service = new InMemorySyncService()
  })

  describe("createRoom", () => {
    it("无凭证抛 UNAUTHORIZED", async () => {
      await expect(service.createRoom("host1", SETTINGS)).rejects.toThrow(
        /管理员凭证/,
      )
    })

    it("错误凭证抛 UNAUTHORIZED", async () => {
      await expect(
        service.createRoom("host1", SETTINGS, {
          username: "wrong",
          password: "wrong",
        }),
      ).rejects.toThrow(/凭证无效/)
    })

    it("正确凭证返回 6 位房间 ID，初始 waiting 状态", async () => {
      const roomId = await service.createRoom("host1", SETTINGS, ADMIN)
      expect(roomId).toHaveLength(6)

      // 校验 localStorage 中有初始 PublicRoomState
      const raw = localStorage.getItem(`nightwolf:room:${roomId}:public`)
      expect(raw).toBeTruthy()
      const state = JSON.parse(raw!)
      expect(state.gamePhase).toBe("waiting")
      expect(state.hostId).toBe("host1")
      expect(state.players).toEqual([])
    })
  })

  describe("joinRoom / onPublicStateChanged", () => {
    it("玩家加入后 public state 包含该玩家，回调被触发", async () => {
      const roomId = await service.createRoom("host1", SETTINGS, ADMIN)

      let received: PlayerPublicInfo[] | null = null
      service.onPublicStateChanged(roomId, (s) => {
        received = s.players
      })

      await service.joinRoom(roomId, player("p1", "Alice"))
      await service.joinRoom(roomId, player("p2", "Bob"))

      expect(received).toEqual([
        { playerId: "p1", name: "Alice", isConnected: true },
        { playerId: "p2", name: "Bob", isConnected: true },
      ])
    })

    it("加入不存在的房间抛 ROOM_NOT_FOUND", async () => {
      await expect(
        service.joinRoom("NOTEXIS", player("p1", "A")),
      ).rejects.toMatchObject({ code: "ROOM_NOT_FOUND" })
    })

    it("游戏进行中的新玩家加入抛 GAME_IN_PROGRESS", async () => {
      const roomId = await service.createRoom("host1", SETTINGS, ADMIN)
      await service.joinRoom(roomId, player("host1", "Host"))
      // 手动切到 night 阶段
      const cur = JSON.parse(
        localStorage.getItem(`nightwolf:room:${roomId}:public`)!,
      )
      cur.gamePhase = "night"
      localStorage.setItem(
        `nightwolf:room:${roomId}:public`,
        JSON.stringify(cur),
      )
      await expect(
        service.joinRoom(roomId, player("stranger", "陌生人")),
      ).rejects.toMatchObject({ code: "GAME_IN_PROGRESS" })
    })

    it("游戏进行中原玩家允许重连", async () => {
      const roomId = await service.createRoom("host1", SETTINGS, ADMIN)
      await service.joinRoom(roomId, player("p1", "Alice"))
      const cur = JSON.parse(
        localStorage.getItem(`nightwolf:room:${roomId}:public`)!,
      )
      cur.gamePhase = "night"
      localStorage.setItem(
        `nightwolf:room:${roomId}:public`,
        JSON.stringify(cur),
      )
      await expect(
        service.joinRoom(roomId, player("p1", "Alice")),
      ).resolves.toBeUndefined()
    })

    it("同 playerId 多次 join 会更新（upsert）", async () => {
      const roomId = await service.createRoom("host1", SETTINGS, ADMIN)
      await service.joinRoom(roomId, player("p1", "Alice"))
      await service.joinRoom(roomId, player("p1", "Alice改名"))

      const raw = localStorage.getItem(`nightwolf:room:${roomId}:public`)
      const state = JSON.parse(raw!)
      expect(state.players).toHaveLength(1)
      expect(state.players[0].name).toBe("Alice改名")
    })
  })

  describe("leaveRoom", () => {
    it("玩家离开后从 players 移除", async () => {
      const roomId = await service.createRoom("host1", SETTINGS, ADMIN)
      await service.joinRoom(roomId, player("p1", "Alice"))
      await service.joinRoom(roomId, player("p2", "Bob"))
      await service.leaveRoom(roomId, "p1")

      const raw = localStorage.getItem(`nightwolf:room:${roomId}:public`)
      const state = JSON.parse(raw!)
      expect(state.players).toHaveLength(1)
      expect(state.players[0].playerId).toBe("p2")
    })
  })

  describe("deleteRoom", () => {
    it("解散后所有相关 key 被清除，订阅者收到通知", async () => {
      const roomId = await service.createRoom("host1", SETTINGS, ADMIN)
      await service.joinRoom(roomId, player("p1", "A"))

      let deleted = false
      service.onRoomDeleted(roomId, () => {
        deleted = true
      })

      await service.deleteRoom(roomId)
      expect(deleted).toBe(true)
      expect(localStorage.getItem(`nightwolf:room:${roomId}:public`)).toBeNull()
    })
  })

  describe("submitAction / onActionReceived", () => {
    it("action 本地回调也触发（Host 可能在同 tab）", async () => {
      const roomId = await service.createRoom("host1", SETTINGS, ADMIN)
      const received: Array<{ pid: string; kind: string }> = []
      service.onActionReceived(roomId, (pid, action) => {
        received.push({ pid, kind: action.kind })
      })
      await service.submitAction(roomId, "p1", { kind: "confirmIdentity" })
      expect(received).toEqual([{ pid: "p1", kind: "confirmIdentity" }])
    })
  })

  describe("unsubscribe", () => {
    it("取消订阅后不再收到回调", async () => {
      const roomId = await service.createRoom("host1", SETTINGS, ADMIN)
      let count = 0
      const unsub = service.onPublicStateChanged(roomId, () => {
        count++
      })
      // 等待 queueMicrotask 的首次回调
      await Promise.resolve()
      expect(count).toBe(1)

      unsub()
      await service.joinRoom(roomId, player("p1", "A"))
      expect(count).toBe(1)
    })
  })
})
