import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { Mesh, PointLight } from "three"
import { TABLE_RADIUS, TABLE_TOP_Y } from "./seat-layout"
import { PALETTE } from "./palette"

/** 圆木桌：桌面 + 深色毡面 + 中柱底座 */
export function Table() {
  return (
    <group>
      {/* 桌面板 */}
      <mesh position={[0, TABLE_TOP_Y - 0.035, 0]}>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS * 0.96, 0.07, 48]} />
        <meshStandardMaterial color={PALETTE.tableWood} roughness={0.75} />
      </mesh>
      {/* 毡面（放牌区域） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TABLE_TOP_Y + 0.001, 0]}>
        <circleGeometry args={[TABLE_RADIUS * 0.87, 48]} />
        <meshStandardMaterial color={PALETTE.tableFelt} roughness={1} />
      </mesh>
      {/* 中柱 */}
      <mesh position={[0, TABLE_TOP_Y / 2, 0]}>
        <cylinderGeometry args={[0.11, 0.16, TABLE_TOP_Y - 0.07, 20]} />
        <meshStandardMaterial color={PALETTE.tableWoodDark} roughness={0.9} />
      </mesh>
      {/* 底座 */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.5, 0.58, 0.06, 32]} />
        <meshStandardMaterial color={PALETTE.tableWoodDark} roughness={0.9} />
      </mesh>
    </group>
  )
}

const CANDLE_INTENSITY = 9

/**
 * 桌心烛台：全场唯一的暖光源，强度带轻微摇曳。
 * 左右居中、略靠后 —— 正中要留给 3 张底牌。
 * lit=false 时熄灭（白天用，避免烛光叠在翻开的牌上过曝），平滑过渡。
 */
export function Candle({
  position = [0, TABLE_TOP_Y, -0.52] as [number, number, number],
  lit = true,
}: {
  position?: [number, number, number]
  lit?: boolean
}) {
  const light = useRef<PointLight>(null)
  const flame = useRef<Mesh>(null)
  // 点亮包络：熄灭/点燃时平滑渐变
  const env = useRef(lit ? 1 : 0)

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    env.current += ((lit ? 1 : 0) - env.current) * (1 - Math.exp(-dt * 2.5))
    // 多个不可通约频率叠加，模拟不规则烛光摇曳
    const flicker =
      0.85 + 0.1 * Math.sin(t * 11.3) * Math.sin(t * 5.7) + 0.05 * Math.sin(t * 27.1)
    if (light.current) {
      light.current.intensity = env.current * CANDLE_INTENSITY * flicker
    }
    if (flame.current) {
      flame.current.scale.setScalar(
        Math.max(0.001, env.current * (0.9 + 0.15 * flicker)),
      )
    }
  })

  return (
    <group position={position}>
      {/* 蜡烛体 */}
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.035, 0.04, 0.12, 12]} />
        <meshStandardMaterial color={PALETTE.parchment} roughness={0.6} />
      </mesh>
      {/* 火苗 */}
      <mesh ref={flame} position={[0, 0.15, 0]}>
        <sphereGeometry args={[0.022, 8, 8]} />
        <meshBasicMaterial color={PALETTE.candle400} />
      </mesh>
      {/* 烛光 */}
      <pointLight
        ref={light}
        position={[0, 0.22, 0]}
        color={PALETTE.candle500}
        intensity={CANDLE_INTENSITY}
        distance={9}
        decay={1.8}
      />
    </group>
  )
}
