import { Stars } from "@react-three/drei"
import { PALETTE } from "./palette"

/**
 * 夜晚环境：夜空背景、雾、星星、月亮、月光与地面。
 * 唯一的暖光源（烛光）在 Candle 组件里。
 */
export function NightEnvironment() {
  return (
    <>
      <color attach="background" args={[PALETTE.night900]} />
      <fog attach="fog" args={[PALETTE.night900, 7, 17]} />

      <Stars
        radius={40}
        depth={20}
        count={2000}
        factor={5}
        saturation={0}
        fade
        speed={0.4}
      />

      {/* 冷色环境光：夜空微光 + 地面反照 */}
      <hemisphereLight args={["#46587f", "#0b0d16", 0.9]} />
      {/* 月光：低强度冷色平行光 */}
      <directionalLight
        position={[-4, 7, -4]}
        intensity={1.0}
        color={PALETTE.moonlight}
      />

      {/* 月亮本体（不受雾影响） */}
      <mesh position={[-9, 8.5, -14]}>
        <sphereGeometry args={[1.1, 24, 24]} />
        <meshBasicMaterial color={PALETTE.moonGlow} fog={false} />
      </mesh>

      {/* 地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[24, 48]} />
        <meshStandardMaterial color={PALETTE.ground} roughness={1} />
      </mesh>
    </>
  )
}
