import type {
  HostGameState,
  PlayerAction,
  PlayerPublicInfo,
  PrivatePlayerState,
  PublicRoomState,
  RoomSettings,
} from "@/types"
import { verifyAdmin } from "@/config/auth"
import { generateRoomId } from "@/services/roomId"
import { MAX_PLAYERS_PER_ROOM } from "@/config/defaults"
import type {
  AdminCredentials,
  GameSyncService,
  Unsubscribe,
} from "./GameSyncService"
import { SyncError } from "./GameSyncService"

const CHANNEL_NAME = "nightwolf-sync"
const STORAGE_PREFIX = "nightwolf:room:"

// ============================================================
// 消息类型
// ============================================================

type SyncMessage =
  | { type: "public_changed"; roomId: string }
  | { type: "private_changed"; roomId: string; playerId: string }
  | { type: "host_changed"; roomId: string }
  | { type: "action_submitted"; roomId: string; playerId: string; action: PlayerAction }
  | { type: "room_deleted"; roomId: string }

// ============================================================
// localStorage key
// ============================================================

const keys = {
  public: (roomId: string) => `${STORAGE_PREFIX}${roomId}:public`,
  host: (roomId: string) => `${STORAGE_PREFIX}${roomId}:host`,
  private: (roomId: string, playerId: string) =>
    `${STORAGE_PREFIX}${roomId}:private:${playerId}`,
} as const

function readJSON<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJSON<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

// ============================================================
// 实现
// ============================================================

export class InMemorySyncService implements GameSyncService {
  private readonly channel: BroadcastChannel

  // 订阅回调：按 (roomId, [playerId]) 维度
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

  constructor() {
    this.channel = new BroadcastChannel(CHANNEL_NAME)
    this.channel.onmessage = (event) => {
      this.handleMessage(event.data as SyncMessage)
    }
  }

  // ========================================================
  // 房间管理
  // ========================================================

  async createRoom(
    hostId: string,
    settings: RoomSettings,
    adminCredentials?: AdminCredentials,
  ): Promise<string> {
    if (!adminCredentials) {
      throw new SyncError("缺少管理员凭证", "UNAUTHORIZED")
    }
    if (!verifyAdmin(adminCredentials.username, adminCredentials.password)) {
      throw new SyncError("管理员凭证无效", "UNAUTHORIZED")
    }

    // 生成唯一 ID（避免与 localStorage 中已存在的冲突）
    let roomId: string
    let attempts = 0
    do {
      roomId = generateRoomId()
      attempts++
      if (attempts > 20) {
        throw new SyncError("无法生成唯一房间 ID", "UNKNOWN")
      }
    } while (localStorage.getItem(keys.public(roomId)) !== null)

    const initialPublic: PublicRoomState = {
      roomId,
      hostId,
      gamePhase: "waiting",
      settings,
      players: [],
      currentNightStep: null,
      phaseStartedAt: new Date().toISOString(),
      phaseEndsAt: null,
      isPaused: false,
      pauseRemainingSeconds: null,
      submittedPlayerIds: [],
      resultData: null,
    }
    writeJSON(keys.public(roomId), initialPublic)

    return roomId
  }

  async joinRoom(roomId: string, player: PlayerPublicInfo): Promise<void> {
    const current = readJSON<PublicRoomState>(keys.public(roomId))
    if (!current) {
      throw new SyncError(`房间 ${roomId} 不存在`, "ROOM_NOT_FOUND")
    }

    const existingIdx = current.players.findIndex(
      (p) => p.playerId === player.playerId,
    )
    const isReconnect = existingIdx >= 0

    // 游戏非等待阶段：仅允许原房间玩家重连
    if (current.gamePhase !== "waiting" && !isReconnect) {
      throw new SyncError(
        `房间 ${roomId} 的游戏已经开始`,
        "GAME_IN_PROGRESS",
      )
    }

    // 等待阶段：人数已满且不是重连
    if (
      current.gamePhase === "waiting" &&
      !isReconnect &&
      current.players.length >= MAX_PLAYERS_PER_ROOM
    ) {
      throw new SyncError(
        `房间 ${roomId} 已满（${MAX_PLAYERS_PER_ROOM} 人）`,
        "ROOM_FULL",
      )
    }

    const nextPlayers = isReconnect
      ? current.players.map((p, i) => (i === existingIdx ? player : p))
      : [...current.players, player]

    const next: PublicRoomState = { ...current, players: nextPlayers }
    writeJSON(keys.public(roomId), next)
    this.broadcast({ type: "public_changed", roomId })

    this.dispatchPublic(roomId, next)
  }

  async leaveRoom(roomId: string, playerId: string): Promise<void> {
    const current = readJSON<PublicRoomState>(keys.public(roomId))
    if (!current) return

    const next: PublicRoomState = {
      ...current,
      players: current.players.filter((p) => p.playerId !== playerId),
    }
    writeJSON(keys.public(roomId), next)
    this.broadcast({ type: "public_changed", roomId })
    this.dispatchPublic(roomId, next)
  }

  async deleteRoom(roomId: string): Promise<void> {
    // 清除所有相关 key
    const prefix = `${STORAGE_PREFIX}${roomId}:`
    const toDelete: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) toDelete.push(key)
    }
    for (const key of toDelete) localStorage.removeItem(key)

    this.broadcast({ type: "room_deleted", roomId })
    this.dispatchRoomDeleted(roomId)
  }

  // ========================================================
  // PublicRoomState
  // ========================================================

  async updatePublicState(roomId: string, state: PublicRoomState): Promise<void> {
    writeJSON(keys.public(roomId), state)
    this.broadcast({ type: "public_changed", roomId })
    this.dispatchPublic(roomId, state)
  }

  onPublicStateChanged(
    roomId: string,
    callback: (state: PublicRoomState) => void,
  ): Unsubscribe {
    const set = this.publicCallbacks.get(roomId) ?? new Set()
    set.add(callback)
    this.publicCallbacks.set(roomId, set)

    // 立即回调一次当前缓存（若有）
    const cached = readJSON<PublicRoomState>(keys.public(roomId))
    if (cached) queueMicrotask(() => callback(cached))

    return () => {
      set.delete(callback)
      if (set.size === 0) this.publicCallbacks.delete(roomId)
    }
  }

  // ========================================================
  // PrivatePlayerState
  // ========================================================

  async updatePrivateState(
    roomId: string,
    playerId: string,
    state: PrivatePlayerState,
  ): Promise<void> {
    writeJSON(keys.private(roomId, playerId), state)
    this.broadcast({ type: "private_changed", roomId, playerId })
    this.dispatchPrivate(roomId, playerId, state)
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

    const cached = readJSON<PrivatePlayerState>(keys.private(roomId, playerId))
    if (cached) queueMicrotask(() => callback(cached))

    return () => {
      set.delete(callback)
      if (set.size === 0) roomMap.delete(playerId)
      if (roomMap.size === 0) this.privateCallbacks.delete(roomId)
    }
  }

  // ========================================================
  // HostGameState
  // ========================================================

  async updateHostState(roomId: string, state: HostGameState): Promise<void> {
    writeJSON(keys.host(roomId), state)
    this.broadcast({ type: "host_changed", roomId })
    this.dispatchHost(roomId, state)
  }

  onHostStateChanged(
    roomId: string,
    callback: (state: HostGameState) => void,
  ): Unsubscribe {
    const set = this.hostCallbacks.get(roomId) ?? new Set()
    set.add(callback)
    this.hostCallbacks.set(roomId, set)

    const cached = readJSON<HostGameState>(keys.host(roomId))
    if (cached) queueMicrotask(() => callback(cached))

    return () => {
      set.delete(callback)
      if (set.size === 0) this.hostCallbacks.delete(roomId)
    }
  }

  // ========================================================
  // PlayerAction
  // ========================================================

  async submitAction(
    roomId: string,
    playerId: string,
    action: PlayerAction,
  ): Promise<void> {
    this.broadcast({ type: "action_submitted", roomId, playerId, action })
    // action 本地也回调（Host 端可能就在同一 tab）
    this.dispatchAction(roomId, playerId, action)
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
    // InMemory 始终"已连接"
    queueMicrotask(() => callback("connected"))
    return () => {}
  }

  /** 释放所有订阅和 channel */
  dispose(): void {
    this.channel.close()
    this.publicCallbacks.clear()
    this.hostCallbacks.clear()
    this.privateCallbacks.clear()
    this.actionCallbacks.clear()
    this.roomDeletedCallbacks.clear()
  }

  // ========================================================
  // 内部：消息分发
  // ========================================================

  private handleMessage(msg: SyncMessage): void {
    switch (msg.type) {
      case "public_changed": {
        const state = readJSON<PublicRoomState>(keys.public(msg.roomId))
        if (state) this.dispatchPublic(msg.roomId, state)
        break
      }
      case "private_changed": {
        const state = readJSON<PrivatePlayerState>(
          keys.private(msg.roomId, msg.playerId),
        )
        if (state) this.dispatchPrivate(msg.roomId, msg.playerId, state)
        break
      }
      case "host_changed": {
        const state = readJSON<HostGameState>(keys.host(msg.roomId))
        if (state) this.dispatchHost(msg.roomId, state)
        break
      }
      case "action_submitted":
        this.dispatchAction(msg.roomId, msg.playerId, msg.action)
        break
      case "room_deleted":
        this.dispatchRoomDeleted(msg.roomId)
        break
    }
  }

  private broadcast(msg: SyncMessage): void {
    this.channel.postMessage(msg)
  }

  private dispatchPublic(roomId: string, state: PublicRoomState): void {
    const set = this.publicCallbacks.get(roomId)
    if (!set) return
    for (const cb of set) cb(state)
  }

  private dispatchHost(roomId: string, state: HostGameState): void {
    const set = this.hostCallbacks.get(roomId)
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
}
