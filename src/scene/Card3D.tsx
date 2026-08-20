import { useMemo, useRef } from "react"
import { useFrame, type ThreeEvent } from "@react-three/fiber"
import {
  Euler,
  Quaternion,
  Vector3,
  type Group,
  type MeshStandardMaterial,
} from "three"
import type { Role } from "@/types"
import {
  cardBackTexture,
  cardFrontTexture,
  type CardVerdict,
} from "./cardTextures"
import { bezier2, clamp01, easeOutCubic } from "./animation"
import { PALETTE } from "./palette"

export const CARD_W = 0.36
export const CARD_H = 0.5
const DEAL_DURATION = 0.5

/** 父级可实时改写的目标姿态；null 表示回到 resting */
export interface CardPoseTarget {
  position: Vector3
  quaternion: Quaternion
}

interface Card3DProps {
  /** 桌面落位（牌中心） */
  position: [number, number, number]
  /** 绕 Y 朝向（用座位的 rotationY，让牌的下边缘朝向持牌人） */
  rotationY?: number
  /** 有 role 才有正面；null/undefined 时正面也是牌背 */
  role?: Role | null
  /** 发牌动画起点（不传则直接出现在落位） */
  dealFrom?: [number, number, number]
  dealDelay?: number
  /** 实时姿态目标（own card 翻看等），由父级 useFrame 改写 */
  poseRef?: React.RefObject<CardPoseTarget | null>
  onClick?: (e: ThreeEvent<MouseEvent>) => void
  /** 可选中提示（淡光圈） */
  highlighted?: boolean
  /** 已选中：牌本体抬起、微放大、牌背亮起呼吸暖光（盖过 highlighted） */
  selected?: boolean
  /** 结算牌面的个人结果角标（胜负 + 出局） */
  verdict?: CardVerdict
}

/**
 * 桌面卡牌：两张背对的圆角贴图平面。
 * 扣放时朝上一面是牌背；翻转（绕局部 X 转 π）后正面朝上。
 */
export function Card3D({
  position,
  rotationY = 0,
  role,
  dealFrom,
  dealDelay = 0,
  poseRef,
  onClick,
  highlighted,
  selected,
  verdict,
}: Card3DProps) {
  const group = useRef<Group>(null)
  const anim = useRef({ dealStart: null as number | null, dealt: !dealFrom })
  const backMat = useRef<MeshStandardMaterial>(null)
  const liftTarget = useRef(new Vector3())

  const backTex = cardBackTexture()
  const frontTex = role ? cardFrontTexture(role, verdict) : cardBackTexture()

  const resting = useMemo(
    () => ({
      position: new Vector3(...position),
      quaternion: new Quaternion().setFromEuler(new Euler(0, rotationY, 0)),
    }),
    [position, rotationY],
  )

  useFrame(({ clock }, dt) => {
    const g = group.current
    if (!g) return

    // 发牌飞行
    if (!anim.current.dealt && dealFrom) {
      if (anim.current.dealStart === null) {
        anim.current.dealStart = clock.elapsedTime + dealDelay
      }
      const t = (clock.elapsedTime - anim.current.dealStart) / DEAL_DURATION
      if (t < 0) {
        g.visible = false
        return
      }
      g.visible = true
      const k = easeOutCubic(clamp01(t))
      const mid: [number, number, number] = [
        (dealFrom[0] + position[0]) / 2,
        Math.max(dealFrom[1], position[1]) + 0.25,
        (dealFrom[2] + position[2]) / 2,
      ]
      const [x, y, z] = bezier2(dealFrom, mid, position, k)
      g.position.set(x, y, z)
      g.rotation.set(0, rotationY + (1 - k) * 0.9, 0)
      if (t >= 1) anim.current.dealt = true
      return
    }

    // 姿态跟随（翻看/放回等由父级改写 poseRef）
    const target = poseRef?.current ?? resting
    const k = 1 - Math.exp(-dt * 9)
    // 选中态：牌本体从桌面抬起一点（仅 resting 时，举牌/交换动画不叠加）
    const lift = selected && !poseRef?.current ? 0.07 : 0
    liftTarget.current.copy(target.position)
    liftTarget.current.y += lift
    g.position.lerp(liftTarget.current, k)
    g.quaternion.slerp(target.quaternion, k)
    // 选中态：微放大 + 牌背暖光呼吸
    const s = selected ? 1.06 : 1
    g.scale.setScalar(g.scale.x + (s - g.scale.x) * k)
    if (backMat.current) {
      const glow = selected
        ? 0.85 + 0.18 * Math.sin(clock.elapsedTime * 4)
        : 0.38
      backMat.current.emissiveIntensity +=
        (glow - backMat.current.emissiveIntensity) * k
    }
  })

  return (
    <group
      ref={group}
      position={dealFrom ?? position}
      rotation={[0, rotationY, 0]}
      visible={!dealFrom}
      onClick={onClick}
    >
      {/* 可选提示：淡光圈 */}
      {highlighted && !selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]}>
          <planeGeometry args={[CARD_W + 0.08, CARD_H + 0.08]} />
          <meshBasicMaterial
            color={PALETTE.candle500}
            transparent
            opacity={0.22}
          />
        </mesh>
      )}
      {/* 牌背（扣放时朝上）。emissive 让牌在夜色里保持可读；选中时亮起 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshStandardMaterial
          ref={backMat}
          map={backTex}
          emissive="#ffffff"
          emissiveMap={backTex}
          emissiveIntensity={0.38}
          transparent
          roughness={0.85}
        />
      </mesh>
      {/* 牌面（扣放时朝下贴桌） */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshStandardMaterial
          map={frontTex}
          emissive="#ffffff"
          emissiveMap={frontTex}
          emissiveIntensity={0.5}
          transparent
          roughness={0.85}
        />
      </mesh>
    </group>
  )
}
