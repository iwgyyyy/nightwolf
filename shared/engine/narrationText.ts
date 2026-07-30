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

export function openEyesTextFor(role: Role): string {
  return `${ROLE_META[role].displayName}请睁眼`
}

export function closeEyesTextFor(role: Role): string {
  return `${ROLE_META[role].displayName}请闭眼`
}
