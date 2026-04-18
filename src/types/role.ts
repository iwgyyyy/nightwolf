export type Team = "werewolf" | "villager" | "independent"

export type Role =
  | "werewolf"
  | "minion"
  | "seer"
  | "robber"
  | "troublemaker"
  | "drunk"
  | "insomniac"
  | "hunter"
  | "tanner"
  | "villager"

export interface RoleMeta {
  role: Role
  team: Team
  /** 夜晚唤醒顺序；null 表示没有夜晚操作 */
  nightOrder: number | null
  /** 一局中同一角色最多可选的数量 */
  maxCount: number
  /** 中文显示名（TTS 和 UI 都用） */
  displayName: string
}

export const ROLE_META: Record<Role, RoleMeta> = {
  werewolf: {
    role: "werewolf",
    team: "werewolf",
    nightOrder: 1,
    maxCount: 2,
    displayName: "狼人",
  },
  minion: {
    role: "minion",
    team: "werewolf",
    nightOrder: 2,
    maxCount: 1,
    displayName: "爪牙",
  },
  seer: {
    role: "seer",
    team: "villager",
    nightOrder: 3,
    maxCount: 1,
    displayName: "预言家",
  },
  robber: {
    role: "robber",
    team: "villager",
    nightOrder: 4,
    maxCount: 1,
    displayName: "强盗",
  },
  troublemaker: {
    role: "troublemaker",
    team: "villager",
    nightOrder: 5,
    maxCount: 1,
    displayName: "捣蛋鬼",
  },
  drunk: {
    role: "drunk",
    team: "villager",
    nightOrder: 6,
    maxCount: 1,
    displayName: "酒鬼",
  },
  insomniac: {
    role: "insomniac",
    team: "villager",
    nightOrder: 7,
    maxCount: 1,
    displayName: "失眠者",
  },
  hunter: {
    role: "hunter",
    team: "villager",
    nightOrder: null,
    maxCount: 1,
    displayName: "猎人",
  },
  tanner: {
    role: "tanner",
    team: "independent",
    nightOrder: null,
    maxCount: 1,
    displayName: "皮匠",
  },
  villager: {
    role: "villager",
    team: "villager",
    nightOrder: null,
    maxCount: 3,
    displayName: "村民",
  },
}

export const ALL_ROLES: Role[] = Object.keys(ROLE_META) as Role[]
