import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Billboard, Html } from "@react-three/drei"
import { Check, Crown } from "lucide-react"
import type { Group, MeshStandardMaterial } from "three"
import { cn } from "@/lib/utils"
import { SEAT_RADIUS, TABLE_TOP_Y, type SeatPlacement } from "./seat-layout"
import { nameTexture, SPEAKING_FRAMES, type VoiceBadge } from "./cardTextures"
import { useVoiceUiStore } from "@/stores/voiceUiStore"
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
  /** 淡出头顶 DOM 名牌（看牌/翻牌时它会盖在牌上层；桌面名签仍在） */
  hideTag?: boolean
  /** 隐藏桌面名签（举牌到眼前时它 depthTest=false 会画在牌上面） */
  hideTableTag?: boolean
  /** 结算：被投出局，桌面名签名字后加红色"出局" */
  eliminated?: boolean
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
  hideTag,
  hideTableTag,
  eliminated,
}: SeatFigureProps) {
  const body = useRef<Group>(null)
  // 呼吸相位由名字决定，同一玩家在所有客户端上节奏一致
  const breathPhase = useMemo(() => {
    let h = 0
    for (const ch of placement.player.name) h = (h * 31 + ch.charCodeAt(0)) | 0
    return (h >>> 0) % 628 / 100
  }, [placement.player.name])

  const tagMat = useRef<MeshStandardMaterial>(null)

  useFrame(({ clock }) => {
    if (body.current) {
      body.current.position.y =
        Math.sin(clock.elapsedTime * 1.6 + breathPhase) * 0.012
    }
    // 名签语音角标：直接从 store 读并按帧换贴图（不触发 React 渲染），
    // speaking 的声波弧 3 帧循环形成"正在播放"的动画
    const mat = tagMat.current
    if (mat) {
      const v = useVoiceUiStore.getState().peers[placement.player.playerId]
      const badge: VoiceBadge = v?.speaking
        ? "speaking"
        : v?.micOn
          ? "none"
          : "muted"
      const frame =
        badge === "speaking"
          ? Math.floor(clock.elapsedTime / 0.28) % SPEAKING_FRAMES
          : 0
      const tex = nameTexture(placement.player.name, eliminated, badge, frame)
      if (mat.map !== tex) {
        mat.map = tex
        mat.emissiveMap = tex
      }
    }
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

      {/* 桌面名签：立在他面前身份牌外侧的桌沿（局部 +z 朝桌心）。
          depthTest 关闭 + renderOrder 靠后：名签作为独立一层叠在场景之上，
          不与桌面的牌做深度相交（billboard 俯视时的后仰会切进翻开的牌）；
          举牌到眼前的窗口由 hideTableTag 隐藏让位 */}
      {!hideTableTag && (
        <Billboard position={[0, TABLE_TOP_Y + 0.08, SEAT_RADIUS - 1.31]}>
          <mesh renderOrder={10}>
            <planeGeometry args={[0.8, 0.2]} />
            <meshStandardMaterial
              ref={tagMat}
              map={nameTexture(placement.player.name, eliminated, "muted")}
              emissive="#ffffff"
              emissiveMap={nameTexture(placement.player.name, eliminated, "muted")}
              emissiveIntensity={0.75}
              transparent
              depthTest={false}
              roughness={1}
            />
          </mesh>
        </Billboard>
      )}

      {/* 名牌（固定屏幕尺寸；zIndexRange 压到眼睑幕 z-40 之下，闭眼时不穿帮；
          DOM 永远盖在 canvas 上，看牌时靠淡出让位给牌） */}
      <Html
        position={[0, 1.62, 0]}
        center
        zIndexRange={[20, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div
          className={cn(
            "flex items-center gap-1 rounded-full border border-moon-100/10 bg-night-900/70 px-2 py-0.5 whitespace-nowrap backdrop-blur-sm transition-opacity duration-300",
            hideTag ? "opacity-0" : dimmed ? "opacity-50" : "",
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
