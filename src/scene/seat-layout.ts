import type { PlayerPublicInfo } from "@/types"

// ============================================================
// 场景尺度常量（单位约等于米）
// ============================================================

export const TABLE_RADIUS = 1.4
export const TABLE_TOP_Y = 0.75
export const SEAT_RADIUS = 1.8
/** 每个座位面前身份牌所在的半径 */
export const CARD_RING_RADIUS = TABLE_RADIUS * 0.72
/** 牌面略高于桌面，避免 z-fighting */
export const CARD_Y = TABLE_TOP_Y + 0.004

export interface SeatPlacement {
  player: PlayerPublicInfo
  /** 人物脚下中心的世界坐标 */
  position: [number, number, number]
  /** 面向桌心的 Y 轴旋转 */
  rotationY: number
  /** 本地玩家的座位即相机位，不渲染人物 */
  isSelf: boolean
  /** 此座位面前身份牌的桌面位置 */
  cardPosition: [number, number, number]
}

/**
 * 把玩家环绕排布到 3D 圆桌旁。
 * 本地玩家固定坐在 φ=0（+z，相机一侧），其余按加入顺序沿圆周排开，
 * 因此每个客户端看到的桌子都是"自己在最近端"的视角。
 */
export function computeSeatPlacements(
  players: PlayerPublicInfo[],
  selfId: string | null,
): SeatPlacement[] {
  const n = players.length
  if (n === 0) return []
  const selfIndex = Math.max(
    0,
    players.findIndex((p) => p.playerId === selfId),
  )
  return players.map((player, i) => {
    const phi = ((i - selfIndex) / n) * Math.PI * 2
    const sin = Math.sin(phi)
    const cos = Math.cos(phi)
    return {
      player,
      position: [sin * SEAT_RADIUS, 0, cos * SEAT_RADIUS],
      rotationY: Math.atan2(sin, cos) + Math.PI,
      isSelf: player.playerId === selfId,
      cardPosition: [sin * CARD_RING_RADIUS, CARD_Y, cos * CARD_RING_RADIUS],
    }
  })
}

/** 桌心 3 张底牌的位置（横向一排，朝向本地玩家） */
export function centerCardPositions(): [number, number, number][] {
  const gap = 0.34
  return [-gap, 0, gap].map((x) => [x, CARD_Y, 0])
}
