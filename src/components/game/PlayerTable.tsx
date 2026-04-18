import { useMemo } from "react"
import { PlayerSeat } from "./PlayerSeat"
import { computeSeatPositions } from "./seat-positions"
import { cn } from "@/lib/utils"

export interface TablePlayer {
  playerId: string
  name: string
  isHost?: boolean
  isYou?: boolean
  isConnected?: boolean
  isActive?: boolean
  isEliminated?: boolean
  /** 危险高亮（狼人/出局预警） */
  danger?: boolean
  /** 上下浮动（闭眼漂浮） */
  floating?: boolean
  /** 睡眠状态叠加 Zz + 月亮 */
  sleeping?: boolean
  /** 座位下方挂的自定义内容（如背面卡牌） */
  below?: React.ReactNode
}

interface PlayerTableProps {
  players: TablePlayer[]
  /** 中心内容：桌面牌 / 倒计时 / 阶段提示 */
  center?: React.ReactNode
  /** 被选中的玩家 id（支持多选） */
  selectedPlayerIds?: string[]
  onPlayerClick?: (playerId: string) => void
  /** 外圆直径，单位 px */
  diameter?: number
  /** 座位尺寸 */
  seatSize?: "sm" | "md" | "lg"
  /** 某些座位提高 z-index（在遮罩上层） */
  raisedIds?: string[]
  className?: string
}

/**
 * 围桌环形布局。
 * 用三角函数把玩家均匀分布在圆周上，中心留给桌面牌 / 倒计时等。
 *
 * 响应式：通过 `diameter` 控制整体尺寸；建议移动端 300、PC 480。
 */
export function PlayerTable({
  players,
  center,
  selectedPlayerIds,
  onPlayerClick,
  diameter = 360,
  seatSize = "md",
  raisedIds,
  className,
}: PlayerTableProps) {
  const radius = diameter / 2 - 32 // 留边

  const positions = useMemo(
    () => computeSeatPositions(players.length, radius),
    [players.length, radius],
  )

  return (
    <div
      className={cn("relative", className)}
      style={{ width: diameter, height: diameter }}
    >
      {/* 桌面圆盘（装饰） */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-candle-500/20 bg-night-800/40"
        style={{
          width: diameter - 80,
          height: diameter - 80,
          boxShadow:
            "inset 0 0 60px oklch(0.78 0.13 75 / 0.08), 0 0 32px oklch(0 0 0 / 0.3)",
        }}
        aria-hidden
      />

      {/* 中心内容 */}
      {center && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {center}
        </div>
      )}

      {/* 玩家座位 */}
      {players.map((p, i) => {
        const pos = positions[i]
        const selected = selectedPlayerIds?.includes(p.playerId)
        const raised = raisedIds?.includes(p.playerId)
        return (
          <div
            key={p.playerId}
            className="absolute top-1/2 left-1/2"
            style={{
              transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
              zIndex: raised ? 30 : 10,
            }}
          >
            <PlayerSeat
              name={p.name}
              size={seatSize}
              isHost={p.isHost}
              isYou={p.isYou}
              isConnected={p.isConnected}
              isActive={p.isActive}
              isSleeping={p.sleeping}
              isEliminated={p.isEliminated}
              selected={selected}
              floating={p.floating}
              danger={p.danger}
              below={p.below}
              onClick={onPlayerClick ? () => onPlayerClick(p.playerId) : undefined}
            />
          </div>
        )
      })}
    </div>
  )
}

