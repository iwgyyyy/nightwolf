import { useEffect, useState } from "react"

/**
 * 监听窗口尺寸，用于响应式布局（如圆桌直径）。
 * SSR 安全：初始值为 0/0，mount 后立即读一次真实值。
 */
export function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState(() =>
    typeof window === "undefined"
      ? { width: 0, height: 0 }
      : { width: window.innerWidth, height: window.innerHeight },
  )

  useEffect(() => {
    const handler = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight })
    handler()
    window.addEventListener("resize", handler)
    return () => window.removeEventListener("resize", handler)
  }, [])

  return size
}
