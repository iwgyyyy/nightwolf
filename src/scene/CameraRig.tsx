import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { PerspectiveCamera, Vector3 } from "three"

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * 本地玩家座位视角的自适应相机。
 *
 * 双向自适应策略：不做两套场景，只按视口宽高比在两组参数间插值 ——
 * 竖屏（窄）相机更高、俯角更陡、FOV 更大，让整张桌子塞进窄画幅；
 * 横屏（宽）相机放低拉平，更接近真实入座视线。
 * 另叠加指针/触摸的小幅环视偏移。
 */
export function CameraRig() {
  // 复用向量，避免每帧分配
  const tmpRef = useRef({
    desired: new Vector3(),
    look: new Vector3(0, 0.6, 0),
  })

  useFrame(({ camera, size, pointer }, rawDt) => {
    const tmp = tmpRef.current
    const dt = Math.min(rawDt, 0.1)
    const aspect = size.width / size.height
    // 0 = 极竖屏，1 = 极横屏
    const t = clamp01((aspect - 0.5) / (1.7 - 0.5))

    tmp.desired.set(
      pointer.x * 0.1,
      lerp(3.4, 1.55, t),
      lerp(4.0, 2.8, t),
    )
    const k = 1 - Math.exp(-dt * 5)
    camera.position.lerp(tmp.desired, k)

    tmp.look.x += (pointer.x * 0.3 - tmp.look.x) * k
    tmp.look.y += (lerp(0.62, 0.68, t) + pointer.y * 0.12 - tmp.look.y) * k
    camera.lookAt(tmp.look)

    if (camera instanceof PerspectiveCamera) {
      const fov = lerp(72, 46, t)
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov += (fov - camera.fov) * k
        camera.updateProjectionMatrix()
      }
    }
  })

  return null
}
