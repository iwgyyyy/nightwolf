/**
 * 服务端权威游戏状态机。
 *
 * 由前端 `use-host-orchestrator.ts` 迁移而来。原实现跑在房主浏览器里，
 * 通过 GameSyncService 把算好的状态推给 relay 广播；这里改为直接改房间状态
 * 并按可见性投影下发。
 *
 * 迁移过程中消失的两块复杂度：
 *   1. recoverPhaseTimer —— 房主刷新页面后按 phaseEndsAt 重建 setTimeout。
 *      服务端进程常驻，定时器不会丢，整块删掉。
 *   2. narration waitIdle —— 原本等房主本机 TTS 播完才推进，把游戏节奏绑在
 *      一台设备上。改为等所有在线客户端回 narration_ack（封顶超时兜底）。
 */

import { produce } from "immer";
import type {
  ActionType,
  HostGameState,
  NightAction,
  PrivatePlayerState,
  PublicRoomState,
  ResultData,
  Role,
  Vote,
} from "@/types";
import type { NightActionSubmission } from "@/types";
import {
  buildPlayAgainStates,
  buildStartGameStates,
  DEALING_TIMEOUT_MS,
  handleConfirmIdentity,
  markPhase,
  StartGameError,
} from "@/engine/orchestrator";
import { applyNightAction, applyTimeoutAction } from "@/engine/nightActions";
import {
  buildNightActionRequest,
  getActorsForStep,
  nightStepsFor,
} from "@/engine/nightSteps";
import { computeEliminated } from "@/engine/voting";
import { judgeWin } from "@/engine/winJudge";
import {
  broadcastPublic,
  clearNarrationTimer,
  clearPhaseTimer,
  sendPrivate,
  touch,
  type Room,
} from "./room";

/** 等所有在线客户端播完语音的封顶时长，超时就强行推进 */
const NARRATION_TIMEOUT_MS = 8_000;

/** 步骤超时推进时，为未提交 actor 生成的默认 actionType */
const TIMEOUT_ACTION_TYPE: Record<Role, ActionType | null> = {
  werewolf: "werewolfConfirm",
  minion: "viewWerewolves",
  seer: "viewOnePlayer",
  robber: "swapWithPlayer",
  troublemaker: "swapTwoPlayers",
  drunk: "swapWithCenter",
  insomniac: "viewSelf",
  villager: null,
  hunter: null,
  tanner: null,
};

// ============================================================
// 播报对齐
// ============================================================

/**
 * 开一个新的播报窗口：换 cueId、清空 ack、phaseEndsAt 置空（倒计时暂停）。
 * 返回的 cueId 会随 publicState 广播出去。
 */
function beginNarration(room: Room): string {
  clearNarrationTimer(room);
  room.cueCounter++;
  const cueId = `cue-${room.cueCounter}`;
  room.pendingCueId = cueId;
  room.narrationAcks.clear();
  return cueId;
}

function onlinePlayerIds(room: Room): string[] {
  return room.publicState.players
    .filter((p) => room.connections.has(p.playerId))
    .map((p) => p.playerId);
}

/** 等所有在线玩家 ack，或超时。没有在线玩家时立即返回。 */
function waitForNarration(room: Room): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!room.pendingCueId) return resolve();
    const online = onlinePlayerIds(room);
    if (online.length === 0) {
      settleNarration(room);
      return resolve();
    }
    room.onNarrationSettled = resolve;
    room.narrationTimer = setTimeout(() => {
      settleNarration(room);
    }, NARRATION_TIMEOUT_MS);
  });
}

function settleNarration(room: Room): void {
  clearNarrationTimer(room);
  room.pendingCueId = null;
  room.narrationAcks.clear();
  const cb = room.onNarrationSettled;
  room.onNarrationSettled = null;
  cb?.();
}

/** 客户端播报完成回执 */
export function handleNarrationAck(
  room: Room,
  playerId: string,
  cueId: unknown,
): void {
  if (!room.pendingCueId || room.pendingCueId !== cueId) return;
  room.narrationAcks.add(playerId);
  const online = onlinePlayerIds(room);
  if (online.every((id) => room.narrationAcks.has(id))) {
    settleNarration(room);
  }
}

/**
 * 掉线的玩家不该再把整局游戏卡在等 ack 上。
 * 连接断开时调用，若剩下的在线玩家都已 ack 就立即结算。
 */
export function reconcileNarration(room: Room): void {
  if (!room.pendingCueId) return;
  const online = onlinePlayerIds(room);
  if (online.length === 0 || online.every((id) => room.narrationAcks.has(id))) {
    settleNarration(room);
  }
}

// ============================================================
// 开始游戏
// ============================================================

export function startGame(room: Room): { ok: true } | { ok: false; message: string } {
  clearPhaseTimer(room);
  try {
    const { publicState, hostState, privateStates } = buildStartGameStates(
      room.publicState,
    );
    room.publicState = publicState;
    room.secret = hostState;
    room.privateStates = new Map(Object.entries(privateStates));
    touch(room);

    broadcastPublic(room);
    // 每人只收到自己那张牌
    for (const playerId of room.privateStates.keys()) {
      sendPrivate(room, playerId);
    }

    // 发牌超时兜底：到点把未确认的玩家视为已确认，直接进夜晚
    room.phaseTimer = setTimeout(() => {
      room.phaseTimer = null;
      void forceEnterNightFromDealing(room);
    }, DEALING_TIMEOUT_MS);

    return { ok: true };
  } catch (err) {
    if (err instanceof StartGameError) return { ok: false, message: err.message };
    return { ok: false, message: "开始游戏失败" };
  }
}

// ============================================================
// 确认身份 → 夜晚
// ============================================================

export async function confirmIdentity(room: Room, playerId: string): Promise<void> {
  if (room.publicState.gamePhase !== "dealing") return;
  const { publicState, allConfirmed } = handleConfirmIdentity(
    room.publicState,
    playerId,
  );
  touch(room);

  if (!allConfirmed) {
    if (publicState !== room.publicState) {
      room.publicState = publicState;
      broadcastPublic(room);
    }
    return;
  }

  clearPhaseTimer(room);
  room.publicState = publicState;
  await enterNight(room);
}

async function forceEnterNightFromDealing(room: Room): Promise<void> {
  if (room.publicState.gamePhase !== "dealing") return;
  await enterNight(room);
}

/** dealing → night step 0 */
async function enterNight(room: Room): Promise<void> {
  const cueId = beginNarration(room);
  room.publicState = {
    ...room.publicState,
    gamePhase: "night",
    phaseStartedAt: new Date().toISOString(),
    phaseEndsAt: null,
    currentNightStep: 0,
    narrationCueId: cueId,
    submittedPlayerIds: [],
  };
  broadcastPublic(room);

  await waitForNarration(room);
  await enterNightStep(room, 0);
}

// ============================================================
// 夜晚步骤
// ============================================================

/**
 * 推进到指定夜晚步骤。stepIndex 越界表示夜晚结束，转白天。
 *
 * 即使这一步没有任何玩家持有对应角色，也要照常等满 actionTime——
 * 否则从"某步骤秒过"就能反推出没人拿到那张牌。
 */
async function enterNightStep(room: Room, stepIndex: number): Promise<void> {
  clearPhaseTimer(room);
  const secret = room.secret;
  if (!secret) return;

  const steps = nightStepsFor(secret);
  if (stepIndex >= steps.length) {
    await enterDayPhase(room);
    return;
  }

  const stepRole = steps[stepIndex]!;
  const actors = getActorsForStep(stepRole, secret);

  room.secret = { ...secret, nightStepIndex: stepIndex };

  // 先切步骤并暂停倒计时，让各端播"上一角色闭眼 / 本角色睁眼"
  const cueId = beginNarration(room);
  room.publicState = {
    ...room.publicState,
    gamePhase: "night",
    currentNightStep: stepIndex,
    narrationCueId: cueId,
    submittedPlayerIds: [],
    phaseStartedAt: new Date().toISOString(),
    phaseEndsAt: null,
  };
  broadcastPublic(room);

  await waitForNarration(room);

  // 播完了才开始计时
  const actionTimeMs = Math.max(room.publicState.settings.actionTime, 1) * 1000;
  room.publicState = {
    ...room.publicState,
    phaseStartedAt: new Date().toISOString(),
    phaseEndsAt: new Date(Date.now() + actionTimeMs).toISOString(),
  };
  broadcastPublic(room);

  // 给本步骤的行动者下发操作请求（单播）
  for (const actorId of actors) {
    const request = buildNightActionRequest(
      actorId,
      stepRole,
      room.publicState,
      room.secret,
    );
    if (!request) continue;
    room.privateStates.set(actorId, {
      playerId: actorId,
      originalRole: room.secret.originalRoles[actorId]!,
      currentRole: room.secret.allPlayerRoles[actorId]!,
      nightActionRequest: request,
      nightActionResult: null,
    });
    sendPrivate(room, actorId);
  }

  room.phaseTimer = setTimeout(() => {
    room.phaseTimer = null;
    void advanceNightStep(room, stepIndex);
  }, actionTimeMs);
}

/** 定时到期：给未提交的行动者补默认操作，然后进下一步 */
async function advanceNightStep(room: Room, expectedStepIndex: number): Promise<void> {
  const secret = room.secret;
  if (!secret) return;
  if (room.publicState.gamePhase !== "night") return;
  // 幂等：这一步已经被推进过就跳过
  if (secret.nightStepIndex !== expectedStepIndex) return;

  const steps = nightStepsFor(secret);
  const stepRole = steps[expectedStepIndex];
  let state = secret;

  if (stepRole) {
    const actors = getActorsForStep(stepRole, secret);
    const pending = actors.filter(
      (id) => !room.publicState.submittedPlayerIds.includes(id),
    );
    const actionType = TIMEOUT_ACTION_TYPE[stepRole];
    if (actionType) {
      for (const actorId of pending) {
        state = applyTimeoutAction(state, actorId, actionType);
        room.privateStates.set(actorId, {
          playerId: actorId,
          originalRole: state.originalRoles[actorId]!,
          currentRole: state.allPlayerRoles[actorId]!,
          nightActionRequest: null,
          nightActionResult: null,
        });
        sendPrivate(room, actorId);
      }
    }
    room.secret = state;
  }

  await enterNightStep(room, expectedStepIndex + 1);
}

/** 玩家提交夜晚操作 */
export function submitNightAction(
  room: Room,
  playerId: string,
  submission: NightActionSubmission,
): void {
  const secret = room.secret;
  if (!secret) return;
  if (room.publicState.gamePhase !== "night") return;

  const { state: nextSecret, result } = applyNightAction(
    secret,
    playerId,
    submission,
  );
  room.secret = nextSecret;
  touch(room);

  // 操作者拿到结果，清空待办
  room.privateStates.set(playerId, {
    playerId,
    originalRole: nextSecret.originalRoles[playerId]!,
    currentRole: nextSecret.allPlayerRoles[playerId]!,
    nightActionRequest: null,
    nightActionResult: result,
  });
  sendPrivate(room, playerId);

  // 身份被换走的人也要同步 currentRole（但不告诉他们是谁干的）
  const lastAction = nextSecret.nightActions[nextSecret.nightActions.length - 1];
  for (const id of affectedPlayerIds(lastAction)) {
    if (id === playerId) continue;
    room.privateStates.set(id, {
      playerId: id,
      originalRole: nextSecret.originalRoles[id]!,
      currentRole: nextSecret.allPlayerRoles[id]!,
      nightActionRequest: null,
      nightActionResult: null,
    });
    sendPrivate(room, id);
  }

  // 不主动推进步骤，等定时器到期，避免泄露"这一步的人都操作完了"
  if (!room.publicState.submittedPlayerIds.includes(playerId)) {
    room.publicState = {
      ...room.publicState,
      submittedPlayerIds: [...room.publicState.submittedPlayerIds, playerId],
    };
    broadcastPublic(room);
  }
}

function affectedPlayerIds(action: NightAction | undefined): string[] {
  if (!action?.cardChanges) return [];
  return action.cardChanges
    .map((c) => c.targetId)
    .filter((id) => !id.startsWith("center_"));
}

// ============================================================
// 白天 / 投票 / 结算
// ============================================================

async function enterDayPhase(room: Room): Promise<void> {
  clearPhaseTimer(room);

  const cueId = beginNarration(room);
  room.publicState = {
    ...markPhase(room.publicState, "day"),
    currentNightStep: null,
    narrationCueId: cueId,
    submittedPlayerIds: [],
    resultData: null,
  };
  broadcastPublic(room);

  await waitForNarration(room);

  // 播报期间房主可能已经点了"提前结束讨论"
  if (room.publicState.gamePhase !== "day") return;

  const durationMs = room.publicState.settings.discussionTime * 60 * 1000;
  room.publicState = {
    ...room.publicState,
    phaseStartedAt: new Date().toISOString(),
    phaseEndsAt: new Date(Date.now() + durationMs).toISOString(),
  };
  broadcastPublic(room);

  room.phaseTimer = setTimeout(() => {
    room.phaseTimer = null;
    enterVotingPhase(room);
  }, durationMs);
}

/** 房主提前结束讨论 */
export function endDay(room: Room): void {
  if (room.publicState.gamePhase !== "day") return;
  clearPhaseTimer(room);
  enterVotingPhase(room);
}

function enterVotingPhase(room: Room): void {
  clearPhaseTimer(room);
  if (!room.secret) return;

  room.secret = { ...room.secret, votes: [] };
  room.publicState = {
    ...markPhase(room.publicState, "voting", room.publicState.settings.voteTime),
    currentNightStep: null,
    narrationCueId: null,
    submittedPlayerIds: [],
  };
  broadcastPublic(room);

  const durationMs = room.publicState.settings.voteTime * 1000;
  room.phaseTimer = setTimeout(() => {
    room.phaseTimer = null;
    finalizeVoting(room);
  }, durationMs);
}

export function submitVote(
  room: Room,
  playerId: string,
  targetId: string | null,
): void {
  if (room.publicState.gamePhase !== "voting") return;
  const secret = room.secret;
  if (!secret) return;
  touch(room);

  // 允许改票，直到结算
  const votes: Vote[] = [
    ...secret.votes.filter((v) => v.voterId !== playerId),
    { voterId: playerId, targetId },
  ];
  room.secret = { ...secret, votes };

  const submitted = room.publicState.submittedPlayerIds.includes(playerId)
    ? room.publicState.submittedPlayerIds
    : [...room.publicState.submittedPlayerIds, playerId];
  room.publicState = { ...room.publicState, submittedPlayerIds: submitted };
  broadcastPublic(room);

  if (submitted.length >= room.publicState.players.length) {
    clearPhaseTimer(room);
    finalizeVoting(room);
  }
}

/** 计票 + 判胜负，此时才把所有人的身份公开 */
function finalizeVoting(room: Room): void {
  clearPhaseTimer(room);
  const secret = room.secret;
  if (!secret) return;
  if (room.publicState.gamePhase !== "voting") return;

  const voted = new Set(secret.votes.map((v) => v.voterId));
  const abstain: Vote[] = room.publicState.players
    .filter((p) => !voted.has(p.playerId))
    .map((p) => ({ voterId: p.playerId, targetId: null }));
  const allVotes: Vote[] = [...secret.votes, ...abstain];

  const eliminated = computeEliminated(allVotes, secret.allPlayerRoles);
  const winner = judgeWin(eliminated, secret.allPlayerRoles);

  const resultData: ResultData = {
    votes: allVotes,
    eliminatedPlayerIds: eliminated,
    finalRoles: { ...secret.allPlayerRoles },
    centerCards: [...secret.centerCards],
    nightActions: [...secret.nightActions],
    winner,
  };

  room.publicState = {
    ...markPhase(room.publicState, "result"),
    currentNightStep: null,
    narrationCueId: null,
    submittedPlayerIds: [],
    resultData,
  };
  broadcastPublic(room);

  // 结算面板要展示每个人的最终身份，这一刻起私有状态也可以揭示
  for (const p of room.publicState.players) {
    room.privateStates.set(p.playerId, {
      playerId: p.playerId,
      originalRole: secret.originalRoles[p.playerId]!,
      currentRole: secret.allPlayerRoles[p.playerId]!,
      nightActionRequest: null,
      nightActionResult: null,
    });
    sendPrivate(room, p.playerId);
  }
}

// ============================================================
// 再来一局
// ============================================================

export function playAgain(room: Room): void {
  clearPhaseTimer(room);
  clearNarrationTimer(room);
  room.pendingCueId = null;
  room.narrationAcks.clear();
  room.onNarrationSettled = null;

  const { publicState } = buildPlayAgainStates(room.publicState);
  room.publicState = publicState;
  room.secret = null;
  room.privateStates.clear();
  touch(room);
  broadcastPublic(room);
}

// ============================================================
// 大厅设置
// ============================================================

export function updateSettings(
  room: Room,
  patch: Partial<PublicRoomState["settings"]>,
): void {
  // 开局后不允许再改，否则角色池和已发的牌会对不上
  if (room.publicState.gamePhase !== "waiting") return;
  room.publicState = {
    ...room.publicState,
    settings: { ...room.publicState.settings, ...patch },
  };
  touch(room);
  broadcastPublic(room);
}

// ============================================================
// 改名
// ============================================================

export function updateProfile(room: Room, playerId: string, name: string): void {
  room.publicState = produce(room.publicState, (draft: PublicRoomState) => {
    const p = draft.players.find((x) => x.playerId === playerId);
    if (p) p.name = name;
  });
  touch(room);
  broadcastPublic(room);
}

export type { HostGameState, PrivatePlayerState };
