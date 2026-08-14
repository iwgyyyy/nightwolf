import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Billboard, Html } from "@react-three/drei"
import { Check, Crown } from "lucide-react"
import type { Group } from "three"
import { cn } from "@/lib/utils"
import { SEAT_RADIUS, TABLE_TOP_Y, type SeatPlacement } from "./seat-layout"
import { nameTexture } from "./cardTextures"
import { PALETTE } from "./palette"

interface SeatFigureProps {
  placement: SeatPlacement
  /** 玩家专属点缀色（identicon 前景色），用于披肩 */
  accentColor: string
  isHost?: boolean
  /** 断线：人影压暗 */
  dimmed?: boolean
  /** 主动退出房间（与掉线区分显示） */
  quit?: boolean
  /** 本阶段已提交（发牌确认/夜晚行动等），名牌显示对勾 */
  confirmed?: boolean
}

/**
 * 座位上的低多边形斗篷人影 + 头顶名牌。
 * 本地玩家不渲染此组件（相机就是他的眼睛）。
 */
export function SeatFigure({
  placement,
  accentColor,
  isHost,
  dimmed,
  quit,
  confirmed,
}: SeatFigureProps) {
  const body = useRef<Group>(null)
  // 呼吸相位由名字决定，同一玩家在所有客户端上节奏一致
  const breathPhase = useMemo(() => {
    let h = 0
    for (const ch of placement.player.name) h = (h * 31 + ch.charCodeAt(0)) | 0
    return (h >>> 0) % 628 / 100
  }, [placement.player.name])

  useFrame(({ clock }) => {
    if (!body.current) return
    body.current.position.y =
      Math.sin(clock.elapsedTime * 1.6 + breathPhase) * 0.012
  })

  const cloakColor = dimmed ? PALETTE.hoodShadow : PALETTE.cloak
  const accent = dimmed ? PALETTE.night700 : accentColor

  return (
    <group position={placement.position} rotation={[0, placement.rotationY, 0]}>
      <group ref={body}>
        {/* 斗篷身体（开口圆锥） */}
        <mesh position={[0, 0.62, 0]}>
          <coneGeometry args={[0.34, 0.92, 20, 1, true]} />
          <meshStandardMaterial color={cloakColor} roughness={1} />
        </mesh>
        {/* 披肩色带：玩家专属色 */}
        <mesh position={[0, 1.0, 0]}>
          <coneGeometry args={[0.21, 0.24, 20, 1, true]} />
          <meshStandardMaterial color={accent} roughness={0.85} />
        </mesh>
        {/* 头（藏在兜帽阴影里） */}
        <mesh position={[0, 1.18, 0.02]}>
          <sphereGeometry args={[0.155, 20, 16]} />
          <meshStandardMaterial color={PALETTE.night700} roughness={0.9} />
        </mesh>
        {/* 兜帽 */}
        <mesh position={[0, 1.24, -0.05]} rotation={[0.45, 0, 0]}>
          <coneGeometry args={[0.19, 0.32, 16, 1, true]} />
          <meshStandardMaterial color={cloakColor} roughness={1} />
        </mesh>
      </group>

      {/* 桌面名签：立在他面前身份牌外侧的桌沿（局部 +z 朝桌心），
          全阶段常显；billboard 面向相机，侧座也可读 */}
      <Billboard position={[0, TABLE_TOP_Y + 0.08, SEAT_RADIUS - 1.31]}>
        <mesh>
          <planeGeometry args={[0.72, 0.18]} />
          <meshStandardMaterial
            map={nameTexture(placement.player.name)}
            emissive="#ffffff"
            emissiveMap={nameTexture(placement.player.name)}
            emissiveIntensity={0.75}
            transparent
            roughness={1}
          />
        </mesh>
      </Billboard>

      {/* 名牌（固定屏幕尺寸；zIndexRange 压到眼睑幕 z-40 之下，闭眼时不穿帮） */}
      <Html
        position={[0, 1.62, 0]}
        center
        zIndexRange={[20, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div
          className={cn(
            "flex items-center gap-1 rounded-full border border-moon-100/10 bg-night-900/70 px-2 py-0.5 whitespace-nowrap backdrop-blur-sm",
            dimmed && "opacity-50",
          )}
        >
          {isHost && <Crown className="h-3 w-3 text-candle-500" />}
          <span className="font-display text-xs text-moon-100/85">
            {placement.player.name}
          </span>
          {quit ? (
            <span className="text-[10px] text-blood-500/70">已退出</span>
          ) : dimmed ? (
            <span className="text-[10px] text-moon-100/40">离线</span>
          ) : null}
          {confirmed && <Check className="h-3 w-3 text-sage-500" />}
        </div>
      </Html>
    </group>
  )
}
