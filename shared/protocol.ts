/**
 * 前后端共享的 WebSocket 协议定义。
 *
 * 与旧版 relay 协议的根本区别：
 *   - 旧：Host 客户端计算好状态，把 public/private/host 三份状态**推**给服务端广播。
 *     服务端不理解游戏，谁都能发 update_*，private/host 状态还广播给了全房间。
 *   - 新：客户端只上报**意图**，服务端是唯一权威。下行按连接投影 ——
 *     公开状态广播，私有状态单播且只含本人那份，机密状态（所有人的身份牌、
 *     底牌、夜晚日志）永不下发，直到结算阶段随 resultData 一次性揭示。
 *
 * 上行消息一律不带 playerId：身份由连接本身确定，避免冒充他人投票 / 提交操作。
 */

import type {
  PlayerAction,
  PlayerPublicInfo,
  PrivatePlayerState,
  PublicRoomState,
  RoomSettings,
} from "./types";

// ============================================================
// 错误码
// ============================================================

export type SyncErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_ALREADY_EXISTS"
  | "GAME_IN_PROGRESS"
  | "ROOM_FULL"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "DISCONNECTED"
  | "INVALID_ARGUMENT"
  | "UNKNOWN";

// ============================================================
// Host 专属指令
// ============================================================

export type HostCommand =
  | { kind: "startGame" }
  /** 大厅里调整角色配置与各阶段时长，仅 waiting 阶段有效 */
  | { kind: "updateSettings"; patch: Partial<RoomSettings> }
  /** 提前结束白天讨论，直接进入投票 */
  | { kind: "endDay" }
  /** 保留房间与玩家，清空对局回到 waiting */
  | { kind: "playAgain" }
  | { kind: "deleteRoom" };

// ============================================================
// Client → Server
// ============================================================

export type ClientMessage =
  /** 用账号密码换取 token；密码仅此一次上行，服务端永不回传 */
  | { type: "admin_auth"; data: { username: string; password: string } }
  | {
      type: "create_room";
      data: {
        requestId: string;
        /** admin_auth 换来的 HMAC token */
        token: string;
        hostId: string;
        settings: RoomSettings;
      };
    }
  | { type: "join_room"; data: { roomId: string; player: PlayerPublicInfo } }
  | { type: "leave_room"; data: { roomId: string } }
  /** 玩家意图：确认身份 / 夜晚操作 / 投票 / 改名 */
  | { type: "player_action"; data: { roomId: string; action: PlayerAction } }
  | { type: "host_command"; data: { roomId: string; command: HostCommand } }
  /**
   * 本机语音播报完成。服务端等齐全部在线玩家的 ack（或超时）后才开始倒计时，
   * 保证语速慢的设备不会"还在听提示就已经在扣时间"。
   */
  | { type: "narration_ack"; data: { roomId: string; cueId: string } }
  | { type: "ping"; data: Record<string, never> };

// ============================================================
// Server → Client
// ============================================================

export type ServerMessage =
  | { type: "admin_token"; data: { token: string; expiresAt: string } }
  | { type: "room_created"; data: { requestId: string; roomId: string } }
  /** 广播：公开信息，不含任何身份牌 */
  | { type: "public_state"; data: { state: PublicRoomState } }
  /** 单播：只含收件人自己那份 */
  | { type: "private_state"; data: { state: PrivatePlayerState } }
  | { type: "room_deleted"; data: { roomId: string } }
  | {
      type: "error";
      data: { code: SyncErrorCode; message: string; requestId?: string };
    }
  | { type: "pong"; data: Record<string, never> };

// ============================================================
// 编解码
// ============================================================

export function encodeClient(msg: ClientMessage): string {
  return JSON.stringify(msg);
}

export function encodeServer(msg: ServerMessage): string {
  return JSON.stringify(msg);
}

const CLIENT_TYPES = new Set<string>([
  "admin_auth",
  "create_room",
  "join_room",
  "leave_room",
  "player_action",
  "host_command",
  "narration_ack",
  "ping",
]);

const SERVER_TYPES = new Set<string>([
  "admin_token",
  "room_created",
  "public_state",
  "private_state",
  "room_deleted",
  "error",
  "pong",
]);

function decode(raw: string, allowed: Set<string>): { type: string; data: unknown } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as { type?: unknown; data?: unknown };
  if (typeof obj.type !== "string" || !allowed.has(obj.type)) return null;
  return { type: obj.type, data: obj.data ?? {} };
}

/** 服务端用：解析客户端消息。字段级校验由各 handler 负责。 */
export function decodeClient(raw: string): ClientMessage | null {
  return decode(raw, CLIENT_TYPES) as ClientMessage | null;
}

/** 客户端用：解析服务端消息。 */
export function decodeServer(raw: string): ServerMessage | null {
  return decode(raw, SERVER_TYPES) as ServerMessage | null;
}
