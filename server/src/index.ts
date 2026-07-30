/**
 * 一夜狼人杀 —— 服务端权威游戏服务。
 *
 * 关键约束：房间状态在内存中，必须单实例部署（MinNum=1 / 单容器，不能水平扩展）。
 * 重启会中断进行中的对局，部署前可用 GET /health 的 activeRooms 判断。
 */

import { decodeClient, type ClientMessage } from "@/protocol";
import {
  allowAuthAttempt,
  clearAuthFailures,
  isAdminConfigured,
  issueToken,
  pruneAuthFailures,
  recordAuthFailure,
  verifyCredentials,
  verifyToken,
} from "./auth";
import {
  activeRoomCount,
  broadcastPublic,
  broadcastRoomDeleted,
  createRoom,
  destroyRoom,
  getRoom,
  MAX_PLAYERS_PER_ROOM,
  pruneRooms,
  roomCount,
  send,
  sendError,
  sendPrivate,
  touch,
  type Room,
  type SessionData,
  type Socket,
} from "./room";
import {
  confirmIdentity,
  endDay,
  handleNarrationAck,
  playAgain,
  reconcileNarration,
  startGame,
  submitNightAction,
  submitVote,
  updateProfile,
  updateSettings,
} from "./game";
import type { PublicRoomState } from "@/types";

const PORT = process.env.PORT ? Number(process.env.PORT) : 9000;
const CLEANUP_INTERVAL_MS = 60_000;

// ============================================================
// 消息处理
// ============================================================

function handleAdminAuth(ws: Socket, data: Record<string, unknown>): void {
  const now = Date.now();
  if (!allowAuthAttempt(ws.data.clientKey, now)) {
    return sendError(ws, "RATE_LIMITED", "尝试过于频繁，请稍后再试");
  }
  if (!verifyCredentials(data.username, data.password)) {
    recordAuthFailure(ws.data.clientKey, now);
    return sendError(ws, "UNAUTHORIZED", "用户名或密码错误");
  }
  clearAuthFailures(ws.data.clientKey);
  send(ws, { type: "admin_token", data: issueToken(now) });
}

function handleCreateRoom(ws: Socket, data: Record<string, unknown>): void {
  const requestId = typeof data.requestId === "string" ? data.requestId : undefined;
  if (!verifyToken(data.token, Date.now())) {
    return sendError(ws, "UNAUTHORIZED", "管理员凭证无效或已过期", requestId);
  }
  if (typeof data.hostId !== "string" || !data.settings) {
    return sendError(ws, "INVALID_ARGUMENT", "缺少 hostId 或 settings", requestId);
  }

  const seed: Omit<PublicRoomState, "roomId"> = {
    hostId: data.hostId,
    gamePhase: "waiting",
    settings: data.settings as PublicRoomState["settings"],
    players: [],
    currentNightStep: null,
    phaseStartedAt: new Date().toISOString(),
    phaseEndsAt: null,
    narrationCueId: null,
    submittedPlayerIds: [],
    resultData: null,
  };
  const room = createRoom(data.hostId, seed);
  send(ws, {
    type: "room_created",
    data: { requestId: requestId ?? "", roomId: room.roomId },
  });
}

function handleJoinRoom(ws: Socket, data: Record<string, unknown>): void {
  const room = getRoom(data.roomId);
  if (!room) return sendError(ws, "ROOM_NOT_FOUND", `房间 ${data.roomId} 不存在`);

  const player = data.player as PublicRoomState["players"][number] | undefined;
  if (!player || typeof player.playerId !== "string") {
    return sendError(ws, "INVALID_ARGUMENT", "缺少玩家信息");
  }

  const playerId = player.playerId;
  const existingIdx = room.publicState.players.findIndex(
    (p) => p.playerId === playerId,
  );
  const isReconnect = existingIdx >= 0;

  if (room.publicState.gamePhase !== "waiting" && !isReconnect) {
    return sendError(ws, "GAME_IN_PROGRESS", `房间 ${room.roomId} 的游戏已经开始`);
  }
  if (
    room.publicState.gamePhase === "waiting" &&
    !isReconnect &&
    room.publicState.players.length >= MAX_PLAYERS_PER_ROOM
  ) {
    return sendError(ws, "ROOM_FULL", `房间已满（${MAX_PLAYERS_PER_ROOM} 人）`);
  }

  // 同一条连接换房间时先清理旧的
  if (ws.data.roomId && ws.data.roomId !== room.roomId) {
    detach(ws);
  }

  room.connections.set(playerId, ws);
  ws.data.playerId = playerId;
  ws.data.roomId = room.roomId;
  touch(room);

  const nextPlayer = { ...player, isConnected: true };
  const players = isReconnect
    ? room.publicState.players.map((p, i) => (i === existingIdx ? nextPlayer : p))
    : [...room.publicState.players, nextPlayer];
  room.publicState = { ...room.publicState, players };

  broadcastPublic(room);
  // 重连的玩家补发他自己那份私有状态（只有他自己收得到）
  sendPrivate(room, playerId);
}

function handlePlayerAction(ws: Socket, room: Room, data: Record<string, unknown>): void {
  const playerId = ws.data.playerId;
  if (!playerId) return sendError(ws, "UNAUTHORIZED", "尚未加入房间");

  const action = data.action as ClientMessage extends never ? never : any;
  if (!action || typeof action.kind !== "string") {
    return sendError(ws, "INVALID_ARGUMENT", "缺少 action");
  }

  // playerId 一律取自连接，不接受客户端自报，避免冒充他人操作
  switch (action.kind) {
    case "confirmIdentity":
      void confirmIdentity(room, playerId);
      return;
    case "nightAction":
      submitNightAction(room, playerId, action.submission);
      return;
    case "vote":
      submitVote(room, playerId, action.targetId ?? null);
      return;
    case "updateProfile":
      if (typeof action.name === "string") updateProfile(room, playerId, action.name);
      return;
    default:
      return sendError(ws, "INVALID_ARGUMENT", `未知操作 ${action.kind}`);
  }
}

function handleHostCommand(ws: Socket, room: Room, data: Record<string, unknown>): void {
  const playerId = ws.data.playerId;
  if (!playerId || playerId !== room.hostId) {
    return sendError(ws, "UNAUTHORIZED", "仅房主可执行此操作");
  }
  const command = data.command as { kind?: string } | undefined;
  if (!command?.kind) return sendError(ws, "INVALID_ARGUMENT", "缺少 command");

  switch (command.kind) {
    case "startGame": {
      const res = startGame(room);
      if (!res.ok) sendError(ws, "INVALID_ARGUMENT", res.message);
      return;
    }
    case "updateSettings": {
      const patch = (command as { patch?: unknown }).patch;
      if (patch && typeof patch === "object") {
        updateSettings(room, patch as Partial<PublicRoomState["settings"]>);
      }
      return;
    }
    case "endDay":
      endDay(room);
      return;
    case "playAgain":
      playAgain(room);
      return;
    case "deleteRoom":
      broadcastRoomDeleted(room);
      for (const conn of room.connections.values()) {
        conn.data.roomId = null;
        conn.data.playerId = null;
      }
      destroyRoom(room);
      return;
    default:
      return sendError(ws, "INVALID_ARGUMENT", `未知指令 ${command.kind}`);
  }
}

// ============================================================
// 连接清理
// ============================================================

function detach(ws: Socket): void {
  const { roomId, playerId } = ws.data;
  if (!roomId || !playerId) return;
  ws.data.roomId = null;
  ws.data.playerId = null;

  const room = getRoom(roomId);
  if (!room) return;
  // 可能已经被新连接顶替（同一玩家换设备重连）
  if (room.connections.get(playerId) === ws) {
    room.connections.delete(playerId);
  }

  if (room.publicState.gamePhase === "waiting") {
    // 未开局：直接移出玩家列表
    room.publicState = {
      ...room.publicState,
      players: room.publicState.players.filter((p) => p.playerId !== playerId),
    };
  } else {
    // 已开局：保留席位并标记离线，等他重连
    room.publicState = {
      ...room.publicState,
      players: room.publicState.players.map((p) =>
        p.playerId === playerId ? { ...p, isConnected: false } : p,
      ),
    };
  }
  broadcastPublic(room);
  // 掉线的人不该把整局卡在等播报 ack 上
  reconcileNarration(room);
}

// ============================================================
// 服务
// ============================================================

const server = Bun.serve<SessionData>({
  port: PORT,
  // 客户端 30s 一次心跳，给足余量
  idleTimeout: 120,

  fetch(req, srv) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        rooms: roomCount(),
        activeRooms: activeRoomCount(),
        adminConfigured: isAdminConfigured(),
      });
    }

    const ok = srv.upgrade(req, {
      data: {
        playerId: null,
        roomId: null,
        clientKey: srv.requestIP(req)?.address ?? "unknown",
      } satisfies SessionData,
    });
    if (ok) return undefined;

    return new Response("Upgrade Required", { status: 426 });
  },

  websocket: {
    open() {
      // 无需处理：加入房间由 join_room 驱动
    },

    message(ws, raw) {
      const msg = decodeClient(typeof raw === "string" ? raw : raw.toString());
      if (!msg) return sendError(ws, "INVALID_ARGUMENT", "无法解析的消息");

      const data = (msg.data ?? {}) as Record<string, unknown>;

      // 不需要房间上下文的消息
      switch (msg.type) {
        case "ping":
          return send(ws, { type: "pong", data: {} });
        case "admin_auth":
          return handleAdminAuth(ws, data);
        case "create_room":
          return handleCreateRoom(ws, data);
        case "join_room":
          return handleJoinRoom(ws, data);
      }

      // 以下都需要房间
      const room = getRoom(data.roomId);
      if (!room) return sendError(ws, "ROOM_NOT_FOUND", "房间不存在");
      touch(room);

      switch (msg.type) {
        case "leave_room":
          return detach(ws);
        case "player_action":
          return handlePlayerAction(ws, room, data);
        case "host_command":
          return handleHostCommand(ws, room, data);
        case "narration_ack": {
          const playerId = ws.data.playerId;
          if (playerId) handleNarrationAck(room, playerId, data.cueId);
          return;
        }
      }
    },

    close(ws) {
      detach(ws);
    },
  },
});

// 定期回收空房间与过期的限速记录
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  pruneRooms(now);
  pruneAuthFailures(now);
}, CLEANUP_INTERVAL_MS);

// ============================================================
// 优雅退出
// ============================================================
//
// 旧实现没有信号处理，node 作为 PID 1 收不到 SIGTERM，
// `docker stop` 每次都要等满 10 秒再被 SIGKILL。

function shutdown(signal: string): void {
  console.log(`[nightwolf] 收到 ${signal}，正在关闭…`);
  clearInterval(cleanupTimer);
  server.stop(true);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log(
  `[nightwolf] 监听 :${PORT} | 管理员凭证已配置: ${isAdminConfigured()}`,
);
