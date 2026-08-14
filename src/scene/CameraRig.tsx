import { useEffect, useRef } from "react"
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
 *
 * 环视：按住（鼠标左键 / 手指）拖动才转，偏移量取拖动增量、方向"内容跟手"，
 * 松开后平滑回中。单纯移动鼠标或点击选牌不会动视角。
 */
export function CameraRig() {
  // 拖动状态由 window 事件维护，useFrame 每帧读取
  const drag = useRef({ active: false, startX: 0, startY: 0, dx: 0, dy: 0 })
  // 复用向量，避免每帧分配
  const tmpRef = useRef({
    desired: new Vector3(),
    look: new Vector3(0, 0.6, 0),
  })

  useEffect(() => {
    const d = drag.current
    const norm = (e: PointerEvent) => ({
      x: (e.clientX / window.innerWidth) * 2 - 1,
      y: -(e.clientY / window.innerHeight) * 2 + 1,
    })
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      // 只有从 canvas 上按下才算环视拖动，HUD 按钮/面板上的拖动不转视角
      if (!(e.target instanceof HTMLCanvasElement)) return
      const p = norm(e)
      d.active = true
      d.startX = p.x
      d.startY = p.y
      d.dx = 0
      d.dy = 0
    }
    const move = (e: PointerEvent) => {
      if (!d.active) return
      const p = norm(e)
      d.dx = p.x - d.startX
      d.dy = p.y - d.startY
    }
    const up = () => {
      d.active = false
      d.dx = 0
      d.dy = 0
    }
    // 移动端浏览器会把触摸拖动判定为滚动/下拉刷新并发 pointercancel 打断，
    // 环视拖动进行中阻止默认行为兜底（需 non-passive）
    const preventScroll = (e: TouchEvent) => {
      if (d.active) e.preventDefault()
    }
    window.addEventListener("pointerdown", down)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    window.addEventListener("blur", up)
    window.addEventListener("touchmove", preventScroll, { passive: false })
    return () => {
      window.removeEventListener("pointerdown", down)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      window.removeEventListener("blur", up)
      window.removeEventListener("touchmove", preventScroll)
    }
  }, [])

  useFrame(({ camera, size }, rawDt) => {
    const tmp = tmpRef.current
    const dt = Math.min(rawDt, 0.1)
    const aspect = size.width / size.height
    // 0 = 极竖屏，1 = 极横屏
    const t = clamp01((aspect - 0.5) / (1.7 - 0.5))

    // 内容跟手：向右拖，桌子跟着向右（相机向左），取负号
    const dx = -drag.current.dx
    const dy = -drag.current.dy
    tmp.desired.set(
      dx * 0.25,
      lerp(3.6, 1.55, t),
      lerp(4.0, 2.8, t),
    )
    // 拖动中快速跟手；松开后缓慢回中
    const k = 1 - Math.exp(-dt * (drag.current.active ? 7 : 2))
    camera.position.lerp(tmp.desired, k)

    tmp.look.x += (dx * 0.7 - tmp.look.x) * k
    tmp.look.y += (lerp(0.62, 0.68, t) + dy * 0.3 - tmp.look.y) * k
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
