/**
 * 一夜狼人杀 Web — WebSocket Relay
 *
 * 基础功能：
 *   - 房间创建/加入/离开/解散
 *   - 公共/私有/Host 状态广播
 *   - 玩家操作（submit_action）透传给 Host
 *   - 心跳（30s ping）
 *   - 房间 TTL 清理（10 分钟无活动）
 *   - Host 断线自动 isPaused；重连取消
 *
 * Web 特有：
 *   - create_room 校验 adminCredentials（对比环境变量 ADMIN_USERNAME/ADMIN_PASSWORD）
 *   - join_room：非 waiting 阶段拒绝新玩家（GAME_IN_PROGRESS）
 *   - join_room：房间满 10 人拒绝（ROOM_FULL）
 *
 * 部署注意：
 *   - 必须单实例（MinNum=1, MaxNum=1）— 房间在内存中
 *   - 在 CloudBase 云函数控制台配置 ADMIN_USERNAME / ADMIN_PASSWORD 环境变量
 */

const { WebSocketServer } = require("ws");

const PORT = process.env.PORT ? Number(process.env.PORT) : 9000;
const HEARTBEAT_INTERVAL = 30_000;
const ROOM_CLEANUP_INTERVAL = 5 * 60_000;
const ROOM_TTL = 10 * 60_000;
const ROOM_ID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 与前端 roomId.ts 一致
const ROOM_ID_LENGTH = 6;
const MAX_PLAYERS_PER_ROOM = 10;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

// roomId -> { hostId, publicState, connections: Map<playerId, ws>, lastActivity }
const rooms = new Map();
// ws -> { roomId, playerId }
const wsInfo = new Map();

// ============================================================
// helpers
// ============================================================

function generateRoomId() {
  let id;
  do {
    id = "";
    for (let i = 0; i < ROOM_ID_LENGTH; i++) {
      id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
    }
  } while (rooms.has(id));
  return id;
}

/** 去掉毫秒，兼容 Swift iOS8601 解析（保留给 iOS 客户端兼容） */
function nowISO() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function send(ws, type, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

function sendError(ws, code, message) {
  send(ws, "error", { code, message });
}

function broadcast(room, type, data) {
  const msg = JSON.stringify({ type, data });
  for (const ws of room.connections.values()) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

function broadcastPublicState(room) {
  broadcast(room, "public_state", { state: room.publicState });
}

function verifyAdmin(creds) {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    // 未配置 → 拒绝所有（避免生产环境意外开放）
    return false;
  }
  if (!creds || typeof creds !== "object") return false;
  return creds.username === ADMIN_USERNAME && creds.password === ADMIN_PASSWORD;
}

// ============================================================
// message handlers
// ============================================================

function handleCreateRoom(ws, data) {
  if (!data.hostId || !data.settings) {
    return sendError(ws, "INVALID_ARGUMENT", "Missing hostId or settings");
  }

  // 凭证校验
  if (!verifyAdmin(data.adminCredentials)) {
    return sendError(ws, "UNAUTHORIZED", "管理员凭证无效");
  }

  const roomId = generateRoomId();
  const publicState = {
    roomId,
    hostId: data.hostId,
    gamePhase: "waiting",
    settings: data.settings,
    players: [],
    currentNightStep: null,
    phaseStartedAt: nowISO(),
    phaseEndsAt: null,
    isPaused: false,
    pauseRemainingSeconds: null,
    submittedPlayerIds: [],
    resultData: null,
  };

  rooms.set(roomId, {
    hostId: data.hostId,
    publicState,
    connections: new Map(),
    lastActivity: Date.now(),
  });

  send(ws, "room_created", { requestId: data.requestId, roomId });
}

function handleJoinRoom(ws, data) {
  if (!data.roomId || !data.player || !data.player.playerId) {
    return sendError(ws, "INVALID_ARGUMENT", "Missing roomId or player");
  }

  const room = rooms.get(data.roomId);
  if (!room) {
    return sendError(ws, "ROOM_NOT_FOUND", `房间 ${data.roomId} 不存在`);
  }

  room.lastActivity = Date.now();
  const player = data.player;
  const playerId = player.playerId;

  // 重连判断
  const existingIdx = room.publicState.players.findIndex(
    (p) => p.playerId === playerId,
  );
  const isReconnect = existingIdx >= 0;

  // 非 waiting + 新玩家 → 拒绝
  if (room.publicState.gamePhase !== "waiting" && !isReconnect) {
    return sendError(
      ws,
      "GAME_IN_PROGRESS",
      `房间 ${data.roomId} 的游戏已经开始`,
    );
  }

  // waiting + 满人 + 新玩家 → 拒绝
  if (
    room.publicState.gamePhase === "waiting" &&
    !isReconnect &&
    room.publicState.players.length >= MAX_PLAYERS_PER_ROOM
  ) {
    return sendError(ws, "ROOM_FULL", `房间已满（${MAX_PLAYERS_PER_ROOM} 人）`);
  }

  // 清理本 ws 若之前挂在其他房间
  const prev = wsInfo.get(ws);
  if (prev && prev.roomId !== data.roomId) {
    cleanupConnection(ws);
  }

  // 注册连接
  room.connections.set(playerId, ws);
  wsInfo.set(ws, { roomId: data.roomId, playerId });

  // Host 重连取消暂停
  if (playerId === room.hostId && room.publicState.isPaused === true) {
    room.publicState.isPaused = false;
    room.publicState.pauseRemainingSeconds = null;
    broadcastPublicState(room);
    return;
  }

  // waiting 阶段：upsert 玩家并广播
  if (room.publicState.gamePhase === "waiting") {
    if (isReconnect) {
      room.publicState.players[existingIdx] = player;
    } else {
      room.publicState.players.push(player);
    }
    broadcastPublicState(room);
  } else {
    // 非 waiting 阶段的重连：单播一份最新 publicState
    send(ws, "public_state", { state: room.publicState });
  }
}

function handleLeaveRoom(ws, data) {
  if (!data.roomId || !data.playerId) {
    return sendError(ws, "INVALID_ARGUMENT", "Missing roomId or playerId");
  }

  const room = rooms.get(data.roomId);
  if (!room) return;

  room.lastActivity = Date.now();
  room.connections.delete(data.playerId);

  const info = wsInfo.get(ws);
  if (info && info.roomId === data.roomId && info.playerId === data.playerId) {
    wsInfo.delete(ws);
  }

  if (room.publicState.gamePhase === "waiting") {
    room.publicState.players = room.publicState.players.filter(
      (p) => p.playerId !== data.playerId,
    );
    broadcastPublicState(room);
  }
}

function handleDeleteRoom(ws, data) {
  if (!data.roomId) {
    return sendError(ws, "INVALID_ARGUMENT", "Missing roomId");
  }

  const room = rooms.get(data.roomId);
  if (!room) return;

  // 仅 host 可解散
  const info = wsInfo.get(ws);
  if (info && info.playerId !== room.hostId) {
    return sendError(ws, "UNAUTHORIZED", "仅房主可解散房间");
  }

  broadcast(room, "room_deleted", { roomId: data.roomId });

  for (const [, connWs] of room.connections) {
    wsInfo.delete(connWs);
  }
  rooms.delete(data.roomId);
}

function handleUpdatePublicState(ws, data) {
  if (!data.roomId || !data.state) {
    return sendError(ws, "INVALID_ARGUMENT", "Missing roomId or state");
  }

  const room = rooms.get(data.roomId);
  if (!room) {
    return sendError(ws, "ROOM_NOT_FOUND", "Room not found");
  }

  room.lastActivity = Date.now();
  room.publicState = data.state;
  broadcastPublicState(room);
}

function handleUpdatePrivateState(ws, data) {
  if (!data.roomId || !data.playerId || !data.state) {
    return sendError(
      ws,
      "INVALID_ARGUMENT",
      "Missing roomId, playerId or state",
    );
  }

  const room = rooms.get(data.roomId);
  if (!room) {
    return sendError(ws, "ROOM_NOT_FOUND", "Room not found");
  }

  room.lastActivity = Date.now();
  // 注意：同 iOS 版一样广播给所有连接，由客户端按 playerId 过滤
  broadcast(room, "private_state", {
    playerId: data.playerId,
    state: data.state,
  });
}

function handleUpdateHostState(ws, data) {
  if (!data.roomId || !data.state) {
    return sendError(ws, "INVALID_ARGUMENT", "Missing roomId or state");
  }

  const room = rooms.get(data.roomId);
  if (!room) {
    return sendError(ws, "ROOM_NOT_FOUND", "Room not found");
  }

  room.lastActivity = Date.now();
  broadcast(room, "host_state", { state: data.state });
}

function handleSubmitAction(ws, data) {
  if (!data.roomId || !data.playerId || !data.action) {
    return sendError(
      ws,
      "INVALID_ARGUMENT",
      "Missing roomId, playerId or action",
    );
  }

  const room = rooms.get(data.roomId);
  if (!room) {
    return sendError(ws, "ROOM_NOT_FOUND", "Room not found");
  }

  room.lastActivity = Date.now();
  broadcast(room, "player_action", {
    playerId: data.playerId,
    action: data.action,
  });
}

// ============================================================
// disconnect cleanup
// ============================================================

function cleanupConnection(ws) {
  const info = wsInfo.get(ws);
  if (!info) return;

  const { roomId, playerId } = info;
  wsInfo.delete(ws);

  const room = rooms.get(roomId);
  if (!room) return;

  room.connections.delete(playerId);

  if (room.publicState.gamePhase === "waiting") {
    room.publicState.players = room.publicState.players.filter(
      (p) => p.playerId !== playerId,
    );
    broadcastPublicState(room);
  } else if (playerId === room.hostId) {
    room.publicState.isPaused = true;
    broadcastPublicState(room);
  }
}

// ============================================================
// server setup
// ============================================================

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return sendError(ws, "INVALID_ARGUMENT", "Invalid JSON");
    }

    const { type, data } = msg;
    if (!type || typeof type !== "string") {
      return sendError(ws, "INVALID_ARGUMENT", "Missing type");
    }

    switch (type) {
      case "create_room":
        return handleCreateRoom(ws, data || {});
      case "join_room":
        return handleJoinRoom(ws, data || {});
      case "leave_room":
        return handleLeaveRoom(ws, data || {});
      case "delete_room":
        return handleDeleteRoom(ws, data || {});
      case "update_public_state":
        return handleUpdatePublicState(ws, data || {});
      case "update_private_state":
        return handleUpdatePrivateState(ws, data || {});
      case "update_host_state":
        return handleUpdateHostState(ws, data || {});
      case "submit_action":
        return handleSubmitAction(ws, data || {});
      case "ping":
        return send(ws, "pong", {});
      default:
        return sendError(
          ws,
          "INVALID_ARGUMENT",
          `Unknown message type: ${type}`,
        );
    }
  });

  ws.on("close", () => cleanupConnection(ws));
  ws.on("error", () => cleanupConnection(ws));
});

// 心跳
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      cleanupConnection(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// 房间 TTL 清理
const roomCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (room.connections.size === 0 && now - room.lastActivity > ROOM_TTL) {
      rooms.delete(roomId);
    }
  }
}, ROOM_CLEANUP_INTERVAL);

wss.on("close", () => {
  clearInterval(heartbeatInterval);
  clearInterval(roomCleanupInterval);
});

console.log(
  `[ws-relay] listening on :${PORT} | admin configured: ${!!ADMIN_USERNAME}`,
);
