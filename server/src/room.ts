/**
 * 房间存储与下行投影。
 *
 * 安全边界就在这个文件：`secret`（所有人的身份牌、底牌、夜晚日志、票型）
 * 只存在于服务端内存，没有任何一条路径会把它整体下发。玩家能收到的只有
 *   - publicState：广播，不含身份信息
 *   - 自己那一份 privateState：单播
 * 结算时通过 publicState.resultData 一次性揭示，那是游戏规则要求的公开。
 */

import type { ServerWebSocket } from "bun";
import type {
  HostGameState,
  PrivatePlayerState,
  PublicRoomState,
} from "@/types";
import { encodeServer, type ServerMessage, type SyncErrorCode } from "@/protocol";

/** 与前端 roomId.ts 保持一致：去掉了易混淆的 0/O/1/I/L */
const ROOM_ID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOM_ID_LENGTH = 6;

export const MAX_PLAYERS_PER_ROOM = 10;
/** 无人连接且静默超过这个时长的房间会被回收 */
export const ROOM_TTL_MS = 10 * 60_000;

/** 每条连接附带的会话信息 */
export interface SessionData {
  playerId: string | null;
  roomId: string | null;
  /** 用于限速的来源标识 */
  clientKey: string;
}

export type Socket = ServerWebSocket<SessionData>;

export interface Room {
  roomId: string;
  hostId: string;
  /** 公开状态：广播给所有人 */
  publicState: PublicRoomState;
  /** 机密状态：仅服务端持有，游戏未开始时为 null */
  secret: HostGameState | null;
  /** playerId -> 该玩家的私有视图，单播 */
  privateStates: Map<string, PrivatePlayerState>;
  connections: Map<string, Socket>;

  // ---- 播报对齐 ----
  /** 当前正在等待 ack 的 cue；null 表示没有在等 */
  pendingCueId: string | null;
  narrationAcks: Set<string>;
  onNarrationSettled: (() => void) | null;
  narrationTimer: ReturnType<typeof setTimeout> | null;
  cueCounter: number;

  /** 本夜晚步骤中已主动"结束回合"的行动者（每步开始时清空） */
  endedTurn: Set<string>;

  /** 当前阶段的推进定时器（服务端常驻，不再依赖房主设备在线） */
  phaseTimer: ReturnType<typeof setTimeout> | null;
  lastActivity: number;
}

const rooms = new Map<string, Room>();

export function getRoom(roomId: unknown): Room | undefined {
  if (typeof roomId !== "string") return undefined;
  return rooms.get(roomId);
}

export function roomCount(): number {
  return rooms.size;
}

/** 有玩家连着的房间数，部署前用来判断是否有对局正在进行 */
export function activeRoomCount(): number {
  let n = 0;
  for (const room of rooms.values()) {
    if (room.connections.size > 0) n++;
  }
  return n;
}

function generateRoomId(): string {
  let id: string;
  do {
    id = "";
    for (let i = 0; i < ROOM_ID_LENGTH; i++) {
      id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
    }
  } while (rooms.has(id));
  return id;
}

export function createRoom(
  hostId: string,
  publicStateSeed: Omit<PublicRoomState, "roomId">,
): Room {
  const roomId = generateRoomId();
  const room: Room = {
    roomId,
    hostId,
    publicState: { ...publicStateSeed, roomId },
    secret: null,
    privateStates: new Map(),
    connections: new Map(),
    pendingCueId: null,
    narrationAcks: new Set(),
    onNarrationSettled: null,
    narrationTimer: null,
    cueCounter: 0,
    endedTurn: new Set(),
    phaseTimer: null,
    lastActivity: Date.now(),
  };
  rooms.set(roomId, room);
  return room;
}

export function destroyRoom(room: Room): void {
  clearPhaseTimer(room);
  clearNarrationTimer(room);
  rooms.delete(room.roomId);
}

export function touch(room: Room): void {
  room.lastActivity = Date.now();
}

// ============================================================
// 下行
// ============================================================

export function send(ws: Socket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(encodeServer(msg));
}

export function sendError(
  ws: Socket,
  code: SyncErrorCode,
  message: string,
  requestId?: string,
): void {
  send(ws, { type: "error", data: { code, message, requestId } });
}

/** 广播公开状态。publicState 本身不含身份信息，可以安全群发。 */
export function broadcastPublic(room: Room): void {
  const payload = encodeServer({
    type: "public_state",
    data: { state: room.publicState },
  });
  for (const ws of room.connections.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

/**
 * 单播某个玩家的私有状态。
 * 注意这里是按 playerId 取连接，而不是广播后让客户端自己过滤 ——
 * 后者正是旧实现泄露所有人身份的原因。
 */
export function sendPrivate(room: Room, playerId: string): void {
  const state = room.privateStates.get(playerId);
  if (!state) return;
  const ws = room.connections.get(playerId);
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  send(ws, { type: "private_state", data: { state } });
}

export function broadcastRoomDeleted(room: Room): void {
  const payload = encodeServer({
    type: "room_deleted",
    data: { roomId: room.roomId },
  });
  for (const ws of room.connections.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

// ============================================================
// 定时器
// ============================================================

export function clearPhaseTimer(room: Room): void {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
}

export function clearNarrationTimer(room: Room): void {
  if (room.narrationTimer) {
    clearTimeout(room.narrationTimer);
    room.narrationTimer = null;
  }
}

// ============================================================
// TTL 回收
// ============================================================

export function pruneRooms(now: number): number {
  let removed = 0;
  for (const room of [...rooms.values()]) {
    if (room.connections.size === 0 && now - room.lastActivity > ROOM_TTL_MS) {
      destroyRoom(room);
      removed++;
    }
  }
  return removed;
}
