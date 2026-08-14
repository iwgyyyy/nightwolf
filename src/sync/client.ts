/**
 * 与服务端权威游戏服务的连接。
 *
 * 与旧 WebSocketSyncService 的区别：客户端不再拥有任何写状态的能力。
 * 没有 updatePublicState / updateHostState / updatePrivateState ——
 * 只能上报意图（player_action / host_command），状态一律由服务端下发。
 */

import { v4 as uuid } from "uuid"
import type {
  PlayerAction,
  PlayerPublicInfo,
  PrivatePlayerState,
  PublicRoomState,
  RoomSettings,
} from "@/types"
import type { HostCommand, ServerMessage, SyncErrorCode } from "@/protocol"
import { WebSocketConnection } from "./WebSocketConnection"

const REQUEST_TIMEOUT_MS = 10_000
const CONNECT_WAIT_TIMEOUT_MS = 5_000

export type Unsubscribe = () => void
export type ConnectionStatus = "connecting" | "connected" | "disconnected"

export class SyncError extends Error {
  readonly code: SyncErrorCode
  constructor(message: string, code: SyncErrorCode) {
    super(message)
    this.name = "SyncError"
    this.code = code
  }
}

export interface AdminToken {
  token: string
  expiresAt: string
}

interface Pending<T> {
  resolve: (value: T) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class NightwolfClient {
  private readonly connection: WebSocketConnection

  private publicCallbacks = new Map<string, Set<(s: PublicRoomState) => void>>()
  private privateCallbacks = new Set<(s: PrivatePlayerState) => void>()
  private roomDeletedCallbacks = new Map<string, Set<() => void>>()
  private connectionCallbacks = new Set<(status: ConnectionStatus) => void>()
  private voiceCallbacks = new Set<(fromId: string, signal: unknown) => void>()

  private cachedPublic = new Map<string, PublicRoomState>()
  private cachedPrivate: PrivatePlayerState | null = null

  private pendingCreateRoom = new Map<string, Pending<string>>()
  private pendingAuth: Pending<AdminToken> | null = null
  /** 等待 join 结果：resolve 于首个 public_state，reject 于 error */
  private pendingJoin: Pending<void> | null = null

  /** 断线重连后自动重新 join */
  private lastJoin: { roomId: string; player: PlayerPublicInfo } | null = null
  private status: ConnectionStatus = "connecting"

  constructor(url: string) {
    this.connection = new WebSocketConnection(url, {
      onOpen: () => this.handleOpen(),
      onClose: () => this.setStatus("disconnected"),
      onMessage: (msg) => this.handleMessage(msg),
    })
    this.connection.connect()
  }

  // ========================================================
  // 连接
  // ========================================================

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return
    this.status = status
    for (const cb of this.connectionCallbacks) cb(status)
  }

  private handleOpen(): void {
    this.setStatus("connected")
    if (this.lastJoin) {
      const { roomId, player } = this.lastJoin
      this.connection.send({ type: "join_room", data: { roomId, player } })
    }
  }

  onConnectionChange(cb: (status: ConnectionStatus) => void): Unsubscribe {
    this.connectionCallbacks.add(cb)
    cb(this.status)
    return () => this.connectionCallbacks.delete(cb)
  }

  private async waitUntilOpen(timeoutMs = CONNECT_WAIT_TIMEOUT_MS): Promise<void> {
    const start = Date.now()
    while (!this.connection.isOpen) {
      if (Date.now() - start > timeoutMs) {
        throw new SyncError("WebSocket 未连接", "DISCONNECTED")
      }
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  // ========================================================
  // 消息分发
  // ========================================================

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "admin_token": {
        this.settle(this.pendingAuth, msg.data)
        this.pendingAuth = null
        return
      }
      case "room_created": {
        const pending = this.pendingCreateRoom.get(msg.data.requestId)
        if (pending) {
          this.pendingCreateRoom.delete(msg.data.requestId)
          this.settle(pending, msg.data.roomId)
        }
        return
      }
      case "public_state": {
        const state = msg.data.state
        this.cachedPublic.set(state.roomId, state)
        if (this.pendingJoin) {
          this.settle(this.pendingJoin, undefined)
          this.pendingJoin = null
        }
        const cbs = this.publicCallbacks.get(state.roomId)
        if (cbs) for (const cb of cbs) cb(state)
        return
      }
      case "private_state": {
        // 服务端单播，收到的必然是自己那份
        this.cachedPrivate = msg.data.state
        for (const cb of this.privateCallbacks) cb(msg.data.state)
        return
      }
      case "room_deleted": {
        const cbs = this.roomDeletedCallbacks.get(msg.data.roomId)
        if (cbs) for (const cb of cbs) cb()
        return
      }
      case "error": {
        const err = new SyncError(msg.data.message, msg.data.code)
        // 有 requestId 的定向失败优先派给对应请求
        if (msg.data.requestId) {
          const pending = this.pendingCreateRoom.get(msg.data.requestId)
          if (pending) {
            this.pendingCreateRoom.delete(msg.data.requestId)
            this.fail(pending, err)
            return
          }
        }
        if (this.pendingAuth) {
          this.fail(this.pendingAuth, err)
          this.pendingAuth = null
          return
        }
        if (this.pendingJoin) {
          this.fail(this.pendingJoin, err)
          this.pendingJoin = null
          return
        }
        return
      }
      case "voice_signal": {
        for (const cb of this.voiceCallbacks)
          cb(msg.data.fromId, msg.data.signal)
        return
      }
      case "pong":
        return
    }
  }

  private settle<T>(pending: Pending<T> | null, value: T): void {
    if (!pending) return
    clearTimeout(pending.timer)
    pending.resolve(value)
  }

  private fail<T>(pending: Pending<T> | null, err: Error): void {
    if (!pending) return
    clearTimeout(pending.timer)
    pending.reject(err)
  }

  // ========================================================
  // 管理员认证
  // ========================================================

  /**
   * 用账号密码换取 token。密码只在这里上行一次，服务端不会回传，
   * 也不再有任何一份副本留在客户端代码里。
   */
  async authenticateAdmin(username: string, password: string): Promise<AdminToken> {
    await this.waitUntilOpen()
    return await new Promise<AdminToken>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAuth = null
        reject(new SyncError("验证超时", "TIMEOUT"))
      }, REQUEST_TIMEOUT_MS)
      this.pendingAuth = { resolve, reject, timer }
      this.connection.send({ type: "admin_auth", data: { username, password } })
    })
  }

  // ========================================================
  // 房间
  // ========================================================

  async createRoom(
    token: string,
    hostId: string,
    settings: RoomSettings,
  ): Promise<string> {
    await this.waitUntilOpen()
    const requestId = uuid()
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCreateRoom.delete(requestId)
        reject(new SyncError("创建房间超时", "TIMEOUT"))
      }, REQUEST_TIMEOUT_MS)
      this.pendingCreateRoom.set(requestId, { resolve, reject, timer })

      const ok = this.connection.send({
        type: "create_room",
        data: { requestId, token, hostId, settings },
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
    await this.waitUntilOpen()

    // 重复调用（如 StrictMode 双挂载）时静默作废上一次的等待：
    // 若不清掉旧 timer，它会在 10s 后误报"加入超时"
    if (this.pendingJoin) {
      clearTimeout(this.pendingJoin.timer)
      this.pendingJoin = null
    }

    return await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingJoin = null
        reject(new SyncError("加入房间超时", "TIMEOUT"))
      }, REQUEST_TIMEOUT_MS)
      this.pendingJoin = { resolve, reject, timer }

      // 一律注册在前、自己发送在后：首次连接时 handleOpen 会代发 join_room，
      // 本地环回下服务端的 public_state 可能在 pendingJoin 注册之前就到达并被
      // 错过，导致 10s 误报超时。重复 join 服务端幂等（每次都会回 public_state）。
      const ok = this.connection.send({
        type: "join_room",
        data: { roomId, player },
      })
      if (!ok) {
        clearTimeout(timer)
        this.pendingJoin = null
        reject(new SyncError("WebSocket 未连接", "DISCONNECTED"))
      }
    })
  }

  leaveRoom(roomId: string): void {
    this.lastJoin = null
    this.connection.send({ type: "leave_room", data: { roomId } })
  }

  // ========================================================
  // 意图上报
  // ========================================================

  /** 提交玩家操作。注意不带 playerId —— 服务端以连接身份为准。 */
  submitAction(roomId: string, action: PlayerAction): void {
    this.connection.send({ type: "player_action", data: { roomId, action } })
  }

  sendHostCommand(roomId: string, command: HostCommand): void {
    this.connection.send({ type: "host_command", data: { roomId, command } })
  }

  /** WebRTC 语音信令：经服务端中继给同房间的目标玩家 */
  sendVoiceSignal(roomId: string, targetId: string, signal: unknown): void {
    this.connection.send({
      type: "voice_signal",
      data: { roomId, targetId, signal },
    })
  }

  onVoiceSignal(cb: (fromId: string, signal: unknown) => void): Unsubscribe {
    this.voiceCallbacks.add(cb)
    return () => this.voiceCallbacks.delete(cb)
  }

  // ========================================================
  // 订阅
  // ========================================================

  onPublicStateChanged(
    roomId: string,
    cb: (state: PublicRoomState) => void,
  ): Unsubscribe {
    let set = this.publicCallbacks.get(roomId)
    if (!set) {
      set = new Set()
      this.publicCallbacks.set(roomId, set)
    }
    set.add(cb)
    const cached = this.cachedPublic.get(roomId)
    if (cached) cb(cached)
    return () => {
      set.delete(cb)
      if (set.size === 0) this.publicCallbacks.delete(roomId)
    }
  }

  onPrivateStateChanged(cb: (state: PrivatePlayerState) => void): Unsubscribe {
    this.privateCallbacks.add(cb)
    if (this.cachedPrivate) cb(this.cachedPrivate)
    return () => this.privateCallbacks.delete(cb)
  }

  onRoomDeleted(roomId: string, cb: () => void): Unsubscribe {
    let set = this.roomDeletedCallbacks.get(roomId)
    if (!set) {
      set = new Set()
      this.roomDeletedCallbacks.set(roomId, set)
    }
    set.add(cb)
    return () => {
      set.delete(cb)
      if (set.size === 0) this.roomDeletedCallbacks.delete(roomId)
    }
  }
}
