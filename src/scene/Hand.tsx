import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Quaternion, Vector3, type Group } from "three"
import { PALETTE } from "./palette"

/** 父级每帧改写的手部目标姿态 */
export interface HandPoseTarget {
  position: Vector3
  quaternion: Quaternion
  visible: boolean
}

const SKIN = "#c9a07a"

/**
 * 低多边形第一人称手：斗篷袖 + 手掌 + 四指 + 拇指，掌心朝下。
 * 局部坐标：指尖朝 -Z（伸向桌心），掌背朝 +Y。
 * 姿态完全由 poseRef 驱动（damped 跟随），不可见时移出画面。
 */
export function Hand({ poseRef }: { poseRef: React.RefObject<HandPoseTarget> }) {
  const group = useRef<Group>(null)

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const target = poseRef.current
    const k = 1 - Math.exp(-dt * 7)
    g.position.lerp(target.position, k)
    g.quaternion.slerp(target.quaternion, k)
    // 淡出：不可见时继续向目标滑但整体缩小
    const s = target.visible ? 0.85 : 0.001
    g.scale.x += (s - g.scale.x) * k
    g.scale.y += (s - g.scale.y) * k
    g.scale.z += (s - g.scale.z) * k
  })

  return (
    <group ref={group} position={[0.4, 0.4, 3.2]} scale={0.001}>
      {/* 袖口（朝 +Z 后方展开） */}
      <mesh position={[0, 0.03, 0.24]} rotation={[Math.PI / 2 - 0.15, 0, 0]}>
        <coneGeometry args={[0.11, 0.3, 12, 1, true]} />
        <meshStandardMaterial color={PALETTE.cloak} roughness={1} />
      </mesh>
      {/* 手掌 */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.15, 0.035, 0.15]} />
        <meshStandardMaterial color={SKIN} roughness={0.9} />
      </mesh>
      {/* 四指 */}
      {[-0.052, -0.017, 0.017, 0.052].map((x, i) => (
        <mesh
          key={i}
          position={[x, -0.004, -0.115]}
          rotation={[-0.25, 0, 0]}
        >
          <boxGeometry args={[0.028, 0.026, 0.1]} />
          <meshStandardMaterial color={SKIN} roughness={0.9} />
        </mesh>
      ))}
      {/* 拇指 */}
      <mesh position={[0.085, -0.006, -0.03]} rotation={[0, -0.7, 0]}>
        <boxGeometry args={[0.026, 0.024, 0.085]} />
        <meshStandardMaterial color={SKIN} roughness={0.9} />
      </mesh>
    </group>
  )
}
