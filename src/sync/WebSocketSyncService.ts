/**
 * WebSocketSyncService — 通过 WebSocket relay 实现 GameSyncService。
 *
 * 设计：
 *   - 订阅回调：按 (roomId, [playerId]) 维度维护 Set
 *   - createRoom 用 `requestId` 字典关联请求与响应
 *   - 收到广播消息后 dispatch 到对应回调
 *   - 记住最近一次 currentRoomId / player，支持断线重连时自动重发 joinRoom
 */

import { v4 as uuid } from "uuid"
import type {
  HostGameState,
  PlayerAction,
  PlayerPublicInfo,
  PrivatePlayerState,
  PublicRoomState,
  RoomSettings,
} from "@/types"
import type { AdminCredentials, GameSyncService, Unsubscribe } from "./GameSyncService"
import { SyncError, type SyncErrorCode } from "./GameSyncService"
import { WebSocketConnection } from "./WebSocketConnection"
import type { WSInbound } from "./WSMessage"

const CREATE_ROOM_TIMEOUT_MS = 10_000
const CONNECT_WAIT_TIMEOUT_MS = 5_000
const JOIN_ROOM_TIMEOUT_MS = 10_000

interface PendingCreateRoom {
  resolve: (roomId: string) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class WebSocketSyncService implements GameSyncService {
  private readonly connection: WebSocketConnection

  // 回调注册
  private publicCallbacks = new Map<string, Set<(s: PublicRoomState) => void>>()
  private hostCallbacks = new Map<string, Set<(s: HostGameState) => void>>()
  private privateCallbacks = new Map<
    string,
    Map<string, Set<(s: PrivatePlayerState) => void>>
  >()
  private actionCallbacks = new Map<
    string,
    Set<(playerId: string, action: PlayerAction) => void>
  >()
  private roomDeletedCallbacks = new Map<string, Set<() => void>>()

  // 状态缓存
  private cachedPublic = new Map<string, PublicRoomState>()
  private cachedHost = new Map<string, HostGameState>()
  private cachedPrivate = new Map<string, Map<string, PrivatePlayerState>>()

  // 挂起的 createRoom
  private pendingCreateRoom = new Map<string, PendingCreateRoom>()

  // 最近一次 join，用于重连自动恢复
  private lastJoin: { roomId: string; player: PlayerPublicInfo } | null = null
  // 通用最近一个错误（供全局错误处理用）
  private lastError: { code: SyncErrorCode; message: string } | null = null

  // 连接状态订阅
  private connectionCallbacks = new Set<
    (status: "connecting" | "connected" | "disconnected") => void
  >()
  private currentConnectionStatus:
    | "connecting"
    | "connected"
    | "disconnected" = "connecting"

  constructor(url: string) {
    this.connection = new WebSocketConnection(url, {
      onOpen: () => this.handleOpen(),
      onClose: () => this.setConnectionStatus("disconnected"),
      onMessage: (msg) => this.handleMessage(msg),
    })
    this.connection.connect()
  }

  private setConnectionStatus(
    status: "connecting" | "connected" | "disconnected",
  ): void {
    if (this.currentConnectionStatus === status) return
    this.currentConnectionStatus = status
    for (const cb of this.connectionCallbacks) cb(status)
  }

  // ========================================================
  // 内部：消息分发
  // ========================================================

  private handleOpen(): void {
    this.setConnectionStatus("connected")
    // 重连时自动重新 join
    if (this.lastJoin) {
      const { roomId, player } = this.lastJoin
      this.connection.send({
        type: "join_room",
        data: { roomId, player },
      })
    }
  }

  private handleMessage(msg: WSInbound): void {
    switch (msg.type) {
      case "room_created": {
        const rid = msg.data.requestId
        if (rid && this.pendingCreateRoom.has(rid)) {
          const pending = this.pendingCreateRoom.get(rid)!
          clearTimeout(pending.timer)
          pending.resolve(msg.data.roomId)
          this.pendingCreateRoom.delete(rid)
        }
        break
      }
      case "public_state": {
        const state = msg.data.state
        this.cachedPublic.set(state.roomId, state)
        this.dispatchPublic(state.roomId, state)
        break
      }
      case "private_state": {
        const roomId = this.lastJoin?.roomId
        if (!roomId) break
        const { playerId, state } = msg.data
        let map = this.cachedPrivate.get(roomId)
        if (!map) {
          map = new Map()
          this.cachedPrivate.set(roomId, map)
        }
        map.set(playerId, state)
        this.dispatchPrivate(roomId, playerId, state)
        break
      }
      case "host_state": {
        const roomId = this.lastJoin?.roomId
        if (!roomId) break
        this.cachedHost.set(roomId, msg.data.state)
        this.dispatchHost(roomId, msg.data.state)
        break
      }
      case "player_action": {
        const roomId = this.lastJoin?.roomId
        if (!roomId) break
        this.dispatchAction(roomId, msg.data.playerId, msg.data.action)
        break
      }
      case "room_deleted":
        this.dispatchRoomDeleted(msg.data.roomId)
        this.cleanupRoom(msg.data.roomId)
        break
      case "error":
        this.lastError = {
          code: msg.data.code ?? "UNKNOWN",
          message: msg.data.message,
        }
        // 若是 createRoom 阶段的错误（无 requestId 关联时），拒绝所有挂起
        for (const [rid, pending] of this.pendingCreateRoom) {
          clearTimeout(pending.timer)
          pending.reject(
            new SyncError(msg.data.message, msg.data.code ?? "UNKNOWN"),
          )
          this.pendingCreateRoom.delete(rid)
        }
        break
      case "pong":
        break
    }
  }

  // ========================================================
  // GameSyncService 实现
  // ========================================================

  private async waitUntilOpen(timeoutMs = CONNECT_WAIT_TIMEOUT_MS): Promise<void> {
    if (this.connection.isOpen) return
    const start = Date.now()
    while (!this.connection.isOpen) {
      if (Date.now() - start > timeoutMs) {
        throw new SyncError("WebSocket 连接超时", "DISCONNECTED")
      }
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  async createRoom(
    hostId: string,
    settings: RoomSettings,
    adminCredentials?: AdminCredentials,
  ): Promise<string> {
    await this.waitUntilOpen()
    const requestId = uuid()
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCreateRoom.delete(requestId)
        reject(new SyncError("创建房间超时", "TIMEOUT"))
      }, CREATE_ROOM_TIMEOUT_MS)

      this.pendingCreateRoom.set(requestId, { resolve, reject, timer })

      const ok = this.connection.send({
        type: "create_room",
        data: { requestId, hostId, settings, adminCredentials },
      })
      if (!ok) {
        clearTimeout(timer)
        this.pendingCreateRoom.delete(requestId)
        reject(new SyncError("WebSocket 未连接", "DISCONNECTED"))
      }
    })
  }

  async joinRoom(roomId: string, player: PlayerPublicInfo): Promise<void> {
    this.lastJoin = { roomId, player }
    this.lastError = null

    // 无痕页面首次打开时 ws 握手可能尚未完成，需要等到连接 open。
    // 若连接原本就是 open，这里不触发 handleOpen，需要自己发 join_room；
    // 若连接从未 open 过，waitUntilOpen 返回后 handleOpen 已经自动发送过了。
    const wasOpen = this.connection.isOpen
    await this.waitUntilOpen()
    if (wasOpen) {
      this.connection.send({
        type: "join_room",
        data: { roomId, player },
      })
    }

    // 等待：要么收到 public_state 广播（成功），要么 error（失败）
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new SyncError("加入房间超时", "TIMEOUT"))
      }, JOIN_ROOM_TIMEOUT_MS)

      const off = this.onPublicStateChanged(roomId, (state) => {
        if (state.roomId === roomId) {
          cleanup()
          resolve()
        }
      })

      // 轮询 lastError
      const errorChecker = setInterval(() => {
        if (this.lastError) {
          cleanup()
          const e = this.lastError
          this.lastError = null
          reject(new SyncError(e.message, e.code))
        }
      }, 50)

      const cleanup = () => {
        clearTimeout(timeout)
        clearInterval(errorChecker)
        off()
      }
    })
  }

  async leaveRoom(roomId: string, playerId: string): Promise<void> {
    this.connection.send({
      type: "leave_room",
      data: { roomId, playerId },
    })
    if (this.lastJoin?.roomId === roomId) this.lastJoin = null
    this.cleanupRoom(roomId)
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.connection.send({
      type: "delete_room",
      data: { roomId },
    })
    if (this.lastJoin?.roomId === roomId) this.lastJoin = null
    this.cleanupRoom(roomId)
  }

  async updatePublicState(
    roomId: string,
    state: PublicRoomState,
  ): Promise<void> {
    this.connection.send({
      type: "update_public_state",
      data: { roomId, state },
    })
  }

  onPublicStateChanged(
    roomId: string,
    callback: (state: PublicRoomState) => void,
  ): Unsubscribe {
    const set = this.publicCallbacks.get(roomId) ?? new Set()
    set.add(callback)
    this.publicCallbacks.set(roomId, set)

    const cached = this.cachedPublic.get(roomId)
    if (cached) queueMicrotask(() => callback(cached))

    return () => {
      set.delete(callback)
      if (set.size === 0) this.publicCallbacks.delete(roomId)
    }
  }

  async updatePrivateState(
    roomId: string,
    playerId: string,
    state: PrivatePlayerState,
  ): Promise<void> {
    this.connection.send({
      type: "update_private_state",
      data: { roomId, playerId, state },
    })
  }

  onPrivateStateChanged(
    roomId: string,
    playerId: string,
    callback: (state: PrivatePlayerState) => void,
  ): Unsubscribe {
    const roomMap = this.privateCallbacks.get(roomId) ?? new Map()
    const set = roomMap.get(playerId) ?? new Set()
    set.add(callback)
    roomMap.set(playerId, set)
    this.privateCallbacks.set(roomId, roomMap)

    const cached = this.cachedPrivate.get(roomId)?.get(playerId)
    if (cached) queueMicrotask(() => callback(cached))

    return () => {
      set.delete(callback)
      if (set.size === 0) roomMap.delete(playerId)
      if (roomMap.size === 0) this.privateCallbacks.delete(roomId)
    }
  }

  async updateHostState(roomId: string, state: HostGameState): Promise<void> {
    this.connection.send({
      type: "update_host_state",
      data: { roomId, state },
    })
  }

  onHostStateChanged(
    roomId: string,
    callback: (state: HostGameState) => void,
  ): Unsubscribe {
    const set = this.hostCallbacks.get(roomId) ?? new Set()
    set.add(callback)
    this.hostCallbacks.set(roomId, set)

    const cached = this.cachedHost.get(roomId)
    if (cached) queueMicrotask(() => callback(cached))

    return () => {
      set.delete(callback)
      if (set.size === 0) this.hostCallbacks.delete(roomId)
    }
  }

  async submitAction(
    roomId: string,
    playerId: string,
    action: PlayerAction,
  ): Promise<void> {
    this.connection.send({
      type: "submit_action",
      data: { roomId, playerId, action },
    })
  }

  onActionReceived(
    roomId: string,
    callback: (playerId: string, action: PlayerAction) => void,
  ): Unsubscribe {
    const set = this.actionCallbacks.get(roomId) ?? new Set()
    set.add(callback)
    this.actionCallbacks.set(roomId, set)
    return () => {
      set.delete(callback)
      if (set.size === 0) this.actionCallbacks.delete(roomId)
    }
  }

  onRoomDeleted(roomId: string, callback: () => void): Unsubscribe {
    const set = this.roomDeletedCallbacks.get(roomId) ?? new Set()
    set.add(callback)
    this.roomDeletedCallbacks.set(roomId, set)
    return () => {
      set.delete(callback)
      if (set.size === 0) this.roomDeletedCallbacks.delete(roomId)
    }
  }

  onConnectionChange(
    callback: (status: "connecting" | "connected" | "disconnected") => void,
  ): Unsubscribe {
    this.connectionCallbacks.add(callback)
    // 首次订阅立即推送当前状态
    queueMicrotask(() => callback(this.currentConnectionStatus))
    return () => {
      this.connectionCallbacks.delete(callback)
    }
  }

  dispose(): void {
    this.connection.disconnect()
    for (const pending of this.pendingCreateRoom.values()) {
      clearTimeout(pending.timer)
      pending.reject(new SyncError("已断开", "DISCONNECTED"))
    }
    this.pendingCreateRoom.clear()
    this.publicCallbacks.clear()
    this.hostCallbacks.clear()
    this.privateCallbacks.clear()
    this.actionCallbacks.clear()
    this.roomDeletedCallbacks.clear()
  }

  // ========================================================
  // dispatch helpers
  // ========================================================

  private dispatchPublic(roomId: string, state: PublicRoomState): void {
    const set = this.publicCallbacks.get(roomId)
    if (!set) return
    for (const cb of set) cb(state)
  }

  private dispatchPrivate(
    roomId: string,
    playerId: string,
    state: PrivatePlayerState,
  ): void {
    const set = this.privateCallbacks.get(roomId)?.get(playerId)
    if (!set) return
    for (const cb of set) cb(state)
  }

  private dispatchHost(roomId: string, state: HostGameState): void {
    const set = this.hostCallbacks.get(roomId)
    if (!set) return
    for (const cb of set) cb(state)
  }

  private dispatchAction(
    roomId: string,
    playerId: string,
    action: PlayerAction,
  ): void {
    const set = this.actionCallbacks.get(roomId)
    if (!set) return
    for (const cb of set) cb(playerId, action)
  }

  private dispatchRoomDeleted(roomId: string): void {
    const set = this.roomDeletedCallbacks.get(roomId)
    if (!set) return
    for (const cb of set) cb()
  }

  private cleanupRoom(roomId: string): void {
    this.cachedPublic.delete(roomId)
    this.cachedHost.delete(roomId)
    this.cachedPrivate.delete(roomId)
    this.publicCallbacks.delete(roomId)
    this.hostCallbacks.delete(roomId)
    this.privateCallbacks.delete(roomId)
    this.actionCallbacks.delete(roomId)
    this.roomDeletedCallbacks.delete(roomId)
  }
}
