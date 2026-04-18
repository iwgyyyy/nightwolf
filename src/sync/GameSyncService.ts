import type {
  HostGameState,
  PlayerAction,
  PlayerPublicInfo,
  PrivatePlayerState,
  PublicRoomState,
  RoomSettings,
} from "@/types"

/** 订阅回调返回的取消订阅函数 */
export type Unsubscribe = () => void

/**
 * 游戏状态同步服务协议。
 *
 * 游戏逻辑不直接依赖具体实现（WebSocket / InMemory），
 * 通过此接口解耦，方便后期替换或测试。
 *
 * 关键约束：Host 是唯一的状态权威写入者（除了玩家通过 submitAction 提交的输入）。
 */
export interface GameSyncService {
  // ========================================================
  // 房间管理
  // ========================================================

  /**
   * 创建房间，返回房间 ID。
   * @param adminCredentials 创建房间需要管理员凭证（生产环境由后端校验）
   */
  createRoom(
    hostId: string,
    settings: RoomSettings,
    adminCredentials?: AdminCredentials,
  ): Promise<string>

  /** 加入房间（upsert 本玩家信息） */
  joinRoom(roomId: string, player: PlayerPublicInfo): Promise<void>

  /** 离开房间 */
  leaveRoom(roomId: string, playerId: string): Promise<void>

  /** 解散房间（仅 Host 调用） */
  deleteRoom(roomId: string): Promise<void>

  // ========================================================
  // 公共房间状态（所有玩家可读，Host 写）
  // ========================================================

  updatePublicState(roomId: string, state: PublicRoomState): Promise<void>
  onPublicStateChanged(
    roomId: string,
    callback: (state: PublicRoomState) => void,
  ): Unsubscribe

  // ========================================================
  // 玩家私有状态（仅对应玩家可读，Host 写）
  // ========================================================

  updatePrivateState(
    roomId: string,
    playerId: string,
    state: PrivatePlayerState,
  ): Promise<void>
  onPrivateStateChanged(
    roomId: string,
    playerId: string,
    callback: (state: PrivatePlayerState) => void,
  ): Unsubscribe

  // ========================================================
  // Host 权威状态（仅 Host 可读写）
  // ========================================================

  updateHostState(roomId: string, state: HostGameState): Promise<void>
  onHostStateChanged(
    roomId: string,
    callback: (state: HostGameState) => void,
  ): Unsubscribe

  // ========================================================
  // 玩家动作（玩家 → Host）
  // ========================================================

  submitAction(
    roomId: string,
    playerId: string,
    action: PlayerAction,
  ): Promise<void>
  onActionReceived(
    roomId: string,
    callback: (playerId: string, action: PlayerAction) => void,
  ): Unsubscribe

  // ========================================================
  // 房间被解散
  // ========================================================

  onRoomDeleted(roomId: string, callback: () => void): Unsubscribe

  // ========================================================
  // 连接状态（WebSocket 用；InMemory 一律 connected）
  // ========================================================

  onConnectionChange(
    callback: (status: "connecting" | "connected" | "disconnected") => void,
  ): Unsubscribe
}

/** 管理员创建房间凭证 */
export interface AdminCredentials {
  username: string
  password: string
}

export type SyncErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_ALREADY_EXISTS"
  | "GAME_IN_PROGRESS"
  | "ROOM_FULL"
  | "UNAUTHORIZED"
  | "TIMEOUT"
  | "DISCONNECTED"
  | "INVALID_ARGUMENT"
  | "UNKNOWN"

/** 同步服务可能抛出的错误 */
export class SyncError extends Error {
  readonly code: SyncErrorCode

  constructor(message: string, code: SyncErrorCode) {
    super(message)
    this.name = "SyncError"
    this.code = code
  }
}
