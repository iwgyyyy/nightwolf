import type { RoomSettings } from "@/types"

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  roles: [],
  discussionTime: 5,
  actionTime: 20,
  voteTime: 30,
}

/** 房间号最大玩家数（包含 Host） */
export const MAX_PLAYERS_PER_ROOM = 10
