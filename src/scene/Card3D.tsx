import { useMemo, useRef } from "react"
import { useFrame, type ThreeEvent } from "@react-three/fiber"
import { Euler, Quaternion, Vector3, type Group } from "three"
import type { Role } from "@/types"
import { cardBackTexture, cardFrontTexture } from "./cardTextures"
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
  highlighted?: boolean
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
}: Card3DProps) {
  const group = useRef<Group>(null)
  const anim = useRef({ dealStart: null as number | null, dealt: !dealFrom })

  const backTex = cardBackTexture()
  const frontTex = role ? cardFrontTexture(role) : cardBackTexture()

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
    g.position.lerp(target.position, k)
    g.quaternion.slerp(target.quaternion, k)
  })

  return (
    <group
      ref={group}
      position={dealFrom ?? position}
      rotation={[0, rotationY, 0]}
      visible={!dealFrom}
      onClick={onClick}
    >
      {/* 选中光圈 */}
      {highlighted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]}>
          <planeGeometry args={[CARD_W + 0.08, CARD_H + 0.08]} />
          <meshBasicMaterial
            color={PALETTE.candle500}
            transparent
            opacity={0.22}
          />
        </mesh>
      )}
      {/* 牌背（扣放时朝上）。emissive 让牌在夜色里保持可读 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshStandardMaterial
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
