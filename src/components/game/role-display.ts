import type { Role } from "@/types"

/** 每个角色的代表汉字（单字），用于卡面主视觉 */
export const ROLE_GLYPH: Record<Role, string> = {
  werewolf: "狼",
  minion: "仆",
  seer: "卜",
  robber: "盗",
  troublemaker: "捣",
  drunk: "酒",
  insomniac: "眠",
  hunter: "猎",
  tanner: "匠",
  villager: "民",
}

/** 一句话角色描述，用于发牌阶段提示 + 夜晚回放 */
export const ROLE_DESCRIPTION: Record<Role, string> = {
  werewolf:
    "夜晚互相确认身份；若只有你一只狼，可偷看一张桌面牌。没有狼人被投出即获胜。",
  minion:
    "夜晚查看所有狼人身份。跟随狼人阵营胜负，但你被投出不算狼人被投出。",
  seer:
    "夜晚任选其一：查看一名玩家的身份牌，或查看两张桌面牌。",
  robber:
    "夜晚与一名其他玩家交换身份牌，然后看换来的新牌。",
  troublemaker:
    "夜晚交换两名其他玩家的身份牌（不看是什么）。",
  drunk:
    "夜晚与一张桌面牌交换，不看换来的新牌。",
  insomniac:
    "夜晚最后睁眼，查看自己当前的身份牌（确认有没有被换过）。",
  hunter:
    "被投票出局时，你投的人也一起出局（弃票则不带走任何人）。",
  tanner:
    "独立阵营。只有自己被投出时你才获胜，其他人都输。",
  villager:
    "普通村民，没有夜晚能力。狼人被投出时村民阵营获胜。",
}
