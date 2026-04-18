/**
 * WebSocket 消息协议编解码。
 *
 * 结构统一为 `{ type, data }`。
 */

import type {
  HostGameState,
  PlayerAction,
  PlayerPublicInfo,
  PrivatePlayerState,
  PublicRoomState,
  RoomSettings,
} from "@/types"
import type { AdminCredentials, SyncErrorCode } from "./GameSyncService"

// ============================================================
// Client → Server
// ============================================================

export type WSOutbound =
  | { type: "create_room"; data: CreateRoomPayload }
  | { type: "join_room"; data: JoinRoomPayload }
  | { type: "leave_room"; data: LeaveRoomPayload }
  | { type: "delete_room"; data: DeleteRoomPayload }
  | { type: "update_public_state"; data: UpdatePublicPayload }
  | { type: "update_private_state"; data: UpdatePrivatePayload }
  | { type: "update_host_state"; data: UpdateHostPayload }
  | { type: "submit_action"; data: SubmitActionPayload }
  | { type: "ping"; data: Record<string, never> }

export interface CreateRoomPayload {
  requestId: string
  hostId: string
  settings: RoomSettings
  adminCredentials?: AdminCredentials
}

export interface JoinRoomPayload {
  roomId: string
  player: PlayerPublicInfo
}

export interface LeaveRoomPayload {
  roomId: string
  playerId: string
}

export interface DeleteRoomPayload {
  roomId: string
}

export interface UpdatePublicPayload {
  roomId: string
  state: PublicRoomState
}

export interface UpdatePrivatePayload {
  roomId: string
  playerId: string
  state: PrivatePlayerState
}

export interface UpdateHostPayload {
  roomId: string
  state: HostGameState
}

export interface SubmitActionPayload {
  roomId: string
  playerId: string
  action: PlayerAction
}

// ============================================================
// Server → Client
// ============================================================

export type WSInbound =
  | { type: "room_created"; data: { requestId?: string; roomId: string } }
  | { type: "public_state"; data: { state: PublicRoomState } }
  | {
      type: "private_state"
      data: { playerId: string; state: PrivatePlayerState }
    }
  | { type: "host_state"; data: { state: HostGameState } }
  | {
      type: "player_action"
      data: { playerId: string; action: PlayerAction }
    }
  | { type: "room_deleted"; data: { roomId: string } }
  | { type: "error"; data: { code?: SyncErrorCode; message: string } }
  | { type: "pong"; data: Record<string, never> }

// ============================================================
// 编解码
// ============================================================

export function encodeOutbound(msg: WSOutbound): string {
  return JSON.stringify(msg)
}

/**
 * 解析 inbound 消息。若 JSON 非法或 type 未知则返回 null。
 */
export function decodeInbound(raw: string): WSInbound | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const obj = parsed as { type?: unknown; data?: unknown }
  if (typeof obj.type !== "string") return null

  const type = obj.type
  const data = obj.data ?? {}
  switch (type) {
    case "room_created":
    case "public_state":
    case "private_state":
    case "host_state":
    case "player_action":
    case "room_deleted":
    case "error":
    case "pong":
      return { type, data } as WSInbound
    default:
      return null
  }
}
