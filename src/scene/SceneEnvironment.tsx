import { Stars } from "@react-three/drei"
import { PALETTE } from "./palette"

/**
 * 场景环境：天空背景、雾、天体、环境光与地面。
 * 夜晚（默认）：夜空、星星、月亮与冷色月光，唯一的暖光源（烛光）在 Candle 组件里。
 * daylight：白天/投票/结算的破晓模式——亮天空、晨雾、太阳与暖色晨光。
 */
export function SceneEnvironment({ daylight = false }: { daylight?: boolean }) {
  const sky = daylight ? PALETTE.dawnSky : PALETTE.night900

  return (
    <>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={daylight ? [sky, 9, 22] : [sky, 7, 17]} />

      {!daylight && (
        <Stars
          radius={40}
          depth={20}
          count={2000}
          factor={5}
          saturation={0}
          fade
          speed={0.4}
        />
      )}

      {daylight ? (
        <>
          {/* 晨光：亮天空环境光 + 低角度暖阳 */}
          <hemisphereLight args={["#e8edf8", "#6f6a5c", 1.3]} />
          <directionalLight
            position={[3, 6, 2]}
            intensity={1.7}
            color="#f7e8c6"
          />
          {/* 太阳本体（不受雾影响） */}
          <mesh position={[9, 7.5, -14]}>
            <sphereGeometry args={[1.0, 24, 24]} />
            <meshBasicMaterial color="#fff4d6" fog={false} />
          </mesh>
        </>
      ) : (
        <>
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
        </>
      )}

      {/* 地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[24, 48]} />
        <meshStandardMaterial
          color={daylight ? PALETTE.dawnGround : PALETTE.ground}
          roughness={1}
        />
      </mesh>
    </>
  )
}
