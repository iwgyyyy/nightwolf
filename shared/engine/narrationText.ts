import type { Role } from "../types"
import { ROLE_META } from "../types"

/** 夜晚开始的开场白 */
export const NIGHT_START_TEXT = "天黑请闭眼"

/** 白天开始的开场白 */
export const DAY_START_TEXT = "天亮了，所有人请睁眼"

/** 讨论结束、请投票 */
export const VOTE_START_TEXT = "讨论结束，请开始投票"

/** 投票结束 */
export const VOTE_END_TEXT = "投票结束"

/**
 * 各角色睁眼播报的完整台词：点名 + 本回合能做什么（像实体桌游主持人）。
 * 文案须与夜晚实际交互一致（见 shared/types/action.ts 的 NightActionSubmission）。
 */
const OPEN_EYES_TEXT: Partial<Record<Role, string>> = {
  werewolf:
    "狼人请睁眼，请与你的狼人同伴互相确认身份。如果你是唯一的狼人，你可以查看中央的一张底牌。",
  minion: "爪牙请睁眼，你将知道谁是狼人。",
  seer: "预言家请睁眼，你可以查看一名玩家的身份牌，或者查看中央的两张底牌。",
  robber: "强盗请睁眼，你可以与一名玩家交换身份牌，并查看你的新身份。",
  troublemaker: "捣蛋鬼请睁眼，你可以交换另外两名玩家的身份牌。",
  drunk: "酒鬼请睁眼，你必须与中央的一张底牌交换身份牌，并且不能查看新身份。",
  insomniac: "失眠者请睁眼，你可以查看自己的身份牌，确认它是否被换过。",
}

export function openEyesTextFor(role: Role): string {
  return OPEN_EYES_TEXT[role] ?? `${ROLE_META[role].displayName}请睁眼`
}

export function closeEyesTextFor(role: Role): string {
  return `${ROLE_META[role].displayName}请闭眼`
}
