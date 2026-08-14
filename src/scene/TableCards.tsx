import { useMemo } from "react"
import { useGameStore } from "@/stores/gameStore"
import { useLocalPlayerStore } from "@/hooks/use-local-player"
import { computeSeatPlacements, centerCardPositions } from "./seat-layout"
import { Card3D } from "./Card3D"

interface TableCardsProps {
  /** 可点击的玩家牌（不传则纯展示） */
  selectableIds?: Set<string>
  /** 选中的玩家牌（抬起+发光） */
  selectedId?: string | null
  onPick?: (playerId: string) => void
}

/**
 * 白天/投票阶段的静态桌牌：每人面前一张扣牌 + 3 张底牌，全牌背。
 * 夜晚交换过的牌真实归属只有服务端知道，这里只按标准布局摆扣牌。
 */
export function TableCards({ selectableIds, selectedId, onPick }: TableCardsProps) {
  const publicState = useGameStore((s) => s.publicState)
  const playerId = useLocalPlayerStore((s) => s.playerId)

  const placements = useMemo(
    () => computeSeatPlacements(publicState?.players ?? [], playerId),
    [publicState?.players, playerId],
  )

  if (!publicState) return null

  return (
    <>
      {placements.map((p) => {
        const id = p.player.playerId
        const pickable = !!selectableIds?.has(id) && !!onPick
        return (
          <Card3D
            key={id}
            position={p.cardPosition}
            rotationY={p.rotationY}
            role={null}
            highlighted={pickable}
            selected={selectedId === id}
            onClick={
              pickable
                ? (e) => {
                    e.stopPropagation()
                    onPick(id)
                  }
                : undefined
            }
          />
        )
      })}
      {centerCardPositions().map((pos, i) => (
        <Card3D key={`center-${i}`} position={pos} rotationY={0} role={null} />
      ))}
    </>
  )
}
