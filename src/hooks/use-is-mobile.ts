import { useEffect, useState } from "react"

const MOBILE_BREAKPOINT = 640 // Tailwind sm

/**
 * 简易移动端检测：基于 `matchMedia(max-width: 640px)`。
 * 用于某些"只在移动端关掉"的行为，如 Dialog 打开时的自动聚焦
 * （移动端自动聚焦会立刻弹起软键盘，遮挡弹窗内容）。
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

  return isMobile
}
