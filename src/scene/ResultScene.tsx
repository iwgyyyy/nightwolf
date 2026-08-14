import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Billboard } from "@react-three/drei"
import { Euler, Quaternion, Vector3 } from "three"
import { useGameStore } from "@/stores/gameStore"
import { useLocalPlayerStore } from "@/hooks/use-local-player"
import {
  computeSeatPlacements,
  centerCardPositions,
  TABLE_TOP_Y,
} from "./seat-layout"
import { Card3D, type CardPoseTarget } from "./Card3D"
import { selfEliminatedTexture } from "./cardTextures"

/** 翻开后正面朝上；所有牌统一文字朝向本地玩家，可读性优先于物理拟真 */
const FLIP_Q = new Quaternion().setFromEuler(new Euler(Math.PI, 0, 0))

// 每张牌的实时姿态容器。模块级以绕开 React Compiler 对 render 期 ref 访问的限制
const poses = new Map<string, { current: CardPoseTarget | null }>()
function getPose(id: string) {
  let entry = poses.get(id)
  if (!entry) {
    entry = { current: null }
    poses.set(id, entry)
  }
  return entry
}

interface RevealCard {
  id: string
  position: [number, number, number]
  rotationY: number
  role: import("@/types").Role | null
  baseQuat: Quaternion
}

/**
 * 结算场景：全桌身份牌逐张翻开（抬起 → 翻面 → 落回），
 * 出局玩家的牌位上方挂红色标记。数据全部来自公开的 resultData。
 */
export function ResultScene() {
  const publicState = useGameStore((s) => s.publicState)
  const playerId = useLocalPlayerStore((s) => s.playerId)
  const startRef = useRef<number | null>(null)

  const placements = useMemo(
    () => computeSeatPlacements(publicState?.players ?? [], playerId),
    [publicState?.players, playerId],
  )

  const result = publicState?.resultData

  const cards = useMemo<RevealCard[]>(() => {
    if (!result) return []
    const list: RevealCard[] = placements.map((p) => ({
      id: p.player.playerId,
      position: p.cardPosition,
      rotationY: p.rotationY,
      role: result.finalRoles[p.player.playerId] ?? null,
      baseQuat: new Quaternion().setFromEuler(new Euler(0, p.rotationY, 0)),
    }))
    centerCardPositions().forEach((pos, i) => {
      list.push({
        id: `center_${i}`,
        position: pos,
        rotationY: 0,
        role: result.centerCards[i] ?? null,
        baseQuat: new Quaternion(),
      })
    })
    return list
  }, [placements, result])

  useFrame(({ clock }) => {
    // 挂载后 0.6s 开始，逐张间隔 0.18s
    if (startRef.current === null) startRef.current = clock.elapsedTime + 0.6
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i]
      const t = clock.elapsedTime - (startRef.current + i * 0.18)
      const entry = getPose(c.id)
      if (t < 0) {
        entry.current = null
        continue
      }
      if (!entry.current) {
        entry.current = { position: new Vector3(), quaternion: new Quaternion() }
      }
      // 三拍：抬起（原朝向）→ 空中翻面 → 落回桌面
      entry.current.position.set(
        c.position[0],
        t < 0.8 ? c.position[1] + 0.3 : c.position[1],
        c.position[2],
      )
      entry.current.quaternion.copy(t < 0.35 ? c.baseQuat : FLIP_Q)
    }
  })

  if (!publicState || !result) return null

  return (
    <>
      {cards.map((c) => (
        <Card3D
          key={c.id}
          position={c.position}
          rotationY={c.rotationY}
          role={c.role}
          poseRef={getPose(c.id)}
        />
      ))}

      {/* 其他人的出局标记走 SeatFigure 桌面名签；自己出局时
          在自己牌下方的桌沿（与其他名签同半径）显示"你出局了" */}
      {playerId && result.eliminatedPlayerIds.includes(playerId) && (
        <Billboard position={[0, TABLE_TOP_Y + 0.08, 1.31]}>
          <mesh renderOrder={10}>
            <planeGeometry args={[0.8, 0.2]} />
            <meshStandardMaterial
              map={selfEliminatedTexture()}
              depthTest={false}
              emissive="#ffffff"
              emissiveMap={selfEliminatedTexture()}
              emissiveIntensity={0.75}
              transparent
              roughness={1}
            />
          </mesh>
        </Billboard>
      )}
    </>
  )
}
