import { useMemo, type ReactNode } from "react"
import { Canvas } from "@react-three/fiber"
import type { PlayerPublicInfo } from "@/types"
import { identiconColors } from "@/services/identicon"
import { computeSeatPlacements } from "./seat-layout"
import { NightEnvironment } from "./NightEnvironment"
import { Table, Candle } from "./Table"
import { SeatFigure } from "./SeatFigure"
import { CameraRig } from "./CameraRig"

export interface GameSceneProps {
  players: PlayerPublicInfo[]
  /** 本地玩家 ID：他的座位就是相机位 */
  selfId: string | null
  hostId?: string | null
  /** 本阶段已提交的玩家，座位名牌显示对勾 */
  confirmedIds?: string[]
  /** 阶段相关的场景内容（牌、手等）由各阶段插入 */
  children?: ReactNode
}

/**
 * 3D 圆桌场景根组件。填满父容器（父容器需定位），
 * DOM HUD 作为兄弟节点叠加在上层，不进 Canvas。
 */
export function GameScene({
  players,
  selfId,
  hostId,
  confirmedIds,
  children,
}: GameSceneProps) {
  const placements = useMemo(
    () => computeSeatPlacements(players, selfId),
    [players, selfId],
  )

  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 50, position: [0, 1.8, 3], near: 0.1, far: 60 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <NightEnvironment />
        <CameraRig />
        <Table />
        <Candle />
        {placements
          .filter((p) => !p.isSelf)
          .map((p) => (
            <SeatFigure
              key={p.player.playerId}
              placement={p}
              accentColor={identiconColors(p.player.name).fg}
              isHost={p.player.playerId === hostId}
              dimmed={!p.player.isConnected}
              confirmed={confirmedIds?.includes(p.player.playerId)}
            />
          ))}
        {children}
      </Canvas>
    </div>
  )
}
